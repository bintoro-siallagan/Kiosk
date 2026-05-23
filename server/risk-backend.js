// server/risk-backend.js
// Risk Management — risk register enterprise. Likelihood × Impact →
// skor & level risiko, mitigasi, owner & status.
//
//   GET  /api/risk             — risk register + heatmap + summary
//   POST /api/risk             — tambah risiko
//   POST /api/risk/:id/status  — update status { status }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS risk_register (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT, category TEXT,
  likelihood INTEGER DEFAULT 3, impact INTEGER DEFAULT 3, mitigation TEXT,
  owner TEXT, status TEXT DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const CATEGORIES = ['Operasional', 'Keuangan', 'Kepatuhan', 'Strategis', 'Reputasi', 'Teknologi'];
const STATUSES = ['open', 'mitigating', 'closed'];
const levelOf = (s) => s >= 15 ? 'Critical' : s >= 9 ? 'High' : s >= 4 ? 'Medium' : 'Low';

function setupRisk(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM risk_register`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO risk_register (code, title, category, likelihood, impact, mitigation, owner, status) VALUES (?,?,?,?,?,?,?,?)`);
    let i = 1;
    // [title, category, likelihood, impact, mitigation, owner, status]
    [
      ['Kenaikan harga bahan baku dairy', 'Keuangan', 4, 4, 'Kontrak harga tetap 6 bulan + cari vendor alternatif', 'Finance Mgr', 'mitigating'],
      ['Stok bahan kedaluwarsa (waste tinggi)', 'Operasional', 4, 3, 'FEFO ketat + demand forecast + alert batch', 'Ops Mgr', 'mitigating'],
      ['Izin/sertifikasi outlet kedaluwarsa', 'Kepatuhan', 3, 5, 'Tracking compliance + alert 60 hari sebelum habis', 'Legal', 'open'],
      ['Kebocoran data pelanggan', 'Teknologi', 2, 5, 'Enkripsi, RBAC, audit log, backup harian', 'IT', 'mitigating'],
      ['Ketergantungan 1 vendor utama', 'Operasional', 3, 4, 'Diversifikasi vendor via RFQ multi-vendor', 'Procurement', 'open'],
      ['Turnover karyawan tinggi', 'Strategis', 4, 3, 'Program reward & jenjang karir + survei kepuasan', 'HRD', 'open'],
      ['Insiden keamanan pangan viral', 'Reputasi', 2, 5, 'SOP higiene ketat + QC + crisis comms plan', 'QA Mgr', 'open'],
      ['Fraud kasir / cash handling', 'Keuangan', 3, 3, 'Anti-fraud monitoring + cash count harian + CCTV', 'Finance Mgr', 'mitigating'],
    ].forEach(([t, c, l, im, m, o, s]) => ins.run(`RSK-${String(i++).padStart(3, '0')}`, t, c, l, im, m, o, s));
  }

  const shape = (r) => { const score = r.likelihood * r.impact; return { ...r, score, level: levelOf(score) }; };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM risk_register ORDER BY id`).all().map(shape)
      .sort((a, b) => b.score - a.score);
    const openR = rows.filter(r => r.status !== 'closed');
    res.json({
      risks: rows,
      categories: CATEGORIES,
      summary: {
        total: rows.length,
        open: openR.length,
        critical: rows.filter(r => r.level === 'Critical' && r.status !== 'closed').length,
        high: rows.filter(r => r.level === 'High' && r.status !== 'closed').length,
        avg_score: openR.length ? Math.round(openR.reduce((a, r) => a + r.score, 0) / openR.length) : 0,
        by_level: ['Critical', 'High', 'Medium', 'Low'].map(L => ({ level: L, count: openR.filter(r => r.level === L).length })),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'judul risiko wajib' });
    if (!CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'kategori tidak valid' });
    const cl = (x, d) => { const n = Math.round(Number(x)); return n >= 1 && n <= 5 ? n : d; };
    const n = db.prepare(`SELECT COUNT(*) c FROM risk_register`).get().c;
    db.prepare(`INSERT INTO risk_register (code, title, category, likelihood, impact, mitigation, owner, status) VALUES (?,?,?,?,?,?,?,'open')`)
      .run(`RSK-${String(n + 1).padStart(3, '0')}`, String(b.title).trim(), b.category,
        cl(b.likelihood, 3), cl(b.impact, 3), b.mitigation || '', b.owner || '-');
    res.json({ ok: true });
  });

  router.post('/:id/status', (req, res) => {
    const r = db.prepare(`SELECT * FROM risk_register WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'risiko tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE risk_register SET status = ? WHERE id = ?`).run(st, r.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM risk_register WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['code', 'title', 'category', 'likelihood', 'impact', 'mitigation', 'owner', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE risk_register SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM risk_register WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/risk';
  app.use(mountPath, router);
  console.log(`[risk] mounted at ${mountPath} — enterprise risk register`);

  return { router, db };
}

module.exports = { setupRisk };
