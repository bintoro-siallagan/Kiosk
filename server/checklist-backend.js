// server/checklist-backend.js
// Daily checklist — opening & closing store. Kasir wajib ngerjain
// sebelum mulai shift (opening) dan sebelum tutup shift (closing).
// Item checklist bisa diatur admin (CRUD).
//
// Endpoints di /api/checklist/*:
//   GET    /items?type=      — daftar item aktif
//   POST   /items            — tambah item (admin)
//   PUT    /items/:id        — edit item
//   DELETE /items/:id        — hapus item
//   POST   /submit           — submit checklist yang udah dikerjain
//   GET    /status           — opening/closing hari ini udah selesai belum
//   GET    /submissions      — riwayat (audit)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('opening','closing')),
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS checklist_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('opening','closing')),
  staff_name TEXT,
  items TEXT,
  notes TEXT,
  target REAL,
  mood INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cl_sub_created ON checklist_submissions(created_at);
`;

const DEFAULT_ITEMS = [
  ['opening', 'Lampu & AC nyala', 1],
  ['opening', 'Mesin froyo ON & suhu normal', 2],
  ['opening', 'Kas awal dihitung & dicatat', 3],
  ['opening', 'Area kasir & meja bersih', 4],
  ['opening', 'Stok display & topping cukup', 5],
  ['closing', 'Kas dihitung & cocok dengan sistem', 1],
  ['closing', 'Mesin froyo OFF / mode malam', 2],
  ['closing', 'Sampah dibuang', 3],
  ['closing', 'Area & lantai bersih', 4],
  ['closing', 'Pintu & gembok terkunci', 5],
];

function dayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function setupChecklist(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // Migration DB lama: kolom target (sales target harian dari opening checklist)
  try { db.exec(`ALTER TABLE checklist_submissions ADD COLUMN target REAL`); } catch {}
  try { db.exec(`ALTER TABLE checklist_submissions ADD COLUMN mood INTEGER`); } catch {}

  if (db.prepare(`SELECT COUNT(*) c FROM checklist_items`).get().c === 0) {
    const s = db.prepare(`INSERT INTO checklist_items (type, label, sort_order) VALUES (?,?,?)`);
    for (const [t, l, o] of DEFAULT_ITEMS) s.run(t, l, o);
  }

  const router = express.Router();
  router.use(express.json());

  // ── ITEMS (admin CRUD) ──────────────────────────────────
  router.get('/items', (req, res) => {
    const { type } = req.query;
    let sql = `SELECT * FROM checklist_items WHERE is_active = 1`;
    const p = [];
    if (type) { sql += ` AND type = ?`; p.push(type); }
    sql += ` ORDER BY type, sort_order`;
    res.json(db.prepare(sql).all(...p));
  });

  router.post('/items', (req, res) => {
    const { type, label } = req.body || {};
    if (!['opening', 'closing'].includes(type) || !label || !String(label).trim()) {
      return res.status(400).json({ error: 'type (opening/closing) + label wajib diisi' });
    }
    const max = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) m FROM checklist_items WHERE type = ?`).get(type).m;
    const info = db.prepare(`INSERT INTO checklist_items (type, label, sort_order) VALUES (?,?,?)`)
      .run(type, String(label).trim(), max + 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.put('/items/:id', (req, res) => {
    const b = req.body || {};
    const sets = [], p = [];
    for (const k of ['label', 'sort_order', 'is_active']) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      p.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    p.push(req.params.id);
    db.prepare(`UPDATE checklist_items SET ${sets.join(', ')} WHERE id = ?`).run(...p);
    res.json({ ok: true });
  });

  router.delete('/items/:id', (req, res) => {
    db.prepare(`DELETE FROM checklist_items WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── SUBMIT ──────────────────────────────────────────────
  router.post('/submit', (req, res) => {
    const { type, staff_name, checked, notes } = req.body || {};
    if (!['opening', 'closing'].includes(type)) return res.status(400).json({ error: 'type invalid' });
    const items = db.prepare(`SELECT id, label FROM checklist_items WHERE type = ? AND is_active = 1 ORDER BY sort_order`).all(type);
    if (!items.length) return res.status(400).json({ error: 'belum ada item checklist' });
    const checkedSet = new Set((checked || []).map(Number));
    const missing = items.filter(i => !checkedSet.has(i.id));
    if (missing.length) {
      return res.status(400).json({ error: `${missing.length} item belum di-ceklis`, missing: missing.map(m => m.label) });
    }
    const snapshot = items.map(i => ({ id: i.id, label: i.label, checked: true }));
    const target = (type === 'opening' && Number(req.body.target) > 0) ? Number(req.body.target) : null;
    const moodN = Number(req.body.mood);
    const mood = (type === 'opening' && moodN >= 1 && moodN <= 5) ? moodN : null;
    const info = db.prepare(`INSERT INTO checklist_submissions (type, staff_name, items, notes, target, mood) VALUES (?,?,?,?,?,?)`)
      .run(type, staff_name || null, JSON.stringify(snapshot), (notes || '').trim() || null, target, mood);
    try {
      if (typeof global.logPosEvent === 'function') global.logPosEvent({
        event_type: 'checklist_' + type, event_subtype: 'store',
        payload: { staff: staff_name, item_count: items.length }, actor: staff_name, severity: 'info',
      });
    } catch {}
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  // ── STATUS hari ini — buat gate shift ───────────────────
  router.get('/status', (req, res) => {
    const from = dayStart();
    const latest = (t) => db.prepare(
      `SELECT staff_name, created_at, target FROM checklist_submissions WHERE type = ? AND created_at >= ? ORDER BY id DESC LIMIT 1`
    ).get(t, from);
    const o = latest('opening'), c = latest('closing');
    res.json({
      date: new Date().toISOString().slice(0, 10),
      opening: { done: !!o, by: o?.staff_name || null, at: o?.created_at || null, target: o?.target || null },
      closing: { done: !!c, by: c?.staff_name || null, at: c?.created_at || null },
    });
  });

  // ── SUBMISSIONS (audit) ─────────────────────────────────
  router.get('/submissions', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(
      db.prepare(`SELECT * FROM checklist_submissions ORDER BY created_at DESC LIMIT ?`).all(limit)
        .map(r => ({ ...r, items: JSON.parse(r.items || '[]') }))
    );
  });

  const mountPath = opts.mountPath || '/api/checklist';
  app.use(mountPath, router);
  console.log(`[checklist] mounted at ${mountPath} — opening/closing store`);

  return { router, db };
}

module.exports = { setupChecklist };
