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
let _emailMod = null;
function getEmail() {
  if (_emailMod) return _emailMod;
  try { _emailMod = require('./email'); } catch (e) { _emailMod = null; }
  return _emailMod;
}

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
CREATE TABLE IF NOT EXISTS cinema_ticket_voids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER,
  showtime_id INTEGER NOT NULL,
  seat TEXT NOT NULL,
  price INTEGER DEFAULT 0,
  code TEXT,
  buyer TEXT,
  sold_at INTEGER,
  checked_in_at INTEGER,
  voided_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  void_reason TEXT,
  voided_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_cinema_void_showtime ON cinema_ticket_voids(showtime_id);
CREATE INDEX IF NOT EXISTS idx_cinema_void_date ON cinema_ticket_voids(voided_at);
CREATE TABLE IF NOT EXISTS cinema_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS cinema_purchase_bundles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id TEXT NOT NULL,
  bundle_id INTEGER,
  bundle_name TEXT,
  qty INTEGER DEFAULT 1,
  price INTEGER DEFAULT 0,
  redeemed_at INTEGER,
  redeemed_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cpb_purchase ON cinema_purchase_bundles(purchase_id);
CREATE TABLE IF NOT EXISTS cinema_seat_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  showtime_id INTEGER NOT NULL,
  seat TEXT NOT NULL,
  hold_token TEXT NOT NULL,
  held_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL,
  UNIQUE(showtime_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_csh_expire ON cinema_seat_holds(expires_at);
CREATE INDEX IF NOT EXISTS idx_csh_token ON cinema_seat_holds(hold_token);
CREATE INDEX IF NOT EXISTS idx_csh_showtime ON cinema_seat_holds(showtime_id);
CREATE TABLE IF NOT EXISTS cinema_distributors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  vat_pct REAL DEFAULT 11,            -- VAT deducted before net revenue split (default 11%)
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
-- Tiered revenue share per film (standar Indo: W1 50/50, W2 60/40, W3+ 70/30)
CREATE TABLE IF NOT EXISTS cinema_share_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  film_id INTEGER NOT NULL,
  week_from INTEGER NOT NULL DEFAULT 1,
  week_to   INTEGER,                  -- inclusive; NULL = open-ended (≥ week_from)
  cinema_pct REAL DEFAULT 50,
  distributor_pct REAL DEFAULT 50,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cst_film ON cinema_share_tiers(film_id);
-- In-studio QR order (customer scans seat-side QR mid-movie to order F&B)
CREATE TABLE IF NOT EXISTS cinema_in_studio_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  showtime_id INTEGER,
  studio_id INTEGER,
  studio_name TEXT,
  seat TEXT,
  buyer_name TEXT,
  buyer_phone TEXT,
  notes TEXT,
  total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','preparing','delivered','cancelled')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  delivered_at INTEGER,
  delivered_by TEXT
);
CREATE TABLE IF NOT EXISTS cinema_in_studio_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  bundle_id INTEGER,
  bundle_name TEXT,
  qty INTEGER DEFAULT 1,
  price INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ciso_status ON cinema_in_studio_orders(status);
CREATE INDEX IF NOT EXISTS idx_ciso_studio ON cinema_in_studio_orders(studio_id);
CREATE INDEX IF NOT EXISTS idx_ciso_created ON cinema_in_studio_orders(created_at);
-- Film rating (customer 1-5 stars + optional comment)
CREATE TABLE IF NOT EXISTS cinema_film_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  film_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  ticket_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cfr_film ON cinema_film_ratings(film_id);
-- Studio booking untuk event privat / corporate / birthday / wedding
CREATE TABLE IF NOT EXISTS cinema_studio_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL UNIQUE,
  studio_id INTEGER NOT NULL,
  event_type TEXT,
  event_name TEXT,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  attendees INTEGER DEFAULT 0,
  total_price INTEGER DEFAULT 0,
  deposit_paid INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_csb_studio ON cinema_studio_bookings(studio_id);
CREATE INDEX IF NOT EXISTS idx_csb_date ON cinema_studio_bookings(event_date);
-- Price list master: tier harga per outlet × studio_type × format × day × waktu
-- (NULL = wildcard / berlaku untuk semua). Resolusi pakai specificity score.
CREATE TABLE IF NOT EXISTS cinema_price_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet TEXT NOT NULL,
  studio_type TEXT,        -- "Regular" / "IMAX" / "Premiere" / NULL = semua
  format TEXT,             -- "2D" / "3D" / "4DX" / NULL = semua
  day_type TEXT,           -- "weekday" / "weekend" / "holiday" / NULL = semua
  time_band TEXT,          -- "morning" / "matinee" / "prime" / "late" / NULL = semua
  price INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cpl_outlet ON cinema_price_list(outlet);
