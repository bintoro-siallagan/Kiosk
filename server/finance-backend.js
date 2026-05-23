// server/finance-backend.js
// Finance module: expense CRUD, P&L report, COGS aggregation from BOM consumption,
// tax config (PPN/PB1), revenue analytics.
//
// Integrasi:
//   - Revenue: read from pos_payments (Phase 4B)
//   - COGS: read from pos_events 'stock_consumption' (Master Item BOM) × audit_warehouse.last_cost
//   - Procurement payment → auto-create finance_expense (category='COGS - Bahan Baku')

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cogs','opex','capex')),
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS finance_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  category_id TEXT NOT NULL,
  expense_date INTEGER NOT NULL,
  amount REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  vendor TEXT,
  description TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  payment_method TEXT,
  receipt_url TEXT,
  status TEXT DEFAULT 'recorded' CHECK (status IN ('recorded','voided')),
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  created_by TEXT,
  voided_at INTEGER, voided_by TEXT, voided_reason TEXT,
  FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);
CREATE INDEX IF NOT EXISTS idx_exp_date ON finance_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_exp_cat ON finance_expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_exp_status ON finance_expenses(status);
CREATE INDEX IF NOT EXISTS idx_exp_ref ON finance_expenses(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS tax_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  applies_to TEXT DEFAULT 'all',
  is_active INTEGER DEFAULT 1,
  display_separately INTEGER DEFAULT 1,
  inclusive INTEGER DEFAULT 0
);
`;

const DEFAULT_CATEGORIES = [
  // COGS
  { id: 'cogs-bahan-baku', name: 'COGS - Bahan Baku', type: 'cogs', display_order: 1 },
  { id: 'cogs-packaging', name: 'COGS - Packaging', type: 'cogs', display_order: 2 },
  // OPEX
  { id: 'opex-sewa', name: 'Sewa Tempat', type: 'opex', display_order: 10 },
  { id: 'opex-listrik', name: 'Listrik', type: 'opex', display_order: 11 },
  { id: 'opex-air', name: 'Air', type: 'opex', display_order: 12 },
  { id: 'opex-internet', name: 'Internet & Telp', type: 'opex', display_order: 13 },
  { id: 'opex-gaji', name: 'Gaji Karyawan', type: 'opex', display_order: 14 },
  { id: 'opex-bpjs', name: 'BPJS / Tunjangan', type: 'opex', display_order: 15 },
  { id: 'opex-marketing', name: 'Marketing / Iklan', type: 'opex', display_order: 16 },
  { id: 'opex-transportasi', name: 'Transportasi', type: 'opex', display_order: 17 },
  { id: 'opex-maintenance', name: 'Maintenance & Repair', type: 'opex', display_order: 18 },
  { id: 'opex-supplies', name: 'Office Supplies', type: 'opex', display_order: 19 },
  { id: 'opex-kebersihan', name: 'Kebersihan', type: 'opex', display_order: 20 },
  { id: 'opex-misc', name: 'Lain-lain', type: 'opex', display_order: 21 },
  // CAPEX
  { id: 'capex-equipment', name: 'Peralatan & Mesin', type: 'capex', display_order: 30 },
  { id: 'capex-renovation', name: 'Renovasi', type: 'capex', display_order: 31 },
  { id: 'capex-software', name: 'Software & License', type: 'capex', display_order: 32 },
];

const DEFAULT_TAX = [
  { id: 'ppn', name: 'PPN', rate: 0.11, applies_to: 'all', display_separately: 1, inclusive: 0 },
  { id: 'pb1', name: 'PB1 / Pajak Restoran', rate: 0.10, applies_to: 'all', display_separately: 1, inclusive: 0 },
];

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

function nextDocNo(db, prefix) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const last = db.prepare(`SELECT doc_no FROM finance_expenses WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}-${ym}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  return `${prefix}-${ym}-${String(seq).padStart(4, '0')}`;
}

