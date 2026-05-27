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
const net = require('net');
const { buildCinemaTicket } = require('./escpos');

// WA module for auto-send e-ticket. Lazy require so server starts even kalau
// whatsapp.js belum siap (best-effort, never block booking).
let _waMod = null;
try { _waMod = require('./whatsapp'); } catch { _waMod = null; }
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
-- Seat types per studio (regular / couple / vip / disabled) + per-seat surcharge
CREATE TABLE IF NOT EXISTS cinema_seat_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studio_id INTEGER NOT NULL,
  seat TEXT NOT NULL,
  seat_type TEXT DEFAULT 'regular' CHECK (seat_type IN ('regular','couple','vip','disabled')),
  price_modifier INTEGER DEFAULT 0,
  UNIQUE(studio_id, seat)
);
CREATE INDEX IF NOT EXISTS idx_cst_studio ON cinema_seat_types(studio_id);
-- Cleaning logs per studio (optionally tied to showtime)
CREATE TABLE IF NOT EXISTS cinema_cleaning_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studio_id INTEGER NOT NULL,
  cleaned_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  cleaned_by TEXT,
  notes TEXT,
  showtime_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ccl_studio ON cinema_cleaning_logs(studio_id);
-- Promotions: promo codes (percentage/fixed) per type (movie/combo/bank/member/all)
CREATE TABLE IF NOT EXISTS cinema_promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  promo_type TEXT NOT NULL DEFAULT 'all' CHECK (promo_type IN ('movie','combo','bank','member','all')),
  discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage','fixed')),
  discount_value REAL NOT NULL DEFAULT 0,
  min_purchase INTEGER DEFAULT 0,
  max_discount INTEGER,
  applies_to_film_id INTEGER,
  applies_to_bundle_id INTEGER,
  bank_name TEXT,
  valid_from TEXT,
  valid_to TEXT,
  max_redemptions INTEGER,
  redemption_count INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cprom_code ON cinema_promotions(code);
CREATE INDEX IF NOT EXISTS idx_cprom_active ON cinema_promotions(is_active);
CREATE TABLE IF NOT EXISTS cinema_promo_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promo_id INTEGER NOT NULL,
  purchase_id TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  discount_amount INTEGER DEFAULT 0,
  redeemed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cpr_promo ON cinema_promo_redemptions(promo_id);
-- Post-show multi-aspect feedback (movie / audio / cleanliness / comfort)
CREATE TABLE IF NOT EXISTS cinema_post_show_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_code TEXT,
  showtime_id INTEGER,
  film_id INTEGER,
  rating_movie INTEGER CHECK (rating_movie BETWEEN 1 AND 5),
  rating_audio INTEGER CHECK (rating_audio BETWEEN 1 AND 5),
  rating_cleanliness INTEGER CHECK (rating_cleanliness BETWEEN 1 AND 5),
  rating_comfort INTEGER CHECK (rating_comfort BETWEEN 1 AND 5),
  comment TEXT,
  customer_phone TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cpsf_film ON cinema_post_show_feedback(film_id);
-- Indonesian public holidays (used by price-list day_type='holiday' resolution)
CREATE TABLE IF NOT EXISTS cinema_holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
-- Genre→combo recommendation map (cinema_bundles already exists)
CREATE TABLE IF NOT EXISTS cinema_genre_combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  genre_keyword TEXT NOT NULL,
  bundle_id INTEGER NOT NULL,
  priority INTEGER DEFAULT 1,
  UNIQUE(genre_keyword, bundle_id)
);
-- Movie campaign engine (premiere/midnight/family/student day + custom)
CREATE TABLE IF NOT EXISTS cinema_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'special' CHECK (campaign_type IN ('premiere','midnight','family','student','special')),
  film_id INTEGER,
  start_date TEXT,
  end_date TEXT,
  applicable_days TEXT,
  start_time_band TEXT,
  end_time_band TEXT,
  special_price INTEGER,
  discount_pct REAL DEFAULT 0,
  min_attendees INTEGER DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ccamp_active ON cinema_campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_ccamp_dates ON cinema_campaigns(start_date, end_date);
