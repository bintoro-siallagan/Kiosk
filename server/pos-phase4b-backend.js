// server/pos-phase4b-backend.js
// POS Phase 4B: split payments + audit log completion + config endpoint.
//
// Three sub-systems exposed via a single setup function:
//   1. Split Payments       /api/pos/payments/*
//   2. Audit Log Helpers    logPosEvent() exported + /api/pos/events
//   3. Runtime Config       /api/pos/config/*
//
// Anti-fraud anomaly rules extended (5 new on top of existing 12).
// Hooks into existing audit_warehouse, master items BOM consumption, and
// pos_events forensic log from Phase 1-4A audit system.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

// ============================================================
// SCHEMA
// ============================================================
const SCHEMA_SQL = `
-- Split payments — multiple tender lines per order
CREATE TABLE IF NOT EXISTS pos_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref TEXT NOT NULL,
  tender_type TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_applied REAL NOT NULL,
  change_given REAL DEFAULT 0,
  ref_no TEXT,
  metadata TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','refunded')),
  voided_at INTEGER, voided_by TEXT, voided_reason TEXT,
  refunded_at INTEGER, refunded_amount REAL DEFAULT 0, refunded_by TEXT, refund_reason TEXT,
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON pos_payments(order_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status ON pos_payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tender ON pos_payments(tender_type);
CREATE INDEX IF NOT EXISTS idx_payments_created ON pos_payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_actor ON pos_payments(actor);

-- Runtime config (key-value with type)
CREATE TABLE IF NOT EXISTS pos_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('number','boolean','string','json')),
  description TEXT,
  category TEXT,
  updated_at INTEGER, updated_by TEXT
);

-- pos_events should already exist from Phase 1-4A; ensure compatible schema
CREATE TABLE IF NOT EXISTS pos_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  event_subtype TEXT,
  payload TEXT,
  actor TEXT,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical')),
  order_ref TEXT,
  related_event_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type ON pos_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON pos_events(severity);
CREATE INDEX IF NOT EXISTS idx_events_order ON pos_events(order_ref);
CREATE INDEX IF NOT EXISTS idx_events_actor ON pos_events(actor);
CREATE INDEX IF NOT EXISTS idx_events_created ON pos_events(created_at);
`;

// ============================================================
// CONFIG DEFAULTS
// ============================================================
const CONFIG_DEFAULTS = [
  // Points
  { key: 'POINT_VALUE_IDR', value: '100', type: 'number', category: 'points',
    description: '1 poin = Rp X (default 100)' },
  { key: 'POINT_MIN_REDEEM', value: '10', type: 'number', category: 'points',
    description: 'Minimum poin yang bisa di-redeem dalam 1 transaksi' },

  // Payment
  { key: 'ALLOW_PARTIAL_PAYMENT', value: 'false', type: 'boolean', category: 'payment',
    description: 'Bolehkan order completed tanpa full payment (credit sales)' },
  { key: 'ALLOW_OVERPAYMENT', value: 'false', type: 'boolean', category: 'payment',
    description: 'Bolehkan total tender > order total untuk non-cash (kalau false, hanya cash boleh overpay → change)' },
  { key: 'CASH_CHANGE_MAX_RATIO', value: '0.5', type: 'number', category: 'payment',
    description: 'Anomali jika change > X × order total (default 0.5 = 50%, ratio aja)' },
  { key: 'TENDER_TYPES', value: '["cash","qris","card","gopay","ovo","dana","shopeepay","points","voucher","transfer"]',
    type: 'json', category: 'payment',
    description: 'Daftar tender_type yang aktif' },
  { key: 'CASH_DRAWER_AUTO_OPEN', value: 'true', type: 'boolean', category: 'payment',
    description: 'Otomatis open cash drawer pas tender cash' },

  // Audit / Fraud
  { key: 'MANAGER_PIN', value: '"1234"', type: 'json', category: 'audit',
    description: 'PIN manager (HARUS DIGANTI dari default). Stored as JSON-quoted string.' },
  { key: 'VOID_REQUIRES_PIN', value: 'true', type: 'boolean', category: 'audit',
    description: 'Void payment perlu manager PIN' },
  { key: 'REFUND_REQUIRES_PIN', value: 'true', type: 'boolean', category: 'audit',
    description: 'Refund perlu manager PIN' },
  { key: 'MAX_VOIDS_PER_HOUR_PER_KASIR', value: '5', type: 'number', category: 'audit',
    description: 'Kasir yang void > X / jam → anomali' },
  { key: 'MAX_REFUNDS_PER_DAY_PER_KASIR', value: '10', type: 'number', category: 'audit',
    description: 'Kasir yang refund > X / hari → anomali' },
  { key: 'CARD_REUSE_WINDOW_MIN', value: '15', type: 'number', category: 'audit',
    description: 'Same card ref_no dipakai dalam X menit → anomali' },

  // UI
  { key: 'KIOSK_NAME', value: '"karyaOS"', type: 'json', category: 'ui',
    description: 'Display name kios' },
  { key: 'CURRENCY_SYMBOL', value: '"Rp"', type: 'json', category: 'ui' },
  { key: 'LOW_STOCK_THRESHOLD', value: '5', type: 'number', category: 'audit',
    description: 'Stock < X → warning broadcast pas sale' },
];

