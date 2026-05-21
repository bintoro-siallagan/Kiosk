// server/goods-delivery-backend.js
// Good Delivery → Good Received.
// Warehouse kirim barang ke outlet tujuan (GD), outlet konfirmasi terima
// (GR) → stok nambah + expired date barang dicatat.
//
//   GET  /api/goods-delivery            — daftar GD (?status=in_transit|received)
//   GET  /api/goods-delivery/:id        — detail
//   POST /api/goods-delivery            — warehouse kirim (buat GD)
//   POST /api/goods-delivery/:id/receive — outlet terima → stok naik

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS goods_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gd_number TEXT UNIQUE NOT NULL,
  po_ref TEXT,
  to_outlet TEXT NOT NULL,
  status TEXT DEFAULT 'in_transit',
  shipped_by TEXT,
  shipped_at INTEGER,
  received_by TEXT,
  received_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS gd_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gd_id INTEGER NOT NULL,
  sku TEXT,
  item_name TEXT NOT NULL,
  unit TEXT,
  qty_delivered REAL NOT NULL,
  qty_received REAL DEFAULT 0,
  expired_date INTEGER,
  FOREIGN KEY (gd_id) REFERENCES goods_deliveries(id) ON DELETE CASCADE
);
`;

const nowSec = () => Math.floor(Date.now() / 1000);
const genGdNumber = (db) => {
  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const n = db.prepare(`SELECT COUNT(*) c FROM goods_deliveries WHERE gd_number LIKE ?`).get(`GD-${ym}-%`).c;
  return `GD-${ym}-${String(n + 1).padStart(4, '0')}`;
};

function setupGoodsDelivery(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  const withItems = (gd) => ({ ...gd, items: db.prepare(`SELECT * FROM gd_items WHERE gd_id=?`).all(gd.id) });

  router.get('/', (req, res) => {
    let q = `SELECT * FROM goods_deliveries`;
    const p = [];
    if (req.query.status) { q += ` WHERE status=?`; p.push(req.query.status); }
    q += ` ORDER BY created_at DESC LIMIT 60`;
    res.json(db.prepare(q).all(...p).map(withItems));
  });

  router.get('/:id', (req, res) => {
    const gd = db.prepare(`SELECT * FROM goods_deliveries WHERE id=?`).get(req.params.id);
    if (!gd) return res.status(404).json({ error: 'GD tidak ditemukan' });
    res.json(withItems(gd));
  });

  // Warehouse kirim barang → buat Good Delivery (in_transit)
  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.to_outlet) return res.status(400).json({ error: 'outlet tujuan wajib' });
    const items = (Array.isArray(b.items) ? b.items : []).filter(x => x.item_name && Number(x.qty) > 0);
    if (!items.length) return res.status(400).json({ error: 'minimal 1 item dengan qty > 0' });

    const tx = db.transaction(() => {
      const gd_number = genGdNumber(db);
      const info = db.prepare(`INSERT INTO goods_deliveries
        (gd_number, po_ref, to_outlet, status, shipped_by, shipped_at, notes)
        VALUES (?,?,?,?,?,?,?)`).run(gd_number, (b.po_ref || '').trim(), b.to_outlet,
        'in_transit', b.shipped_by || 'Warehouse', nowSec(), (b.notes || '').trim());
      const gdId = info.lastInsertRowid;
      const it = db.prepare(`INSERT INTO gd_items (gd_id, sku, item_name, unit, qty_delivered) VALUES (?,?,?,?,?)`);
      for (const x of items) it.run(gdId, x.sku || '', x.item_name, x.unit || '', Number(x.qty));
      return { id: gdId, gd_number };
    });
    res.json({ ok: true, ...tx() });
  });

  // Outlet konfirmasi terima → stok naik + expired date dicatat
  router.post('/:id/receive', (req, res) => {
    const gd = db.prepare(`SELECT * FROM goods_deliveries WHERE id=?`).get(req.params.id);
    if (!gd) return res.status(404).json({ error: 'GD tidak ditemukan' });
    if (gd.status === 'received') return res.status(409).json({ error: 'barang sudah diterima' });

    const b = req.body || {};
    const recv = {};
    (b.items || []).forEach(x => { recv[x.id] = { qty: x.qty_received, exp: x.expired_date }; });

    const tx = db.transaction(() => {
      const items = db.prepare(`SELECT * FROM gd_items WHERE gd_id=?`).all(gd.id);
      for (const it of items) {
        const r = recv[it.id] || {};
        const qr = r.qty != null && r.qty !== '' ? Number(r.qty) : it.qty_delivered;
        db.prepare(`UPDATE gd_items SET qty_received=?, expired_date=? WHERE id=?`).run(qr, r.exp || null, it.id);
        // post stok ke warehouse
        if (it.sku && qr > 0) {
          try {
            db.prepare(`UPDATE audit_warehouse SET stock = stock + ?, last_restock = ? WHERE id = ?`)
              .run(qr, nowSec(), it.sku);
          } catch (e) { /* sku gak ada di warehouse — abaikan */ }
        }
      }
      db.prepare(`UPDATE goods_deliveries SET status='received', received_by=?, received_at=? WHERE id=?`)
        .run(b.received_by || 'Outlet', nowSec(), gd.id);
    });
    tx();
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/goods-delivery';
  app.use(mountPath, router);
  console.log(`[goods-delivery] mounted at ${mountPath} — GD → GR + stock posting`);

  return { router, db };
}

module.exports = { setupGoodsDelivery };
