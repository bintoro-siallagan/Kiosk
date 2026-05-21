// server/price-list-backend.js
// Price List — harga resmi item per supplier, di-LOCK.
// PR/PO/Quick-Reorder ambil harga dari sini (gak ketik manual) →
// purchasing transparan, gak bisa main harga sama supplier.
// Tiap harga punya masa berlaku (valid_until) → bisa kedeteksi expired.
//
//   GET    /api/price-list            — semua harga
//   GET    /api/price-list/lookup?sku — harga locked buat 1 item
//   POST   /api/price-list            — tambah harga
//   PUT    /api/price-list/:id        — ubah harga
//   DELETE /api/price-list/:id        — hapus

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS price_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT,
  item_name TEXT NOT NULL,
  supplier TEXT,
  unit TEXT,
  price REAL NOT NULL,
  valid_until INTEGER,
  is_active INTEGER DEFAULT 1,
  updated_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

const SUPPLIERS = ['CV Berkah Pangan', 'PT Sumber Segar', 'UD Mitra Tani', 'CV Dairy Prima'];
const nowSec = () => Math.floor(Date.now() / 1000);

function setupPriceList(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed dari audit_warehouse (sekali) — tiap bahan dapet harga resmi awal
  if (db.prepare(`SELECT COUNT(*) c FROM price_list`).get().c === 0) {
    let wh = [];
    try { wh = db.prepare(`SELECT id, name, unit, cost_per_unit FROM audit_warehouse`).all(); } catch (e) { /* tabel blm ada */ }
    const validUntil = nowSec() + 90 * 86400; // harga berlaku 90 hari
    const ins = db.prepare(`INSERT INTO price_list (sku, item_name, supplier, unit, price, valid_until, updated_by)
      VALUES (?,?,?,?,?,?,?)`);
    wh.forEach((w, i) => ins.run(w.id, w.name, SUPPLIERS[i % SUPPLIERS.length], w.unit || '', w.cost_per_unit || 0, validUntil, 'seed'));
  }

  const decorate = (r) => ({ ...r, expired: !!(r.valid_until && r.valid_until < nowSec()) });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    res.json(db.prepare(`SELECT * FROM price_list ORDER BY item_name`).all().map(decorate));
  });

  // Lookup harga locked buat 1 SKU — dipakai Quick Reorder / PR / PO
  router.get('/lookup', (req, res) => {
    const sku = req.query.sku;
    if (!sku) return res.status(400).json({ error: 'sku wajib' });
    const r = db.prepare(`SELECT * FROM price_list WHERE sku = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`).get(sku);
    if (!r) return res.json({ found: false });
    res.json({ found: true, ...decorate(r) });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.item_name || !(Number(b.price) > 0)) return res.status(400).json({ error: 'item & harga wajib diisi' });
    const r = db.prepare(`INSERT INTO price_list (sku, item_name, supplier, unit, price, valid_until, updated_by)
      VALUES (?,?,?,?,?,?,?)`).run(
      (b.sku || '').trim(), b.item_name.trim(), (b.supplier || '').trim(),
      (b.unit || '').trim(), Number(b.price), b.valid_until || null, b.updated_by || 'Manager');
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.put('/:id', (req, res) => {
    const b = req.body || {};
    const cur = db.prepare(`SELECT id FROM price_list WHERE id = ?`).get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'tidak ditemukan' });
    db.prepare(`UPDATE price_list SET supplier=?, unit=?, price=?, valid_until=?, is_active=?,
      updated_by=?, updated_at=strftime('%s','now') WHERE id=?`).run(
      (b.supplier || '').trim(), (b.unit || '').trim(), Number(b.price) || 0,
      b.valid_until || null, b.is_active != null ? (b.is_active ? 1 : 0) : 1,
      b.updated_by || 'Manager', req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    db.prepare(`DELETE FROM price_list WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/price-list';
  app.use(mountPath, router);
  console.log(`[price-list] mounted at ${mountPath} — locked vendor prices`);

  return { router, db };
}

module.exports = { setupPriceList };
