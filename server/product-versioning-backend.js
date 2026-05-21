// server/product-versioning-backend.js
// Product Versioning — track riwayat perubahan produk: harga, recipe,
// modifier, promo, status. Enterprise audit untuk produk.
//
//   GET  /api/product-versioning          — timeline perubahan + summary
//   POST /api/product-versioning          — catat perubahan baru

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS product_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_name TEXT, change_type TEXT, summary TEXT,
  old_value TEXT, new_value TEXT, changed_by TEXT,
  changed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const TYPES = [
  { type: 'price', icon: '💲', label: 'Harga' }, { type: 'recipe', icon: '🍳', label: 'Recipe' },
  { type: 'modifier', icon: '➕', label: 'Modifier' }, { type: 'promo', icon: '🏷️', label: 'Promo' },
  { type: 'status', icon: '🔌', label: 'Status' },
];
const TYPE_IDS = TYPES.map(t => t.type);
const nowSec = () => Math.floor(Date.now() / 1000);

function setupProductVersioning(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM product_versions`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO product_versions
      (item_name, change_type, summary, old_value, new_value, changed_by, changed_at) VALUES (?,?,?,?,?,?,?)`);
    const N = nowSec();
    // [item, type, summary, old, new, daysAgo, by]
    [
      ['Original Froyo', 'price', 'Harga dine-in naik', 'Rp 25.000', 'Rp 27.000', 2, 'Outlet Manager'],
      ['Chocolate Froyo', 'recipe', 'Tambah topping di resep', '—', '+ Choco Chips 30g', 4, 'Area Manager'],
      ['Matcha Froyo', 'price', 'Harga online disesuaikan', 'Rp 32.500', 'Rp 34.000', 7, 'Finance Director'],
      ['Mango Smoothie', 'modifier', 'Tambah opsi modifier', '—', '+ Oat Milk (+Rp 8.000)', 9, 'Outlet Manager'],
      ['Collab Special 1', 'promo', 'Promo BUY1GET1 diaktifkan', 'Not Eligible', 'Eligible', 3, 'Marketing Team'],
      ['Strawberry Froyo', 'status', 'Item dinonaktifkan sementara — sold out', 'active', 'inactive', 1, 'Supervisor'],
      ['Vanilla Yogulato', 'price', 'Penyesuaian harga employee', 'Rp 21.000', 'Rp 20.000', 12, 'Finance Director'],
      ['Pint Original', 'recipe', 'Update porsi base', 'Base 0.45 kg', 'Base 0.50 kg', 6, 'Area Manager'],
      ['Mixed Berry', 'modifier', 'Hapus opsi modifier lama', 'Whipped Cream', '—', 14, 'Outlet Manager'],
      ['Collab Special 3', 'promo', 'Promo musiman berakhir', 'Eligible', 'Not Eligible', 5, 'Marketing Team'],
      ['Quart Chocolate', 'price', 'Harga franchise di-set', '—', 'Rp 160.000', 11, 'Owner / Director'],
      ['Tropical Mix', 'status', 'Item diaktifkan kembali', 'inactive', 'active', 2, 'Outlet Manager'],
      ['Chocolate Yogulato', 'recipe', 'Revisi takaran susu', 'Susu 0.05 L', 'Susu 0.06 L', 8, 'Area Manager'],
      ['Strawberry Smoothie', 'price', 'Harga kiosk naik', 'Rp 32.000', 'Rp 33.000', 4, 'Outlet Manager'],
    ].forEach(([it, ty, sm, ov, nv, d, by]) => ins.run(it, ty, sm, ov, nv, by, N - d * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const versions = db.prepare(`SELECT * FROM product_versions ORDER BY changed_at DESC`).all()
      .map(v => ({ ...v, ...(TYPES.find(t => t.type === v.change_type) || {}) }));
    const wk = nowSec() - 7 * 86400;
    const typeCount = {};
    for (const v of versions) typeCount[v.change_type] = (typeCount[v.change_type] || 0) + 1;
    res.json({
      versions,
      type_dist: TYPES.map(t => ({ ...t, count: typeCount[t.type] || 0 })),
      summary: {
        total: versions.length,
        price_changes: typeCount.price || 0,
        recipe_changes: typeCount.recipe || 0,
        this_week: versions.filter(v => v.changed_at > wk).length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.item_name || !TYPE_IDS.includes(b.change_type)) return res.status(400).json({ error: 'item & change_type wajib' });
    db.prepare(`INSERT INTO product_versions (item_name, change_type, summary, old_value, new_value, changed_by)
      VALUES (?,?,?,?,?,?)`).run(b.item_name, b.change_type, (b.summary || '').trim(),
      b.old_value || '—', b.new_value || '—', b.changed_by || 'System');
    res.json({ ok: true });
  });

  // dipakai modul lain buat auto-log perubahan produk
  global.logProductVersion = (e) => {
    try {
      db.prepare(`INSERT INTO product_versions (item_name, change_type, summary, old_value, new_value, changed_by)
        VALUES (?,?,?,?,?,?)`).run(e.item_name || '-', e.change_type || 'status', e.summary || '',
        e.old_value || '—', e.new_value || '—', e.changed_by || 'System');
    } catch { /* noop */ }
  };

  const mountPath = opts.mountPath || '/api/product-versioning';
  app.use(mountPath, router);
  console.log(`[product-versioning] mounted at ${mountPath} — product change history`);

  return { router, db };
}

module.exports = { setupProductVersioning };
