// server/production-backend.js
// Production / Central Kitchen — production order: produksi semi-
// finished / finished goods, konsumsi bahan baku dari gudang.
//
//   GET  /api/production              — production order + summary
//   POST /api/production              — buat production order
//   POST /api/production/:id/start    — mulai produksi
//   POST /api/production/:id/complete — selesai → konsumsi bahan baku

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS production_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT, product_name TEXT,
  output_qty REAL, output_unit TEXT, status TEXT DEFAULT 'planned', materials TEXT,
  produced_by TEXT, completed_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupProduction(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `PRD-202605-${String(db.prepare(`SELECT COUNT(*) c FROM production_orders`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM production_orders`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO production_orders
      (order_no, product_name, output_qty, output_unit, status, materials, produced_by, completed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [product, outQty, outUnit, status, materials[[sku,name,qty,unit]], compDaysAgo]
    [
      ['Yogurt Base Mix', 50, 'kg', 'planned', [['RM01', 'Yogurt Base Plain', 30, 'kg'], ['RM03', 'Susu Skim UHT', 12, 'liter']], null],
      ['House Signature Sauce', 15, 'kg', 'in_progress', [['RM05', 'Buah Strawberry', 6, 'kg'], ['RM06', 'Buah Mango', 4, 'kg']], null],
      ['Premium Granola Mix', 12, 'kg', 'planned', [['TP01', 'Granola', 8, 'kg']], null],
      ['Waffle Cone Dough', 25, 'kg', 'completed', [['RM01', 'Yogurt Base Plain', 10, 'kg']], 4],
    ].forEach(([pn, q, u, st, mats, cd]) => ins.run(genNo(), pn, q, u, st,
      JSON.stringify(mats.map(([sku, name, qty, unit]) => ({ sku, name, qty, unit }))),
      st === 'planned' ? null : 'Central Kitchen', cd != null ? N - cd * 86400 : null, N - (i++) * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const orders = db.prepare(`SELECT * FROM production_orders ORDER BY created_at DESC`).all()
      .map(o => ({ ...o, materials: J(o.materials) }));
    res.json({
      orders,
      summary: {
        total: orders.length,
        planned: orders.filter(o => o.status === 'planned').length,
        in_progress: orders.filter(o => o.status === 'in_progress').length,
        completed: orders.filter(o => o.status === 'completed').length,
        output_completed: orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.output_qty, 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.product_name || !(Number(b.output_qty) > 0)) return res.status(400).json({ error: 'produk & qty output wajib' });
    const r = db.prepare(`INSERT INTO production_orders (order_no, product_name, output_qty, output_unit, status, materials) VALUES (?,?,?,?, 'planned', ?)`)
      .run(genNo(), String(b.product_name).trim(), Number(b.output_qty), b.output_unit || 'kg',
        JSON.stringify(Array.isArray(b.materials) ? b.materials : []));
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.post('/:id/start', (req, res) => {
    const o = db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'production order tidak ditemukan' });
    if (o.status !== 'planned') return res.status(409).json({ error: 'order tidak bisa dimulai' });
    db.prepare(`UPDATE production_orders SET status='in_progress', produced_by=? WHERE id=?`)
      .run((req.body || {}).by || 'Central Kitchen', o.id);
    res.json({ ok: true });
  });

  router.post('/:id/complete', (req, res) => {
    const o = db.prepare(`SELECT * FROM production_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'production order tidak ditemukan' });
    if (o.status === 'completed') return res.status(409).json({ error: 'order sudah selesai' });
    let consumed = 0;
    db.transaction(() => {
      const upd = db.prepare(`UPDATE audit_warehouse SET stock = stock - ?, updated_at = ? WHERE id = ?`);
      for (const m of J(o.materials)) { try { if (upd.run(m.qty, nowSec(), m.sku).changes > 0) consumed++; } catch { /* noop */ } }
      db.prepare(`UPDATE production_orders SET status='completed', completed_at=?, produced_by=? WHERE id=?`)
        .run(nowSec(), o.produced_by || 'Central Kitchen', o.id);
    })();
    res.json({ ok: true, materials_consumed: consumed });
  });

  const mountPath = opts.mountPath || '/api/production';
  app.use(mountPath, router);
  console.log(`[production] mounted at ${mountPath} — central kitchen production orders`);

  return { router, db };
}

module.exports = { setupProduction };
