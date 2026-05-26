// server/billing-engine-backend.js
// karyaOS Billing Engine — SaaS subscription + MRR/ARR
//
// Schema:
//   billing_plans      — Starter / Growth / Cinema / Enterprise (plan catalog)
//   tenant_billing     — companies.id → plan_code, billing_cycle, amount, next_due_at, payment_method
//   billing_invoices   — generated per cycle, status open/paid/overdue/void
//   billing_payments   — record pembayaran (manual transfer/Midtrans/Xendit)
//
// Endpoints (all under /api/billing):
//   GET    /plans                        — list plans (catalog publik)
//   GET    /tenant                       — current tenant subscription (company-scoped)
//   POST   /tenant                       — assign/change plan (super-admin only)
//   GET    /invoices                     — list invoices (scoped)
//   POST   /invoices/:id/mark-paid       — manual mark paid (super-admin)
//   POST   /invoices/:id/void            — cancel invoice
//   GET    /mrr                          — super-admin: MRR/ARR/churn/breakdown
//   POST   /generate-monthly             — cron-triggered: generate invoices for due tenants

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS billing_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  vertical TEXT NOT NULL,                    -- fnb / cinema / hybrid / addon
  tier TEXT NOT NULL,                        -- starter / growth / enterprise
  monthly_price_idr INTEGER NOT NULL DEFAULT 0,
  annual_price_idr  INTEGER NOT NULL DEFAULT 0,  -- ~10x monthly (2 bulan diskon)
  max_outlets INTEGER DEFAULT NULL,          -- NULL = unlimited
  max_users INTEGER DEFAULT NULL,
  features_json TEXT,                        -- ["multi-tenant","loyalty","subscription pass","..."]
  active INTEGER DEFAULT 1,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS tenant_billing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER UNIQUE NOT NULL,
  plan_code TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',  -- monthly / annual
  amount_idr INTEGER NOT NULL,
  next_due_at INTEGER,                       -- timestamp invoice berikutnya
  trial_until INTEGER,                       -- jika trial, expire date
  payment_method TEXT DEFAULT 'transfer',    -- transfer / midtrans / xendit
  status TEXT DEFAULT 'active',              -- active / paused / cancelled
  started_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  cancelled_at INTEGER,
  notes TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_status ON tenant_billing(status, next_due_at);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE NOT NULL,
  company_id INTEGER NOT NULL,
  plan_code TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end   INTEGER NOT NULL,
  amount_idr INTEGER NOT NULL,
  ppn_idr    INTEGER NOT NULL DEFAULT 0,     -- 11% PPN
  total_idr  INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',       -- open / paid / overdue / void
  due_at INTEGER NOT NULL,
  paid_at INTEGER,
  payment_ref TEXT,                          -- nomor transfer/midtrans order_id
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON billing_invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON billing_invoices(status, due_at);

CREATE TABLE IF NOT EXISTS billing_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  amount_idr INTEGER NOT NULL,
  paid_at INTEGER NOT NULL,
  method TEXT,
  reference TEXT,
  recorded_by TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

// ─── FEATURE CODES (granular entitlements) ─────────────────────────────
// Module ID → required feature code di-map di adminModules.js
const FEATURE_BASE        = ['pos', 'kiosk', 'qr_order', 'dashboard', 'menu', 'settings', 'departments'];
const FEATURE_LOYALTY     = ['loyalty', 'promo', 'reward', 'membership', 'customer_intel'];
const FEATURE_INVENTORY   = ['inventory', 'item_master', 'stock_opname', 'goods_received', 'goods_delivery', 'supplier', 'procurement', 'auto_reorder', 'batch_tracking', 'production'];
const FEATURE_FINANCE     = ['finance', 'finance_center', 'ar', 'ap', 'budget', 'journal', 'gl', 'coa', 'reconciliation', 'tax', 'food_cost', 'cash_flow', 'fin_statements', 'period_closing', 'payroll_finance'];
const FEATURE_HR          = ['hr', 'hris', 'payroll', 'shift_roster', 'attendance', 'talenta', 'leave', 'motivation', 'reward_staff'];
const FEATURE_MARKETING   = ['marketing', 'campaign', 'crm', 'broadcast', 'geo_engagement', 'clv_churn', 'feedback_segment'];
const FEATURE_MULTI_OUTLET= ['multi_outlet', 'remote_ops', 'launch', 'service_visit', 'outlet_audit', 'incidents', 'escalation'];
const FEATURE_CINEMA      = ['cinema_all'];
const FEATURE_ENTERPRISE  = ['quality', 'internal_audit', 'document_hub', 'helpdesk', 'risk', 'contract', 'rfq', 'signage', 'compliance', 'self_audit', 'anti_fraud', 'consolidation', 'core_tax', 'platform'];

