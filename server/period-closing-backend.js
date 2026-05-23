// server/period-closing-backend.js
// Period Closing — tutup periode akuntansi & tutup periode stok.
// Checklist pra-tutup → kunci periode.
//
//   GET  /api/period-closing               — daftar periode + checklist
//   POST /api/period-closing               — buat periode baru { period_name, closing_type }
//   POST /api/period-closing/:id/check      — toggle item checklist { index }
//   POST /api/period-closing/:id/close      — tutup periode

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS period_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, period_name TEXT, closing_type TEXT,
  status TEXT DEFAULT 'open', checklist TEXT, closed_by TEXT, closed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const CHECKLIST = {
  accounting: ['Semua jurnal ter-posting', 'Rekonsiliasi bank selesai', 'Cash count selesai', 'AP / AR ter-update', 'Laporan keuangan di-review'],
  stock: ['Stock opname selesai', 'Tidak ada GR pending', 'Waste tercatat', 'Transfer antar-outlet selesai', 'Saldo stok ter-rekonsiliasi'],
};
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupPeriodClosing(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM period_closings`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO period_closings
      (period_name, closing_type, status, checklist, closed_by, closed_at, created_at) VALUES (?,?,?,?,?,?,?)`);
    const N = nowSec();
    const mk = (type, doneCount) => JSON.stringify(CHECKLIST[type].map((label, i) => ({ label, done: i < doneCount })));
    // [name, type, status, doneCount, closedDaysAgo]
    [
      ['April 2026', 'accounting', 'closed', 5, 25], ['April 2026', 'stock', 'closed', 5, 24],
      ['Mei 2026', 'accounting', 'open', 3, null], ['Mei 2026', 'stock', 'open', 2, null],
    ].forEach(([nm, ty, st, dc, cd]) => ins.run(nm, ty, st, mk(ty, dc),
      st === 'closed' ? 'Finance Director' : null, cd != null ? N - cd * 86400 : null, N - 30 * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  const shape = (r) => {
    const cl = J(r.checklist);
    return { ...r, checklist: cl, done_count: cl.filter(c => c.done).length, total: cl.length };
  };

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM period_closings ORDER BY created_at DESC, id DESC`).all().map(shape);
    res.json({
      accounting: rows.filter(r => r.closing_type === 'accounting'),
      stock: rows.filter(r => r.closing_type === 'stock'),
      summary: {
        open: rows.filter(r => r.status === 'open').length,
        closed: rows.filter(r => r.status === 'closed').length,
        ready: rows.filter(r => r.status === 'open' && r.done_count === r.total).length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.period_name || !CHECKLIST[b.closing_type]) return res.status(400).json({ error: 'nama periode & tipe wajib' });
    db.prepare(`INSERT INTO period_closings (period_name, closing_type, status, checklist) VALUES (?,?, 'open', ?)`)
      .run(String(b.period_name).trim(), b.closing_type,
        JSON.stringify(CHECKLIST[b.closing_type].map(label => ({ label, done: false }))));
    res.json({ ok: true });
  });

  router.post('/:id/check', (req, res) => {
    const r = db.prepare(`SELECT * FROM period_closings WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'periode tidak ditemukan' });
    if (r.status === 'closed') return res.status(409).json({ error: 'periode sudah ditutup' });
    const cl = J(r.checklist), idx = Number((req.body || {}).index);
    if (!cl[idx]) return res.status(400).json({ error: 'item checklist tidak valid' });
    cl[idx].done = !cl[idx].done;
    db.prepare(`UPDATE period_closings SET checklist = ? WHERE id = ?`).run(JSON.stringify(cl), r.id);
    res.json({ ok: true });
  });

  router.post('/:id/close', (req, res) => {
    const r = db.prepare(`SELECT * FROM period_closings WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'periode tidak ditemukan' });
    if (r.status === 'closed') return res.status(409).json({ error: 'periode sudah ditutup' });
    const cl = J(r.checklist);
    if (cl.some(c => !c.done)) return res.status(409).json({ error: 'checklist belum lengkap — tidak bisa tutup periode' });
    db.prepare(`UPDATE period_closings SET status='closed', closed_by=?, closed_at=? WHERE id=?`)
      .run((req.body || {}).closed_by || 'Finance Director', nowSec(), r.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM period_closings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // Closed periods are immutable
    if (row.status === 'closed') {
      return res.status(403).json({ error: 'periode sudah ditutup — immutable, tidak bisa diubah' });
    }
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['period_name', 'closing_type']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE period_closings SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM period_closings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // Closed periods are immutable — only delete on open (draft) periods
    if (row.status === 'closed') {
      return res.status(403).json({ error: 'periode sudah ditutup — immutable, tidak bisa dihapus' });
    }
    db.prepare(`DELETE FROM period_closings WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/period-closing';
  app.use(mountPath, router);
  console.log(`[period-closing] mounted at ${mountPath} — accounting & stock period closing`);

  return { router, db };
}

module.exports = { setupPeriodClosing };
