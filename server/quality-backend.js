// server/quality-backend.js
// Quality & Food Safety — inspeksi mutu, food safety audit & HACCP.
//
//   GET  /api/quality   — inspeksi + skor + summary
//   POST /api/quality   — catat inspeksi baru

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quality_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, type TEXT, outlet TEXT,
  inspector TEXT, score REAL, findings TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const TYPES = ['Inspeksi Mutu', 'Food Safety Audit', 'HACCP Check', 'Audit Kebersihan'];
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const resultOf = (s) => s >= 85 ? 'passed' : s >= 70 ? 'conditional' : 'failed';
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupQuality(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM quality_inspections`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO quality_inspections (code, type, outlet, inspector, score, findings, created_at) VALUES (?,?,?,?,?,?,?)`);
    const N = nowSec();
    let i = 1;
    // [type, outlet, inspector, score, findings[], daysAgo]
    [
      ['Food Safety Audit', 'Paskal', 'QA Auditor', 92, ['Suhu chiller sedikit di atas standar'], 2],
      ['Inspeksi Mutu', 'Sudirman', 'Supervisor QC', 88, [], 3],
      ['HACCP Check', 'Central Kitchen', 'QA Manager', 78, ['Log suhu pemasakan tidak lengkap', 'Label tanggal produksi pudar'], 5],
      ['Audit Kebersihan', 'Dago', 'Supervisor QC', 95, [], 6],
      ['Food Safety Audit', 'Kemang', 'QA Auditor', 64, ['Bahan baku disimpan tanpa FEFO', 'Area cuci tangan tidak ada sabun', 'Sampah menumpuk di area dapur'], 8],
      ['HACCP Check', 'BSD City', 'QA Manager', 86, ['Cek kalibrasi termometer'], 10],
    ].forEach(([ty, ol, insp, sc, f, d]) => ins.run(`QC-${String(i++).padStart(3, '0')}`, ty, ol, insp, sc, JSON.stringify(f), N - d * DAY));
  }

  const shape = (r) => ({ ...r, findings: J(r.findings), result: resultOf(r.score) });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM quality_inspections ORDER BY created_at DESC`).all().map(shape);
    res.json({
      inspections: rows, types: TYPES,
      summary: {
        total: rows.length,
        avg_score: rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : 0,
        passed: rows.filter(r => r.result === 'passed').length,
        failed: rows.filter(r => r.result === 'failed').length,
        open_findings: rows.reduce((a, r) => a + r.findings.length, 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!TYPES.includes(b.type)) return res.status(400).json({ error: 'jenis inspeksi tidak valid' });
    if (!b.outlet) return res.status(400).json({ error: 'outlet wajib' });
    const score = Math.max(0, Math.min(100, Math.round(Number(b.score) || 0)));
    const findings = Array.isArray(b.findings) ? b.findings.filter(Boolean).map(String)
      : String(b.findings || '').split('\n').map(s => s.trim()).filter(Boolean);
    const n = db.prepare(`SELECT COUNT(*) c FROM quality_inspections`).get().c;
    db.prepare(`INSERT INTO quality_inspections (code, type, outlet, inspector, score, findings) VALUES (?,?,?,?,?,?)`)
      .run(`QC-${String(n + 1).padStart(3, '0')}`, b.type, String(b.outlet).trim(), b.inspector || '-', score, JSON.stringify(findings));
    res.json({ ok: true, result: resultOf(score) });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM quality_inspections WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['code', 'type', 'outlet', 'inspector', 'score']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (b.findings !== undefined) {
      const findings = Array.isArray(b.findings) ? b.findings.filter(Boolean).map(String)
        : String(b.findings || '').split('\n').map(s => s.trim()).filter(Boolean);
      fields.push(`findings = ?`); args.push(JSON.stringify(findings));
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE quality_inspections SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM quality_inspections WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/quality';
  app.use(mountPath, router);
  console.log(`[quality] mounted at ${mountPath} — quality & food safety`);

  return { router, db };
}

module.exports = { setupQuality };
