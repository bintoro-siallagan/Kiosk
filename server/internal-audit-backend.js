// server/internal-audit-backend.js
// Internal Audit — audit-program: jadwal audit, temuan, corrective
// action & follow-up. (beda dari Self-Audit otomatis)
//
//   GET  /api/internal-audit            — daftar audit + temuan
//   POST /api/internal-audit            — jadwalkan audit
//   POST /api/internal-audit/:id/status — update status { status }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS internal_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT, area TEXT,
  auditor TEXT, period TEXT, status TEXT DEFAULT 'scheduled', rating TEXT,
  findings TEXT DEFAULT '[]', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const AREAS = ['Keuangan', 'Operasional', 'Inventory', 'SDM / HR', 'Compliance'];
const STATUSES = ['scheduled', 'in_progress', 'completed'];
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupInternalAudit(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM internal_audits`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO internal_audits (code, title, area, auditor, period, status, rating, findings) VALUES (?,?,?,?,?,?,?,?)`);
    let i = 1;
    // [title, area, auditor, period, status, rating, findings[[finding,severity,action,status]]]
    [
      ['Audit Kas & Rekonsiliasi', 'Keuangan', 'Internal Auditor', 'Q2 2026', 'completed', 'Memuaskan',
        [['Selisih kas kecil Rp 50rb di Kemang', 'Rendah', 'Edukasi kasir + cash count harian', 'closed']]],
      ['Audit Pengelolaan Stok', 'Inventory', 'Internal Auditor', 'Q2 2026', 'completed', 'Perlu Perbaikan',
        [['FEFO tidak diterapkan konsisten', 'Tinggi', 'Pelatihan ulang + audit batch mingguan', 'in_progress'],
         ['Stok opname terlambat 2 minggu', 'Sedang', 'Jadwalkan opname terkunci di sistem', 'open']]],
      ['Audit Kepatuhan Perizinan', 'Compliance', 'QA Manager', 'Q2 2026', 'in_progress', null, []],
      ['Audit Proses Rekrutmen', 'SDM / HR', 'Internal Auditor', 'Q3 2026', 'scheduled', null, []],
      ['Audit SOP Operasional Outlet', 'Operasional', 'QA Manager', 'Q3 2026', 'scheduled', null, []],
    ].forEach(([t, a, au, p, s, r, f]) => ins.run(`IA-${String(i++).padStart(3, '0')}`, t, a, au, p, s, r,
      JSON.stringify(f.map(([finding, severity, action, st]) => ({ finding, severity, corrective_action: action, status: st })))));
  }

  const shape = (r) => {
    const findings = J(r.findings);
    return { ...r, findings, findings_count: findings.length, open_findings: findings.filter(f => f.status !== 'closed').length };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM internal_audits ORDER BY id DESC`).all().map(shape);
    res.json({
      audits: rows, areas: AREAS,
      summary: {
        total: rows.length,
        scheduled: rows.filter(r => r.status === 'scheduled').length,
        in_progress: rows.filter(r => r.status === 'in_progress').length,
        completed: rows.filter(r => r.status === 'completed').length,
        open_findings: rows.reduce((a, r) => a + r.open_findings, 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'judul audit wajib' });
    if (!AREAS.includes(b.area)) return res.status(400).json({ error: 'area tidak valid' });
    const n = db.prepare(`SELECT COUNT(*) c FROM internal_audits`).get().c;
    db.prepare(`INSERT INTO internal_audits (code, title, area, auditor, period, status, findings) VALUES (?,?,?,?,?,'scheduled','[]')`)
      .run(`IA-${String(n + 1).padStart(3, '0')}`, String(b.title).trim(), b.area, b.auditor || '-', b.period || '-');
    res.json({ ok: true });
  });

  router.post('/:id/status', (req, res) => {
    const a = db.prepare(`SELECT * FROM internal_audits WHERE id = ?`).get(req.params.id);
    if (!a) return res.status(404).json({ error: 'audit tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE internal_audits SET status = ? WHERE id = ?`).run(st, a.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM internal_audits WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // Completed audits become immutable audit-log — block edits
    if (row.status === 'completed') {
      return res.status(403).json({ error: 'audit sudah selesai — immutable audit log, tidak bisa diubah' });
    }
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['title', 'area', 'auditor', 'period', 'status', 'rating', 'findings']) {
      if (b[k] !== undefined) {
        fields.push(`${k} = ?`);
        args.push(k === 'findings' && typeof b[k] !== 'string' ? JSON.stringify(b[k]) : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE internal_audits SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM internal_audits WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    // Only allow delete on scheduled (draft) audits — in-progress & completed are part of audit log
    if (row.status !== 'scheduled') {
      return res.status(403).json({ error: 'hanya audit dijadwalkan yang bisa dihapus — audit berjalan/selesai immutable' });
    }
    db.prepare(`DELETE FROM internal_audits WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/internal-audit';
  app.use(mountPath, router);
  console.log(`[internal-audit] mounted at ${mountPath} — internal audit program`);

  return { router, db };
}

module.exports = { setupInternalAudit };
