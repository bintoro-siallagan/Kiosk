// server/internal-return-backend.js
// Internal Return — retur internal: Transfer Return (antar-outlet) &
// Delivery Return (ke gudang pusat). Mendukung partial complete —
// proses sebagian item dulu, sisanya menyusul.
//
//   GET  /api/internal-return            — daftar retur + summary
//   POST /api/internal-return            — buat retur
//   POST /api/internal-return/:id/process — proses item terpilih { skus }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS internal_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT, return_no TEXT, return_type TEXT,
  from_loc TEXT, to_loc TEXT, ref_no TEXT, items TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), completed_at INTEGER
);
`;
const REASONS = ['Rusak', 'Kedaluwarsa', 'Salah Kirim', 'Kualitas Buruk', 'Kelebihan Kirim'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupInternalReturn(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };
  const genNo = () => `IR-202605-${String(db.prepare(`SELECT COUNT(*) c FROM internal_returns`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM internal_returns`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO internal_returns (return_no, return_type, from_loc, to_loc, ref_no, items, created_at, completed_at) VALUES (?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [type, from, to, ref, items[[sku,name,qty,unit,reason,processed]], daysAgo]
    [
      ['transfer', 'Dago', 'Paskal', 'TRF-202605-001', [['TP01', 'Granola', 2, 'kg', 'Rusak', 1]], 5],
      ['transfer', 'BSD City', 'Sudirman', 'TRF-202605-004', [['PK02', 'Cup 16oz', 30, 'pcs', 'Salah Kirim', 0], ['RM05', 'Buah Strawberry', 2, 'kg', 'Kedaluwarsa', 0]], 1],
      ['delivery', 'Kemang', 'Gudang Pusat', 'GR-2026-005', [['RM07', 'Matcha Powder', 1, 'kg', 'Kualitas Buruk', 1]], 6],
      ['delivery', 'Paskal', 'Gudang Pusat', 'GR-2026-004', [['RM02', 'Yogurt Base Charcoal', 3, 'kg', 'Rusak', 1], ['RM03', 'Susu Skim UHT', 5, 'liter', 'Kelebihan Kirim', 0]], 2],
      ['transfer', 'Sudirman', 'Dago', 'TRF-202605-002', [['PK03', 'Lid Dome', 50, 'pcs', 'Rusak', 0]], 0],
    ].forEach(([ty, f, t, ref, items, d]) => {
      const its = items.map(([sku, name, qty, unit, reason, processed]) => ({ sku, name, qty, unit, reason, processed }));
      const allDone = its.every(x => x.processed);
      ins.run(genNo(), ty, f, t, ref, JSON.stringify(its), N - d * 86400, allDone ? N - (d - 1) * 86400 : null);
    });
  }

  const statusOf = (items) => {
    const done = items.filter(i => i.processed).length;
    return done === 0 ? 'draft' : done === items.length ? 'completed' : 'partial';
  };
  const shape = (r) => {
    const items = J(r.items);
    return { ...r, items, status: statusOf(items), processed_count: items.filter(i => i.processed).length, total_items: items.length };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM internal_returns ORDER BY created_at DESC`).all().map(shape);
    res.json({
      returns: rows, reasons: REASONS,
      warehouse: db.prepare(`SELECT id, name, unit FROM audit_warehouse ORDER BY id`).all(),
      summary: {
        total: rows.length,
        draft: rows.filter(r => r.status === 'draft').length,
        partial: rows.filter(r => r.status === 'partial').length,
        completed: rows.filter(r => r.status === 'completed').length,
        transfer: rows.filter(r => r.return_type === 'transfer').length,
        delivery: rows.filter(r => r.return_type === 'delivery').length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i.sku && Number(i.qty) > 0);
    if (!['transfer', 'delivery'].includes(b.return_type)) return res.status(400).json({ error: 'tipe retur tidak valid' });
    if (!b.from_loc || !b.to_loc || !items.length) return res.status(400).json({ error: 'lokasi & minimal 1 item wajib' });
    const norm = items.map(i => ({
      sku: i.sku, name: i.name || (one(`SELECT name FROM audit_warehouse WHERE id=?`, i.sku) || {}).name || i.sku,
      qty: Number(i.qty), unit: i.unit || 'pcs', reason: i.reason || 'Rusak', processed: 0,
    }));
    db.prepare(`INSERT INTO internal_returns (return_no, return_type, from_loc, to_loc, ref_no, items) VALUES (?,?,?,?,?,?)`)
      .run(genNo(), b.return_type, String(b.from_loc).trim(), String(b.to_loc).trim(), (b.ref_no || '-').trim(), JSON.stringify(norm));
    res.json({ ok: true });
  });

  // partial complete — proses hanya item terpilih (skus); sisanya menyusul
  router.post('/:id/process', (req, res) => {
    const r = db.prepare(`SELECT * FROM internal_returns WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'retur tidak ditemukan' });
    const items = J(r.items);
    const skus = Array.isArray((req.body || {}).skus) && req.body.skus.length
      ? req.body.skus : items.filter(i => !i.processed).map(i => i.sku); // default: semua sisa
    let posted = 0;
    db.transaction(() => {
      const upd = db.prepare(`UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?`);
      for (const it of items) {
        if (!it.processed && skus.includes(it.sku)) {
          it.processed = 1;
          try { if (upd.run(it.qty, nowSec(), it.sku).changes > 0) posted++; } catch { /* noop */ }
        }
      }
      const done = items.every(i => i.processed);
      db.prepare(`UPDATE internal_returns SET items = ?, completed_at = ? WHERE id = ?`)
        .run(JSON.stringify(items), done ? nowSec() : r.completed_at, r.id);
    })();
    const after = J(db.prepare(`SELECT items FROM internal_returns WHERE id=?`).get(r.id).items);
    res.json({ ok: true, status: statusOf(after), stock_posted: posted });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM internal_returns WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const items = J(row.items);
    if (statusOf(items) !== 'draft') {
      return res.status(403).json({ error: 'retur sudah diproses — tidak bisa diubah' });
    }
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['return_type', 'from_loc', 'to_loc', 'ref_no']) {
      if (b[k] !== undefined) {
        if (k === 'return_type' && !['transfer', 'delivery'].includes(b[k])) continue;
        fields.push(`${k} = ?`);
        args.push(b[k]);
      }
    }
    // allow item edits (qty/reason) while still draft
    if (Array.isArray(b.items)) {
      const norm = b.items.map(i => ({
        sku: i.sku,
        name: i.name || i.sku,
        qty: Number(i.qty) || 0,
        unit: i.unit || 'pcs',
        reason: i.reason || 'Rusak',
        processed: 0,
      })).filter(i => i.sku && i.qty > 0);
      if (norm.length) {
        fields.push(`items = ?`);
        args.push(JSON.stringify(norm));
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE internal_returns SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM internal_returns WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const items = J(row.items);
    if (statusOf(items) !== 'draft') {
      return res.status(403).json({ error: 'retur sudah diproses — tidak bisa dihapus' });
    }
    const info = db.prepare(`DELETE FROM internal_returns WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/internal-return';
  app.use(mountPath, router);
  console.log(`[internal-return] mounted at ${mountPath} — transfer & delivery return (partial)`);

  return { router, db };
}

module.exports = { setupInternalReturn };
