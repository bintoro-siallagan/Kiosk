// server/pos-behavior-backend.js
// Tracking perilaku kasir di POS — deteksi "main-main tombol":
// item/topping di-input lalu dihapus lagi sebelum bayar.
// Banyak hapus = indikator kasir gak fokus → muncul di Command Center.
//
// Endpoints di /api/pos-behavior/*:
//   POST /          — log 1 event { cashier, action, detail, order_ref }
//   GET  /summary   — ringkasan per kasir (buat Command Center)
//   GET  /          — event terbaru (detail)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pos_behavior_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cashier TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  order_ref TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_posbeh_created ON pos_behavior_events(created_at);
CREATE INDEX IF NOT EXISTS idx_posbeh_cashier ON pos_behavior_events(cashier);
`;

// > threshold event hapus per kasir per hari = di-flag "main-main / gak fokus"
const FLAG_THRESHOLD = 15;

function setupPosBehavior(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  // Log 1 event perilaku
  router.post('/', (req, res) => {
    const { cashier, action, detail, order_ref } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action wajib' });
    db.prepare(`INSERT INTO pos_behavior_events (cashier, action, detail, order_ref) VALUES (?,?,?,?)`)
      .run(cashier || null, action, detail || null, order_ref || null);
    try {
      if (typeof global.logPosEvent === 'function') global.logPosEvent({
        event_type: 'pos_behavior', event_subtype: action,
        payload: { cashier, detail }, order_ref: order_ref || null, actor: cashier, severity: 'info',
      });
    } catch {}
    res.json({ ok: true });
  });

  // Ringkasan per kasir hari ini — buat Command Center
  router.get('/summary', (req, res) => {
    const from = Number(req.query.from || Math.floor(new Date().setHours(0, 0, 0, 0) / 1000));
    const byCashier = db.prepare(`
      SELECT cashier,
        COUNT(*) total,
        SUM(CASE WHEN action='remove_item' THEN 1 ELSE 0 END) remove_item,
        SUM(CASE WHEN action='remove_topping' THEN 1 ELSE 0 END) remove_topping
      FROM pos_behavior_events
      WHERE created_at >= ? AND cashier IS NOT NULL AND cashier != ''
      GROUP BY cashier
      ORDER BY total DESC
    `).all(from);
    res.json({
      from,
      threshold: FLAG_THRESHOLD,
      cashiers: byCashier.map(c => ({ ...c, flagged: c.total >= FLAG_THRESHOLD })),
      total_events: byCashier.reduce((s, c) => s + c.total, 0),
      flagged_count: byCashier.filter(c => c.total >= FLAG_THRESHOLD).length,
    });
  });

  // Event terbaru (detail / audit)
  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(db.prepare(`SELECT * FROM pos_behavior_events ORDER BY created_at DESC LIMIT ?`).all(limit));
  });

  const mountPath = opts.mountPath || '/api/pos-behavior';
  app.use(mountPath, router);
  console.log(`[pos-behavior] mounted at ${mountPath} — tracking perilaku kasir`);

  return { router, db };
}

module.exports = { setupPosBehavior };
