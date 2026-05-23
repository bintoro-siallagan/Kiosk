// server/approval-engine-backend.js
// Approval Engine — approval bertingkat by nominal. Tiap kategori
// punya tier: nominal kecil → supervisor, besar → direksi.
//
//   GET  /api/approval            — rules + request pending + history
//   POST /api/approval/request    — ajukan approval { category, amount, description, requested_by }
//   POST /api/approval/:id/decide — putuskan { decision, approver }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS approval_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL, amount REAL NOT NULL, description TEXT,
  requested_by TEXT, required_role TEXT,
  status TEXT DEFAULT 'pending', decided_by TEXT, decided_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

// Tier approval — max null = tak terbatas (tier teratas)
const RULES = {
  refund:   { label: 'Refund', icon: '↩️', tiers: [
    { max: 100000, role: 'Supervisor' }, { max: 500000, role: 'Outlet Manager' },
    { max: 5000000, role: 'Area Manager' }, { max: null, role: 'Finance Director' } ] },
  void:     { label: 'Void Transaksi', icon: '🚫', tiers: [
    { max: 200000, role: 'Supervisor' }, { max: 1000000, role: 'Outlet Manager' },
    { max: null, role: 'Area Manager' } ] },
  expense:  { label: 'Pengeluaran', icon: '💸', tiers: [
    { max: 500000, role: 'Outlet Manager' }, { max: 5000000, role: 'Area Manager' },
    { max: 25000000, role: 'Finance Director' }, { max: null, role: 'Owner / Director' } ] },
  purchase: { label: 'Purchase / PO', icon: '🛒', tiers: [
    { max: 2000000, role: 'Manager Purchase' }, { max: 10000000, role: 'Finance Director' },
    { max: null, role: 'Owner / Director' } ] },
};
const nowSec = () => Math.floor(Date.now() / 1000);

function routeApproval(category, amount) {
  const r = RULES[category] || RULES.refund;
  for (const t of r.tiers) if (t.max == null || amount <= t.max) return t.role;
  return r.tiers[r.tiers.length - 1].role;
}

function setupApprovalEngine(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed demo (sekali)
  if (db.prepare(`SELECT COUNT(*) c FROM approval_requests`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO approval_requests
      (category, amount, description, requested_by, required_role, status, decided_by, decided_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    const seed = [
      ['refund', 75000, 'Refund pesanan salah — A312', 'Kasir 1', 'pending', null, null, 1],
      ['refund', 1800000, 'Refund event booking batal', 'Kasir 2', 'pending', null, null, 0],
      ['expense', 3200000, 'Beli perlengkapan outlet baru', 'Outlet Manager', 'pending', null, null, 2],
      ['void', 150000, 'Void salah input menu', 'Kasir 1', 'approved', 'Supervisor', 1, 3],
      ['purchase', 8500000, 'PO bahan baku bulanan', 'Procurement', 'approved', 'Finance Director', 2, 5],
    ];
    for (const [cat, amt, desc, by, st, dby, ddays, cdays] of seed) {
      ins.run(cat, amt, desc, by, routeApproval(cat, amt), st,
        dby, ddays ? nowSec() - ddays * 86400 : null, nowSec() - cdays * 86400);
    }
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const all = db.prepare(`SELECT * FROM approval_requests ORDER BY created_at DESC`).all();
    res.json({
      rules: Object.entries(RULES).map(([id, r]) => ({ id, label: r.label, icon: r.icon, tiers: r.tiers })),
      pending: all.filter(r => r.status === 'pending'),
      history: all.filter(r => r.status !== 'pending').slice(0, 12),
      summary: {
        pending: all.filter(r => r.status === 'pending').length,
        approved: all.filter(r => r.status === 'approved').length,
        rejected: all.filter(r => r.status === 'rejected').length,
        pending_value: all.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0),
      },
    });
  });

  router.post('/request', (req, res) => {
    const b = req.body || {};
    if (!RULES[b.category]) return res.status(400).json({ error: 'kategori tidak valid' });
    if (!(Number(b.amount) > 0)) return res.status(400).json({ error: 'nominal wajib > 0' });
    const required = routeApproval(b.category, Number(b.amount));
    const r = db.prepare(`INSERT INTO approval_requests
      (category, amount, description, requested_by, required_role) VALUES (?,?,?,?,?)`).run(
      b.category, Number(b.amount), (b.description || '').trim(), b.requested_by || 'Staff', required);
    res.json({ ok: true, id: r.lastInsertRowid, required_role: required });
  });

  router.post('/:id/decide', (req, res) => {
    const row = db.prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'request tidak ditemukan' });
    if (row.status !== 'pending') return res.status(409).json({ error: 'request sudah diputuskan' });
    const decision = (req.body || {}).decision;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision tidak valid' });
    db.prepare(`UPDATE approval_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?`)
      .run(decision, (req.body || {}).approver || row.required_role, nowSec(), row.id);
    res.json({ ok: true, status: decision });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['category', 'amount', 'description', 'requested_by', 'required_role', 'status', 'decided_by']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE approval_requests SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM approval_requests WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/approval';
  app.use(mountPath, router);
  console.log(`[approval] mounted at ${mountPath} — tiered approval engine`);

  return { router, db };
}

module.exports = { setupApprovalEngine };