// ============================================================
// CORE: P&L CALCULATION
// ============================================================
function calcPL(db, fromTs, toTs) {
  // 1. Revenue from pos_payments (completed only, exclude voided)
  const revRow = db.prepare(`
    SELECT
      COALESCE(SUM(amount_applied), 0) gross_revenue,
      COALESCE(SUM(CASE WHEN status='refunded' THEN refunded_amount ELSE 0 END), 0) refunds,
      COUNT(DISTINCT order_ref) order_count
    FROM pos_payments
    WHERE status IN ('completed','refunded') AND created_at BETWEEN ? AND ?
  `).get(fromTs, toTs);
  // 1b. Cinema revenue — add tickets + F&B bundles + in-studio + event booking
  let cinemaGross = 0, cinemaRefunds = 0, cinemaOrders = 0;
  try {
    const tk = db.prepare(`SELECT COALESCE(SUM(price),0) g, COUNT(*) c FROM cinema_tickets WHERE sold_at BETWEEN ? AND ?`).get(fromTs, toTs);
    const vd = db.prepare(`SELECT COALESCE(SUM(price),0) g FROM cinema_ticket_voids WHERE voided_at BETWEEN ? AND ?`).get(fromTs, toTs);
    const bd = db.prepare(`SELECT COALESCE(SUM(qty*price),0) g FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`).get(fromTs, toTs);
    const isq = db.prepare(`SELECT COALESCE(SUM(total),0) g, COUNT(*) c FROM cinema_in_studio_orders WHERE status='delivered' AND created_at BETWEEN ? AND ?`).get(fromTs, toTs);
    const ev = db.prepare(`SELECT COALESCE(SUM(total_price),0) g, COUNT(*) c FROM cinema_studio_bookings WHERE status IN ('confirmed','completed') AND (completed_at BETWEEN ? AND ? OR (status='confirmed' AND created_at BETWEEN ? AND ?))`).get(fromTs, toTs, fromTs, toTs);
    cinemaGross   = (tk.g || 0) + (bd.g || 0) + (isq.g || 0) + (ev.g || 0);
    cinemaRefunds = (vd.g || 0);
    cinemaOrders  = (tk.c || 0) + (isq.c || 0) + (ev.c || 0);
  } catch (e) { /* cinema tables not exist */ }
  const grossRevenue = (revRow.gross_revenue || 0) + cinemaGross;
  const refunds = (revRow.refunds || 0) + cinemaRefunds;
  const netRevenue = grossRevenue - refunds;

  // 2. COGS from pos_events 'stock_consumption' × audit_warehouse.last_cost
  // pos_events.payload is JSON: { sku, deducted, unit, ... }
  let cogs = 0;
  let cogsBySku = {};
  try {
    const consumptionEvents = db.prepare(`
      SELECT payload FROM pos_events
      WHERE event_type = 'stock_consumption' AND created_at BETWEEN ? AND ?
    `).all(fromTs, toTs);
    const skuCostCache = {};
    for (const ev of consumptionEvents) {
      const p = safeJson(ev.payload);
      if (!p || !p.sku || !p.deducted) continue;
      if (!skuCostCache[p.sku]) {
        const w = db.prepare(`SELECT * FROM audit_warehouse WHERE sku = ?`).get(p.sku);
        skuCostCache[p.sku] = w ? (w.last_cost || w.unit_cost || w.cogs || 0) : 0;
      }
      const lineCost = p.deducted * skuCostCache[p.sku];
      cogs += lineCost;
      cogsBySku[p.sku] = (cogsBySku[p.sku] || 0) + lineCost;
    }
  } catch (e) {
    // pos_events or audit_warehouse may not exist — soft fail
  }

  // 3. Operating expenses (opex)
  const expensesByCategory = db.prepare(`
    SELECT
      c.id, c.name, c.type,
      COALESCE(SUM(e.amount), 0) amount,
      COALESCE(SUM(e.tax_amount), 0) tax_amount,
      COUNT(e.id) entries
    FROM expense_categories c
    LEFT JOIN finance_expenses e ON e.category_id = c.id
      AND e.status = 'recorded'
      AND e.expense_date BETWEEN ? AND ?
    GROUP BY c.id
    HAVING amount > 0 OR entries > 0
    ORDER BY c.type, c.display_order
  `).all(fromTs, toTs);

  const opex = expensesByCategory.filter(c => c.type === 'opex').reduce((s, c) => s + c.amount, 0);
  const capex = expensesByCategory.filter(c => c.type === 'capex').reduce((s, c) => s + c.amount, 0);
  const cogsManual = expensesByCategory.filter(c => c.type === 'cogs').reduce((s, c) => s + c.amount, 0);

  // Use BOM-based COGS if available; fall back to manual COGS expenses
  const totalCogs = cogs > 0 ? cogs : cogsManual;

  // 4. Margins
  const grossProfit = netRevenue - totalCogs;
  const operatingProfit = grossProfit - opex;
  const netProfitBeforeTax = operatingProfit;

  // 5. Tax (estimate based on active tax_config × revenue, if not inclusive)
  const taxes = db.prepare(`SELECT * FROM tax_config WHERE is_active = 1`).all();
  const taxBreakdown = taxes.map(t => ({
    id: t.id, name: t.name, rate: t.rate,
    amount: t.inclusive ? 0 : netRevenue * t.rate
  }));
  const totalTax = taxBreakdown.reduce((s, t) => s + t.amount, 0);
  const netProfit = netProfitBeforeTax - totalTax;

  return {
    period: { from: fromTs, to: toTs },
    revenue: {
      gross: grossRevenue,
      refunds: refunds,
      net: netRevenue,
      order_count: revRow.order_count,
      avg_order_value: revRow.order_count > 0 ? netRevenue / revRow.order_count : 0
    },
    cogs: {
      total: totalCogs,
      source: cogs > 0 ? 'bom_consumption' : 'manual_expenses',
      by_sku: cogsBySku,
      manual_total: cogsManual
    },
    expenses: {
      opex_total: opex,
      capex_total: capex,
      by_category: expensesByCategory
    },
    margins: {
      gross_profit: grossProfit,
      gross_margin_pct: netRevenue > 0 ? (grossProfit / netRevenue * 100) : 0,
      operating_profit: operatingProfit,
      operating_margin_pct: netRevenue > 0 ? (operatingProfit / netRevenue * 100) : 0,
      net_profit_before_tax: netProfitBeforeTax,
      net_profit: netProfit,
      net_margin_pct: netRevenue > 0 ? (netProfit / netRevenue * 100) : 0
    },
    tax: { total: totalTax, breakdown: taxBreakdown }
  };
}

