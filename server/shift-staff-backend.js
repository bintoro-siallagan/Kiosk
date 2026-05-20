// server/shift-staff-backend.js
// Shift management + Staff CRUD untuk POS kasir login.
// Sediakan endpoint yang dipanggil oleh POSKasirLogin.jsx dan flow shift close.
//
// Fitur:
//   - Shift lifecycle: open → active → close (dengan opening + closing cash count)
//   - Drawer variance calc: closing_cash - expected_cash (expected = opening + cash_in - cash_out)
//   - Real-time shift summary: revenue, orders, voids, refunds, anomalies per kasir
//   - Staff CRUD dengan PIN per-staff (manager + kasir bisa punya PIN beda)
//   - Auto-log ke pos_events buat audit trail
//
// Endpoints:
//   /api/pos/shifts/*  — shift lifecycle
//   /api/staff/*       — staff CRUD (auto-mounted untuk replace fallback POSKasirLogin)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pos_staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','supervisor','kasir')),
  pin TEXT,
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  last_login INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_staff_role ON pos_staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_active ON pos_staff(is_active);

CREATE TABLE IF NOT EXISTS pos_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  opening_cash REAL NOT NULL DEFAULT 0,
  closing_cash REAL,
  expected_cash REAL,
  cash_variance REAL,
  total_revenue REAL DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_voids INTEGER DEFAULT 0,
  total_refunds REAL DEFAULT 0,
  total_anomalies INTEGER DEFAULT 0,
  notes_open TEXT,
  notes_close TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','voided')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  FOREIGN KEY (staff_id) REFERENCES pos_staff(id)
);
CREATE INDEX IF NOT EXISTS idx_shift_staff ON pos_shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_status ON pos_shifts(status);
CREATE INDEX IF NOT EXISTS idx_shift_opened ON pos_shifts(opened_at);
`;

const DEFAULT_STAFF = [
  { id: 'manager-1', name: 'Manager', role: 'manager', pin: '1234' },
  { id: 'kasir-1', name: 'Kasir 1', role: 'kasir', pin: null },
  { id: 'kasir-2', name: 'Kasir 2', role: 'kasir', pin: null },
];

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function nextShiftDocNo(db) {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const last = db.prepare(`SELECT doc_no FROM pos_shifts WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`SHIFT-${ym}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  return `SHIFT-${ym}-${String(seq).padStart(4, '0')}`;
}

// ============================================================
// SHIFT SUMMARY — aggregate transactions during shift period
// ============================================================
function calcShiftSummary(db, shift) {
  const fromTs = shift.opened_at;
  const toTs = shift.closed_at || nowSec();

  // Revenue from pos_payments by this actor
  let revenue = 0, orders = 0, voids = 0, refunds = 0, cashIn = 0, cashOut = 0;
  try {
    const r = db.prepare(`
      SELECT
        COUNT(DISTINCT order_ref) orders,
        COALESCE(SUM(CASE WHEN status='completed' THEN amount_applied ELSE 0 END), 0) revenue,
        COALESCE(SUM(CASE WHEN status='voided' THEN 1 ELSE 0 END), 0) voids,
        COALESCE(SUM(CASE WHEN status='refunded' THEN refunded_amount ELSE 0 END), 0) refunds,
        COALESCE(SUM(CASE WHEN tender_type='cash' AND status='completed' THEN amount_applied ELSE 0 END), 0) cash_in,
        COALESCE(SUM(CASE WHEN tender_type='cash' AND status='refunded' THEN refunded_amount ELSE 0 END), 0) cash_out
      FROM pos_payments
      WHERE actor = ? AND created_at BETWEEN ? AND ?
    `).get(shift.staff_id, fromTs, toTs);
    revenue = r.revenue || 0;
    orders = r.orders || 0;
    voids = r.voids || 0;
    refunds = r.refunds || 0;
    cashIn = r.cash_in || 0;
    cashOut = r.cash_out || 0;
  } catch {}

  let anomalies = 0;
  try {
    anomalies = db.prepare(`
      SELECT COUNT(*) c FROM pos_events
      WHERE actor = ? AND event_type = 'anomaly_detected' AND created_at BETWEEN ? AND ?
    `).get(shift.staff_id, fromTs, toTs).c;
  } catch {}

  const expectedCash = (shift.opening_cash || 0) + cashIn - cashOut;

  return { revenue, orders, voids, refunds, anomalies, cash_in: cashIn, cash_out: cashOut, expected_cash: expectedCash };
}

// ============================================================
// SETUP
// ============================================================
function setupShiftStaff(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed default staff if empty
  const staffCount = db.prepare(`SELECT COUNT(*) c FROM pos_staff`).get().c;
  if (staffCount === 0) {
    const s = db.prepare(`INSERT INTO pos_staff (id, name, role, pin) VALUES (?,?,?,?)`);
    for (const x of DEFAULT_STAFF) s.run(x.id, x.name, x.role, x.pin);
  }

  // Helper: log pos_events
  const logEvent = (opts) => {
    try {
      db.prepare(`INSERT INTO pos_events (event_type, event_subtype, payload, actor, severity, order_ref, related_event_id, created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(opts.event_type, opts.event_subtype || null,
          opts.payload ? JSON.stringify(opts.payload) : null,
          opts.actor || 'system', opts.severity || 'info',
          opts.order_ref || null, opts.related_event_id || null, nowSec());
    } catch {}
  };

  // ============================================================
  // STAFF CRUD
  // ============================================================
  const staffRouter = express.Router();
  staffRouter.use(express.json());

  staffRouter.get('/', (req, res) => {
    const { active, role } = req.query;
    let sql = `SELECT id, name, role, phone, email, is_active, last_login, created_at FROM pos_staff WHERE 1=1`;
    const params = [];
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    else { sql += ' AND is_active = 1'; }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    sql += ' ORDER BY role, name';
    res.json(db.prepare(sql).all(...params));
  });

  staffRouter.get('/:id', (req, res) => {
    const s = db.prepare(`SELECT id, name, role, phone, email, is_active, last_login, created_at FROM pos_staff WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(s);
  });

  staffRouter.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name || !b.role) return res.status(400).json({ error: 'id, name, role required' });
    if (!['manager','supervisor','kasir'].includes(b.role)) return res.status(400).json({ error: 'invalid role' });
    try {
      db.prepare(`INSERT INTO pos_staff (id, name, role, pin, phone, email) VALUES (?,?,?,?,?,?)`)
        .run(b.id, b.name, b.role, b.pin || null, b.phone || null, b.email || null);
      logEvent({ event_type: 'staff_create', payload: { staff_id: b.id, role: b.role }, actor: b.created_by || 'admin' });
      res.json({ ok: true, id: b.id });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'staff id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  staffRouter.put('/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name','role','phone','email','is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (b.pin !== undefined) { sets.push('pin = ?'); params.push(b.pin || null); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push('updated_at = ?'); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE pos_staff SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  staffRouter.delete('/:id', (req, res) => {
    // Soft delete
    db.prepare(`UPDATE pos_staff SET is_active = 0, updated_at = ? WHERE id = ?`).run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  // Verify PIN — used by POSKasirLogin for manager auth
  staffRouter.post('/verify-pin', (req, res) => {
    const { staff_id, pin } = req.body || {};
    if (!staff_id) return res.status(400).json({ error: 'staff_id required' });
    const s = db.prepare(`SELECT id, name, role, pin FROM pos_staff WHERE id = ? AND is_active = 1`).get(staff_id);
    if (!s) return res.status(404).json({ error: 'staff not found' });

    if (!s.pin) {
      // No PIN set — auto-pass for kasir, require setup for manager
      if (s.role === 'manager') {
        return res.status(409).json({ error: 'Manager belum punya PIN. Set dulu via Admin → Staff.' });
      }
      return res.json({ ok: true, staff: { id: s.id, name: s.name, role: s.role } });
    }

    if (String(s.pin) === String(pin)) {
      db.prepare(`UPDATE pos_staff SET last_login = ? WHERE id = ?`).run(nowSec(), staff_id);
      logEvent({ event_type: 'auth_success', payload: { staff_id }, actor: staff_id });
      res.json({ ok: true, staff: { id: s.id, name: s.name, role: s.role } });
    } else {
      logEvent({ event_type: 'auth_failed', event_subtype: 'wrong_pin', payload: { staff_id }, actor: staff_id, severity: 'warning' });
      res.status(401).json({ ok: false, error: 'PIN salah' });
    }
  });

  app.use('/api/staff', staffRouter);

  // ============================================================
  // SHIFT LIFECYCLE
  // ============================================================
  const shiftRouter = express.Router();
  shiftRouter.use(express.json());

  // List active shifts (for POSKasirLogin to show "Shift aktif" state)
  shiftRouter.get('/active', (req, res) => {
    const shifts = db.prepare(`
      SELECT s.*, st.name AS staff_name_current FROM pos_shifts s
      LEFT JOIN pos_staff st ON st.id = s.staff_id
      WHERE s.status = 'open' ORDER BY s.opened_at DESC
    `).all();
    res.json(shifts.map(s => ({ ...s, summary: calcShiftSummary(db, s) })));
  });

  // List all shifts with filters
  shiftRouter.get('/', (req, res) => {
    const { staff_id, status, from, to, limit = 50 } = req.query;
    let sql = `SELECT s.*, st.name AS staff_name_current FROM pos_shifts s
               LEFT JOIN pos_staff st ON st.id = s.staff_id WHERE 1=1`;
    const params = [];
    if (staff_id) { sql += ' AND s.staff_id = ?'; params.push(staff_id); }
    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    if (from) { sql += ' AND s.opened_at >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND s.opened_at <= ?'; params.push(Number(to)); }
    sql += ' ORDER BY s.opened_at DESC LIMIT ?'; params.push(Number(limit));
    res.json(db.prepare(sql).all(...params));
  });

  shiftRouter.get('/:id', (req, res) => {
    const s = db.prepare(`SELECT * FROM pos_shifts WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    s.summary = calcShiftSummary(db, s);
    res.json(s);
  });

  // Real-time summary (call this from POSConfirm sidebar)
  shiftRouter.get('/:id/summary', (req, res) => {
    const s = db.prepare(`SELECT * FROM pos_shifts WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'not found' });
    res.json(calcShiftSummary(db, s));
  });

  // Open shift
  shiftRouter.post('/open', (req, res) => {
    const { staff_id, opening_cash = 0, notes } = req.body || {};
    if (!staff_id) return res.status(400).json({ error: 'staff_id required' });

    const staff = db.prepare(`SELECT * FROM pos_staff WHERE id = ? AND is_active = 1`).get(staff_id);
    if (!staff) return res.status(404).json({ error: 'staff not found' });

    // Prevent double-open
    const existing = db.prepare(`SELECT id, doc_no FROM pos_shifts WHERE staff_id = ? AND status = 'open'`).get(staff_id);
    if (existing) {
      return res.status(409).json({ error: `${staff.name} sudah punya shift aktif: ${existing.doc_no}`, shift_id: existing.id });
    }

    const docNo = nextShiftDocNo(db);
    try {
      const info = db.prepare(`
        INSERT INTO pos_shifts (doc_no, staff_id, staff_name, opened_at, opening_cash, notes_open, status)
        VALUES (?,?,?,?,?,?,'open')
      `).run(docNo, staff_id, staff.name, nowSec(), Number(opening_cash) || 0, notes || null);

      // Update last_login
      db.prepare(`UPDATE pos_staff SET last_login = ? WHERE id = ?`).run(nowSec(), staff_id);

      logEvent({
        event_type: 'shift_open',
        payload: { shift_id: info.lastInsertRowid, doc_no: docNo, staff_id, staff_name: staff.name, opening_cash, role: staff.role },
        actor: staff_id, severity: 'info'
      });

      res.json({ ok: true, id: info.lastInsertRowid, doc_no: docNo });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Close shift — calc variance + log snapshot
  shiftRouter.post('/:id/close', (req, res) => {
    const { closing_cash, notes, closed_by } = req.body || {};
    if (closing_cash === undefined) return res.status(400).json({ error: 'closing_cash required' });

    const shift = db.prepare(`SELECT * FROM pos_shifts WHERE id = ?`).get(req.params.id);
    if (!shift) return res.status(404).json({ error: 'not found' });
    if (shift.status !== 'open') return res.status(409).json({ error: `shift already ${shift.status}` });

    const summary = calcShiftSummary(db, shift);
    const closingCashNum = Number(closing_cash) || 0;
    const variance = closingCashNum - summary.expected_cash;

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE pos_shifts
        SET closed_at=?, closing_cash=?, expected_cash=?, cash_variance=?,
            total_revenue=?, total_orders=?, total_voids=?, total_refunds=?, total_anomalies=?,
            notes_close=?, status='closed', updated_at=?
        WHERE id=?
      `).run(nowSec(), closingCashNum, summary.expected_cash, variance,
        summary.revenue, summary.orders, summary.voids, summary.refunds, summary.anomalies,
        notes || null, nowSec(), req.params.id);

      logEvent({
        event_type: 'shift_close',
        payload: {
          shift_id: shift.id, doc_no: shift.doc_no,
          duration_min: Math.round((nowSec() - shift.opened_at) / 60),
          summary, closing_cash: closingCashNum, expected_cash: summary.expected_cash, variance
        },
        actor: shift.staff_id,
        severity: Math.abs(variance) > 10000 ? 'warning' : 'info'
      });

      // Anomaly: large variance
      if (Math.abs(variance) > 50000) {
        logEvent({
          event_type: 'anomaly_detected',
          event_subtype: 'shift_variance_large',
          payload: { shift_id: shift.id, variance, expected: summary.expected_cash, actual: closingCashNum },
          actor: closed_by || shift.staff_id,
          severity: 'critical'
        });
      }
    });

    try {
      tx();
      res.json({
        ok: true, shift_id: shift.id,
        summary, closing_cash: closingCashNum, expected_cash: summary.expected_cash, variance,
        variance_status: variance > 0 ? 'over' : variance < 0 ? 'short' : 'balanced'
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Void shift (manager only — requires PIN check upstream)
  shiftRouter.post('/:id/void', (req, res) => {
    const { reason, voided_by } = req.body || {};
    if (!reason || !voided_by) return res.status(400).json({ error: 'reason + voided_by required' });
    const shift = db.prepare(`SELECT * FROM pos_shifts WHERE id = ?`).get(req.params.id);
    if (!shift) return res.status(404).json({ error: 'not found' });
    db.prepare(`UPDATE pos_shifts SET status='voided', notes_close=?, updated_at=? WHERE id=?`)
      .run(`VOIDED: ${reason}`, nowSec(), req.params.id);
    logEvent({
      event_type: 'shift_void', payload: { shift_id: shift.id, reason, voided_by },
      actor: voided_by, severity: 'warning'
    });
    res.json({ ok: true });
  });

  // Today's overview — all shifts today across all kasir
  shiftRouter.get('/today/overview', (req, res) => {
    const todayStart = Math.floor(new Date().setHours(0,0,0,0)/1000);
    const shifts = db.prepare(`SELECT * FROM pos_shifts WHERE opened_at >= ? ORDER BY opened_at DESC`).all(todayStart);
    const enriched = shifts.map(s => ({ ...s, summary: s.status === 'open' ? calcShiftSummary(db, s) : null }));
    const totals = enriched.reduce((acc, s) => {
      const sum = s.status === 'open' ? s.summary : { revenue: s.total_revenue || 0, orders: s.total_orders || 0 };
      acc.revenue += sum.revenue || 0;
      acc.orders += sum.orders || 0;
      acc.active_count += s.status === 'open' ? 1 : 0;
      return acc;
    }, { revenue: 0, orders: 0, active_count: 0, total_shifts: shifts.length });
    res.json({ totals, shifts: enriched });
  });

  app.use('/api/pos/shifts', shiftRouter);

  console.log(`[shift-staff] mounted at /api/staff + /api/pos/shifts`);

  return {
    staffRouter, shiftRouter, db,
    calcShiftSummary: (shift) => calcShiftSummary(db, shift),
  };
}

module.exports = { setupShiftStaff, SCHEMA_SQL };
