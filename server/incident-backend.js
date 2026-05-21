// server/incident-backend.js
// Incident Management — insiden operasional outlet: equipment, safety,
// service, hygiene, complaint. Lacak active issue → resolusi.
//
//   GET  /api/incidents             — daftar insiden + summary
//   POST /api/incidents             — lapor insiden baru
//   POST /api/incidents/:id/status  — update status / resolusi

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, incident_no TEXT, title TEXT, category TEXT,
  outlet TEXT, severity TEXT, status TEXT DEFAULT 'open', reported_by TEXT,
  description TEXT, resolution TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), resolved_at INTEGER
);
`;
const CATEGORIES = ['Equipment', 'Safety', 'Service', 'Hygiene', 'Complaint'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'resolved'];
const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const nowSec = () => Math.floor(Date.now() / 1000);

function setupIncidents(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM incidents`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO incidents
      (incident_no, title, category, outlet, severity, status, reported_by, description, resolution, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    const no = () => `INC-202605-${String(i++).padStart(3, '0')}`;
    // [title, category, outlet, severity, status, daysAgo, resolution]
    [
      ['Mesin froyo error — tidak dingin', 'Equipment', 'Paskal', 'high', 'in_progress', 1, ''],
      ['AC mati di area dine-in', 'Equipment', 'Dago', 'medium', 'open', 0, ''],
      ['Komplain customer — pesanan lama', 'Complaint', 'Sudirman', 'medium', 'resolved', 3, 'Sudah diselesaikan, kompensasi voucher'],
      ['Lantai licin area kasir', 'Safety', 'BSD City', 'high', 'open', 0, ''],
      ['Suhu chiller tidak stabil', 'Hygiene', 'Kemang', 'critical', 'in_progress', 1, ''],
      ['Antrian panjang jam makan siang', 'Service', 'Paskal', 'low', 'resolved', 5, 'Tambah 1 kasir di peak hour'],
      ['Kebocoran pipa wastafel', 'Equipment', 'Sudirman', 'medium', 'open', 2, ''],
    ].forEach(([t, c, o, sv, st, d, rsl]) => ins.run(no(), t, c, o, sv, st, 'Outlet Manager',
      `Insiden ${c.toLowerCase()} di ${o}`, rsl, N - d * 86400, st === 'resolved' ? N - (d - 1) * 86400 : null));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const incidents = db.prepare(`SELECT * FROM incidents ORDER BY created_at DESC`).all()
      .sort((a, b) => (a.status === 'resolved' ? 1 : 0) - (b.status === 'resolved' ? 1 : 0)
        || (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
    const byCat = {};
    for (const x of incidents) byCat[x.category] = (byCat[x.category] || 0) + 1;
    res.json({
      incidents, categories: CATEGORIES, severities: SEVERITIES,
      summary: {
        open: incidents.filter(x => x.status === 'open').length,
        in_progress: incidents.filter(x => x.status === 'in_progress').length,
        resolved: incidents.filter(x => x.status === 'resolved').length,
        critical: incidents.filter(x => x.severity === 'critical' && x.status !== 'resolved').length,
        by_category: CATEGORIES.map(c => ({ category: c, count: byCat[c] || 0 })),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'judul insiden wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM incidents`).get().c;
    db.prepare(`INSERT INTO incidents (incident_no, title, category, outlet, severity, status, reported_by, description, resolution)
      VALUES (?,?,?,?,?, 'open', ?, ?, '')`).run(
      `INC-202605-${String(n + 1).padStart(3, '0')}`, String(b.title).trim(),
      CATEGORIES.includes(b.category) ? b.category : 'Service', (b.outlet || '-').trim(),
      SEVERITIES.includes(b.severity) ? b.severity : 'medium', (b.reported_by || 'Staff').trim(), (b.description || '').trim());
    res.json({ ok: true });
  });

  router.post('/:id/status', (req, res) => {
    const x = db.prepare(`SELECT * FROM incidents WHERE id = ?`).get(req.params.id);
    if (!x) return res.status(404).json({ error: 'insiden tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE incidents SET status=?, resolution=?, resolved_at=? WHERE id=?`).run(
      st, st === 'resolved' ? ((req.body || {}).resolution || x.resolution || 'Selesai ditangani') : x.resolution,
      st === 'resolved' ? nowSec() : null, x.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/incidents';
  app.use(mountPath, router);
  console.log(`[incidents] mounted at ${mountPath} — incident management`);

  return { router, db };
}

module.exports = { setupIncidents };
