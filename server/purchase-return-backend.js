// server/purchase-return-backend.js
// Purchase Return — retur barang ke supplier (rusak / kedaluwarsa /
// salah kirim). Selesai → stok berkurang, jadi klaim ke supplier.
//
//   GET  /api/purchase-return            — daftar retur + summary
//   POST /api/purchase-return            — buat retur
//   POST /api/purchase-return/:id/complete — proses retur → potong stok

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS purchase_return_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, return_no TEXT, supplier TEXT, po_ref TEXT,
  items TEXT, total_value REAL, reason TEXT, status TEXT DEFAULT 'draft',
  created_by TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), completed_at INTEGER
);
`;
const REASONS = ['Rusak', 'Kedaluwarsa', 'Salah Kirim', 'Kualitas Buruk', 'Kelebihan Kirim'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupPurchaseReturn(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };
  const genNo = () => `RTN-202605-${String(db.prepare(`SELECT COUNT(*) c FROM purchase_return_docs`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM purchase_return_docs`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO purchase_return_docs
      (return_no, supplier, po_ref, items, total_value, reason, status, created_by, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [supplier, po, items[[sku,name,qty,unit,price,reason]], reason, status, daysAgo]
    [
      ['PT Dairy Prima', 'PO-2026-030', [['RM01', 'Yogurt Base Plain', 5, 'kg', 65000, 'Rusak']], 'Rusak', 'completed', 6],
      ['Fresh Fruit Co', 'PO-2026-033', [['RM05', 'Buah Strawberry', 3, 'kg', 48000, 'Kedaluwarsa']], 'Kedaluwarsa', 'draft', 1],
      ['Packaging Mandiri', 'PO-2026-035', [['PK02', 'Cup 16oz', 50, 'pcs', 800, 'Salah Kirim']], 'Salah Kirim', 'draft', 0],
      ['Topping Supplier ID', 'PO-2026-028', [['TP01', 'Granola', 2, 'kg', 90000, 'Kualitas Buruk']], 'Kualitas Buruk', 'completed', 9],
    ].forEach(([sup, po, items, reason, st, d]) => {
      const its = items.map(([sku, name, qty, unit, price, rsn]) => ({ sku, name, qty, unit, unit_price: price, reason: rsn }));
      ins.run(genNo(i++), sup, po, JSON.stringify(its), its.reduce((s, x) => s + x.qty * x.unit_price, 0),
        reason, st, 'Warehouse', N - d * 86400, st === 'completed' ? N - (d - 1) * 86400 : null);
    });
  }

  const shape = (r) => ({ ...r, items: J(r.items) });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM purchase_return_docs ORDER BY created_at DESC`).all().map(shape);
    res.json({
      returns: rows, reasons: REASONS,
      warehouse: db.prepare(`SELECT id, name, unit, cost_per_unit FROM audit_warehouse ORDER BY id`).all(),
      summary: {
        total: rows.length,
        draft: rows.filter(r => r.status === 'draft').length,
        completed: rows.filter(r => r.status === 'completed').length,
        total_value: rows.reduce((s, r) => s + (r.total_value || 0), 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.sku && Number(i.qty) > 0);
    if (!b.supplier || !items.length) return res.status(400).json({ error: 'supplier & minimal 1 item wajib' });
    const norm = items.map(i => ({
      sku: i.sku, name: i.name || (one(`SELECT name FROM audit_warehouse WHERE id=?`, i.sku) || {}).name || i.sku,
      qty: Number(i.qty), unit: i.unit || 'pcs', unit_price: Number(i.unit_price) || 0, reason: i.reason || b.reason || 'Rusak',
    }));
    db.prepare(`INSERT INTO purchase_return_docs (return_no, supplier, po_ref, items, total_value, reason, status, created_by)
      VALUES (?,?,?,?,?,?, 'draft', ?)`).run(genNo(), String(b.supplier).trim(), (b.po_ref || '-').trim(),
      JSON.stringify(norm), norm.reduce((s, x) => s + x.qty * x.unit_price, 0), b.reason || norm[0].reason, (b.created_by || 'Warehouse').trim());
    res.json({ ok: true });
  });

  router.post('/:id/complete', (req, res) => {
    const r = db.prepare(`SELECT * FROM purchase_return_docs WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'retur tidak ditemukan' });
    if (r.status === 'completed') return res.status(409).json({ error: 'retur sudah diproses' });
    let posted = 0;
    db.transaction(() => {
      const upd = db.prepare(`UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?`);
      for (const it of J(r.items)) { try { if (upd.run(it.qty, nowSec(), it.sku).changes > 0) posted++; } catch { /* noop */ } }
      db.prepare(`UPDATE purchase_return_docs SET status='completed', completed_at=? WHERE id=?`).run(nowSec(), r.id);
    })();
    res.json({ ok: true, stock_posted: posted });
  });

  const mountPath = opts.mountPath || '/api/purchase-return';
  app.use(mountPath, router);
  console.log(`[purchase-return] mounted at ${mountPath} — return goods to supplier`);

  return { router, db };
}

module.exports = { setupPurchaseReturn };
