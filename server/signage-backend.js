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

// MVP per-device signage zones — tiap zone punya auto-content rule per VERTIKAL
const ZONES_BY_VERTICAL = {
  cinema: [
    { id: 'lobby',           label: '🏛️ Lobby',           desc: 'Now showing posters + Coming Soon carousel' },
    { id: 'box-office',      label: '🎟️ Box Office',      desc: 'Jadwal hari ini + harga tier' },
    { id: 'fnb-counter',     label: '🍿 F&B Counter',      desc: 'Menu combo bundles + harga' },
    { id: 'studio-entrance', label: '🚪 Studio Entrance',  desc: 'Film yang lagi tayang + next show' },
    { id: 'window',          label: '🪟 Window/Outdoor',   desc: 'Trailer loops + Coming Soon' },
  ],
  fnb: [
    { id: 'menu-board',      label: '🍔 Menu Board',       desc: 'Menu items + harga (di atas counter)' },
    { id: 'counter-side',    label: '🏪 Counter Side',     desc: 'Promo + combo deals + cashback' },
    { id: 'dining-area',     label: '🪑 Dining Area',      desc: 'Trending menu + brand story + customer reviews' },
    { id: 'pickup',          label: '🛒 Order Pickup',     desc: 'Ready orders queue (no. urut)' },
    { id: 'window',          label: '🪟 Window/Outdoor',   desc: 'Walk-in attractor + new menu launch' },
  ],
};
// Backward-compat alias (kalau ada code lain pakai ZONES default cinema)
const ZONES = ZONES_BY_VERTICAL.cinema;

// Migrations idempotent
const MIGRATIONS = [
  `ALTER TABLE signage_screens ADD COLUMN device_id TEXT`,   // unique token, e.g. TV-JKT01-LOBBY
  `ALTER TABLE signage_screens ADD COLUMN zone TEXT`,         // lobby/box-office/fnb-counter/studio-entrance/window
  `ALTER TABLE signage_screens ADD COLUMN current_playlist_id INTEGER`,
  `ALTER TABLE signage_screens ADD COLUMN last_seen_at INTEGER`,
  `ALTER TABLE signage_screens ADD COLUMN company_id INTEGER`,
];

