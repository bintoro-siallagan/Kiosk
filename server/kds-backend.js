// server/kds-backend.js
// Kitchen Display System — Toast Flow pillar.
//
// Fitur:
//   - Kitchen tickets dengan status: queued → preparing → ready → served
//   - Multi-station routing (BAR/HOT/COLD/DESSERT/TAKEAWAY)
//   - Auto-create ticket dari payment success (consume order items, split per station)
//   - Color-coded SLA timing (target prep time per station)
//   - 86 management (mark item temporarily out-of-stock, hide dari POS)
//   - WebSocket broadcast kds:* events buat real-time UI update
//
// Endpoints (semua di /api/kds/*):
//   POST   /tickets           — create ticket(s) from order items (auto-split per station)
//   GET    /tickets           — list active tickets (?station=&status=&limit=)
//   PUT    /tickets/:id/start  — mark preparing
//   PUT    /tickets/:id/ready  — mark ready (broadcast notify customer pickup)
//   PUT    /tickets/:id/served — mark served (closes ticket)
//   PUT    /tickets/:id/recall — undo last status (kalau salah tap)
//   GET    /tickets/:id        — single ticket
//   GET    /tickets/stats      — today's KDS metrics (avg prep time, total served, etc.)
//
//   GET    /stations           — list stations
//   POST   /stations           — create station
//   PUT    /stations/:id       — update station
//
//   GET    /86                 — list 86'd items
//   POST   /86                 — mark item out-of-stock (returns to availability)
//   DELETE /86/:id             — restore item (un-86)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kds_stations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  category_filter TEXT,
  target_prep_seconds INTEGER DEFAULT 300,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS kds_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT UNIQUE NOT NULL,
  order_ref TEXT NOT NULL,
  station_id TEXT NOT NULL,
  items TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','preparing','ready','served','voided')),
  priority INTEGER DEFAULT 0,
  customer_name TEXT,
  table_no TEXT,
  notes TEXT,
  cashier TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  started_at INTEGER,
  ready_at INTEGER,
  served_at INTEGER,
  voided_at INTEGER,
  prep_seconds INTEGER,
  FOREIGN KEY (station_id) REFERENCES kds_stations(id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_status ON kds_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_station ON kds_tickets(station_id);
CREATE INDEX IF NOT EXISTS idx_ticket_order ON kds_tickets(order_ref);
CREATE INDEX IF NOT EXISTS idx_ticket_created ON kds_tickets(created_at);

CREATE TABLE IF NOT EXISTS kds_86 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id TEXT,
  sku TEXT,
  reason TEXT,
  marked_by TEXT,
  marked_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  restored_at INTEGER,
  restored_by TEXT,
  is_active INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_86_active ON kds_86(is_active);
CREATE INDEX IF NOT EXISTS idx_86_menu ON kds_86(menu_id);
`;

const DEFAULT_STATIONS = [
  { id: 'beverage', name: 'Beverage', color: '#3b82f6', category_filter: 'smoothies,froyo,yogulato', target_prep_seconds: 180, sort_order: 1 },
  { id: 'takehome', name: 'Takehome / Packaging', color: '#a855f7', category_filter: 'takehome,collab', target_prep_seconds: 240, sort_order: 2 },
  { id: 'default', name: 'General', color: '#6b7280', category_filter: null, target_prep_seconds: 300, sort_order: 99 },
];

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function nextTicketDocNo(db) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const last = db.prepare(`SELECT doc_no FROM kds_tickets WHERE doc_no LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`KDS-${today}-%`);
  let seq = 1;
  if (last) seq = parseInt(last.doc_no.split('-').pop(), 10) + 1;
  return `KDS-${today}-${String(seq).padStart(4, '0')}`;
}

// Determine which station an item belongs to based on category
function routeItemToStation(db, item) {
  // Try to look up menu category from existing pos_menus or master items
  let category = item.category;
  if (!category && item.menu_id) {
    try {
      const m = db.prepare(`SELECT category_id FROM pos_menus WHERE id = ?`).get(item.menu_id);
      if (m) category = m.category_id;
    } catch {}
  }
  if (!category) return 'default';

  const stations = db.prepare(`SELECT id, category_filter FROM kds_stations WHERE is_active = 1 ORDER BY sort_order`).all();
  for (const s of stations) {
    if (!s.category_filter) continue;
    const cats = s.category_filter.split(',').map(c => c.trim().toLowerCase());
    if (cats.includes(category.toLowerCase())) return s.id;
  }
  return 'default';
}

