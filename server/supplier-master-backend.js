// server/supplier-master-backend.js
// Supplier/Vendor Master — registry vendor terpusat + scorecard
// (on-time delivery, kualitas, harga).
//
//   GET  /api/supplier-master            — daftar vendor + scorecard
//   POST /api/supplier-master            — tambah vendor
//   POST /api/supplier-master/:id/toggle — aktif / nonaktif

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS supplier_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT, category TEXT,
  contact TEXT, phone TEXT, payment_terms TEXT,
  on_time_pct REAL DEFAULT 90, quality_score REAL DEFAULT 90, price_score REAL DEFAULT 85,
  is_active INTEGER DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const CATEGORIES = ['Bahan Baku', 'Kemasan', 'Peralatan', 'Jasa', 'Lainnya'];
const grade = (s) => s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : 'D';

function setupSupplierMaster(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM supplier_master`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO supplier_master
      (code, name, category, contact, phone, payment_terms, on_time_pct, quality_score, price_score, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,1)`);
    // [code, name, kategori, kontak, telp, termin, onTime, quality, price]
    [
      ['SUP-001', 'PT Dairy Nusantara', 'Bahan Baku', 'Budi Hartono', '021-5550101', 'NET 30', 96, 94, 88],
      ['SUP-002', 'CV Kemasan Prima', 'Kemasan', 'Sari Dewi', '021-5550202', 'NET 14', 91, 89, 92],
      ['SUP-003', 'UD Buah Segar Jaya', 'Bahan Baku', 'Anton Wijaya', '022-5550303', 'COD', 84, 92, 80],
      ['SUP-004', 'PT Mesin Pangan Tek', 'Peralatan', 'Rina Kusuma', '021-5550404', 'NET 45', 78, 88, 72],
      ['SUP-005', 'CV Logistik Cepat', 'Jasa', 'Hendra Saputra', '021-5550505', 'NET 30', 93, 85, 90],
      ['SUP-006', 'Toko Granola Sehat', 'Bahan Baku', 'Maya Putri', '0274-5550606', 'NET 14', 88, 90, 86],
    ].forEach(r => ins.run(...r));
  }

  const shape = (r) => {
    const score = Math.round((r.on_time_pct + r.quality_score + r.price_score) / 3);
    return { ...r, is_active: !!r.is_active, total_score: score, grade: grade(score) };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM supplier_master ORDER BY id`).all().map(shape);
    const active = rows.filter(r => r.is_active);
    res.json({
      suppliers: rows,
      categories: CATEGORIES,
      summary: {
        total: rows.length, active: active.length,
        avg_score: active.length ? Math.round(active.reduce((a, r) => a + r.total_score, 0) / active.length) : 0,
        grade_a: rows.filter(r => r.grade === 'A').length,
        top: rows.slice().sort((a, b) => b.total_score - a.total_score)[0] || null,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama vendor wajib' });
    if (!CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'kategori tidak valid' });
    const n = db.prepare(`SELECT COUNT(*) c FROM supplier_master`).get().c;
    db.prepare(`INSERT INTO supplier_master (code, name, category, contact, phone, payment_terms, on_time_pct, quality_score, price_score, is_active) VALUES (?,?,?,?,?,?,?,?,?,1)`)
      .run(`SUP-${String(n + 1).padStart(3, '0')}`, String(b.name).trim(), b.category,
        b.contact || '', b.phone || '', b.payment_terms || 'NET 30',
        Number(b.on_time_pct) || 90, Number(b.quality_score) || 90, Number(b.price_score) || 85);
    res.json({ ok: true });
  });

  router.post('/:id/toggle', (req, res) => {
    const s = db.prepare(`SELECT * FROM supplier_master WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'vendor tidak ditemukan' });
    db.prepare(`UPDATE supplier_master SET is_active = ? WHERE id = ?`).run(s.is_active ? 0 : 1, s.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const s = db.prepare(`SELECT * FROM supplier_master WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'vendor tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    const num = new Set(['on_time_pct', 'quality_score', 'price_score']);
    for (const k of ['name', 'category', 'contact', 'phone', 'payment_terms', 'on_time_pct', 'quality_score', 'price_score']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(num.has(k) ? Number(b[k]) : String(b[k])); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE supplier_master SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM supplier_master WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'vendor tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/supplier-master';
  app.use(mountPath, router);
  console.log(`[supplier-master] mounted at ${mountPath} — vendor master + scorecard`);

  return { router, db };
}

module.exports = { setupSupplierMaster };
