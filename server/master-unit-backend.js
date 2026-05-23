// server/master-unit-backend.js
// Master Unit — master satuan / unit of measure (UOM) untuk inventory.
// Berat, volume, jumlah — dengan konversi ke satuan dasar.
//
//   GET  /api/master-unit            — daftar satuan (per kategori) + summary
//   POST /api/master-unit            — tambah satuan
//   POST /api/master-unit/:id/toggle — aktif / nonaktif

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS master_uom (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT, symbol TEXT,
  category TEXT, base_unit TEXT, conversion REAL DEFAULT 1, is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const CATEGORIES = ['Berat', 'Volume', 'Jumlah'];

function setupMasterUnit(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM master_uom`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO master_uom (code, name, symbol, category, base_unit, conversion, is_active) VALUES (?,?,?,?,?,?,1)`);
    // [code, name, symbol, category, baseUnit, conversion-ke-base]
    [
      ['KG', 'Kilogram', 'kg', 'Berat', 'kg', 1],
      ['GRAM', 'Gram', 'g', 'Berat', 'kg', 0.001],
      ['TON', 'Ton', 'ton', 'Berat', 'kg', 1000],
      ['LITER', 'Liter', 'L', 'Volume', 'liter', 1],
      ['ML', 'Mililiter', 'ml', 'Volume', 'liter', 0.001],
      ['GALON', 'Galon', 'gln', 'Volume', 'liter', 19],
      ['PCS', 'Pieces', 'pcs', 'Jumlah', 'pcs', 1],
      ['CUP', 'Cup', 'cup', 'Jumlah', 'pcs', 1],
      ['PORSI', 'Porsi', 'porsi', 'Jumlah', 'pcs', 1],
      ['PACK', 'Pack', 'pack', 'Jumlah', 'pcs', 1],
      ['LUSIN', 'Lusin', 'lsn', 'Jumlah', 'pcs', 12],
      ['BOX', 'Box', 'box', 'Jumlah', 'pcs', 24],
      ['KARTON', 'Karton', 'ktn', 'Jumlah', 'pcs', 144],
      ['SACHET', 'Sachet', 'sct', 'Jumlah', 'pcs', 1],
    ].forEach(r => ins.run(...r));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM master_uom ORDER BY category, conversion`).all();
    res.json({
      categories: CATEGORIES.map(cat => ({
        category: cat, base_unit: (rows.find(r => r.category === cat) || {}).base_unit || '-',
        units: rows.filter(r => r.category === cat),
      })).filter(g => g.units.length),
      all_categories: CATEGORIES,
      summary: {
        total: rows.length,
        active: rows.filter(r => r.is_active).length,
        by_category: CATEGORIES.map(c => ({ category: c, count: rows.filter(r => r.category === c).length })).filter(x => x.count),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.name || !CATEGORIES.includes(b.category))
      return res.status(400).json({ error: 'kode, nama & kategori wajib' });
    if (db.prepare(`SELECT id FROM master_uom WHERE code = ?`).get(String(b.code).trim().toUpperCase()))
      return res.status(409).json({ error: 'kode satuan sudah dipakai' });
    db.prepare(`INSERT INTO master_uom (code, name, symbol, category, base_unit, conversion, is_active) VALUES (?,?,?,?,?,?,1)`)
      .run(String(b.code).trim().toUpperCase(), String(b.name).trim(), (b.symbol || b.code).trim(),
        b.category, (b.base_unit || b.symbol || '-').trim(), Number(b.conversion) > 0 ? Number(b.conversion) : 1);
    res.json({ ok: true });
  });

  router.post('/:id/toggle', (req, res) => {
    const u = db.prepare(`SELECT * FROM master_uom WHERE id = ?`).get(req.params.id);
    if (!u) return res.status(404).json({ error: 'satuan tidak ditemukan' });
    db.prepare(`UPDATE master_uom SET is_active = ? WHERE id = ?`).run(u.is_active ? 0 : 1, u.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const u = db.prepare(`SELECT * FROM master_uom WHERE id = ?`).get(req.params.id);
    if (!u) return res.status(404).json({ error: 'satuan tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    if (b.name !== undefined)        { fields.push('name = ?');        args.push(String(b.name).trim()); }
    if (b.symbol !== undefined)      { fields.push('symbol = ?');      args.push(String(b.symbol).trim()); }
    if (b.category !== undefined && CATEGORIES.includes(b.category)) {
                                      fields.push('category = ?');    args.push(b.category); }
    if (b.base_unit !== undefined)   { fields.push('base_unit = ?');   args.push(String(b.base_unit).trim()); }
    if (b.conversion !== undefined)  { fields.push('conversion = ?');  args.push(Number(b.conversion) > 0 ? Number(b.conversion) : 1); }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE master_uom SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM master_uom WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'satuan tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/master-unit';
  app.use(mountPath, router);
  console.log(`[master-unit] mounted at ${mountPath} — unit of measure master`);

  return { router, db };
}

module.exports = { setupMasterUnit };