-- Cinema inventory (popcorn, syrup, cup, etc) + recipe per combo (auto-deduct on sale)
CREATE TABLE IF NOT EXISTS cinema_inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT,
  current_stock REAL DEFAULT 0,
  low_stock_threshold REAL DEFAULT 0,
  cost_per_unit INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS cinema_bundle_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bundle_id INTEGER NOT NULL,
  inventory_item_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  UNIQUE(bundle_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS idx_cbr_bundle ON cinema_bundle_recipes(bundle_id);
CREATE TABLE IF NOT EXISTS cinema_inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_item_id INTEGER NOT NULL,
  qty_change REAL NOT NULL,
  source TEXT,
  source_id INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cim_item ON cinema_inventory_movements(inventory_item_id);
-- Per-outlet × studio_type default pricing
-- (auto-applied to new showtimes when price not provided)
CREATE TABLE IF NOT EXISTS cinema_outlet_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet TEXT NOT NULL,
  studio_type TEXT NOT NULL DEFAULT 'Regular',
  weekday_price INTEGER NOT NULL DEFAULT 50000,
  weekend_price INTEGER NOT NULL DEFAULT 65000,
  holiday_price INTEGER DEFAULT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  UNIQUE(outlet, studio_type)
);
CREATE INDEX IF NOT EXISTS idx_cop_outlet ON cinema_outlet_pricing(outlet);
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
  // Per-outlet bundle availability: CSV outlet codes (e.g. 'JKT01,BDG01') atau NULL=global
  try { db.exec("ALTER TABLE cinema_bundles ADD COLUMN outlet_codes TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_bundles ADD COLUMN image_url TEXT"); } catch {}

  // ── SHOWTIME TEMPLATES — recurring schedule generator ──
  // Template: film + studio + days_of_week + start_time + active range
  // Generator bulk-create showtime rows untuk N hari ke depan (idempotent).
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_showtime_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    film_id INTEGER NOT NULL,
    studio_id INTEGER NOT NULL,
    days_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    format TEXT DEFAULT '2D',
    price INTEGER DEFAULT 0,
    active_from TEXT,
    active_until TEXT,
    is_active INTEGER DEFAULT 1,
    last_generated_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cst_active ON cinema_showtime_templates(is_active)"); } catch {}

  // Payment audit — kiosk QRIS / POS cash / debit
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN payment_ref TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN payment_method TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN payment_status TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_tickets ADD COLUMN paid_at INTEGER"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cinema_ticket_paystatus ON cinema_tickets(payment_status)"); } catch {}
  // Auto-trigger promo: unlock saat daily sales / tickets reach threshold
  try { db.exec("ALTER TABLE cinema_promotions ADD COLUMN trigger_type TEXT DEFAULT 'code'"); } catch {}
  try { db.exec("ALTER TABLE cinema_promotions ADD COLUMN trigger_threshold INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE cinema_promotions ADD COLUMN trigger_scope TEXT DEFAULT 'global'"); } catch {}
  // In-studio QR-order — payment audit trail (QRIS Midtrans/Xendit ref + paid_at)
  try { db.exec("ALTER TABLE cinema_in_studio_orders ADD COLUMN payment_ref TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_in_studio_orders ADD COLUMN payment_method TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_in_studio_orders ADD COLUMN payment_status TEXT DEFAULT 'unpaid'"); } catch {}
  try { db.exec("ALTER TABLE cinema_in_studio_orders ADD COLUMN paid_at INTEGER"); } catch {}
  try { db.exec("ALTER TABLE cinema_in_studio_orders ADD COLUMN payment_amount INTEGER DEFAULT 0"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_ciso_paystatus ON cinema_in_studio_orders(payment_status)"); } catch {}
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
  // Archive flag — hide showtime lama dari main list, tapi data dipertahankan untuk reporting
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN is_archived INTEGER DEFAULT 0"); } catch {}
  // Accessibility: subtitle/closed-captions + hearing-loop support per showtime
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN is_subtitled INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN subtitle_language TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN audio_description INTEGER DEFAULT 0"); } catch {}
  // Accessibility per-seat: companion seat (untuk caregiver, biasanya sebelah wheelchair)
  try { db.exec("ALTER TABLE cinema_seat_types ADD COLUMN accessibility_note TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_showtimes ADD COLUMN archived_at INTEGER"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_showtimes_archived ON cinema_showtimes(is_archived)"); } catch {}
  // Available formats per film (CSV) — metadata informasi
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN available_formats TEXT DEFAULT '2D'"); } catch {}
  // Movie metadata expansion (subtitle, language, trailer, poster)
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN subtitle TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN language TEXT DEFAULT 'Indonesia'"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN trailer_url TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_films ADD COLUMN poster_url TEXT"); } catch {}
  // Studio maintenance / cleaning status
  try { db.exec("ALTER TABLE cinema_studios ADD COLUMN maintenance_status TEXT DEFAULT 'operational'"); } catch {}
  try { db.exec("ALTER TABLE cinema_studios ADD COLUMN last_cleaned_at INTEGER"); } catch {}
  try { db.exec("ALTER TABLE cinema_studios ADD COLUMN last_cleaned_by TEXT"); } catch {}
  // Custom seat-map per studio (JSON 2D array). null → fallback ke rows×cols grid.
  // Schema: [ [ {type:'regular'|'void'|'premium'|'couple'|'disabled', label?:string, span?:number} | null, ... ], ... ]
  try { db.exec("ALTER TABLE cinema_studios ADD COLUMN seat_map TEXT"); } catch {}
  // Per-seat-type pricing JSON: { regular: 50000, premium: 75000, couple: 90000, vip: 150000, disabled: 50000 }
  // null → fallback ke showtime.price (regular all)
  try { db.exec("ALTER TABLE cinema_studios ADD COLUMN seat_type_prices TEXT"); } catch {}

  // Seed cinema inventory + recipes on first run
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_inventory_items`).get().c === 0) {
    const si = db.prepare(`INSERT INTO cinema_inventory_items (name, unit, current_stock, low_stock_threshold, cost_per_unit) VALUES (?,?,?,?,?)`);
    const items = {
      popcorn_kernel: si.run('Popcorn Kernel',    'kg',    50, 10,  35000).lastInsertRowid,
      butter:         si.run('Butter Topping',    'liter', 20, 5,   45000).lastInsertRowid,
      cup_medium:     si.run('Cup Medium',        'pcs',   500, 100, 1500).lastInsertRowid,
      cup_large:      si.run('Cup Large',         'pcs',   300, 80,  2000).lastInsertRowid,
      cola_syrup:     si.run('Coca-Cola Syrup',   'liter', 25, 5,   65000).lastInsertRowid,
      ice:            si.run('Ice',               'kg',    100, 20,  2000).lastInsertRowid,
      nacho_chips:    si.run('Nacho Chips',       'kg',    15, 3,   55000).lastInsertRowid,
      cheese_dip:     si.run('Cheese Dip',        'liter', 8,  2,   75000).lastInsertRowid,
      hotdog_bun:     si.run('Hot Dog Bun',       'pcs',   200, 40,  3500).lastInsertRowid,
      sausage:        si.run('Sausage',           'pcs',   200, 40,  5500).lastInsertRowid,
      mineral_water:  si.run('Air Mineral 600ml', 'pcs',   400, 80,  2500).lastInsertRowid,
    };
    // Link to existing bundles via name match (best-effort seed)
    const bundles = db.prepare(`SELECT id, name FROM cinema_bundles`).all();
    const sr = db.prepare(`INSERT OR IGNORE INTO cinema_bundle_recipes (bundle_id, inventory_item_id, qty) VALUES (?,?,?)`);
    for (const b of bundles) {
      const n = (b.name || '').toLowerCase();
      if (n.includes('popcorn') && n.includes('medium')) {
        sr.run(b.id, items.popcorn_kernel, 0.08);
        sr.run(b.id, items.butter, 0.02);
        sr.run(b.id, items.cup_medium, 1);
        sr.run(b.id, items.cola_syrup, 0.15);
        sr.run(b.id, items.ice, 0.1);
      } else if (n.includes('popcorn') && n.includes('large')) {
        sr.run(b.id, items.popcorn_kernel, 0.15);
        sr.run(b.id, items.butter, 0.04);
        sr.run(b.id, items.cup_large, 2);
        sr.run(b.id, items.cola_syrup, 0.4);
        sr.run(b.id, items.ice, 0.2);
      } else if (n.includes('nacho')) {
        sr.run(b.id, items.nacho_chips, 0.1);
        sr.run(b.id, items.cheese_dip, 0.08);
      } else if (n.includes('hot dog')) {
        sr.run(b.id, items.hotdog_bun, 1);
        sr.run(b.id, items.sausage, 1);
        sr.run(b.id, items.cup_medium, 1);
        sr.run(b.id, items.cola_syrup, 0.15);
        sr.run(b.id, items.ice, 0.1);
      } else if (n.includes('air mineral')) {
        sr.run(b.id, items.mineral_water, 1);
      }
    }
  }

  // Seed Indonesian public holidays 2026 on first run
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_holidays`).get().c === 0) {
    const sh = db.prepare(`INSERT INTO cinema_holidays (date, name) VALUES (?, ?)`);
    [
      ['2026-01-01', 'Tahun Baru Masehi'],
      ['2026-02-17', 'Tahun Raya Imlek'],
      ['2026-03-19', 'Hari Raya Nyepi'],
      ['2026-04-03', 'Wafat Isa Almasih'],
      ['2026-05-01', 'Hari Buruh'],
      ['2026-05-14', 'Kenaikan Isa Almasih'],
      ['2026-05-22', 'Hari Raya Waisak'],
      ['2026-06-01', 'Hari Lahir Pancasila'],
      ['2026-08-17', 'HUT Kemerdekaan RI'],
      ['2026-12-25', 'Hari Raya Natal'],
    ].forEach(([d, n]) => sh.run(d, n));
  }
  // Seed genre→combo suggestions
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_genre_combos`).get().c === 0) {
    const bundleIds = db.prepare(`SELECT id, name FROM cinema_bundles ORDER BY id`).all();
    if (bundleIds.length) {
      const sg = db.prepare(`INSERT OR IGNORE INTO cinema_genre_combos (genre_keyword, bundle_id, priority) VALUES (?,?,?)`);
      // Horror → Popcorn + Coke (Combo 1) + Nachos (Combo 3)
      if (bundleIds[0]) sg.run('horror',    bundleIds[0].id, 10);
      if (bundleIds[2]) sg.run('horror',    bundleIds[2].id, 9);
      // Action / Adventure → Combo Large (Combo 2)
      if (bundleIds[1]) sg.run('action',    bundleIds[1].id, 10);
      if (bundleIds[1]) sg.run('adventure', bundleIds[1].id, 9);
      // Drama / Romance → Combo small + drink
      if (bundleIds[0]) sg.run('drama',     bundleIds[0].id, 8);
      if (bundleIds[0]) sg.run('romance',   bundleIds[0].id, 8);
      // Animation / SU → Hot Dog + drink
      if (bundleIds[3]) sg.run('animation', bundleIds[3].id, 10);
      // Comedy → Nachos
      if (bundleIds[2]) sg.run('comedy',    bundleIds[2].id, 9);
    }
  }

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

  // Seed default per-outlet pricing — picks up outlet_master codes if present,
  // 2 baseline studio types (Regular / Premium). Idempotent — only runs once.
  if (db.prepare(`SELECT COUNT(*) c FROM cinema_outlet_pricing`).get().c === 0) {
    let outlets = [];
    try {
      outlets = db.prepare(`SELECT code FROM outlet_master WHERE is_active = 1 OR status = 'active' LIMIT 10`).all();
    } catch {
      // outlet_master may not exist yet — fall back to studios.outlet
      try {
        outlets = db.prepare(`SELECT DISTINCT outlet AS code FROM cinema_studios WHERE outlet IS NOT NULL AND outlet <> '' LIMIT 10`).all();
      } catch { outlets = []; }
    }
    // Final fallback: at least seed a "Paskal" row so admin sees the table populated.
    if (!outlets.length) outlets = [{ code: 'Paskal' }];
    const ins = db.prepare(`INSERT INTO cinema_outlet_pricing (outlet, studio_type, weekday_price, weekend_price) VALUES (?,?,?,?)`);
    for (const o of outlets) {
      for (const t of ['Regular', 'Premium']) {
        const wd = t === 'Premium' ? 75000 : 50000;
        const we = t === 'Premium' ? 95000 : 65000;
        try { ins.run(o.code, t, wd, we); } catch {}
      }
    }
    console.log(`[cinema] seeded outlet pricing untuk ${outlets.length} outlet × 2 studio_type`);
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
  // ── DASHBOARD — analytics/reporting aggregated ──
  // GET /api/cinema/dashboard?period=today|week|month&outlet=XXX
  // Return: KPI cards + per-outlet revenue + top films + occupancy + recent sales
  router.get('/dashboard', (req, res) => {
    const period = String(req.query.period || 'today');
    const outletFilter = String(req.query.outlet || '').trim();
    const now = Math.floor(Date.now() / 1000);
    const periodSec = period === 'week' ? 7 * 86400 : period === 'month' ? 30 * 86400 : 86400;
    const since = now - periodSec;

    const outletWhere = outletFilter ? `AND st.outlet = '${outletFilter.replace(/'/g, "''")}'` : '';
    // Multi-tenant filter: limit ke company saat ini
    const scope = req.companyScope || { is_super_admin: true };
    const cWhere = scope.is_super_admin ? '' : `AND t.company_id = ${parseInt(scope.company_id, 10)}`;
    const sWhere = scope.is_super_admin ? '' : `AND s.company_id = ${parseInt(scope.company_id, 10)}`;
    const fWhere = scope.is_super_admin ? '' : `AND f.company_id = ${parseInt(scope.company_id, 10)}`;

    // KPI: tickets sold + revenue total
    const kpi = db.prepare(`
      SELECT
        COUNT(t.id) AS tickets,
        COALESCE(SUM(t.price), 0) AS revenue,
        COUNT(DISTINCT t.purchase_id) AS purchases,
        COUNT(DISTINCT t.showtime_id) AS active_showtimes
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at > ? ${outletWhere} ${cWhere}
    `).get(since);

    // Revenue per outlet (top 10)
    const byOutlet = db.prepare(`
      SELECT st.outlet AS outlet, COUNT(t.id) AS tickets, COALESCE(SUM(t.price), 0) AS revenue
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at > ? AND st.outlet IS NOT NULL ${outletWhere} ${cWhere}
      GROUP BY st.outlet
      ORDER BY revenue DESC
      LIMIT 10
    `).all(since);

    // Top films (by tickets sold) — avg_rating computed from rating_count/rating_sum if columns exist
    const topFilms = db.prepare(`
      SELECT f.id, f.title, f.poster_url, COUNT(t.id) AS tickets, COALESCE(SUM(t.price), 0) AS revenue
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE t.sold_at > ? AND f.id IS NOT NULL ${outletWhere} ${cWhere}
      GROUP BY f.id
      ORDER BY tickets DESC
      LIMIT 10
    `).all(since);

    // Occupancy per showtime today (capacity vs sold)
    const today = new Date().toISOString().slice(0, 10);
    const occupancy = db.prepare(`
      SELECT s.id, s.show_date, s.start_time, f.title AS film_title, st.name AS studio_name, st.outlet,
             (st.rows * st.cols) AS capacity,
             (SELECT COUNT(*) FROM cinema_tickets WHERE showtime_id = s.id) AS sold
      FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE s.show_date >= ? ${outletWhere}
      ORDER BY s.show_date, s.start_time
      LIMIT 20
    `).all(today);

    // Recent sales (last 20)
    const recent = db.prepare(`
      SELECT t.id, t.code, t.seat, t.price, t.sold_at, t.payment_method,
             f.title AS film_title, st.name AS studio_name, st.outlet
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE t.sold_at > ? ${outletWhere}
      ORDER BY t.sold_at DESC
      LIMIT 20
    `).all(since);

    // F&B bundle stats
    const bundles = db.prepare(`
      SELECT pb.bundle_name, COUNT(*) AS sold, COALESCE(SUM(pb.qty * pb.price), 0) AS revenue
      FROM cinema_purchase_bundles pb
      WHERE pb.created_at > ?
      GROUP BY pb.bundle_name
      ORDER BY sold DESC
      LIMIT 10
    `).all(since);

    // Payment method breakdown
    const byMethod = db.prepare(`
      SELECT COALESCE(t.payment_method, 'unknown') AS method, COUNT(*) AS count, COALESCE(SUM(t.price), 0) AS revenue
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at > ? ${outletWhere} ${cWhere}
      GROUP BY method
    `).all(since);

    // 7-day sparkline data (tickets per day, last 7 days) + WoW comparison
    const sparkline = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = now - (i + 1) * 86400;
      const dayEnd = now - i * 86400;
      const r = db.prepare(`
        SELECT COUNT(t.id) AS tickets, COALESCE(SUM(t.price), 0) AS revenue
        FROM cinema_tickets t
        LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
        LEFT JOIN cinema_studios st ON st.id = s.studio_id
        WHERE t.sold_at >= ? AND t.sold_at < ? ${outletWhere} ${cWhere}
      `).get(dayStart, dayEnd);
      sparkline.push({ d: i, tickets: r?.tickets || 0, revenue: r?.revenue || 0 });
    }
    // Week-over-week: this week vs last week
    const thisWeekStart = now - 7 * 86400;
    const lastWeekStart = now - 14 * 86400;
    const thisWeek = db.prepare(`SELECT COUNT(t.id) AS tickets, COALESCE(SUM(t.price), 0) AS revenue FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at >= ? ${outletWhere} ${cWhere}`).get(thisWeekStart);
    const lastWeek = db.prepare(`SELECT COUNT(t.id) AS tickets, COALESCE(SUM(t.price), 0) AS revenue FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at >= ? AND t.sold_at < ? ${outletWhere} ${cWhere}`).get(lastWeekStart, thisWeekStart);
    const pctChange = (curr, prev) => {
      if (!prev) return curr > 0 ? 100 : 0;
      return Math.round((curr - prev) / prev * 100);
    };
    const wow = {
      tickets: { current: thisWeek?.tickets || 0, previous: lastWeek?.tickets || 0, pct: pctChange(thisWeek?.tickets || 0, lastWeek?.tickets || 0) },
      revenue: { current: thisWeek?.revenue || 0, previous: lastWeek?.revenue || 0, pct: pctChange(thisWeek?.revenue || 0, lastWeek?.revenue || 0) },
    };

    res.json({
      period, outlet: outletFilter || null, since,
      kpi: {
        tickets: kpi?.tickets || 0,
        revenue: kpi?.revenue || 0,
        purchases: kpi?.purchases || 0,
        active_showtimes: kpi?.active_showtimes || 0,
        avg_ticket_price: kpi?.tickets > 0 ? Math.round(kpi.revenue / kpi.tickets) : 0,
      },
      by_outlet: byOutlet,
      top_films: topFilms,
      occupancy: occupancy.map(o => ({
        ...o,
        occupancy_pct: o.capacity > 0 ? Math.round((o.sold / o.capacity) * 100) : 0,
      })),
      recent_sales: recent,
      bundles,
      by_payment_method: byMethod,
      sparkline,
      wow,
    });
  });

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
    // Multi-tenant: filter by company_id kalau bukan super-admin
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? '' : `WHERE f.company_id = ${parseInt(scope.company_id, 10)}`;
    res.json({ films: db.prepare(`
      SELECT f.*, d.name AS distributor_name, d.code AS distributor_code,
             ROUND((SELECT AVG(rating) FROM cinema_film_ratings WHERE film_id = f.id), 2) AS avg_rating,
             (SELECT COUNT(*) FROM cinema_film_ratings WHERE film_id = f.id) AS ratings_count
      FROM cinema_films f
      LEFT JOIN cinema_distributors d ON d.id = f.distributor_id
      ${where}
      ORDER BY f.status, f.title`).all() });
  });
  router.post('/films', (req, res) => {
    const b = req.body || {};
    if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'title wajib diisi' });
    const status = ['now_showing', 'coming_soon', 'archived'].includes(b.status) ? b.status : 'now_showing';
    // Multi-tenant: auto-tag company_id (scope.company_id atau default 2 = Cinema)
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;
    const info = db.prepare(`INSERT INTO cinema_films
      (title, genre, duration_min, rating, status, synopsis,
       distributor_id, license_start, license_end, revenue_share_pct, min_run_days, distributor_notes, company_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(String(b.title).trim(), b.genre || '', Number(b.duration_min) || 0, b.rating || 'SU', status, b.synopsis || '',
           b.distributor_id ? parseInt(b.distributor_id, 10) : null,
           b.license_start || null, b.license_end || null,
           b.revenue_share_pct == null || b.revenue_share_pct === '' ? 0 : parseFloat(b.revenue_share_pct),
           b.min_run_days ? parseInt(b.min_run_days, 10) : 0,
           b.distributor_notes || '', companyId);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.delete('/films/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_showtimes WHERE film_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_films WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── STUDIOS ──
  router.get('/studios', (req, res) => {
    // Multi-tenant: filter by company_id
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? '' : `WHERE company_id = ${parseInt(scope.company_id, 10)}`;
    const rows = db.prepare(`SELECT * FROM cinema_studios ${where} ORDER BY outlet, name`).all();
    res.json({ studios: rows.map(s => ({ ...s, capacity: (s.rows || 0) * (s.cols || 0) })) });
  });
  router.post('/studios', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'name wajib diisi' });
    // Multi-tenant: auto-tag company_id
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;
    const info = db.prepare(`INSERT INTO cinema_studios (name, studio_type, rows, cols, outlet, company_id) VALUES (?,?,?,?,?,?)`)
      .run(String(b.name).trim(), b.studio_type || 'Regular', Number(b.rows) || 8, Number(b.cols) || 12, b.outlet || '', companyId);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.delete('/studios/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_showtimes WHERE studio_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_studios WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.patch('/studios/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM cinema_studios WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'studio tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['name', 'studio_type', 'rows', 'cols', 'outlet', 'is_active']) {
      if (b[k] !== undefined) {
        fields.push(`${k} = ?`);
        args.push(k === 'rows' || k === 'cols' ? (Number(b[k]) || 0)
                : k === 'is_active' ? (b[k] ? 1 : 0)
                : b[k]);
      }
    }
    // seat_map — accept as object/array or JSON string, validate, persist as JSON text
    if (b.seat_map !== undefined) {
      let parsed = b.seat_map;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { return res.status(400).json({ error: 'seat_map JSON invalid' }); }
      }
      if (parsed === null || parsed === '') {
        fields.push('seat_map = ?'); args.push(null);
      } else if (Array.isArray(parsed)) {
        fields.push('seat_map = ?'); args.push(JSON.stringify(parsed));
      } else {
        return res.status(400).json({ error: 'seat_map harus array 2D atau null' });
      }
    }
    // seat_type_prices — { regular: 50000, premium: 75000, ... }
    if (b.seat_type_prices !== undefined) {
      let parsed = b.seat_type_prices;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch { return res.status(400).json({ error: 'seat_type_prices JSON invalid' }); }
      }
      if (parsed === null || parsed === '') {
        fields.push('seat_type_prices = ?'); args.push(null);
      } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Normalize values ke integer (anti-spoof)
        const clean = {};
        for (const [k, v] of Object.entries(parsed)) clean[k] = Math.max(0, parseInt(v, 10) || 0);
        fields.push('seat_type_prices = ?'); args.push(JSON.stringify(clean));
      } else {
        return res.status(400).json({ error: 'seat_type_prices harus object atau null' });
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_studios SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  // ── OUTLET PRICING ────────────────────────────────────────────────────
  // Default ticket pricing per outlet × studio_type. Used for auto-fill when
  // a showtime is created tanpa price. Tolerant lookup: missing row → fallback
  // 50k weekday / 65k weekend.
  const VALID_STUDIO_TYPES = ['Regular', 'Premium', 'IMAX', 'VIP', 'Couple'];
  function resolveOutletPrice(outlet, studioType, dateStr) {
    const out = { price: 50000, source: 'default', config: null };
    if (!outlet) return out;
    const cfg = db.prepare(`SELECT * FROM cinema_outlet_pricing WHERE outlet = ? AND studio_type = ?`)
      .get(outlet, studioType || 'Regular');
    // Determine weekend / holiday from date
    let isHoliday = false, isWeekend = false;
    if (dateStr) {
      try {
        const d = new Date(String(dateStr) + 'T00:00:00');
        const dow = d.getDay();          // 0=Sun, 6=Sat
        isWeekend = (dow === 0 || dow === 6);
      } catch {}
      try {
        const h = db.prepare(`SELECT 1 FROM cinema_holidays WHERE date = ? AND is_active = 1`).get(dateStr);
        if (h) isHoliday = true;
      } catch {}
    }
    if (cfg) {
      out.config = cfg;
      if (isHoliday) {
        if (cfg.holiday_price != null) { out.price = cfg.holiday_price; out.source = 'holiday'; return out; }
        // fallback to weekend price when holiday rate not set
        out.price = cfg.weekend_price; out.source = 'weekend'; return out;
      }
      if (isWeekend) { out.price = cfg.weekend_price; out.source = 'weekend'; return out; }
      out.price = cfg.weekday_price; out.source = 'weekday'; return out;
    }
    // No row → use defaults
    if (isWeekend || isHoliday) { out.price = 65000; out.source = 'weekend'; }
    else { out.price = 50000; out.source = 'weekday'; }
    return out;
  }

  router.get('/outlet-pricing', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_outlet_pricing ORDER BY outlet, studio_type`).all();
    const byOutlet = {};
    for (const r of rows) {
      if (!byOutlet[r.outlet]) byOutlet[r.outlet] = [];
      byOutlet[r.outlet].push(r);
    }
    res.json({ rows, by_outlet: byOutlet, studio_types: VALID_STUDIO_TYPES });
  });

  router.get('/outlet-pricing/lookup', (req, res) => {
    const outlet = String(req.query.outlet || '').trim();
    const studioType = String(req.query.studio_type || 'Regular').trim() || 'Regular';
    const date = String(req.query.date || '').trim();
    if (!outlet) return res.status(400).json({ ok: false, error: 'outlet wajib diisi' });
    const r = resolveOutletPrice(outlet, studioType, date);
    res.json({ ok: true, outlet, studio_type: studioType, date: date || null, price: r.price, source: r.source, config: r.config });
  });

  router.post('/outlet-pricing', (req, res) => {
    const b = req.body || {};
    const outlet = String(b.outlet || '').trim();
    const studioType = String(b.studio_type || 'Regular').trim() || 'Regular';
    if (!outlet) return res.status(400).json({ error: 'outlet wajib diisi' });
    if (!VALID_STUDIO_TYPES.includes(studioType)) {
      return res.status(400).json({ error: `studio_type harus salah satu dari: ${VALID_STUDIO_TYPES.join(', ')}` });
    }
    // Validate outlet exists in outlet_master (best-effort — tolerate missing table)
    try {
      const om = db.prepare(`SELECT code FROM outlet_master WHERE code = ?`).get(outlet);
      if (!om) {
        // Try matching by name as fallback (outlet field di studios sometimes pakai name)
        const om2 = db.prepare(`SELECT name FROM outlet_master WHERE name = ?`).get(outlet);
        if (!om2) return res.status(400).json({ error: `Outlet "${outlet}" tidak ditemukan di outlet_master` });
      }
    } catch {
      // outlet_master not available — skip validation
    }
    const wd = Number(b.weekday_price);
    const we = Number(b.weekend_price);
    const hp = b.holiday_price === '' || b.holiday_price == null ? null : Number(b.holiday_price);
    if (!(wd > 0) || !(we > 0)) return res.status(400).json({ error: 'weekday_price & weekend_price harus > 0' });
    try {
      const info = db.prepare(`INSERT INTO cinema_outlet_pricing
        (outlet, studio_type, weekday_price, weekend_price, holiday_price, notes)
        VALUES (?,?,?,?,?,?)`).run(outlet, studioType, wd, we, hp, b.notes || null);
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) {
        return res.status(409).json({ error: `Pricing untuk ${outlet} × ${studioType} sudah ada` });
      }
      res.status(500).json({ error: e.message || 'gagal menyimpan' });
    }
  });

  router.patch('/outlet-pricing/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM cinema_outlet_pricing WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'pricing tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    if (b.weekday_price !== undefined) { fields.push('weekday_price = ?'); args.push(Number(b.weekday_price) || 0); }
    if (b.weekend_price !== undefined) { fields.push('weekend_price = ?'); args.push(Number(b.weekend_price) || 0); }
    if (b.holiday_price !== undefined) { fields.push('holiday_price = ?'); args.push(b.holiday_price === '' || b.holiday_price == null ? null : Number(b.holiday_price)); }
    if (b.notes !== undefined) { fields.push('notes = ?'); args.push(b.notes || null); }
    if (b.studio_type !== undefined) {
      if (!VALID_STUDIO_TYPES.includes(b.studio_type)) {
        return res.status(400).json({ error: `studio_type harus salah satu dari: ${VALID_STUDIO_TYPES.join(', ')}` });
      }
      fields.push('studio_type = ?'); args.push(b.studio_type);
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    fields.push("updated_at = strftime('%s','now')");
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_outlet_pricing SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/outlet-pricing/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_outlet_pricing WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── SHOWTIMES ──
  router.get('/showtimes', (req, res) => {
    let sql = `SELECT s.*, f.title AS film_title, f.rating AS film_rating, f.duration_min, f.poster_url, f.genre, f.language, f.subtitle,
                      st.name AS studio_name, st.studio_type, st.outlet AS outlet, (st.rows * st.cols) AS capacity
               FROM cinema_showtimes s
               LEFT JOIN cinema_films f ON f.id = s.film_id
               LEFT JOIN cinema_studios st ON st.id = s.studio_id`;
    const p = [];
    const wh = [];
    if (req.query.date) { wh.push(`s.show_date = ?`); p.push(req.query.date); }
    if (req.query.outlet) { wh.push(`st.outlet = ?`); p.push(String(req.query.outlet).trim()); }
    // By default exclude archived; ?include_archived=1 to include them
    if (String(req.query.include_archived || '') !== '1') {
      wh.push(`COALESCE(s.is_archived, 0) = 0`);
    }
    // Multi-tenant: filter by company_id (kalau bukan super-admin)
    const scope = req.companyScope || { is_super_admin: true };
    if (!scope.is_super_admin) {
      wh.push(`s.company_id = ?`);
      p.push(scope.company_id);
    }
    if (wh.length) sql += ` WHERE ` + wh.join(' AND ');
    sql += ` ORDER BY s.show_date, s.start_time`;
    const rows = db.prepare(sql).all(...p).map(decorateShowtime);
    res.json({ showtimes: rows });
  });

  // POST /showtimes/archive-old?days=7 → mark showtime show_date <= N hari lalu as archived
  router.post('/showtimes/archive-old', (req, res) => {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || req.body?.days, 10) || 7));
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    const r = db.prepare(`
      UPDATE cinema_showtimes
      SET is_archived = 1, archived_at = ?
      WHERE COALESCE(is_archived, 0) = 0 AND show_date < ?
    `).run(nowSec, cutoffStr);
    res.json({ ok: true, archived: r.changes, cutoff_date: cutoffStr, days });
  });

  // POST /showtimes/:id/unarchive → restore individual
  router.post('/showtimes/:id/unarchive', (req, res) => {
    db.prepare(`UPDATE cinema_showtimes SET is_archived = 0, archived_at = NULL WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
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

  // ── CLOSING REPORT — Z-report end of day per outlet ──
  // GET /api/cinema/closing-report?date=YYYY-MM-DD&outlet=XXX
  // Aggregate semua aktivitas hari itu, print-friendly + email HQ
  router.get('/closing-report', (req, res) => {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const outletFilter = String(req.query.outlet || '').trim();
    const outletWhere = outletFilter ? `AND st.outlet = '${outletFilter.replace(/'/g, "''")}'` : '';

    // Date range — start dan end seconds dari date
    const startSec = Math.floor(new Date(date + 'T00:00:00').getTime() / 1000);
    const endSec = startSec + 86400;

    // 1. Revenue summary
    const summary = db.prepare(`
      SELECT
        COUNT(t.id) AS tickets_sold,
        COALESCE(SUM(t.price), 0) AS gross_revenue,
        COUNT(DISTINCT t.purchase_id) AS transactions,
        COUNT(CASE WHEN t.payment_status = 'refunded' THEN 1 END) AS refunded_tickets,
        COALESCE(SUM(CASE WHEN t.payment_status = 'refunded' THEN t.price ELSE 0 END), 0) AS refunded_amount
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at BETWEEN ? AND ? ${outletWhere}
    `).get(startSec, endSec);

    // 2. Per payment method
    const byMethod = db.prepare(`
      SELECT COALESCE(t.payment_method, 'unknown') AS method,
             COUNT(*) AS count, COALESCE(SUM(t.price), 0) AS amount
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.sold_at BETWEEN ? AND ? AND COALESCE(t.payment_status, '') != 'refunded' ${outletWhere}
      GROUP BY method ORDER BY amount DESC
    `).all(startSec, endSec);

    // 3. Per showtime/film occupancy
    const showtimes = db.prepare(`
      SELECT s.id, s.show_date, s.start_time, s.price,
             f.title AS film_title, st.name AS studio_name, st.outlet,
             (st.rows * st.cols) AS capacity,
             (SELECT COUNT(*) FROM cinema_tickets WHERE showtime_id = s.id AND COALESCE(payment_status,'') != 'refunded') AS sold,
             (SELECT COALESCE(SUM(price),0) FROM cinema_tickets WHERE showtime_id = s.id AND COALESCE(payment_status,'') != 'refunded') AS revenue
      FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE s.show_date = ? ${outletWhere}
      ORDER BY s.start_time
    `).all(date);

    // 4. F&B bundles
    const bundles = db.prepare(`
      SELECT pb.bundle_name, COUNT(*) AS sold, COALESCE(SUM(pb.qty * pb.price), 0) AS revenue
      FROM cinema_purchase_bundles pb
      WHERE pb.created_at BETWEEN ? AND ?
      GROUP BY pb.bundle_name ORDER BY revenue DESC
    `).all(startSec, endSec);
    const bundlesRevenue = bundles.reduce((s, b) => s + b.revenue, 0);

    // 5. Voucher used + issued
    let vouchersUsed = { count: 0, amount: 0 };
    let vouchersIssued = { count: 0, amount: 0 };
    try {
      const u = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(applied_amount),0) a FROM cinema_vouchers WHERE used_at BETWEEN ? AND ?`).get(startSec, endSec);
      vouchersUsed = { count: u.c || 0, amount: u.a || 0 };
      const i = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(value),0) a FROM cinema_vouchers WHERE created_at BETWEEN ? AND ?`).get(startSec, endSec);
      vouchersIssued = { count: i.c || 0, amount: i.a || 0 };
    } catch {}

    // 6. Promo redemptions
    let promosUsed = { count: 0, amount: 0 };
    try {
      const p = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(discount_amount),0) a FROM cinema_promo_redemptions WHERE applied_at BETWEEN ? AND ?`).get(startSec, endSec);
      promosUsed = { count: p.c || 0, amount: p.a || 0 };
    } catch {}

    // 7. Incidents hari itu
    let incidents = [];
    try {
      incidents = db.prepare(`
        SELECT * FROM cinema_incidents WHERE created_at BETWEEN ? AND ? ${outletFilter ? `AND outlet = '${outletFilter.replace(/'/g, "''")}'` : ''}
        ORDER BY created_at DESC
      `).all(startSec, endSec);
    } catch {}

    // 8. Cashier sessions (kalau ada)
    let cashiers = [];
    try {
      cashiers = db.prepare(`
        SELECT t.cashier_name AS name, COUNT(*) AS tickets, COALESCE(SUM(t.price), 0) AS revenue
        FROM cinema_tickets t
        LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
        LEFT JOIN cinema_studios st ON st.id = s.studio_id
        WHERE t.sold_at BETWEEN ? AND ? AND t.cashier_name IS NOT NULL ${outletWhere}
        GROUP BY t.cashier_name ORDER BY revenue DESC
      `).all(startSec, endSec);
    } catch {}

    const totalOccupied = showtimes.reduce((s, x) => s + (x.sold || 0), 0);
    const totalCapacity = showtimes.reduce((s, x) => s + (x.capacity || 0), 0);
    const avgOccupancy = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
    const netRevenue = (summary.gross_revenue || 0) - (summary.refunded_amount || 0) - (vouchersUsed.amount || 0) - (promosUsed.amount || 0);

    res.json({
      date, outlet: outletFilter || null,
      generated_at: Math.floor(Date.now() / 1000),
      summary: {
        ...summary,
        gross_revenue: summary.gross_revenue || 0,
        fb_revenue: bundlesRevenue,
        total_revenue: (summary.gross_revenue || 0) + bundlesRevenue,
        net_revenue: netRevenue + bundlesRevenue,
        avg_occupancy_pct: avgOccupancy,
        showtimes_count: showtimes.length,
      },
      payment_methods: byMethod,
      showtimes,
      bundles,
      vouchers: { used: vouchersUsed, issued: vouchersIssued },
      promos: promosUsed,
      incidents,
      cashiers,
    });
  });

  // ── CASHIER RATINGS — customer kasih rating kasir, jadi KPI ──
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cinema_cashier_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cashier_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      purchase_id TEXT,
      outlet TEXT,
      ticket_code TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cashier_ratings_name ON cinema_cashier_ratings(cashier_name)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cashier_ratings_created ON cinema_cashier_ratings(created_at)`);
  } catch {}

  // POST /cashier-rating — customer submit rating
  router.post('/cashier-rating', (req, res) => {
    const b = req.body || {};
    if (!b.cashier_name || !b.rating) return res.status(400).json({ error: 'cashier_name + rating wajib' });
    const rating = parseInt(b.rating, 10);
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating 1-5' });
    const info = db.prepare(`INSERT INTO cinema_cashier_ratings
      (cashier_name, rating, comment, purchase_id, outlet, ticket_code, customer_name, customer_phone)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(b.cashier_name, rating, b.comment || null, b.purchase_id || null,
           b.outlet || null, b.ticket_code || null, b.customer_name || null, b.customer_phone || null);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  // GET /cashier-rating/leaderboard?period=week — KPI ranking
  router.get('/cashier-rating/leaderboard', (req, res) => {
    const period = String(req.query.period || 'month');
    const sec = period === 'today' ? 86400 : period === 'week' ? 7*86400 : period === 'month' ? 30*86400 : 365*86400;
    const since = Math.floor(Date.now()/1000) - sec;
    const outletFilter = String(req.query.outlet || '').trim();
    const where = outletFilter ? `AND outlet = '${outletFilter.replace(/'/g, "''")}'` : '';
    const rows = db.prepare(`
      SELECT cashier_name,
             COUNT(*) AS total_ratings,
             ROUND(AVG(rating), 2) AS avg_rating,
             SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS five_star,
             SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS low_star
      FROM cinema_cashier_ratings
      WHERE created_at > ? ${where}
      GROUP BY cashier_name
      ORDER BY avg_rating DESC, total_ratings DESC
      LIMIT 50
    `).all(since);
    res.json({ period, since, leaderboard: rows });
  });

  // GET /cashier-rating?cashier=X — list ratings for single cashier
  router.get('/cashier-rating', (req, res) => {
    const cashier = String(req.query.cashier || '').trim();
    const sql = cashier
      ? `SELECT * FROM cinema_cashier_ratings WHERE cashier_name = ? ORDER BY created_at DESC LIMIT 100`
      : `SELECT * FROM cinema_cashier_ratings ORDER BY created_at DESC LIMIT 100`;
    const rows = cashier ? db.prepare(sql).all(cashier) : db.prepare(sql).all();
    res.json({ ratings: rows });
  });

  // ── VOUCHERS — refund as voucher (preserve revenue, customer come back) ──
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cinema_vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      value INTEGER NOT NULL,
      issued_to_phone TEXT,
      issued_to_email TEXT,
      issued_to_name TEXT,
      issued_by TEXT,
      issuer_type TEXT DEFAULT 'manual',
      reason TEXT,
      source_ticket_id INTEGER,
      source_showtime_id INTEGER,
      source_incident_id INTEGER,
      expires_at INTEGER,
      used_at INTEGER,
      used_purchase_id TEXT,
      applied_amount INTEGER,
      is_void INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vouchers_code ON cinema_vouchers(code)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vouchers_phone ON cinema_vouchers(issued_to_phone)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_vouchers_unused ON cinema_vouchers(used_at)`);
  } catch {}

  // GET /vouchers — list (admin)
  router.get('/vouchers', (req, res) => {
    const onlyOpen = String(req.query.open || '0') === '1';
    let sql = `SELECT * FROM cinema_vouchers WHERE 1=1`;
    if (onlyOpen) sql += ` AND used_at IS NULL AND is_void = 0 AND (expires_at IS NULL OR expires_at > strftime('%s','now'))`;
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    res.json({ vouchers: db.prepare(sql).all() });
  });

  // POST /vouchers — issue manual atau dari emergency close
  router.post('/vouchers', (req, res) => {
    const b = req.body || {};
    const value = parseInt(b.value, 10);
    if (!value || value <= 0) return res.status(400).json({ error: 'value (Rp) wajib > 0' });
    const code = b.code || ('VCH-' + require('crypto').randomBytes(4).toString('hex').toUpperCase());
    const expiresAt = b.expires_at ? parseInt(b.expires_at, 10) : Math.floor(Date.now()/1000) + 90*86400; // default 90 hari
    try {
      const info = db.prepare(`INSERT INTO cinema_vouchers
        (code, value, issued_to_phone, issued_to_email, issued_to_name, issued_by,
         issuer_type, reason, source_ticket_id, source_showtime_id, source_incident_id, expires_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code, value, b.issued_to_phone || null, b.issued_to_email || null, b.issued_to_name || null,
             b.issued_by || 'manager', b.issuer_type || 'manual', b.reason || null,
             b.source_ticket_id || null, b.source_showtime_id || null, b.source_incident_id || null,
             expiresAt);
      res.json({ ok: true, id: info.lastInsertRowid, code, value, expires_at: expiresAt });
    } catch (e) {
      if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Code sudah ada' });
      res.status(500).json({ error: e.message });
    }
  });

  // GET /vouchers/lookup/:code — validate kalau bisa dipakai (untuk POS Cinema Pay)
  router.get('/vouchers/lookup/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const v = db.prepare(`SELECT * FROM cinema_vouchers WHERE UPPER(code) = ?`).get(code);
    if (!v) return res.status(404).json({ ok: false, error: 'Voucher tidak ditemukan' });
    const now = Math.floor(Date.now() / 1000);
    if (v.is_void) return res.json({ ok: false, voucher: v, error: 'Voucher voided' });
    if (v.used_at) return res.json({ ok: false, voucher: v, error: 'Voucher sudah dipakai', used_at: v.used_at });
    if (v.expires_at && v.expires_at < now) return res.json({ ok: false, voucher: v, error: 'Voucher expired' });
    res.json({ ok: true, voucher: v, value: v.value });
  });

  // POST /vouchers/:code/redeem — saat customer pakai voucher di POS
  router.post('/vouchers/:code/redeem', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const v = db.prepare(`SELECT * FROM cinema_vouchers WHERE UPPER(code) = ?`).get(code);
    if (!v) return res.status(404).json({ error: 'Voucher tidak ditemukan' });
    const now = Math.floor(Date.now() / 1000);
    if (v.is_void || v.used_at || (v.expires_at && v.expires_at < now)) {
      return res.status(409).json({ error: 'Voucher tidak valid (used/voided/expired)' });
    }
    const amount = Math.min(v.value, parseInt(req.body?.amount, 10) || v.value);
    db.prepare(`UPDATE cinema_vouchers SET used_at = ?, used_purchase_id = ?, applied_amount = ? WHERE id = ?`)
      .run(now, req.body?.purchase_id || null, amount, v.id);
    res.json({ ok: true, applied: amount, voucher_id: v.id });
  });

  // POST /vouchers/:id/void — manager void
  router.post('/vouchers/:id/void', (req, res) => {
    db.prepare(`UPDATE cinema_vouchers SET is_void = 1 WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── INCIDENTS — incident log untuk operational alerts (HQ visibility) ──
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cinema_incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      outlet TEXT,
      showtime_id INTEGER,
      reason TEXT,
      reported_by TEXT,
      tickets_affected INTEGER DEFAULT 0,
      refunded_amount INTEGER DEFAULT 0,
      acknowledged_at INTEGER,
      acknowledged_by TEXT,
      resolved_at INTEGER,
      resolved_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_outlet ON cinema_incidents(outlet)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_unresolved ON cinema_incidents(resolved_at)`);
  } catch {}

  router.get('/incidents', (req, res) => {
    const onlyOpen = String(req.query.open || '0') === '1';
    const since = req.query.since ? parseInt(req.query.since, 10) : (Math.floor(Date.now()/1000) - 30 * 86400);
    let sql = `
      SELECT i.*, s.show_date, s.start_time, f.title AS film_title, st.name AS studio_name
      FROM cinema_incidents i
      LEFT JOIN cinema_showtimes s ON s.id = i.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE i.created_at > ?
    `;
    if (onlyOpen) sql += ` AND i.resolved_at IS NULL`;
    sql += ` ORDER BY i.created_at DESC LIMIT 100`;
    res.json({ incidents: db.prepare(sql).all(since) });
  });

  router.post('/incidents/:id/acknowledge', (req, res) => {
    const by = String(req.body?.by || 'manager');
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE cinema_incidents SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ?`).run(now, by, req.params.id);
    res.json({ ok: true });
  });

  router.post('/incidents/:id/resolve', (req, res) => {
    const by = String(req.body?.by || 'manager');
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE cinema_incidents SET resolved_at = ?, resolved_by = ? WHERE id = ?`).run(now, by, req.params.id);
    res.json({ ok: true });
  });

  // ── EMERGENCY CLOSE — listrik mati, gangguan teknis, force majeure ──
  // POST /showtimes/:id/emergency-close { reason, manager_name, refund_all=true, notify=true }
  // Atomic: close showtime + mark all tickets refunded + audit trail
  router.post('/showtimes/:id/emergency-close', (req, res) => {
    const b = req.body || {};
    const by = String(b.manager_name || 'manager');
    const reason = String(b.reason || 'Emergency closure (force majeure)').trim();
    const refundAll = b.refund_all !== false; // default true
    const issueVouchers = b.issue_vouchers === true; // opsi alternatif refund cash
    const s = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Showtime tidak ditemukan' });
    const now = Math.floor(Date.now() / 1000);

    // Pre-fetch affected tickets untuk audit
    const tickets = db.prepare(`
      SELECT t.id, t.seat, t.price, t.code, t.buyer, t.buyer_phone, t.buyer_email, t.purchase_id, t.payment_method, t.payment_ref
      FROM cinema_tickets t WHERE t.showtime_id = ?
    `).all(req.params.id);

    let refundedCount = 0;
    let refundedAmount = 0;
    let issuedVouchers = [];
    db.transaction(() => {
      // 1) Mark showtime closed
      db.prepare(`UPDATE cinema_showtimes
        SET manual_closed_at = ?, manual_closed_by = ?, manual_close_reason = ?, status = 'cancelled'
        WHERE id = ?`).run(now, by, `[EMERGENCY] ${reason}`, req.params.id);

      // 2) Auto-refund all tickets (kalau diminta)
      if (refundAll && tickets.length > 0) {
        // Pakai cinema_ticket_voids kalau ada (manager refund table)
        try {
          db.exec(`CREATE TABLE IF NOT EXISTS cinema_ticket_voids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            ticket_code TEXT,
            reason TEXT,
            voided_by TEXT,
            voided_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
            amount INTEGER,
            UNIQUE(ticket_id)
          )`);
          const insVoid = db.prepare(`INSERT OR IGNORE INTO cinema_ticket_voids
            (ticket_id, ticket_code, reason, voided_by, voided_at, amount)
            VALUES (?,?,?,?,?,?)`);
          for (const t of tickets) {
            const r = insVoid.run(t.id, t.code, `[EMERGENCY] ${reason}`, by, now, t.price || 0);
            if (r.changes > 0) { refundedCount++; refundedAmount += (t.price || 0); }
          }
          // Mark tickets sebagai voided
          db.prepare(`UPDATE cinema_tickets SET payment_status = 'refunded' WHERE showtime_id = ? AND COALESCE(payment_status, '') != 'refunded'`)
            .run(req.params.id);
        } catch (e) { /* table missing, skip */ }
      }

      // 3) Issue voucher per tiket kalau diminta (alternatif refund cash)
      if (issueVouchers && tickets.length > 0) {
        const crypto = require('crypto');
        const expiresAt = Math.floor(Date.now()/1000) + 90 * 86400; // 90 hari
        const insV = db.prepare(`INSERT INTO cinema_vouchers
          (code, value, issued_to_phone, issued_to_email, issued_to_name, issued_by,
           issuer_type, reason, source_ticket_id, source_showtime_id, expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        for (const t of tickets) {
          const code = 'VCH-' + crypto.randomBytes(4).toString('hex').toUpperCase();
          try {
            const info = insV.run(code, t.price || 0, t.buyer_phone || null, t.buyer_email || null, t.buyer || null,
                                  by, 'emergency_refund', `[EMERGENCY] ${reason}`,
                                  t.id, parseInt(req.params.id, 10), expiresAt);
            issuedVouchers.push({ id: info.lastInsertRowid, code, value: t.price || 0, ticket_seat: t.seat, ticket_code: t.code, phone: t.buyer_phone, email: t.buyer_email });
          } catch {}
        }
      }
    })();

    // 3) Buat incident record untuk HQ alert
    let incidentId = null;
    try {
      const studio = db.prepare(`SELECT outlet FROM cinema_studios WHERE id = ?`).get(s.studio_id);
      const info = db.prepare(`INSERT INTO cinema_incidents
        (type, severity, outlet, showtime_id, reason, reported_by, tickets_affected, refunded_amount)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run('emergency_close', tickets.length > 10 ? 'critical' : tickets.length > 0 ? 'high' : 'medium',
             studio?.outlet || null, parseInt(req.params.id, 10),
             reason, by, tickets.length, refundedAmount);
      incidentId = info.lastInsertRowid;
    } catch (e) { console.error('[cinema incident] err:', e.message); }

    // 4) Broadcast WS untuk refresh + ALERT push ke HQ dashboard
    try {
      if (typeof opts.broadcast === 'function') {
        opts.broadcast('cinema:emergency_close', {
          showtime_id: parseInt(req.params.id, 10),
          reason, by, refunded_count: refundedCount, refunded_amount: refundedAmount,
        });
        // HQ alert — owner dashboard akan tampil notification badge
        opts.broadcast('cinema:incident', {
          id: incidentId,
          type: 'emergency_close',
          severity: tickets.length > 10 ? 'critical' : 'high',
          outlet: (db.prepare(`SELECT outlet FROM cinema_studios WHERE id = ?`).get(s.studio_id) || {}).outlet,
          showtime_id: parseInt(req.params.id, 10),
          reason, reported_by: by,
          tickets_affected: tickets.length,
          refunded_amount: refundedAmount,
          ts: now,
        });
      }
    } catch {}

    res.json({
      ok: true,
      showtime_id: parseInt(req.params.id, 10),
      closed_at: now, closed_by: by, reason,
      tickets_affected: tickets.length,
      refunded_count: refundedCount,
      refunded_amount: refundedAmount,
      vouchers_issued: issuedVouchers,
      contacts: tickets.filter(t => t.buyer_phone || t.buyer_email).map(t => ({
        seat: t.seat, code: t.code, buyer: t.buyer, phone: t.buyer_phone, email: t.buyer_email,
      })),
    });
  });

  // ── RELOCATE STUDIO — AC mati, proyektor rusak, kerusakan studio mid-show ──
  // POST /showtimes/:id/relocate { new_studio_id, reason, manager_name }
  // Atomic: move showtime + all tickets ke studio baru. Cek capacity & conflict seat.
  router.post('/showtimes/:id/relocate', (req, res) => {
    const newStudioId = parseInt(req.body?.new_studio_id, 10);
    const reason = String(req.body?.reason || '').trim();
    const by = String(req.body?.manager_name || 'manager').trim();
    if (!newStudioId) return res.status(400).json({ error: 'new_studio_id wajib' });
    if (!reason) return res.status(400).json({ error: 'reason wajib (untuk audit log)' });

    const s = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(req.params.id);
    if (!s) return res.status(404).json({ error: 'Showtime tidak ditemukan' });
    if (s.studio_id === newStudioId) return res.status(400).json({ error: 'Sama dengan studio existing' });

    const newStudio = db.prepare(`SELECT * FROM cinema_studios WHERE id = ?`).get(newStudioId);
    if (!newStudio) return res.status(404).json({ error: 'Studio baru tidak ditemukan' });

    const tickets = db.prepare(`SELECT * FROM cinema_tickets WHERE showtime_id = ?`).all(req.params.id);
    const newCapacity = (newStudio.rows || 0) * (newStudio.cols || 0);
    if (tickets.length > newCapacity) {
      return res.status(409).json({ error: `Studio baru capacity ${newCapacity} < ${tickets.length} tiket. Pilih studio lebih besar atau partial refund dulu.` });
    }

    // Cek apakah ada showtime conflict di studio baru pada waktu yg sama
    const conflict = db.prepare(`
      SELECT id, start_time FROM cinema_showtimes
      WHERE studio_id = ? AND show_date = ? AND id != ?
        AND ABS((strftime('%s', show_date || ' ' || start_time) - strftime('%s', ? || ' ' || ?))) < 7200
    `).get(newStudioId, s.show_date, req.params.id, s.show_date, s.start_time);
    if (conflict) return res.status(409).json({ error: `Studio ${newStudio.name} ada jadwal lain ${conflict.start_time} (dalam 2 jam window)` });

    const now = Math.floor(Date.now() / 1000);
    const seatMappings = [];

    db.transaction(() => {
      // Audit log
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS cinema_relocations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          showtime_id INTEGER NOT NULL,
          from_studio_id INTEGER,
          to_studio_id INTEGER,
          tickets_count INTEGER,
          reason TEXT,
          relocated_by TEXT,
          relocated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )`);
        db.prepare(`INSERT INTO cinema_relocations
          (showtime_id, from_studio_id, to_studio_id, tickets_count, reason, relocated_by)
          VALUES (?,?,?,?,?,?)`)
          .run(req.params.id, s.studio_id, newStudioId, tickets.length, reason, by);
      } catch {}

      // Move showtime ke studio baru
      db.prepare(`UPDATE cinema_showtimes SET studio_id = ? WHERE id = ?`).run(newStudioId, req.params.id);

      // Note: tickets tetap valid dengan seat number existing, karena pindah studio.
      // Customer perlu di-notify untuk cek seat assignment baru kalau studio layout beda.
      // Untuk safety, kalau seat label customer (e.g. "A5") gak ada di studio baru (e.g. studio lebih kecil baris-nya),
      // staff akan handle manual swap saat customer datang.
    })();

    // Broadcast alert + incident
    try {
      let incidentId = null;
      try {
        const info = db.prepare(`INSERT INTO cinema_incidents
          (type, severity, outlet, showtime_id, reason, reported_by, tickets_affected)
          VALUES (?,?,?,?,?,?,?)`)
          .run('studio_relocate', 'high', newStudio.outlet || null, parseInt(req.params.id, 10),
               `Relocate dari studio ${s.studio_id} → ${newStudioId}: ${reason}`, by, tickets.length);
        incidentId = info.lastInsertRowid;
      } catch {}
      if (typeof opts.broadcast === 'function') {
        opts.broadcast('cinema:relocate', { showtime_id: parseInt(req.params.id, 10), from: s.studio_id, to: newStudioId, tickets: tickets.length });
        opts.broadcast('cinema:incident', { id: incidentId, type: 'studio_relocate', severity: 'high', outlet: newStudio.outlet, showtime_id: parseInt(req.params.id, 10), reason, reported_by: by, tickets_affected: tickets.length });
      }
    } catch {}

    res.json({
      ok: true,
      showtime_id: parseInt(req.params.id, 10),
      from_studio: { id: s.studio_id },
      to_studio: { id: newStudioId, name: newStudio.name, capacity: newCapacity },
      tickets_moved: tickets.length,
      reason, by,
      contacts: tickets.filter(t => t.buyer_phone || t.buyer_email).map(t => ({
        seat: t.seat, code: t.code, buyer: t.buyer, phone: t.buyer_phone, email: t.buyer_email,
      })),
    });
  });

  // GET /showtimes/:id/manifest — print-friendly ticket list (offline reference saat sistem down)
  router.get('/showtimes/:id/manifest', (req, res) => {
    const st = db.prepare(`
      SELECT s.*, f.title AS film_title, f.duration_min, f.rating,
             st.name AS studio_name, st.outlet, (st.rows * st.cols) AS capacity
      FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE s.id = ?
    `).get(req.params.id);
    if (!st) return res.status(404).json({ error: 'Showtime tidak ditemukan' });
    const tickets = db.prepare(`
      SELECT id, code, seat, price, buyer, buyer_phone, buyer_email, sold_at, payment_method, payment_status
      FROM cinema_tickets WHERE showtime_id = ?
      ORDER BY seat
    `).all(req.params.id);
    res.json({
      showtime: st,
      tickets,
      summary: {
        total_sold: tickets.length,
        total_revenue: tickets.reduce((s, t) => s + (t.price || 0), 0),
        with_contact: tickets.filter(t => t.buyer_phone || t.buyer_email).length,
        printed_at: Math.floor(Date.now() / 1000),
      },
    });
  });

  // POST /tickets/:id/swap-seat — relokasi kursi (conflict resolution, customer dispute)
  // Body: { new_seat, reason, manager_name }
  router.post('/tickets/:id/swap-seat', (req, res) => {
    const newSeat = String(req.body?.new_seat || '').trim().toUpperCase();
    const reason = String(req.body?.reason || '').trim();
    const by = String(req.body?.manager_name || 'manager').trim();
    if (!newSeat) return res.status(400).json({ error: 'new_seat wajib' });

    const t = db.prepare(`SELECT * FROM cinema_tickets WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tiket tidak ditemukan' });
    if (t.seat === newSeat) return res.status(400).json({ error: 'Sama dengan seat existing' });

    // Cek seat baru sudah dipakai?
    const conflict = db.prepare(`SELECT id, code, seat FROM cinema_tickets WHERE showtime_id = ? AND seat = ?`).get(t.showtime_id, newSeat);
    if (conflict) return res.status(409).json({ error: `Seat ${newSeat} sudah ada tiket lain (${conflict.code})`, conflict });

    const now = Math.floor(Date.now() / 1000);
    db.transaction(() => {
      // Audit log dulu
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS cinema_seat_swaps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER NOT NULL,
          ticket_code TEXT,
          from_seat TEXT,
          to_seat TEXT,
          reason TEXT,
          swapped_by TEXT,
          swapped_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )`);
        db.prepare(`INSERT INTO cinema_seat_swaps (ticket_id, ticket_code, from_seat, to_seat, reason, swapped_by, swapped_at)
          VALUES (?,?,?,?,?,?,?)`).run(t.id, t.code, t.seat, newSeat, reason, by, now);
      } catch {}
      // Apply swap
      db.prepare(`UPDATE cinema_tickets SET seat = ? WHERE id = ?`).run(newSeat, t.id);
    })();

    res.json({ ok: true, ticket_id: t.id, ticket_code: t.code, from_seat: t.seat, to_seat: newSeat, by, reason });
  });

  // GET /tickets/conflicts?showtime_id=X — list potential issues per showtime
  router.get('/tickets/conflicts', (req, res) => {
    const showtimeId = req.query.showtime_id ? parseInt(req.query.showtime_id, 10) : null;

    // 1) Multiple check-in attempts (same ticket scanned >1× saat valid)
    // Approximation: tickets dengan checked_in_at gak null + ada swap history
    // 2) Refunded tapi belum checked-in (refunded tickets list)
    // 3) Tickets without code (data integrity)

    const where = showtimeId ? `WHERE t.showtime_id = ${showtimeId}` : '';
    const refunded = db.prepare(`
      SELECT t.id, t.code, t.seat, t.payment_status, t.checked_in_at, s.show_date, s.start_time, f.title AS film_title
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      ${where ? where + ' AND' : 'WHERE'} t.payment_status = 'refunded'
      ORDER BY t.id DESC LIMIT 50
    `).all();

    let swaps = [];
    try {
      swaps = db.prepare(`
        SELECT sw.*, t.code AS current_code, s.show_date, s.start_time, f.title AS film_title
        FROM cinema_seat_swaps sw
        LEFT JOIN cinema_tickets t ON t.id = sw.ticket_id
        LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
        LEFT JOIN cinema_films f ON f.id = s.film_id
        ${where ? where.replace('t.showtime_id', 's.id') : ''}
        ORDER BY sw.swapped_at DESC LIMIT 50
      `).all();
    } catch {}

    let voids = [];
    try {
      voids = db.prepare(`
        SELECT v.*, t.seat, t.showtime_id, s.show_date, s.start_time, f.title AS film_title
        FROM cinema_ticket_voids v
        LEFT JOIN cinema_tickets t ON t.id = v.ticket_id
        LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
        LEFT JOIN cinema_films f ON f.id = s.film_id
        ${where ? where : ''}
        ORDER BY v.voided_at DESC LIMIT 50
      `).all();
    } catch {}

    res.json({ ok: true, refunded, swaps, voids });
  });

  // ── ESC/POS DIRECT PRINT — silent print ke thermal printer (Epson TM-T82, dll) ──
  // Bypass browser print dialog completely. Printer dengan LAN IP (Ethernet) atau USB-to-LAN.
  // Config printer URL via pos_config: CINEMA_PRINTER_URL:OUTLET = 'http://192.168.1.100:8008'
  // (Epson ePOS-Print URL atau Star MicroPOS API)
  router.post('/tickets/:id/print-thermal', async (req, res) => {
    const outlet = String(req.body?.outlet || req.query?.outlet || '').trim().toUpperCase();
    const printerUrlKey = outlet ? `CINEMA_PRINTER_URL:${outlet}` : 'CINEMA_PRINTER_URL_DEFAULT';
    let printerUrl = null;
    try {
      const row = db.prepare(`SELECT value FROM pos_config WHERE key = ?`).get(printerUrlKey);
      if (row?.value) printerUrl = JSON.parse(row.value);
    } catch {}
    if (!printerUrl) {
      // Fallback ke default
      try {
        const row = db.prepare(`SELECT value FROM pos_config WHERE key = 'CINEMA_PRINTER_URL_DEFAULT'`).get();
        if (row?.value) printerUrl = JSON.parse(row.value);
      } catch {}
    }
    if (!printerUrl) return res.status(503).json({ ok: false, error: `Printer URL belum di-set (pos_config ${printerUrlKey})` });

    // Load ticket info
    const t = db.prepare(`
      SELECT t.*, s.show_date, s.start_time, s.format,
             f.title AS film_title, st.name AS studio_name, st.outlet
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!t) return res.status(404).json({ ok: false, error: 'Tiket tidak ditemukan' });

    // Build ESC/POS commands — 80mm thermal Epson-compatible
    const ESC = '\x1B', GS = '\x1D', LF = '\x0A';
    const cmd = [];
    cmd.push(ESC + '@');                    // init
    cmd.push(ESC + 'a' + '\x01');           // center
    cmd.push(ESC + 'E' + '\x01');           // bold on
    cmd.push(GS + '!' + '\x11');            // 2× size
    cmd.push('🎬 CINEMA' + LF);
    cmd.push(GS + '!' + '\x00');            // normal size
    cmd.push(ESC + 'E' + '\x00');           // bold off
    cmd.push((t.outlet || '—') + LF + LF);
    cmd.push('================================' + LF);
    cmd.push(ESC + 'E' + '\x01');
    cmd.push((t.film_title || '—').slice(0, 32) + LF);
    cmd.push(ESC + 'E' + '\x00');
    cmd.push((t.studio_name || '—') + ' · ' + (t.format || '2D') + LF);
    cmd.push((t.show_date || '') + ' ' + (t.start_time || '') + LF);
    cmd.push('================================' + LF + LF);
    cmd.push(ESC + 'E' + '\x01');
    cmd.push(GS + '!' + '\x22');            // 3× size for seat
    cmd.push('KURSI: ' + t.seat + LF);
    cmd.push(GS + '!' + '\x00');
    cmd.push(ESC + 'E' + '\x00');
    cmd.push(LF + 'KODE: ' + t.code + LF + LF);
    // QR code (GS k command)
    const codeBuf = Buffer.from(t.code, 'utf8');
    cmd.push(GS + '(k' + String.fromCharCode(4, 0, 49, 65, 50, 0));      // model
    cmd.push(GS + '(k' + String.fromCharCode(3, 0, 49, 67, 6));           // size 6
    cmd.push(GS + '(k' + String.fromCharCode(3, 0, 49, 69, 48));          // error correction L
    cmd.push(GS + '(k' + String.fromCharCode((codeBuf.length + 3) & 0xff, ((codeBuf.length + 3) >> 8) & 0xff, 49, 80, 48));
    cmd.push(codeBuf.toString('binary'));
    cmd.push(GS + '(k' + String.fromCharCode(3, 0, 49, 81, 48));          // print
    cmd.push(LF + LF);
    cmd.push(ESC + 'a' + '\x00');           // left
    cmd.push('Scan QR di pintu studio' + LF);
    cmd.push('Datang 15 menit sebelum tayang' + LF + LF);
    cmd.push(GS + 'V' + '\x00');            // cut

    const raw = cmd.join('');

    // POST raw ESC/POS ke printer URL
    try {
      const r = await fetch(printerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: raw,
      });
      if (!r.ok) throw new Error(`Printer responded ${r.status}`);
      res.json({ ok: true, ticket_id: t.id, code: t.code, printer_url: printerUrl, bytes: raw.length });
    } catch (e) {
      console.error('[printer]', e.message);
      res.status(502).json({ ok: false, error: `Printer error: ${e.message}`, printer_url: printerUrl });
    }
  });

  // Direct LAN/TCP printer helper — connect ke port 9100 Epson TM-T82 / generic ESC/POS
  function tcpPrintDirect(host, port, bytes) {
    if (typeof opts.tcpPrint === 'function') return opts.tcpPrint(host, port, bytes);
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      const t = setTimeout(() => { client.destroy(); reject(new Error('Printer timeout')); }, 5000);
      client.connect(port, host, () => { client.write(Buffer.from(bytes)); clearTimeout(t); client.end(); resolve(true); });
      client.on('error', e => { clearTimeout(t); reject(e); });
    });
  }
  // Resolve printer endpoint per-outlet — pos_config keys:
  //   CINEMA_PRINTER_HOST:OUTLET (per-outlet) atau CINEMA_PRINTER_HOST_DEFAULT
  //   CINEMA_PRINTER_PORT (default 9100)
  // Fallback ke env: CINEMA_PRINTER_IP / CINEMA_PRINTER_PORT.
  function resolvePrinter(outlet) {
    const out = String(outlet || '').trim().toUpperCase();
    const readCfg = (key) => {
      try {
        const row = db.prepare(`SELECT value FROM pos_config WHERE key = ?`).get(key);
        if (row?.value) return JSON.parse(row.value);
      } catch {}
      return null;
    };
    let host = (out && readCfg(`CINEMA_PRINTER_HOST:${out}`)) || readCfg('CINEMA_PRINTER_HOST_DEFAULT') || process.env.CINEMA_PRINTER_IP || null;
    let port = (out && readCfg(`CINEMA_PRINTER_PORT:${out}`)) || readCfg('CINEMA_PRINTER_PORT_DEFAULT') || process.env.CINEMA_PRINTER_PORT || 9100;
    return host ? { host, port: parseInt(port, 10) || 9100 } : null;
  }

  // Auto-print bulk: cetak SEMUA tiket dari 1 purchase ke thermal printer (LAN/USB)
  // Dipanggil otomatis dari kiosk setelah pembayaran sukses — customer tidak perlu pencet apa-apa.
  // Body: { outlet? } (per-outlet printer routing)
  router.post('/purchases/:pid/print', async (req, res) => {
    const pid = String(req.params.pid || '').trim();
    if (!pid) return res.status(400).json({ ok: false, error: 'purchase_id wajib' });
    const outlet = String(req.body?.outlet || req.query?.outlet || '').trim().toUpperCase();
    const printer = resolvePrinter(outlet);
    // DEBUG MODE: kalau PRINTER_DEBUG=true di env, skip physical print + simulate.
    // Mirror behavior real (loop semua tiket, log per ticket) tanpa perlu hardware.
    const debugMode = String(process.env.PRINTER_DEBUG || '').toLowerCase() === 'true';
    if (!printer && !debugMode) {
      return res.status(503).json({
        ok: false,
        error: 'Printer belum di-set. Set pos_config CINEMA_PRINTER_HOST_DEFAULT atau env CINEMA_PRINTER_IP. Atau set PRINTER_DEBUG=true buat simulasi.',
      });
    }
    const tickets = db.prepare(`
      SELECT t.*, s.show_date, s.start_time, s.format,
             f.title AS film_title, f.rating, f.duration_min,
             st.name AS studio_name, st.studio_type, st.outlet
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.purchase_id = ?
      ORDER BY t.seat
    `).all(pid);
    if (!tickets.length) return res.status(404).json({ ok: false, error: 'Tiket purchase tidak ditemukan' });

    const results = [];
    for (const t of tickets) {
      try {
        const bytes = buildCinemaTicket({
          purchase_id: pid,
          film: { title: t.film_title, rating: t.rating, duration_min: t.duration_min },
          show: { show_date: t.show_date, start_time: t.start_time, studio_name: t.studio_name, studio_type: t.studio_type },
          ticket: { code: t.code, seat: t.seat, price: t.price },
          total: t.price,
        });
        if (printer) {
          await tcpPrintDirect(printer.host, printer.port, bytes);
        }
        if (debugMode) {
          console.log(`🖨️ [SIMULATED PRINT] ${pid} · seat ${t.seat} · ${t.code} · ${t.film_title} ${t.show_date} ${t.start_time} (${bytes.length} bytes)`);
        }
        results.push({ ticket_id: t.id, seat: t.seat, code: t.code, ok: true, simulated: !printer && debugMode });
      } catch (e) {
        console.error('[cinema-print]', t.id, e.message);
        results.push({ ticket_id: t.id, seat: t.seat, code: t.code, ok: false, error: e.message });
      }
    }
    const okCount = results.filter(r => r.ok).length;
    const simulated = results.every(r => r.simulated);
    res.json({
      ok: okCount > 0,
      printer: printer || { host: 'SIMULATED', port: 'debug' },
      simulated,
      printed: okCount,
      total: tickets.length,
      results,
    });
  });

  // GET /tickets/lookup/:code — public read-only ticket info (untuk digital ticket page)
  // Customer terima link /?ticket=CODE → page tampil QR + info
  router.get('/tickets/lookup/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'code wajib' });
    const t = db.prepare(`
      SELECT t.id, t.code, t.seat, t.price, t.checked_in_at, t.sold_at, t.payment_status,
             s.show_date, s.start_time, s.format,
             f.title AS film_title, f.duration_min, f.rating, f.poster_url,
             st.name AS studio_name, st.outlet
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.code = ?
    `).get(code);
    if (!t) return res.status(404).json({ ok: false, error: 'Tiket tidak ditemukan' });
    if (t.payment_status === 'refunded') {
      return res.json({ ok: false, refunded: true, ticket: t, message: 'Tiket sudah di-refund' });
    }
    res.json({ ok: true, ticket: t });
  });

  // POST /tickets/manual-checkin — offline mode: usher input ticket code manual
  router.post('/tickets/manual-checkin', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const by = String(req.body?.checked_by || 'usher').trim();
    if (!code) return res.status(400).json({ error: 'code wajib' });
    const t = db.prepare(`
      SELECT t.*, s.show_date, s.start_time, f.title AS film_title, st.name AS studio_name
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE t.code = ?
    `).get(code);
    if (!t) return res.status(404).json({ ok: false, error: 'Tiket tidak ditemukan' });
    if (t.checked_in_at) return res.status(409).json({ ok: false, error: 'Tiket sudah di-check-in', checked_in_at: t.checked_in_at });
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE cinema_tickets SET checked_in_at = ? WHERE id = ?`).run(now, t.id);
    res.json({ ok: true, ticket: { ...t, checked_in_at: now, checked_in_by: by } });
  });
  router.post('/showtimes', (req, res) => {
    const b = req.body || {};
    if (!b.film_id || !b.studio_id || !b.show_date || !b.start_time) {
      return res.status(400).json({ error: 'film_id, studio_id, show_date, start_time wajib diisi' });
    }
    // ── SCHEDULING: conflict detection ──
    // Reject kalau overlap dengan existing showtime di studio sama (cleaning gap 10 menit).
    // Window: [start - cleaning_gap, end + cleaning_gap]
    // Pakai film.duration_min + pre-show ads 15min sebagai total occupancy.
    const film = db.prepare(`SELECT duration_min FROM cinema_films WHERE id = ?`).get(Number(b.film_id));
    if (!film) return res.status(404).json({ error: 'Film tidak ditemukan' });
    const PRE_SHOW_MIN = 15, CLEANING_GAP_MIN = 10;
    const occupancy = (film.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;
    if (occupancy <= 0) return res.status(400).json({ error: 'film.duration_min tidak valid' });
    // Convert start_time HH:MM ke minutes-from-midnight
    const _toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const newStart = _toMin(b.start_time);
    const newEnd = newStart + occupancy;
    const conflicts = db.prepare(`
      SELECT s.id, s.start_time, f.title, f.duration_min
      FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE s.studio_id = ? AND s.show_date = ?
        AND COALESCE(s.is_archived, 0) = 0
        AND COALESCE(s.status, 'scheduled') = 'scheduled'
    `).all(Number(b.studio_id), String(b.show_date));
    const overlap = conflicts.find(c => {
      const cStart = _toMin(c.start_time);
      const cEnd = cStart + (c.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;
      // standard overlap test: starts before existing ends AND ends after existing starts
      return newStart < cEnd && newEnd > cStart;
    });
    if (overlap) {
      return res.status(409).json({
        error: `Bentrok dengan "${overlap.title}" jam ${overlap.start_time} (durasi ${overlap.duration_min}min + cleaning). Pilih waktu lain.`,
        conflict_with: { id: overlap.id, title: overlap.title, start_time: overlap.start_time },
      });
    }

    // Auto-fill price from cinema_outlet_pricing when not provided
    let price = Number(b.price) || 0;
    let priceSource = price > 0 ? 'manual' : null;
    if (!price || price <= 0) {
      try {
        const studio = db.prepare(`SELECT outlet, studio_type FROM cinema_studios WHERE id = ?`).get(Number(b.studio_id));
        if (studio && studio.outlet) {
          const r = resolveOutletPrice(studio.outlet, studio.studio_type || 'Regular', String(b.show_date));
          if (r && r.price > 0) { price = r.price; priceSource = r.source; }
        }
      } catch {}
      if (!price || price <= 0) { price = 50000; priceSource = priceSource || 'default'; }
    }
    // Multi-tenant: auto-tag company_id (scope.company_id atau default cinema=2)
    const _shtScope = req.companyScope || { is_super_admin: true };
    const _shtCompanyId = _shtScope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : _shtScope.company_id;
    const info = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price, format, company_id) VALUES (?,?,?,?,?,?,?)`)
      .run(Number(b.film_id), Number(b.studio_id), String(b.show_date), String(b.start_time), price, b.format || '2D', _shtCompanyId);
    res.json({
      ok: true, id: info.lastInsertRowid, price, price_source: priceSource,
      end_time: _minToHHMM(newEnd - CLEANING_GAP_MIN), // info: kapan studio bebas (sebelum cleaning)
      next_available: _minToHHMM(newEnd),              // info: jam earliest slot berikutnya
    });
  });

  // Helper: minutes → HH:MM (capped 23:59)
  function _minToHHMM(m) {
    const total = Math.min(Math.max(m, 0), 24 * 60 - 1);
    const h = Math.floor(total / 60), mm = total % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // ── SCHEDULER: auto-suggest available slots ──
  // GET /showtimes/available-slots?film_id=X&studio_id=Y&date=YYYY-MM-DD
  // Return: [{ start, end, available, blocked_by? }] dengan slot 30min dari 10:00-23:00
  router.get('/showtimes/available-slots', (req, res) => {
    const filmId = parseInt(req.query.film_id, 10);
    const studioId = parseInt(req.query.studio_id, 10);
    const date = String(req.query.date || '').trim();
    if (!filmId || !studioId || !date) {
      return res.status(400).json({ error: 'film_id, studio_id, date wajib' });
    }
    const film = db.prepare(`SELECT duration_min FROM cinema_films WHERE id = ?`).get(filmId);
    if (!film) return res.status(404).json({ error: 'Film tidak ditemukan' });
    const PRE_SHOW_MIN = 15, CLEANING_GAP_MIN = 10;
    const occupancy = (film.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;

    // Existing showtimes hari itu di studio tsb
    const existing = db.prepare(`
      SELECT s.id, s.start_time, f.title, f.duration_min
      FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE s.studio_id = ? AND s.show_date = ?
        AND COALESCE(s.is_archived, 0) = 0
        AND COALESCE(s.status, 'scheduled') = 'scheduled'
      ORDER BY s.start_time
    `).all(studioId, date);
    const _toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const occupied = existing.map(e => {
      const start = _toMin(e.start_time);
      return { id: e.id, start, end: start + (e.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN, title: e.title };
    });

    // Generate candidate slots 10:00-23:00 step 30min
    const slots = [];
    for (let m = 10 * 60; m + occupancy <= 24 * 60; m += 30) {
      const newEnd = m + occupancy;
      const conflict = occupied.find(o => m < o.end && newEnd > o.start);
      slots.push({
        start: _minToHHMM(m),
        end: _minToHHMM(newEnd - CLEANING_GAP_MIN), // visible end (film actually ends)
        available: !conflict,
        blocked_by: conflict ? conflict.title : null,
      });
    }
    res.json({
      film_id: filmId, studio_id: studioId, date,
      film_duration: film.duration_min, pre_show: PRE_SHOW_MIN, cleaning_gap: CLEANING_GAP_MIN,
      occupancy_min: occupancy, slots,
    });
  });
  // ── SHOWTIME TEMPLATES — recurring schedule (auto-generate harian/mingguan) ──
  router.get('/showtime-templates', (req, res) => {
    const rows = db.prepare(`
      SELECT t.*, f.title AS film_title, f.poster_url, st.name AS studio_name, st.outlet
      FROM cinema_showtime_templates t
      LEFT JOIN cinema_films f ON f.id = t.film_id
      LEFT JOIN cinema_studios st ON st.id = t.studio_id
      ORDER BY t.is_active DESC, t.name
    `).all();
    res.json({ templates: rows });
  });
  router.post('/showtime-templates', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.film_id || !b.studio_id || !b.days_of_week || !b.start_time) {
      return res.status(400).json({ error: 'name, film_id, studio_id, days_of_week, start_time wajib' });
    }
    // days_of_week: CSV '1,2,3,4,5' (Mon-Fri) atau array → normalize
    const days = Array.isArray(b.days_of_week) ? b.days_of_week : String(b.days_of_week).split(',');
    const dayCsv = days.map(d => parseInt(d, 10)).filter(d => d >= 0 && d <= 6).join(',');
    const info = db.prepare(`INSERT INTO cinema_showtime_templates
      (name, film_id, studio_id, days_of_week, start_time, format, price, active_from, active_until, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, parseInt(b.film_id, 10), parseInt(b.studio_id, 10),
           dayCsv, b.start_time, b.format || '2D',
           parseInt(b.price, 10) || 0,
           b.active_from || null, b.active_until || null,
           b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/showtime-templates/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'film_id', 'studio_id', 'start_time', 'format', 'price', 'active_from', 'active_until', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        args.push(k === 'is_active' ? (b[k] ? 1 : 0) : (k === 'film_id' || k === 'studio_id' || k === 'price') ? (parseInt(b[k], 10) || 0) : b[k]);
      }
    }
    if (b.days_of_week !== undefined) {
      const days = Array.isArray(b.days_of_week) ? b.days_of_week : String(b.days_of_week).split(',');
      fields.push('days_of_week = ?');
      args.push(days.map(d => parseInt(d, 10)).filter(d => d >= 0 && d <= 6).join(','));
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_showtime_templates SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/showtime-templates/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_showtime_templates WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // POST /showtime-templates/:id/generate?days=14 → bulk-create showtime untuk N hari ke depan
  // Idempotent: skip kalau showtime sudah ada di (date, studio_id, start_time)
  router.post('/showtime-templates/:id/generate', (req, res) => {
    const days = Math.min(60, Math.max(1, parseInt(req.query.days || req.body?.days, 10) || 14));
    const t = db.prepare(`SELECT * FROM cinema_showtime_templates WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'template tidak ditemukan' });
    if (!t.is_active) return res.status(400).json({ error: 'template tidak aktif' });

    const dowSet = new Set(String(t.days_of_week).split(',').map(d => parseInt(d, 10)));
    const created = [];
    const skipped = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Get studio info untuk resolve price per-date
    const studioInfo = db.prepare(`SELECT outlet, studio_type, company_id FROM cinema_studios WHERE id = ?`).get(t.studio_id);
    const studioOutlet = studioInfo?.outlet;
    const studioType = studioInfo?.studio_type || 'Regular';

    // Multi-tenant: derive company_id (dari studio, fallback ke scope, fallback cinema=2)
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = studioInfo?.company_id || (scope.is_super_admin ? 2 : scope.company_id);

    const ins = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price, format, company_id) VALUES (?,?,?,?,?,?,?)`);
    const exists = db.prepare(`SELECT id FROM cinema_showtimes WHERE studio_id = ? AND show_date = ? AND start_time = ?`);

    for (let i = 0; i < days; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const dow = d.getDay(); // 0=Sun, 6=Sat
      if (!dowSet.has(dow)) continue;
      const dateStr = d.toISOString().slice(0, 10);
      // Cek active range
      if (t.active_from && dateStr < t.active_from) continue;
      if (t.active_until && dateStr > t.active_until) continue;
      // Skip kalau sudah ada
      if (exists.get(t.studio_id, dateStr, t.start_time)) {
        skipped.push({ date: dateStr, reason: 'exists' });
        continue;
      }
      // Resolve price PER DATE — biar weekday/weekend/holiday rate beda per tanggal
      let price = t.price;
      let priceSource = price > 0 ? 'manual_template' : null;
      if (!price && studioOutlet) {
        try {
          const r = resolveOutletPrice(studioOutlet, studioType, dateStr);
          if (r?.price > 0) { price = r.price; priceSource = r.source; }
        } catch {}
      }
      if (!price) { price = 50000; priceSource = priceSource || 'default'; }
      const info = ins.run(t.film_id, t.studio_id, dateStr, t.start_time, price, t.format || '2D', companyId);
      created.push({ date: dateStr, id: info.lastInsertRowid, price, price_source: priceSource });
    }

    db.prepare(`UPDATE cinema_showtime_templates SET last_generated_at = ? WHERE id = ?`)
      .run(Math.floor(Date.now() / 1000), req.params.id);

    res.json({ ok: true, template_id: parseInt(req.params.id, 10), days_window: days, created: created.length, skipped: skipped.length, details: { created, skipped } });
  });

  // POST /showtime-templates/generate-all?days=14 → run untuk SEMUA aktif sekaligus
  router.post('/showtime-templates/generate-all', (req, res) => {
    const days = Math.min(60, Math.max(1, parseInt(req.query.days || req.body?.days, 10) || 14));
    const templates = db.prepare(`SELECT * FROM cinema_showtime_templates WHERE is_active = 1`).all();
    const results = [];
    const ins = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price, format, company_id) VALUES (?,?,?,?,?,?,?)`);
    const exists = db.prepare(`SELECT id FROM cinema_showtimes WHERE studio_id = ? AND show_date = ? AND start_time = ?`);
    const updLast = db.prepare(`UPDATE cinema_showtime_templates SET last_generated_at = ? WHERE id = ?`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const scope = req.companyScope || { is_super_admin: true };

    for (const t of templates) {
      const dowSet = new Set(String(t.days_of_week).split(',').map(d => parseInt(d, 10)));
      // Load studio info untuk per-date price resolution + company tag
      const studioInfo = db.prepare(`SELECT outlet, studio_type, company_id FROM cinema_studios WHERE id = ?`).get(t.studio_id);
      const studioOutlet = studioInfo?.outlet;
      const studioType = studioInfo?.studio_type || 'Regular';
      const companyId = studioInfo?.company_id || (scope.is_super_admin ? 2 : scope.company_id);

      let created = 0, skipped = 0, priceBreakdown = { weekday: 0, weekend: 0, holiday: 0, manual: 0, default: 0 };
      for (let i = 0; i < days; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        if (!dowSet.has(d.getDay())) continue;
        const dateStr = d.toISOString().slice(0, 10);
        if (t.active_from && dateStr < t.active_from) continue;
        if (t.active_until && dateStr > t.active_until) continue;
        if (exists.get(t.studio_id, dateStr, t.start_time)) { skipped++; continue; }

        // Per-date price resolution: weekday/weekend/holiday otomatis per tanggal
        let price = t.price;
        let priceSource = price > 0 ? 'manual' : null;
        if (!price && studioOutlet) {
          try {
            const r = resolveOutletPrice(studioOutlet, studioType, dateStr);
            if (r?.price > 0) { price = r.price; priceSource = r.source; }
          } catch {}
        }
        if (!price) { price = 50000; priceSource = 'default'; }
        priceBreakdown[priceSource] = (priceBreakdown[priceSource] || 0) + 1;

        ins.run(t.film_id, t.studio_id, dateStr, t.start_time, price, t.format || '2D', companyId);
        created++;
      }
      updLast.run(nowSec, t.id);
      results.push({ id: t.id, name: t.name, created, skipped, price_breakdown: priceBreakdown });
    }
    res.json({ ok: true, count: results.length, days_window: days, results });
  });

  // ── SUBSCRIPTION PASS (CULTPASS-style) ──
  // Monthly unlimited atau N-ticket bundle per period. Auto-deduct saat checkout.
  // Auto-renew via cron kalau plan.auto_renew=1.
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,         -- 'CULT_MONTHLY', 'CULT_5TIX', etc.
    name TEXT NOT NULL,
    description TEXT,
    plan_type TEXT CHECK (plan_type IN ('unlimited','n_ticket')) DEFAULT 'unlimited',
    duration_days INTEGER DEFAULT 30,  -- masa berlaku per periode
    ticket_quota INTEGER DEFAULT 0,    -- 0 = unlimited, atau N untuk bundle
    price INTEGER NOT NULL,
    studio_types_json TEXT,            -- JSON array ['Regular','Deluxe'] — yang bisa di-claim. null = semua
    blackout_days_json TEXT,           -- e.g. ['saturday','sunday'] — hari yg gak bisa pakai pass
    max_per_day INTEGER DEFAULT 1,     -- max tiket per hari
    image_url TEXT,
    auto_renew INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    company_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    plan_id INTEGER NOT NULL,
    plan_code TEXT,
    plan_snapshot_json TEXT,           -- snapshot config saat subscribe (anti-tamper)
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    tickets_remaining INTEGER DEFAULT 0,
    tickets_used INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','paused')),
    auto_renew INTEGER DEFAULT 0,
    last_used_at INTEGER,
    payment_ref TEXT,
    next_renew_at INTEGER,
    cancelled_at INTEGER,
    cancel_reason TEXT,
    company_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sub_phone ON cinema_subscriptions(customer_phone)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sub_status ON cinema_subscriptions(status)`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_subscription_uses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    showtime_id INTEGER,
    ticket_id INTEGER,
    used_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}

  // GET plans available
  router.get('/subscription-plans', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? `WHERE is_active = 1` : `WHERE is_active = 1 AND company_id = ${parseInt(scope.company_id, 10)}`;
    const rows = db.prepare(`SELECT * FROM cinema_subscription_plans ${where} ORDER BY price`).all().map(p => ({
      ...p,
      studio_types: p.studio_types_json ? (() => { try { return JSON.parse(p.studio_types_json); } catch { return null; } })() : null,
      blackout_days: p.blackout_days_json ? (() => { try { return JSON.parse(p.blackout_days_json); } catch { return []; } })() : [],
    }));
    res.json({ plans: rows });
  });

  // POST create plan (admin)
  router.post('/subscription-plans', (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.name || !b.price) return res.status(400).json({ error: 'code, name, price wajib' });
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;
    try {
      const info = db.prepare(`INSERT INTO cinema_subscription_plans
        (code, name, description, plan_type, duration_days, ticket_quota, price,
         studio_types_json, blackout_days_json, max_per_day, image_url, auto_renew, is_active, company_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(String(b.code).toUpperCase(), b.name, b.description || '',
             b.plan_type || 'unlimited', parseInt(b.duration_days, 10) || 30,
             parseInt(b.ticket_quota, 10) || 0, parseInt(b.price, 10),
             Array.isArray(b.studio_types) ? JSON.stringify(b.studio_types) : null,
             Array.isArray(b.blackout_days) ? JSON.stringify(b.blackout_days) : null,
             parseInt(b.max_per_day, 10) || 1, b.image_url || null,
             b.auto_renew ? 1 : 0, 1, companyId);
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'code already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // POST subscribe (customer beli pass)
  router.post('/subscriptions', (req, res) => {
    const b = req.body || {};
    const phone = String(b.customer_phone || '').replace(/[^0-9]/g, '');
    const planId = parseInt(b.plan_id, 10);
    if (!phone || !planId) return res.status(400).json({ error: 'customer_phone & plan_id wajib' });
    const plan = db.prepare(`SELECT * FROM cinema_subscription_plans WHERE id = ? AND is_active = 1`).get(planId);
    if (!plan) return res.status(404).json({ error: 'Plan tidak ditemukan' });

    // Cek subscription aktif sudah ada (no double-sub)
    const existing = db.prepare(`SELECT * FROM cinema_subscriptions WHERE customer_phone = ? AND status = 'active' AND expires_at > strftime('%s','now')`).get(phone);
    if (existing) return res.status(409).json({ error: `Sudah aktif subscription ${existing.plan_code} sampai ${new Date(existing.expires_at * 1000).toLocaleDateString('id-ID')}` });

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + plan.duration_days * 86400;
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;

    const info = db.prepare(`INSERT INTO cinema_subscriptions
      (customer_phone, customer_name, plan_id, plan_code, plan_snapshot_json,
       started_at, expires_at, tickets_remaining, tickets_used, status,
       auto_renew, payment_ref, next_renew_at, company_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(phone, b.customer_name || null, planId, plan.code, JSON.stringify(plan),
           now, expiresAt, plan.plan_type === 'n_ticket' ? plan.ticket_quota : 999999,
           0, 'active',
           b.auto_renew && plan.auto_renew ? 1 : 0, b.payment_ref || null,
           b.auto_renew && plan.auto_renew ? expiresAt : null, companyId);
    res.json({ ok: true, id: info.lastInsertRowid, expires_at: expiresAt, expires_date: new Date(expiresAt * 1000).toISOString().slice(0, 10) });
  });

  // GET active subscription by phone
  router.get('/subscriptions/:phone', (req, res) => {
    const phone = String(req.params.phone).replace(/[^0-9]/g, '');
    const sub = db.prepare(`SELECT s.*, p.name AS plan_name, p.plan_type, p.studio_types_json, p.blackout_days_json, p.max_per_day
      FROM cinema_subscriptions s LEFT JOIN cinema_subscription_plans p ON p.id = s.plan_id
      WHERE s.customer_phone = ? AND s.status = 'active' AND s.expires_at > strftime('%s','now')
      ORDER BY s.expires_at DESC LIMIT 1`).get(phone);
    if (!sub) return res.status(404).json({ error: 'Tidak ada subscription aktif' });
    const usedToday = db.prepare(`SELECT COUNT(*) c FROM cinema_subscription_uses
      WHERE subscription_id = ? AND date(used_at,'unixepoch','localtime') = date('now','localtime')`).get(sub.id).c;
    res.json({
      subscription: sub,
      tickets_used_today: usedToday,
      can_use_today: usedToday < (sub.max_per_day || 1),
      days_remaining: Math.ceil((sub.expires_at - Date.now() / 1000) / 86400),
    });
  });

  // POST use subscription (claim 1 tiket via pass)
  router.post('/subscriptions/:phone/use', (req, res) => {
    const phone = String(req.params.phone).replace(/[^0-9]/g, '');
    const b = req.body || {};
    const sub = db.prepare(`SELECT s.*, p.studio_types_json, p.blackout_days_json, p.max_per_day, p.plan_type
      FROM cinema_subscriptions s LEFT JOIN cinema_subscription_plans p ON p.id = s.plan_id
      WHERE s.customer_phone = ? AND s.status = 'active' AND s.expires_at > strftime('%s','now')
      LIMIT 1`).get(phone);
    if (!sub) return res.status(404).json({ error: 'Tidak ada subscription aktif' });
    if (sub.plan_type === 'n_ticket' && sub.tickets_remaining <= 0) {
      return res.status(400).json({ error: 'Tickets quota habis untuk plan ini' });
    }
    // Cek max per day
    const usedToday = db.prepare(`SELECT COUNT(*) c FROM cinema_subscription_uses
      WHERE subscription_id = ? AND date(used_at,'unixepoch','localtime') = date('now','localtime')`).get(sub.id).c;
    if (usedToday >= (sub.max_per_day || 1)) {
      return res.status(400).json({ error: `Max ${sub.max_per_day} tiket/hari sudah tercapai` });
    }
    // Cek blackout day
    const blackouts = sub.blackout_days_json ? (() => { try { return JSON.parse(sub.blackout_days_json); } catch { return []; } })() : [];
    if (blackouts.length > 0) {
      const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
      if (blackouts.includes(dow)) return res.status(400).json({ error: `Subscription tidak berlaku hari ${dow}` });
    }
    // Cek studio type (kalau showtime_id provided)
    if (b.showtime_id && sub.studio_types_json) {
      const allowedTypes = JSON.parse(sub.studio_types_json);
      const studio = db.prepare(`SELECT st.studio_type FROM cinema_showtimes s LEFT JOIN cinema_studios st ON st.id = s.studio_id WHERE s.id = ?`).get(parseInt(b.showtime_id, 10));
      if (studio && !allowedTypes.includes(studio.studio_type)) {
        return res.status(400).json({ error: `Subscription tidak berlaku untuk studio ${studio.studio_type}. Boleh: ${allowedTypes.join(', ')}` });
      }
    }

    // Use it
    db.prepare(`INSERT INTO cinema_subscription_uses (subscription_id, showtime_id, ticket_id) VALUES (?,?,?)`)
      .run(sub.id, b.showtime_id ? parseInt(b.showtime_id, 10) : null, b.ticket_id ? parseInt(b.ticket_id, 10) : null);
    if (sub.plan_type === 'n_ticket') {
      db.prepare(`UPDATE cinema_subscriptions SET tickets_remaining = tickets_remaining - 1, tickets_used = tickets_used + 1, last_used_at = strftime('%s','now') WHERE id = ?`).run(sub.id);
    } else {
      db.prepare(`UPDATE cinema_subscriptions SET tickets_used = tickets_used + 1, last_used_at = strftime('%s','now') WHERE id = ?`).run(sub.id);
    }
    res.json({ ok: true, subscription_id: sub.id, ticket_used_count: sub.tickets_used + 1 });
  });

  // POST cancel subscription
  router.post('/subscriptions/:id/cancel', (req, res) => {
    const b = req.body || {};
    db.prepare(`UPDATE cinema_subscriptions SET status='cancelled', cancelled_at=strftime('%s','now'), cancel_reason=?, auto_renew=0 WHERE id = ?`)
      .run(b.reason || '', parseInt(req.params.id, 10));
    res.json({ ok: true });
  });

  // GET list all subscriptions (admin)
  router.get('/subscriptions', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? '' : `WHERE company_id = ${parseInt(scope.company_id, 10)}`;
    const rows = db.prepare(`SELECT s.*, p.name AS plan_name FROM cinema_subscriptions s
      LEFT JOIN cinema_subscription_plans p ON p.id = s.plan_id ${where}
      ORDER BY s.created_at DESC LIMIT 200`).all();
    res.json({ subscriptions: rows, count: rows.length });
  });

  // ── BIRTHDAY PARTY PACKAGE ──
  // Package bundle (studio + F&B + decoration + photographer) untuk private event birthday/anniversary.
  // Conflict-check via existing cinema_studio_bookings.
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_party_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    studio_type TEXT,        -- which studio type required (Regular/Deluxe/Premiere)
    min_pax INTEGER DEFAULT 10,
    max_pax INTEGER DEFAULT 50,
    duration_hours INTEGER DEFAULT 3,
    base_price INTEGER NOT NULL,
    includes_fnb INTEGER DEFAULT 1,
    fnb_bundle_per_pax INTEGER DEFAULT 0,  -- harga per orang untuk F&B
    includes_decoration INTEGER DEFAULT 1,
    includes_host INTEGER DEFAULT 0,
    includes_photographer INTEGER DEFAULT 0,
    inclusions_json TEXT,    -- JSON array of inclusion items
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    company_id INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_party_company ON cinema_party_packages(company_id)`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_party_bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL,
    studio_id INTEGER NOT NULL,
    booking_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    customer_email TEXT,
    pax INTEGER NOT NULL,
    occasion TEXT,           -- 'birthday' | 'anniversary' | 'corporate' | 'school' | 'other'
    decoration_theme TEXT,   -- 'frozen' | 'spiderman' | 'unicorn' | 'custom'
    custom_requests TEXT,
    total_price INTEGER NOT NULL,
    deposit_paid INTEGER DEFAULT 0,
    full_paid INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
    company_id INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_party_booking_date ON cinema_party_bookings(booking_date, studio_id)`); } catch {}

  // GET available packages
  router.get('/party-packages', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? `WHERE is_active = 1` : `WHERE is_active = 1 AND company_id = ${parseInt(scope.company_id, 10)}`;
    const rows = db.prepare(`SELECT * FROM cinema_party_packages ${where} ORDER BY base_price`).all().map(p => ({
      ...p,
      inclusions: p.inclusions_json ? (() => { try { return JSON.parse(p.inclusions_json); } catch { return []; } })() : [],
    }));
    res.json({ packages: rows });
  });

  // POST create package (admin)
  router.post('/party-packages', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.base_price) return res.status(400).json({ error: 'name & base_price wajib' });
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;
    const info = db.prepare(`INSERT INTO cinema_party_packages
      (name, description, studio_type, min_pax, max_pax, duration_hours, base_price,
       includes_fnb, fnb_bundle_per_pax, includes_decoration, includes_host, includes_photographer,
       inclusions_json, image_url, is_active, company_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.description || '', b.studio_type || 'Deluxe',
           parseInt(b.min_pax, 10) || 10, parseInt(b.max_pax, 10) || 50,
           parseInt(b.duration_hours, 10) || 3, parseInt(b.base_price, 10),
           b.includes_fnb === false ? 0 : 1, parseInt(b.fnb_bundle_per_pax, 10) || 0,
           b.includes_decoration === false ? 0 : 1, b.includes_host ? 1 : 0, b.includes_photographer ? 1 : 0,
           Array.isArray(b.inclusions) ? JSON.stringify(b.inclusions) : null,
           b.image_url || null, 1, companyId);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  // POST book package
  router.post('/party-bookings', (req, res) => {
    const b = req.body || {};
    if (!b.package_id || !b.studio_id || !b.booking_date || !b.start_time || !b.pax || !b.customer_name) {
      return res.status(400).json({ error: 'package_id, studio_id, booking_date, start_time, pax, customer_name wajib' });
    }
    const pkg = db.prepare(`SELECT * FROM cinema_party_packages WHERE id = ? AND is_active = 1`).get(parseInt(b.package_id, 10));
    if (!pkg) return res.status(404).json({ error: 'Package tidak ditemukan' });
    const pax = parseInt(b.pax, 10);
    if (pax < pkg.min_pax || pax > pkg.max_pax) {
      return res.status(400).json({ error: `Pax harus antara ${pkg.min_pax}-${pkg.max_pax}` });
    }
    // Calculate end_time
    const _toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
    const _minToHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const startMin = _toMin(b.start_time);
    const endMin = startMin + pkg.duration_hours * 60;
    const endTime = _minToHHMM(endMin);

    // Conflict check: studio busy oleh showtime atau party booking lain?
    const showConflict = db.prepare(`
      SELECT id, start_time, f.duration_min FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE s.studio_id = ? AND s.show_date = ? AND COALESCE(s.is_archived,0)=0
    `).all(parseInt(b.studio_id, 10), b.booking_date);
    const overlap = showConflict.find(sh => {
      const sStart = _toMin(sh.start_time);
      const sEnd = sStart + (sh.duration_min || 0) + 25; // pre + clean
      return startMin < sEnd && endMin > sStart;
    });
    if (overlap) {
      return res.status(409).json({ error: `Studio bentrok dengan showtime jam ${overlap.start_time}` });
    }
    const partyConflict = db.prepare(`SELECT id, start_time, end_time, customer_name FROM cinema_party_bookings
      WHERE studio_id = ? AND booking_date = ? AND status != 'cancelled'`).all(parseInt(b.studio_id, 10), b.booking_date);
    const partyOverlap = partyConflict.find(pb => {
      const pbStart = _toMin(pb.start_time);
      const pbEnd = _toMin(pb.end_time);
      return startMin < pbEnd && endMin > pbStart;
    });
    if (partyOverlap) {
      return res.status(409).json({ error: `Studio sudah di-book untuk ${partyOverlap.customer_name} jam ${partyOverlap.start_time}-${partyOverlap.end_time}` });
    }

    // Calculate total price
    const fnbCost = pkg.includes_fnb && pkg.fnb_bundle_per_pax ? pkg.fnb_bundle_per_pax * pax : 0;
    const totalPrice = pkg.base_price + fnbCost;

    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;

    const info = db.prepare(`INSERT INTO cinema_party_bookings
      (package_id, studio_id, booking_date, start_time, end_time, customer_name, customer_phone, customer_email,
       pax, occasion, decoration_theme, custom_requests, total_price, deposit_paid, company_id, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(parseInt(b.package_id, 10), parseInt(b.studio_id, 10), b.booking_date,
           b.start_time, endTime, b.customer_name, b.customer_phone || null, b.customer_email || null,
           pax, b.occasion || 'birthday', b.decoration_theme || null, b.custom_requests || null,
           totalPrice, parseInt(b.deposit_paid, 10) || 0, companyId, b.created_by || 'admin');
    res.json({ ok: true, id: info.lastInsertRowid, total_price: totalPrice, end_time: endTime });
  });

  // GET party bookings list
  router.get('/party-bookings', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const where = scope.is_super_admin ? '' : `WHERE pb.company_id = ${parseInt(scope.company_id, 10)}`;
    const rows = db.prepare(`
      SELECT pb.*, pp.name AS package_name, st.name AS studio_name, st.outlet
      FROM cinema_party_bookings pb
      LEFT JOIN cinema_party_packages pp ON pp.id = pb.package_id
      LEFT JOIN cinema_studios st ON st.id = pb.studio_id
      ${where}
      ORDER BY pb.booking_date DESC, pb.start_time DESC
      LIMIT 100
    `).all();
    res.json({ bookings: rows });
  });

  // ── CINEMA LOYALTY / MEMBERSHIP ──
  // Tier auto-assign by lifetime spend (Bronze<2jt, Silver 2-10jt, Gold 10-50jt, Platinum 50jt+).
  // 1 point per Rp 1000 spent · point redeemable di future tickets (1pt = Rp 100 discount).
  // Birthday bonus: 1x free regular ticket per tahun (configurable).
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_loyalty (
    customer_phone TEXT PRIMARY KEY,
    customer_name TEXT,
    customer_email TEXT,
    birthday TEXT,
    lifetime_spend INTEGER DEFAULT 0,
    points_balance INTEGER DEFAULT 0,
    total_tickets INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'bronze',
    last_visit_at INTEGER,
    joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    birthday_used_year INTEGER,
    company_id INTEGER
  )`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_loyalty_tier ON cinema_loyalty(tier)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_loyalty_company ON cinema_loyalty(company_id)`); } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS cinema_loyalty_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    type TEXT CHECK (type IN ('earn','redeem','birthday_bonus','expire','adjustment')),
    amount INTEGER NOT NULL,
    balance_after INTEGER,
    ref_purchase_id TEXT,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`); } catch {}

  const TIER_THRESHOLDS = [
    { tier: 'platinum', min: 50000000, label: '👑 Platinum', point_multiplier: 2.0 },
    { tier: 'gold',     min: 10000000, label: '🥇 Gold',     point_multiplier: 1.5 },
    { tier: 'silver',   min:  2000000, label: '🥈 Silver',   point_multiplier: 1.2 },
    { tier: 'bronze',   min:        0, label: '🥉 Bronze',   point_multiplier: 1.0 },
  ];
  function computeTier(lifetimeSpend) {
    for (const t of TIER_THRESHOLDS) if (lifetimeSpend >= t.min) return t;
    return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
  }

  // GET member profile by phone
  router.get('/loyalty/:phone', (req, res) => {
    const phone = String(req.params.phone).replace(/[^0-9]/g, '');
    const m = db.prepare(`SELECT * FROM cinema_loyalty WHERE customer_phone = ?`).get(phone);
    if (!m) return res.status(404).json({ error: 'Member tidak ditemukan' });
    const tierInfo = computeTier(m.lifetime_spend);
    const recent = db.prepare(`SELECT * FROM cinema_loyalty_transactions WHERE customer_phone = ? ORDER BY id DESC LIMIT 10`).all(phone);
    res.json({ member: m, tier_info: tierInfo, recent_transactions: recent });
  });

  // POST register/upsert member
  router.post('/loyalty', (req, res) => {
    const b = req.body || {};
    const phone = String(b.customer_phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'customer_phone wajib' });
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;
    const existing = db.prepare(`SELECT * FROM cinema_loyalty WHERE customer_phone = ?`).get(phone);
    if (existing) {
      // Update profile (name, email, birthday)
      db.prepare(`UPDATE cinema_loyalty SET customer_name = COALESCE(?, customer_name), customer_email = COALESCE(?, customer_email), birthday = COALESCE(?, birthday) WHERE customer_phone = ?`)
        .run(b.customer_name || null, b.customer_email || null, b.birthday || null, phone);
      return res.json({ ok: true, action: 'updated', member: db.prepare(`SELECT * FROM cinema_loyalty WHERE customer_phone = ?`).get(phone) });
    }
    db.prepare(`INSERT INTO cinema_loyalty (customer_phone, customer_name, customer_email, birthday, company_id) VALUES (?,?,?,?,?)`)
      .run(phone, b.customer_name || null, b.customer_email || null, b.birthday || null, companyId);
    res.json({ ok: true, action: 'registered', tier: 'bronze' });
  });

  // POST earn points (saat purchase tiket)
  router.post('/loyalty/earn', (req, res) => {
    const b = req.body || {};
    const phone = String(b.customer_phone || '').replace(/[^0-9]/g, '');
    const amount = parseInt(b.amount, 10) || 0; // amount spent
    if (!phone || amount <= 0) return res.status(400).json({ error: 'customer_phone + amount wajib' });
    const m = db.prepare(`SELECT * FROM cinema_loyalty WHERE customer_phone = ?`).get(phone);
    if (!m) return res.status(404).json({ error: 'Member belum register' });
    const tierNow = computeTier(m.lifetime_spend);
    const pointsEarned = Math.floor(amount / 1000 * tierNow.point_multiplier); // 1pt per Rp 1k * multiplier
    const newLifetime = m.lifetime_spend + amount;
    const newBalance = m.points_balance + pointsEarned;
    const newTier = computeTier(newLifetime);
    db.prepare(`UPDATE cinema_loyalty SET lifetime_spend = ?, points_balance = ?, total_tickets = total_tickets + 1, tier = ?, last_visit_at = strftime('%s','now') WHERE customer_phone = ?`)
      .run(newLifetime, newBalance, newTier.tier, phone);
    db.prepare(`INSERT INTO cinema_loyalty_transactions (customer_phone, type, amount, balance_after, ref_purchase_id, description) VALUES (?,?,?,?,?,?)`)
      .run(phone, 'earn', pointsEarned, newBalance, b.ref_purchase_id || null, `Earn dari purchase Rp ${amount.toLocaleString('id-ID')} (×${tierNow.point_multiplier})`);
    const tierUp = newTier.tier !== m.tier;
    res.json({ ok: true, points_earned: pointsEarned, new_balance: newBalance, new_tier: newTier.tier, tier_up: tierUp, tier_label: newTier.label });
  });

  // POST redeem points (untuk diskon ticket)
  router.post('/loyalty/redeem', (req, res) => {
    const b = req.body || {};
    const phone = String(b.customer_phone || '').replace(/[^0-9]/g, '');
    const pointsToRedeem = parseInt(b.points, 10) || 0;
    if (!phone || pointsToRedeem <= 0) return res.status(400).json({ error: 'customer_phone + points wajib' });
    const m = db.prepare(`SELECT * FROM cinema_loyalty WHERE customer_phone = ?`).get(phone);
    if (!m) return res.status(404).json({ error: 'Member tidak ditemukan' });
    if (m.points_balance < pointsToRedeem) return res.status(400).json({ error: `Saldo poin tidak cukup (tersedia ${m.points_balance})` });
    const discountRupiah = pointsToRedeem * 100; // 1pt = Rp 100
    const newBalance = m.points_balance - pointsToRedeem;
    db.prepare(`UPDATE cinema_loyalty SET points_balance = ? WHERE customer_phone = ?`).run(newBalance, phone);
    db.prepare(`INSERT INTO cinema_loyalty_transactions (customer_phone, type, amount, balance_after, ref_purchase_id, description) VALUES (?,?,?,?,?,?)`)
      .run(phone, 'redeem', -pointsToRedeem, newBalance, b.ref_purchase_id || null, `Redeem ${pointsToRedeem}pt → Rp ${discountRupiah.toLocaleString('id-ID')} discount`);
    res.json({ ok: true, points_redeemed: pointsToRedeem, discount_rupiah: discountRupiah, new_balance: newBalance });
  });

  // POST claim birthday bonus (1x free ticket per tahun)
  router.post('/loyalty/birthday-claim', (req, res) => {
    const b = req.body || {};
    const phone = String(b.customer_phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'customer_phone wajib' });
    const m = db.prepare(`SELECT * FROM cinema_loyalty WHERE customer_phone = ?`).get(phone);
    if (!m) return res.status(404).json({ error: 'Member tidak ditemukan' });
    if (!m.birthday) return res.status(400).json({ error: 'Birthday belum di-set' });
    const now = new Date();
    const currentYear = now.getFullYear();
    if (m.birthday_used_year === currentYear) return res.status(400).json({ error: `Birthday bonus sudah diklaim tahun ${currentYear}` });
    // Cek apakah tanggal hari ini ±7 hari dari birthday (window grace)
    const bday = m.birthday; // format YYYY-MM-DD
    const thisYearBday = new Date(`${currentYear}-${bday.slice(5)}`);
    const diff = Math.abs((now.getTime() - thisYearBday.getTime()) / (86400000));
    if (diff > 7) return res.status(400).json({ error: 'Birthday claim hanya tersedia ±7 hari dari tanggal lahir' });
    // Grant 1 free ticket (issue voucher code via points: 50000pt special bonus)
    const FREE_TICKET_POINTS = 500; // setara Rp 50k discount
    db.prepare(`UPDATE cinema_loyalty SET points_balance = points_balance + ?, birthday_used_year = ? WHERE customer_phone = ?`)
      .run(FREE_TICKET_POINTS, currentYear, phone);
    db.prepare(`INSERT INTO cinema_loyalty_transactions (customer_phone, type, amount, balance_after, description) VALUES (?,?,?,?,?)`)
      .run(phone, 'birthday_bonus', FREE_TICKET_POINTS, m.points_balance + FREE_TICKET_POINTS, `🎂 Birthday bonus ${currentYear}`);
    res.json({ ok: true, points_granted: FREE_TICKET_POINTS, equivalent_rupiah: FREE_TICKET_POINTS * 100 });
  });

  // GET tier list
  router.get('/loyalty-tiers', (_, res) => res.json({ tiers: TIER_THRESHOLDS }));

  // ── STUDIO CLEANING SCHEDULE ──
  // Between-show cleaning log: staff scan QR studio post-show → log cleaning
  // dengan foto bukti. Auto-prompt: cek pending cleaning (showtime finished
  // tapi belum di-clean) per studio.
  router.get('/cleaning/pending', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const cWhere = scope.is_super_admin ? '' : `AND s.company_id = ${parseInt(scope.company_id, 10)}`;
    // Showtimes finished tapi belum ada cleaning log dalam 1 jam terakhir
    const rows = db.prepare(`
      SELECT s.id AS showtime_id, s.show_date, s.start_time,
             f.title AS film_title, f.duration_min,
             st.id AS studio_id, st.name AS studio_name, st.outlet,
             (SELECT MAX(cl.cleaned_at) FROM cinema_cleaning_logs cl WHERE cl.studio_id = st.id) AS last_cleaned_at
      FROM cinema_showtimes s
      LEFT JOIN cinema_films f ON f.id = s.film_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE s.show_date = date('now','localtime')
        AND COALESCE(s.is_archived, 0) = 0
        ${cWhere}
      ORDER BY s.start_time DESC
      LIMIT 50
    `).all();
    // Filter: showtime sudah finished + belum cleaned post-show
    const now = Math.floor(Date.now() / 1000);
    const _toEpoch = (date, time) => {
      try { return Math.floor(new Date(`${date}T${time}:00`).getTime() / 1000); } catch { return 0; }
    };
    const pending = rows.filter(r => {
      const startEp = _toEpoch(r.show_date, r.start_time);
      const endEp = startEp + (r.duration_min || 0) * 60 + 15 * 60; // include pre-show ads
      if (endEp >= now) return false; // belum selesai
      if (!r.last_cleaned_at) return true; // belum pernah dibersihkan
      return r.last_cleaned_at < endEp; // last clean sebelum showtime ini selesai
    }).map(r => ({
      ...r,
      finished_at: _toEpoch(r.show_date, r.start_time) + (r.duration_min || 0) * 60 + 15 * 60,
      minutes_overdue: Math.round((now - (_toEpoch(r.show_date, r.start_time) + (r.duration_min || 0) * 60 + 15 * 60)) / 60),
    }));
    res.json({ pending, count: pending.length });
  });

  // POST cleaning log
  // Body: { studio_id, cleaned_by, showtime_id?, notes?, before_photo?, after_photo? }
  router.post('/cleaning/log', (req, res) => {
    const b = req.body || {};
    if (!b.studio_id) return res.status(400).json({ error: 'studio_id wajib' });
    const info = db.prepare(`INSERT INTO cinema_cleaning_logs (studio_id, cleaned_by, notes, showtime_id) VALUES (?,?,?,?)`)
      .run(parseInt(b.studio_id, 10), b.cleaned_by || 'staff', b.notes || null, b.showtime_id ? parseInt(b.showtime_id, 10) : null);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  // GET cleaning history per studio
  router.get('/cleaning/history', (req, res) => {
    const studioId = parseInt(req.query.studio_id, 10);
    const sql = studioId
      ? `SELECT cl.*, st.name AS studio_name, st.outlet FROM cinema_cleaning_logs cl
         LEFT JOIN cinema_studios st ON st.id = cl.studio_id
         WHERE cl.studio_id = ? ORDER BY cl.cleaned_at DESC LIMIT 100`
      : `SELECT cl.*, st.name AS studio_name, st.outlet FROM cinema_cleaning_logs cl
         LEFT JOIN cinema_studios st ON st.id = cl.studio_id
         ORDER BY cl.cleaned_at DESC LIMIT 100`;
    const rows = studioId ? db.prepare(sql).all(studioId) : db.prepare(sql).all();
    res.json({ logs: rows });
  });

  // ── PAJAK HIBURAN / TAX REPORT ──
  // Cinema Indonesia kena 2 pajak: PPN 11% (federal, inclusive di harga tiket) +
  // Pajak Hiburan/Tontonan 10-15% per Perda Pemda (varies per kabupaten/kota).
  // Endpoint generate report agregat per period × outlet untuk submit ke Pemda.
  // Pakai pos_config PAJAK_HIBURAN_PCT:<OUTLET> atau PAJAK_HIBURAN_PCT_DEFAULT
  router.get('/tax-report', (req, res) => {
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const outletFilter = String(req.query.outlet || '').trim();
    if (!from || !to) return res.status(400).json({ error: 'from & to (YYYY-MM-DD) wajib' });
    const scope = req.companyScope || { is_super_admin: true };
    const cWhere = scope.is_super_admin ? '' : `AND t.company_id = ${parseInt(scope.company_id, 10)}`;

    // Default rates
    const PPN_PCT = 11;
    const _getTaxRate = (outlet) => {
      try {
        const r = db.prepare(`SELECT value FROM pos_config WHERE key = ?`).get(`PAJAK_HIBURAN_PCT:${outlet}`);
        if (r?.value) return JSON.parse(r.value);
      } catch {}
      try {
        const r = db.prepare(`SELECT value FROM pos_config WHERE key = 'PAJAK_HIBURAN_PCT_DEFAULT'`).get();
        if (r?.value) return JSON.parse(r.value);
      } catch {}
      return 10; // Default 10% (banyak kota pakai ini)
    };

    // Per outlet aggregation
    const outletWhere = outletFilter ? `AND st.outlet = '${outletFilter.replace(/'/g, "''")}'` : '';
    const rows = db.prepare(`
      SELECT
        st.outlet AS outlet,
        COUNT(t.id) AS tickets,
        COALESCE(SUM(t.price), 0) AS gross_revenue
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      WHERE date(t.sold_at,'unixepoch','localtime') BETWEEN ? AND ?
        AND (t.payment_status IS NULL OR t.payment_status IN ('paid','settled','success'))
        ${outletWhere} ${cWhere}
      GROUP BY st.outlet
      ORDER BY st.outlet
    `).all(from, to);

    const breakdown = rows.map(r => {
      const gross = r.gross_revenue;
      // PPN 11% inclusive — extract dari gross: ppn = gross * 11/111
      const ppn = Math.round(gross * PPN_PCT / (100 + PPN_PCT));
      const grossExPPN = gross - ppn;
      // Pajak Hiburan: pakai DPP (Dasar Pengenaan Pajak) = gross ex-PPN, dikali % daerah
      const pajakHiburanPct = _getTaxRate(r.outlet);
      const pajakHiburan = Math.round(grossExPPN * pajakHiburanPct / 100);
      const netToOperator = grossExPPN - pajakHiburan;
      return {
        outlet: r.outlet, tickets: r.tickets,
        gross_revenue: gross,
        ppn_pct: PPN_PCT, ppn_amount: ppn,
        gross_ex_ppn: grossExPPN,
        pajak_hiburan_pct: pajakHiburanPct,
        pajak_hiburan_amount: pajakHiburan,
        net_to_operator: netToOperator,
      };
    });

    // Total summary
    const totals = breakdown.reduce((acc, r) => {
      acc.tickets += r.tickets;
      acc.gross_revenue += r.gross_revenue;
      acc.ppn_amount += r.ppn_amount;
      acc.gross_ex_ppn += r.gross_ex_ppn;
      acc.pajak_hiburan_amount += r.pajak_hiburan_amount;
      acc.net_to_operator += r.net_to_operator;
      return acc;
    }, { tickets: 0, gross_revenue: 0, ppn_amount: 0, gross_ex_ppn: 0, pajak_hiburan_amount: 0, net_to_operator: 0 });

    res.json({
      ok: true, period: { from, to },
      breakdown, totals,
      note: 'PPN 11% inclusive · Pajak Hiburan/Tontonan per Perda Pemda (configurable via pos_config PAJAK_HIBURAN_PCT:<OUTLET>)',
    });
  });

  // Preview pricing untuk bulk push — simulate tanpa INSERT
  // POST /showtimes/bulk-preview { film_id, outlets[], show_date, start_time, studio_type? }
  // Return: per-outlet { outlet, studio, price, source } untuk preview sebelum push
  router.post('/showtimes/bulk-preview', (req, res) => {
    const b = req.body || {};
    const filmId = parseInt(b.film_id, 10);
    const outlets = Array.isArray(b.outlets) ? b.outlets.map(String).filter(Boolean) : [];
    const showDate = String(b.show_date || '').trim();
    const startTime = String(b.start_time || '').trim();
    if (!filmId || !outlets.length || !showDate) {
      return res.status(400).json({ error: 'film_id, outlets[], show_date wajib' });
    }
    const film = db.prepare(`SELECT title, duration_min FROM cinema_films WHERE id = ?`).get(filmId);
    if (!film) return res.status(404).json({ error: 'Film tidak ditemukan' });
    const studioType = String(b.studio_type || '').trim() || null;
    const PRE_SHOW_MIN = 15, CLEANING_GAP_MIN = 10;
    const occupancy = (film.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;
    const _toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const newStart = startTime ? _toMin(startTime) : null;
    const newEnd = newStart != null ? newStart + occupancy : null;

    const previews = outlets.map(outlet => {
      // Cari studio sesuai preference
      let studios = [];
      if (studioType) {
        studios = db.prepare(`SELECT id, studio_type, name FROM cinema_studios WHERE outlet = ? AND studio_type = ? AND is_active = 1 ORDER BY id`).all(outlet, studioType);
      }
      const others = db.prepare(`SELECT id, studio_type, name FROM cinema_studios WHERE outlet = ? AND is_active = 1 ${studioType ? 'AND studio_type != ?' : ''} ORDER BY id`).all(outlet, ...(studioType ? [studioType] : []));
      studios = [...studios, ...others];

      if (!studios.length) return { outlet, status: 'no_studio', reason: 'No active studio' };

      // Cari studio yg available pada jam tsb (kalau start_time provided)
      let pickedStudio = studios[0]; // default first
      if (newStart != null) {
        for (const s of studios) {
          const existing = db.prepare(`
            SELECT s.start_time, f.duration_min FROM cinema_showtimes s
            LEFT JOIN cinema_films f ON f.id = s.film_id
            WHERE s.studio_id = ? AND s.show_date = ?
              AND COALESCE(s.is_archived, 0) = 0
              AND COALESCE(s.status, 'scheduled') = 'scheduled'
          `).all(s.id, showDate);
          const overlap = existing.find(c => {
            const cStart = _toMin(c.start_time);
            const cEnd = cStart + (c.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;
            return newStart < cEnd && newEnd > cStart;
          });
          if (!overlap) { pickedStudio = s; break; }
          pickedStudio = null;
        }
        if (!pickedStudio) return { outlet, status: 'all_busy', reason: 'All studios busy at this time' };
      }

      // Resolve price
      const r = resolveOutletPrice(outlet, pickedStudio.studio_type || 'Regular', showDate);
      return {
        outlet, status: 'ok',
        studio_name: pickedStudio.name, studio_type: pickedStudio.studio_type,
        price: r.price, price_source: r.source,
      };
    });

    res.json({
      ok: true,
      film: { id: filmId, title: film.title, duration_min: film.duration_min },
      occupancy_min: occupancy,
      previews,
    });
  });

  // ── BULK SCHEDULE — push 1 film+jam ke N outlet sekaligus ──
  // POST /showtimes/bulk { film_id, outlets:['JKT01','BDG01',...], show_date, start_time, format, price?, studio_type? }
  // Logic v2 (smart, anti-conflict):
  //   - Untuk tiap outlet → iterate active studios (preference studio_type dulu)
  //   - Untuk tiap studio → cek conflict (overlap dengan existing showtime di studio+date)
  //   - Pilih studio pertama yang AVAILABLE (no conflict)
  //   - Kalau semua studio outlet itu bentrok → skip with reason 'all studios busy'
  //   - Auto-tag company_id (scope atau default cinema=2)
  router.post('/showtimes/bulk', (req, res) => {
    const b = req.body || {};
    const filmId = parseInt(b.film_id, 10);
    const outlets = Array.isArray(b.outlets) ? b.outlets.map(String).filter(Boolean) : [];
    const showDate = String(b.show_date || '').trim();
    const startTime = String(b.start_time || '').trim();
    if (!filmId || !outlets.length || !showDate || !startTime) {
      return res.status(400).json({ error: 'film_id, outlets[], show_date, start_time wajib' });
    }
    // Load film duration untuk conflict check
    const film = db.prepare(`SELECT title, duration_min FROM cinema_films WHERE id = ?`).get(filmId);
    if (!film) return res.status(404).json({ error: 'Film tidak ditemukan' });
    const PRE_SHOW_MIN = 15, CLEANING_GAP_MIN = 10;
    const occupancy = (film.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;
    const _toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const newStart = _toMin(startTime);
    const newEnd = newStart + occupancy;

    const studioType = String(b.studio_type || '').trim() || null;
    const format = String(b.format || '2D').trim();
    const manualPrice = Number(b.price) || 0;

    // Multi-tenant
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;

    const created = [];
    const skipped = [];
    const ins = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price, format, company_id) VALUES (?,?,?,?,?,?,?)`);

    for (const outlet of outlets) {
      // Get all active studios di outlet ini, urut by preference (studio_type match dulu)
      let studios = [];
      if (studioType) {
        studios = db.prepare(`SELECT id, studio_type, name FROM cinema_studios WHERE outlet = ? AND studio_type = ? AND is_active = 1 ORDER BY id`).all(outlet, studioType);
      }
      const otherStudios = db.prepare(`
        SELECT id, studio_type, name FROM cinema_studios
        WHERE outlet = ? AND is_active = 1 ${studioType ? 'AND studio_type != ?' : ''}
        ORDER BY id
      `).all(outlet, ...(studioType ? [studioType] : []));
      studios = [...studios, ...otherStudios];

      if (!studios.length) {
        skipped.push({ outlet, reason: 'no active studio' });
        continue;
      }

      // Cari studio yang AVAILABLE (no conflict at this time)
      let pickedStudio = null;
      const busyStudios = [];
      for (const s of studios) {
        const existing = db.prepare(`
          SELECT s.start_time, f.title, f.duration_min
          FROM cinema_showtimes s
          LEFT JOIN cinema_films f ON f.id = s.film_id
          WHERE s.studio_id = ? AND s.show_date = ?
            AND COALESCE(s.is_archived, 0) = 0
            AND COALESCE(s.status, 'scheduled') = 'scheduled'
        `).all(s.id, showDate);
        const overlap = existing.find(c => {
          const cStart = _toMin(c.start_time);
          const cEnd = cStart + (c.duration_min || 0) + PRE_SHOW_MIN + CLEANING_GAP_MIN;
          return newStart < cEnd && newEnd > cStart;
        });
        if (!overlap) { pickedStudio = s; break; }
        busyStudios.push({ studio: s.name, blocked_by: overlap.title, time: overlap.start_time });
      }

      if (!pickedStudio) {
        skipped.push({
          outlet, reason: 'all studios busy at this time',
          blocked: busyStudios,
        });
        continue;
      }

      // Resolve price
      let price = manualPrice;
      let source = price > 0 ? 'manual' : null;
      if (!price) {
        try {
          const r = resolveOutletPrice(outlet, pickedStudio.studio_type || 'Regular', showDate);
          if (r?.price > 0) { price = r.price; source = r.source; }
        } catch {}
        if (!price) { price = 50000; source = source || 'default'; }
      }
      const info = ins.run(filmId, pickedStudio.id, showDate, startTime, price, format, companyId);
      created.push({
        outlet, studio_id: pickedStudio.id, studio_name: pickedStudio.name,
        studio_type: pickedStudio.studio_type, showtime_id: info.lastInsertRowid,
        price, price_source: source,
      });
    }

    res.json({
      ok: true,
      film: { id: filmId, title: film.title, duration_min: film.duration_min },
      occupancy_min: occupancy,
      created, skipped,
      summary: { total: outlets.length, created: created.length, skipped: skipped.length },
    });
  });

  router.delete('/showtimes/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_tickets WHERE showtime_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM cinema_showtimes WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.patch('/showtimes/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM cinema_showtimes WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'showtime tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['film_id', 'studio_id', 'show_date', 'start_time', 'price', 'format', 'status']) {
      if (b[k] !== undefined) {
        fields.push(`${k} = ?`);
        args.push(k === 'film_id' || k === 'studio_id' || k === 'price' ? (Number(b[k]) || 0) : b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_showtimes SET ${fields.join(', ')} WHERE id = ?`).run(...args);
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
    // Custom seat_map + seat_type_prices (if defined per-studio)
    let seatMap = null, seatTypePrices = null;
    if (st.seat_map) {
      try { seatMap = JSON.parse(st.seat_map); } catch {}
    }
    if (st.seat_type_prices) {
      try { seatTypePrices = JSON.parse(st.seat_type_prices); } catch {}
    }
    res.json({
      showtime: { ...st, derived_status },
      rows: st.rows || 0, cols: st.cols || 0, capacity,
      seat_map: seatMap,
      seat_type_prices: seatTypePrices,
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

    // Lock: refuse sale only when showtime fully closed / sold_out / cancelled.
    // Allow 'running' — walk-in / late-entry customer masih bisa beli tiket
    // (kasir judgement: kalau film terlalu jauh boleh refuse manual).
    // Configurable grace: pos_config WALK_IN_GRACE_MIN (default 60 menit setelah start).
    const film = db.prepare(`SELECT duration_min FROM cinema_films WHERE id = ?`).get(st.film_id);
    const capacity = db.prepare(`SELECT (rows*cols) c FROM cinema_studios WHERE id = ?`).get(st.studio_id)?.c || 0;
    const soldCount = soldCountFor(st.id);
    const nowSec = Math.floor(Date.now() / 1000);
    const derived = computeStatus({ ...st, duration_min: film?.duration_min }, capacity, soldCount, nowSec);

    // Hard blocks — gak bisa dijual under any circumstances
    if (derived === 'closed' || derived === 'cancelled' || derived === 'sold_out') {
      const msgMap = {
        closed:    'Showtime sudah selesai / ditutup manual.',
        sold_out:  'Showtime sudah sold out.',
        cancelled: 'Showtime dibatalkan.',
      };
      return res.status(409).json({ ok: false, error: msgMap[derived], derived_status: derived });
    }

    // Walk-in grace period — running showtime tetap menjual kecuali sudah lewat batas
    // Configurable via pos_config WALK_IN_GRACE_MIN (best-effort lookup, fallback 60 menit)
    if (derived === 'running') {
      let graceMin = 60;
      try {
        const row = db.prepare(`SELECT value FROM pos_config WHERE key='WALK_IN_GRACE_MIN'`).get();
        if (row && row.value) graceMin = Number(JSON.parse(row.value)) || graceMin;
      } catch {}
      const [Y, M, D] = String(st.show_date).split('-').map(Number);
      const [hh, mm]  = String(st.start_time).split(':').map(Number);
      const startSec  = Math.floor(new Date(Y, M - 1, D, hh, mm, 0).getTime() / 1000);
      const elapsedMin = Math.floor((nowSec - startSec) / 60);
      if (elapsedMin > graceMin) {
        return res.status(409).json({ ok: false, error: `Film sudah jalan ${elapsedMin} menit (lewat batas walk-in ${graceMin} menit). Penjualan ditutup.`, derived_status: 'running' });
      }
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

    // ── Payment guard ──
    // Customer kiosk wajib bawa payment_ref + paid=true (anti-spoof issue tiket gratis).
    // POS Cinema (cashier) boleh bypass kalau payment_method='cash' atau staff source.
    const isPaid = b.paid === true || b.paid === 'true';
    const paymentRef = String(b.payment_ref || '').trim();
    const paymentMethod = String(b.payment_method || '').trim().toLowerCase();
    const fromKiosk = b.source === 'kiosk' || b.kiosk === true;
    if (fromKiosk) {
      if (!isPaid || !paymentRef) {
        return res.status(402).json({ ok: false, error: 'Kiosk customer wajib bayar QRIS dulu (payment_ref + paid=true diperlukan).' });
      }
    }
    const nowEpoch = Math.floor(Date.now() / 1000);
    const paidAt = isPaid ? nowEpoch : null;
    const payStatus = isPaid ? 'paid' : (paymentRef ? 'pending' : null);

    // Per-seat price lookup — seat_map (type per cell) + seat_type_prices (price per type)
    const studio = db.prepare(`SELECT seat_map, seat_type_prices FROM cinema_studios WHERE id = ?`).get(st.studio_id);
    let seatMap = null, typePrices = null;
    try { seatMap = studio?.seat_map ? JSON.parse(studio.seat_map) : null; } catch {}
    try { typePrices = studio?.seat_type_prices ? JSON.parse(studio.seat_type_prices) : null; } catch {}
    const seatTypeMap = {}; // { 'A1': 'premium', 'A2': 'regular', ... }
    if (Array.isArray(seatMap)) {
      for (const row of seatMap) for (const cell of (row || [])) {
        if (cell && cell.label && cell.type && cell.type !== 'void') seatTypeMap[cell.label] = cell.type;
      }
    }
    const priceForSeat = (seatLabel) => {
      const t = seatTypeMap[seatLabel] || 'regular';
      if (typePrices && typePrices[t] != null) return typePrices[t];
      return st.price || 0;
    };

    const crypto = require('crypto');
    const purchaseId = 'CP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    // Multi-tenant: derive company dari showtime (or scope fallback)
    const _tktScope = req.companyScope || { is_super_admin: true };
    const _tktShow = db.prepare(`SELECT company_id FROM cinema_showtimes WHERE id = ?`).get(req.body.showtime_id);
    const _tktCompanyId = _tktShow?.company_id || (_tktScope.is_super_admin ? 2 : _tktScope.company_id);
    const ins   = db.prepare(`INSERT INTO cinema_tickets (showtime_id, seat, price, buyer, buyer_email, buyer_phone, code, purchase_id, payment_ref, payment_method, payment_status, paid_at, company_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insB  = db.prepare(`INSERT INTO cinema_purchase_bundles (purchase_id, bundle_id, bundle_name, qty, price) VALUES (?,?,?,?,?)`);
    const newTickets = [];
    const newBundles = [];
    try {
      db.transaction(() => {
        for (const s of seats) {
          const code = 'CT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
          const seatPrice = priceForSeat(s);
          const info = ins.run(st.id, s, seatPrice, b.buyer || '', b.buyer_email || '', b.buyer_phone || '', code, purchaseId, paymentRef || null, paymentMethod || null, payStatus, paidAt, _tktCompanyId);
          newTickets.push({ id: info.lastInsertRowid, seat: s, price: seatPrice, type: seatTypeMap[s] || 'regular', code, purchase_id: purchaseId });
        }
        for (const r of bundleRows) {
          const info = insB.run(purchaseId, r.bundle_id, r.bundle_name, r.qty, r.price);
          newBundles.push({ id: info.lastInsertRowid, ...r });
          // Auto-deduct inventory items per recipe (idempotent if no recipe set)
          try { deductInventoryForBundle(r.bundle_id, r.qty, 'bundle_sale', info.lastInsertRowid); } catch {}
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
    const seatsTotal = newTickets.reduce((a, t) => a + (t.price || 0), 0);
    let grossTotal = seatsTotal + bundlesTotal;

    // ── Apply discount (voucher / promo) ──
    let discountApplied = 0;
    if (b.discount_code && b.discount_type) {
      const code = String(b.discount_code).trim().toUpperCase();
      if (b.discount_type === 'voucher') {
        try {
          const v = db.prepare(`SELECT * FROM cinema_vouchers WHERE UPPER(code) = ? AND used_at IS NULL AND is_void = 0`).get(code);
          if (v && (!v.expires_at || v.expires_at > Math.floor(Date.now()/1000))) {
            discountApplied = Math.min(v.value, grossTotal);
            db.prepare(`UPDATE cinema_vouchers SET used_at = ?, used_purchase_id = ?, applied_amount = ? WHERE id = ?`)
              .run(Math.floor(Date.now()/1000), purchaseId, discountApplied, v.id);
          }
        } catch {}
      } else if (b.discount_type === 'promo') {
        try {
          const p = db.prepare(`SELECT * FROM cinema_promotions WHERE UPPER(code) = ? AND is_active = 1`).get(code);
          if (p) {
            let disc = p.discount_type === 'percentage' ? Math.round(grossTotal * p.discount_value / 100) : Math.round(p.discount_value);
            if (p.max_discount && disc > p.max_discount) disc = p.max_discount;
            discountApplied = Math.min(disc, grossTotal);
            db.prepare(`UPDATE cinema_promotions SET redemption_count = COALESCE(redemption_count,0) + 1 WHERE id = ?`).run(p.id);
            try {
              db.prepare(`INSERT INTO cinema_promo_redemptions (promo_id, purchase_id, discount_amount, applied_at)
                VALUES (?, ?, ?, strftime('%s','now'))`).run(p.id, purchaseId, discountApplied);
            } catch {}
          }
        } catch {}
      }
    }
    // ── Apply poin redemption (kalau request — sebelum compute earned) ──
    let pointsRedeemed = 0;
    let pointsDiscount = 0;
    if (b.buyer_phone && Number(b.points_redeem) > 0) {
      try {
        const phone = String(b.buyer_phone).trim();
        const cust = db.prepare(`SELECT id, current_points FROM loyalty_customers WHERE phone = ?`).get(phone);
        if (cust && cust.current_points > 0) {
          let pointValueIDR = 10;
          try { const r = db.prepare(`SELECT value FROM pos_config WHERE key='POINT_VALUE_IDR'`).get(); if (r?.value) pointValueIDR = Number(JSON.parse(r.value)) || 10; } catch {}
          const want = Math.floor(Number(b.points_redeem));
          // Cap: tidak boleh > saldo + tidak boleh > sisa total setelah promo discount
          const remaining = Math.max(0, grossTotal - discountApplied);
          const maxFromCash = Math.floor(remaining / pointValueIDR);
          pointsRedeemed = Math.min(want, cust.current_points, maxFromCash);
          pointsDiscount = pointsRedeemed * pointValueIDR;
        }
      } catch (e) { console.error('[cinema points redeem] err:', e.message); }
    }
    const finalTotal = Math.max(0, grossTotal - discountApplied - pointsDiscount);

    // ── Auto-member (loyalty) — kalau buyer_phone ada ──
    let loyalty = null;
    if (b.buyer_phone) {
      try {
        const phone = String(b.buyer_phone).trim();
        // Cek customer existing by phone
        let customer = db.prepare(`SELECT * FROM loyalty_customers WHERE phone = ?`).get(phone);
        if (!customer) {
          // Auto-create
          const info = db.prepare(`INSERT INTO loyalty_customers (phone, name, email, current_points, lifetime_points, lifetime_spend, total_visits, current_tier_code, created_at)
            VALUES (?, ?, ?, 0, 0, 0, 0, 'BRONZE', strftime('%s','now'))`)
            .run(phone, b.buyer || '', b.buyer_email || '');
          customer = { id: info.lastInsertRowid, phone, current_points: 0, lifetime_points: 0, lifetime_spend: 0, total_visits: 0, current_tier_code: 'BRONZE' };
        }
        // Earn points — default 1 point per Rp 10.000 (configurable di pos_config POINT_PER_AMOUNT)
        // Earn based on FINAL TOTAL setelah discount + redeem (poin dipakai tidak ngehasilin poin baru)
        let pointPerAmount = 10000;
        try { const row = db.prepare(`SELECT value FROM pos_config WHERE key='POINT_PER_AMOUNT'`).get(); if (row?.value) pointPerAmount = Number(JSON.parse(row.value)) || 10000; } catch {}
        const earned = Math.floor(finalTotal / pointPerAmount);
        // Apply redemption (deduct first) then add earned
        const balanceAfterRedeem = Math.max(0, (customer.current_points || 0) - pointsRedeemed);
        const newBalance = balanceAfterRedeem + earned;
        const newLifetime = (customer.lifetime_points || 0) + earned;
        const newSpend = (customer.lifetime_spend || 0) + finalTotal;
        const newVisits = (customer.total_visits || 0) + 1;
        db.prepare(`UPDATE loyalty_customers SET current_points = ?, lifetime_points = ?, lifetime_spend = ?, total_visits = ?, updated_at = strftime('%s','now') WHERE id = ?`)
          .run(newBalance, newLifetime, newSpend, newVisits, customer.id);
        // Log transactions: 1 redeem (kalau ada) + 1 earn
        try {
          if (pointsRedeemed > 0) {
            db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, ref_order_id, description, created_by)
              VALUES (?, 'redeem', ?, ?, ?, ?, ?)`)
              .run(customer.id, -pointsRedeemed, balanceAfterRedeem, purchaseId, `Cinema redeem ${pointsRedeemed} pt (-Rp ${pointsDiscount.toLocaleString('id-ID')})`, b.cashier_name || 'cinema-web');
          }
          db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, ref_order_id, description, created_by)
            VALUES (?, 'earn', ?, ?, ?, ?, ?)`)
            .run(customer.id, earned, newBalance, purchaseId, `Cinema ${(picked || st).start_time || ''} ${seats.length} tiket`, b.cashier_name || 'cinema-web');
        } catch {}
        loyalty = {
          customer_id: customer.id,
          earned,
          redeemed: pointsRedeemed,
          redeem_discount: pointsDiscount,
          balance: newBalance,
          tier: customer.current_tier_code,
          new_member: !customer.lifetime_points,
        };
      } catch (e) { console.error('[cinema loyalty] err:', e.message); }
    }

    // Fire-and-forget auto-send WA e-ticket. Best-effort — never block booking
    // response. Customer dapet WA notif dengan link ke e-ticket page.
    if (b.buyer_phone && _waMod && typeof _waMod.sendMessage === 'function') {
      const trackingBase = process.env.TRACKING_BASE_URL || '';
      const eticketUrl = trackingBase ? `${trackingBase}/?purchase=${purchaseId}` : `/?purchase=${purchaseId}`;
      const total = finalTotal;
      const seatList = newTickets.map(t => t.seat).join(', ');
      const showDate = st.show_date || '';
      const showTime = st.start_time || '';
      const film = db.prepare(`SELECT title FROM cinema_films WHERE id = ?`).get(st.film_id);
      const filmTitle = film?.title || 'Film';
      // Loyalty info (jika ada — earned + saldo) untuk apresiasi customer
      const loyaltyLines = loyalty ? [
        ``,
        `⭐ *POIN ANDA:*`,
        loyalty.new_member ? `🎉 Selamat! Anda otomatis terdaftar sebagai member.` : ``,
        `💎 + ${loyalty.earned} poin dari booking ini`,
        `💰 Saldo total: ${loyalty.balance} poin (~ Rp ${(loyalty.balance * 10).toLocaleString('id-ID')})`,
        `ℹ️ 100 poin = Rp 1.000 diskon di booking berikutnya`,
      ].filter(Boolean) : [];

      const msg = [
        `🎬 *TIKET CINEMA BERHASIL DIBOOKING*`,
        ``,
        `Halo ${b.buyer || 'Sobat'}! Terima kasih sudah pesan online 🙏`,
        ``,
        `🎥 *${filmTitle}*`,
        `📅 ${showDate} · ${showTime}`,
        `💺 ${seats.length} kursi: *${seatList}*`,
        `💰 Total: *Rp ${total.toLocaleString('id-ID')}*`,
        ``,
        `🎫 *E-TIKET ANDA:*`,
        eticketUrl,
        ``,
        `Tunjukkan QR di atas saat masuk studio.`,
        `Datang min. 15 menit sebelum jadwal.`,
        ...loyaltyLines,
      ].join('\n');
      // Best-effort, log result. No await — booking response returns immediately.
      Promise.resolve(_waMod.sendMessage(b.buyer_phone, msg))
        .then(r => console.log(`📱 Cinema WA e-ticket → ${b.buyer_phone}: ${r.ok ? '✓ sent (' + r.provider + ')' : '⚠ ' + r.error}`))
        .catch(e => console.warn('[cinema-wa]', e.message));
    }

    res.json({
      ok: true,
      count: seats.length,
      purchase_id: purchaseId,
      total: finalTotal,
      gross_total: grossTotal,
      seats_total: seatsTotal,
      bundles_total: bundlesTotal,
      discount_applied: discountApplied,
      tickets: newTickets,
      bundles: newBundles,
      loyalty,
      wa_queued: !!(b.buyer_phone && _waMod),
    });
  });

  // ── BUNDLES (F&B combo catalog) ──
  router.get('/bundles', (req, res) => {
    const all = String(req.query.all || '') === '1';
    const outletFilter = String(req.query.outlet || '').trim();
    // Multi-tenant: filter by company_id
    const scope = req.companyScope || { is_super_admin: true };
    const cFilter = scope.is_super_admin ? '' : ` AND company_id = ${parseInt(scope.company_id, 10)}`;
    const sql = all
      ? `SELECT * FROM cinema_bundles WHERE 1=1${cFilter} ORDER BY sort_order, name`
      : `SELECT * FROM cinema_bundles WHERE is_active = 1${cFilter} ORDER BY sort_order, name`;
    let bundles = db.prepare(sql).all();
    // Filter per outlet — bundle dengan outlet_codes NULL = global (all outlets),
    // dengan CSV = only outlets listed
    if (outletFilter) {
      bundles = bundles.filter(b => {
        if (!b.outlet_codes) return true; // global
        const codes = String(b.outlet_codes).split(',').map(s => s.trim()).filter(Boolean);
        return codes.includes(outletFilter);
      });
    }
    res.json({ bundles });
  });
  router.post('/bundles', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name wajib diisi' });
    // outlet_codes: accept array atau CSV string, normalize ke CSV (null = global)
    let outletCodes = null;
    if (b.outlet_codes !== undefined && b.outlet_codes !== null && b.outlet_codes !== '') {
      const arr = Array.isArray(b.outlet_codes) ? b.outlet_codes : String(b.outlet_codes).split(',');
      outletCodes = arr.map(s => String(s).trim().toUpperCase()).filter(Boolean).join(',') || null;
    }
    // Multi-tenant: auto-tag company_id
    const _bdlScope = req.companyScope || { is_super_admin: true };
    const _bdlCompanyId = _bdlScope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : _bdlScope.company_id;
    const info = db.prepare(`INSERT INTO cinema_bundles (name, description, price, is_active, sort_order, outlet_codes, image_url, company_id)
                             VALUES (?,?,?,?,?,?,?,?)`)
      .run(b.name, b.description || '', parseInt(b.price, 10) || 0,
           b.is_active === false ? 0 : 1, parseInt(b.sort_order, 10) || 0,
           outletCodes, b.image_url || null, _bdlCompanyId);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/bundles/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'description', 'price', 'is_active', 'sort_order', 'image_url']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        args.push(k === 'is_active' ? (b[k] ? 1 : 0) : (k === 'price' || k === 'sort_order') ? parseInt(b[k], 10) || 0 : b[k]);
      }
    }
    // outlet_codes special handling — accept array atau CSV
    if (b.outlet_codes !== undefined) {
      let val = null;
      if (b.outlet_codes !== null && b.outlet_codes !== '') {
        const arr = Array.isArray(b.outlet_codes) ? b.outlet_codes : String(b.outlet_codes).split(',');
        val = arr.map(s => String(s).trim().toUpperCase()).filter(Boolean).join(',') || null;
      }
      fields.push('outlet_codes = ?'); args.push(val);
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

  // ── LOYALTY LOOKUP — cek saldo poin by phone (untuk apply di checkout) ──
  // Path /loyalty-points (bukan /loyalty/lookup) — hindari conflict dengan
  // existing /loyalty/:phone yang catch all single-segment.
  router.get('/loyalty-points', (req, res) => {
    const phone = String(req.query.phone || '').trim();
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
    const customer = db.prepare(`SELECT id, phone, name, current_points, lifetime_points, lifetime_spend, total_visits, current_tier_code FROM loyalty_customers WHERE phone = ?`).get(phone);
    if (!customer) return res.json({ ok: true, found: false, points: 0 });
    // Get config: 1 poin = POINT_VALUE_IDR rupiah; min redeem = POINT_MIN_REDEEM
    let pointValueIDR = 10, minRedeem = 10;
    try { const r = db.prepare(`SELECT value FROM pos_config WHERE key='POINT_VALUE_IDR'`).get(); if (r?.value) pointValueIDR = Number(JSON.parse(r.value)) || 10; } catch {}
    try { const r = db.prepare(`SELECT value FROM pos_config WHERE key='POINT_MIN_REDEEM'`).get(); if (r?.value) minRedeem = Number(JSON.parse(r.value)) || 10; } catch {}
    res.json({
      ok: true,
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        points: customer.current_points || 0,
        tier: customer.current_tier_code || 'BRONZE',
        lifetime_spend: customer.lifetime_spend || 0,
        total_visits: customer.total_visits || 0,
      },
      config: {
        point_value_idr: pointValueIDR,  // 1 poin = Rp X
        min_redeem: minRedeem,
        // helper: berapa rupiah dari saldo
        max_idr_redeemable: (customer.current_points || 0) * pointValueIDR,
      },
    });
  });

  // ── PURCHASE — manual resend WA e-ticket (rescue path) ──
  // Customer hilang link? Buyer_phone keganti? Kasir / admin trigger ulang.
  router.post('/purchase/:pid/send-wa', async (req, res) => {
    const pid = String(req.params.pid || '').trim().toUpperCase();
    if (!pid) return res.status(400).json({ ok: false, error: 'purchase_id required' });
    if (!_waMod || typeof _waMod.sendMessage !== 'function') {
      return res.status(503).json({ ok: false, error: 'WhatsApp module unavailable' });
    }
    const tickets = db.prepare(`
      SELECT t.*, s.show_date, s.start_time, f.title AS film_title
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE t.purchase_id = ? ORDER BY t.seat
    `).all(pid);
    if (!tickets.length) return res.status(404).json({ ok: false, error: 'Purchase tidak ditemukan' });
    // Phone from request body OR from existing ticket buyer_phone
    const phone = String(req.body?.phone || tickets[0].buyer_phone || '').trim();
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required (atau set buyer_phone di booking awal)' });

    const head = tickets[0];
    const total = tickets.reduce((s, t) => s + (t.price || 0), 0);
    const seatList = tickets.map(t => t.seat).join(', ');
    const trackingBase = process.env.TRACKING_BASE_URL || '';
    const eticketUrl = trackingBase ? `${trackingBase}/?purchase=${pid}` : `/?purchase=${pid}`;
    const msg = [
      `🎬 *TIKET CINEMA*  (kiriman ulang)`,
      ``,
      `🎥 *${head.film_title || 'Film'}*`,
      `📅 ${head.show_date || ''} · ${head.start_time || ''}`,
      `💺 ${tickets.length} kursi: *${seatList}*`,
      `💰 Total: *Rp ${total.toLocaleString('id-ID')}*`,
      ``,
      `🎫 *E-TIKET:*`,
      eticketUrl,
    ].join('\n');
    const r = await _waMod.sendMessage(phone, msg);
    res.json({ ok: !!r.ok, phone, ...r });
  });

  // ── PURCHASE LOOKUP (all tickets + bundles for one purchase) ──
  // Used by CinemaWeb e-ticket page: customer scans 1 QR di counter,
  // page shows all N tiket dalam purchase, kasir tinggal klik "Print Semua"
  // untuk auto-print sejumlah tiket via thermal printer.
  router.get('/purchase/:pid', (req, res) => {
    const pid = String(req.params.pid || '').trim().toUpperCase();
    if (!pid) return res.status(400).json({ ok: false, error: 'purchase_id required' });
    const tickets = db.prepare(`
      SELECT t.id, t.code, t.seat, t.price, t.buyer, t.buyer_phone, t.buyer_email,
             t.payment_method, t.payment_status, t.paid_at, t.checked_in_at,
             t.purchase_id, t.showtime_id,
             f.title AS film_title, f.genre, f.duration_min, f.poster_url, f.rating AS age_rating,
             s.show_date, s.start_time, s.format,
             st.name AS studio_name, st.studio_type,
             o.name AS outlet_name, o.code AS outlet_code, o.address AS outlet_address
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s   ON s.id  = t.showtime_id
      LEFT JOIN cinema_films     f   ON f.id  = s.film_id
      LEFT JOIN cinema_studios   st  ON st.id = s.studio_id
      LEFT JOIN outlet_master    o   ON o.code = st.outlet
      WHERE t.purchase_id = ?
      ORDER BY t.seat
    `).all(pid);
    if (!tickets.length) return res.status(404).json({ ok: false, error: 'Purchase tidak ditemukan' });
    const bundles = db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ?`).all(pid);

    // Compute totals + lookup discount/loyalty data
    const tickets_total = tickets.reduce((s, t) => s + (t.price || 0), 0);
    const bundles_total = bundles.reduce((s, b) => s + (b.price * b.qty), 0);
    const gross_total = tickets_total + bundles_total;

    // Promo discount (cinema_promo_redemptions linked by purchase_id)
    let promo_discount = 0;
    let promo_info = null;
    try {
      const rd = db.prepare(`
        SELECT r.discount_amount, p.name AS promo_name, p.code AS promo_code
        FROM cinema_promo_redemptions r
        LEFT JOIN cinema_promotions p ON p.id = r.promo_id
        WHERE r.purchase_id = ? LIMIT 1
      `).get(pid);
      if (rd) {
        promo_discount = rd.discount_amount || 0;
        promo_info = { name: rd.promo_name, code: rd.promo_code };
      }
    } catch {}

    // Loyalty points redeemed (cinema_loyalty_transactions type='redeem')
    let points_used = 0;
    try {
      const lt = db.prepare(`
        SELECT SUM(amount) AS amt FROM cinema_loyalty_transactions
        WHERE ref_purchase_id = ? AND type = 'redeem'
      `).get(pid);
      if (lt && lt.amt) points_used = Math.abs(lt.amt);  // amount stored negative for redeem
    } catch {}

    // Tax (Indonesian PPN 11% — tax inclusive, harga sudah termasuk PPN)
    // Tampilkan sbg info: dari total, berapa porsi PPN
    const PPN_RATE = 0.11;
    const final_total = gross_total - promo_discount;
    const tax_extracted = Math.round(final_total * PPN_RATE / (1 + PPN_RATE));  // extract PPN dari harga inclusive
    const base_amount = final_total - tax_extracted;

    res.json({
      ok: true,
      purchase_id: pid,
      tickets,
      bundles,
      totals: {
        tickets_total,
        bundles_total,
        gross_total,
        promo_discount,
        points_used,
        final_total,
        tax_extracted,
        base_amount,
        tax_rate_pct: 11,
        tax_inclusive: true,
      },
      promo: promo_info,
      payment_method: tickets[0]?.payment_method || null,
      payment_status: tickets[0]?.payment_status || null,
    });
  });

  // ── PURCHASE BUNDLES (lookup + redeem at F&B counter) ──
  router.get('/purchase/:pid/bundles', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ? ORDER BY id`)
      .all(req.params.pid);
    res.json({ purchase_id: req.params.pid, bundles: rows });
  });
  // ── KDS CINEMA — unified queue: concession bundles + in-studio orders ──
  // GET /api/cinema/kds/queue?studio_id=X
  // Returns: { concession: [...], in_studio: [...], counts: {...} }
  router.get('/kds/queue', (req, res) => {
    const studioFilter = req.query.studio_id ? parseInt(req.query.studio_id, 10) : null;
    const sinceSec = Math.floor(Date.now() / 1000) - 6 * 3600; // last 6 hours
    // Concession — bundles dari ticket purchases yg belum di-redeem
    const concSql = `
      SELECT pb.id, pb.purchase_id, pb.bundle_name, pb.qty, pb.price, pb.created_at, pb.redeemed_at,
             t.seat, t.showtime_id, t.buyer,
             st.name AS studio_name, st.id AS studio_id,
             s.show_date, s.start_time, f.title AS film_title
      FROM cinema_purchase_bundles pb
      LEFT JOIN cinema_tickets t ON t.purchase_id = pb.purchase_id
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      LEFT JOIN cinema_films f ON f.id = s.film_id
      WHERE pb.redeemed_at IS NULL AND pb.created_at > ?
      ${studioFilter ? "AND st.id = ?" : ""}
      GROUP BY pb.id
      ORDER BY pb.created_at ASC
      LIMIT 100
    `;
    const concParams = studioFilter ? [sinceSec, studioFilter] : [sinceSec];
    const concession = db.prepare(concSql).all(...concParams).map(r => ({
      id: r.id, type: 'concession',
      bundle_name: r.bundle_name, qty: r.qty, price: r.price,
      purchase_id: r.purchase_id, seat: r.seat, buyer: r.buyer,
      film_title: r.film_title, studio_name: r.studio_name, studio_id: r.studio_id,
      show_date: r.show_date, start_time: r.start_time,
      created_at: r.created_at,
      // Concession kanggap "active" sebelum redeemed (pending pickup at counter)
      status: 'pending',
    }));

    // In-studio orders — status: pending atau preparing (delivered = done, skip)
    const inSql = `
      SELECT o.*, COUNT(i.id) AS items_count
      FROM cinema_in_studio_orders o
      LEFT JOIN cinema_in_studio_order_items i ON i.order_id = o.id
      WHERE o.status IN ('pending','preparing') AND o.created_at > ?
      ${studioFilter ? "AND o.studio_id = ?" : ""}
      GROUP BY o.id
      ORDER BY o.created_at ASC
      LIMIT 100
    `;
    const inParams = studioFilter ? [sinceSec, studioFilter] : [sinceSec];
    const inOrders = db.prepare(inSql).all(...inParams);
    const inIds = inOrders.map(o => o.id);
    let itemsByOrder = {};
    if (inIds.length) {
      const phs = inIds.map(() => '?').join(',');
      const items = db.prepare(`SELECT * FROM cinema_in_studio_order_items WHERE order_id IN (${phs})`).all(...inIds);
      for (const it of items) (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it);
    }
    const in_studio = inOrders.map(o => ({
      ...o, type: 'in_studio',
      items: itemsByOrder[o.id] || [],
    }));

    res.json({
      concession, in_studio,
      counts: {
        concession_pending: concession.length,
        in_studio_pending: in_studio.filter(o => o.status === 'pending').length,
        in_studio_preparing: in_studio.filter(o => o.status === 'preparing').length,
      },
    });
  });

  // ── TMDB LOOKUP — search film + fetch poster & trailer URL ──
  // GET /api/cinema/tmdb/search?q=Inception
  // Set TMDB_API_KEY env (free signup di https://www.themoviedb.org/signup)
  router.get('/tmdb/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ ok: false, error: 'query q wajib' });
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(503).json({ ok: false, error: 'TMDB_API_KEY belum di-set di server env' });
    try {
      const lang = req.query.lang || 'id-ID';
      const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=${lang}&query=${encodeURIComponent(q)}&include_adult=false`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`TMDB ${r.status}`);
      const d = await r.json();
      const results = (d.results || []).slice(0, 10).map(m => ({
        tmdb_id: m.id,
        title: m.title,
        original_title: m.original_title,
        release_date: m.release_date,
        overview: m.overview,
        vote_average: m.vote_average,
        poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
        backdrop_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
      }));
      res.json({ ok: true, count: results.length, results });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // GET /api/cinema/tmdb/movie/:id — full details + trailer key (YouTube)
  router.get('/tmdb/movie/:id', async (req, res) => {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(503).json({ ok: false, error: 'TMDB_API_KEY belum di-set' });
    try {
      const lang = req.query.lang || 'id-ID';
      const [info, videos, videosAll] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/movie/${req.params.id}?api_key=${apiKey}&language=${lang}`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/movie/${req.params.id}/videos?api_key=${apiKey}&language=en-US`).then(r => r.json()),
        fetch(`https://api.themoviedb.org/3/movie/${req.params.id}/videos?api_key=${apiKey}`).then(r => r.json()),
      ]);
      // Combine en-US + all-locale results, dedupe by key, prefer official trailer
      const seen = new Set();
      const allVideos = [...(videos.results || []), ...(videosAll.results || [])].filter(v => {
        if (seen.has(v.key)) return false;
        seen.add(v.key);
        return true;
      });
      const trailer = allVideos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
                   || allVideos.find(v => v.site === 'YouTube' && v.type === 'Trailer')
                   || allVideos.find(v => v.site === 'YouTube' && v.type === 'Teaser')
                   || allVideos.find(v => v.site === 'YouTube');
      res.json({
        ok: true,
        title: info.title,
        original_title: info.original_title,
        overview: info.overview,
        runtime: info.runtime,           // duration_min equivalent
        genres: (info.genres || []).map(g => g.name).join(', '),
        release_date: info.release_date,
        poster_url: info.poster_path ? `https://image.tmdb.org/t/p/w500${info.poster_path}` : null,
        backdrop_url: info.backdrop_path ? `https://image.tmdb.org/t/p/w1280${info.backdrop_path}` : null,
        trailer_key: trailer?.key || null,
        trailer_url: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
        vote_average: info.vote_average,
        tagline: info.tagline,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
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
  // Accepts:
  //   - CT-XXXX (single ticket code) → validate 1 seat
  //   - CP-XXXX (purchase id) → validate ALL seats in purchase (group entry)
  //   - Full URL (https://.../?ticket=CT-X or ?purchase=CP-X) → auto-extract
  router.post('/tickets/validate', (req, res) => {
    let raw = (req.body && req.body.code) ? String(req.body.code).trim() : '';
    if (!raw) return res.status(400).json({ ok: false, status: 'invalid', error: 'Code wajib diisi' });
    // Extract from URL kalau scanner baca QR yang encode full URL
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        raw = u.searchParams.get('purchase') || u.searchParams.get('ticket') || raw;
      } catch {}
    }
    const code = raw.toUpperCase();
    const isPurchase = /^CP-/.test(code);
    const now = Math.floor(Date.now() / 1000);

    const computeLate = (show_date, start_time) => {
      if (!show_date || !start_time) return { late_entry: false, minutes_late: 0 };
      const [Y, M, D] = String(show_date).split('-').map(Number);
      const [h, m]    = String(start_time).split(':').map(Number);
      if (!Y || !M || !D || isNaN(h) || isNaN(m)) return { late_entry: false, minutes_late: 0 };
      const startSec = Math.floor(new Date(Y, M - 1, D, h, m, 0).getTime() / 1000);
      const minutes_late = Math.floor((now - startSec) / 60);
      return { late_entry: minutes_late > 15, minutes_late };
    };

    // ── PURCHASE MODE — validate semua kursi sekaligus (group entry) ──
    if (isPurchase) {
      const tickets = db.prepare(`
        SELECT t.*, s.show_date, s.start_time, s.price AS showtime_price,
               f.title AS film_title, f.duration_min AS film_duration,
               st.name AS studio_name
        FROM cinema_tickets t
        LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
        LEFT JOIN cinema_films    f ON f.id = s.film_id
        LEFT JOIN cinema_studios  st ON st.id = s.studio_id
        WHERE t.purchase_id = ?
        ORDER BY t.seat
      `).all(code);
      if (!tickets.length) return res.status(404).json({ ok: false, status: 'invalid', error: 'Purchase tidak ditemukan' });

      const fresh = tickets.filter(t => !t.checked_in_at);
      const alreadyUsed = tickets.filter(t => t.checked_in_at);
      let newly_checked_in = 0;
      if (fresh.length > 0) {
        const ids = fresh.map(t => t.id);
        const placeholders = ids.map(() => '?').join(',');
        const r = db.prepare(`UPDATE cinema_tickets SET checked_in_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
        newly_checked_in = r.changes;
      }

      const bundles = db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ? ORDER BY id`).all(code);
      const head = tickets[0];
      const late = computeLate(head.show_date, head.start_time);
      const status = newly_checked_in === 0 ? 'used' : (alreadyUsed.length > 0 ? 'partial' : 'valid');

      // Use 200 even kalau partial/used — frontend differentiates via status field
      return res.json({
        ok: true,
        status,
        mode: 'purchase',
        purchase_id: code,
        ticket_count: tickets.length,
        newly_checked_in,
        already_used_count: alreadyUsed.length,
        ticket: { ...head, checked_in_at: head.checked_in_at || now },  // representative for list display
        tickets: tickets.map(t => ({ ...t, checked_in_at: t.checked_in_at || now })),
        bundles,
        ...late,
      });
    }

    // ── SINGLE TICKET MODE (CT- code or unprefixed code) ──
    const t = db.prepare(`
      SELECT t.*,
        s.show_date, s.start_time, s.price AS showtime_price,
        f.title AS film_title, f.duration_min AS film_duration,
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
    db.prepare(`UPDATE cinema_tickets SET checked_in_at = ? WHERE id = ?`).run(now, t.id);
    const bundles = t.purchase_id
      ? db.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ? ORDER BY id`).all(t.purchase_id)
      : [];
    const late = computeLate(t.show_date, t.start_time);
    res.json({ ok: true, status: 'valid', mode: 'single', ticket: { ...t, checked_in_at: now }, bundles, ...late });
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
          karyaOS · operations platform · Konfirmasi otomatis.
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
                     'min_run_days', 'distributor_notes',
                     'poster_url', 'trailer_url', 'subtitle', 'language', 'available_formats']) {
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

  // ── SEAT TYPES (couple / VIP / disabled / regular) ───────────────────
  router.get('/studios/:id/seat-types', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_seat_types WHERE studio_id = ?`).all(req.params.id);
    res.json({ seat_types: rows });
  });
  router.post('/studios/:id/seat-types/bulk', (req, res) => {
    const b = req.body || {};
    const assignments = Array.isArray(b.assignments) ? b.assignments : [];
    db.transaction(() => {
      for (const a of assignments) {
        if (!a.seat || !a.seat_type) continue;
        db.prepare(`INSERT INTO cinema_seat_types (studio_id, seat, seat_type, price_modifier) VALUES (?,?,?,?)
                    ON CONFLICT(studio_id, seat) DO UPDATE
                      SET seat_type = excluded.seat_type, price_modifier = excluded.price_modifier`)
          .run(req.params.id, String(a.seat), a.seat_type, parseInt(a.price_modifier, 10) || 0);
      }
    })();
    res.json({ ok: true, count: assignments.length });
  });
  router.delete('/studios/:id/seat-types/:seat', (req, res) => {
    db.prepare(`DELETE FROM cinema_seat_types WHERE studio_id = ? AND seat = ?`).run(req.params.id, req.params.seat);
    res.json({ ok: true });
  });

  // ── STUDIO MAINTENANCE / CLEANING ─────────────────────────────────────
  router.patch('/studios/:id/maintenance', (req, res) => {
    const b = req.body || {};
    const valid = ['operational', 'cleaning', 'maintenance', 'closed'];
    if (!valid.includes(b.maintenance_status)) return res.status(400).json({ ok: false, error: 'Status invalid' });
    db.prepare(`UPDATE cinema_studios SET maintenance_status = ? WHERE id = ?`).run(b.maintenance_status, req.params.id);
    res.json({ ok: true });
  });
  router.post('/studios/:id/clean', (req, res) => {
    const b = req.body || {};
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`INSERT INTO cinema_cleaning_logs (studio_id, cleaned_by, notes, showtime_id) VALUES (?,?,?,?)`)
      .run(req.params.id, b.cleaned_by || '', b.notes || '', b.showtime_id || null);
    db.prepare(`UPDATE cinema_studios SET last_cleaned_at = ?, last_cleaned_by = ?, maintenance_status = 'operational' WHERE id = ?`)
      .run(now, b.cleaned_by || '', req.params.id);
    res.json({ ok: true, cleaned_at: now });
  });
  router.get('/studios/:id/cleaning-logs', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_cleaning_logs WHERE studio_id = ? ORDER BY cleaned_at DESC LIMIT 50`).all(req.params.id);
    res.json({ logs: rows });
  });

  // ── HOLIDAYS ──────────────────────────────────────────────────────────
  router.get('/holidays', (req, res) => {
    const rows = db.prepare(`SELECT * FROM cinema_holidays ORDER BY date`).all();
    res.json({ holidays: rows });
  });
  router.post('/holidays', (req, res) => {
    const b = req.body || {};
    if (!b.date || !b.name) return res.status(400).json({ ok: false, error: 'date + name wajib' });
    try {
      const info = db.prepare(`INSERT INTO cinema_holidays (date, name, notes) VALUES (?,?,?)`)
        .run(b.date, b.name, b.notes || '');
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      res.status(409).json({ ok: false, error: 'Tanggal sudah ada' });
    }
  });
  router.patch('/holidays/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['date', 'name', 'notes', 'is_active']) {
      if (k in b) { fields.push(`${k} = ?`); args.push(k === 'is_active' ? (b[k] ? 1 : 0) : b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_holidays SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/holidays/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_holidays WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── PROMOTIONS / PROMO CODES ──────────────────────────────────────────
  // GET /promotions/active — promo lagi jalan untuk display di CDS/Kiosk (customer-facing)
  // Filter is_active=1 AND valid_from <= today <= valid_to AND quota not exceeded
  router.get('/promotions/active', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT id, code, name, description, promo_type, discount_type, discount_value,
             min_purchase, max_discount, bank_name, valid_from, valid_to,
             max_redemptions, redemption_count
      FROM cinema_promotions
      WHERE is_active = 1
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_to IS NULL OR valid_to >= ?)
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
      ORDER BY id DESC
      LIMIT 20
    `).all(today, today);
    res.json({ promotions: rows, today });
  });

  router.get('/promotions', (req, res) => {
    const all = String(req.query.all || '') === '1';
    // Multi-tenant filter
    const scope = req.companyScope || { is_super_admin: true };
    const cFilter = scope.is_super_admin ? '' : ` AND company_id = ${parseInt(scope.company_id, 10)}`;
    const sql = all
      ? `SELECT * FROM cinema_promotions WHERE 1=1${cFilter} ORDER BY is_active DESC, code`
      : `SELECT * FROM cinema_promotions WHERE is_active = 1${cFilter} ORDER BY code`;
    res.json({ promotions: db.prepare(sql).all() });
  });
  router.post('/promotions', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    if (b.code && db.prepare(`SELECT 1 FROM cinema_promotions WHERE UPPER(code) = ?`).get(String(b.code).toUpperCase())) {
      return res.status(409).json({ ok: false, error: 'Kode sudah dipakai' });
    }
    // Multi-tenant: auto-tag company_id (scope.company_id atau default 2 = Cinema)
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin ? (parseInt(b.company_id, 10) || 2) : scope.company_id;
    const info = db.prepare(`INSERT INTO cinema_promotions
      (code, name, description, promo_type, discount_type, discount_value,
       min_purchase, max_discount, applies_to_film_id, applies_to_bundle_id,
       bank_name, valid_from, valid_to, max_redemptions, is_active,
       trigger_type, trigger_threshold, trigger_scope, company_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.code ? String(b.code).toUpperCase() : null, b.name, b.description || '',
           b.promo_type || 'all', b.discount_type || 'percentage', parseFloat(b.discount_value) || 0,
           parseInt(b.min_purchase, 10) || 0, b.max_discount ? parseInt(b.max_discount, 10) : null,
           b.applies_to_film_id ? parseInt(b.applies_to_film_id, 10) : null,
           b.applies_to_bundle_id ? parseInt(b.applies_to_bundle_id, 10) : null,
           b.bank_name || '', b.valid_from || null, b.valid_to || null,
           b.max_redemptions ? parseInt(b.max_redemptions, 10) : null,
           b.is_active === false ? 0 : 1,
           b.trigger_type || 'code',
           parseInt(b.trigger_threshold, 10) || 0,
           b.trigger_scope || 'global',
           companyId);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/promotions/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['code', 'name', 'description', 'promo_type', 'discount_type', 'discount_value',
                     'min_purchase', 'max_discount', 'applies_to_film_id', 'applies_to_bundle_id',
                     'bank_name', 'valid_from', 'valid_to', 'max_redemptions', 'is_active',
                     'trigger_type', 'trigger_threshold', 'trigger_scope']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else if (['discount_value'].includes(k)) args.push(parseFloat(b[k]) || 0);
        else if (['min_purchase', 'max_discount', 'applies_to_film_id', 'applies_to_bundle_id', 'max_redemptions', 'trigger_threshold'].includes(k)) {
          args.push(b[k] == null || b[k] === '' ? null : parseInt(b[k], 10));
        } else if (k === 'code') args.push(b[k] ? String(b[k]).toUpperCase() : null);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_promotions SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/promotions/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_promotions WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Apply promo: validate + return discount (does NOT redeem; that happens on POST /tickets)
  router.post('/promotions/apply', (req, res) => {
    const b = req.body || {};
    const code = String(b.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: 'Kode promo wajib' });
    const p = db.prepare(`SELECT * FROM cinema_promotions WHERE UPPER(code) = ? AND is_active = 1`).get(code);
    if (!p) return res.status(404).json({ ok: false, error: 'Kode promo tidak ditemukan / sudah tidak aktif' });
    const today = new Date().toISOString().slice(0, 10);
    if (p.valid_from && today < p.valid_from) return res.status(400).json({ ok: false, error: `Promo berlaku mulai ${p.valid_from}` });
    if (p.valid_to && today > p.valid_to)     return res.status(400).json({ ok: false, error: `Promo berakhir ${p.valid_to}` });
    if (p.max_redemptions && p.redemption_count >= p.max_redemptions) {
      return res.status(400).json({ ok: false, error: 'Kuota promo sudah habis' });
    }
    const subtotal = parseInt(b.subtotal, 10) || 0;
    if (p.min_purchase && subtotal < p.min_purchase) {
      return res.status(400).json({ ok: false, error: `Minimal pembelian Rp ${(p.min_purchase || 0).toLocaleString('id-ID')}` });
    }
    // Filter constraints
    if (p.applies_to_film_id && b.film_id && parseInt(b.film_id, 10) !== p.applies_to_film_id) {
      return res.status(400).json({ ok: false, error: 'Promo hanya untuk film tertentu' });
    }
    // Compute discount
    let discount = p.discount_type === 'percentage'
      ? Math.floor(subtotal * (p.discount_value || 0) / 100)
      : Math.min(p.discount_value || 0, subtotal);
    if (p.max_discount && discount > p.max_discount) discount = p.max_discount;
    res.json({ ok: true, promo: p, discount, subtotal, total_after: subtotal - discount });
  });

  // Auto-trigger promos: unlock saat omzet/tiket harian capai threshold.
  // Dipakai kiosk untuk auto-apply diskon tanpa customer ketik kode.
  // Query opsional: ?outlet=JKT01 (default global only)
  router.get('/auto-promos', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const outlet = String(req.query.outlet || '').trim().toUpperCase();
    // Multi-tenant: filter by company
    const scope = req.companyScope || { is_super_admin: true };
    const cFilter = scope.is_super_admin ? '' : ` AND company_id = ${parseInt(scope.company_id, 10)}`;
    const promos = db.prepare(`
      SELECT * FROM cinema_promotions
      WHERE is_active = 1
        AND trigger_type IN ('auto_daily_sales','auto_daily_tickets')
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_to IS NULL OR valid_to >= ?)
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
        ${cFilter}
    `).all(today, today);
    // Hitung progress: total sales / tickets hari ini (paid only, global)
    // Outlet-level accounting belum diimplementasi (showtimes belum punya outlet_code)
    // jadi MVP pakai global counter — admin bisa set scope='global' atau outlet code yg match
    const row = db.prepare(`
      SELECT COALESCE(SUM(price),0) AS sales, COUNT(id) AS tickets
      FROM cinema_tickets
      WHERE date(sold_at,'unixepoch','localtime') = ?
        AND (payment_status IS NULL OR payment_status IN ('paid','settled','success'))
    `).get(today);
    const salesToday = row?.sales || 0; const ticketsToday = row?.tickets || 0;
    const result = promos
      // Scope filter: 'global' (default) berlaku di semua outlet,
      // selain itu hanya match kalau outlet kiosk = trigger_scope
      .filter(p => {
        const scope = String(p.trigger_scope || 'global').toLowerCase();
        if (scope === 'global') return true;
        if (!outlet) return false; // promo per-outlet butuh outlet param
        return scope === outlet.toLowerCase();
      })
      .map(p => {
        const target = p.trigger_threshold || 0;
        const current = p.trigger_type === 'auto_daily_sales' ? salesToday : ticketsToday;
        const unlocked = current >= target;
        return {
          id: p.id, name: p.name, description: p.description,
          discount_type: p.discount_type, discount_value: p.discount_value,
          max_discount: p.max_discount, min_purchase: p.min_purchase,
          applies_to_film_id: p.applies_to_film_id,
          trigger_type: p.trigger_type, trigger_threshold: target, trigger_scope: p.trigger_scope,
          progress: { current, target, unlocked, percent: target > 0 ? Math.min(100, Math.floor(current / target * 100)) : 0 },
        };
      });
    res.json({ promos: result, today, outlet: outlet || null, sales_today: salesToday, tickets_today: ticketsToday });
  });

  // ── POST-SHOW FEEDBACK (multi-aspect: movie/audio/cleanliness/comfort) ─
  router.post('/feedback/post-show', (req, res) => {
    const b = req.body || {};
    const info = db.prepare(`INSERT INTO cinema_post_show_feedback
      (ticket_code, showtime_id, film_id, rating_movie, rating_audio,
       rating_cleanliness, rating_comfort, comment, customer_phone)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(b.ticket_code || null, b.showtime_id || null, b.film_id || null,
           b.rating_movie || null, b.rating_audio || null,
           b.rating_cleanliness || null, b.rating_comfort || null,
           b.comment || '', b.customer_phone || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.get('/feedback/post-show', (req, res) => {
    const where = []; const params = {};
    if (req.query.from) { where.push(`date(created_at,'unixepoch','localtime') >= @from`); params.from = req.query.from; }
    if (req.query.film_id) { where.push(`film_id = @film_id`); params.film_id = parseInt(req.query.film_id, 10); }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM cinema_post_show_feedback ${W} ORDER BY created_at DESC LIMIT 200`).all(params);
    const agg = db.prepare(`
      SELECT COUNT(*) total,
             ROUND(AVG(rating_movie),2)       avg_movie,
             ROUND(AVG(rating_audio),2)       avg_audio,
             ROUND(AVG(rating_cleanliness),2) avg_cleanliness,
             ROUND(AVG(rating_comfort),2)     avg_comfort
      FROM cinema_post_show_feedback ${W}
    `).get(params);
    res.json({ rows, agg });
  });

  // ── GENRE → COMBO SUGGESTION ─────────────────────────────────────────
  router.get('/films/:id/suggested-combos', (req, res) => {
    const film = db.prepare(`SELECT genre FROM cinema_films WHERE id = ?`).get(req.params.id);
    if (!film || !film.genre) return res.json({ combos: [] });
    const genre = String(film.genre).toLowerCase();
    const maps = db.prepare(`SELECT * FROM cinema_genre_combos`).all();
    const matchedIds = new Set();
    for (const m of maps) {
      if (genre.includes(String(m.genre_keyword).toLowerCase())) matchedIds.add(m.bundle_id);
    }
    if (!matchedIds.size) return res.json({ combos: [] });
    const placeholders = [...matchedIds].map(() => '?').join(',');
    const combos = db.prepare(`SELECT * FROM cinema_bundles WHERE id IN (${placeholders}) AND is_active = 1`).all(...matchedIds);
    res.json({ combos });
  });

  // ── CRM / CUSTOMER INTELLIGENCE ──────────────────────────────────────
  // Aggregate dari tiket + bundles → customer profile (genre favorite,
  // total spend, freq, dst). Group by phone (preferred) atau email.
  router.get('/crm/customers', (req, res) => {
    const rows = db.prepare(`
      SELECT
        COALESCE(NULLIF(t.buyer_phone,''), NULLIF(t.buyer_email,''), 'unknown') AS contact,
        t.buyer_phone, t.buyer_email,
        COUNT(*) AS tickets,
        COALESCE(SUM(t.price),0) AS spend_tickets,
        MIN(t.sold_at) AS first_visit,
        MAX(t.sold_at) AS last_visit
      FROM cinema_tickets t
      WHERE COALESCE(NULLIF(t.buyer_phone,''), NULLIF(t.buyer_email,''), '') <> ''
      GROUP BY contact
      ORDER BY spend_tickets DESC
      LIMIT 500
    `).all();
    // Hydrate per-customer (top genre, bundle spend, top studio)
    for (const r of rows) {
      const useField = r.buyer_phone ? 'buyer_phone' : 'buyer_email';
      const val      = r.buyer_phone || r.buyer_email;
      const g = db.prepare(`
        SELECT f.genre, COUNT(*) AS c
        FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        JOIN cinema_films f ON f.id = s.film_id
        WHERE t.${useField} = ? AND f.genre IS NOT NULL AND f.genre <> ''
        GROUP BY f.genre ORDER BY c DESC LIMIT 1
      `).get(val);
      r.favorite_genre = g?.genre || null;
      const studio = db.prepare(`
        SELECT st.name, COUNT(*) AS c
        FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        JOIN cinema_studios st ON st.id = s.studio_id
        WHERE t.${useField} = ?
        GROUP BY st.id ORDER BY c DESC LIMIT 1
      `).get(val);
      r.favorite_studio = studio?.name || null;
      const b = db.prepare(`
        SELECT COALESCE(SUM(b.qty * b.price),0) AS spend
        FROM cinema_tickets t
        JOIN cinema_purchase_bundles b ON b.purchase_id = t.purchase_id
        WHERE t.${useField} = ?
      `).get(val);
      r.spend_bundles = b?.spend || 0;
      r.total_spend = (r.spend_tickets || 0) + (r.spend_bundles || 0);
    }
    rows.sort((a, b) => b.total_spend - a.total_spend);
    res.json({ customers: rows, total: rows.length });
  });

  router.get('/crm/customers/:contact', (req, res) => {
    const c = decodeURIComponent(req.params.contact);
    const tickets = db.prepare(`
      SELECT t.*, f.title AS film_title, f.genre, s.show_date, s.start_time, st.name AS studio_name
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films    f ON f.id = s.film_id
      LEFT JOIN cinema_studios  st ON st.id = s.studio_id
      WHERE t.buyer_phone = ? OR t.buyer_email = ?
      ORDER BY t.sold_at DESC LIMIT 50
    `).all(c, c);
    const inStudio = db.prepare(`
      SELECT * FROM cinema_in_studio_orders WHERE buyer_phone = ? ORDER BY created_at DESC LIMIT 50
    `).all(c);
    res.json({ contact: c, tickets, in_studio_orders: inStudio });
  });

  // ── ANALYTICS / MOVIE PERFORMANCE ────────────────────────────────────
  router.get('/analytics/movies', (req, res) => {
    const from = req.query.from || new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT f.id, f.title, f.genre, f.status,
        COUNT(t.id) AS tickets,
        COALESCE(SUM(t.price),0) AS revenue,
        (SELECT ROUND(AVG(rating),2) FROM cinema_film_ratings WHERE film_id = f.id) AS avg_rating,
        (SELECT COUNT(*) FROM cinema_film_ratings WHERE film_id = f.id) AS ratings_count,
        COUNT(DISTINCT s.id) AS showtimes
      FROM cinema_films f
      LEFT JOIN cinema_showtimes s ON s.film_id = f.id
      LEFT JOIN cinema_tickets t ON t.showtime_id = s.id AND date(t.sold_at,'unixepoch','localtime') BETWEEN ? AND ?
      GROUP BY f.id ORDER BY revenue DESC
    `).all(from, to);
    res.json({ from, to, rows });
  });

  router.get('/analytics/occupancy', (req, res) => {
    const byTimeBand = db.prepare(`
      SELECT
        CASE
          WHEN CAST(SUBSTR(s.start_time,1,2) AS INTEGER) < 12 THEN 'morning'
          WHEN CAST(SUBSTR(s.start_time,1,2) AS INTEGER) < 17 THEN 'matinee'
          WHEN CAST(SUBSTR(s.start_time,1,2) AS INTEGER) < 21 THEN 'prime'
          ELSE 'late'
        END AS time_band,
        COUNT(DISTINCT s.id) AS showtimes,
        COUNT(t.id) AS tickets,
        COALESCE(SUM(t.price),0) AS revenue,
        SUM(st.rows * st.cols) AS capacity
      FROM cinema_showtimes s
      LEFT JOIN cinema_studios st ON st.id = s.studio_id
      LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
      WHERE s.show_date >= date('now','-30 days','localtime')
      GROUP BY time_band
    `).all();
    const byDow = db.prepare(`
      SELECT
        strftime('%w', s.show_date) AS dow,
        COUNT(t.id) AS tickets,
        COALESCE(SUM(t.price),0) AS revenue,
        COUNT(DISTINCT s.id) AS showtimes
      FROM cinema_showtimes s
      LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
      WHERE s.show_date >= date('now','-30 days','localtime')
      GROUP BY dow ORDER BY dow
    `).all();
    res.json({ by_time_band: byTimeBand, by_day_of_week: byDow });
  });

  router.get('/analytics/attach-rate', (req, res) => {
    const total = db.prepare(`SELECT COUNT(DISTINCT purchase_id) c FROM cinema_tickets WHERE purchase_id IS NOT NULL AND purchase_id <> ''`).get().c;
    const withB = db.prepare(`SELECT COUNT(DISTINCT purchase_id) c FROM cinema_purchase_bundles`).get().c;
    const attach_rate = total ? Math.round((withB / total) * 10000) / 100 : 0;
    const byGenre = db.prepare(`
      SELECT f.genre,
        COUNT(DISTINCT t.purchase_id) AS purchases,
        COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM cinema_purchase_bundles b WHERE b.purchase_id = t.purchase_id) THEN t.purchase_id END) AS with_bundle
      FROM cinema_tickets t
      JOIN cinema_showtimes s ON s.id = t.showtime_id
      JOIN cinema_films f ON f.id = s.film_id
      WHERE t.purchase_id IS NOT NULL AND f.genre IS NOT NULL AND f.genre <> ''
      GROUP BY f.genre
    `).all().map(r => ({ ...r, attach_rate: r.purchases ? Math.round((r.with_bundle / r.purchases) * 10000) / 100 : 0 }));
    const topCombos = db.prepare(`
      SELECT bundle_name, COUNT(*) AS times_ordered, SUM(qty) AS total_qty, COALESCE(SUM(qty * price),0) AS revenue
      FROM cinema_purchase_bundles
      GROUP BY bundle_name ORDER BY times_ordered DESC LIMIT 10
    `).all();
    res.json({ attach_rate, total_purchases: total, with_bundles: withB, by_genre: byGenre, top_combos: topCombos });
  });

  router.get('/analytics/insights', (req, res) => {
    const insights = [];
    // Trending: 7d revenue vs prev 7d
    const films = db.prepare(`SELECT id, title FROM cinema_films WHERE status = 'now_showing'`).all();
    for (const f of films) {
      const cur = db.prepare(`
        SELECT COALESCE(SUM(t.price),0) AS r, COUNT(*) AS c FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        WHERE s.film_id = ? AND date(t.sold_at,'unixepoch','localtime') >= date('now','-7 days','localtime')
      `).get(f.id);
      const prev = db.prepare(`
        SELECT COALESCE(SUM(t.price),0) AS r FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        WHERE s.film_id = ? AND date(t.sold_at,'unixepoch','localtime') BETWEEN date('now','-14 days','localtime') AND date('now','-8 days','localtime')
      `).get(f.id);
      if (prev.r > 0 && cur.r > prev.r * 1.5) {
        const pct = Math.round((cur.r / prev.r - 1) * 100);
        insights.push({ type: 'trending_up', film_id: f.id, title: f.title, severity: 'good', message: `Revenue naik ${pct}% (Rp ${prev.r.toLocaleString('id-ID')} → Rp ${cur.r.toLocaleString('id-ID')})` });
      } else if (prev.r > 100000 && cur.r < prev.r * 0.5) {
        const pct = Math.round((1 - cur.r / prev.r) * 100);
        insights.push({ type: 'trending_down', film_id: f.id, title: f.title, severity: 'warn', message: `Revenue turun ${pct}% — pertimbangkan promo` });
      }
    }
    // Low occupancy films (avg <30% in 7d)
    const lowOcc = db.prepare(`
      SELECT f.id, f.title, COUNT(t.id) AS tkt, SUM(st.rows * st.cols) AS cap, COUNT(DISTINCT s.id) AS shows
      FROM cinema_films f
      JOIN cinema_showtimes s ON s.film_id = f.id
      JOIN cinema_studios st ON st.id = s.studio_id
      LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
      WHERE f.status = 'now_showing' AND s.show_date >= date('now','-7 days','localtime')
      GROUP BY f.id
      HAVING cap > 0 AND tkt * 100.0 / cap < 30 AND shows >= 3
    `).all();
    for (const l of lowOcc) {
      insights.push({ type: 'low_occupancy', film_id: l.id, title: l.title, severity: 'warn', message: `Okupansi cuma ${Math.round(l.tkt * 100 / l.cap)}% di ${l.shows} jadwal — kurangi slot atau promo` });
    }
    // Best combo attach (top 3)
    const topBundle = db.prepare(`
      SELECT bundle_name, COUNT(*) AS c, COALESCE(SUM(qty*price),0) AS rev
      FROM cinema_purchase_bundles ORDER BY c DESC LIMIT 1
    `).get();
    if (topBundle?.c > 0) {
      insights.push({ type: 'top_combo', severity: 'good', message: `Combo terlaris: "${topBundle.bundle_name}" (${topBundle.c}× · Rp ${topBundle.rev.toLocaleString('id-ID')})` });
    }
    // Peak hour
    const peak = db.prepare(`
      SELECT
        CASE WHEN CAST(SUBSTR(s.start_time,1,2) AS INTEGER) < 12 THEN 'pagi'
             WHEN CAST(SUBSTR(s.start_time,1,2) AS INTEGER) < 17 THEN 'matinee'
             WHEN CAST(SUBSTR(s.start_time,1,2) AS INTEGER) < 21 THEN 'prime'
             ELSE 'late' END AS band,
        COUNT(t.id) AS tkt
      FROM cinema_showtimes s LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
      WHERE s.show_date >= date('now','-30 days','localtime')
      GROUP BY band ORDER BY tkt DESC LIMIT 1
    `).get();
    if (peak?.tkt > 0) {
      insights.push({ type: 'peak_band', severity: 'info', message: `Peak hour: jam ${peak.band} (${peak.tkt} tiket / 30 hari)` });
    }
    res.json({ insights, generated_at: Math.floor(Date.now()/1000) });
  });

  // ── HQ FRANCHISE ROLLUP ──────────────────────────────────────────────
  router.get('/franchise/rollup', (req, res) => {
    const rows = db.prepare(`
      SELECT
        COALESCE(NULLIF(st.outlet,''), '— Tanpa outlet —') AS outlet,
        COUNT(DISTINCT st.id) AS studios,
        SUM(st.rows * st.cols) AS capacity_total
      FROM cinema_studios st
      GROUP BY outlet
    `).all();
    for (const r of rows) {
      const outletWhere = r.outlet === '— Tanpa outlet —' ? `(st.outlet IS NULL OR st.outlet = '')` : `st.outlet = ?`;
      const args = r.outlet === '— Tanpa outlet —' ? [] : [r.outlet];
      const today = db.prepare(`
        SELECT COUNT(t.id) AS tkt, COALESCE(SUM(t.price),0) AS revenue
        FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        JOIN cinema_studios st ON st.id = s.studio_id
        WHERE ${outletWhere} AND date(t.sold_at,'unixepoch','localtime') = date('now','localtime')
      `).get(...args);
      const m30 = db.prepare(`
        SELECT COUNT(t.id) AS tkt, COALESCE(SUM(t.price),0) AS revenue
        FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        JOIN cinema_studios st ON st.id = s.studio_id
        WHERE ${outletWhere} AND date(t.sold_at,'unixepoch','localtime') >= date('now','-30 days','localtime')
      `).get(...args);
      const topF = db.prepare(`
        SELECT f.title, COALESCE(SUM(t.price),0) AS rev, COUNT(t.id) AS tkt
        FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        JOIN cinema_studios st ON st.id = s.studio_id
        JOIN cinema_films f ON f.id = s.film_id
        WHERE ${outletWhere} AND date(t.sold_at,'unixepoch','localtime') >= date('now','-30 days','localtime')
        GROUP BY f.id ORDER BY rev DESC LIMIT 1
      `).get(...args);
      const issues = db.prepare(`
        SELECT COUNT(*) c FROM cinema_studios WHERE ${outletWhere} AND maintenance_status NOT IN ('operational','')
      `).get(...args);
      r.tickets_today = today.tkt;
      r.revenue_today = today.revenue;
      r.tickets_30d   = m30.tkt;
      r.revenue_30d   = m30.revenue;
      r.top_film      = topF?.title || null;
      r.top_film_revenue = topF?.rev || 0;
      r.studio_issues = issues.c || 0;
    }
    rows.sort((a, b) => b.revenue_30d - a.revenue_30d);
    res.json({ rollup: rows });
  });

  // ── MOVIE CAMPAIGN ENGINE ────────────────────────────────────────────
  router.get('/campaigns', (req, res) => {
    const sql = req.query.active === '1'
      ? `SELECT c.*, f.title AS film_title FROM cinema_campaigns c LEFT JOIN cinema_films f ON f.id = c.film_id WHERE c.is_active = 1 ORDER BY c.start_date DESC`
      : `SELECT c.*, f.title AS film_title FROM cinema_campaigns c LEFT JOIN cinema_films f ON f.id = c.film_id ORDER BY c.is_active DESC, c.start_date DESC`;
    res.json({ campaigns: db.prepare(sql).all() });
  });
  router.post('/campaigns', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO cinema_campaigns
      (name, campaign_type, film_id, start_date, end_date, applicable_days,
       start_time_band, end_time_band, special_price, discount_pct, min_attendees, description, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.campaign_type || 'special',
           b.film_id ? parseInt(b.film_id, 10) : null,
           b.start_date || null, b.end_date || null,
           b.applicable_days || null,
           b.start_time_band || null, b.end_time_band || null,
           b.special_price ? parseInt(b.special_price, 10) : null,
           parseFloat(b.discount_pct) || 0,
           parseInt(b.min_attendees, 10) || 0,
           b.description || '',
           b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/campaigns/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'campaign_type', 'film_id', 'start_date', 'end_date', 'applicable_days',
                     'start_time_band', 'end_time_band', 'special_price', 'discount_pct', 'min_attendees',
                     'description', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['film_id', 'special_price', 'min_attendees'].includes(k)) {
          args.push(b[k] == null || b[k] === '' ? null : parseInt(b[k], 10));
        } else if (k === 'discount_pct') args.push(parseFloat(b[k]) || 0);
        else if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/campaigns/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_campaigns WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  // Quick-template seed for standard campaign types
  router.post('/campaigns/template/:type', (req, res) => {
    const b = req.body || {};
    const templates = {
      premiere: { name: 'Premiere Night',        campaign_type: 'premiere', start_time_band: 'prime',  end_time_band: 'late',     special_price: 100000, description: 'Harga premium untuk premiere film blockbuster' },
      midnight: { name: 'Midnight Sale',         campaign_type: 'midnight', start_time_band: 'late',   end_time_band: 'late',     discount_pct: 25,      description: 'Diskon 25% untuk jadwal late night' },
      family:   { name: 'Family Package Sunday', campaign_type: 'family',   applicable_days: 'sunday', min_attendees: 3,          discount_pct: 15,      description: 'Beli ≥3 tiket Minggu hemat 15%' },
      student:  { name: 'Student Day',           campaign_type: 'student',  applicable_days: 'tuesday,wednesday,thursday',         discount_pct: 30,      description: 'Diskon 30% untuk pelajar Selasa-Kamis' },
    };
    const tpl = templates[req.params.type];
    if (!tpl) return res.status(400).json({ ok: false, error: 'Tipe template invalid' });
    const merged = { ...tpl, ...b };
    const info = db.prepare(`INSERT INTO cinema_campaigns
      (name, campaign_type, film_id, start_date, end_date, applicable_days,
       start_time_band, end_time_band, special_price, discount_pct, min_attendees, description, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`)
      .run(merged.name, merged.campaign_type,
           merged.film_id || null, merged.start_date || null, merged.end_date || null,
           merged.applicable_days || null, merged.start_time_band || null, merged.end_time_band || null,
           merged.special_price || null, merged.discount_pct || 0, merged.min_attendees || 0,
           merged.description || '');
    res.json({ ok: true, id: info.lastInsertRowid, campaign: merged });
  });

  // ── CINEMA INVENTORY (popcorn/syrup/cup/etc + auto-deduct on combo sale) ─
  function deductInventoryForBundle(bundleId, qtySold, source, sourceId) {
    const recipes = db.prepare(`SELECT * FROM cinema_bundle_recipes WHERE bundle_id = ?`).all(bundleId);
    for (const r of recipes) {
      const deduction = r.qty * qtySold;
      db.prepare(`UPDATE cinema_inventory_items SET current_stock = current_stock - ? WHERE id = ?`)
        .run(deduction, r.inventory_item_id);
      db.prepare(`INSERT INTO cinema_inventory_movements (inventory_item_id, qty_change, source, source_id) VALUES (?,?,?,?)`)
        .run(r.inventory_item_id, -deduction, source, sourceId);
    }
  }
  router.get('/inventory/items', (req, res) => {
    const all = String(req.query.all || '') === '1';
    const sql = all
      ? `SELECT * FROM cinema_inventory_items ORDER BY is_active DESC, name`
      : `SELECT * FROM cinema_inventory_items WHERE is_active = 1 ORDER BY name`;
    res.json({ items: db.prepare(sql).all() });
  });
  router.post('/inventory/items', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO cinema_inventory_items
      (name, unit, current_stock, low_stock_threshold, cost_per_unit, is_active) VALUES (?,?,?,?,?,?)`)
      .run(b.name, b.unit || '', parseFloat(b.current_stock) || 0,
           parseFloat(b.low_stock_threshold) || 0, parseInt(b.cost_per_unit, 10) || 0,
           b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/inventory/items/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'unit', 'current_stock', 'low_stock_threshold', 'cost_per_unit', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else if (['current_stock', 'low_stock_threshold'].includes(k)) args.push(parseFloat(b[k]) || 0);
        else if (k === 'cost_per_unit') args.push(parseInt(b[k], 10) || 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE cinema_inventory_items SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/inventory/items/:id', (req, res) => {
    db.prepare(`DELETE FROM cinema_inventory_items WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.post('/inventory/items/:id/restock', (req, res) => {
    const b = req.body || {};
    const qty = parseFloat(b.qty);
    if (!qty || qty <= 0) return res.status(400).json({ ok: false, error: 'qty harus positif' });
    db.prepare(`UPDATE cinema_inventory_items SET current_stock = current_stock + ? WHERE id = ?`).run(qty, req.params.id);
    db.prepare(`INSERT INTO cinema_inventory_movements (inventory_item_id, qty_change, source, notes) VALUES (?,?,?,?)`)
      .run(req.params.id, qty, 'restock', b.notes || '');
    res.json({ ok: true });
  });
  router.get('/inventory/movements', (req, res) => {
    const where = []; const params = {};
    if (req.query.item_id) { where.push('m.inventory_item_id = @item_id'); params.item_id = parseInt(req.query.item_id, 10); }
    if (req.query.from)    { where.push("date(m.created_at,'unixepoch','localtime') >= @from"); params.from = req.query.from; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT m.*, i.name AS item_name, i.unit
      FROM cinema_inventory_movements m
      LEFT JOIN cinema_inventory_items i ON i.id = m.inventory_item_id
      ${W} ORDER BY m.created_at DESC LIMIT 200
    `).all(params);
    res.json({ movements: rows });
  });
  router.get('/bundles/:id/recipe', (req, res) => {
    const rows = db.prepare(`
      SELECT r.*, i.name AS item_name, i.unit, i.current_stock
      FROM cinema_bundle_recipes r
      LEFT JOIN cinema_inventory_items i ON i.id = r.inventory_item_id
      WHERE r.bundle_id = ?
    `).all(req.params.id);
    res.json({ recipe: rows });
  });
  router.post('/bundles/:id/recipe', (req, res) => {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    db.transaction(() => {
      db.prepare(`DELETE FROM cinema_bundle_recipes WHERE bundle_id = ?`).run(req.params.id);
      const ins = db.prepare(`INSERT INTO cinema_bundle_recipes (bundle_id, inventory_item_id, qty) VALUES (?,?,?)`);
      for (const it of items) {
        if (it.inventory_item_id && it.qty > 0) ins.run(req.params.id, parseInt(it.inventory_item_id, 10), parseFloat(it.qty));
      }
    })();
    res.json({ ok: true, count: items.length });
  });

  // ── SIGNAGE BOARD (lobby TV display aggregator) ───────────────────────
  router.get('/signage/board', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const nowShowing = db.prepare(`
      SELECT f.*, ROUND((SELECT AVG(rating) FROM cinema_film_ratings WHERE film_id = f.id), 2) AS avg_rating
      FROM cinema_films f WHERE f.status = 'now_showing' ORDER BY f.title
    `).all();
    const comingSoon = db.prepare(`SELECT * FROM cinema_films WHERE status = 'coming_soon' ORDER BY license_start, title`).all();
    const showtimesToday = db.prepare(`
      SELECT s.id, s.show_date, s.start_time, s.format,
             f.title AS film_title, f.rating AS film_rating, f.duration_min,
             st.name AS studio_name, st.studio_type, (st.rows * st.cols) AS capacity,
             (SELECT COUNT(*) FROM cinema_tickets WHERE showtime_id = s.id) AS sold
      FROM cinema_showtimes s
      LEFT JOIN cinema_films    f  ON f.id  = s.film_id
      LEFT JOIN cinema_studios  st ON st.id = s.studio_id
      WHERE s.show_date = ?
      ORDER BY s.start_time
    `).all(today);
    const campaigns = db.prepare(`
      SELECT c.*, f.title AS film_title FROM cinema_campaigns c
      LEFT JOIN cinema_films f ON f.id = c.film_id
      WHERE c.is_active = 1 ORDER BY c.created_at DESC LIMIT 6
    `).all();
    const queue = db.prepare(`
      SELECT status, COUNT(*) c FROM cinema_in_studio_orders
      WHERE date(created_at,'unixepoch','localtime') = date('now','localtime')
      GROUP BY status
    `).all().reduce((a, r) => (a[r.status] = r.c, a), {});
    res.json({ today, now_showing: nowShowing, coming_soon: comingSoon, showtimes_today: showtimesToday, campaigns, queue });
  });

  // ── OFFLINE VALIDATION SUPPORT ────────────────────────────────────────
  // Pre-fetch endpoint: door scanner pulls all valid (uncheckedin) ticket codes
  // for a showtime, caches lokal. Saat offline, validate cek cache + queue
  // result lokal → sync ke server saat online.
  router.get('/tickets/offline-codes', (req, res) => {
    let sql = `SELECT t.id, t.code, t.seat, t.checked_in_at,
                      f.title AS film_title, s.show_date, s.start_time, st.name AS studio_name
               FROM cinema_tickets t
               LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
               LEFT JOIN cinema_films    f ON f.id = s.film_id
               LEFT JOIN cinema_studios  st ON st.id = s.studio_id
               WHERE t.code IS NOT NULL`;
    const params = [];
    if (req.query.showtime_id) { sql += ` AND t.showtime_id = ?`; params.push(req.query.showtime_id); }
    if (req.query.date)        { sql += ` AND s.show_date = ?`; params.push(req.query.date); }
    sql += ` ORDER BY t.code LIMIT 2000`;
    const codes = db.prepare(sql).all(...params);
    res.json({ codes, generated_at: Math.floor(Date.now() / 1000), count: codes.length });
  });

  // Sync offline-collected validations. Body: { entries: [{code, scanned_at}] }
  router.post('/tickets/sync-offline', (req, res) => {
    const b = req.body || {};
    const entries = Array.isArray(b.entries) ? b.entries : [];
    const results = [];
    for (const e of entries) {
      const code = String(e.code || '').toUpperCase().trim();
      if (!code) { results.push({ code, status: 'invalid' }); continue; }
      const t = db.prepare(`SELECT * FROM cinema_tickets WHERE code = ?`).get(code);
      if (!t) { results.push({ code, status: 'invalid' }); continue; }
      if (t.checked_in_at) { results.push({ code, status: 'already_used', checked_in_at: t.checked_in_at }); continue; }
      const ts = parseInt(e.scanned_at, 10) || Math.floor(Date.now() / 1000);
      db.prepare(`UPDATE cinema_tickets SET checked_in_at = ? WHERE id = ?`).run(ts, t.id);
      results.push({ code, status: 'synced', checked_in_at: ts });
    }
    res.json({ ok: true, synced: results.filter(r => r.status === 'synced').length, results });
  });

  // ── CINEMA COMMAND CENTER (realtime aggregator) ──────────────────────
  router.get('/command-center', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const nowSec = Math.floor(Date.now() / 1000);

    // Showtimes happening today + derived occupancy
    const showtimesToday = db.prepare(`
      SELECT s.*, f.title AS film_title, f.duration_min, f.rating AS film_rating,
             st.name AS studio_name, st.studio_type, (st.rows * st.cols) AS capacity,
             (SELECT COUNT(*) FROM cinema_tickets WHERE showtime_id = s.id) AS sold
      FROM cinema_showtimes s
      LEFT JOIN cinema_films    f  ON f.id  = s.film_id
      LEFT JOIN cinema_studios  st ON st.id = s.studio_id
      WHERE s.show_date = ?
      ORDER BY s.start_time
    `).all(today).map(s => ({ ...s, derived_status: computeStatus(s, s.capacity, s.sold, nowSec) }));

    // Today's revenue (tickets + bundles)
    const ticketRev = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(price),0) revenue
      FROM cinema_tickets
      WHERE date(sold_at,'unixepoch','localtime') = date('now','localtime')`).get();
    const bundleRev = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(qty*price),0) revenue
      FROM cinema_purchase_bundles
      WHERE date(created_at,'unixepoch','localtime') = date('now','localtime')`).get();
    const inStudioRev = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) revenue
      FROM cinema_in_studio_orders
      WHERE date(created_at,'unixepoch','localtime') = date('now','localtime')`).get();

    // Queue snapshots
    const queue = db.prepare(`SELECT status, COUNT(*) c FROM cinema_in_studio_orders
      WHERE date(created_at,'unixepoch','localtime') = date('now','localtime')
      GROUP BY status`).all().reduce((a, r) => (a[r.status] = r.c, a), {});

    // Studio status (non-operational ones)
    const studios = db.prepare(`SELECT id, name, studio_type, maintenance_status, last_cleaned_at, last_cleaned_by FROM cinema_studios`).all();
    const issues  = studios.filter(s => s.maintenance_status && s.maintenance_status !== 'operational');

    // Latest feedback
    const feedback = db.prepare(`
      SELECT p.*, f.title AS film_title
      FROM cinema_post_show_feedback p
      LEFT JOIN cinema_films f ON f.id = p.film_id
      ORDER BY p.created_at DESC LIMIT 5
    `).all();

    // Recent voids (operational issues)
    const recentVoids = db.prepare(`SELECT COUNT(*) c FROM cinema_ticket_voids
      WHERE voided_at >= ?`).get(nowSec - 86400).c;

    res.json({
      today,
      showtimes_today: showtimesToday,
      revenue: {
        tickets:    ticketRev.revenue,
        bundles:    bundleRev.revenue,
        in_studio:  inStudioRev.revenue,
        total:      ticketRev.revenue + bundleRev.revenue + inStudioRev.revenue,
        tickets_count: ticketRev.c,
      },
      queue,
      studios,
      studio_issues: issues,
      feedback,
      void_count_24h: recentVoids,
    });
  });

  // ── PRICE LIST MASTER ─────────────────────────────────────────────────
  // Resolution: hitung specificity score (kolom non-NULL = +1) lalu price tertinggi
  // score wins. Tie → harga terbaru. Selalu fallback ke aturan paling umum.
  function dayTypeFromDate(d) {
    if (!d) return 'weekday';
    // Check holidays first (overrides weekend/weekday)
    const isHoliday = db.prepare(`SELECT 1 FROM cinema_holidays WHERE date = ? AND is_active = 1`).get(d);
    if (isHoliday) return 'holiday';
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
  // Auth: customer wajib punya purchase yg sudah lunas utk film ini
  // Anti-spam: 1 purchase = 1 review per film
  try { db.exec("ALTER TABLE cinema_film_ratings ADD COLUMN purchase_id TEXT"); } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_cfr_unique_purchase_film ON cinema_film_ratings(purchase_id, film_id) WHERE purchase_id IS NOT NULL AND purchase_id <> ''"); } catch {}

  router.post('/films/:id/rate', (req, res) => {
    const b = req.body || {};
    const r = parseInt(b.rating, 10);
    if (!r || r < 1 || r > 5) return res.status(400).json({ ok: false, error: 'Rating 1-5 wajib' });
    const filmId = parseInt(req.params.id, 10);
    const film = db.prepare(`SELECT id, title FROM cinema_films WHERE id = ?`).get(filmId);
    if (!film) return res.status(404).json({ ok: false, error: 'Film tidak ditemukan' });

    const purchase_id = String(b.purchase_id || '').trim().toUpperCase();
    const phone = String(b.customer_phone || '').trim();

    // Strict: wajib purchase_id yg cocok phone + film + payment_status paid
    if (!purchase_id) return res.status(400).json({ ok: false, error: 'purchase_id wajib (review hanya utk yg sudah nonton)' });
    if (!phone) return res.status(400).json({ ok: false, error: 'customer_phone wajib' });
    const own = db.prepare(`
      SELECT COUNT(*) AS c FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      WHERE t.purchase_id = ? AND s.film_id = ? AND t.buyer_phone = ?
        AND (t.payment_status IS NULL OR t.payment_status IN ('paid','settlement','capture'))
    `).get(purchase_id, filmId, phone);
    if (!own || !own.c) return res.status(403).json({ ok: false, error: 'Tidak menemukan booking sah utk film ini' });

    // Anti double-review
    const dup = db.prepare(`SELECT id FROM cinema_film_ratings WHERE purchase_id = ? AND film_id = ?`).get(purchase_id, filmId);
    if (dup) return res.status(409).json({ ok: false, error: 'Review utk booking ini sudah pernah dikirim' });

    const info = db.prepare(`INSERT INTO cinema_film_ratings
      (film_id, rating, comment, customer_name, customer_phone, ticket_code, purchase_id)
      VALUES (?,?,?,?,?,?,?)`)
      .run(filmId, r, b.comment || '', b.customer_name || '', phone, b.ticket_code || '', purchase_id);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.get('/films/:id/ratings', (req, res) => {
    const rows = db.prepare(`
      SELECT id, rating, comment, customer_name, created_at
      FROM cinema_film_ratings WHERE film_id = ? AND rating IS NOT NULL
      ORDER BY created_at DESC LIMIT 100
    `).all(req.params.id);
    const agg = db.prepare(`SELECT ROUND(AVG(rating),2) avg, COUNT(*) total FROM cinema_film_ratings WHERE film_id = ?`).get(req.params.id);
    // Distribusi 1..5
    const dist = { 1:0, 2:0, 3:0, 4:0, 5:0 };
    db.prepare(`SELECT rating, COUNT(*) c FROM cinema_film_ratings WHERE film_id = ? GROUP BY rating`)
      .all(req.params.id).forEach(r => { if (dist[r.rating] !== undefined) dist[r.rating] = r.c; });
    res.json({ ratings: rows, avg: agg.avg, total: agg.total, distribution: dist });
  });

  // List film yg dpt di-review oleh customer (sudah nonton, belum direview)
  router.get('/reviewable-films', (req, res) => {
    const phone = String(req.query.phone || '').trim();
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
    const rows = db.prepare(`
      SELECT DISTINCT t.purchase_id, s.film_id, f.title, f.poster_url, s.show_date, s.start_time
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films f     ON f.id = s.film_id
      WHERE t.buyer_phone = ?
        AND t.purchase_id IS NOT NULL
        AND (t.payment_status IS NULL OR t.payment_status IN ('paid','settlement','capture'))
        AND NOT EXISTS (
          SELECT 1 FROM cinema_film_ratings r
          WHERE r.purchase_id = t.purchase_id AND r.film_id = s.film_id
        )
      ORDER BY s.show_date DESC, s.start_time DESC LIMIT 50
    `).all(phone);
    res.json({ ok: true, items: rows });
  });

  // ── MY LIST (WATCHLIST) ───────────────────────────────────────────────
  // Customer save film favorit per nomor HP.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cinema_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_phone TEXT NOT NULL,
      film_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      company_id INTEGER,
      UNIQUE(customer_phone, film_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cw_phone ON cinema_watchlist(customer_phone);
    CREATE INDEX IF NOT EXISTS idx_cw_film  ON cinema_watchlist(film_id);
  `);

  router.get('/watchlist', (req, res) => {
    const phone = String(req.query.phone || '').trim();
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
    const rows = db.prepare(`
      SELECT w.id, w.film_id, w.created_at,
             f.title, f.poster_url, f.genre, f.duration_min, f.rating, f.status,
             ROUND((SELECT AVG(rating) FROM cinema_film_ratings WHERE film_id = f.id), 2) AS avg_rating,
             (SELECT COUNT(*) FROM cinema_film_ratings WHERE film_id = f.id) AS ratings_count
      FROM cinema_watchlist w
      LEFT JOIN cinema_films f ON f.id = w.film_id
      WHERE w.customer_phone = ? AND f.id IS NOT NULL
      ORDER BY w.created_at DESC LIMIT 50
    `).all(phone);
    res.json({ ok: true, items: rows });
  });

  router.post('/watchlist', (req, res) => {
    const b = req.body || {};
    const phone = String(b.customer_phone || '').trim();
    const filmId = parseInt(b.film_id, 10);
    if (!phone) return res.status(400).json({ ok: false, error: 'customer_phone required' });
    if (!filmId) return res.status(400).json({ ok: false, error: 'film_id required' });
    const film = db.prepare(`SELECT id FROM cinema_films WHERE id = ?`).get(filmId);
    if (!film) return res.status(404).json({ ok: false, error: 'Film tidak ditemukan' });
    try {
      db.prepare(`INSERT INTO cinema_watchlist (customer_phone, film_id) VALUES (?, ?)`).run(phone, filmId);
    } catch (e) {
      // UNIQUE constraint — sudah ada, idempotent
    }
    res.json({ ok: true });
  });

  router.delete('/watchlist/:film_id', (req, res) => {
    const phone = String(req.query.phone || '').trim();
    const filmId = parseInt(req.params.film_id, 10);
    if (!phone) return res.status(400).json({ ok: false, error: 'phone required' });
    if (!filmId) return res.status(400).json({ ok: false, error: 'film_id required' });
    const info = db.prepare(`DELETE FROM cinema_watchlist WHERE customer_phone = ? AND film_id = ?`).run(phone, filmId);
    res.json({ ok: true, removed: info.changes });
  });

  // ── TOP 10 FILMS (by booking count 30 hari terakhir) ──────────────────
  router.get('/films/top10', (req, res) => {
    const sinceDays = parseInt(req.query.days, 10) || 30;
    const since = Math.floor(Date.now() / 1000) - (sinceDays * 86400);
    const rows = db.prepare(`
      SELECT f.id, f.title, f.poster_url, f.genre, f.duration_min, f.rating, f.status,
             ROUND((SELECT AVG(rating) FROM cinema_film_ratings WHERE film_id = f.id), 2) AS avg_rating,
             (SELECT COUNT(*) FROM cinema_film_ratings WHERE film_id = f.id) AS ratings_count,
             COUNT(t.id) AS booking_count
      FROM cinema_films f
      LEFT JOIN cinema_showtimes s ON s.film_id = f.id
      LEFT JOIN cinema_tickets t ON t.showtime_id = s.id
        AND t.sold_at >= ?
        AND (t.payment_status IS NULL OR t.payment_status IN ('paid','settlement','capture'))
      WHERE f.status = 'now_showing' OR f.status IS NULL
      GROUP BY f.id
      HAVING booking_count > 0
      ORDER BY booking_count DESC, avg_rating DESC NULLS LAST
      LIMIT 10
    `).all(since);
    // Fallback: kalau belum ada booking sama sekali, return film by rating
    if (!rows.length) {
      const fallback = db.prepare(`
        SELECT f.id, f.title, f.poster_url, f.genre, f.duration_min, f.rating, f.status,
               ROUND((SELECT AVG(rating) FROM cinema_film_ratings WHERE film_id = f.id), 2) AS avg_rating,
               (SELECT COUNT(*) FROM cinema_film_ratings WHERE film_id = f.id) AS ratings_count,
               0 AS booking_count
        FROM cinema_films f
        WHERE f.status = 'now_showing' OR f.status IS NULL
        ORDER BY avg_rating DESC NULLS LAST, f.id DESC
        LIMIT 10
      `).all();
      return res.json({ ok: true, items: fallback.map((r, i) => ({ ...r, rank: i + 1 })), source: 'fallback_by_rating' });
    }
    res.json({ ok: true, items: rows.map((r, i) => ({ ...r, rank: i + 1 })), source: 'booking_count', since_days: sinceDays });
  });

  // ── WEB CONFIG (per company) ──────────────────────────────────────────
  // Phase 1: nav items + footer config
  // Phase 2: + FAQ groups
  db.exec(`
    CREATE TABLE IF NOT EXISTS cinema_web_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL UNIQUE,
      nav_items TEXT,
      footer_config TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_by TEXT
    );
  `);
  // Phase 2 ALTER — idempotent (try/catch karena ALTER ADD COLUMN bisa error kalau already exists)
  try { db.exec("ALTER TABLE cinema_web_config ADD COLUMN faq_groups TEXT"); } catch {}
  // Phase 3 ALTER — section toggles + page heros
  try { db.exec("ALTER TABLE cinema_web_config ADD COLUMN section_toggles TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_web_config ADD COLUMN page_heros TEXT"); } catch {}
  // Phase 3.5 ALTER — custom sections (manual film row) + custom pages (new admin-defined pages)
  try { db.exec("ALTER TABLE cinema_web_config ADD COLUMN custom_sections TEXT"); } catch {}
  try { db.exec("ALTER TABLE cinema_web_config ADD COLUMN custom_pages TEXT"); } catch {}

  router.get('/web-config', (req, res) => {
    // Auto-resolve company_id dari scope, atau dari query param (super admin)
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin
      ? (parseInt(req.query.company_id, 10) || 2)  // default Cinema (id 2)
      : scope.company_id;
    const row = db.prepare(`SELECT * FROM cinema_web_config WHERE company_id = ?`).get(companyId);
    if (!row) {
      return res.json({ ok: true, config: null, company_id: companyId });
    }
    res.json({
      ok: true,
      config: {
        nav_items: row.nav_items ? JSON.parse(row.nav_items) : null,
        footer_config: row.footer_config ? JSON.parse(row.footer_config) : null,
        faq_groups: row.faq_groups ? JSON.parse(row.faq_groups) : null,
        section_toggles: row.section_toggles ? JSON.parse(row.section_toggles) : null,
        page_heros: row.page_heros ? JSON.parse(row.page_heros) : null,
        custom_sections: row.custom_sections ? JSON.parse(row.custom_sections) : null,
        custom_pages: row.custom_pages ? JSON.parse(row.custom_pages) : null,
      },
      company_id: companyId,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
  });

  router.put('/web-config', (req, res) => {
    const scope = req.companyScope || { is_super_admin: true };
    const companyId = scope.is_super_admin
      ? (parseInt(req.body?.company_id, 10) || 2)
      : scope.company_id;
    const b = req.body || {};
    const navJson = b.nav_items ? JSON.stringify(b.nav_items) : null;
    const footerJson = b.footer_config ? JSON.stringify(b.footer_config) : null;
    const faqJson = b.faq_groups ? JSON.stringify(b.faq_groups) : null;
    const sectionJson = b.section_toggles ? JSON.stringify(b.section_toggles) : null;
    const heroJson = b.page_heros ? JSON.stringify(b.page_heros) : null;
    // Custom sections + pages: allow explicit empty array (= clear), tidak coalesce
    const customSectionsJson = (b.custom_sections !== undefined) ? JSON.stringify(b.custom_sections || []) : null;
    const customPagesJson    = (b.custom_pages !== undefined)    ? JSON.stringify(b.custom_pages || [])    : null;
    const updatedBy = req.headers['x-admin-user'] || 'unknown';
    db.prepare(`
      INSERT INTO cinema_web_config (company_id, nav_items, footer_config, faq_groups, section_toggles, page_heros, custom_sections, custom_pages, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), ?)
      ON CONFLICT(company_id) DO UPDATE SET
        nav_items = COALESCE(excluded.nav_items, nav_items),
        footer_config = COALESCE(excluded.footer_config, footer_config),
        faq_groups = COALESCE(excluded.faq_groups, faq_groups),
        section_toggles = COALESCE(excluded.section_toggles, section_toggles),
        page_heros = COALESCE(excluded.page_heros, page_heros),
        custom_sections = COALESCE(excluded.custom_sections, custom_sections),
        custom_pages = COALESCE(excluded.custom_pages, custom_pages),
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(companyId, navJson, footerJson, faqJson, sectionJson, heroJson, customSectionsJson, customPagesJson, updatedBy);
    res.json({ ok: true, company_id: companyId });
  });

  // ── WEB CONFIG TEMPLATES (Phase 5) ────────────────────────────────────
  // Preset configurations utk 1-klik onboarding tenant baru
  const WEB_CONFIG_TEMPLATES = {
    cinema_standard: {
      label: "🎬 Cinema Standard",
      description: "Full Netflix-style cinema booking — nav lengkap, semua row enabled, FAQ standar bioskop",
      vertical: "cinema",
      config: {
        nav_items: [
          { key: "outlet",    label: "Beranda",   target: "outlet",    visible: true, order: 1 },
          { key: "movies",    label: "Movies",    target: "movies",    visible: true, order: 2 },
          { key: "promo",     label: "Promo",     target: "promo",     visible: true, order: 3 },
          { key: "studio",    label: "Studio",    target: "studio",    visible: true, order: 4 },
          { key: "locations", label: "Lokasi",    target: "locations", visible: true, order: 5 },
          { key: "about",     label: "About",     target: "about",     visible: true, order: 6 },
        ],
        section_toggles: { my_list: true, now_showing: true, top10: true, top_picks: true, coming_soon: true, by_genre: true, genre_filter: true },
        footer_config: null,  // pakai DEFAULT_FOOTER_CONFIG di frontend
        faq_groups: null,     // pakai FAQ_GROUPS di frontend
        page_heros: {},
        custom_sections: [],
        custom_pages: [],
      },
    },
    cinema_premium: {
      label: "🎭 Cinema Premium",
      description: "Cinema + showcase custom — section 'Pilihan Manager' siap pakai, hero copy marketing-friendly",
      vertical: "cinema",
      config: {
        nav_items: [
          { key: "outlet",    label: "Beranda",   target: "outlet",    visible: true, order: 1 },
          { key: "movies",    label: "Movies",    target: "movies",    visible: true, order: 2 },
          { key: "promo",     label: "Promo",     target: "promo",     visible: true, order: 3 },
          { key: "studio",    label: "Event Privat", target: "studio", visible: true, order: 4 },
          { key: "locations", label: "Lokasi",    target: "locations", visible: true, order: 5 },
          { key: "about",     label: "About",     target: "about",     visible: true, order: 6 },
        ],
        section_toggles: { my_list: true, now_showing: true, top10: true, top_picks: true, coming_soon: true, by_genre: true, genre_filter: true },
        footer_config: null,
        faq_groups: null,
        page_heros: {
          promo:     { tag: "Promo Eksklusif", title: "Diskon Khusus Member Setia", subtitle: "Sebagai member, dapat akses promo eksklusif yang tidak tersedia untuk publik. Pakai kode di checkout untuk klaim langsung.", accent: "🎁" },
          studio:    { tag: "Event Privat", title: "Sewa Studio untuk Momen Spesial Anda", subtitle: "Ulang tahun, anniversary, screening privat, gathering korporat. Studio jadi milik Anda sepenuhnya — dari layar hingga snack.", accent: "🎉" },
          locations: { tag: "Lokasi", title: "Cinema Premium di Kota Anda", subtitle: "Lokasi strategis dengan fasilitas terbaik. Pesan dari sofa, nonton kapan pun.", accent: "📍" },
          about:     { tag: "About Us", title: "Pengalaman Cinema Terbaik di Indonesia", subtitle: "Lebih dari sekadar nonton — kami hadirkan pengalaman premium yang tidak terlupakan. Pesan tiket, pilih kursi, order F&B — semua dalam satu scan QR.", accent: "🎬" },
          faq:       { tag: "FAQ · Bantuan", title: "Semua Pertanyaan Anda Terjawab", subtitle: "Dari pemesanan tiket sampai program loyalty member — temukan jawaban lengkap di sini.", accent: "❓" },
        },
        custom_sections: [
          { id: Date.now(), title: "🎯 Pilihan Manager", film_ids: [], visible: true, order: 1 },
          { id: Date.now() + 1, title: "🌟 Rekomendasi Akhir Pekan", film_ids: [], visible: true, order: 2 },
        ],
        custom_pages: [],
      },
    },
    cinema_minimal: {
      label: "📽 Cinema Minimal",
      description: "Lean cinema — hanya Now Showing + Lokasi. Tanpa FAQ, tanpa custom section. Cocok untuk single-outlet kecil.",
      vertical: "cinema",
      config: {
        nav_items: [
          { key: "outlet",    label: "Beranda",   target: "outlet",    visible: true, order: 1 },
          { key: "movies",    label: "Film",      target: "movies",    visible: true, order: 2 },
          { key: "locations", label: "Lokasi",    target: "locations", visible: true, order: 3 },
        ],
        section_toggles: { my_list: false, now_showing: true, top10: false, top_picks: false, coming_soon: true, by_genre: false, genre_filter: false },
        footer_config: null,
        faq_groups: [],  // FAQ disabled (kosong array)
        page_heros: {},
        custom_sections: [],
        custom_pages: [],
      },
    },
    fnb_brand: {
      label: "🍔 F&B Brand",
      description: "Untuk tenant F&B yg tidak pakai cinema booking — nav sederhana, semua section cinema disabled",
      vertical: "fnb",
      config: {
        nav_items: [
          { key: "outlet",    label: "Beranda",   target: "outlet",    visible: true, order: 1 },
          { key: "locations", label: "Outlet",    target: "locations", visible: true, order: 2 },
          { key: "about",     label: "About",     target: "about",     visible: true, order: 3 },
        ],
        section_toggles: { my_list: false, now_showing: false, top10: false, top_picks: false, coming_soon: false, by_genre: false, genre_filter: false },
        footer_config: null,
        faq_groups: null,
        page_heros: {},
        custom_sections: [],
        custom_pages: [],
      },
    },
    blank: {
      label: "⚪ Blank (Custom)",
      description: "Mulai dari nol — semua default platform, admin atur manual",
      vertical: "any",
      config: {
        nav_items: null, section_toggles: null, footer_config: null,
        faq_groups: null, page_heros: null, custom_sections: [], custom_pages: [],
      },
    },
  };

  // GET /web-config/templates — list available templates
  router.get('/web-config/templates', (req, res) => {
    const list = Object.entries(WEB_CONFIG_TEMPLATES).map(([key, t]) => ({
      key, label: t.label, description: t.description, vertical: t.vertical,
    }));
    res.json({ ok: true, templates: list });
  });

  // POST /web-config/apply-template { template, company_id }
  // Overwrite web_config rows dgn template. Super-admin atau owner tenant.
  router.post('/web-config/apply-template', (req, res) => {
    const b = req.body || {};
    const templateKey = b.template;
    const template = WEB_CONFIG_TEMPLATES[templateKey];
    if (!template) return res.status(400).json({ error: 'invalid template key', available: Object.keys(WEB_CONFIG_TEMPLATES) });
    const scope = req.companyScope || { is_super_admin: true };
    let companyId = scope.is_super_admin
      ? (parseInt(b.company_id, 10) || 2)
      : scope.company_id;
    if (!companyId) return res.status(400).json({ error: 'no company_id' });
    const c = template.config;
    const updatedBy = req.headers['x-admin-user'] || 'template:' + templateKey;
    db.prepare(`
      INSERT INTO cinema_web_config (company_id, nav_items, footer_config, faq_groups, section_toggles, page_heros, custom_sections, custom_pages, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'), ?)
      ON CONFLICT(company_id) DO UPDATE SET
        nav_items = excluded.nav_items,
        footer_config = excluded.footer_config,
        faq_groups = excluded.faq_groups,
        section_toggles = excluded.section_toggles,
        page_heros = excluded.page_heros,
        custom_sections = excluded.custom_sections,
        custom_pages = excluded.custom_pages,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).run(
      companyId,
      c.nav_items ? JSON.stringify(c.nav_items) : null,
      c.footer_config ? JSON.stringify(c.footer_config) : null,
      c.faq_groups != null ? JSON.stringify(c.faq_groups) : null,
      c.section_toggles ? JSON.stringify(c.section_toggles) : null,
      c.page_heros ? JSON.stringify(c.page_heros) : null,
      JSON.stringify(c.custom_sections || []),
      JSON.stringify(c.custom_pages || []),
      updatedBy,
    );
    res.json({ ok: true, company_id: companyId, template: templateKey, label: template.label });
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

    // Payment audit — in-studio order WAJIB lunas (paid=true + payment_ref) sebelum diterima.
    // Frontend (CinemaInStudioOrder) generate QRIS via /api/payment/qris, poll, lalu post sini.
    const paid           = b.paid === true || b.paid === 'true';
    const paymentRef     = String(b.payment_ref || '').trim();
    const paymentMethod  = String(b.payment_method || 'qris').trim();
    const paymentAmount  = parseInt(b.payment_amount, 10) || total;
    if (!paid || !paymentRef) {
      return res.status(402).json({ ok: false, error: 'Pesanan in-studio wajib dibayar dulu. payment_ref + paid=true diperlukan.' });
    }
    if (paymentAmount < total) {
      return res.status(400).json({ ok: false, error: `Pembayaran kurang: bayar Rp ${paymentAmount} < total Rp ${total}` });
    }

    let orderId;
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO cinema_in_studio_orders
        (order_code, showtime_id, studio_id, studio_name, seat, buyer_name, buyer_phone, notes, total,
         payment_ref, payment_method, payment_status, payment_amount, paid_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code,
             b.showtime_id ? parseInt(b.showtime_id, 10) : null,
             b.studio_id   ? parseInt(b.studio_id, 10)   : null,
             b.studio_name || '', seat,
             b.buyer_name || '', b.buyer_phone || '',
             b.notes || '', total,
             paymentRef, paymentMethod, 'paid', paymentAmount,
             Math.floor(Date.now() / 1000));
      orderId = info.lastInsertRowid;
      const insIt = db.prepare(`INSERT INTO cinema_in_studio_order_items (order_id, bundle_id, bundle_name, qty, price) VALUES (?,?,?,?,?)`);
      for (const r of valid) {
        const info = insIt.run(orderId, r.bundle_id, r.bundle_name, r.qty, r.price);
        try { deductInventoryForBundle(r.bundle_id, r.qty, 'in_studio_order', info.lastInsertRowid); } catch {}
      }
    })();
    res.json({ ok: true, id: orderId, order_code: code, total, items: valid, payment_ref: paymentRef, payment_status: 'paid' });
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

  // PUBLIC track endpoint — customer pakai order_code buat liat status pesanan
  // GET /api/cinema/in-studio/orders/track/:code
  router.get('/in-studio/orders/track/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: 'order_code wajib' });
    const order = db.prepare(`SELECT * FROM cinema_in_studio_orders WHERE order_code = ?`).get(code);
    if (!order) return res.status(404).json({ ok: false, error: 'Pesanan tidak ditemukan' });
    const items = db.prepare(`SELECT * FROM cinema_in_studio_order_items WHERE order_id = ?`).all(order.id);
    // Don't leak sensitive admin fields — only return what customer needs
    res.json({
      ok: true,
      order_code: order.order_code,
      status: order.status,
      payment_status: order.payment_status,
      seat: order.seat,
      studio_name: order.studio_name,
      total: order.total,
      created_at: order.created_at,
      paid_at: order.paid_at,
      delivered_at: order.delivered_at,
      notes: order.notes,
      items: items.map(i => ({ bundle_name: i.bundle_name, qty: i.qty, price: i.price })),
    });
  });

  // Manual add (admin/staff): mirrors customer POST but allows setting status + buyer details freely.
  router.post('/in-studio/orders/manual', (req, res) => {
    const b = req.body || {};
    const seat = String(b.seat || '').trim();
    if (!seat) return res.status(400).json({ ok: false, error: 'Kursi wajib diisi' });
    const items = Array.isArray(b.items) ? b.items : [];
    const valid = [];
    for (const it of items) {
      const bid = parseInt(it.bundle_id, 10);
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      if (!bid) continue;
      const bn = db.prepare(`SELECT * FROM cinema_bundles WHERE id = ?`).get(bid);
      if (!bn) return res.status(400).json({ ok: false, error: `Menu id ${bid} tidak ditemukan` });
      valid.push({ bundle_id: bn.id, bundle_name: bn.name, qty, price: bn.price });
    }
    if (!valid.length) return res.status(400).json({ ok: false, error: 'Pesanan kosong (minimal 1 item)' });
    const total = valid.reduce((a, r) => a + r.qty * r.price, 0);
    const status = ['pending', 'preparing', 'delivered', 'cancelled'].includes(b.status) ? b.status : 'pending';
    const code = 'CM-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    let orderId;
    db.transaction(() => {
      const info = db.prepare(`INSERT INTO cinema_in_studio_orders
        (order_code, showtime_id, studio_id, studio_name, seat, buyer_name, buyer_phone, notes, total, status, delivered_at, delivered_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(code,
             b.showtime_id ? parseInt(b.showtime_id, 10) : null,
             b.studio_id   ? parseInt(b.studio_id, 10)   : null,
             b.studio_name || '', seat,
             b.buyer_name || '', b.buyer_phone || '',
             b.notes || '', total, status,
             status === 'delivered' ? Math.floor(Date.now()/1000) : null,
             status === 'delivered' ? (b.delivered_by || 'manual') : null);
      orderId = info.lastInsertRowid;
      const insIt = db.prepare(`INSERT INTO cinema_in_studio_order_items (order_id, bundle_id, bundle_name, qty, price) VALUES (?,?,?,?,?)`);
      for (const r of valid) {
        const ii = insIt.run(orderId, r.bundle_id, r.bundle_name, r.qty, r.price);
        try { deductInventoryForBundle(r.bundle_id, r.qty, 'in_studio_manual', ii.lastInsertRowid); } catch {}
      }
    })();
    res.json({ ok: true, id: orderId, order_code: code, total, items: valid, status });
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

  // ── BACKGROUND TASKS — daily cron ──
  // Run every 6 hours (4× sehari) untuk archive old + auto-generate template
  const dailyTasks = () => {
    try {
      // 1) Auto-archive showtime > 7 hari lewat
      const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const archiveR = db.prepare(`
        UPDATE cinema_showtimes
        SET is_archived = 1, archived_at = ?
        WHERE COALESCE(is_archived, 0) = 0 AND show_date < ?
      `).run(Math.floor(Date.now() / 1000), cutoffStr);
      if (archiveR.changes > 0) console.log(`[cinema cron] archived ${archiveR.changes} old showtimes (cutoff: ${cutoffStr})`);

      // 2) Auto-generate template aktif untuk 14 hari ke depan
      // Price PER DATE — weekday/weekend/holiday resolved otomatis per tanggal
      const templates = db.prepare(`SELECT * FROM cinema_showtime_templates WHERE is_active = 1`).all();
      let totalCreated = 0;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ins = db.prepare(`INSERT INTO cinema_showtimes (film_id, studio_id, show_date, start_time, price, format, company_id) VALUES (?,?,?,?,?,?,?)`);
      const exists = db.prepare(`SELECT id FROM cinema_showtimes WHERE studio_id = ? AND show_date = ? AND start_time = ?`);
      const updLast = db.prepare(`UPDATE cinema_showtime_templates SET last_generated_at = ? WHERE id = ?`);
      const nowSec = Math.floor(Date.now() / 1000);

      for (const t of templates) {
        const dowSet = new Set(String(t.days_of_week).split(',').map(d => parseInt(d, 10)));
        const studioInfo = db.prepare(`SELECT outlet, studio_type, company_id FROM cinema_studios WHERE id = ?`).get(t.studio_id);
        const studioOutlet = studioInfo?.outlet;
        const studioType = studioInfo?.studio_type || 'Regular';
        const companyId = studioInfo?.company_id || 2;
        for (let i = 0; i < 14; i++) {
          const d = new Date(today); d.setDate(d.getDate() + i);
          if (!dowSet.has(d.getDay())) continue;
          const dateStr = d.toISOString().slice(0, 10);
          if (t.active_from && dateStr < t.active_from) continue;
          if (t.active_until && dateStr > t.active_until) continue;
          if (exists.get(t.studio_id, dateStr, t.start_time)) continue;
          // Per-date price (weekday/weekend/holiday otomatis)
          let price = t.price;
          if (!price && studioOutlet) {
            try {
              const r = resolveOutletPrice(studioOutlet, studioType, dateStr);
              if (r?.price > 0) price = r.price;
            } catch {}
          }
          if (!price) price = 50000;
          ins.run(t.film_id, t.studio_id, dateStr, t.start_time, price, t.format || '2D', companyId);
          totalCreated++;
        }
        updLast.run(nowSec, t.id);
      }
      if (totalCreated > 0) console.log(`[cinema cron] auto-generated ${totalCreated} showtimes from ${templates.length} active templates (price resolved per date)`);
    } catch (e) {
      console.error('[cinema cron] error:', e.message);
    }
  };

  // Run sekali 30 detik setelah boot (let server stabilize), lalu tiap 6 jam
  setTimeout(dailyTasks, 30 * 1000);
  setInterval(dailyTasks, 6 * 60 * 60 * 1000);
  console.log('[cinema cron] daily tasks scheduled — every 6h (archive old + auto-gen templates)');

  return { router, db };
}

module.exports = { setupCinema };