// ============================================================
// HELPERS
// ============================================================
function nowSec() { return Math.floor(Date.now() / 1000); }

function parseConfigValue(row) {
  if (!row) return undefined;
  try {
    switch (row.type) {
      case 'number': return Number(row.value);
      case 'boolean': return row.value === 'true' || row.value === '1';
      case 'json': return JSON.parse(row.value);
      case 'string':
      default: return row.value;
    }
  } catch { return row.value; }
}

function serializeConfigValue(value, type) {
  switch (type) {
    case 'number': return String(Number(value));
    case 'boolean': return value === true || value === 'true' ? 'true' : 'false';
    case 'json': return JSON.stringify(value);
    case 'string':
    default: return String(value);
  }
}

/**
 * Read config value by key with optional fallback.
 */
function getConfig(db, key, fallback) {
  const row = db.prepare(`SELECT value, type FROM pos_config WHERE key = ?`).get(key);
  if (!row) return fallback;
  const parsed = parseConfigValue(row);
  return parsed === undefined ? fallback : parsed;
}

/**
 * Append event to pos_events. Severity auto-bumped if anomaly detected.
 * @returns {number} inserted event id
 */
function logPosEvent(db, opts) {
  const {
    event_type, event_subtype, payload, actor,
    severity = 'info', order_ref, related_event_id
  } = opts;
  const info = db.prepare(`
    INSERT INTO pos_events (event_type, event_subtype, payload, actor, severity, order_ref, related_event_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(
    event_type, event_subtype || null,
    payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : null,
    actor || 'system', severity, order_ref || null, related_event_id || null, nowSec()
  );
  return info.lastInsertRowid;
}

// ============================================================
// ANOMALY DETECTION (5 new rules for Phase 4B)
// ============================================================
function detectPaymentAnomalies(db, payment, allLines, orderTotal) {
  const anomalies = [];

  // Rule A4B-1: Excessive change ratio
  const maxRatio = getConfig(db, 'CASH_CHANGE_MAX_RATIO', 0.5);
  if (payment.change_given && orderTotal > 0 && (payment.change_given / orderTotal) > maxRatio) {
    anomalies.push({
      rule: 'A4B-1', severity: 'warning',
      message: `Change ${payment.change_given} > ${(maxRatio * 100).toFixed(0)}% dari order total ${orderTotal}`
    });
  }

  // Rule A4B-2: Card reuse within window
  if (payment.tender_type === 'card' && payment.ref_no) {
    const windowMin = getConfig(db, 'CARD_REUSE_WINDOW_MIN', 15);
    const cutoff = nowSec() - (windowMin * 60);
    const reuse = db.prepare(`
      SELECT COUNT(*) c FROM pos_payments
      WHERE tender_type = 'card' AND ref_no = ? AND created_at >= ? AND status = 'completed'
    `).get(payment.ref_no, cutoff).c;
    if (reuse >= 2) {
      anomalies.push({
        rule: 'A4B-2', severity: 'critical',
        message: `Kartu ${payment.ref_no} sudah dipakai ${reuse}x dalam ${windowMin} menit`
      });
    }
  }

  // Rule A4B-3: All-cash split (suspicious — usually only need 1 cash line)
  if (allLines.length > 1 && allLines.every(l => l.tender_type === 'cash')) {
    anomalies.push({
      rule: 'A4B-3', severity: 'warning',
      message: `${allLines.length} cash lines untuk 1 order (biasanya cukup 1)`
    });
  }

  // Rule A4B-4: Excessive voids by actor in last hour
  const maxVoids = getConfig(db, 'MAX_VOIDS_PER_HOUR_PER_KASIR', 5);
  const hourAgo = nowSec() - 3600;
  const voidCount = db.prepare(`
    SELECT COUNT(*) c FROM pos_payments
    WHERE voided_by = ? AND voided_at >= ?
  `).get(payment.actor, hourAgo).c;
  if (voidCount > maxVoids) {
    anomalies.push({
      rule: 'A4B-4', severity: 'critical',
      message: `Kasir ${payment.actor} void ${voidCount} payments dalam 1 jam (limit ${maxVoids})`
    });
  }

  // Rule A4B-5: Points redemption value mismatch
  if (payment.tender_type === 'points' && payment.metadata) {
    try {
      const meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata;
      const pointValue = getConfig(db, 'POINT_VALUE_IDR', 100);
      const expected = (meta.points_redeemed || 0) * pointValue;
      if (Math.abs(expected - payment.amount_applied) > 1) {  // tolerate floating point
        anomalies.push({
          rule: 'A4B-5', severity: 'critical',
          message: `Points redemption mismatch: ${meta.points_redeemed} poin × Rp ${pointValue} = ${expected}, tapi amount_applied = ${payment.amount_applied}`
        });
      }
    } catch {}
  }

  return anomalies;
}

/**
 * Validate split payment input — sums match, tender types valid, etc.
 */
function validateTenders(db, orderTotal, tenders) {
  const errors = [];
  const allowedTenders = getConfig(db, 'TENDER_TYPES', ['cash','qris','card','gopay','ovo','dana','points','voucher']);
  const allowPartial = getConfig(db, 'ALLOW_PARTIAL_PAYMENT', false);
  const allowOverpay = getConfig(db, 'ALLOW_OVERPAYMENT', false);

  if (!Array.isArray(tenders) || tenders.length === 0) {
    errors.push('At least 1 tender required');
    return { valid: false, errors };
  }

  let totalTendered = 0;
  let totalNonCash = 0;
  let cashAmount = 0;

  for (let i = 0; i < tenders.length; i++) {
    const t = tenders[i];
    if (!t.tender_type) { errors.push(`Line ${i+1}: tender_type required`); continue; }
    if (!allowedTenders.includes(t.tender_type)) {
      errors.push(`Line ${i+1}: tender_type '${t.tender_type}' not in TENDER_TYPES config`);
      continue;
    }
    if (typeof t.amount !== 'number' || t.amount <= 0) {
      errors.push(`Line ${i+1}: amount must be positive number`);
      continue;
    }
    if (t.tender_type === 'card' && !t.ref_no) {
      errors.push(`Line ${i+1}: card payment requires ref_no (last 4 digits)`);
    }
    if (t.tender_type === 'points') {
      const meta = t.metadata || {};
      if (!meta.points_redeemed || meta.points_redeemed <= 0) {
        errors.push(`Line ${i+1}: points payment requires metadata.points_redeemed`);
      }
    }
    totalTendered += t.amount;
    if (t.tender_type === 'cash') cashAmount += t.amount;
    else totalNonCash += t.amount;
  }

  // Non-cash should not overpay
  if (totalNonCash > orderTotal && !allowOverpay) {
    errors.push(`Non-cash tenders (${totalNonCash}) exceed order total (${orderTotal}). Cash only can overpay → change.`);
  }

  // Total tender must cover order (cash can be over → change)
  const change = Math.max(0, totalTendered - orderTotal);
  const shortfall = Math.max(0, orderTotal - totalTendered);
  if (shortfall > 0.01 && !allowPartial) {  // tolerate floating-point
    errors.push(`Tender total ${totalTendered} < order total ${orderTotal} (shortfall ${shortfall}). Set ALLOW_PARTIAL_PAYMENT=true for credit sales.`);
  }

  // Change can only come from cash
  if (change > 0 && cashAmount === 0) {
    errors.push(`Change ${change} without cash tender (overpay non-cash is rejected by default)`);
  }

  return { valid: errors.length === 0, errors, change, shortfall, cashAmount, totalTendered };
}

/**
 * Finalize a split payment for an order — atomic write of all tender lines + audit events.
 */
function finalizeSplitPayment(db, opts) {
  const { order_ref, order_total, tenders, actor, customer_id } = opts;
  if (!order_ref || typeof order_total !== 'number' || !actor) {
    return { ok: false, errors: ['order_ref, order_total, actor required'] };
  }

  const validation = validateTenders(db, order_total, tenders);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  // Allocate change to cash tender(s). If multiple cash, allocate to last one.
  const tendersWithApplied = tenders.map(t => ({ ...t, amount_applied: t.amount, change_given: 0 }));
  if (validation.change > 0) {
    // Find last cash line, give it the change
    for (let i = tendersWithApplied.length - 1; i >= 0; i--) {
      if (tendersWithApplied[i].tender_type === 'cash') {
        tendersWithApplied[i].change_given = validation.change;
        tendersWithApplied[i].amount_applied = tendersWithApplied[i].amount - validation.change;
        break;
      }
    }
  }

  const result = { ok: true, payment_ids: [], anomalies: [], change: validation.change };

  const tx = db.transaction(() => {
    const insertStmt = db.prepare(`
      INSERT INTO pos_payments (order_ref, tender_type, amount, amount_applied, change_given, ref_no, metadata, actor, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);

    for (const t of tendersWithApplied) {
      const info = insertStmt.run(
        order_ref, t.tender_type, t.amount, t.amount_applied, t.change_given,
        t.ref_no || null,
        t.metadata ? JSON.stringify(t.metadata) : null,
        actor, nowSec()
      );
      result.payment_ids.push(info.lastInsertRowid);

      // Anomaly check
      const allLines = tendersWithApplied;
      const anomalies = detectPaymentAnomalies(db, { ...t, actor }, allLines, order_total);
      if (anomalies.length) {
        for (const a of anomalies) {
          logPosEvent(db, {
            event_type: 'anomaly_detected',
            event_subtype: a.rule,
            payload: { ...a, payment_id: info.lastInsertRowid, order_ref, tender_type: t.tender_type, amount: t.amount },
            actor,
            severity: a.severity,
            order_ref,
            related_event_id: info.lastInsertRowid
          });
          result.anomalies.push({ payment_id: info.lastInsertRowid, ...a });
        }
      }

      // Cash drawer auto-open
      if (t.tender_type === 'cash' && getConfig(db, 'CASH_DRAWER_AUTO_OPEN', true)) {
        logPosEvent(db, {
          event_type: 'cash_drawer_open',
          event_subtype: 'auto',
          payload: { trigger: 'cash_payment', amount: t.amount },
          actor, order_ref, severity: 'info'
        });
      }
    }

    // Master event for the order
    logPosEvent(db, {
      event_type: 'payment_finalized',
      event_subtype: tendersWithApplied.length > 1 ? 'split' : 'single',
      payload: {
        order_ref, order_total,
        total_tendered: validation.totalTendered,
        change: validation.change,
        tender_count: tendersWithApplied.length,
        tender_types: tendersWithApplied.map(t => t.tender_type),
        customer_id: customer_id || null,
        payment_ids: result.payment_ids
      },
      actor, order_ref, severity: result.anomalies.length ? 'warning' : 'info'
    });
  });

  try { tx(); } catch (e) { return { ok: false, errors: [e.message] }; }
  return result;
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupPhase4B(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed config if empty
  const configCount = db.prepare(`SELECT COUNT(*) c FROM pos_config`).get().c;
  if (configCount === 0) {
    const s = db.prepare(`INSERT INTO pos_config (key, value, type, description, category, updated_at) VALUES (?,?,?,?,?,?)`);
    for (const c of CONFIG_DEFAULTS) s.run(c.key, c.value, c.type, c.description || null, c.category || null, nowSec());
  }

  const router = express.Router();
  router.use(express.json());

  // ===================================================
  // SPLIT PAYMENTS
  // ===================================================

  // Validate tenders without persisting (dry-run for UI feedback)
  router.post('/payments/validate', (req, res) => {
    const { order_total, tenders } = req.body || {};
    const v = validateTenders(db, order_total, tenders || []);
    res.json(v);
  });

  // Finalize: persist all tender lines for an order
  router.post('/payments', (req, res) => {
    const result = finalizeSplitPayment(db, req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  // List payments for an order
  router.get('/payments/:order_ref', (req, res) => {
    const rows = db.prepare(`SELECT * FROM pos_payments WHERE order_ref = ? ORDER BY created_at`).all(req.params.order_ref);
    const parsed = rows.map(r => ({ ...r, metadata: r.metadata ? safeJson(r.metadata) : null }));
    const totals = {
      tendered: parsed.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0),
      applied: parsed.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount_applied, 0),
      change: parsed.reduce((s, p) => s + (p.change_given || 0), 0),
      refunded: parsed.reduce((s, p) => s + (p.refunded_amount || 0), 0),
      voided_count: parsed.filter(p => p.status === 'voided').length,
    };
    res.json({ payments: parsed, totals });
  });

  // Void a single payment line (manager PIN required if configured)
  router.post('/payments/:id/void', (req, res) => {
    const { reason, voided_by, manager_pin } = req.body || {};
    if (!reason || !voided_by) return res.status(400).json({ error: 'reason and voided_by required' });

    if (getConfig(db, 'VOID_REQUIRES_PIN', true)) {
      const pin = getConfig(db, 'MANAGER_PIN', '1234');
      if (String(manager_pin) !== String(pin)) {
        logPosEvent(db, {
          event_type: 'auth_failed', event_subtype: 'void_pin',
          payload: { payment_id: req.params.id, voided_by },
          actor: voided_by, severity: 'warning'
        });
        return res.status(401).json({ error: 'invalid manager PIN' });
      }
    }

    const p = db.prepare(`SELECT * FROM pos_payments WHERE id = ?`).get(req.params.id);
    if (!p) return res.status(404).json({ error: 'payment not found' });
    if (p.status !== 'completed') return res.status(409).json({ error: `payment already ${p.status}` });

    const tx = db.transaction(() => {
      db.prepare(`UPDATE pos_payments SET status='voided', voided_at=?, voided_by=?, voided_reason=? WHERE id=?`)
        .run(nowSec(), voided_by, reason, req.params.id);
      logPosEvent(db, {
        event_type: 'payment_void',
        payload: { payment_id: p.id, order_ref: p.order_ref, amount: p.amount, tender_type: p.tender_type, reason },
        actor: voided_by, severity: 'warning', order_ref: p.order_ref, related_event_id: p.id
      });
    });
    tx();
    res.json({ ok: true });
  });

  // Refund (full or partial)
  router.post('/payments/:id/refund', (req, res) => {
    const { amount, reason, refunded_by, manager_pin } = req.body || {};
    if (!amount || !reason || !refunded_by) return res.status(400).json({ error: 'amount, reason, refunded_by required' });

    if (getConfig(db, 'REFUND_REQUIRES_PIN', true)) {
      const pin = getConfig(db, 'MANAGER_PIN', '1234');
      if (String(manager_pin) !== String(pin)) {
        logPosEvent(db, {
          event_type: 'auth_failed', event_subtype: 'refund_pin',
          payload: { payment_id: req.params.id, refunded_by },
          actor: refunded_by, severity: 'warning'
        });
        return res.status(401).json({ error: 'invalid manager PIN' });
      }
    }

    const p = db.prepare(`SELECT * FROM pos_payments WHERE id = ?`).get(req.params.id);
    if (!p) return res.status(404).json({ error: 'payment not found' });
    if (p.status === 'voided') return res.status(409).json({ error: 'cannot refund voided payment' });

    const newRefund = (p.refunded_amount || 0) + amount;
    if (newRefund > p.amount_applied + 0.01) {
      return res.status(400).json({ error: `refund total ${newRefund} > original amount_applied ${p.amount_applied}` });
    }

    const status = newRefund >= p.amount_applied - 0.01 ? 'refunded' : 'completed';
    const tx = db.transaction(() => {
      db.prepare(`UPDATE pos_payments SET status=?, refunded_at=?, refunded_amount=?, refunded_by=?, refund_reason=? WHERE id=?`)
        .run(status, nowSec(), newRefund, refunded_by, reason, req.params.id);
      logPosEvent(db, {
        event_type: 'payment_refund',
        event_subtype: status === 'refunded' ? 'full' : 'partial',
        payload: { payment_id: p.id, order_ref: p.order_ref, refund_amount: amount, total_refunded: newRefund, reason },
        actor: refunded_by, severity: 'warning', order_ref: p.order_ref, related_event_id: p.id
      });
    });
    tx();
    res.json({ ok: true, status, total_refunded: newRefund });
  });

  // Payment stats — for dashboards
  router.get('/payments-stats', (req, res) => {
    const { from, to } = req.query;
    const fromTs = from ? Number(from) : nowSec() - 86400;
    const toTs = to ? Number(to) : nowSec();
    const byTender = db.prepare(`
      SELECT tender_type, COUNT(*) c, SUM(amount_applied) total
      FROM pos_payments
      WHERE status = 'completed' AND created_at BETWEEN ? AND ?
      GROUP BY tender_type
      ORDER BY total DESC
    `).all(fromTs, toTs);
    const summary = db.prepare(`
      SELECT
        COUNT(DISTINCT order_ref) orders,
        COUNT(*) tender_lines,
        SUM(amount_applied) total_applied,
        SUM(change_given) total_change,
        SUM(CASE WHEN status='refunded' THEN refunded_amount ELSE 0 END) total_refunded,
        SUM(CASE WHEN status='voided' THEN amount ELSE 0 END) total_voided
      FROM pos_payments WHERE created_at BETWEEN ? AND ?
    `).get(fromTs, toTs);
    res.json({ from: fromTs, to: toTs, by_tender: byTender, summary });
  });

  // ===================================================
  // AUDIT LOG
  // ===================================================

  // Append event (for non-Node clients)
  router.post('/events', (req, res) => {
    const id = logPosEvent(db, req.body || {});
    res.json({ ok: true, id });
  });

  // Query events with filters
  router.get('/events', (req, res) => {
    const {
      event_type, event_subtype, severity, order_ref, actor,
      from, to, limit = 200, offset = 0
    } = req.query;
    const sql = [`SELECT * FROM pos_events WHERE 1=1`];
    const params = [];
    if (event_type) { sql.push('AND event_type = ?'); params.push(event_type); }
    if (event_subtype) { sql.push('AND event_subtype = ?'); params.push(event_subtype); }
    if (severity) { sql.push('AND severity = ?'); params.push(severity); }
    if (order_ref) { sql.push('AND order_ref = ?'); params.push(order_ref); }
    if (actor) { sql.push('AND actor = ?'); params.push(actor); }
    if (from) { sql.push('AND created_at >= ?'); params.push(Number(from)); }
    if (to) { sql.push('AND created_at <= ?'); params.push(Number(to)); }
    sql.push('ORDER BY created_at DESC LIMIT ? OFFSET ?');
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql.join(' ')).all(...params);
    const parsed = rows.map(r => ({ ...r, payload: r.payload ? safeJson(r.payload) : null }));
    res.json(parsed);
  });

  // Event taxonomy — what event_types/subtypes have been recorded
  router.get('/events-taxonomy', (req, res) => {
    const rows = db.prepare(`
      SELECT event_type, event_subtype, severity, COUNT(*) count, MAX(created_at) last_seen
      FROM pos_events GROUP BY event_type, event_subtype, severity
      ORDER BY count DESC
    `).all();
    res.json(rows);
  });

  // Anomalies feed — critical/warning events
  router.get('/anomalies', (req, res) => {
    const { from, to, limit = 100 } = req.query;
    const fromTs = from ? Number(from) : nowSec() - 86400;
    const toTs = to ? Number(to) : nowSec();
    const rows = db.prepare(`
      SELECT * FROM pos_events
      WHERE event_type = 'anomaly_detected' AND created_at BETWEEN ? AND ?
      ORDER BY created_at DESC LIMIT ?
    `).all(fromTs, toTs, Number(limit));
    res.json(rows.map(r => ({ ...r, payload: r.payload ? safeJson(r.payload) : null })));
  });

  // ===================================================
  // CONFIG
  // ===================================================

  router.get('/config', (req, res) => {
    const { category } = req.query;
    const sql = category
      ? `SELECT * FROM pos_config WHERE category = ? ORDER BY key`
      : `SELECT * FROM pos_config ORDER BY category, key`;
    const params = category ? [category] : [];
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(r => ({ ...r, parsed_value: parseConfigValue(r) })));
  });

  router.get('/config/:key', (req, res) => {
    const row = db.prepare(`SELECT * FROM pos_config WHERE key = ?`).get(req.params.key);
    if (!row) return res.status(404).json({ error: 'config key not found' });
    res.json({ ...row, parsed_value: parseConfigValue(row) });
  });

  router.put('/config/:key', (req, res) => {
    const { value, updated_by, manager_pin } = req.body || {};
    if (value === undefined) return res.status(400).json({ error: 'value required' });

    // Manager PIN for sensitive keys (audit category)
    const row = db.prepare(`SELECT * FROM pos_config WHERE key = ?`).get(req.params.key);
    if (!row) return res.status(404).json({ error: 'config key not found' });
    if (row.category === 'audit') {
      const pin = getConfig(db, 'MANAGER_PIN', '1234');
      if (String(manager_pin) !== String(pin)) {
        logPosEvent(db, {
          event_type: 'auth_failed', event_subtype: 'config_pin',
          payload: { key: req.params.key, updated_by },
          actor: updated_by || 'unknown', severity: 'warning'
        });
        return res.status(401).json({ error: 'invalid manager PIN for audit-category config' });
      }
    }

    const serialized = serializeConfigValue(value, row.type);
    const oldValue = row.value;
    db.prepare(`UPDATE pos_config SET value=?, updated_at=?, updated_by=? WHERE key=?`)
      .run(serialized, nowSec(), updated_by || 'admin', req.params.key);
    logPosEvent(db, {
      event_type: 'config_change',
      payload: { key: req.params.key, old: oldValue, new: serialized, type: row.type },
      actor: updated_by || 'admin', severity: row.category === 'audit' ? 'warning' : 'info'
    });
    res.json({ ok: true, key: req.params.key, value: serialized });
  });

  router.post('/config', (req, res) => {
    const { key, value, type, description, category, updated_by } = req.body || {};
    if (!key || value === undefined || !type) {
      return res.status(400).json({ error: 'key, value, type required' });
    }
    if (!['number','boolean','string','json'].includes(type)) {
      return res.status(400).json({ error: 'invalid type' });
    }
    try {
      db.prepare(`INSERT INTO pos_config (key, value, type, description, category, updated_at, updated_by) VALUES (?,?,?,?,?,?,?)`)
        .run(key, serializeConfigValue(value, type), type, description || null, category || null, nowSec(), updated_by || 'admin');
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'key exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // ===================================================
  // MOUNT
  // ===================================================
  const mountPath = opts.mountPath || '/api/pos';
  app.use(mountPath, router);

  console.log(`[pos-phase4b] mounted at ${mountPath}`);
  console.log(`[pos-phase4b] payments: ${mountPath}/payments | config: ${mountPath}/config | events: ${mountPath}/events`);

  return {
    router, db,
    finalizeSplitPayment: (opts) => finalizeSplitPayment(db, opts),
    logPosEvent: (opts) => logPosEvent(db, opts),
    getConfig: (key, fb) => getConfig(db, key, fb),
    validateTenders: (total, tenders) => validateTenders(db, total, tenders),
  };
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

module.exports = { setupPhase4B, SCHEMA_SQL, CONFIG_DEFAULTS };