// Revenue by tender type (cash/qris/card/etc breakdown)
function calcRevenueByTender(db, fromTs, toTs) {
  return db.prepare(`
    SELECT
      tender_type,
      COUNT(*) lines,
      COUNT(DISTINCT order_ref) orders,
      SUM(amount_applied) total
    FROM pos_payments
    WHERE status = 'completed' AND created_at BETWEEN ? AND ?
    GROUP BY tender_type
    ORDER BY total DESC
  `).all(fromTs, toTs);
}

// Revenue time series for charts
function calcRevenueTimeSeries(db, fromTs, toTs, granularity) {
  const fmt = granularity === 'hour' ? '%Y-%m-%d %H:00'
    : granularity === 'day' ? '%Y-%m-%d'
    : granularity === 'week' ? '%Y-W%W'
    : '%Y-%m';
  return db.prepare(`
    SELECT
      strftime('${fmt}', created_at, 'unixepoch', 'localtime') period,
      COUNT(DISTINCT order_ref) orders,
      SUM(amount_applied) revenue,
      SUM(change_given) change_given
    FROM pos_payments
    WHERE status IN ('completed','refunded') AND created_at BETWEEN ? AND ?
    GROUP BY period ORDER BY period
  `).all(fromTs, toTs);
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupFinance(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed categories if empty
  const catCount = db.prepare(`SELECT COUNT(*) c FROM expense_categories`).get().c;
  if (catCount === 0) {
    const s = db.prepare(`INSERT INTO expense_categories (id, name, type, display_order) VALUES (?,?,?,?)`);
    for (const c of DEFAULT_CATEGORIES) s.run(c.id, c.name, c.type, c.display_order);
  }

  const taxCount = db.prepare(`SELECT COUNT(*) c FROM tax_config`).get().c;
  if (taxCount === 0) {
    const s = db.prepare(`INSERT INTO tax_config (id, name, rate, applies_to, display_separately, inclusive) VALUES (?,?,?,?,?,?)`);
    for (const t of DEFAULT_TAX) s.run(t.id, t.name, t.rate, t.applies_to, t.display_separately, t.inclusive);
  }

  const router = express.Router();
  router.use(express.json());

  // ========== EXPENSE CATEGORIES ==========
  router.get('/expense-categories', (req, res) => {
    const { type, active } = req.query;
    let sql = `SELECT * FROM expense_categories WHERE 1=1`;
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    sql += ' ORDER BY type, display_order, name';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/expense-categories', (req, res) => {
    const { id, name, type, display_order } = req.body || {};
    if (!id || !name || !type) return res.status(400).json({ error: 'id, name, type required' });
    if (!['cogs','opex','capex'].includes(type)) return res.status(400).json({ error: 'invalid type' });
    try {
      db.prepare(`INSERT INTO expense_categories (id, name, type, display_order) VALUES (?,?,?,?)`)
        .run(id, name, type, display_order || 0);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/expense-categories/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name','type','display_order','is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE expense_categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ========== EXPENSES ==========
  router.get('/expenses', (req, res) => {
    const { category_id, from, to, status, vendor, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT e.*, c.name AS category_name, c.type AS category_type
      FROM finance_expenses e
      JOIN expense_categories c ON c.id = e.category_id
      WHERE 1=1
    `;
    const params = [];
    if (category_id) { sql += ' AND e.category_id = ?'; params.push(category_id); }
    if (from) { sql += ' AND e.expense_date >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND e.expense_date <= ?'; params.push(Number(to)); }
    if (status) { sql += ' AND e.status = ?'; params.push(status); }
    if (vendor) { sql += ' AND e.vendor LIKE ?'; params.push(`%${vendor}%`); }
    sql += ' ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/expenses', (req, res) => {
    const b = req.body || {};
    if (!b.category_id || !b.amount || !b.expense_date) {
      return res.status(400).json({ error: 'category_id, amount, expense_date required' });
    }
    const docNo = b.doc_no || nextDocNo(db, 'EXP');
    try {
      const info = db.prepare(`
        INSERT INTO finance_expenses
          (doc_no, category_id, expense_date, amount, tax_amount, vendor, description,
           reference_type, reference_id, payment_method, receipt_url, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        docNo, b.category_id, Number(b.expense_date), Number(b.amount), Number(b.tax_amount || 0),
        b.vendor || null, b.description || null,
        b.reference_type || null, b.reference_id || null,
        b.payment_method || null, b.receipt_url || null, b.notes || null,
        b.created_by || 'admin'
      );
      res.json({ ok: true, id: info.lastInsertRowid, doc_no: docNo });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'doc_no exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/expenses/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['category_id','expense_date','amount','tax_amount','vendor','description','payment_method','receipt_url','notes'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE finance_expenses SET ${sets.join(', ')} WHERE id = ? AND status = 'recorded'`).run(...params);
    res.json({ ok: true });
  });

  router.post('/expenses/:id/void', (req, res) => {
    const { reason, voided_by } = req.body || {};
    if (!reason || !voided_by) return res.status(400).json({ error: 'reason, voided_by required' });
    db.prepare(`UPDATE finance_expenses SET status='voided', voided_at=?, voided_by=?, voided_reason=? WHERE id=?`)
      .run(nowSec(), voided_by, reason, req.params.id);
    res.json({ ok: true });
  });

  // ========== TAX CONFIG ==========
  router.get('/tax-config', (req, res) => {
    res.json(db.prepare(`SELECT * FROM tax_config ORDER BY name`).all());
  });

  router.post('/tax-config', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name || b.rate === undefined) return res.status(400).json({ error: 'id, name, rate required' });
    try {
      db.prepare(`INSERT INTO tax_config (id, name, rate, applies_to, is_active, display_separately, inclusive) VALUES (?,?,?,?,?,?,?)`)
        .run(b.id, b.name, b.rate, b.applies_to || 'all', b.is_active !== false ? 1 : 0, b.display_separately !== false ? 1 : 0, b.inclusive ? 1 : 0);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/tax-config/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name','rate','applies_to','is_active','display_separately','inclusive'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE tax_config SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/tax-config/:id', (req, res) => {
    db.prepare(`DELETE FROM tax_config WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ========== P&L REPORT ==========
  router.get('/pl', (req, res) => {
    const fromTs = req.query.from ? Number(req.query.from) : nowSec() - 30 * 86400;
    const toTs = req.query.to ? Number(req.query.to) : nowSec();
    res.json(calcPL(db, fromTs, toTs));
  });

  router.get('/pl/by-period', (req, res) => {
    const fromTs = req.query.from ? Number(req.query.from) : nowSec() - 30 * 86400;
    const toTs = req.query.to ? Number(req.query.to) : nowSec();
    const granularity = req.query.granularity || 'day';
    res.json(calcRevenueTimeSeries(db, fromTs, toTs, granularity));
  });

  router.get('/revenue-by-tender', (req, res) => {
    const fromTs = req.query.from ? Number(req.query.from) : nowSec() - 30 * 86400;
    const toTs = req.query.to ? Number(req.query.to) : nowSec();
    res.json(calcRevenueByTender(db, fromTs, toTs));
  });

  // ========== COGS DETAIL ==========
  router.get('/cogs-detail', (req, res) => {
    const fromTs = req.query.from ? Number(req.query.from) : nowSec() - 7 * 86400;
    const toTs = req.query.to ? Number(req.query.to) : nowSec();
    try {
      const events = db.prepare(`
        SELECT * FROM pos_events
        WHERE event_type='stock_consumption' AND created_at BETWEEN ? AND ?
        ORDER BY created_at DESC LIMIT 1000
      `).all(fromTs, toTs);
      const detail = events.map(ev => {
        const p = safeJson(ev.payload);
        if (!p?.sku) return null;
        const wh = db.prepare(`SELECT * FROM audit_warehouse WHERE sku = ?`).get(p.sku);
        const unitCost = wh ? (wh.last_cost || wh.unit_cost || wh.cogs || 0) : 0;
        return {
          time: ev.created_at,
          order_ref: ev.order_ref || p.order_ref,
          sku: p.sku,
          deducted: p.deducted,
          unit: p.unit || wh?.unit,
          unit_cost: unitCost,
          line_cost: p.deducted * unitCost
        };
      }).filter(Boolean);
      // Aggregate by SKU
      const bySku = {};
      for (const d of detail) {
        if (!bySku[d.sku]) bySku[d.sku] = { sku: d.sku, qty: 0, cost: 0, transactions: 0 };
        bySku[d.sku].qty += d.deducted;
        bySku[d.sku].cost += d.line_cost;
        bySku[d.sku].transactions += 1;
      }
      res.json({ detail, by_sku: Object.values(bySku).sort((a,b) => b.cost - a.cost) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== DASHBOARD ==========
  router.get('/dashboard', (req, res) => {
    const todayStart = Math.floor(new Date().setHours(0,0,0,0) / 1000);
    const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
    const yesterdayStart = todayStart - 86400;

    res.json({
      today: calcPL(db, todayStart, nowSec()),
      yesterday: calcPL(db, yesterdayStart, todayStart),
      this_month: calcPL(db, monthStart, nowSec()),
      tax_config: db.prepare(`SELECT * FROM tax_config WHERE is_active = 1`).all(),
      last_expenses: db.prepare(`
        SELECT e.doc_no, e.expense_date, e.amount, e.vendor, c.name AS category
        FROM finance_expenses e JOIN expense_categories c ON c.id = e.category_id
        WHERE e.status = 'recorded' ORDER BY e.created_at DESC LIMIT 10
      `).all()
    });
  });

  // ========== EXPORT ==========
  router.get('/export/expenses.csv', (req, res) => {
    const { from, to } = req.query;
    const fromTs = from ? Number(from) : nowSec() - 30 * 86400;
    const toTs = to ? Number(to) : nowSec();
    const rows = db.prepare(`
      SELECT e.doc_no, e.expense_date, c.name AS category, c.type, e.amount, e.tax_amount,
             e.vendor, e.description, e.payment_method, e.status
      FROM finance_expenses e JOIN expense_categories c ON c.id = e.category_id
      WHERE e.expense_date BETWEEN ? AND ?
      ORDER BY e.expense_date DESC
    `).all(fromTs, toTs);
    const header = 'doc_no,date,category,type,amount,tax,vendor,description,payment_method,status\n';
    const csv = header + rows.map(r => [
      r.doc_no, new Date(r.expense_date * 1000).toISOString().slice(0,10),
      r.category, r.type, r.amount, r.tax_amount,
      `"${(r.vendor || '').replace(/"/g, '""')}"`,
      `"${(r.description || '').replace(/"/g, '""')}"`,
      r.payment_method || '', r.status
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=expenses-${fromTs}-${toTs}.csv`);
    res.send(csv);
  });

  const mountPath = opts.mountPath || '/api/finance';
  app.use(mountPath, router);

  console.log(`[finance] mounted at ${mountPath}`);

  return {
    router, db,
    calcPL: (from, to) => calcPL(db, from, to),
    calcRevenueByTender: (from, to) => calcRevenueByTender(db, from, to),
    createExpense: (data) => {
      const docNo = data.doc_no || nextDocNo(db, 'EXP');
      const info = db.prepare(`
        INSERT INTO finance_expenses (doc_no, category_id, expense_date, amount, tax_amount, vendor, description, reference_type, reference_id, payment_method, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(docNo, data.category_id, data.expense_date, data.amount, data.tax_amount || 0,
        data.vendor, data.description, data.reference_type, data.reference_id, data.payment_method, data.created_by);
      return { id: info.lastInsertRowid, doc_no: docNo };
    }
  };
}

module.exports = { setupFinance, SCHEMA_SQL };