// Bundle: plan code → list of feature codes
const PLAN_FEATURES = {
  TRIAL: ['*'], // wildcard = semua fitur unlocked selama trial
  STARTER:    [...FEATURE_BASE],
  GROWTH:     [...FEATURE_BASE, ...FEATURE_LOYALTY, ...FEATURE_INVENTORY],
  PRO:        [...FEATURE_BASE, ...FEATURE_LOYALTY, ...FEATURE_INVENTORY, ...FEATURE_FINANCE, ...FEATURE_HR, ...FEATURE_MARKETING],
  ENTERPRISE: ['*'], // semua termasuk cinema + multi-outlet + enterprise
};

// Default plans seed — restructured per user's pricing direction
const DEFAULT_PLANS = [
  {
    code: 'TRIAL', name: '🎁 Free Trial 14 Hari', vertical: 'fnb', tier: 'starter',
    monthly_price_idr: 0, annual_price_idr: 0, max_outlets: 1, max_users: 5,
    features_json: JSON.stringify(PLAN_FEATURES.TRIAL),
    description: 'Full akses selama 14 hari, no credit card. Auto-downgrade ke Starter setelah expire.',
    display_order: 0,
  },
  {
    code: 'STARTER', name: '🌱 Starter', vertical: 'fnb', tier: 'starter',
    monthly_price_idr: 299_000, annual_price_idr: 2_990_000, max_outlets: 1, max_users: 5,
    features_json: JSON.stringify(PLAN_FEATURES.STARTER),
    description: 'Untuk kafe/warung kecil — POS Kasir + Self-Order Kiosk + QR Order + Dashboard basic. 1 outlet, 5 user.',
    display_order: 1,
  },
  {
    code: 'GROWTH', name: '📈 Growth', vertical: 'fnb', tier: 'growth',
    monthly_price_idr: 799_000, annual_price_idr: 7_990_000, max_outlets: 3, max_users: 15,
    features_json: JSON.stringify(PLAN_FEATURES.GROWTH),
    description: 'Starter + Loyalty + Inventory lengkap. Cocok F&B 2–3 outlet yang udah grow.',
    display_order: 2,
  },
  {
    code: 'PRO', name: '💼 Pro', vertical: 'fnb', tier: 'enterprise',
    monthly_price_idr: 1_499_000, annual_price_idr: 14_990_000, max_outlets: 10, max_users: 50,
    features_json: JSON.stringify(PLAN_FEATURES.PRO),
    description: 'Growth + Finance/Accounting + HR/Payroll + Marketing. Sampai 10 outlet, 50 user.',
    display_order: 3,
  },
  {
    code: 'ENTERPRISE', name: '🏛️ Enterprise', vertical: 'hybrid', tier: 'enterprise',
    monthly_price_idr: 3_500_000, annual_price_idr: 35_000_000, max_outlets: null, max_users: null,
    features_json: JSON.stringify(PLAN_FEATURES.ENTERPRISE),
    description: 'Semua fitur termasuk Cinema, Multi-outlet unlimited, Quality, Audit, Compliance, Doc Hub, dedicated support.',
    display_order: 4,
  },
];

