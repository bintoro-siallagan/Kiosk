// server/stock-opname-backend.js
// Stock Opname — hitung fisik stok vs sistem, catat selisih, posting
// penyesuaian ke audit_warehouse.
//
//   GET  /api/stock-opname              — sesi opname + summary
//   POST /api/stock-opname              — buat sesi baru (snapshot stok)
//   POST /api/stock-opname/:id/count    — catat hitungan { sku, counted_qty }
//   POST /api/stock-opname/:id/complete — finalisasi → posting penyesuaian

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stock_opname (
  id INTEGER PRIMARY KEY AUTOINCREMENT, opname_no TEXT, location TEXT,
  status TEXT DEFAULT 'in_progress', items TEXT, started_by TEXT,
  completed_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const r2 = (n) => Math.round(n * 100) / 100;

function setupStockOpname(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };
  const snapshot = () => many(`SELECT id, name, unit, stock, cost_per_unit FROM audit_warehouse ORDER BY id`)
    .map(w => ({ sku: w.id, name: w.name, unit: w.unit, cost_per_unit: w.cost_per_unit, system_qty: w.stock, counted_qty: null }));
  const genNo = () => `OPN-202605-${String(db.prepare(`SELECT COUNT(*) c FROM stock_opname`).get().c + 1).padStart(3, '0')}`;

  // Seed — 1 selesai + 1 sedang berjalan
  if (db.prepare(`SELECT COUNT(*) c FROM stock_opname`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO stock_opname (opname_no, location, status, items, started_by, completed_at, created_at) VALUES (?,?,?,?,?,?,?)`);
    const N = nowSec();
    const done = snapshot().map(it => ({ ...it, counted_qty: it.system_qty }));
    ins.run('OPN-202604-001', 'Gudang Pusat', 'completed', JSON.stringify(done), 'Supervisor', N - 22 * 86400, N - 23 * 86400);
    const wip = snapshot().map((it, i) => ({ ...it, counted_qty: i < 12 ? r2(it.system_qty + ((i % 3) - 1) * it.system_qty * 0.03) : null }));
    ins.run('OPN-202605-002', 'Gudang Pusat', 'in_progress', JSON.stringify(wip), 'Supervisor', null, N - 86400);
  }

  const shape = (r) => {
    const items = J(r.items);
    const counted = items.filter(i => i.counted_qty != null);
    return {
      id: r.id, opname_no: r.opname_no, location: r.location, status: r.status,
      started_by: r.started_by, completed_at: r.completed_at, created_at: r.created_at, items,
      counted: counted.length, total: items.length,
      variance_items: counted.filter(i => i.counted_qty !== i.system_qty).length,
      variance_value: Math.round(counted.reduce((s, i) => s + (i.counted_qty - i.system_qty) * (i.cost_per_unit || 0), 0)),
    };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const sessions = many(`SELECT * FROM stock_opname ORDER BY created_at DESC`).map(shape);
    res.json({
      sessions,
      summary: {
        total: sessions.length,
        in_progress: sessions.filter(s => s.status === 'in_progress').length,
        completed: sessions.filter(s => s.status === 'completed').length,
        last_variance: (sessions.find(s => s.status === 'completed') || {}).variance_value || 0,
      },
    });
  });

  router.post('/', (req, res) => {
    const r = db.prepare(`INSERT INTO stock_opname (opname_no, location, status, items, started_by) VALUES (?,?, 'in_progress', ?, ?)`)
      .run(genNo(), (req.body || {}).location || 'Gudang Pusat', JSON.stringify(snapshot()), (req.body || {}).started_by || 'Supervisor');
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  router.post('/:id/count', (req, res) => {
    const r = db.prepare(`SELECT * FROM stock_opname WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'sesi opname tidak ditemukan' });
    if (r.status !== 'in_progress') return res.status(409).json({ error: 'sesi sudah selesai' });
    const items = J(r.items);
    const it = items.find(x => x.sku === (req.body || {}).sku);
    if (!it) return res.status(404).json({ error: 'item tidak ditemukan' });
    const q = Number((req.body || {}).counted_qty);
    it.counted_qty = isNaN(q) ? null : r2(q);
    db.prepare(`UPDATE stock_opname SET items = ? WHERE id = ?`).run(JSON.stringify(items), r.id);
    res.json({ ok: true });
  });

  router.post('/:id/complete', (req, res) => {
    const r = db.prepare(`SELECT * FROM stock_opname WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'sesi opname tidak ditemukan' });
    if (r.status !== 'in_progress') return res.status(409).json({ error: 'sesi sudah selesai' });
    const items = J(r.items);
    let adjusted = 0;
    db.transaction(() => {
      const upd = db.prepare(`UPDATE audit_warehouse SET stock = ?, updated_at = ? WHERE id = ?`);
      for (const it of items) {
        if (it.counted_qty != null && it.counted_qty !== it.system_qty) { upd.run(it.counted_qty, nowSec(), it.sku); adjusted++; }
      }
      db.prepare(`UPDATE stock_opname SET status='completed', completed_at=? WHERE id=?`).run(nowSec(), r.id);
    })();
    res.json({ ok: true, adjusted });
  });

  const mountPath = opts.mountPath || '/api/stock-opname';
  app.use(mountPath, router);
  console.log(`[stock-opname] mounted at ${mountPath} — physical stock count & adjustment`);

  return { router, db };
}

module.exports = { setupStockOpname };
