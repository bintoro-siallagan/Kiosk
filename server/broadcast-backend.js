// server/broadcast-backend.js
// Push Promo Broadcast — admin set promo kilat, langsung tampil di semua
// layar customer-facing (digital signage, POS, kiosk, QR order).
// Use case: outlet sepi → manager push promo → muncul real-time.
//
// Surface ambil via polling GET /active (interval ~20s).
//
//   POST /api/broadcast        — push promo baru { title, message, code, accent, duration_min }
//   GET  /api/broadcast/active — promo yang lagi tayang (atau null)
//   POST /api/broadcast/stop   — stop broadcast
//   GET  /api/broadcast/history — riwayat

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS promo_broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT,
  code TEXT,
  accent TEXT DEFAULT '#f97316',
  active INTEGER DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bc_active ON promo_broadcasts(active);
`;

const nowSec = () => Math.floor(Date.now() / 1000);

function setupBroadcast(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  // Push promo baru — matiin yang lama, tayangkan yang baru
  router.post('/', (req, res) => {
    const { title, message, code, accent, duration_min, created_by } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'judul promo wajib diisi' });
    db.prepare(`UPDATE promo_broadcasts SET active = 0 WHERE active = 1`).run();
    const expires = Number(duration_min) > 0 ? nowSec() + Number(duration_min) * 60 : null;
    const info = db.prepare(`INSERT INTO promo_broadcasts (title, message, code, accent, created_by, expires_at)
      VALUES (?,?,?,?,?,?)`).run(
      String(title).trim(), (message || '').trim() || null, (code || '').trim() || null,
      accent || '#f97316', created_by || 'admin', expires);
    const row = db.prepare(`SELECT * FROM promo_broadcasts WHERE id = ?`).get(info.lastInsertRowid);
    // dorong ke live feed Command Center juga (kalau ada WS)
    try {
      if (typeof global.broadcastPosEvent === 'function') global.broadcastPosEvent('promo_broadcast', { title: row.title, code: row.code });
      if (typeof global.logPosEvent === 'function') global.logPosEvent({ event_type: 'promo_broadcast', payload: { title: row.title }, actor: created_by, severity: 'info' });
    } catch {}
    res.json({ ok: true, broadcast: row });
  });

  // Promo yang lagi tayang
  router.get('/active', (req, res) => {
    const row = db.prepare(`SELECT * FROM promo_broadcasts
      WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY id DESC LIMIT 1`).get(nowSec());
    res.json({ active: row || null });
  });

  // Stop broadcast
  router.post('/stop', (req, res) => {
    const n = db.prepare(`UPDATE promo_broadcasts SET active = 0 WHERE active = 1`).run().changes;
    res.json({ ok: true, stopped: n });
  });

  // Riwayat
  router.get('/history', (req, res) => {
    res.json(db.prepare(`SELECT * FROM promo_broadcasts ORDER BY id DESC LIMIT 20`).all());
  });

  const mountPath = opts.mountPath || '/api/broadcast';
  app.use(mountPath, router);
  console.log(`[broadcast] mounted at ${mountPath} — push promo ke semua layar`);

  return { router, db };
}

module.exports = { setupBroadcast };