// Helper: check apakah company punya entitlement untuk feature tertentu
function _checkFeature(db, companyId, featureCode) {
  if (!companyId) return true; // super-admin / karys
  const tb = db.prepare(`SELECT plan_code FROM tenant_billing WHERE company_id=? AND status='active'`).get(companyId);
  if (!tb) return false;
  const features = PLAN_FEATURES[tb.plan_code] || [];
  return features.includes('*') || features.includes(featureCode);
}

function genInvoiceNo(db) {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  const count = db.prepare(`SELECT COUNT(*) c FROM billing_invoices WHERE invoice_no LIKE ?`).get(`INV-${y}${m}-%`).c;
  return `INV-${y}${m}-${String(count + 1).padStart(4, '0')}`;
}

// Generate invoice for one tenant for one period
function generateInvoice(db, tenant, periodStart, periodEnd) {
  const amount = tenant.amount_idr;
  const ppn = Math.round(amount * 0.11);
  const total = amount + ppn;
  const invoiceNo = genInvoiceNo(db);
  const dueAt = periodEnd; // due at end of period
  db.prepare(`INSERT INTO billing_invoices (invoice_no, company_id, plan_code, billing_cycle, period_start, period_end, amount_idr, ppn_idr, total_idr, status, due_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    invoiceNo, tenant.company_id, tenant.plan_code, tenant.billing_cycle,
    periodStart, periodEnd, amount, ppn, total, 'open', dueAt
  );
  // Advance next_due_at
  const cycleSec = tenant.billing_cycle === 'annual' ? YEAR : MONTH;
  db.prepare(`UPDATE tenant_billing SET next_due_at=?, updated_at=? WHERE id=?`)
    .run(periodEnd + cycleSec, nowSec(), tenant.id);
  return invoiceNo;
}

function setupBillingEngine(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Upsert plans — refresh kalau struktur berubah (idempotent)
  const upsert = db.prepare(`INSERT INTO billing_plans (code, name, vertical, tier, monthly_price_idr, annual_price_idr, max_outlets, max_users, features_json, description, display_order, active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
    ON CONFLICT(code) DO UPDATE SET
      name=excluded.name, vertical=excluded.vertical, tier=excluded.tier,
      monthly_price_idr=excluded.monthly_price_idr, annual_price_idr=excluded.annual_price_idr,
      max_outlets=excluded.max_outlets, max_users=excluded.max_users,
      features_json=excluded.features_json, description=excluded.description,
      display_order=excluded.display_order`);
  DEFAULT_PLANS.forEach(p => upsert.run(p.code, p.name, p.vertical, p.tier, p.monthly_price_idr, p.annual_price_idr, p.max_outlets, p.max_users, p.features_json, p.description, p.display_order));
  console.log(`[billing] upserted ${DEFAULT_PLANS.length} plans`);

  // Auto-assign Trial untuk company yang belum punya tenant_billing record
  const orphans = db.prepare(`
    SELECT c.id FROM companies c
    LEFT JOIN tenant_billing tb ON tb.company_id = c.id
    WHERE tb.id IS NULL
  `).all();
  if (orphans.length > 0) {
    const trial = db.prepare(`SELECT * FROM billing_plans WHERE code='TRIAL'`).get();
    const ins = db.prepare(`INSERT INTO tenant_billing (company_id, plan_code, billing_cycle, amount_idr, next_due_at, trial_until, status) VALUES (?,?,?,?,?,?,?)`);
    const trialEnd = nowSec() + 14 * DAY;
    orphans.forEach(o => ins.run(o.id, 'TRIAL', 'monthly', 0, trialEnd, trialEnd, 'active'));
    console.log(`[billing] auto-assigned TRIAL to ${orphans.length} orphan companies`);
  }

  const router = express.Router();
  router.use(express.json());

  // ─── PLANS ───
  router.get('/plans', (req, res) => {
    const vertical = req.query.vertical;
    const where = vertical ? `WHERE active=1 AND (vertical=? OR vertical='hybrid')` : `WHERE active=1`;
    const rows = vertical ? db.prepare(`SELECT * FROM billing_plans ${where} ORDER BY display_order, monthly_price_idr`).all(vertical)
      : db.prepare(`SELECT * FROM billing_plans ${where} ORDER BY display_order, monthly_price_idr`).all();
    res.json({
      data: rows.map(r => ({ ...r, features: (() => { try { return JSON.parse(r.features_json) || []; } catch { return []; } })() }))
    });
  });

  // ─── TENANT BILLING ───
  router.get('/tenant', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = req.query.company_id ? parseInt(req.query.company_id, 10) : (scope.is_super_admin ? null : scope.company_id);
    if (!companyId && !scope.is_super_admin) return res.status(400).json({ error: 'company_id required' });
    if (!companyId) {
      // Super-admin tanpa filter: return all
      const rows = db.prepare(`
        SELECT tb.*, c.name as company_name, c.code as company_code, c.primary_vertical,
               p.name as plan_name, p.features_json
        FROM tenant_billing tb
        JOIN companies c ON c.id = tb.company_id
        LEFT JOIN billing_plans p ON p.code = tb.plan_code
        ORDER BY tb.status, c.name
      `).all();
      return res.json({ data: rows });
    }
    const row = db.prepare(`
      SELECT tb.*, c.name as company_name, c.code as company_code, c.primary_vertical,
             p.name as plan_name, p.features_json, p.max_outlets, p.max_users
      FROM tenant_billing tb
      JOIN companies c ON c.id = tb.company_id
      LEFT JOIN billing_plans p ON p.code = tb.plan_code
      WHERE tb.company_id = ?
    `).get(companyId);
    if (!row) return res.status(404).json({ error: 'Tenant billing not found' });
    res.json({ ...row, features: (() => { try { return JSON.parse(row.features_json) || []; } catch { return []; } })() });
  });

  router.post('/tenant', (req, res) => {
    // Super-admin only: assign/change plan for a tenant
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) return res.status(403).json({ error: 'Super-admin only' });
    const b = req.body || {};
    if (!b.company_id || !b.plan_code) return res.status(400).json({ error: 'company_id + plan_code required' });
    const plan = db.prepare(`SELECT * FROM billing_plans WHERE code=?`).get(b.plan_code);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const cycle = b.billing_cycle === 'annual' ? 'annual' : 'monthly';
    const amount = cycle === 'annual' ? plan.annual_price_idr : plan.monthly_price_idr;
    const cycleSec = cycle === 'annual' ? YEAR : MONTH;
    const existing = db.prepare(`SELECT id FROM tenant_billing WHERE company_id=?`).get(b.company_id);
    if (existing) {
      db.prepare(`UPDATE tenant_billing SET plan_code=?, billing_cycle=?, amount_idr=?, next_due_at=?, status=?, updated_at=? WHERE id=?`)
        .run(b.plan_code, cycle, amount, nowSec() + cycleSec, b.status || 'active', nowSec(), existing.id);
      res.json({ ok: true, id: existing.id, action: 'updated' });
    } else {
      const r = db.prepare(`INSERT INTO tenant_billing (company_id, plan_code, billing_cycle, amount_idr, next_due_at, status) VALUES (?,?,?,?,?,?)`)
        .run(b.company_id, b.plan_code, cycle, amount, nowSec() + cycleSec, 'active');
      res.json({ ok: true, id: r.lastInsertRowid, action: 'created' });
    }
  });

  // ─── INVOICES ───
  router.get('/invoices', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const where = []; const args = [];
    if (req.query.status) { where.push('i.status=?'); args.push(req.query.status); }
    if (req.query.company_id) { where.push('i.company_id=?'); args.push(parseInt(req.query.company_id, 10)); }
    else if (!scope.is_super_admin) { where.push('i.company_id=?'); args.push(scope.company_id); }
    const sql = `
      SELECT i.*, c.name as company_name, c.code as company_code
      FROM billing_invoices i
      JOIN companies c ON c.id = i.company_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY i.created_at DESC LIMIT 500
    `;
    const rows = db.prepare(sql).all(...args);
    res.json({ data: rows, total: rows.length });
  });

  router.post('/invoices/:id/mark-paid', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) return res.status(403).json({ error: 'Super-admin only' });
    const b = req.body || {};
    const inv = db.prepare(`SELECT * FROM billing_invoices WHERE id=?`).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status === 'paid') return res.status(400).json({ error: 'Already paid' });
    const paidAt = b.paid_at || nowSec();
    db.prepare(`UPDATE billing_invoices SET status='paid', paid_at=?, payment_ref=?, notes=? WHERE id=?`)
      .run(paidAt, b.payment_ref || null, b.notes || null, req.params.id);
    db.prepare(`INSERT INTO billing_payments (invoice_id, amount_idr, paid_at, method, reference, recorded_by, notes) VALUES (?,?,?,?,?,?,?)`)
      .run(req.params.id, inv.total_idr, paidAt, b.method || 'transfer', b.payment_ref || null, b.recorded_by || 'super-admin', b.notes || null);
    res.json({ ok: true });
  });

  // Unsuspend tenant (super-admin override — bypass billing)
  router.post('/tenant/:companyId/unsuspend', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) return res.status(403).json({ error: 'Super-admin only' });
    db.prepare(`UPDATE tenant_billing SET status='active', notes=? WHERE company_id=?`)
      .run('Unsuspended by super-admin at ' + new Date().toISOString(), req.params.companyId);
    db.prepare(`UPDATE companies SET status='active' WHERE id=?`).run(req.params.companyId);
    res.json({ ok: true });
  });

  router.post('/invoices/:id/void', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) return res.status(403).json({ error: 'Super-admin only' });
    db.prepare(`UPDATE billing_invoices SET status='void' WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ─── MRR/ARR/CHURN ───
  router.get('/mrr', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) return res.status(403).json({ error: 'Super-admin only' });

    // MRR = sum of monthly-equivalent of all active subscriptions (annual ÷ 12)
    const activeRows = db.prepare(`
      SELECT tb.*, c.name as company_name, c.primary_vertical, p.name as plan_name
      FROM tenant_billing tb
      JOIN companies c ON c.id = tb.company_id
      LEFT JOIN billing_plans p ON p.code = tb.plan_code
      WHERE tb.status='active' AND tb.plan_code != 'TRIAL'
    `).all();

    const mrr = activeRows.reduce((s, r) => s + (r.billing_cycle === 'annual' ? r.amount_idr / 12 : r.amount_idr), 0);
    const arr = mrr * 12;

    // Trial count
    const trialCount = db.prepare(`SELECT COUNT(*) c FROM tenant_billing WHERE plan_code='TRIAL' AND status='active'`).get().c;
    // Cancelled
    const churned = db.prepare(`SELECT COUNT(*) c FROM tenant_billing WHERE status='cancelled'`).get().c;
    const totalEver = db.prepare(`SELECT COUNT(*) c FROM tenant_billing`).get().c;
    const churnRate = totalEver > 0 ? (churned / totalEver) * 100 : 0;

    // Breakdown by plan
    const byPlan = {};
    activeRows.forEach(r => {
      const k = r.plan_name || r.plan_code;
      byPlan[k] = byPlan[k] || { plan: k, count: 0, mrr: 0 };
      byPlan[k].count += 1;
      byPlan[k].mrr += r.billing_cycle === 'annual' ? r.amount_idr / 12 : r.amount_idr;
    });

    // Breakdown by vertical
    const byVertical = {};
    activeRows.forEach(r => {
      const k = r.primary_vertical || 'unknown';
      byVertical[k] = byVertical[k] || { vertical: k, count: 0, mrr: 0 };
      byVertical[k].count += 1;
      byVertical[k].mrr += r.billing_cycle === 'annual' ? r.amount_idr / 12 : r.amount_idr;
    });

    // Open + overdue invoices
    const openInvoices = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total_idr),0) s FROM billing_invoices WHERE status='open'`).get();
    const overdueInvoices = db.prepare(`
      SELECT COUNT(*) c, COALESCE(SUM(total_idr),0) s FROM billing_invoices
      WHERE status='open' AND due_at < ?
    `).get(nowSec());

    // 30-day collected
    const collected30d = db.prepare(`
      SELECT COALESCE(SUM(total_idr),0) s FROM billing_invoices
      WHERE status='paid' AND paid_at >= ?
    `).get(nowSec() - 30 * DAY).s;

    res.json({
      mrr: Math.round(mrr),
      arr: Math.round(arr),
      active_tenants: activeRows.length,
      trial_tenants: trialCount,
      churned: churned,
      churn_rate_pct: Math.round(churnRate * 10) / 10,
      by_plan: Object.values(byPlan).sort((a, b) => b.mrr - a.mrr),
      by_vertical: Object.values(byVertical).sort((a, b) => b.mrr - a.mrr),
      open_invoices: { count: openInvoices.c, amount: openInvoices.s },
      overdue_invoices: { count: overdueInvoices.c, amount: overdueInvoices.s },
      collected_30d: collected30d,
    });
  });

  // ─── GENERATE INVOICES (cron) ───
  router.post('/generate-monthly', (req, res) => {
    // Find tenants whose next_due_at <= now (or within window) + status=active + not TRIAL
    const now = nowSec();
    const dueTenants = db.prepare(`
      SELECT * FROM tenant_billing
      WHERE status='active' AND plan_code != 'TRIAL'
        AND (next_due_at IS NULL OR next_due_at <= ?)
    `).all(now + 3 * DAY); // pre-bill 3 days ahead

    const generated = [];
    for (const t of dueTenants) {
      const periodStart = t.next_due_at || now;
      const cycleSec = t.billing_cycle === 'annual' ? YEAR : MONTH;
      const periodEnd = periodStart + cycleSec;
      // Skip if invoice already exists for this period
      const dup = db.prepare(`SELECT id FROM billing_invoices WHERE company_id=? AND period_start=?`).get(t.company_id, periodStart);
      if (dup) continue;
      const invNo = generateInvoice(db, t, periodStart, periodEnd);
      generated.push({ company_id: t.company_id, invoice_no: invNo });
    }

    // Mark overdue
    const overdueResult = db.prepare(`UPDATE billing_invoices SET status='overdue' WHERE status='open' AND due_at < ?`).run(now);

    res.json({ ok: true, generated: generated.length, invoices: generated, overdue_flagged: overdueResult.changes });
  });

  // ─── FEATURES: list apa yg tenant boleh akses ───
  router.get('/features', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    if (scope.is_super_admin) {
      // Super-admin / karys → semua
      return res.json({ super_admin: true, features: ['*'], plan_code: null, plan_name: 'Karys Super-Admin' });
    }
    const tb = db.prepare(`SELECT tb.*, p.name as plan_name FROM tenant_billing tb LEFT JOIN billing_plans p ON p.code=tb.plan_code WHERE tb.company_id=?`).get(scope.company_id);
    if (!tb) return res.json({ no_billing: true, features: [], plan_code: null });
    const features = PLAN_FEATURES[tb.plan_code] || [];
    res.json({
      plan_code: tb.plan_code,
      plan_name: tb.plan_name || tb.plan_code,
      status: tb.status,
      trial_until: tb.trial_until,
      features,
      has_all: features.includes('*'),
    });
  });

  // ─── PUBLIC: tenant billing summary (own only) ───
  router.get('/my', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    if (scope.is_super_admin) return res.json({ super_admin: true });
    const tb = db.prepare(`
      SELECT tb.*, p.name as plan_name, p.features_json, p.max_outlets, p.max_users
      FROM tenant_billing tb
      LEFT JOIN billing_plans p ON p.code = tb.plan_code
      WHERE tb.company_id = ?
    `).get(scope.company_id);
    if (!tb) return res.json({ no_billing: true });
    const recentInvoices = db.prepare(`SELECT * FROM billing_invoices WHERE company_id=? ORDER BY created_at DESC LIMIT 12`).all(scope.company_id);
    const unpaid = recentInvoices.filter(i => i.status === 'open' || i.status === 'overdue');
    res.json({
      tenant: { ...tb, features: (() => { try { return JSON.parse(tb.features_json) || []; } catch { return []; } })() },
      invoices: recentInvoices,
      unpaid_count: unpaid.length,
      unpaid_total: unpaid.reduce((s, i) => s + i.total_idr, 0),
    });
  });

  app.use(opts.mountPath || '/api/billing', router);

  // Auto-cron: cek setiap 6 jam, generate invoice yang due + flag overdue + trial expiry
  const GRACE_DAYS = 3; // grace period setelah trial expired sebelum suspend
  const runCron = () => {
    try {
      const now = nowSec();
      const dueTenants = db.prepare(`
        SELECT * FROM tenant_billing
        WHERE status='active' AND plan_code != 'TRIAL'
          AND (next_due_at IS NULL OR next_due_at <= ?)
      `).all(now + 3 * DAY);
      let gen = 0;
      for (const t of dueTenants) {
        const periodStart = t.next_due_at || now;
        const cycleSec = t.billing_cycle === 'annual' ? YEAR : MONTH;
        const dup = db.prepare(`SELECT id FROM billing_invoices WHERE company_id=? AND period_start=?`).get(t.company_id, periodStart);
        if (dup) continue;
        generateInvoice(db, t, periodStart, periodStart + cycleSec);
        gen++;
      }
      const ov = db.prepare(`UPDATE billing_invoices SET status='overdue' WHERE status='open' AND due_at < ?`).run(now);

      // Trial expiry: tenant on TRIAL with trial_until + grace expired → suspend
      const expiredTrials = db.prepare(`
        SELECT tb.*, c.name as company_name FROM tenant_billing tb
        JOIN companies c ON c.id = tb.company_id
        WHERE tb.plan_code='TRIAL' AND tb.status='active'
          AND tb.trial_until IS NOT NULL AND tb.trial_until + ? < ?
      `).all(GRACE_DAYS * DAY, now);
      for (const t of expiredTrials) {
        db.prepare(`UPDATE tenant_billing SET status='paused', notes=?, updated_at=? WHERE id=?`)
          .run(`Trial expired ${new Date(t.trial_until * 1000).toISOString()} + ${GRACE_DAYS}d grace`, now, t.id);
        // Suspend company access (req.companyScope.suspended → 402)
        db.prepare(`UPDATE companies SET status='suspended' WHERE id=?`).run(t.company_id);
        console.log(`[billing] suspended company_id=${t.company_id} (${t.company_name}) — trial expired`);
      }

      // Overdue invoice → suspend tenant if >7 days overdue
      const longOverdue = db.prepare(`
        SELECT DISTINCT i.company_id FROM billing_invoices i
        WHERE i.status='overdue' AND i.due_at + ? < ?
      `).all(7 * DAY, now);
      for (const o of longOverdue) {
        const r = db.prepare(`UPDATE tenant_billing SET status='paused', notes=? WHERE company_id=? AND status='active'`)
          .run('Suspended — invoice unpaid > 7 days', o.company_id);
        if (r.changes > 0) {
          db.prepare(`UPDATE companies SET status='suspended' WHERE id=?`).run(o.company_id);
          console.log(`[billing] suspended company_id=${o.company_id} — invoice >7d overdue`);
        }
      }

      if (gen > 0 || ov.changes > 0 || expiredTrials.length > 0 || longOverdue.length > 0) {
        console.log(`[billing] cron: ${gen} invoice generated, ${ov.changes} overdue, ${expiredTrials.length} trial expired, ${longOverdue.length} long-overdue suspensions`);
      }
    } catch (e) { console.error('[billing] cron error', e.message); }
  };
  setTimeout(runCron, 10_000); // run once on boot (after DB warm)
  setInterval(runCron, 6 * 60 * 60 * 1000); // every 6h

  console.log(`[billing] mounted at ${opts.mountPath || '/api/billing'} — ${DEFAULT_PLANS.length} plans, MRR/invoice engine + auto-cron ready`);

  return { router, db };
}

module.exports = { setupBillingEngine };
