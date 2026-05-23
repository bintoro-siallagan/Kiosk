// server/delivery-order-backend.js
// Delivery Order (Surat Jalan) — pengiriman barang ke customer B2B
// atas Sales Order. Flow: draft → shipped → delivered.
//
//   GET  /api/delivery-order             — daftar DO + summary
//   POST /api/delivery-order             — buat DO
//   POST /api/delivery-order/:id/advance — naikkan status

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS delivery_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, do_no TEXT, so_ref TEXT, customer_name TEXT,
  destination TEXT, items TEXT, driver TEXT, status TEXT DEFAULT 'draft',
  shipped_at INTEGER, delivered_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const FLOW = ['draft', 'shipped', 'delivered'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupDeliveryOrder(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `DO-S-202605-${String(db.prepare(`SELECT COUNT(*) c FROM delivery_orders`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM delivery_orders`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO delivery_orders (do_no, so_ref, customer_name, destination, items, driver, status, shipped_at, delivered_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    // [so, cust, dest, items[[name,qty,unit]], driver, status, daysAgo]
    [
      ['SO-202605-003', 'PT Catering Berkah', 'Gudang PT Catering, Bekasi', [['Froyo Cup Mix', 500, 'cup']], 'Pak Joko', 'delivered', 10],
      ['SO-202605-001', 'PT Sukses Makmur', 'Kantor Pusat, Jakarta', [['Original Froyo', 200, 'cup'], ['Chocolate Froyo', 150, 'cup']], 'Pak Anton', 'shipped', 2],
      ['SO-202605-005', 'PT Mitra Pangan Sejahtera', 'Gudang Mitra Pangan, Tangerang', [['Granola Topping', 40, 'kg']], 'Pak Rudi', 'draft', 0],
    ].forEach(([so, cn, dest, items, drv, st, d]) => {
      ins.run(genNo(), so, cn, dest, JSON.stringify(items.map(([name, qty, unit]) => ({ name, qty, unit }))), drv, st,
        ['shipped', 'delivered'].includes(st) ? N - d * 86400 : null,
        st === 'delivered' ? N - (d - 1) * 86400 : null, N - d * 86400);
    });
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM delivery_orders ORDER BY created_at DESC`).all().map(r => ({ ...r, items: J(r.items) }));
    res.json({
      orders: rows,
      summary: {
        total: rows.length,
        draft: rows.filter(r => r.status === 'draft').length,
        shipped: rows.filter(r => r.status === 'shipped').length,
        delivered: rows.filter(r => r.status === 'delivered').length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.name && Number(i.qty) > 0);
    if (!b.customer_name || !items.length) return res.status(400).json({ error: 'customer & minimal 1 item wajib' });
    db.prepare(`INSERT INTO delivery_orders (do_no, so_ref, customer_name, destination, items, driver, status) VALUES (?,?,?,?,?,?, 'draft')`)
      .run(genNo(), (b.so_ref || '-').trim(), String(b.customer_name).trim(), (b.destination || '-').trim(),
        JSON.stringify(items.map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit || 'pcs' }))), (b.driver || '-').trim());
    res.json({ ok: true });
  });

  router.post('/:id/advance', (req, res) => {
    const o = db.prepare(`SELECT * FROM delivery_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'DO tidak ditemukan' });
    const idx = FLOW.indexOf(o.status);
    if (idx < 0 || idx >= FLOW.length - 1) return res.status(409).json({ error: 'status sudah final' });
    const next = FLOW[idx + 1];
    db.prepare(`UPDATE delivery_orders SET status=?, shipped_at=?, delivered_at=? WHERE id=?`).run(
      next, next === 'shipped' ? nowSec() : o.shipped_at, next === 'delivered' ? nowSec() : o.delivered_at, o.id);
    res.json({ ok: true, status: next });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM delivery_orders WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['do_no', 'so_ref', 'customer_name', 'destination', 'items', 'driver', 'status', 'shipped_at', 'delivered_at']) {
      if (b[k] !== undefined) {
        let v = b[k];
        if (k === 'items' && Array.isArray(v)) v = JSON.stringify(v);
        fields.push(`${k} = ?`); args.push(v);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE delivery_orders SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM delivery_orders WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/delivery-order';
  app.use(mountPath, router);
  console.log(`[delivery-order] mounted at ${mountPath} — B2B delivery order (surat jalan)`);

  return { router, db };
}

module.exports = { setupDeliveryOrder };