CREATE INDEX IF NOT EXISTS idx_cpl_active ON cinema_price_list(is_active);
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
  // Bundle-attach: purchase_id ties a multi-seat sale to its F&B bundles
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN purchase_id TEXT"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cinema_ticket_purchase ON cinema_tickets(purchase_id)"); } catch {}
  // Manual early-close for showtimes (overrides time-derived status)
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN manual_closed_at INTEGER"); } catch {}
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN manual_closed_by TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN manual_close_reason TEXT"); } catch {}
  // Buyer contact (for e-ticket via email / WA)
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN buyer_email TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN buyer_phone TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN email_sent_at INTEGER"); } catch {}
  // Distributor / license fields on films (links film → distributor + license terms)
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN distributor_id INTEGER"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN license_start TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN license_end TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN revenue_share_pct REAL DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN min_run_days INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN distributor_notes TEXT"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cinema_films_distributor ON cinema_films(distributor_id)"); } catch {}
  // VAT pct on distributors (idempotent for existing DBs)
  try { db.exec("ALTER TABLE cinema_distributors ADD COLUMN vat_pct REAL DEFAULT 11"); } catch {}
  // Format (2D/3D/IMAX/4DX) — showtime-level (1 film bisa multi-format jadwal)
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN format TEXT DEFAULT '2D'"); } catch {}
  // Available formats per film (CSV) — metadata informasi
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN available_formats TEXT DEFAULT '2D'"); } catch {}

  // Seed default price list per outlet (Paskal seeded — admin tambah outlet lain)
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_price_list`).get().c === 0) {
    const sp = db.prepare(`INSERT INTO cinema_price_list (outlet, studio_type, format, day_type, time_band, price, notes) VALUES (?,?,?,?,?,?,?)`);
    // Paskal — Regular
    sp.run('Paskal', 'Regular',  '2D',  'weekday', 'matinee', 35000, 'WD matinee');
    sp.run('Paskal', 'Regular',  '2D',  'weekday', 'prime',   45000, 'WD prime');
    sp.run('Paskal', 'Regular',  '2D',  'weekend', null,      55000, 'Weekend regular 2D');
    sp.run('Paskal', 'Regular',  '3D',  'weekday', null,      55000, 'WD 3D');
    sp.run('Paskal', 'Regular',  '3D',  'weekend', null,      65000, 'WE 3D');
    // Paskal — IMAX
    sp.run('Paskal', 'IMAX',     '2D',  null,      null,      75000, 'IMAX 2D all-time');
    sp.run('Paskal', 'IMAX',     '3D',  null,      null,      95000, 'IMAX 3D all-time');
    // Paskal — Premiere
    sp.run('Paskal', 'Premiere', null,  null,      null,     120000, 'Premiere flat');
    // Paskal — fallback default
    sp.run('Paskal', null,       null,  null,      null,      45000, 'Default fallback');
  }

  // Seed default distributors + standard tiered share template on first run.
  // Tiered share scheme = standar industri bioskop Indonesia (cinema share):
  //   Week 1: 50% (distributor 50%)
  //   Week 2: 60% (distributor 40%)
  //   Week 3+: 70% (distributor 30%)
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_distributors`).get().c === 0) {
    const sd = db.prepare(`INSERT INTO cinema_distributors (name, code, contact_person, contact_email, contact_phone, vat_pct) VALUES (?,?,?,?,?,?)`);
    sd.run('PT. Multivision Plus Picture', 'MVP', 'Bookings', 'booking@multivision.co.id',     '021-7980333', 11);
    sd.run('PT. Falcon Pictures',           'FAL', 'Bookings', 'booking@falconpictures.id',     '021-7982300', 11);
    sd.run('Walt Disney Studios Indonesia', 'DSN', 'Distribution', 'distrib@disney.co.id',      '021-29350888', 11);
    sd.run('Warner Bros Indonesia',         'WB',  'Distribution', 'distrib@warnerbros.co.id',  '021-29927000', 11);
    sd.run('Cinema 21 Distribution',        'C21', 'Bookings', 'distribusi@21cineplex.com',     '021-3505555', 11);
  }

  // Seed default bundles on first run (customisable in Admin → Cinema Bundles)
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_bundles`).get().c === 0) {
    const sb = db.prepare(`INSERT INTO cinema_bundles (name, description, price, sort_order) VALUES (?,?,?,?)`);
    sb.run('Combo Popcorn Medium + Coke',     'Popcorn medium + Coca-Cola medium',           50000, 1);
    sb.run('Combo Popcorn Large + 2 Drink',   'Popcorn large + 2 minuman medium (sharing)',  85000, 2);
    sb.run('Nachos + Cheese Dip',             'Nachos + saus keju',                          45000, 3);
    sb.run('Hot Dog Combo',                   'Hot dog + medium drink',                      55000, 4);
    sb.run('Air Mineral 600ml',               'Air mineral kemasan 600ml',                   10000, 5);
  }

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

  // ── DERIVED STATUS ──────────────────────────────────────────────────
  // Returns one of: scheduled | running | closed | sold_out | cancelled.
  // Lock for ticket sales = anything other than "scheduled".
  function computeStatus(s, capacity, sold, nowSec) {
    if (!s) return 'scheduled';
    if (s.status === 'cancelled') return 'cancelled';
    if (s.manual_closed_at) return 'closed';
    if (capacity > 0 && sold >= capacity) return 'sold_out';
    if (!s.show_date || !s.start_time) return 'scheduled';
    const [Y, M, D] = String(s.show_date).split('-').map(Number);
    const [h, m]    = String(s.start_time).split(':').map(Number);
    if (!Y || !M || !D || isNaN(h) || isNaN(m)) return 'scheduled';
    const startSec = Math.floor(new Date(Y, M - 1, D, h, m, 0).getTime() / 1000);
    const dur      = ((s.duration_min || s.film_duration || 120) * 60);
    if (nowSec < startSec) return 'scheduled';
    if (nowSec < startSec + dur) return 'running';
    return 'closed';
  }
  function soldCountFor(showtimeId) {
    return db.prepare(`SELECT COUNT(*) c FROM cinema_tickets WHERE showtime_id = ?`).get(showtimeId).c;
  }
  // ── SEAT-HOLD anti double-sell ──
  // Customer selects seats → POST /seats/hold to reserve them while going
  // through F&B + payment (5 min default TTL). Other customers see the
  // seats as "held" (yellow) and can't pick them. Hold consumed by
  // POST /tickets atomically.
  const HOLD_TTL_DEFAULT = 300;        // 5 min
  const HOLD_TTL_MAX     = 900;        // 15 min ceiling
  function pruneExpiredHolds() {
    db.prepare(`DELETE FROM cinema_seat_holds WHERE expires_at < ?`).run(Math.floor(Date.now()/1000));
  }
  function decorateShowtime(s) {
    if (!s) return s;
    const capacity = s.capacity || (s.rows && s.cols ? s.rows * s.cols : 0);
    const sold = soldCountFor(s.id);
    return { ...s, capacity, sold_count: sold, derived_status: computeStatus(s, capacity, sold, Math.floor(Date.now()/1000)) };
  }

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
    res.json({ films: db.prepare(`
      SELECT f.*, d.name AS distributor_name, d.code AS distributor_code,
             ROUND((SELECT AVG(rating) FROM cinema_film_ratings WHERE film_id = f.id), 2) AS avg_rating,
             (SELECT COUNT(*) FROM cinema_film_ratings WHERE film_id = f.id) AS ratings_count
      FROM cinema_films f
      LEFT JOIN cinema_distributors d ON d.id = f.distributor_id
      ORDER BY f.status, f.title`).all() });
  });
  router.post('/films', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'title wajib diisi' });
    const status = ['now_showing', 'coming_soon', 'archived'].includes(b.status) ? b.status : 'now_showing';
    const info = db.prepare(`INSERT INTO cinema_films
      (title, genre, duration_min, rating, status, synopsis,
       distributor_id, license_start, license_end, revenue_share_pct, min_run_days, distributor_notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(String(b.title).trim(), b.genre || '', Number(b.duration_min) || 0, b.rating || 'SU', status, b.synopsis || '',
           b.distributor_id ? parseInt(b.distributor_id, 10) : null,
           b.license_start || null, b.license_end || null,
           b.revenue_share_pct == null || b.revenue_share_pct === '' ? 0 : parseFloat(b.revenue_share_pct),
           b.min_run_days ? parseInt(b.min_run_days, 10) : 0,
           b.distributor_notes || '');
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
    const rows = db.prepare(sql).all(...p).map(decorateShowtime);
    res.json({ showtimes: rows });
  });
  // Manager close / reopen — overrides time-derived status
  router.post('/showtimes/:id/close', (req, res) => {
    const b = req.body || {};
    const by = String(b.manager_name || b.manager_id || b.closed_by || 'manager');
    const reason = String(b.reason || '').trim();
    const s = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Showtime tidak ditemukan' });
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE cinema_showtimes SET manual_closed_at = ?, manual_closed_by = ?, manual_close_reason = ? WHERE id = ?`)
      .run(now, by, reason, req.params.id);
    res.json({ ok: true, manual_closed_at: now, manual_closed_by: by, reason });
  });
  router.post('/showtimes/:id/reopen', (req, res) => {
    const s = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Showtime tidak ditemukan' });
    db.prepare(`UPDATE cinema_showtimes SET manual_closed_at = NULL, manual_closed_by = NULL, manual_close_reason = NULL WHERE id = ?`)
      .run(req.params.id);
    res.json({ ok: true });
  });
  router.post('/showtimes', (req, res) => {
    const b = req.body || {};
    if (!b.film_id || !b.studio_id || !b.show_date || !b.start_time) {
      return res.status(400).json({ error: 'film_id, studio_id, show_date, start_time wajib diisi' });
    }
    const info = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price, format) VALUES (?,?,?,?,?,?)`)
      .run(Number(b.film_id), Number(b.studio_id), String(b.show_date), String(b.start_time), Number(b.price) || 0, b.format || '2D');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.delete('/showtimes/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_tickets WHERE showtime_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_showtimes WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── TICKETS / seat map ──
  router.get('/showtimes/:id/seats', (req, res) => {
    pruneExpiredHolds();
    const st = db.prepare(`SELECT s.*, f.title AS film_title, st.name AS studio_name,
                                  st.rows AS rows, st.cols AS cols, st.studio_type
                           FROM cinema_showtimes s
                           LEFT JOIN cinema_films f ON f.id = s.film_id
                           LEFT JOIN cinema_studios st ON st.id = s.studio_id
                           WHERE s.id = ?`).get(req.params.id);
    if (!st) return res.status(404).json({ error: 'showtime tidak ditemukan' });
    const sold = db.prepare(`SELECT seat FROM cinema_tickets WHERE showtime_id = ?`).all(req.params.id).map(r => r.seat);
    const capacity = (st.rows || 0) * (st.cols || 0);
    // Holds — split into "by others" (locked to this customer) and "mine" (still editable)
    const ownToken = String(req.query.hold_token || '');
    const holdRows = db.prepare(`SELECT seat, hold_token, expires_at FROM cinema_seat_holds WHERE showtime_id = ?`).all(req.params.id);
    const held_by_others = holdRows.filter(r => r.hold_token !== ownToken).map(r => r.seat);
    const my_holds       = holdRows.filter(r => r.hold_token === ownToken).map(r => r.seat);
    // Pull duration via film for derived status
    const film = db.prepare(`SELECT duration_min FROM cinema_films WHERE id = ?`).get(st.film_id);
    const derived_status = computeStatus({ ...st, duration_min: film?.duration_min }, capacity, sold.length, Math.floor(Date.now()/1000));
    res.json({
      showtime: { ...st, derived_status },
      rows: st.rows || 0, cols: st.cols || 0, capacity,
      sold, sold_count: sold.length,
      held_by_others, my_holds,
      derived_status,
    });
  });

  // ── SEAT HOLDS ───────────────────────────────────────────────────────
  router.post('/seats/hold', (req, res) => {
    const b = req.body || {};
    const showtimeId = parseInt(b.showtime_id, 10);
    const seats = Array.isArray(b.seats) ? b.seats.map(String).filter(Boolean) : [];
    const token = String(b.hold_token || '').trim();
    const ttl   = Math.max(60, Math.min(HOLD_TTL_MAX, parseInt(b.ttl_seconds, 10) || HOLD_TTL_DEFAULT));
    if (!showtimeId || !seats.length || !token) {
      return res.status(400).json({ ok: false, error: 'showtime_id, seats, hold_token wajib' });
    }
    pruneExpiredHolds();
    const placeholders = seats.map(() => '?').join(',');
    // Check sold seats (race-safe: tickets table has UNIQUE)
    const sold = db.prepare(`SELECT seat FROM cinema_tickets WHERE showtime_id = ? AND seat IN (${placeholders})`)
      .all(showtimeId, ...seats).map(r => r.seat);
    if (sold.length) {
      return res.status(409).json({ ok: false, status: 'sold', conflict_seats: sold,
        error: `Kursi ${sold.join(', ')} sudah terjual` });
    }
    // Check holds owned by another token
    const held = db.prepare(`SELECT seat FROM cinema_seat_holds WHERE showtime_id = ? AND seat IN (${placeholders}) AND hold_token != ?`)
      .all(showtimeId, ...seats, token).map(r => r.seat);
    if (held.length) {
      return res.status(409).json({ ok: false, status: 'held', conflict_seats: held,
        error: `Kursi ${held.join(', ')} sedang disimpan customer lain` });
    }
    // Atomic upsert — if seat exists with same token, refresh expiry; else insert.
    const expiresAt = Math.floor(Date.now()/1000) + ttl;
    try {
      db.transaction(() => {
        const upsert = db.prepare(`INSERT INTO cinema_seat_holds (showtime_id, seat, hold_token, expires_at)
                                   VALUES (?, ?, ?, ?)
                                   ON CONFLICT(showtime_id, seat)
                                     DO UPDATE SET expires_at = excluded.expires_at
                                     WHERE cinema_seat_holds.hold_token = excluded.hold_token`);
        for (const s of seats) {
          const info = upsert.run(showtimeId, s, token, expiresAt);
          if (info.changes === 0) throw new Error(`Kursi ${s} barusan diambil customer lain`);
        }
      })();
    } catch (e) {
      return res.status(409).json({ ok: false, status: 'held', error: e.message });
    }
    res.json({ ok: true, hold_token: token, expires_at: expiresAt, seats, ttl_seconds: ttl });
  });

  router.post('/seats/release', (req, res) => {
    const b = req.body || {};
    const token = String(b.hold_token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'hold_token wajib' });
    let info;
    if (Array.isArray(b.seats) && b.seats.length) {
      const placeholders = b.seats.map(() => '?').join(',');
      const args = [token, ...b.seats];
      let sql = `DELETE FROM cinema_seat_holds WHERE hold_token = ? AND seat IN (${placeholders})`;
      if (b.showtime_id) { sql += ` AND showtime_id = ?`; args.push(b.showtime_id); }
      info = db.prepare(sql).run(...args);
    } else {
      info = db.prepare(`DELETE FROM cinema_seat_holds WHERE hold_token = ?`).run(token);
    }
    res.json({ ok: true, released: info.changes });
  });

  router.post('/seats/refresh', (req, res) => {
    const b = req.body || {};
    const token = String(b.hold_token || '').trim();
    if (!token) return res.status(400).json({ ok: false, error: 'hold_token wajib' });
    const ttl = Math.max(60, Math.min(HOLD_TTL_MAX, parseInt(b.ttl_seconds, 10) || HOLD_TTL_DEFAULT));
    pruneExpiredHolds();
    const expiresAt = Math.floor(Date.now()/1000) + ttl;
    const info = db.prepare(`UPDATE cinema_seat_holds SET expires_at = ? WHERE hold_token = ?`).run(expiresAt, token);
    res.json({ ok: info.changes > 0, expires_at: expiresAt, refreshed: info.changes });
  });
  router.get('/tickets', (req, res) => {
    let sql = `SELECT t.*, f.title AS film_title, st.name AS studio_name,
                      s.show_date, s.start_time
               FROM cinema_tickets t
               LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
               LEFT JOIN cinema_films    f ON f.id = s.film_id
               LEFT JOIN cinema_studios  st ON st.id = s.studio_id`;
    const p = [];
    if (req.query.showtime) { sql += ` WHERE t.showtime_id = ?`; p.push(req.query.showtime); }
    sql += ` ORDER BY t.sold_at DESC`;
    res.json({ tickets: db.prepare(sql).all(...p) });
  });
  router.post('/tickets', (req, res) => {
    const b = req.body || {};
    const seats = Array.isArray(b.seats) ? b.seats.map(String) : [];
    if (!b.showtime_id || !seats.length) return res.status(400).json({ error: 'showtime_id + seats wajib diisi' });
    const st = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(b.showtime_id);
    if (!st) return res.status(404).json({ error: 'showtime tidak ditemukan' });

    // Lock: refuse sale when showtime not in 'scheduled' state
    const film = db.prepare(`SELECT duration_min FROM cinema_films WHERE id = ?`).get(st.film_id);
    const capacity = db.prepare(`SELECT (rows*cols) c FROM cinema_studios WHERE id = ?`).get(st.studio_id)?.c || 0;
    const soldCount = soldCountFor(st.id);
    const derived = computeStatus({ ...st, duration_min: film?.duration_min }, capacity, soldCount, Math.floor(Date.now()/1000));
    if (derived !== 'scheduled') {
      const msgMap = {
        running:   'Showtime sudah dimulai — penjualan ditutup.',
        closed:    'Showtime sudah selesai / ditutup manual.',
        sold_out:  'Showtime sudah sold out.',
        cancelled: 'Showtime dibatalkan.',
      };
      return res.status(409).json({ ok: false, error: msgMap[derived] || 'Showtime tidak menerima penjualan', derived_status: derived });
    }

    // Normalise & validate bundles (one purchase shares its F&B bundles across all tickets)
    const reqBundles = Array.isArray(b.bundles) ? b.bundles : [];
    const bundleRows = [];
    for (const it of reqBundles) {
      const bid = parseInt(it.bundle_id, 10);
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      if (!bid) continue;
      const bn = db.prepare(`SELECT * FROM cinema_bundles WHERE id = ? AND is_active = 1`).get(bid);
      if (!bn) return res.status(400).json({ error: `Bundle id ${bid} tidak ditemukan / tidak aktif` });
      bundleRows.push({ bundle_id: bn.id, bundle_name: bn.name, qty, price: bn.price });
    }
    const bundlesTotal = bundleRows.reduce((a, r) => a + r.qty * r.price, 0);

    // If hold_token provided: verify all requested seats are held by this token
    // (refuse mismatched holds — the customer can't claim seats they don't own)
    const holdToken = String(b.hold_token || '').trim();
    if (holdToken) {
      pruneExpiredHolds();
      const placeholders = seats.map(() => '?').join(',');
      const ownedHolds = db.prepare(`SELECT seat FROM cinema_seat_holds WHERE showtime_id = ? AND seat IN (${placeholders}) AND hold_token = ?`)
        .all(st.id, ...seats, holdToken).map(r => r.seat);
      const missing = seats.filter(s => !ownedHolds.includes(s));
      if (missing.length) {
        return res.status(409).json({ ok: false, error: `Hold expired untuk kursi ${missing.join(', ')} — coba pilih ulang.` });
      }
    }

    const crypto = require('crypto');
    const purchaseId = 'CP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const ins   = db.prepare(`INSERT INTO cinema_tickets (showtime_id, seat, price, buyer, buyer_email, buyer_phone, code, purchase_id) VALUES (?,?,?,?,?,?,?,?)`);
    const insB  = db.prepare(`INSERT INTO cinema_purchase_bundles (purchase_id, bundle_id, bundle_name, qty, price) VALUES (?,?,?,?,?)`);
    const newTickets = [];
    const newBundles = [];
    try {
      db.transaction(() => {
        for (const s of seats) {
          const code = 'CT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
          const info = ins.run(st.id, s, st.price || 0, b.buyer || '', b.buyer_email || '', b.buyer_phone || '', code, purchaseId);
          newTickets.push({ id: info.lastInsertRowid, seat: s, price: st.price || 0, code, purchase_id: purchaseId });
        }
        for (const r of bundleRows) {
          const info = insB.run(purchaseId, r.bundle_id, r.bundle_name, r.qty, r.price);
          newBundles.push({ id: info.lastInsertRowid, ...r });
        }
      })();
    } catch (e) {
      return res.status(409).json({ error: 'sebagian kursi sudah terjual — muat ulang peta kursi' });
    }
    // Holds consumed — delete the customer's holds for this showtime atomically
    if (holdToken) {
      const placeholders = seats.map(() => '?').join(',');
      db.prepare(`DELETE FROM cinema_seat_holds WHERE showtime_id = ? AND seat IN (${placeholders}) AND hold_token = ?`)
        .run(st.id, ...seats, holdToken);
    }
    const seatsTotal = seats.length * (st.price || 0);
    res.json({
      ok: true,
      count: seats.length,
      purchase_id: purchaseId,
      total: seatsTotal + bundlesTotal,
      seats_total: seatsTotal,
      bundles_total: bundlesTotal,
      tickets: newTickets,
      bundles: newBundles,
    });
  });

  // ── BUNDLES (F&B combo catalog) ──
  router.get('/bundles', (req, res) => {
    const all = String(req.query.all || '') === '1';
    const sql = all
      ? `SELECT * FROM cinema_bundles ORDER BY sort_order, name`
      : `SELECT * FROM cinema_bundles WHERE is_active = 1 ORDER BY sort_order, name`;
    res.json({ bundles: db.prepare(sql).all() });
  });
  router.post('/bundles', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name wajib diisi' });
    const info = db.prepare(`INSERT INTO cinema_bundles (name, description, price, is_active, sort_order)
                             VALUES (?,?,?,?,?)`)
      .run(b.name, b.description || '', parseInt(b.price, 10) || 0,
           b.is_active === false ? 0 : 1, parseInt(b.sort_order, 10) || 0);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/bundles/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'description', 'price', 'is_active', 'sort_order']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        args.push(k === 'is_active' ? (b[k] ? 1 : 0) : (k === 'price' || k === 'sort_order') ? parseInt(b[k], 10) || 0 : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_bundles SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/bundles/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_bundles WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── PURCHASE BUNDLES (lookup + redeem at F&B counter) ──
  router.get('/purchase/:pid/bundles', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ? ORDER BY id`)
      .all(req.params.pid);
    res.json({ purchase_id: req.params.pid, bundles: rows });
  });
  router.post('/purchase-bundles/:id/redeem', (req, res) => {
    const b = req.body || {};
    const by = String(b.redeemed_by || b.staff_name || 'F&B counter');
    const row = db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ ok: false, error: 'Bundle tidak ditemukan' });
    if (row.redeemed_at) return res.status(409).json({ ok: false, error: 'Sudah di-redeem', redeemedAt: row.redeemed_at, redeemedBy: row.redeemed_by });
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE cinema_purchase_bundles SET redeemed_at = ?, redeemed_by = ? WHERE id = ?`)
      .run(now, by, req.params.id);
    res.json({ ok: true, id: row.id, redeemed_at: now, redeemed_by: by });
  });
  router.delete('/tickets/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_tickets WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── VOID / REFUND TIKET (manager-authorised, audit-logged) ──
  // Deletes the ticket from cinema_tickets (so the seat is freed for re-sale)
  // and appends the row to cinema_ticket_voids with reason + actor.
  router.post('/tickets/:id/void', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const b = req.body || {};
    const reason = String(b.reason || '').trim();
    const actor  = String(b.manager_name || b.manager_id || b.voided_by || 'manager');
    if (!reason) return res.status(400).json({ ok: false, error: 'Alasan void wajib diisi' });
    const t = db.prepare(`SELECT * FROM cinema_tickets WHERE id = ?`).get(id);
    if (!t) return res.status(404).json({ ok: false, error: 'Tiket tidak ditemukan' });
    if (t.checked_in_at && !b.allow_used) {
      return res.status(409).json({
        ok: false, used: true, ticket: t,
        error: 'Tiket sudah di-check-in. Kirim ulang dengan allow_used:true untuk paksa void.',
      });
    }
    const insV = db.prepare(`INSERT INTO cinema_ticket_voids
      (ticket_id, showtime_id, seat, price, code, buyer, sold_at, checked_in_at, void_reason, voided_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const del = db.prepare(`DELETE FROM cinema_tickets WHERE id = ?`);
    let voidId;
    db.transaction(() => {
      const info = insV.run(t.id, t.showtime_id, t.seat, t.price, t.code, t.buyer, t.sold_at, t.checked_in_at, reason, actor);
      voidId = info.lastInsertRowid;
      del.run(t.id);
    })();
    res.json({ ok: true, void_id: voidId, ticket: t, reason, voided_by: actor });
  });

  router.get('/voids', (req, res) => {
    const where = []; const params = {};
    if (req.query.from)     { where.push(`date(v.voided_at,'unixepoch','localtime') >= @from`);     params.from = req.query.from; }
    if (req.query.to)       { where.push(`date(v.voided_at,'unixepoch','localtime') <= @to`);       params.to = req.query.to; }
    if (req.query.showtime) { where.push(`v.showtime_id = @showtime`);                              params.showtime = req.query.showtime; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT v.*, f.title AS film_title, st.name AS studio_name, s.show_date, s.start_time
      FROM cinema_ticket_voids v
      LEFT JOIN cinema_showtimes s ON s.id = v.showtime_id
      LEFT JOIN cinema_films    f ON f.id = s.film_id
      LEFT JOIN cinema_studios  st ON st.id = s.studio_id
      ${W} ORDER BY v.voided_at DESC LIMIT 200
    `).all(params);
    const summary = db.prepare(`
      SELECT COUNT(*) count, COALESCE(SUM(price),0) refunded
      FROM cinema_ticket_voids v ${W}
    `).get(params);
    res.json({ rows, summary });
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
    // Include F&B bundles attached to this purchase (heads-up to door staff)
    const bundles = t.purchase_id
      ? db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ? ORDER BY id`).all(t.purchase_id)
      : [];
    res.json({ ok: true, status: 'valid', ticket: { ...t, checked_in_at: now }, bundles });
  });

  // ── E-TICKET via Email / WA ───────────────────────────────────────────
  // Build purchase summary by purchase_id (preferred) or by a single ticket code.
  function loadPurchase({ purchase_id, code }) {
    const tickets = purchase_id
      ? db.prepare(`SELECT t.*, f.title AS film_title, s.show_date, s.start_time,
                           st.name AS studio_name, st.studio_type
                    FROM cinema_tickets t
                    LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
                    LEFT JOIN cinema_films    f ON f.id = s.film_id
                    LEFT JOIN cinema_studios  st ON st.id = s.studio_id
                    WHERE t.purchase_id = ? ORDER BY t.seat`).all(purchase_id)
      : (code ? db.prepare(`SELECT t.*, f.title AS film_title, s.show_date, s.start_time,
                                   st.name AS studio_name, st.studio_type
                            FROM cinema_tickets t
                            LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
                            LEFT JOIN cinema_films    f ON f.id = s.film_id
                            LEFT JOIN cinema_studios  st ON st.id = s.studio_id
                            WHERE t.code = ?`).all(String(code).trim().toUpperCase()) : []);
    if (!tickets.length) return null;
    const pid = tickets[0].purchase_id;
    const bundles = pid
      ? db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ?`).all(pid)
      : [];
    return { tickets, bundles, purchase_id: pid };
  }

  function buildEmailHTML({ tickets, bundles }) {
    const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
    const head = tickets[0] || {};
    const seatsTotal = tickets.reduce((a, t) => a + (t.price || 0), 0);
    const bundleTotal = bundles.reduce((a, b) => a + b.qty * b.price, 0);
    const ticketBlocks = tickets.map(t => `
      <tr><td style="padding:14px 0;border-top:1px dashed #e5e7eb">
        <table width="100%" style="border:2px dashed #c084fc;border-radius:14px;background:#faf5ff;padding:14px"><tr>
          <td valign="top" width="200" align="center">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=${encodeURIComponent(t.code)}" width="180" height="180" alt="${t.code}" style="display:block;background:#fff"/>
            <div style="font-family:'Courier New',monospace;font-size:12px;margin-top:6px;letter-spacing:2px;color:#111"><b>${t.code}</b></div>
          </td>
          <td valign="top" style="padding-left:18px;font-size:13.5px;line-height:1.55;color:#111">
            <div style="font-size:11px;color:#7c3aed;letter-spacing:3px;font-weight:800;margin-bottom:4px">🎬 KARYAOS CINEMA</div>
            <div style="font-size:18px;font-weight:800;margin:0 0 8px">${t.film_title || '—'}</div>
            <div><span style="color:#6b7280">Jadwal</span>&nbsp; ${t.show_date || ''} · ${t.start_time || ''}</div>
            <div><span style="color:#6b7280">Studio</span>&nbsp; ${t.studio_name || ''} ${t.studio_type ? '· ' + t.studio_type : ''}</div>
            <div><span style="color:#6b7280">Kursi</span>&nbsp; <b style="font-size:17px">${t.seat}</b></div>
            <div><span style="color:#6b7280">Harga</span>&nbsp; ${rp(t.price)}</div>
            <div style="margin-top:8px;font-size:11px;color:#6b7280">Tunjukkan QR ini saat masuk studio</div>
          </td>
        </tr></table>
      </td></tr>`).join('');
    const voucherBlock = bundles.length ? `
      <tr><td style="padding:8px 0">
        <table width="100%" style="border:2px solid #f59e0b;border-radius:14px;background:#fff7ed;padding:14px"><tr>
          <td valign="top" width="200" align="center">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=6&data=${encodeURIComponent(head.code || head.purchase_id || '')}" width="180" height="180" alt="voucher" style="display:block;background:#fff"/>
            <div style="font-family:'Courier New',monospace;font-size:11px;margin-top:6px;letter-spacing:2px;color:#111"><b>${head.code || head.purchase_id || ''}</b></div>
          </td>
          <td valign="top" style="padding-left:18px;font-size:13px;line-height:1.55;color:#111">
            <div style="font-size:11px;color:#a16207;letter-spacing:3px;font-weight:800;margin-bottom:4px">🍿 F&amp;B VOUCHER</div>
            <div style="font-size:16px;font-weight:800;margin:0 0 8px">Tukar di F&amp;B Counter</div>
            <ul style="margin:6px 0;padding-left:20px">
              ${bundles.map(b => `<li><b>${b.qty}×</b> ${b.bundle_name} <span style="color:#6b7280">— ${rp(b.qty * b.price)}</span></li>`).join('')}
            </ul>
            <div style="margin-top:6px;font-size:11px;color:#6b7280">Tunjukkan QR di atas ke staff F&amp;B saat menukar combo</div>
          </td>
        </tr></table>
      </td></tr>` : '';
    const grand = seatsTotal + bundleTotal;
    return `
<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;max-width:100%">
        <tr><td style="padding:24px 28px;background:#0d1117;color:#fff">
          <div style="font-family:'Courier New',monospace;font-size:20px;font-weight:800;letter-spacing:2px">🎬 karya<span style="color:#a855f7">OS</span> Cinema</div>
          <div style="font-size:13px;color:#9ca3af;margin-top:4px">Konfirmasi pembelian tiket</div>
        </td></tr>
        <tr><td style="padding:22px 28px;color:#111">
          <div style="font-size:14px;color:#374151">Halo,<br/>Terima kasih sudah membeli tiket di KaryaOS Cinema. Berikut tiket Anda — simpan email ini atau buka langsung di pintu studio.</div>
          <table width="100%" style="margin-top:16px;font-size:13px;border:1px solid #e5e7eb;border-radius:10px">
            <tr><td style="padding:10px 14px"><b>Film:</b> ${head.film_title || '—'}</td></tr>
            <tr><td style="padding:10px 14px;border-top:1px solid #f3f4f6"><b>Jadwal:</b> ${head.show_date || ''} · ${head.start_time || ''}</td></tr>
            <tr><td style="padding:10px 14px;border-top:1px solid #f3f4f6"><b>Studio:</b> ${head.studio_name || ''} ${head.studio_type ? '· ' + head.studio_type : ''}</td></tr>
            <tr><td style="padding:10px 14px;border-top:1px solid #f3f4f6"><b>Kursi:</b> ${tickets.map(t => t.seat).join(', ')}</td></tr>
            <tr><td style="padding:10px 14px;border-top:1px solid #f3f4f6;color:#10b981"><b>Total:</b> ${rp(grand)}</td></tr>
          </table>
          <table width="100%" style="margin-top:8px">
            ${voucherBlock}
            ${ticketBlocks}
          </table>
          <div style="margin-top:18px;font-size:12px;color:#6b7280">Selamat menonton 🍿</div>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:11px;text-align:center">
          KaryaOS · sistem operasi karys.tech · Konfirmasi otomatis.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  function buildWAText({ tickets, bundles }) {
    const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
    const head = tickets[0] || {};
    const seatsTotal = tickets.reduce((a, t) => a + (t.price || 0), 0);
    const bundleTotal = bundles.reduce((a, b) => a + b.qty * b.price, 0);
    const lines = [
      `🎬 *KaryaOS Cinema — Tiket Anda*`, ``,
      `*${head.film_title || '—'}*`,
      `📅 ${head.show_date || ''} · ${head.start_time || ''}`,
      `🏛️ ${head.studio_name || ''}${head.studio_type ? ' · ' + head.studio_type : ''}`,
      `💺 Kursi: ${tickets.map(t => t.seat).join(', ')}`, ``,
      `*Kode tiket:*`,
      ...tickets.map(t => `• ${t.seat} — \`${t.code}\``),
    ];
    if (bundles.length) {
      lines.push('', '*🍿 F&B Combo:*');
      bundles.forEach(b => lines.push(`• ${b.qty}× ${b.bundle_name} — ${rp(b.qty * b.price)}`));
    }
    lines.push('', `*Total:* ${rp(seatsTotal + bundleTotal)}`, '', 'Tunjukkan kode QR di pintu studio (cek email atau struk cetak).');
    return lines.join('\n');
  }

  router.post('/tickets/send-email', async (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Email tidak valid' });
    }
    const E = getEmail();
    if (!E) return res.status(500).json({ ok: false, error: 'Modul email tidak tersedia' });
    const cfg = E.getConfig();
    if (!cfg.enabled) return res.status(503).json({ ok: false, error: 'Email belum di-enable di Admin → Settings' });
    const pkg = loadPurchase({ purchase_id: b.purchase_id, code: b.code });
    if (!pkg) return res.status(404).json({ ok: false, error: 'Tiket / purchase tidak ditemukan' });
    try {
      const html = buildEmailHTML(pkg);
      const subj = `🎬 KaryaOS Cinema — Tiket ${pkg.tickets[0].film_title || ''} ${pkg.tickets[0].show_date || ''} ${pkg.tickets[0].start_time || ''}`;
      const r = await E.sendEmail({ to: email, subject: subj, html });
      const now = Math.floor(Date.now()/1000);
      db.prepare(`UPDATE cinema_tickets SET email_sent_at = ?, buyer_email = COALESCE(NULLIF(buyer_email,''), ?) WHERE purchase_id = ?`)
        .run(now, email, pkg.purchase_id);
      res.json({ ok: true, messageId: r.messageId, email, tickets: pkg.tickets.length });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Gagal kirim email' });
    }
  });

  // ── DISTRIBUTORS / FILM LICENSING ────────────────────────────────────
  router.get('/distributors', (req, res) => {
    const all = String(req.query.all || '') === '1';
    const sql = all
      ? `SELECT * FROM cinema_distributors ORDER BY name`
      : `SELECT * FROM cinema_distributors WHERE is_active = 1 ORDER BY name`;
    res.json({ distributors: db.prepare(sql).all() });
  });
  router.post('/distributors', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO cinema_distributors
      (name, code, contact_person, contact_email, contact_phone, address, notes, is_active)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(String(b.name).trim(), b.code || '', b.contact_person || '', b.contact_email || '',
           b.contact_phone || '', b.address || '', b.notes || '', b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/distributors/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'code', 'contact_person', 'contact_email', 'contact_phone', 'address', 'notes', 'is_active']) {
      if (k in b) { fields.push(`${k} = ?`); args.push(k === 'is_active' ? (b[k] ? 1 : 0) : b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_distributors SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/distributors/:id', (req, res) => {
    // Don't orphan films — unlink instead
    db.prepare(`UPDATE cinema_films SET distributor_id = NULL WHERE distributor_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_distributors WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.get('/distributors/:id/films', (req, res) => {
    const films = db.prepare(`SELECT * FROM cinema_films WHERE distributor_id = ? ORDER BY title`).all(req.params.id);
    res.json({ films });
  });

  // Patch film license details (used by Film Distribution admin page)
  router.patch('/films/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['title', 'genre', 'duration_min', 'rating', 'status', 'synopsis',
                     'distributor_id', 'license_start', 'license_end', 'revenue_share_pct',
                     'min_run_days', 'distributor_notes']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        args.push(k === 'duration_min' || k === 'min_run_days' || k === 'distributor_id' ? (b[k] == null || b[k] === '' ? null : parseInt(b[k], 10))
                : k === 'revenue_share_pct' ? (b[k] == null || b[k] === '' ? 0 : parseFloat(b[k]))
                : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_films SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  // ── SHARE TIERS (per-film tiered revenue share) ──────────────────────
  router.get('/films/:id/share-tiers', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_share_tiers WHERE film_id = ? ORDER BY week_from`).all(req.params.id);
    res.json({ tiers: rows });
  });
  router.post('/films/:id/share-tiers', (req, res) => {
    const b = req.body || {};
    const wf = Math.max(1, parseInt(b.week_from, 10) || 1);
    const wt = b.week_to == null || b.week_to === '' ? null : Math.max(wf, parseInt(b.week_to, 10));
    const cp = Math.max(0, Math.min(100, parseFloat(b.cinema_pct ?? 50)));
    const dp = b.distributor_pct == null ? +(100 - cp).toFixed(2) : Math.max(0, Math.min(100, parseFloat(b.distributor_pct)));
    const info = db.prepare(`INSERT INTO cinema_share_tiers (film_id, week_from, week_to, cinema_pct, distributor_pct, notes) VALUES (?,?,?,?,?,?)`)
      .run(req.params.id, wf, wt, cp, dp, b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/share-tiers/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['week_from', 'week_to', 'cinema_pct', 'distributor_pct', 'notes']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'week_from' || k === 'week_to') args.push(b[k] == null || b[k] === '' ? null : parseInt(b[k], 10));
        else if (k === 'cinema_pct' || k === 'distributor_pct') args.push(parseFloat(b[k]) || 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_share_tiers SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/share-tiers/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_share_tiers WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  // Convenience: seed a film with the standard Indo template W1 50/50, W2 60/40, W3+ 70/30
  router.post('/films/:id/share-tiers/seed-standard', (req, res) => {
    db.prepare(`DELETE FROM cinema_share_tiers WHERE film_id = ?`).run(req.params.id);
    const ins = db.prepare(`INSERT INTO cinema_share_tiers (film_id, week_from, week_to, cinema_pct, distributor_pct, notes) VALUES (?,?,?,?,?,?)`);
    ins.run(req.params.id, 1, 1,    50, 50, 'Week 1');
    ins.run(req.params.id, 2, 2,    60, 40, 'Week 2');
    ins.run(req.params.id, 3, null, 70, 30, 'Week 3+');
    res.json({ ok: true });
  });

  // ── SETTLEMENT (auto-recon, tiered share aware) ──────────────────────
  // Untuk setiap tiket:
  //   net_per_tkt = price × (1 − vat_pct/100)
  //   week        = floor((sold_date − license_start) / 7) + 1
  //   tier        = tier dengan week_from ≤ week ≤ (week_to ?? ∞)
  //   distributor_royalty = net_per_tkt × tier.distributor_pct / 100
  //   cinema_share        = net_per_tkt × tier.cinema_pct / 100
  // Kalau film belum punya tiers → fallback ke film.revenue_share_pct flat.
  function getWeekIndex(soldAt, licenseStart) {
    if (!licenseStart) return 1;
    const [Y, M, D] = String(licenseStart).split('-').map(Number);
    if (!Y || !M || !D) return 1;
    const startMs = new Date(Y, M - 1, D, 0, 0, 0).getTime();
    const days = Math.floor((soldAt * 1000 - startMs) / 86400000);
    return Math.max(1, Math.floor(days / 7) + 1);
  }
  function pickTier(tiers, week) {
    for (const t of tiers) {
      if (week >= (t.week_from || 1) && (t.week_to == null || week <= t.week_to)) return t;
    }
    return null;
  }

  // Settlement: revenue per distributor × revenue share = royalty owed.
  // Filters: ?from=YYYY-MM-DD&to=YYYY-MM-DD&distributor_id=N
  router.get('/distribution/settlement', (req, res) => {
    const where = []; const params = {};
    if (req.query.from) { where.push(`date(t.sold_at,'unixepoch','localtime') >= @from`); params.from = req.query.from; }
    if (req.query.to)   { where.push(`date(t.sold_at,'unixepoch','localtime') <= @to`);   params.to = req.query.to; }
    if (req.query.distributor_id) { where.push(`f.distributor_id = @did`); params.did = parseInt(req.query.distributor_id, 10); }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Pull each ticket with its film + distributor; compute tiered royalty in JS
    const rows = db.prepare(`
      SELECT t.id AS ticket_id, t.price, t.sold_at,
             f.id AS film_id, f.title AS film_title, f.license_start, f.license_end,
             f.revenue_share_pct AS legacy_share_pct,
             d.id AS distributor_id, d.name AS distributor_name, d.code AS distributor_code,
             COALESCE(d.vat_pct, 11) AS vat_pct
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films    f ON f.id = s.film_id
      LEFT JOIN cinema_distributors d ON d.id = f.distributor_id
      ${W}
    `).all(params);

    // Cache tiers per film
    const tiersByFilm = {};
    function getTiers(filmId) {
      if (filmId == null) return [];
      if (tiersByFilm[filmId]) return tiersByFilm[filmId];
      tiersByFilm[filmId] = db.prepare(`SELECT * FROM cinema_share_tiers WHERE film_id = ? ORDER BY week_from`).all(filmId);
      return tiersByFilm[filmId];
    }

    const byDistMap = {};   // distributor_id → aggregate
    const byFilmMap = {};   // film_id → aggregate
    const byTierMap = {};   // `${distributor_id}|${film_id}|week_from-week_to` → aggregate
    for (const r of rows) {
      const vat = r.vat_pct || 0;
      const gross = r.price || 0;
      const net = gross * (1 - vat / 100);
      const week = getWeekIndex(r.sold_at, r.license_start);
      const tiers = getTiers(r.film_id);
      const tier  = pickTier(tiers, week);
      let cinemaPct, distributorPct, tierKey, tierLabel;
      if (tier) {
        cinemaPct = tier.cinema_pct;
        distributorPct = tier.distributor_pct;
        tierKey = `tier:${tier.id}`;
        tierLabel = `W${tier.week_from}${tier.week_to ? '-W' + tier.week_to : '+'} · ${cinemaPct}/${distributorPct}`;
      } else {
        // Legacy fallback — flat revenue_share_pct as distributor cut
        distributorPct = r.legacy_share_pct || 0;
        cinemaPct = 100 - distributorPct;
        tierKey = `legacy:${r.film_id}`;
        tierLabel = `flat ${cinemaPct}/${distributorPct}`;
      }
      const royalty = net * distributorPct / 100;
      const cinemaShare = net * cinemaPct / 100;

      // Aggregate per distributor
      const dKey = r.distributor_id || 'none';
      const D = byDistMap[dKey] || (byDistMap[dKey] = {
        distributor_id: r.distributor_id, distributor_name: r.distributor_name || '— Tanpa distributor —',
        distributor_code: r.distributor_code || '',
        tickets: 0, gross: 0, vat: 0, net: 0, royalty: 0, cinema_share: 0,
      });
      D.tickets++; D.gross += gross; D.vat += gross - net; D.net += net;
      D.royalty += royalty; D.cinema_share += cinemaShare;

      // Aggregate per film
      const fKey = r.film_id || 'none';
      const F = byFilmMap[fKey] || (byFilmMap[fKey] = {
        film_id: r.film_id, film_title: r.film_title || '—',
        distributor_id: r.distributor_id, distributor_name: r.distributor_name || '— Tanpa distributor —',
        license_start: r.license_start, license_end: r.license_end,
        tickets: 0, gross: 0, net: 0, royalty: 0, cinema_share: 0,
      });
      F.tickets++; F.gross += gross; F.net += net;
      F.royalty += royalty; F.cinema_share += cinemaShare;

      // Aggregate per tier (untuk audit recon)
      const tKey = `${dKey}|${fKey}|${tierKey}`;
      const T = byTierMap[tKey] || (byTierMap[tKey] = {
        distributor_id: r.distributor_id, distributor_name: r.distributor_name || '— Tanpa distributor —',
        film_id: r.film_id, film_title: r.film_title || '—',
        tier_label: tierLabel, cinema_pct: cinemaPct, distributor_pct: distributorPct,
        tickets: 0, gross: 0, net: 0, royalty: 0, cinema_share: 0,
      });
      T.tickets++; T.gross += gross; T.net += net;
      T.royalty += royalty; T.cinema_share += cinemaShare;
    }

    const byDistributor = Object.values(byDistMap).sort((a, b) => b.net - a.net);
    const byFilm        = Object.values(byFilmMap).sort((a, b) => b.net - a.net);
    const byTier        = Object.values(byTierMap).sort((a, b) => b.net - a.net);
    const totals = {
      tickets:      rows.length,
      gross:        byDistributor.reduce((a, r) => a + r.gross, 0),
      vat:          byDistributor.reduce((a, r) => a + r.vat, 0),
      net:          byDistributor.reduce((a, r) => a + r.net, 0),
      royalty:      byDistributor.reduce((a, r) => a + r.royalty, 0),
      cinema_share: byDistributor.reduce((a, r) => a + r.cinema_share, 0),
    };
    res.json({ totals, by_distributor: byDistributor, by_film: byFilm, by_tier: byTier });
  });

  // ── PRICE LIST MASTER ─────────────────────────────────────────────────
  // Resolution: hitung specificity score (kolom non-NULL = +1) lalu price tertinggi
  // score wins. Tie → harga terbaru. Selalu fallback ke aturan paling umum.
  function dayTypeFromDate(d) {
    if (!d) return 'weekday';
    const [Y, M, D] = String(d).split('-').map(Number);
    if (!Y || !M || !D) return 'weekday';
    const dow = new Date(Y, M - 1, D).getDay();    // 0=Min, 6=Sab
    return (dow === 0 || dow === 5 || dow === 6) ? 'weekend' : 'weekday';
  }
  function timeBandFromTime(t) {
    if (!t) return 'matinee';
    const h = parseInt(String(t).split(':')[0], 10) || 0;
    if (h < 12) return 'morning';
    if (h < 17) return 'matinee';
    if (h < 21) return 'prime';
    return 'late';
  }
  function resolvePrice({ outlet, studio_type, format, day_type, time_band }) {
    const rows = db.prepare(`SELECT * FROM cinema_price_list WHERE outlet = ? AND is_active = 1`).all(outlet || '');
    if (!rows.length) return null;
    let best = null, bestScore = -1;
    for (const r of rows) {
      // Match: NULL field = wildcard cocok; non-NULL harus persis sama.
      if (r.studio_type && studio_type && r.studio_type !== studio_type) continue;
      if (r.studio_type && !studio_type) continue;
      if (r.format      && format      && r.format      !== format)      continue;
      if (r.format      && !format)      continue;
      if (r.day_type    && day_type    && r.day_type    !== day_type)    continue;
      if (r.day_type    && !day_type)    continue;
      if (r.time_band   && time_band   && r.time_band   !== time_band)   continue;
      if (r.time_band   && !time_band)   continue;
      const score = (r.studio_type ? 1 : 0) + (r.format ? 1 : 0) + (r.day_type ? 1 : 0) + (r.time_band ? 1 : 0);
      if (score > bestScore) { best = r; bestScore = score; }
    }
    return best;
  }

  router.get('/price-list', (req, res) => {
    const rows = req.query.outlet
      ? db.prepare(`SELECT * FROM cinema_price_list WHERE outlet = ? ORDER BY studio_type, format, day_type, time_band`).all(req.query.outlet)
      : db.prepare(`SELECT * FROM cinema_price_list ORDER BY outlet, studio_type, format, day_type, time_band`).all();
    // Distinct outlets for picker
    const outlets = db.prepare(`SELECT DISTINCT outlet FROM cinema_price_list ORDER BY outlet`).all().map(r => r.outlet);
    res.json({ rows, outlets });
  });
  router.post('/price-list', (req, res) => {
    const b = req.body || {};
    if (!b.outlet || b.price == null) return res.status(400).json({ ok: false, error: 'outlet + price wajib' });
    const info = db.prepare(`INSERT INTO cinema_price_list (outlet, studio_type, format, day_type, time_band, price, is_active, notes) VALUES (?,?,?,?,?,?,?,?)`)
      .run(String(b.outlet), b.studio_type || null, b.format || null, b.day_type || null, b.time_band || null,
           parseInt(b.price, 10) || 0, b.is_active === false ? 0 : 1, b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/price-list/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['outlet', 'studio_type', 'format', 'day_type', 'time_band', 'price', 'is_active', 'notes']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'price') args.push(parseInt(b[k], 10) || 0);
        else if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else args.push(b[k] === '' ? null : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_price_list SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/price-list/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_price_list WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  // Resolve: kasih input outlet/studio/format/date/time → kembali aturan terbaik.
  router.get('/price-list/resolve', (req, res) => {
    const outlet      = req.query.outlet || '';
    const studio_type = req.query.studio_type || null;
    const format      = req.query.format || null;
    const day_type    = req.query.day_type || (req.query.date ? dayTypeFromDate(req.query.date) : null);
    const time_band   = req.query.time_band || (req.query.time ? timeBandFromTime(req.query.time) : null);
    const best = resolvePrice({ outlet, studio_type, format, day_type, time_band });
    res.json({ ok: true, price: best ? best.price : null, rule: best, resolved: { outlet, studio_type, format, day_type, time_band } });
  });

  // ── FILM RATINGS ──────────────────────────────────────────────────────
  router.post('/films/:id/rate', (req, res) => {
    const b = req.body || {};
    const r = parseInt(b.rating, 10);
    if (!r || r < 1 || r > 5) return res.status(400).json({ ok: false, error: 'Rating 1-5 wajib' });
    const film = db.prepare(`SELECT id FROM cinema_films WHERE id = ?`).get(req.params.id);
    if (!film) return res.status(404).json({ ok: false, error: 'Film tidak ditemukan' });
    const info = db.prepare(`INSERT INTO cinema_film_ratings (film_id, rating, comment, customer_name, customer_phone, ticket_code) VALUES (?,?,?,?,?,?)`)
      .run(req.params.id, r, b.comment || '', b.customer_name || '', b.customer_phone || '', b.ticket_code || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.get('/films/:id/ratings', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_film_ratings WHERE film_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.params.id);
    const agg  = db.prepare(`SELECT ROUND(AVG(rating),2) avg, COUNT(*) total FROM cinema_film_ratings WHERE film_id = ?`).get(req.params.id);
    res.json({ ratings: rows, avg: agg.avg, total: agg.total });
  });

  // ── STUDIO EVENT BOOKING ──────────────────────────────────────────────
  // Booking studio penuh untuk event privat / corporate / wedding / birthday.
  // Conflict check: tidak boleh overlap dengan booking lain di studio/tanggal yang sama.
  function bookingOverlaps(studio_id, event_date, start_time, end_time, excludeId) {
    let sql = `SELECT id FROM cinema_studio_bookings
               WHERE studio_id = ? AND event_date = ? AND status != 'cancelled'
                 AND NOT (end_time <= ? OR start_time >= ?)`;
    const args = [studio_id, event_date, start_time, end_time];
    if (excludeId) { sql += ' AND id != ?'; args.push(excludeId); }
    return db.prepare(sql).all(...args);
  }
  router.get('/event-bookings', (req, res) => {
    const where = []; const params = {};
    if (req.query.from)         { where.push('b.event_date >= @from');           params.from = req.query.from; }
    if (req.query.to)           { where.push('b.event_date <= @to');             params.to = req.query.to; }
    if (req.query.studio_id)    { where.push('b.studio_id = @sid');              params.sid = parseInt(req.query.studio_id, 10); }
    if (req.query.status)       { where.push('b.status = @status');              params.status = req.query.status; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT b.*, s.name AS studio_name, s.studio_type, (s.rows * s.cols) AS capacity
      FROM cinema_studio_bookings b
      LEFT JOIN cinema_studios s ON s.id = b.studio_id
      ${W} ORDER BY b.event_date DESC, b.start_time DESC LIMIT 200
    `).all(params);
    res.json({ bookings: rows });
  });
  router.post('/event-bookings', (req, res) => {
    const b = req.body || {};
    const sid = parseInt(b.studio_id, 10);
    if (!sid || !b.event_date || !b.start_time || !b.end_time) {
      return res.status(400).json({ ok: false, error: 'studio_id, event_date, start_time, end_time wajib' });
    }
    if (b.start_time >= b.end_time) {
      return res.status(400).json({ ok: false, error: 'end_time harus lebih besar dari start_time' });
    }
    const overlaps = bookingOverlaps(sid, b.event_date, b.start_time, b.end_time);
    if (overlaps.length) {
      return res.status(409).json({ ok: false, error: 'Studio sudah di-booking di slot ini (bentrok dengan booking lain)', conflict_ids: overlaps.map(o => o.id) });
    }
    const code = 'CE-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    const info = db.prepare(`INSERT INTO cinema_studio_bookings
      (booking_code, studio_id, event_type, event_name, event_date, start_time, end_time,
       contact_name, contact_phone, contact_email, attendees, total_price, deposit_paid, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, sid, b.event_type || 'private',  b.event_name || '',
           b.event_date, b.start_time, b.end_time,
           b.contact_name || '', b.contact_phone || '', b.contact_email || '',
           parseInt(b.attendees, 10) || 0, parseInt(b.total_price, 10) || 0,
           parseInt(b.deposit_paid, 10) || 0, b.status || 'pending', b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid, booking_code: code });
  });
  router.patch('/event-bookings/:id', (req, res) => {
    const b = req.body || {};
    const existing = db.prepare(`SELECT * FROM cinema_studio_bookings WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Booking tidak ditemukan' });
    // Conflict check if any time field changed
    if (b.event_date || b.start_time || b.end_time || b.studio_id) {
      const sid = b.studio_id ? parseInt(b.studio_id, 10) : existing.studio_id;
      const ed  = b.event_date || existing.event_date;
      const st  = b.start_time || existing.start_time;
      const et  = b.end_time   || existing.end_time;
      if (st >= et) return res.status(400).json({ ok: false, error: 'end_time harus lebih besar dari start_time' });
      const overlaps = bookingOverlaps(sid, ed, st, et, parseInt(req.params.id, 10));
      if (overlaps.length) return res.status(409).json({ ok: false, error: 'Bentrok dengan booking lain' });
    }
    const fields = []; const args = [];
    for (const k of ['studio_id', 'event_type', 'event_name', 'event_date', 'start_time', 'end_time',
                     'contact_name', 'contact_phone', 'contact_email', 'attendees', 'total_price', 'deposit_paid', 'status', 'notes']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['studio_id', 'attendees', 'total_price', 'deposit_paid'].includes(k)) args.push(parseInt(b[k], 10) || 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_studio_bookings SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/event-bookings/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_studio_bookings WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── IN-STUDIO QR ORDER ────────────────────────────────────────────────
  // Customer scans seat-side QR mid-movie → orders F&B for delivery.
  // Menu = cinema_bundles catalog (re-used; staff sees orders in admin queue).
  router.get('/in-studio/menu', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_bundles WHERE is_active = 1 ORDER BY sort_order, name`).all();
    res.json({ items: rows });
  });
  router.post('/in-studio/orders', (req, res) => {
    const b = req.body || {};
    const seat = String(b.seat || '').trim();
    if (!seat) return res.status(400).json({ ok: false, error: 'Kursi wajib diisi' });
    const items = Array.isArray(b.items) ? b.items : [];
    const valid = [];
    for (const it of items) {
      const bid = parseInt(it.bundle_id, 10);
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      if (!bid) continue;
      const bn = db.prepare(`SELECT * FROM cinema_bundles WHERE id = ? AND is_active = 1`).get(bid);
      if (!bn) return res.status(400).json({ ok: false, error: `Menu id ${bid} tidak ditemukan` });
      valid.push({ bundle_id: bn.id, bundle_name: bn.name, qty, price: bn.price });
    }
    if (!valid.length) return res.status(400).json({ ok: false, error: 'Pesanan kosong' });
    const total = valid.reduce((a, r) => a + r.qty * r.price, 0);
    const code = 'CO-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    let orderId;
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO cinema_in_studio_orders
        (order_code, showtime_id, studio_id, studio_name, seat, buyer_name, buyer_phone, notes, total)
        VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(code,
             b.showtime_id ? parseInt(b.showtime_id, 10) : null,
             b.studio_id   ? parseInt(b.studio_id, 10)   : null,
             b.studio_name || '', seat,
             b.buyer_name || '', b.buyer_phone || '',
             b.notes || '', total);
      orderId = info.lastInsertRowid;
      const insIt = db.prepare(`INSERT INTO cinema_in_studio_order_items (order_id, bundle_id, bundle_name, qty, price) VALUES (?,?,?,?,?)`);
      for (const r of valid) insIt.run(orderId, r.bundle_id, r.bundle_name, r.qty, r.price);
    })();
    res.json({ ok: true, id: orderId, order_code: code, total, items: valid });
  });
  router.get('/in-studio/orders', (req, res) => {
    const where = []; const params = {};
    if (req.query.status)      { where.push('o.status = @status');           params.status = req.query.status; }
    if (req.query.studio_id)   { where.push('o.studio_id = @studio_id');     params.studio_id = parseInt(req.query.studio_id, 10); }
    if (req.query.from)        { where.push("date(o.created_at,'unixepoch','localtime') >= @from"); params.from = req.query.from; }
    if (req.query.to)          { where.push("date(o.created_at,'unixepoch','localtime') <= @to");   params.to = req.query.to; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orders = db.prepare(`
      SELECT o.*, COUNT(i.id) AS items_count
      FROM cinema_in_studio_orders o
      LEFT JOIN cinema_in_studio_order_items i ON i.order_id = o.id
      ${W} GROUP BY o.id ORDER BY o.created_at DESC LIMIT 200
    `).all(params);
    // Hydrate items
    const ids = orders.map(o => o.id);
    if (ids.length) {
      const phs = ids.map(() => '?').join(',');
      const itemRows = db.prepare(`SELECT * FROM cinema_in_studio_order_items WHERE order_id IN (${phs})`).all(...ids);
      const byOrder = {};
      for (const it of itemRows) (byOrder[it.order_id] = byOrder[it.order_id] || []).push(it);
      for (const o of orders) o.items = byOrder[o.id] || [];
    }
    res.json({ orders });
  });
  router.patch('/in-studio/orders/:id', (req, res) => {
    const b = req.body || {};
    const o = db.prepare(`SELECT * FROM cinema_in_studio_orders WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ ok: false, error: 'Order tidak ditemukan' });
    const fields = []; const args = [];
    if (b.status && ['pending', 'preparing', 'delivered', 'cancelled'].includes(b.status)) {
      fields.push('status = ?'); args.push(b.status);
      if (b.status === 'delivered') { fields.push('delivered_at = ?'); args.push(Math.floor(Date.now()/1000)); }
    }
    if (b.delivered_by) { fields.push('delivered_by = ?'); args.push(String(b.delivered_by)); }
    if (b.notes != null) { fields.push('notes = ?'); args.push(b.notes); }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_in_studio_orders SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.get('/tickets/wa-text', (req, res) => {
    const pkg = loadPurchase({ purchase_id: req.query.purchase_id, code: req.query.code });
    if (!pkg) return res.status(404).json({ ok: false, error: 'Tiket / purchase tidak ditemukan' });
    res.json({ ok: true, text: buildWAText(pkg), purchase_id: pkg.purchase_id, tickets: pkg.tickets.length });
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
    const showtimes = db.prepare(`SELECT s.id, s.status, s.manual_closed_at, s.show_date, s.start_time,
                                         f.title AS film_title, f.duration_min,
                                         st.name AS studio_name, (st.rows * st.cols) AS capacity,
                                         COUNT(t.id) AS sold, COALESCE(SUM(t.price),0) AS revenue
                                  FROM cinema_showtimes s
                                  LEFT JOIN cinema_films f ON f.id = s.film_id
                                  LEFT JOIN cinema_studios st ON st.id = s.studio_id
                                  LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
                                  GROUP BY s.id ORDER BY s.show_date, s.start_time`).all().map(r => ({
      ...r,
      derived_status: computeStatus(r, r.capacity, r.sold, Math.floor(Date.now()/1000)),
    }));
    // F&B bundle revenue (across all purchases, then today)
    const fnb = db.prepare(`SELECT COUNT(*) items, COALESCE(SUM(qty*price),0) revenue,
                                   COALESCE(SUM(CASE WHEN redeemed_at IS NOT NULL THEN qty ELSE 0 END),0) redeemed
                            FROM cinema_purchase_bundles`).get();
    const fnb_today = db.prepare(`SELECT COUNT(*) items, COALESCE(SUM(qty*price),0) revenue
                                  FROM cinema_purchase_bundles
                                  WHERE date(created_at,'unixepoch','localtime') = date('now','localtime')`).get();
    res.json({ totals, today, by_film, showtimes, fnb, fnb_today });
  });

  const mountPath = opts.mountPath || '/api/cinema';
  app.use(mountPath, router);
  console.log(`[cinema] mounted at ${mountPath} — films, studios, showtimes`);

  return { router, db };
}

module.exports = { setupCinema };