function setupSignage(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  for (const m of MIGRATIONS) { try { db.exec(m); } catch (e) { /* column already exists */ } }
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_signage_device ON signage_screens(device_id) WHERE device_id IS NOT NULL`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_signage_outlet ON signage_screens(outlet)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_signage_company ON signage_screens(company_id)`); } catch {}

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

  // PATCH/DELETE for media
  router.patch('/media/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM signage_media WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['title', 'media_type', 'duration_sec', 'channel', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE signage_media SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/media/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM signage_media WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  // PATCH/DELETE for screens
  router.patch('/screen/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM signage_screens WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['name', 'screen_type', 'outlet', 'status']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE signage_screens SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/screen/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM signage_screens WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  // ── ZONES META — per-vertical ──
  router.get('/zones', (req, res) => {
    const vertical = String(req.query.vertical || '').toLowerCase();
    if (vertical && ZONES_BY_VERTICAL[vertical]) {
      return res.json({ vertical, zones: ZONES_BY_VERTICAL[vertical] });
    }
    res.json({ zones_by_vertical: ZONES_BY_VERTICAL });
  });

  // ── DEVICES — list per outlet (admin) ──
  router.get('/devices', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? '' : `WHERE company_id = ${parseInt(scope.company_id, 10)}`;
    const rows = db.prepare(`
      SELECT s.*, ROUND((strftime('%s','now') - COALESCE(s.last_seen_at, 0))) AS sec_since_seen
      FROM signage_screens s
      ${where}
      ORDER BY s.outlet, s.zone, s.id
    `).all();
    res.json({ devices: rows.map(d => ({
      ...d,
      is_online: d.last_seen_at && (Date.now() / 1000 - d.last_seen_at < 300), // 5min heartbeat
      player_url: d.device_id ? `/?signage&device=${encodeURIComponent(d.device_id)}` : null,
    })) });
  });

  // ── SEED N devices: outlets × zones (per-vertical) ──
  // POST /devices/seed { outlets:['JKT01',...], vertical: 'cinema'|'fnb' (default cinema), company_id? }
  router.post('/devices/seed', (req, res) => {
    const b = req.body || {};
    const outlets = Array.isArray(b.outlets) ? b.outlets.map(String).filter(Boolean) : [];
    const vertical = (b.vertical || 'cinema').toLowerCase();
    const zonesForVertical = ZONES_BY_VERTICAL[vertical];
    if (!outlets.length) return res.status(400).json({ error: 'outlets[] wajib' });
    if (!zonesForVertical) return res.status(400).json({ error: `vertical tidak dikenal: ${vertical}. Pilihan: ${Object.keys(ZONES_BY_VERTICAL).join(', ')}` });
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || (vertical === 'fnb' ? 1 : 2)) : scope.company_id;

    const created = [];
    const skipped = [];
    const ins = db.prepare(`INSERT INTO signage_screens (name, screen_type, outlet, status, device_id, zone, company_id) VALUES (?,?,?,?,?,?,?)`);
    const exists = db.prepare(`SELECT id FROM signage_screens WHERE device_id = ?`);
    for (const outlet of outlets) {
      const outletCode = String(outlet).toUpperCase();
      for (const z of zonesForVertical) {
        const deviceId = `TV-${outletCode}-${z.id.toUpperCase().replace(/-/g, '_')}`;
        if (exists.get(deviceId)) { skipped.push({ device_id: deviceId, reason: 'exists' }); continue; }
        const name = `${z.label.replace(/^\S+\s/, '')} — ${outletCode}`;
        const info = ins.run(name, 'TV Signage', outletCode, 'online', deviceId, z.id, companyId);
        created.push({ id: info.lastInsertRowid, device_id: deviceId, outlet: outletCode, zone: z.id });
      }
    }
    res.json({ ok: true, vertical, created, skipped, summary: { created: created.length, skipped: skipped.length } });
  });

  // ── PLAYER ENDPOINT — TV fetch this on load + per 60s ──
  // GET /api/signage/player/:device_id
  // Resolve zone → auto-generate content rotation (cinema_films/showtimes/bundles)
  router.get('/player/:device_id', (req, res) => {
    const device = db.prepare(`SELECT * FROM signage_screens WHERE device_id = ?`).get(req.params.device_id);
    if (!device) return res.status(404).json({ error: 'device tidak ditemukan' });

    // Heartbeat: update last_seen_at
    db.prepare(`UPDATE signage_screens SET last_seen_at = strftime('%s','now') WHERE id = ?`).run(device.id);

    const items = [];
    const zone = device.zone || 'lobby';
    const outlet = device.outlet || '';
    const companyId = device.company_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = Math.floor(Date.now() / 1000);

    // Zone-based content generators
    try {
      if (zone === 'lobby') {
        // Now showing posters + Coming soon mini list
        const films = db.prepare(`
          SELECT id, title, poster_url, rating, genre, duration_min, status
          FROM cinema_films WHERE status IN ('now_showing','coming_soon')
            ${companyId ? `AND company_id = ${companyId}` : ''}
          ORDER BY status, title LIMIT 12
        `).all();
        for (const f of films) {
          items.push({
            type: 'film_poster',
            duration_sec: f.status === 'now_showing' ? 12 : 8,
            data: { title: f.title, poster_url: f.poster_url, rating: f.rating, genre: f.genre, status: f.status, duration_min: f.duration_min },
          });
        }
      } else if (zone === 'box-office') {
        // Showtimes hari ini, grouped per studio
        const shows = db.prepare(`
          SELECT s.id, s.show_date, s.start_time, s.price, s.format,
                 f.title AS film_title, f.rating, f.poster_url,
                 st.name AS studio_name, st.studio_type
          FROM cinema_showtimes s
          LEFT JOIN cinema_films f ON f.id = s.film_id
          LEFT JOIN cinema_studios st ON st.id = s.studio_id
          WHERE s.show_date = ? AND COALESCE(s.is_archived,0)=0
            AND COALESCE(s.status,'scheduled')='scheduled'
            ${outlet ? `AND st.outlet = '${outlet.replace(/'/g, "''")}'` : ''}
          ORDER BY s.start_time
          LIMIT 24
        `).all(today);
        items.push({
          type: 'showtimes_today',
          duration_sec: 30,
          data: { date: today, outlet, shows },
        });
      } else if (zone === 'fnb-counter') {
        // Combo bundles + price
        const bundles = db.prepare(`
          SELECT id, name, description, price, image_url, sort_order
          FROM cinema_bundles WHERE is_active = 1
            ${companyId ? `AND company_id = ${companyId}` : ''}
          ORDER BY sort_order, name LIMIT 10
        `).all();
        for (const b of bundles) {
          items.push({
            type: 'fnb_combo',
            duration_sec: 10,
            data: { name: b.name, description: b.description, price: b.price, image_url: b.image_url },
          });
        }
      } else if (zone === 'studio-entrance') {
        // Showtime AKTIF di studio entrance ini — heuristic: cari showtime today di outlet,
        // pilih yang start_time terdekat. Bisa di-refine kalau device ditag ke studio_id spesifik.
        const upcoming = db.prepare(`
          SELECT s.id, s.show_date, s.start_time, s.price, s.format,
                 f.title AS film_title, f.poster_url, f.rating, f.duration_min,
                 st.name AS studio_name, st.studio_type
          FROM cinema_showtimes s
          LEFT JOIN cinema_films f ON f.id = s.film_id
          LEFT JOIN cinema_studios st ON st.id = s.studio_id
          WHERE s.show_date = ? AND COALESCE(s.is_archived,0)=0
            ${outlet ? `AND st.outlet = '${outlet.replace(/'/g, "''")}'` : ''}
          ORDER BY s.start_time LIMIT 4
        `).all(today);
        items.push({
          type: 'studio_now_next',
          duration_sec: 20,
          data: { outlet, upcoming },
        });
      } else if (zone === 'window' && device.zone === 'window') {
        // Cinema window: Trailer URLs untuk now-showing + coming-soon
        // (F&B 'window' di-handle di bawah dengan logic beda)
        const films = db.prepare(`
          SELECT title, poster_url, trailer_url, status, rating
          FROM cinema_films
          WHERE trailer_url IS NOT NULL AND status IN ('now_showing','coming_soon')
            ${companyId ? `AND company_id = ${companyId}` : ''}
          ORDER BY status DESC, title LIMIT 6
        `).all();
        for (const f of films) {
          items.push({
            type: 'trailer',
            duration_sec: 30,
            data: { title: f.title, trailer_url: f.trailer_url, poster_url: f.poster_url, status: f.status, rating: f.rating },
          });
        }
      }

      // ── F&B ZONE HANDLERS ──
      // Detect F&B vertical: zone tidak di cinema list = F&B (atau lookup company)
      if (['menu-board', 'counter-side', 'dining-area', 'pickup'].includes(zone) ||
          (zone === 'window' && items.length === 0)) {
        if (zone === 'menu-board') {
          // F&B menu items (dari MenuContext data via DB kalau ada)
          // Fallback: pakai sample static items
          try {
            const overrides = db.prepare(`SELECT item_id, avail FROM menu_overrides`).all();
            const availMap = new Map(overrides.map(o => [o.item_id, o.avail]));
            // F&B menu source — pakai global menu dari frontend (kalau ada API)
            // Untuk MVP, return placeholder yang frontend bakal merge dengan client-side menu data
            items.push({
              type: 'fnb_menu_grid',
              duration_sec: 60,
              data: { outlet, mode: 'auto-from-menu', available_overrides: availMap.size },
            });
          } catch {}
        } else if (zone === 'counter-side') {
          // F&B promo aktif (promoCodes via /api/promos)
          // Reach via API call — fallback empty
          items.push({
            type: 'fnb_promo_carousel',
            duration_sec: 12,
            data: { outlet, source: '/api/promos' },
          });
        } else if (zone === 'dining-area') {
          // Brand story + customer reviews (kalau ada feedback)
          items.push({
            type: 'fnb_dining',
            duration_sec: 45,
            data: { outlet, modes: ['brand_story', 'top_menu', 'reviews'] },
          });
        } else if (zone === 'pickup') {
          // Live ready orders queue
          try {
            const ready = db.prepare(`
              SELECT id, customer_name, time
              FROM orders
              WHERE status = 'ready'
                ${companyId ? `AND company_id = ${companyId}` : ''}
              ORDER BY time DESC LIMIT 8
            `).all();
            items.push({
              type: 'fnb_pickup_queue',
              duration_sec: 15,
              data: { outlet, ready_orders: ready, refresh_hint: 'live' },
            });
          } catch {}
        } else if (zone === 'window') {
          // F&B window: featured menu + walk-in attractor
          items.push({
            type: 'fnb_window',
            duration_sec: 30,
            data: { outlet, mode: 'walk-in-attractor' },
          });
        }
      }
    } catch (e) {
      console.error('[signage player] zone content error:', e.message);
    }

    // Fallback: brand idle screen kalau tidak ada konten
    if (!items.length) {
      items.push({
        type: 'idle',
        duration_sec: 30,
        data: { brand: 'karyaOS Cinema', message: 'Selamat datang' },
      });
    }

    res.json({
      device: { device_id: device.device_id, outlet: device.outlet, zone: device.zone, name: device.name },
      items, generated_at: now, refresh_sec: 60,
    });
  });

  const mountPath = opts.mountPath || '/api/signage';
  app.use(mountPath, router);
  console.log(`[signage] mounted at ${mountPath} — digital signage CMS + per-device player`);

  return { router, db };
}

module.exports = { setupSignage };
