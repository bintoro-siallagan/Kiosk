// server/batch-tracking-backend.js
// Batch & Expiry Tracking — lacak stok per batch + tanggal kedaluwarsa,
// urutan FEFO (First Expired First Out), alert mendekati expired.
//
//   GET  /api/batch-tracking            — batch (urut FEFO) + alert + summary
//   POST /api/batch-tracking            — tambah batch
//   POST /api/batch-tracking/:id/discard — buang batch (expired/rusak)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stock_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, batch_no TEXT, sku TEXT, item_name TEXT,
  qty REAL, unit TEXT, location TEXT, received_at INTEGER, expiry_at INTEGER,
  discarded INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);

function setupBatchTracking(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM stock_batches`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO stock_batches
      (batch_no, sku, item_name, qty, unit, location, received_at, expiry_at) VALUES (?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    const no = () => `BT-${String(i++).padStart(4, '0')}`;
    // [sku, name, qty, unit, expiryDays, recvDaysAgo]
    [
      ['RM01', 'Yogurt Base Plain', 25, 'kg', 3, 10], ['RM01', 'Yogurt Base Plain', 30, 'kg', 18, 2],
      ['RM03', 'Susu Skim UHT', 15, 'liter', -1, 14], ['RM05', 'Buah Strawberry', 8, 'kg', 2, 4],
      ['RM06', 'Buah Mango', 10, 'kg', 5, 3], ['RM02', 'Yogurt Base Charcoal', 12, 'kg', 25, 5],
      ['TP01', 'Granola', 5, 'kg', 60, 8], ['RM07', 'Matcha Powder', 3, 'kg', -3, 30],
      ['RM04', 'Gula Cair', 20, 'liter', 90, 6], ['RM05', 'Buah Strawberry', 6, 'kg', 1, 1],
    ].forEach(([sku, name, qty, unit, ed, rd]) => ins.run(no(), sku, name, qty, unit, 'Gudang Pusat', N - rd * DAY, N + ed * DAY));
  }

  const statusOf = (expiry) => {
    const days = Math.floor((expiry - nowSec()) / DAY);
    if (days < 0) return { status: 'expired', color: '#ef4444', days };
    if (days <= 7) return { status: 'expiring', color: '#f59e0b', days };
    return { status: 'fresh', color: '#10b981', days };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const batches = db.prepare(`SELECT * FROM stock_batches WHERE discarded = 0 ORDER BY expiry_at ASC`).all()
      .map(b => { const st = statusOf(b.expiry_at); return { ...b, ...st }; });
    res.json({
      batches,
      summary: {
        total: batches.length,
        expiring: batches.filter(b => b.status === 'expiring').length,
        expired: batches.filter(b => b.status === 'expired').length,
        fresh: batches.filter(b => b.status === 'fresh').length,
      },
      alerts: batches.filter(b => b.status !== 'fresh'),
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.sku || !b.item_name || !(Number(b.qty) > 0)) return res.status(400).json({ error: 'sku, nama & qty wajib' });
    const exp = Number(b.expiry_days);
    if (isNaN(exp)) return res.status(400).json({ error: 'masa simpan (hari) wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM stock_batches`).get().c;
    db.prepare(`INSERT INTO stock_batches (batch_no, sku, item_name, qty, unit, location, received_at, expiry_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(`BT-${String(n + 1).padStart(4, '0')}`, b.sku, String(b.item_name).trim(),
      Number(b.qty), b.unit || 'kg', b.location || 'Gudang Pusat', nowSec(), nowSec() + exp * DAY);
    res.json({ ok: true });
  });

  router.post('/:id/discard', (req, res) => {
    const r = db.prepare(`SELECT * FROM stock_batches WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'batch tidak ditemukan' });
    db.prepare(`UPDATE stock_batches SET discarded = 1 WHERE id = ?`).run(r.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM stock_batches WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['batch_no', 'sku', 'item_name', 'qty', 'unit', 'location', 'received_at', 'expiry_at']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE stock_batches SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/batch-tracking';
  app.use(mountPath, router);
  console.log(`[batch-tracking] mounted at ${mountPath} — batch & expiry (FEFO)`);

  return { router, db };
}

module.exports = { setupBatchTracking };
