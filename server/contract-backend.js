// server/contract-backend.js
// Contract Management — kontrak vendor, sewa tempat & franchise.
// Tracking masa berlaku + alert perpanjangan.
//
//   GET  /api/contract            — daftar kontrak + status berlaku
//   POST /api/contract            — tambah kontrak
//   POST /api/contract/:id/renew  — perpanjang { extend_months }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contract_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT, type TEXT,
  counterparty TEXT, value REAL DEFAULT 0, outlet TEXT,
  start_date INTEGER, end_date INTEGER, is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const TYPES = ['Sewa Tempat', 'Vendor / Supplier', 'Franchise', 'Jasa', 'Lainnya'];
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupContract(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM contract_docs`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO contract_docs (code, title, type, counterparty, value, outlet, start_date, end_date, is_active) VALUES (?,?,?,?,?,?,?,?,1)`);
    const N = nowSec();
    let i = 1;
    // [title, type, counterparty, value, outlet, startYrsAgo, endInDays]
    [
      ['Sewa Ruko Outlet Paskal', 'Sewa Tempat', 'PT Properti Bandung', 180000000, 'Paskal', 1, 95],
      ['Sewa Kios Outlet Sudirman', 'Sewa Tempat', 'Sudirman Plaza Mgmt', 240000000, 'Sudirman', 1.5, 25],
      ['Kontrak Suplai Dairy', 'Vendor / Supplier', 'PT Dairy Nusantara', 0, 'Central Kitchen', 0.5, 210],
      ['Franchise Agreement — BSD', 'Franchise', 'Mitra Franchisee BSD', 350000000, 'BSD City', 2, 540],
      ['Sewa Tempat Outlet Dago', 'Sewa Tempat', 'CV Dago Land', 150000000, 'Dago', 1, -12],
      ['Kontrak Jasa Kebersihan', 'Jasa', 'CV Bersih Sejahtera', 36000000, 'Semua Outlet', 0.5, 70],
      ['Kontrak Logistik Distribusi', 'Vendor / Supplier', 'CV Logistik Cepat', 84000000, 'Semua Outlet', 0.8, 150],
    ].forEach(([t, ty, cp, v, ol, yrs, end]) =>
      ins.run(`CTR-${String(i++).padStart(3, '0')}`, t, ty, cp, v, ol, N - Math.round(yrs * 365) * DAY, N + end * DAY));
  }

  const statusOf = (days) => days < 0 ? 'expired' : days <= 60 ? 'expiring' : 'active';

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const N = nowSec();
    const rows = db.prepare(`SELECT * FROM contract_docs WHERE is_active = 1 ORDER BY end_date`).all().map(r => {
      const days = Math.floor((r.end_date - N) / DAY);
      return { ...r, days_left: days, status: statusOf(days) };
    });
    res.json({
      contracts: rows, types: TYPES,
      summary: {
        total: rows.length,
        active: rows.filter(r => r.status === 'active').length,
        expiring: rows.filter(r => r.status === 'expiring').length,
        expired: rows.filter(r => r.status === 'expired').length,
        total_value: rows.reduce((a, r) => a + (r.value || 0), 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.title || !b.counterparty) return res.status(400).json({ error: 'judul & pihak kontrak wajib' });
    if (!TYPES.includes(b.type)) return res.status(400).json({ error: 'jenis kontrak tidak valid' });
    const n = db.prepare(`SELECT COUNT(*) c FROM contract_docs`).get().c;
    const months = Number(b.duration_months) > 0 ? Number(b.duration_months) : 12;
    db.prepare(`INSERT INTO contract_docs (code, title, type, counterparty, value, outlet, start_date, end_date, is_active) VALUES (?,?,?,?,?,?,?,?,1)`)
      .run(`CTR-${String(n + 1).padStart(3, '0')}`, String(b.title).trim(), b.type, String(b.counterparty).trim(),
        Number(b.value) || 0, b.outlet || 'Semua Outlet', nowSec(), nowSec() + months * 30 * DAY);
    res.json({ ok: true });
  });

  router.post('/:id/renew', (req, res) => {
    const c = db.prepare(`SELECT * FROM contract_docs WHERE id = ?`).get(req.params.id);
    if (!c) return res.status(404).json({ error: 'kontrak tidak ditemukan' });
    const months = Number((req.body || {}).extend_months) > 0 ? Number((req.body).extend_months) : 12;
    db.prepare(`UPDATE contract_docs SET end_date = ?, start_date = ? WHERE id = ?`)
      .run(nowSec() + months * 30 * DAY, nowSec(), c.id);
    res.json({ ok: true, months });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM contract_docs WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    if (b.type !== undefined && !TYPES.includes(b.type)) return res.status(400).json({ error: 'jenis kontrak tidak valid' });
    const fields = [], args = [];
    for (const k of ['code', 'title', 'type', 'counterparty', 'value', 'outlet', 'start_date', 'end_date', 'is_active']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE contract_docs SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM contract_docs WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/contract';
  app.use(mountPath, router);
  console.log(`[contract] mounted at ${mountPath} — contract management`);

  return { router, db };
}

module.exports = { setupContract };
