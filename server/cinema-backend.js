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
    // Pull duration via film for derived status
    const film = db.prepare(`SELECT duration_min FROM cinema_films WHERE id = ?`).get(st.film_id);
    const derived_status = computeStatus({ ...st, duration_min: film?.duration_min }, capacity, sold.length, Math.floor(Date.now()/1000));
    res.json({ showtime: { ...st, derived_status }, rows: st.rows || 0, cols: st.cols || 0, capacity, sold, sold_count: sold.length, derived_status });
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
