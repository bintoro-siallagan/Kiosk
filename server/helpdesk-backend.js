// server/helpdesk-backend.js
// Helpdesk / Complaint Management — tiket komplain pelanggan + SLA.
//
//   GET  /api/helpdesk            — daftar tiket + summary
//   POST /api/helpdesk            — buat tiket
//   POST /api/helpdesk/:id/status — update status { status }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_no TEXT, subject TEXT, category TEXT,
  customer TEXT, outlet TEXT, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open',
  owner TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), resolved_at INTEGER
);
`;
const CATEGORIES = ['Komplain Produk', 'Komplain Layanan', 'Kebersihan', 'Pembayaran', 'Saran', 'Lainnya'];
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400, HOUR = 3600;

function setupHelpdesk(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM helpdesk_tickets`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO helpdesk_tickets (ticket_no, subject, category, customer, outlet, priority, status, owner, created_at, resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    let i = 1;
    // [subject, category, customer, outlet, priority, status, owner, createdHrsAgo, resolvedHrsAfter|null]
    [
      ['Froyo basi / rasa aneh', 'Komplain Produk', 'Rina S.', 'Paskal', 'high', 'open', 'CS Team', 6, null],
      ['Kasir tidak ramah', 'Komplain Layanan', 'Budi H.', 'Sudirman', 'medium', 'in_progress', 'Ops', 20, null],
      ['Meja kotor tidak dibersihkan', 'Kebersihan', 'Maya P.', 'Dago', 'medium', 'open', 'CS Team', 30, null],
      ['QRIS gagal tapi saldo kepotong', 'Pembayaran', 'Anton W.', 'BSD City', 'high', 'in_progress', 'Finance', 14, null],
      ['Antrian terlalu lama', 'Komplain Layanan', 'Dewi L.', 'Kemang', 'low', 'resolved', 'Ops', 72, 48],
      ['Topping kurang dari foto', 'Komplain Produk', 'Hendra S.', 'Paskal', 'medium', 'resolved', 'CS Team', 96, 70],
      ['Saran tambah varian vegan', 'Saran', 'Lina H.', 'Sudirman', 'low', 'closed', 'Marketing', 120, 100],
    ].forEach(([s, c, cu, ol, pr, st, ow, ch, rh]) =>
      ins.run(`TKT-${String(i++).padStart(3, '0')}`, s, c, cu, ol, pr, st, ow, N - ch * HOUR, rh != null ? N - (ch - rh) * HOUR : null));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const N = nowSec();
    const rows = db.prepare(`SELECT * FROM helpdesk_tickets ORDER BY created_at DESC`).all().map(r => ({
      ...r,
      age_hours: Math.floor((N - r.created_at) / HOUR),
      resolution_hours: r.resolved_at ? Math.round((r.resolved_at - r.created_at) / HOUR) : null,
      sla_breach: !['resolved', 'closed'].includes(r.status) && (N - r.created_at) > (r.priority === 'high' ? 24 : 72) * HOUR,
    }));
    const done = rows.filter(r => r.resolution_hours != null);
    res.json({
      tickets: rows, categories: CATEGORIES, priorities: PRIORITIES,
      summary: {
        total: rows.length,
        open: rows.filter(r => ['open', 'in_progress'].includes(r.status)).length,
        resolved: rows.filter(r => ['resolved', 'closed'].includes(r.status)).length,
        sla_breach: rows.filter(r => r.sla_breach).length,
        avg_resolution: done.length ? Math.round(done.reduce((a, r) => a + r.resolution_hours, 0) / done.length) : 0,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.subject || !String(b.subject).trim()) return res.status(400).json({ error: 'subjek tiket wajib' });
    if (!CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'kategori tidak valid' });
    const n = db.prepare(`SELECT COUNT(*) c FROM helpdesk_tickets`).get().c;
    db.prepare(`INSERT INTO helpdesk_tickets (ticket_no, subject, category, customer, outlet, priority, status, owner) VALUES (?,?,?,?,?,?,'open',?)`)
      .run(`TKT-${String(n + 1).padStart(3, '0')}`, String(b.subject).trim(), b.category, b.customer || '-',
        b.outlet || '-', PRIORITIES.includes(b.priority) ? b.priority : 'medium', b.owner || 'CS Team');
    res.json({ ok: true });
  });

  router.post('/:id/status', (req, res) => {
    const t = db.prepare(`SELECT * FROM helpdesk_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'tiket tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    const resolvedAt = ['resolved', 'closed'].includes(st) ? (t.resolved_at || nowSec()) : null;
    db.prepare(`UPDATE helpdesk_tickets SET status = ?, resolved_at = ? WHERE id = ?`).run(st, resolvedAt, t.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/helpdesk';
  app.use(mountPath, router);
  console.log(`[helpdesk] mounted at ${mountPath} — helpdesk / complaint tickets`);

  return { router, db };
}

module.exports = { setupHelpdesk };
