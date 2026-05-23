// server/cinema-backend.js
// Cinema Operations — film catalog, studios/screens, and showtimes.
// karyaOS extension for the cinema vertical (FlowOS Stage 1 — operational data).
//
// Endpoints under /api/cinema/*:
//   GET    /summary               — counts (films now-showing, studios, showtimes today)
//   GET    /films                 — film catalog
//   POST   /films                 — add film
//   DELETE /films/:id             — remove film
//   GET    /studios               — studios / screens
//   POST   /studios               — add studio
//   DELETE /studios/:id           — remove studio
//   GET    /showtimes?date=       — showtimes (joined with film + studio)
//   POST   /showtimes             — schedule a showtime
//   DELETE /showtimes/:id         — remove showtime
//
// Setup in server/index.js:
//   const { setupCinema } = require('./cinema-backend');
//   setupCinema(app, { dbPath: DB_PATH });

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cinema_films (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  genre TEXT,
  duration_min INTEGER DEFAULT 0,
  rating TEXT DEFAULT 'SU',
  status TEXT DEFAULT 'now_showing' CHECK (status IN ('now_showing','coming_soon','archived')),
  synopsis TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS cinema_studios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  studio_type TEXT DEFAULT 'Regular',
  rows INTEGER DEFAULT 8,
  cols INTEGER DEFAULT 12,
  outlet TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS cinema_showtimes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  film_id INTEGER NOT NULL,
  studio_id INTEGER NOT NULL,
  show_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cinema_showtime_date ON cinema_showtimes(show_date);
CREATE TABLE IF NOT EXISTS cinema_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  showtime_id INTEGER NOT NULL,
  seat TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  buyer TEXT,
  sold_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  code TEXT,
  checked_in_at INTEGER,
  UNIQUE(showtime_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_cinema_ticket_showtime ON cinema_tickets(showtime_id);
`;

const SEED_FILMS = [
  ['Sang Penjaga Rimba', 'Action / Adventure', 128, '13+', 'now_showing', 'Seorang ranger melawan sindikat perdagangan satwa di hutan Kalimantan.'],
  ['Cinta di Ujung Senja', 'Drama / Romance', 105, '13+', 'now_showing', 'Dua orang asing bertemu di kota tua dan menemukan arti pulang.'],
  ['Petualangan Si Kancil', 'Animation', 95, 'SU', 'now_showing', 'Si Kancil dan teman-temannya menyelamatkan mata air desa.'],
  ['Teror Tengah Malam', 'Horror', 110, '17+', 'coming_soon', 'Sebuah keluarga pindah ke rumah tua dengan masa lalu kelam.'],
];
const SEED_STUDIOS = [
  ['Studio 1', 'Regular', 8, 12, 'Paskal'],
  ['Studio 2', 'Regular', 8, 14, 'Paskal'],
  ['Studio 3', 'IMAX', 10, 16, 'Paskal'],
  ['Studio 4', 'Premiere', 5, 8, 'Paskal'],
];

function today() { return new Date().toISOString().slice(0, 10); }

function setupCinema(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // Add QR-validation columns to existing cinema_tickets (no-op if already present)
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN code TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN checked_in_at INTEGER"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cinema_ticket_code ON cinema_tickets(code) WHERE code IS NOT NULL"); } catch {}

  // ── seed demo data on first run ──
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_films`).get().c === 0) {
    const sf = db.prepare(`INSERT INTO cinema_films (title, genre, duration_min, rating, status, synopsis) VALUES (?,?,?,?,?,?)`);
    for (const f of SEED_FILMS) sf.run(...f);
  }
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_studios`).get().c === 0) {
    const ss = db.prepare(`INSERT INTO cinema_studios (name, studio_type, rows, cols, outlet) VALUES (?,?,?,?,?)`);
    for (const s of SEED_STUDIOS) ss.run(...s);
  }
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_showtimes`).get().c === 0) {
    const films = db.prepare(`SELECT id FROM cinema_films`).all().map(r => r.id);
    const studios = db.prepare(`SELECT id FROM cinema_studios`).all().map(r => r.id);
    if (films.length && studios.length) {
      const sh = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price) VALUES (?,?,?,?,?)`);
      const d = today();
      [[0, 0, '13:00', 45000], [1, 1, '14:30', 45000], [0, 2, '16:00', 65000], [2, 0, '11:00', 40000], [1, 3, '19:00', 90000]]
        .forEach(([fi, si, t, p]) => { if (films[fi] && studios[si]) sh.run(films[fi], studios[si], d, t, p); });
    }
  }

  const router = express.Router();
  router.use(express.json());

  // ── SUMMARY ──
  router.get('/summary', (req, res) => {
    res.json({
      films_now_showing: db.prepare(`SELECT COUNT(*) c FROM cinema_films WHERE status = 'now_showing'`).get().c,
      films_total: db.prepare(`SELECT COUNT(*) c FROM cinema_films`).get().c,
      studios: db.prepare(`SELECT COUNT(*) c FROM cinema_studios WHERE is_active = 1`).get().c,
      showtimes_today: db.prepare(`SELECT COUNT(*) c FROM cinema_showtimes WHERE show_date = ? AND status = 'scheduled'`).get(today()).c,
      tickets_today: db.prepare(`SELECT COUNT(*) c FROM cinema_tickets WHERE date(sold_at,'unixepoch','localtime') = date('now','localtime')`).get().c,
    });
  });

  // ── FILMS ──
  router.get('/films', (req, res) => {
    res.json({ films: db.prepare(`SELECT * FROM cinema_films ORDER BY status, title`).all() });
  });
  router.post('/films', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'title wajib diisi' });
    const status = ['now_showing', 'coming_soon', 'archived'].includes(b.status) ? b.status : 'now_showing';
    const info = db.prepare(`INSERT INTO cinema_films (title, genre, duration_min, rating, status, synopsis) VALUES (?,?,?,?,?,?)`)
      .run(String(b.title).trim(), b.genre || '', Number(b.duration_min) || 0, b.rating || 'SU', status, b.synopsis || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.delete('/films/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_showtimes WHERE film_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_films WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── STUDIOS ──
  router.get('/studios', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_studios ORDER BY name`).all();
    res.json({ studios: rows.map(s => ({ ...s, capacity: (s.rows || 0) * (s.cols || 0) })) });
  });
  router.post('/studios', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'name wajib diisi' });
    const info = db.prepare(`INSERT INTO cinema_studios (name, studio_type, rows, cols, outlet) VALUES (?,?,?,?,?)`)
      .run(String(b.name).trim(), b.studio_type || 'Regular', Number(b.rows) || 8, Number(b.cols) || 12, b.outlet || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.delete('/studios/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_showtimes WHERE studio_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_studios WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── SHOWTIMES ──
  router.get('/showtimes', (req, res) => {
    let sql = `SELECT s.*, f.title AS film_title, f.rating AS film_rating, f.duration_min,
                      st.name AS studio_name, st.studio_type, (st.rows * st.cols) AS capacity
               FROM cinema_showtimes s
               LEFT JOIN cinema_films f ON f.id = s.film_id
               LEFT JOIN cinema_studios st ON st.id = s.studio_id`;
    const p = [];
    if (req.query.date) { sql += ` WHERE s.show_date = ?`; p.push(req.query.date); }
    sql += ` ORDER BY s.show_date, s.start_time`;
    res.json({ showtimes: db.prepare(sql).all(...p) });
  });
  router.post('/showtimes', (req, res) => {
    const b = req.body || {};
    if (!b.film_id || !b.studio_id || !b.show_date || !b.start_time) {
      return res.status(400).json({ error: 'film_id, studio_id, show_date, start_time wajib diisi' });
    }
    const info = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price) VALUES (?,?,?,?,?)`)
      .run(Number(b.film_id), Number(b.studio_id), String(b.show_date), String(b.start_time), Number(b.price) || 0);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.delete('/showtimes/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_tickets WHERE showtime_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_showtimes WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── TICKETS / seat map ──
  router.get('/showtimes/:id/seats', (req, res) => {
    const st = db.prepare(`SELECT s.*, f.title AS film_title, st.name AS studio_name,
                                  st.rows AS rows, st.cols AS cols, st.studio_type
                           FROM cinema_showtimes s
                           LEFT JOIN cinema_films f ON f.id = s.film_id
                           LEFT JOIN cinema_studios st ON st.id = s.studio_id
                           WHERE s.id = ?`).get(req.params.id);
    if (!st) return res.status(404).json({ error: 'showtime tidak ditemukan' });
    const sold = db.prepare(`SELECT seat FROM cinema_tickets WHERE showtime_id = ?`).all(req.params.id).map(r => r.seat);
    const capacity = (st.rows || 0) * (st.cols || 0);
    res.json({ showtime: st, rows: st.rows || 0, cols: st.cols || 0, capacity, sold, sold_count: sold.length });
  });
  router.get('/tickets', (req, res) => {
    let sql = `SELECT * FROM cinema_tickets`;
    const p = [];
    if (req.query.showtime) { sql += ` WHERE showtime_id = ?`; p.push(req.query.showtime); }
    sql += ` ORDER BY sold_at DESC`;
    res.json({ tickets: db.prepare(sql).all(...p) });
  });
  router.post('/tickets', (req, res) => {
    const b = req.body || {};
    const seats = Array.isArray(b.seats) ? b.seats.map(String) : [];
    if (!b.showtime_id || !seats.length) return res.status(400).json({ error: 'showtime_id + seats wajib diisi' });
    const st = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(b.showtime_id);
    if (!st) return res.status(404).json({ error: 'showtime tidak ditemukan' });
    const ins = db.prepare(`INSERT INTO cinema_tickets (showtime_id, seat, price, buyer, code) VALUES (?,?,?,?,?)`);
    const crypto = require('crypto');
    const newTickets = [];
    try {
      db.transaction(() => {
        for (const s of seats) {
          const code = 'CT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
          const info = ins.run(st.id, s, st.price || 0, b.buyer || '', code);
          newTickets.push({ id: info.lastInsertRowid, seat: s, price: st.price || 0, code });
        }
      })();
    } catch (e) {
      return res.status(409).json({ error: 'sebagian kursi sudah terjual — muat ulang peta kursi' });
    }
    res.json({ ok: true, count: seats.length, total: seats.length * (st.price || 0), tickets: newTickets });
  });
  router.delete('/tickets/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_tickets WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── TICKET VALIDATION (QR scan at the studio door) ──
  router.post('/tickets/validate', (req, res) => {
    const code = (req.body && req.body.code) ? String(req.body.code).trim().toUpperCase() : '';
    if (!code) return res.status(400).json({ ok: false, status: 'invalid', error: 'Code wajib diisi' });
    const t = db.prepare(`
      SELECT t.*,
        s.show_date, s.show_time, s.price AS showtime_price,
        f.title AS film_title, f.duration AS film_duration,
        st.name AS studio_name
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films    f ON f.id = s.film_id
      LEFT JOIN cinema_studios  st ON st.id = s.studio_id
      WHERE t.code = ?
    `).get(code);
    if (!t) return res.status(404).json({ ok: false, status: 'invalid', error: 'Tiket tidak ditemukan' });
    if (t.checked_in_at) {
      return res.status(409).json({ ok: false, status: 'used', error: 'Tiket sudah dipakai', ticket: t, usedAt: t.checked_in_at });
    }
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE cinema_tickets SET checked_in_at = ? WHERE id = ?`).run(now, t.id);
    res.json({ ok: true, status: 'valid', ticket: { ...t, checked_in_at: now } });
  });

  // ── BOX OFFICE / reporting ──
  router.get('/box-office', (req, res) => {
    const totals = db.prepare(`SELECT COUNT(*) tickets, COALESCE(SUM(price),0) revenue FROM cinema_tickets`).get();
    const today = db.prepare(`SELECT COUNT(*) tickets, COALESCE(SUM(price),0) revenue FROM cinema_tickets
                              WHERE date(sold_at,'unixepoch','localtime') = date('now','localtime')`).get();
    const by_film = db.prepare(`SELECT f.id, f.title, COUNT(t.id) tickets, COALESCE(SUM(t.price),0) revenue
                                FROM cinema_tickets t
                                JOIN cinema_showtimes s ON s.id = t.showtime_id
                                JOIN cinema_films f ON f.id = s.film_id
                                GROUP BY f.id ORDER BY revenue DESC`).all();
    const showtimes = db.prepare(`SELECT s.id, f.title AS film_title, st.name AS studio_name,
                                         s.show_date, s.start_time, (st.rows * st.cols) AS capacity,
                                         COUNT(t.id) AS sold, COALESCE(SUM(t.price),0) AS revenue
                                  FROM cinema_showtimes s
                                  LEFT JOIN cinema_films f ON f.id = s.film_id
                                  LEFT JOIN cinema_studios st ON st.id = s.studio_id
                                  LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
                                  GROUP BY s.id ORDER BY s.show_date, s.start_time`).all();
    res.json({ totals, today, by_film, showtimes });
  });

  const mountPath = opts.mountPath || '/api/cinema';
  app.use(mountPath, router);
  console.log(`[cinema] mounted at ${mountPath} — films, studios, showtimes`);

  return { router, db };
}

module.exports = { setupCinema };
