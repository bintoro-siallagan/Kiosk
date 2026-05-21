// server/signage-backend.js
// Digital Signage CMS — kelola layar (TV menu board, second display,
// kiosk media) & konten media (image, video, banner, promo).
//
//   GET  /api/signage                  — layar + media + summary
//   POST /api/signage/screen/:id/toggle — online / offline layar
//   POST /api/signage/media            — tambah media
//   POST /api/signage/media/:id/toggle — aktif / nonaktif media

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS signage_screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, screen_type TEXT, outlet TEXT,
  status TEXT DEFAULT 'online', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS signage_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, media_type TEXT, duration_sec INTEGER,
  channel TEXT, status TEXT DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const MEDIA_TYPES = ['Image', 'Video', 'Banner', 'Promo'];
const CHANNELS = ['TV Menu', 'Second Display', 'Kiosk Media'];

function setupSignage(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM signage_screens`).get().c === 0) {
    const sc = db.prepare(`INSERT INTO signage_screens (name, screen_type, outlet, status) VALUES (?,?,?,?)`);
    [
      ['Menu Board Utama', 'TV Menu', 'Paskal', 'online'], ['Menu Board Utama', 'TV Menu', 'Dago', 'online'],
      ['Display Kasir', 'Second Display', 'Paskal', 'online'], ['Kiosk Self-Order', 'Kiosk Media', 'BSD City', 'offline'],
      ['Menu Board Utama', 'TV Menu', 'Sudirman', 'online'], ['Display Kasir', 'Second Display', 'Kemang', 'offline'],
    ].forEach(r => sc.run(...r));
  }
  if (db.prepare(`SELECT COUNT(*) c FROM signage_media`).get().c === 0) {
    const md = db.prepare(`INSERT INTO signage_media (title, media_type, duration_sec, channel, status) VALUES (?,?,?,?,?)`);
    [
      ['Menu Froyo Signature', 'Image', 15, 'TV Menu', 'active'], ['Promo Payday 25%', 'Banner', 10, 'TV Menu', 'active'],
      ['Video Brand Story', 'Video', 30, 'Second Display', 'active'], ['Cinema Combo Promo', 'Promo', 12, 'Kiosk Media', 'active'],
      ['New Topping Launch', 'Image', 15, 'TV Menu', 'scheduled'], ['Idle Screensaver Loop', 'Video', 60, 'Kiosk Media', 'active'],
      ['Member Reward Banner', 'Banner', 8, 'Second Display', 'active'], ['Weekend Special', 'Promo', 12, 'TV Menu', 'inactive'],
    ].forEach(r => md.run(...r));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const screens = db.prepare(`SELECT * FROM signage_screens ORDER BY outlet, screen_type`).all();
    const media = db.prepare(`SELECT * FROM signage_media ORDER BY status, id`).all();
    res.json({
      screens, media, media_types: MEDIA_TYPES, channels: CHANNELS,
      summary: {
        screens: screens.length,
        online: screens.filter(s => s.status === 'online').length,
        media: media.length,
        active_media: media.filter(m => m.status === 'active').length,
      },
    });
  });

  router.post('/screen/:id/toggle', (req, res) => {
    const s = db.prepare(`SELECT * FROM signage_screens WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'layar tidak ditemukan' });
    db.prepare(`UPDATE signage_screens SET status = ? WHERE id = ?`).run(s.status === 'online' ? 'offline' : 'online', s.id);
    res.json({ ok: true });
  });

  router.post('/media', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'judul media wajib' });
    db.prepare(`INSERT INTO signage_media (title, media_type, duration_sec, channel, status) VALUES (?,?,?,?, 'active')`)
      .run(String(b.title).trim(), MEDIA_TYPES.includes(b.media_type) ? b.media_type : 'Image',
        Number(b.duration_sec) || 15, CHANNELS.includes(b.channel) ? b.channel : 'TV Menu');
    res.json({ ok: true });
  });

  router.post('/media/:id/toggle', (req, res) => {
    const m = db.prepare(`SELECT * FROM signage_media WHERE id = ?`).get(req.params.id);
    if (!m) return res.status(404).json({ error: 'media tidak ditemukan' });
    db.prepare(`UPDATE signage_media SET status = ? WHERE id = ?`).run(m.status === 'active' ? 'inactive' : 'active', m.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/signage';
  app.use(mountPath, router);
  console.log(`[signage] mounted at ${mountPath} — digital signage CMS`);

  return { router, db };
}

module.exports = { setupSignage };