// ============================================================
// SETUP
// ============================================================
function setupKDS(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed default stations
  const cnt = db.prepare(`SELECT COUNT(*) c FROM kds_stations`).get().c;
  if (cnt === 0) {
    const s = db.prepare(`INSERT INTO kds_stations (id, name, color, category_filter, target_prep_seconds, sort_order) VALUES (?,?,?,?,?,?)`);
    for (const x of DEFAULT_STATIONS) s.run(x.id, x.name, x.color, x.category_filter, x.target_prep_seconds, x.sort_order);
  }

  const broadcast = (event, payload) => {
    try {
      if (typeof global.broadcastPosEvent === 'function') {
        global.broadcastPosEvent(event, payload);
      }
    } catch {}
  };

  const logEvent = (e) => {
    try {
      if (typeof global.logPosEvent === 'function') {
        global.logPosEvent({
          event_type: e.type, event_subtype: e.subtype || null,
          payload: e.payload, order_ref: e.order_ref, actor: e.actor || 'kds',
          severity: e.severity || 'info'
        });
      }
    } catch {}
  };

  // ============================================================
  // INTERNAL: createTicketsForOrder — call this from POS payment success
  // ============================================================
  function createTicketsForOrder(orderData) {
    const { order_ref, items, customer_name, table_no, cashier, notes } = orderData;
    if (!order_ref || !Array.isArray(items) || items.length === 0) {
      return { ok: false, error: 'order_ref and items required' };
    }

    // Group items by station
    const groupedByStation = {};
    for (const item of items) {
      const stationId = routeItemToStation(db, item);
      if (!groupedByStation[stationId]) groupedByStation[stationId] = [];
      groupedByStation[stationId].push(item);
    }

    const createdTickets = [];
    const tx = db.transaction(() => {
      for (const [stationId, stationItems] of Object.entries(groupedByStation)) {
        const docNo = nextTicketDocNo(db);
        const info = db.prepare(`
          INSERT INTO kds_tickets (doc_no, order_ref, station_id, items, status, customer_name, table_no, cashier, notes)
          VALUES (?,?,?,?, 'queued', ?,?,?,?)
        `).run(docNo, order_ref, stationId, JSON.stringify(stationItems),
               customer_name || null, table_no || null, cashier || null, notes || null);

        createdTickets.push({ id: info.lastInsertRowid, doc_no: docNo, station_id: stationId, items: stationItems });
      }
    });
    tx();

    for (const t of createdTickets) {
      broadcast('kds:ticket-created', { ticket: t, order_ref });
      logEvent({ type: 'kds_ticket_created', payload: { ticket_id: t.id, station: t.station_id, order_ref }, order_ref, actor: cashier });
    }

    return { ok: true, tickets: createdTickets };
  }

  // ============================================================
  // ROUTER
  // ============================================================
  const router = express.Router();
  router.use(express.json());

  // ========== STATIONS ==========
  router.get('/stations', (req, res) => {
    res.json(db.prepare(`SELECT * FROM kds_stations WHERE is_active = 1 ORDER BY sort_order`).all());
  });

  router.post('/stations', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name) return res.status(400).json({ error: 'id + name required' });
    try {
      db.prepare(`INSERT INTO kds_stations (id, name, color, category_filter, target_prep_seconds, sort_order) VALUES (?,?,?,?,?,?)`)
        .run(b.id, b.name, b.color || '#3b82f6', b.category_filter || null, b.target_prep_seconds || 300, b.sort_order || 0);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/stations/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name', 'color', 'category_filter', 'target_prep_seconds', 'sort_order', 'is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE kds_stations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ========== TICKETS ==========
  router.get('/tickets', (req, res) => {
    const { station, status, order_ref, from, limit = 100 } = req.query;
    let sql = `SELECT * FROM kds_tickets WHERE 1=1`;
    const params = [];
    if (station) { sql += ' AND station_id = ?'; params.push(station); }
    if (status) {
      const statuses = status.split(',');
      sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    } else {
      sql += ` AND status IN ('queued','preparing','ready')`;
    }
    if (order_ref) { sql += ' AND order_ref = ?'; params.push(order_ref); }
    if (from) { sql += ' AND created_at >= ?'; params.push(Number(from)); }
    sql += ' ORDER BY priority DESC, created_at ASC LIMIT ?';
    params.push(Number(limit));
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(r => ({ ...r, items: safeJson(r.items) || [] })));
  });

  router.get('/tickets/stats', (req, res) => {
    const todayStart = Math.floor(new Date().setHours(0,0,0,0)/1000);
    const completed = db.prepare(`
      SELECT
        COUNT(*) total,
        AVG(prep_seconds) avg_prep,
        MIN(prep_seconds) min_prep,
        MAX(prep_seconds) max_prep
      FROM kds_tickets WHERE status='served' AND served_at >= ?
    `).get(todayStart);

    const byStation = db.prepare(`
      SELECT station_id, COUNT(*) c, AVG(prep_seconds) avg_prep
      FROM kds_tickets WHERE status='served' AND served_at >= ?
      GROUP BY station_id
    `).all(todayStart);

    const active = db.prepare(`
      SELECT
        SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,
        SUM(CASE WHEN status='preparing' THEN 1 ELSE 0 END) preparing,
        SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) ready
      FROM kds_tickets WHERE status IN ('queued','preparing','ready')
    `).get();

    res.json({ completed_today: completed, active_now: active, by_station: byStation });
  });

  router.get('/tickets/:id', (req, res) => {
    const t = db.prepare(`SELECT * FROM kds_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    t.items = safeJson(t.items) || [];
    res.json(t);
  });

  // Manual ticket create (rare — biasanya auto dari POS)
  router.post('/tickets', (req, res) => {
    const result = createTicketsForOrder(req.body || {});
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  // Status transitions
  router.put('/tickets/:id/start', (req, res) => {
    const { actor } = req.body || {};
    const t = db.prepare(`SELECT * FROM kds_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (t.status !== 'queued') return res.status(409).json({ error: `cannot start from status: ${t.status}` });

    db.prepare(`UPDATE kds_tickets SET status='preparing', started_at=? WHERE id=?`).run(nowSec(), req.params.id);
    broadcast('kds:ticket-updated', { ticket_id: t.id, status: 'preparing', station_id: t.station_id });
    logEvent({ type: 'kds_ticket_start', payload: { ticket_id: t.id, order_ref: t.order_ref }, order_ref: t.order_ref, actor });
    res.json({ ok: true });
  });

  router.put('/tickets/:id/ready', (req, res) => {
    const { actor } = req.body || {};
    const t = db.prepare(`SELECT * FROM kds_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (!['queued', 'preparing'].includes(t.status)) return res.status(409).json({ error: `cannot mark ready from: ${t.status}` });

    const now = nowSec();
    const prepSec = t.started_at ? now - t.started_at : now - t.created_at;
    db.prepare(`UPDATE kds_tickets SET status='ready', ready_at=?, prep_seconds=? WHERE id=?`)
      .run(now, prepSec, req.params.id);

    broadcast('kds:ticket-ready', { ticket_id: t.id, order_ref: t.order_ref, station_id: t.station_id, customer_name: t.customer_name, table_no: t.table_no, prep_seconds: prepSec });
    logEvent({ type: 'kds_ticket_ready', payload: { ticket_id: t.id, prep_sec: prepSec }, order_ref: t.order_ref, actor });
    res.json({ ok: true, prep_seconds: prepSec });
  });

  router.put('/tickets/:id/served', (req, res) => {
    const { actor } = req.body || {};
    const t = db.prepare(`SELECT * FROM kds_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    if (t.status !== 'ready') return res.status(409).json({ error: `cannot mark served from: ${t.status}` });

    db.prepare(`UPDATE kds_tickets SET status='served', served_at=? WHERE id=?`).run(nowSec(), req.params.id);
    broadcast('kds:ticket-served', { ticket_id: t.id, order_ref: t.order_ref, station_id: t.station_id });
    logEvent({ type: 'kds_ticket_served', payload: { ticket_id: t.id }, order_ref: t.order_ref, actor });
    res.json({ ok: true });
  });

  router.put('/tickets/:id/recall', (req, res) => {
    const { actor } = req.body || {};
    const t = db.prepare(`SELECT * FROM kds_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });

    const transitions = { preparing: 'queued', ready: 'preparing', served: 'ready' };
    const prevStatus = transitions[t.status];
    if (!prevStatus) return res.status(409).json({ error: `cannot recall from: ${t.status}` });

    const updates = { status: prevStatus };
    if (t.status === 'preparing') updates.started_at = null;
    if (t.status === 'ready') { updates.ready_at = null; updates.prep_seconds = null; }
    if (t.status === 'served') updates.served_at = null;

    const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const params = [...Object.values(updates), req.params.id];
    db.prepare(`UPDATE kds_tickets SET ${sets} WHERE id = ?`).run(...params);

    broadcast('kds:ticket-updated', { ticket_id: t.id, status: prevStatus, recalled: true });
    logEvent({ type: 'kds_ticket_recall', payload: { ticket_id: t.id, from: t.status, to: prevStatus }, order_ref: t.order_ref, actor, severity: 'warning' });
    res.json({ ok: true, status: prevStatus });
  });

  router.put('/tickets/:id/void', (req, res) => {
    const { actor, reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'reason required' });
    const t = db.prepare(`SELECT * FROM kds_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });

    db.prepare(`UPDATE kds_tickets SET status='voided', voided_at=?, notes=? WHERE id=?`)
      .run(nowSec(), `VOIDED: ${reason}`, req.params.id);
    broadcast('kds:ticket-voided', { ticket_id: t.id, order_ref: t.order_ref });
    logEvent({ type: 'kds_ticket_void', payload: { ticket_id: t.id, reason }, order_ref: t.order_ref, actor, severity: 'warning' });
    res.json({ ok: true });
  });

  // ========== 86 MANAGEMENT ==========
  router.get('/86', (req, res) => {
    const rows = db.prepare(`SELECT * FROM kds_86 WHERE is_active = 1 ORDER BY marked_at DESC`).all();
    res.json(rows);
  });

  router.post('/86', (req, res) => {
    const { menu_id, sku, reason, marked_by } = req.body || {};
    if (!menu_id && !sku) return res.status(400).json({ error: 'menu_id or sku required' });
    const info = db.prepare(`INSERT INTO kds_86 (menu_id, sku, reason, marked_by) VALUES (?,?,?,?)`)
      .run(menu_id || null, sku || null, reason || null, marked_by || null);

    // Also update pos_menus.is_available if menu_id provided
    if (menu_id) {
      try { db.prepare(`UPDATE pos_menus SET is_available = 0 WHERE id = ?`).run(menu_id); } catch {}
    }

    broadcast('kds:item-86', { menu_id, sku, reason });
    logEvent({ type: 'kds_item_86', payload: { menu_id, sku, reason }, actor: marked_by, severity: 'warning' });
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.delete('/86/:id', (req, res) => {
    const { restored_by } = req.body || {};
    const r = db.prepare(`SELECT * FROM kds_86 WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'not found' });

    db.prepare(`UPDATE kds_86 SET is_active=0, restored_at=?, restored_by=? WHERE id=?`)
      .run(nowSec(), restored_by || null, req.params.id);

    if (r.menu_id) {
      try { db.prepare(`UPDATE pos_menus SET is_available = 1 WHERE id = ?`).run(r.menu_id); } catch {}
    }

    broadcast('kds:item-restored', { menu_id: r.menu_id, sku: r.sku });
    logEvent({ type: 'kds_item_restored', payload: { menu_id: r.menu_id, sku: r.sku }, actor: restored_by });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/kds';
  app.use(mountPath, router);

  console.log(`[kds] mounted at ${mountPath}`);

  return {
    router, db,
    createTicketsForOrder,
    routeItemToStation: (item) => routeItemToStation(db, item),
  };
}

module.exports = { setupKDS, SCHEMA_SQL };
