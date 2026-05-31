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
  // ─── F&B BASE ───
  ['opening', 'Lampu & AC nyala', 1],
  ['opening', 'Mesin froyo ON & suhu normal', 2],
  ['opening', 'Kas awal dihitung & dicatat', 3],
  ['opening', 'Area kasir & meja bersih', 4],
  ['opening', 'Stok display & topping cukup', 5],

  // ─── 🎬 CINEMA — START DAY ROUTINE ───
  // Sistem & teknologi
  ['opening', '💻 POS Cinema, CDS, KDS terbuka & online', 10],
  ['opening', '🌐 Internet/WiFi stabil (cek ping)', 11],
  ['opening', '🖨️ Printer thermal tiket test print OK', 12],
  ['opening', '💳 EDC card reader test transaction OK', 13],
  ['opening', '📲 Mesin QRIS test scan OK', 14],
  // Studio fisik
  ['opening', '🎬 Studio 1: kursi bersih, rapi, tidak rusak', 20],
  ['opening', '🎬 Studio 2: kursi bersih, rapi, tidak rusak', 21],
  ['opening', '🎬 Proyektor test (gambar tajam, fokus benar)', 22],
  ['opening', '🎬 Sound system test (Dolby/surround OK)', 23],
  ['opening', '🎬 AC studio nyala & suhu 22-24°C', 24],
  ['opening', '🎬 Layar bersih (no debu/noda)', 25],
  ['opening', '🚪 Pintu darurat tidak terhalang & berfungsi', 26],
  ['opening', '🚨 Alat pemadam api ditempat & belum expired', 27],
  // F&B counter
  ['opening', '🍿 Mesin popcorn pre-heat & ready', 30],
  ['opening', '🥤 Refrigerator F&B suhu normal (4-8°C)', 31],
  ['opening', '🧊 Ice maker berfungsi & ada stok ice', 32],
  ['opening', '🍿 Stok F&B (popcorn, drink, snack) cukup', 33],
  ['opening', '📋 Bundle catalog up-to-date di POS', 34],
  // Operasional
  ['opening', '🚻 Toilet bersih + supplies (tissue, sabun, dispenser)', 40],
  ['opening', '🌡️ AC lobby nyala & suhu nyaman', 41],
  ['opening', '🎵 Background music lobby ON', 42],
  ['opening', '👥 Briefing staff harian selesai', 43],
  ['opening', '👔 Seragam & name tag staff lengkap', 44],
  ['opening', '🪪 Cek jadwal shift staff hari ini', 45],

  // ─── F&B BASE CLOSING ───
  ['closing', 'Kas dihitung & cocok dengan sistem', 1],
  ['closing', 'Mesin froyo OFF / mode malam', 2],
  ['closing', 'Sampah dibuang', 3],
  ['closing', 'Area & lantai bersih', 4],

  // ─── 🎬 CINEMA — CLOSE DAY ROUTINE ───
  // Studio shutdown
  ['closing', '🎬 Showtime terakhir selesai, semua penonton keluar', 10],
  ['closing', '🎬 Proyektor OFF (lampu cooling dulu)', 11],
  ['closing', '🎬 Sound system OFF', 12],
  ['closing', '🎬 AC studio set ke night mode / OFF', 13],
  ['closing', '🎬 Sampah studio dibersihkan (popcorn, gelas, dll)', 14],
  ['closing', '🎬 Kursi rapi (lipat sandaran kalau perlu)', 15],
  // F&B shutdown
  ['closing', '🍿 Mesin popcorn OFF & bersihkan', 20],
  ['closing', '🥤 Refrigerator F&B di-lock', 21],
  ['closing', '🧊 Ice maker OFF (atau biarkan kalau auto)', 22],
  ['closing', '🍿 F&B counter dibereskan & dilap', 23],
  ['closing', '📦 Sisa stock dicatat untuk re-order besok', 24],
  // Reporting & cash
  ['closing', '💰 Print Z-report end of day', 30],
  ['closing', '💰 Cash di-deposit ke brankas', 31],
  ['closing', '📊 Submit daily report ke central (WA/email)', 32],
  ['closing', '💾 Database backup auto OK (cek log)', 33],
  // Operasional
  ['closing', '🚻 Toilet di-clean ulang', 40],
  ['closing', '🌡️ AC lobby OFF / night mode', 41],
  ['closing', '🎵 Background music OFF', 42],
  ['closing', '💡 Lampu utama OFF (tinggal lampu emergency)', 43],
  ['closing', '🔐 Pintu masuk & emergency dilock', 44],
  ['closing', '🚨 Setel alarm cinema', 45],
  ['closing', '📅 Cek jadwal staff besok', 46],
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
  // Vertical scoping — fnb / cinema / null (shared). F&B kasir gak lihat cinema items.
  try { db.exec(`ALTER TABLE checklist_items ADD COLUMN vertical TEXT`); } catch {}

  // Cinema emoji prefixes utk auto-tag existing items (one-time migration)
  const CINEMA_EMOJIS = ['🎬', '🍿', '🥤', '🧊', '💻', '🌐', '🖨️', '💳', '📲', '🚪', '🚨', '🚻', '🌡️', '🎵', '👥', '👔', '🪪', '💰', '📊', '💾', '💡', '🔐', '📅', '📦', '📋'];
  const isCinemaLabel = (label) => CINEMA_EMOJIS.some(e => String(label || '').startsWith(e));

  if (db.prepare(`SELECT COUNT(*) c FROM checklist_items`).get().c === 0) {
    const s = db.prepare(`INSERT INTO checklist_items (type, label, sort_order, vertical) VALUES (?,?,?,?)`);
    for (const [t, l, o] of DEFAULT_ITEMS) s.run(t, l, o, isCinemaLabel(l) ? 'cinema' : 'fnb');
  } else {
    // Auto-tag existing items yg masih NULL vertical (one-time backfill)
    try {
      const untagged = db.prepare(`SELECT id, label FROM checklist_items WHERE vertical IS NULL`).all();
      if (untagged.length > 0) {
        const upd = db.prepare(`UPDATE checklist_items SET vertical = ? WHERE id = ?`);
        let tagged = 0;
        for (const item of untagged) {
          upd.run(isCinemaLabel(item.label) ? 'cinema' : 'fnb', item.id);
          tagged++;
        }
        if (tagged > 0) console.log(`[checklist] auto-tagged ${tagged} items by emoji prefix (cinema/fnb)`);
      }
    } catch (e) { console.warn('[checklist] auto-tag fail:', e.message); }
  }

  const router = express.Router();
  router.use(express.json());

  // ── ITEMS (admin CRUD) ──────────────────────────────────
  // ?vertical=fnb|cinema  → filter items per vertical (selain NULL = shared)
  // Tanpa filter = return semua (admin master view).
  router.get('/items', (req, res) => {
    const { type, vertical } = req.query;
    let sql = `SELECT * FROM checklist_items WHERE is_active = 1`;
    const p = [];
    if (type) { sql += ` AND type = ?`; p.push(type); }
    if (vertical) { sql += ` AND (vertical = ? OR vertical IS NULL)`; p.push(vertical); }
    sql += ` ORDER BY type, sort_order`;
    res.json(db.prepare(sql).all(...p));
  });

  router.post('/items', (req, res) => {
    const { type, label, vertical } = req.body || {};
    if (!['opening', 'closing'].includes(type) || !label || !String(label).trim()) {
      return res.status(400).json({ error: 'type (opening/closing) + label wajib diisi' });
    }
    // vertical optional — kalau null/empty, item dianggap universal (apply ke semua POS).
    // Allowed values: 'fnb' | 'cinema' | null.
    const v = vertical && ['fnb', 'cinema'].includes(vertical) ? vertical : null;
    const max = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) m FROM checklist_items WHERE type = ?`).get(type).m;
    const info = db.prepare(`INSERT INTO checklist_items (type, label, sort_order, vertical) VALUES (?,?,?,?)`)
      .run(type, String(label).trim(), max + 1, v);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.put('/items/:id', (req, res) => {
    const b = req.body || {};
    const sets = [], p = [];
    // vertical updatable juga — admin bisa pindahkan item dari fnb ke cinema or universal.
    for (const k of ['label', 'sort_order', 'is_active', 'vertical']) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      let val = b[k];
      if (k === 'vertical') {
        val = val && ['fnb', 'cinema'].includes(val) ? val : null;
      } else if (typeof val === 'boolean') {
        val = val ? 1 : 0;
      }
      p.push(val);
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
    const { type, staff_name, checked, notes, vertical } = req.body || {};
    if (!['opening', 'closing'].includes(type)) return res.status(400).json({ error: 'type invalid' });
    // Filter items by vertical kalau client kirim — match frontend filter di GET /items.
    // Tanpa ini, frontend POS F&B submit 5 items tapi backend cek vs semua 27 (incl cinema)
    // → response "22 item belum di-ceklis" walaupun semua F&B items udah diceklis.
    let sql = `SELECT id, label FROM checklist_items WHERE type = ? AND is_active = 1`;
    const params = [type];
    if (vertical) { sql += ` AND (vertical = ? OR vertical IS NULL)`; params.push(vertical); }
    sql += ` ORDER BY sort_order`;
    const items = db.prepare(sql).all(...params);
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
  // Filter: created_at >= max(dayStart, dayOpenedAt). Tiap "Open Day" baru
  // reset checklist agar kasir wajib isi ulang per cycle.
  router.get('/status', (req, res) => {
    const dayStartTs = dayStart();
    const vertical = String(req.query.vertical || 'fnb').toLowerCase();
    const dayOpenedAtMs = typeof opts.getDayOpenedAt === 'function' ? opts.getDayOpenedAt(vertical) : null;
    const dayOpenedAtSec = dayOpenedAtMs ? Math.floor(dayOpenedAtMs / 1000) : 0;
    const from = Math.max(dayStartTs, dayOpenedAtSec);
    const latest = (t) => db.prepare(
      `SELECT staff_name, created_at, target FROM checklist_submissions WHERE type = ? AND created_at >= ? ORDER BY id DESC LIMIT 1`
    ).get(t, from);
    const o = latest('opening'), c = latest('closing');
    res.json({
      date: new Date().toISOString().slice(0, 10),
      cycleSince: from,
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
