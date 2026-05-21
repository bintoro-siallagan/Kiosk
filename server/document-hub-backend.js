// server/document-hub-backend.js
// Document / SOP Hub — repositori SOP, kebijakan & work instruction.
// Versioning + tracking acknowledge.
//
//   GET  /api/document-hub             — daftar dokumen + summary
//   POST /api/document-hub             — tambah dokumen
//   POST /api/document-hub/:id/ack     — catat acknowledge
//   POST /api/document-hub/:id/publish — publish dokumen

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sop_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT, category TEXT,
  version TEXT DEFAULT 'v1.0', owner TEXT, status TEXT DEFAULT 'draft',
  acknowledged INTEGER DEFAULT 0, audience INTEGER DEFAULT 50,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const CATEGORIES = ['SOP', 'Kebijakan', 'Work Instruction', 'Formulir'];
const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupDocumentHub(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM sop_documents`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO sop_documents (code, title, category, version, owner, status, acknowledged, audience, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    let i = 1;
    // [title, category, version, owner, status, ack, audience, daysAgo]
    [
      ['SOP Pembukaan & Penutupan Outlet', 'SOP', 'v2.1', 'Ops Manager', 'published', 48, 52, 12],
      ['SOP Higiene & Keamanan Pangan', 'SOP', 'v3.0', 'QA Manager', 'published', 50, 52, 8],
      ['Kebijakan Refund & Komplain', 'Kebijakan', 'v1.2', 'Ops Manager', 'published', 39, 52, 20],
      ['Work Instruction Mesin Soft Serve', 'Work Instruction', 'v1.0', 'Maintenance', 'published', 22, 30, 30],
      ['SOP Stock Opname & FEFO', 'SOP', 'v2.0', 'Warehouse Mgr', 'published', 18, 28, 5],
      ['Kebijakan Disiplin & Kehadiran', 'Kebijakan', 'v1.1', 'HRD', 'published', 44, 52, 40],
      ['Formulir Serah Terima Shift', 'Formulir', 'v1.0', 'Ops Manager', 'published', 0, 52, 3],
      ['SOP Penanganan Insiden Pelanggan', 'SOP', 'v1.0', 'QA Manager', 'draft', 0, 52, 1],
    ].forEach(([t, c, v, o, s, ack, aud, d]) => ins.run(`DOC-${String(i++).padStart(3, '0')}`, t, c, v, o, s, ack, aud, N - d * DAY));
  }

  const shape = (r) => ({ ...r, ack_pct: r.audience ? Math.round(r.acknowledged / r.audience * 100) : 0 });

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM sop_documents ORDER BY updated_at DESC`).all().map(shape);
    const pub = rows.filter(r => r.status === 'published');
    res.json({
      documents: rows, categories: CATEGORIES,
      summary: {
        total: rows.length,
        published: pub.length,
        draft: rows.filter(r => r.status === 'draft').length,
        avg_ack: pub.length ? Math.round(pub.reduce((a, r) => a + r.ack_pct, 0) / pub.length) : 0,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'judul dokumen wajib' });
    if (!CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'kategori tidak valid' });
    const n = db.prepare(`SELECT COUNT(*) c FROM sop_documents`).get().c;
    db.prepare(`INSERT INTO sop_documents (code, title, category, version, owner, status, acknowledged, audience, updated_at) VALUES (?,?,?,?,?,'draft',0,?,?)`)
      .run(`DOC-${String(n + 1).padStart(3, '0')}`, String(b.title).trim(), b.category, b.version || 'v1.0', b.owner || '-', Number(b.audience) || 52, nowSec());
    res.json({ ok: true });
  });

  router.post('/:id/ack', (req, res) => {
    const d = db.prepare(`SELECT * FROM sop_documents WHERE id = ?`).get(req.params.id);
    if (!d) return res.status(404).json({ error: 'dokumen tidak ditemukan' });
    if (d.status !== 'published') return res.status(409).json({ error: 'dokumen belum dipublish' });
    db.prepare(`UPDATE sop_documents SET acknowledged = MIN(audience, acknowledged + 1) WHERE id = ?`).run(d.id);
    res.json({ ok: true });
  });

  router.post('/:id/publish', (req, res) => {
    const d = db.prepare(`SELECT * FROM sop_documents WHERE id = ?`).get(req.params.id);
    if (!d) return res.status(404).json({ error: 'dokumen tidak ditemukan' });
    db.prepare(`UPDATE sop_documents SET status = 'published', updated_at = ? WHERE id = ?`).run(nowSec(), d.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/document-hub';
  app.use(mountPath, router);
  console.log(`[document-hub] mounted at ${mountPath} — SOP & document repository`);

  return { router, db };
}

module.exports = { setupDocumentHub };
