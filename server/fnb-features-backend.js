// server/fnb-features-backend.js
// F&B feature pack — closes audit gap (11 modules):
//   1. Recipe BOM + auto-deduct  → fnb_recipes
//   2. Combo / Set Meal builder  → fnb_combos / fnb_combo_items
//   3. Time-based menu periods   → fnb_menu_periods / _items
//   4. Allergen / dietary tags   → fnb_dietary_tags
//   5. Happy Hour pricing        → fnb_happy_hour_prices
//   6. Reservation system        → fnb_reservations
//   7. Tip pool distribution     → fnb_tips / _pool_distributions
//   8. Membership tier (Bronze/Silver/Gold/Platinum) → fnb_membership_tiers
//   9. Birthday promo automation → fnb_birthday_campaigns
//  10. Referral program          → fnb_referrals
//  11. Delivery & Drivers        → fnb_drivers / _zones / _deliveries
//
// Mount: const { setupFnbFeatures } = require('./fnb-features-backend');
//        setupFnbFeatures(app, { dbPath });
// Endpoints under /api/fnb/*.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
-- 1. Recipe BOM (link menu_item to ingredient + qty; auto-deduct on sale)
CREATE TABLE IF NOT EXISTS fnb_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  menu_item_name TEXT,
  ingredient_name TEXT NOT NULL,
  inventory_link_id INTEGER,
  qty REAL NOT NULL,
  unit TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  UNIQUE(menu_item_id, ingredient_name)
);
CREATE INDEX IF NOT EXISTS idx_fnbr_item ON fnb_recipes(menu_item_id);

CREATE TABLE IF NOT EXISTS fnb_ingredient_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER,
  ingredient_name TEXT,
  qty_change REAL NOT NULL,
  source TEXT,
  source_id INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- 2. Combo / Set Meal
CREATE TABLE IF NOT EXISTS fnb_combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  combo_price INTEGER DEFAULT 0,
  category TEXT,
  is_active INTEGER DEFAULT 1,
  image_url TEXT,
  available_from TEXT,
  available_to TEXT,
  applicable_days TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS fnb_combo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_id INTEGER NOT NULL,
  menu_item_id INTEGER,
  menu_item_name TEXT NOT NULL,
  qty INTEGER DEFAULT 1,
  swappable INTEGER DEFAULT 0,
  category TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_fci_combo ON fnb_combo_items(combo_id);

-- 3. Time-based menu periods (breakfast/lunch/dinner/late-night)
CREATE TABLE IF NOT EXISTS fnb_menu_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  applicable_days TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS fnb_menu_period_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL,
  menu_item_id INTEGER NOT NULL,
  menu_item_name TEXT,
  UNIQUE(period_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_fmpi_period ON fnb_menu_period_items(period_id);

-- 4. Allergens / dietary tags
CREATE TABLE IF NOT EXISTS fnb_dietary_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  menu_item_name TEXT,
  tag TEXT NOT NULL,
  UNIQUE(menu_item_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_fdt_item ON fnb_dietary_tags(menu_item_id);

-- 5. Happy Hour pricing
CREATE TABLE IF NOT EXISTS fnb_happy_hour_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  outlet TEXT,
  menu_item_id INTEGER,
  category TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  applicable_days TEXT,
  discount_pct REAL DEFAULT 0,
  special_price INTEGER,
  start_date TEXT,
  end_date TEXT,
  is_active INTEGER DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_fhh_active ON fnb_happy_hour_prices(is_active);

-- 6. Reservation
CREATE TABLE IF NOT EXISTS fnb_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  reservation_date TEXT NOT NULL,
  reservation_time TEXT NOT NULL,
  party_size INTEGER DEFAULT 1,
  table_number TEXT,
  occasion TEXT,
  special_requests TEXT,
  deposit_amount INTEGER DEFAULT 0,
  deposit_paid INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
  outlet TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  confirmed_at INTEGER,
  seated_at INTEGER,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fr_date ON fnb_reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_fr_status ON fnb_reservations(status);

-- 7. Tip handling + pool distribution
CREATE TABLE IF NOT EXISTS fnb_tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  amount INTEGER NOT NULL,
  staff_id INTEGER,
  staff_name TEXT,
  tip_type TEXT DEFAULT 'individual' CHECK (tip_type IN ('individual','pool')),
  payment_method TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ft_date ON fnb_tips(created_at);
CREATE TABLE IF NOT EXISTS fnb_tip_pool_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_date TEXT NOT NULL,
  staff_id INTEGER,
  staff_name TEXT NOT NULL,
  shift TEXT,
  hours_worked REAL DEFAULT 0,
  share_pct REAL DEFAULT 0,
  payout INTEGER DEFAULT 0,
  paid_at INTEGER,
  paid_by TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- 8. Membership tier (Bronze/Silver/Gold/Platinum)
CREATE TABLE IF NOT EXISTS fnb_membership_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  min_lifetime_spend INTEGER DEFAULT 0,
  min_visits INTEGER DEFAULT 0,
  points_multiplier REAL DEFAULT 1.0,
  birthday_bonus_pct REAL DEFAULT 0,
  free_delivery INTEGER DEFAULT 0,
  priority_queue INTEGER DEFAULT 0,
  perks_description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- 9. Birthday promo automation
CREATE TABLE IF NOT EXISTS fnb_birthday_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  campaign_type TEXT DEFAULT 'discount' CHECK (campaign_type IN ('discount','voucher','freebie')),
  discount_pct REAL DEFAULT 0,
  voucher_code TEXT,
  freebie_item_name TEXT,
  valid_days_before INTEGER DEFAULT 7,
  valid_days_after INTEGER DEFAULT 7,
  min_purchase INTEGER DEFAULT 0,
  applies_to_tier TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS fnb_birthday_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  customer_name TEXT,
  redeemed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  discount_amount INTEGER DEFAULT 0,
  order_id INTEGER
);

-- 10. Referral program
CREATE TABLE IF NOT EXISTS fnb_referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_phone TEXT NOT NULL,
  referrer_name TEXT,
  referrer_email TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  referee_phone TEXT,
  referee_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','registered','first_order','rewarded','expired')),
  reward_referrer_amount INTEGER DEFAULT 0,
  reward_referee_amount INTEGER DEFAULT 0,
  reward_referrer_paid_at INTEGER,
  reward_referee_paid_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  registered_at INTEGER,
  first_order_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fref_code ON fnb_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_fref_referrer ON fnb_referrals(referrer_phone);

-- 11. Delivery & Drivers
CREATE TABLE IF NOT EXISTS fnb_drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_type TEXT,
  vehicle_plate TEXT,
  status TEXT DEFAULT 'available' CHECK (status IN ('available','on_delivery','off_duty','suspended')),
  outlet TEXT,
  total_deliveries INTEGER DEFAULT 0,
  rating REAL DEFAULT 5.0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS fnb_delivery_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  outlet TEXT,
  postal_codes TEXT,
  area_keywords TEXT,
  base_fee INTEGER DEFAULT 0,
  per_km_fee INTEGER DEFAULT 0,
  min_order INTEGER DEFAULT 0,
  free_delivery_threshold INTEGER,
  max_distance_km REAL DEFAULT 10,
  estimated_minutes INTEGER DEFAULT 30,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS fnb_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_code TEXT NOT NULL UNIQUE,
  order_id INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT NOT NULL,
  zone_id INTEGER,
  driver_id INTEGER,
  delivery_fee INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','assigned','picked_up','on_the_way','delivered','failed','cancelled')),
  picked_up_at INTEGER,
  delivered_at INTEGER,
  failed_reason TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_fd_status ON fnb_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_fd_driver ON fnb_deliveries(driver_id);
-- 12. KDS multi-station routing
CREATE TABLE IF NOT EXISTS fnb_kds_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT,
  category_keywords TEXT,
  printer_name TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
-- 13. WhatsApp Business
CREATE TABLE IF NOT EXISTS fnb_wa_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT DEFAULT 'fonnte',
  api_key TEXT,
  sender_number TEXT,
  business_account_id TEXT,
  webhook_token TEXT,
  is_enabled INTEGER DEFAULT 0,
  notes TEXT,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS fnb_wa_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_phone TEXT NOT NULL,
  recipient_name TEXT,
  template_name TEXT,
  message TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','failed','read')),
  provider_msg_id TEXT,
  error TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_fwm_status ON fnb_wa_messages(status);
-- 14. Bank auto-recon
CREATE TABLE IF NOT EXISTS fnb_bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT,
  reference_no TEXT,
  bank_name TEXT,
  account_number TEXT,
  matched_settlement_id INTEGER,
  matched_at INTEGER,
  match_confidence REAL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_fbt_date ON fnb_bank_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_fbt_matched ON fnb_bank_transactions(matched_settlement_id);
-- 15. Order transfer log
CREATE TABLE IF NOT EXISTS fnb_order_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  order_ref TEXT,
  from_table TEXT,
  to_table TEXT,
  transferred_by TEXT,
  reason TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
-- 16. Bill split log
CREATE TABLE IF NOT EXISTS fnb_bill_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_order_id INTEGER,
  parent_order_ref TEXT,
  split_label TEXT,
  items_json TEXT,
  subtotal INTEGER DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','cancelled')),
  paid_at INTEGER,
  paid_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_fbs_order ON fnb_bill_splits(parent_order_id);
`;

function setupFnbFeatures(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // ALTER: driver realtime location (idempotent)
  try { db.exec("ALTER TABLE fnb_drivers ADD COLUMN last_lat REAL"); } catch {}
  try { db.exec("ALTER TABLE fnb_drivers ADD COLUMN last_lng REAL"); } catch {}
  try { db.exec("ALTER TABLE fnb_drivers ADD COLUMN last_ping_at INTEGER"); } catch {}
  // Seed KDS stations on first run
  if (db.prepare(`SELECT COUNT(*) c FROM fnb_kds_stations`).get().c === 0) {
    const ss = db.prepare(`INSERT INTO fnb_kds_stations (name, icon, category_keywords, printer_name, sort_order) VALUES (?,?,?,?,?)`);
    ss.run('Hot Kitchen', '🔥', 'main,pasta,grill,wok,fried',     'printer-kitchen-1', 1);
    ss.run('Cold Station', '🥗', 'salad,cold,appetizer,sushi',     'printer-kitchen-2', 2);
    ss.run('Beverage',     '🥤', 'minuman,drink,juice,coffee,tea', 'printer-bar-1',     3);
    ss.run('Dessert',      '🍰', 'dessert,cake,ice cream,sweets',  'printer-pastry',    4);
  }
  // Seed WA config row if absent
  if (db.prepare(`SELECT COUNT(*) c FROM fnb_wa_config`).get().c === 0) {
    db.prepare(`INSERT INTO fnb_wa_config (provider, is_enabled) VALUES ('fonnte', 0)`).run();
  }

  // Seed data on first run
  if (db.prepare(`SELECT COUNT(*) c FROM fnb_membership_tiers`).get().c === 0) {
    const st = db.prepare(`INSERT INTO fnb_membership_tiers (name, min_lifetime_spend, min_visits, points_multiplier, birthday_bonus_pct, free_delivery, priority_queue, perks_description, color, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    st.run('Bronze',   0,        0,  1.0, 5,   0, 0, 'Member dasar — 1× point earning · birthday 5% discount',                                '#a16207', 1);
    st.run('Silver',   1000000,  10, 1.5, 10,  0, 0, '1.5× point earning · birthday 10% discount · early access promo',                       '#9ca3af', 2);
    st.run('Gold',     5000000,  25, 2.0, 15,  1, 0, '2× point earning · birthday 15% · free delivery · prioritas reservasi weekend',         '#fbbf24', 3);
    st.run('Platinum', 15000000, 60, 3.0, 25,  1, 1, '3× point earning · birthday 25% · free delivery · priority queue · personal concierge', '#a855f7', 4);
  }
  if (db.prepare(`SELECT COUNT(*) c FROM fnb_menu_periods`).get().c === 0) {
    const sp = db.prepare(`INSERT INTO fnb_menu_periods (name, icon, start_time, end_time, sort_order, notes) VALUES (?,?,?,?,?,?)`);
    sp.run('Breakfast',  '🥐', '06:00', '10:30', 1, 'Pancake, kopi, sarapan ringan');
    sp.run('Lunch',      '🍱', '11:00', '14:30', 2, 'Menu siang lengkap');
    sp.run('Tea Time',   '🍰', '14:30', '17:00', 3, 'Dessert + minuman santai');
    sp.run('Dinner',     '🍽️', '17:00', '21:30', 4, 'Menu makan malam');
    sp.run('Late Night', '🌙', '21:30', '23:59', 5, 'Snack + minuman late');
  }
  if (db.prepare(`SELECT COUNT(*) c FROM fnb_delivery_zones`).get().c === 0) {
    const sz = db.prepare(`INSERT INTO fnb_delivery_zones (name, base_fee, per_km_fee, min_order, free_delivery_threshold, max_distance_km, estimated_minutes, area_keywords) VALUES (?,?,?,?,?,?,?,?)`);
    sz.run('Zone A (0-3 km)',  8000,  0,    50000,  150000, 3,  25, 'Paskal, Sayati, Pasir Kaliki');
    sz.run('Zone B (3-7 km)',  15000, 2000, 75000,  200000, 7,  35, 'Setiabudi, Dago, Pasteur');
    sz.run('Zone C (7-12 km)', 25000, 3000, 100000, 250000, 12, 50, 'Cihampelas, Riau, Sukajadi');
  }

  const router = express.Router();
  router.use(express.json());

  // Helper for auto-deduct hook (can be called from POS order completion)
  function deductRecipeIngredients(menuItemId, qtySold, source, sourceId) {
    const recipes = db.prepare(`SELECT * FROM fnb_recipes WHERE menu_item_id = ?`).all(menuItemId);
    for (const r of recipes) {
      const deduction = r.qty * qtySold;
      db.prepare(`INSERT INTO fnb_ingredient_movements (recipe_id, ingredient_name, qty_change, source, source_id) VALUES (?,?,?,?,?)`)
        .run(r.id, r.ingredient_name, -deduction, source, sourceId);
    }
    return recipes.length;
  }

  // ── 1. RECIPE BOM ────────────────────────────────────────────────────
  router.get('/recipes', (req, res) => {
    const where = []; const params = {};
    if (req.query.menu_item_id) { where.push('menu_item_id = @mid'); params.mid = parseInt(req.query.menu_item_id, 10); }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ recipes: db.prepare(`SELECT * FROM fnb_recipes ${W} ORDER BY menu_item_id, ingredient_name`).all(params) });
  });
  router.post('/recipes', (req, res) => {
    const b = req.body || {};
    if (!b.menu_item_id || !b.ingredient_name || !b.qty) return res.status(400).json({ ok: false, error: 'menu_item_id, ingredient_name, qty wajib' });
    try {
      const info = db.prepare(`INSERT INTO fnb_recipes (menu_item_id, menu_item_name, ingredient_name, inventory_link_id, qty, unit, notes) VALUES (?,?,?,?,?,?,?)`)
        .run(parseInt(b.menu_item_id, 10), b.menu_item_name || '', b.ingredient_name, b.inventory_link_id || null, parseFloat(b.qty), b.unit || '', b.notes || '');
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) { res.status(409).json({ ok: false, error: 'Ingredient sudah ada untuk menu item ini' }); }
  });
  router.patch('/recipes/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['ingredient_name', 'inventory_link_id', 'qty', 'unit', 'notes']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'qty') args.push(parseFloat(b[k]) || 0);
        else if (k === 'inventory_link_id') args.push(b[k] || null);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_recipes SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/recipes/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_recipes WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  // Trigger deduction manually (e.g., from POS settlement integration)
  router.post('/recipes/deduct', (req, res) => {
    const b = req.body || {};
    const count = deductRecipeIngredients(parseInt(b.menu_item_id, 10), parseFloat(b.qty) || 1, b.source || 'manual', b.source_id || null);
    res.json({ ok: true, ingredients_deducted: count });
  });
  router.get('/ingredient-movements', (req, res) => {
    const rows = db.prepare(`SELECT * FROM fnb_ingredient_movements ORDER BY created_at DESC LIMIT 200`).all();
    res.json({ movements: rows });
  });

  // ── 2. COMBO / SET MEAL ─────────────────────────────────────────────
  router.get('/combos', (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM fnb_combos ORDER BY is_active DESC, name`
      : `SELECT * FROM fnb_combos WHERE is_active = 1 ORDER BY name`;
    const combos = db.prepare(sql).all();
    for (const c of combos) {
      c.items = db.prepare(`SELECT * FROM fnb_combo_items WHERE combo_id = ?`).all(c.id);
    }
    res.json({ combos });
  });
  router.post('/combos', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO fnb_combos (name, description, combo_price, category, image_url, available_from, available_to, applicable_days, is_active) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.description || '', parseInt(b.combo_price, 10) || 0, b.category || '', b.image_url || '',
           b.available_from || null, b.available_to || null, b.applicable_days || null, b.is_active === false ? 0 : 1);
    // Items
    if (Array.isArray(b.items) && b.items.length) {
      const ins = db.prepare(`INSERT INTO fnb_combo_items (combo_id, menu_item_id, menu_item_name, qty, swappable, category) VALUES (?,?,?,?,?,?)`);
      for (const it of b.items) {
        ins.run(info.lastInsertRowid, it.menu_item_id || null, it.menu_item_name || '', parseInt(it.qty, 10) || 1, it.swappable ? 1 : 0, it.category || '');
      }
    }
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/combos/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'description', 'combo_price', 'category', 'image_url', 'available_from', 'available_to', 'applicable_days', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'combo_price') args.push(parseInt(b[k], 10) || 0);
        else if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else args.push(b[k]);
      }
    }
    if (fields.length) {
      args.push(req.params.id);
      db.prepare(`UPDATE fnb_combos SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    }
    if (Array.isArray(b.items)) {
      db.prepare(`DELETE FROM fnb_combo_items WHERE combo_id = ?`).run(req.params.id);
      const ins = db.prepare(`INSERT INTO fnb_combo_items (combo_id, menu_item_id, menu_item_name, qty, swappable, category) VALUES (?,?,?,?,?,?)`);
      for (const it of b.items) {
        ins.run(req.params.id, it.menu_item_id || null, it.menu_item_name || '', parseInt(it.qty, 10) || 1, it.swappable ? 1 : 0, it.category || '');
      }
    }
    res.json({ ok: true });
  });
  router.delete('/combos/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_combo_items WHERE combo_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM fnb_combos WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── 3. MENU PERIODS (time-based menu) ────────────────────────────────
  router.get('/menu-periods', (req, res) => {
    const periods = db.prepare(`SELECT * FROM fnb_menu_periods ORDER BY sort_order, name`).all();
    for (const p of periods) {
      p.items = db.prepare(`SELECT * FROM fnb_menu_period_items WHERE period_id = ?`).all(p.id);
    }
    // Auto-detect current period based on time
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const active = periods.find(p => p.is_active && p.start_time <= hhmm && hhmm <= p.end_time);
    res.json({ periods, current_period: active || null, current_time: hhmm });
  });
  router.post('/menu-periods', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.start_time || !b.end_time) return res.status(400).json({ ok: false, error: 'name + start + end wajib' });
    const info = db.prepare(`INSERT INTO fnb_menu_periods (name, icon, start_time, end_time, applicable_days, sort_order, notes, is_active) VALUES (?,?,?,?,?,?,?,?)`)
      .run(b.name, b.icon || '', b.start_time, b.end_time, b.applicable_days || null, parseInt(b.sort_order, 10) || 0, b.notes || '', b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/menu-periods/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'icon', 'start_time', 'end_time', 'applicable_days', 'sort_order', 'notes', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else if (k === 'sort_order') args.push(parseInt(b[k], 10) || 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_menu_periods SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/menu-periods/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_menu_period_items WHERE period_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM fnb_menu_periods WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.post('/menu-periods/:id/items', (req, res) => {
    const b = req.body || {};
    if (!b.menu_item_id) return res.status(400).json({ ok: false, error: 'menu_item_id wajib' });
    try {
      db.prepare(`INSERT INTO fnb_menu_period_items (period_id, menu_item_id, menu_item_name) VALUES (?,?,?)`)
        .run(req.params.id, parseInt(b.menu_item_id, 10), b.menu_item_name || '');
      res.json({ ok: true });
    } catch (e) { res.status(409).json({ ok: false, error: 'Sudah ada' }); }
  });
  router.delete('/menu-periods/:id/items/:itemId', (req, res) => {
    db.prepare(`DELETE FROM fnb_menu_period_items WHERE period_id = ? AND menu_item_id = ?`).run(req.params.id, req.params.itemId);
    res.json({ ok: true });
  });

  // ── 4. DIETARY / ALLERGEN TAGS ───────────────────────────────────────
  router.get('/dietary-tags', (req, res) => {
    const where = []; const params = {};
    if (req.query.menu_item_id) { where.push('menu_item_id = @mid'); params.mid = parseInt(req.query.menu_item_id, 10); }
    if (req.query.tag)          { where.push('tag = @tag');          params.tag = req.query.tag; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ tags: db.prepare(`SELECT * FROM fnb_dietary_tags ${W} ORDER BY menu_item_id, tag`).all(params) });
  });
  router.post('/dietary-tags', (req, res) => {
    const b = req.body || {};
    if (!b.menu_item_id || !b.tag) return res.status(400).json({ ok: false, error: 'menu_item_id + tag wajib' });
    try {
      const info = db.prepare(`INSERT INTO fnb_dietary_tags (menu_item_id, menu_item_name, tag) VALUES (?,?,?)`)
        .run(parseInt(b.menu_item_id, 10), b.menu_item_name || '', b.tag);
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) { res.status(409).json({ ok: false, error: 'Tag sudah ada' }); }
  });
  router.delete('/dietary-tags/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_dietary_tags WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.post('/dietary-tags/bulk', (req, res) => {
    const b = req.body || {};
    if (!b.menu_item_id) return res.status(400).json({ ok: false, error: 'menu_item_id wajib' });
    const tags = Array.isArray(b.tags) ? b.tags : [];
    db.transaction(() => {
      db.prepare(`DELETE FROM fnb_dietary_tags WHERE menu_item_id = ?`).run(parseInt(b.menu_item_id, 10));
      const ins = db.prepare(`INSERT INTO fnb_dietary_tags (menu_item_id, menu_item_name, tag) VALUES (?,?,?)`);
      for (const t of tags) ins.run(parseInt(b.menu_item_id, 10), b.menu_item_name || '', t);
    })();
    res.json({ ok: true, count: tags.length });
  });

  // ── 5. HAPPY HOUR PRICING ────────────────────────────────────────────
  router.get('/happy-hours', (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM fnb_happy_hour_prices ORDER BY is_active DESC, start_time`
      : `SELECT * FROM fnb_happy_hour_prices WHERE is_active = 1 ORDER BY start_time`;
    res.json({ happy_hours: db.prepare(sql).all() });
  });
  router.post('/happy-hours', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.start_time || !b.end_time) return res.status(400).json({ ok: false, error: 'name + start + end wajib' });
    const info = db.prepare(`INSERT INTO fnb_happy_hour_prices
      (name, outlet, menu_item_id, category, start_time, end_time, applicable_days, discount_pct, special_price, start_date, end_date, is_active, description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.outlet || '', b.menu_item_id || null, b.category || '',
           b.start_time, b.end_time, b.applicable_days || null,
           parseFloat(b.discount_pct) || 0,
           b.special_price ? parseInt(b.special_price, 10) : null,
           b.start_date || null, b.end_date || null,
           b.is_active === false ? 0 : 1, b.description || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/happy-hours/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'outlet', 'menu_item_id', 'category', 'start_time', 'end_time', 'applicable_days',
                     'discount_pct', 'special_price', 'start_date', 'end_date', 'is_active', 'description']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else if (k === 'discount_pct') args.push(parseFloat(b[k]) || 0);
        else if (['menu_item_id', 'special_price'].includes(k)) args.push(b[k] == null || b[k] === '' ? null : parseInt(b[k], 10));
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_happy_hour_prices SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/happy-hours/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_happy_hour_prices WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  // Active happy-hours now (filter by current time + day)
  router.get('/happy-hours/active-now', (req, res) => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getDay()];
    const today = now.toISOString().slice(0, 10);
    const rows = db.prepare(`SELECT * FROM fnb_happy_hour_prices WHERE is_active = 1
      AND start_time <= ? AND ? <= end_time
      AND (start_date IS NULL OR start_date <= ?)
      AND (end_date   IS NULL OR end_date   >= ?)
    `).all(hhmm, hhmm, today, today)
      .filter(r => !r.applicable_days || r.applicable_days.split(',').map(s => s.trim().toLowerCase()).includes(dayName));
    res.json({ active: rows, time: hhmm, day: dayName });
  });

  // ── 6. RESERVATION ───────────────────────────────────────────────────
  router.get('/reservations', (req, res) => {
    const where = []; const params = {};
    if (req.query.date)     { where.push('reservation_date = @date');     params.date = req.query.date; }
    if (req.query.from)     { where.push('reservation_date >= @from');    params.from = req.query.from; }
    if (req.query.to)       { where.push('reservation_date <= @to');      params.to = req.query.to; }
    if (req.query.status)   { where.push('status = @status');             params.status = req.query.status; }
    if (req.query.outlet)   { where.push('outlet = @outlet');             params.outlet = req.query.outlet; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ reservations: db.prepare(`SELECT * FROM fnb_reservations ${W} ORDER BY reservation_date DESC, reservation_time DESC LIMIT 200`).all(params) });
  });
  router.post('/reservations', (req, res) => {
    const b = req.body || {};
    if (!b.customer_name || !b.reservation_date || !b.reservation_time) {
      return res.status(400).json({ ok: false, error: 'customer_name, reservation_date, reservation_time wajib' });
    }
    const code = 'RES-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    const info = db.prepare(`INSERT INTO fnb_reservations
      (reservation_code, customer_name, customer_phone, customer_email, reservation_date, reservation_time,
       party_size, table_number, occasion, special_requests, deposit_amount, deposit_paid, status, outlet, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, b.customer_name, b.customer_phone || '', b.customer_email || '',
           b.reservation_date, b.reservation_time,
           parseInt(b.party_size, 10) || 1, b.table_number || '', b.occasion || '',
           b.special_requests || '', parseInt(b.deposit_amount, 10) || 0,
           parseInt(b.deposit_paid, 10) || 0, b.status || 'pending', b.outlet || '', b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid, reservation_code: code });
  });
  router.patch('/reservations/:id', (req, res) => {
    const b = req.body || {};
    const existing = db.prepare(`SELECT * FROM fnb_reservations WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' });
    const fields = []; const args = [];
    for (const k of ['customer_name', 'customer_phone', 'customer_email', 'reservation_date', 'reservation_time',
                     'party_size', 'table_number', 'occasion', 'special_requests', 'deposit_amount', 'deposit_paid',
                     'status', 'outlet', 'notes']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['party_size', 'deposit_amount', 'deposit_paid'].includes(k)) args.push(parseInt(b[k], 10) || 0);
        else args.push(b[k]);
      }
    }
    if (b.status) {
      const now = Math.floor(Date.now()/1000);
      if (b.status === 'confirmed' && !existing.confirmed_at) { fields.push('confirmed_at = ?'); args.push(now); }
      if (b.status === 'seated' && !existing.seated_at)       { fields.push('seated_at = ?');    args.push(now); }
      if (b.status === 'completed' && !existing.completed_at) { fields.push('completed_at = ?'); args.push(now); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_reservations SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/reservations/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_reservations WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── 7. TIP HANDLING + POOL ───────────────────────────────────────────
  router.get('/tips', (req, res) => {
    const where = []; const params = {};
    if (req.query.from)   { where.push("date(created_at,'unixepoch','localtime') >= @from"); params.from = req.query.from; }
    if (req.query.to)     { where.push("date(created_at,'unixepoch','localtime') <= @to");   params.to = req.query.to; }
    if (req.query.type)   { where.push('tip_type = @type');                                  params.type = req.query.type; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM fnb_tips ${W} ORDER BY created_at DESC LIMIT 500`).all(params);
    const agg = db.prepare(`SELECT COUNT(*) total_count, COALESCE(SUM(amount),0) total_amount FROM fnb_tips ${W}`).get(params);
    res.json({ tips: rows, total_count: agg.total_count, total_amount: agg.total_amount });
  });
  router.post('/tips', (req, res) => {
    const b = req.body || {};
    if (!b.amount) return res.status(400).json({ ok: false, error: 'amount wajib' });
    const info = db.prepare(`INSERT INTO fnb_tips (order_id, amount, staff_id, staff_name, tip_type, payment_method, notes) VALUES (?,?,?,?,?,?,?)`)
      .run(b.order_id || null, parseInt(b.amount, 10),
           b.staff_id || null, b.staff_name || '',
           b.tip_type || 'individual', b.payment_method || '',
           b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.get('/tip-pool/:date', (req, res) => {
    const date = req.params.date;
    // Pool total: sum of pool-type tips for that date
    const pool = db.prepare(`SELECT COALESCE(SUM(amount),0) total FROM fnb_tips WHERE tip_type = 'pool' AND date(created_at,'unixepoch','localtime') = ?`).get(date).total;
    const distributions = db.prepare(`SELECT * FROM fnb_tip_pool_distributions WHERE pool_date = ? ORDER BY share_pct DESC`).all(date);
    res.json({ date, pool_total: pool, distributions });
  });
  router.post('/tip-pool/:date/distribute', (req, res) => {
    const b = req.body || {};
    const entries = Array.isArray(b.entries) ? b.entries : [];
    if (!entries.length) return res.status(400).json({ ok: false, error: 'entries wajib' });
    db.transaction(() => {
      db.prepare(`DELETE FROM fnb_tip_pool_distributions WHERE pool_date = ?`).run(req.params.date);
      const ins = db.prepare(`INSERT INTO fnb_tip_pool_distributions (pool_date, staff_id, staff_name, shift, hours_worked, share_pct, payout, notes) VALUES (?,?,?,?,?,?,?,?)`);
      for (const e of entries) {
        ins.run(req.params.date, e.staff_id || null, e.staff_name || '', e.shift || '',
                parseFloat(e.hours_worked) || 0, parseFloat(e.share_pct) || 0, parseInt(e.payout, 10) || 0, e.notes || '');
      }
    })();
    res.json({ ok: true, count: entries.length });
  });
  router.post('/tip-pool/:id/pay', (req, res) => {
    const b = req.body || {};
    db.prepare(`UPDATE fnb_tip_pool_distributions SET paid_at = ?, paid_by = ? WHERE id = ?`)
      .run(Math.floor(Date.now()/1000), b.paid_by || 'manager', req.params.id);
    res.json({ ok: true });
  });

  // ── 8. MEMBERSHIP TIER ───────────────────────────────────────────────
  router.get('/membership-tiers', (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM fnb_membership_tiers ORDER BY sort_order, name`
      : `SELECT * FROM fnb_membership_tiers WHERE is_active = 1 ORDER BY sort_order, name`;
    res.json({ tiers: db.prepare(sql).all() });
  });
  router.post('/membership-tiers', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO fnb_membership_tiers
      (name, min_lifetime_spend, min_visits, points_multiplier, birthday_bonus_pct, free_delivery, priority_queue, perks_description, color, sort_order, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, parseInt(b.min_lifetime_spend, 10) || 0, parseInt(b.min_visits, 10) || 0,
           parseFloat(b.points_multiplier) || 1, parseFloat(b.birthday_bonus_pct) || 0,
           b.free_delivery ? 1 : 0, b.priority_queue ? 1 : 0,
           b.perks_description || '', b.color || '#6b7280', parseInt(b.sort_order, 10) || 0,
           b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/membership-tiers/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'min_lifetime_spend', 'min_visits', 'points_multiplier', 'birthday_bonus_pct',
                     'free_delivery', 'priority_queue', 'perks_description', 'color', 'sort_order', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['min_lifetime_spend', 'min_visits', 'sort_order'].includes(k)) args.push(parseInt(b[k], 10) || 0);
        else if (['points_multiplier', 'birthday_bonus_pct'].includes(k)) args.push(parseFloat(b[k]) || 0);
        else if (['free_delivery', 'priority_queue', 'is_active'].includes(k)) args.push(b[k] ? 1 : 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_membership_tiers SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/membership-tiers/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_membership_tiers WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── 9. BIRTHDAY CAMPAIGNS ────────────────────────────────────────────
  router.get('/birthday-campaigns', (req, res) => {
    res.json({ campaigns: db.prepare(`SELECT * FROM fnb_birthday_campaigns ORDER BY is_active DESC, name`).all() });
  });
  router.post('/birthday-campaigns', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO fnb_birthday_campaigns
      (name, campaign_type, discount_pct, voucher_code, freebie_item_name, valid_days_before, valid_days_after, min_purchase, applies_to_tier, description, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.campaign_type || 'discount', parseFloat(b.discount_pct) || 0,
           b.voucher_code || '', b.freebie_item_name || '',
           parseInt(b.valid_days_before, 10) || 7, parseInt(b.valid_days_after, 10) || 7,
           parseInt(b.min_purchase, 10) || 0, b.applies_to_tier || '',
           b.description || '', b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/birthday-campaigns/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'campaign_type', 'discount_pct', 'voucher_code', 'freebie_item_name',
                     'valid_days_before', 'valid_days_after', 'min_purchase', 'applies_to_tier', 'description', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['valid_days_before', 'valid_days_after', 'min_purchase'].includes(k)) args.push(parseInt(b[k], 10) || 0);
        else if (k === 'discount_pct') args.push(parseFloat(b[k]) || 0);
        else if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_birthday_campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/birthday-campaigns/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_birthday_campaigns WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  router.get('/birthday-campaigns/redemptions', (req, res) => {
    res.json({ redemptions: db.prepare(`SELECT r.*, c.name AS campaign_name FROM fnb_birthday_redemptions r LEFT JOIN fnb_birthday_campaigns c ON c.id = r.campaign_id ORDER BY r.redeemed_at DESC LIMIT 200`).all() });
  });

  // ── 10. REFERRAL ─────────────────────────────────────────────────────
  router.get('/referrals', (req, res) => {
    const where = []; const params = {};
    if (req.query.status)   { where.push('status = @status'); params.status = req.query.status; }
    if (req.query.referrer) { where.push('referrer_phone = @ref'); params.ref = req.query.referrer; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM fnb_referrals ${W} ORDER BY created_at DESC LIMIT 200`).all(params);
    const agg = db.prepare(`SELECT
      COUNT(*) total,
      COALESCE(SUM(CASE WHEN status='first_order' OR status='rewarded' THEN 1 ELSE 0 END),0) converted,
      COALESCE(SUM(reward_referrer_amount),0) referrer_payout,
      COALESCE(SUM(reward_referee_amount),0) referee_payout
      FROM fnb_referrals
    `).get();
    res.json({ referrals: rows, summary: agg });
  });
  router.post('/referrals', (req, res) => {
    const b = req.body || {};
    if (!b.referrer_phone) return res.status(400).json({ ok: false, error: 'referrer_phone wajib' });
    const code = 'REF-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    const info = db.prepare(`INSERT INTO fnb_referrals
      (referrer_phone, referrer_name, referrer_email, referral_code,
       reward_referrer_amount, reward_referee_amount, status)
      VALUES (?,?,?,?,?,?,?)`)
      .run(b.referrer_phone, b.referrer_name || '', b.referrer_email || '', code,
           parseInt(b.reward_referrer_amount, 10) || 25000,
           parseInt(b.reward_referee_amount, 10) || 25000,
           'pending');
    res.json({ ok: true, id: info.lastInsertRowid, referral_code: code });
  });
  router.patch('/referrals/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    const existing = db.prepare(`SELECT * FROM fnb_referrals WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' });
    for (const k of ['referee_phone', 'referee_name', 'status', 'reward_referrer_amount', 'reward_referee_amount']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['reward_referrer_amount', 'reward_referee_amount'].includes(k)) args.push(parseInt(b[k], 10) || 0);
        else args.push(b[k]);
      }
    }
    if (b.status) {
      const now = Math.floor(Date.now()/1000);
      if (b.status === 'registered' && !existing.registered_at)   { fields.push('registered_at = ?');   args.push(now); }
      if (b.status === 'first_order' && !existing.first_order_at) { fields.push('first_order_at = ?'); args.push(now); }
      if (b.status === 'rewarded') {
        if (!existing.reward_referrer_paid_at) { fields.push('reward_referrer_paid_at = ?'); args.push(now); }
        if (!existing.reward_referee_paid_at)  { fields.push('reward_referee_paid_at = ?'); args.push(now); }
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_referrals SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/referrals/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_referrals WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });
  // Lookup by code (for customer use during signup)
  router.get('/referrals/code/:code', (req, res) => {
    const r = db.prepare(`SELECT * FROM fnb_referrals WHERE referral_code = ?`).get(req.params.code);
    if (!r) return res.status(404).json({ ok: false, error: 'Invalid' });
    res.json({ ok: true, referral: r });
  });

  // ── 11. DELIVERY & DRIVERS ───────────────────────────────────────────
  // Drivers
  router.get('/drivers', (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM fnb_drivers ORDER BY is_active DESC, name`
      : `SELECT * FROM fnb_drivers WHERE is_active = 1 ORDER BY status, name`;
    res.json({ drivers: db.prepare(sql).all() });
  });
  router.post('/drivers', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO fnb_drivers (name, phone, vehicle_type, vehicle_plate, status, outlet, is_active) VALUES (?,?,?,?,?,?,?)`)
      .run(b.name, b.phone || '', b.vehicle_type || 'motor', b.vehicle_plate || '',
           b.status || 'available', b.outlet || '', b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/drivers/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'phone', 'vehicle_type', 'vehicle_plate', 'status', 'outlet', 'is_active', 'rating']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else if (k === 'rating') args.push(parseFloat(b[k]) || 5.0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_drivers SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/drivers/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_drivers WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Zones
  router.get('/delivery-zones', (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM fnb_delivery_zones ORDER BY is_active DESC, name`
      : `SELECT * FROM fnb_delivery_zones WHERE is_active = 1 ORDER BY name`;
    res.json({ zones: db.prepare(sql).all() });
  });
  router.post('/delivery-zones', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO fnb_delivery_zones
      (name, outlet, postal_codes, area_keywords, base_fee, per_km_fee, min_order, free_delivery_threshold, max_distance_km, estimated_minutes, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.outlet || '', b.postal_codes || '', b.area_keywords || '',
           parseInt(b.base_fee, 10) || 0, parseInt(b.per_km_fee, 10) || 0,
           parseInt(b.min_order, 10) || 0, b.free_delivery_threshold ? parseInt(b.free_delivery_threshold, 10) : null,
           parseFloat(b.max_distance_km) || 10, parseInt(b.estimated_minutes, 10) || 30,
           b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/delivery-zones/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'outlet', 'postal_codes', 'area_keywords', 'base_fee', 'per_km_fee',
                     'min_order', 'free_delivery_threshold', 'max_distance_km', 'estimated_minutes', 'is_active']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['base_fee', 'per_km_fee', 'min_order', 'free_delivery_threshold', 'estimated_minutes'].includes(k)) {
          args.push(b[k] == null || b[k] === '' ? null : parseInt(b[k], 10));
        } else if (k === 'max_distance_km') args.push(parseFloat(b[k]) || 0);
        else if (k === 'is_active') args.push(b[k] ? 1 : 0);
        else args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_delivery_zones SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/delivery-zones/:id', (req, res) => {
    db.prepare(`DELETE FROM fnb_delivery_zones WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Deliveries
  router.get('/deliveries', (req, res) => {
    const where = []; const params = {};
    if (req.query.status)    { where.push('d.status = @status');       params.status = req.query.status; }
    if (req.query.driver_id) { where.push('d.driver_id = @did');       params.did = parseInt(req.query.driver_id, 10); }
    if (req.query.from)      { where.push("date(d.created_at,'unixepoch','localtime') >= @from"); params.from = req.query.from; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT d.*, dr.name AS driver_name, dr.phone AS driver_phone, z.name AS zone_name
      FROM fnb_deliveries d
      LEFT JOIN fnb_drivers dr ON dr.id = d.driver_id
      LEFT JOIN fnb_delivery_zones z ON z.id = d.zone_id
      ${W} ORDER BY d.created_at DESC LIMIT 200
    `).all(params);
    res.json({ deliveries: rows });
  });
  router.post('/deliveries', (req, res) => {
    const b = req.body || {};
    if (!b.delivery_address) return res.status(400).json({ ok: false, error: 'delivery_address wajib' });
    const code = 'DEL-' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
    const info = db.prepare(`INSERT INTO fnb_deliveries
      (delivery_code, order_id, customer_name, customer_phone, delivery_address, zone_id, driver_id, delivery_fee, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(code, b.order_id || null, b.customer_name || '', b.customer_phone || '',
           b.delivery_address, b.zone_id || null, b.driver_id || null,
           parseInt(b.delivery_fee, 10) || 0, b.status || 'pending', b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid, delivery_code: code });
  });
  router.patch('/deliveries/:id', (req, res) => {
    const b = req.body || {};
    const existing = db.prepare(`SELECT * FROM fnb_deliveries WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' });
    const fields = []; const args = [];
    for (const k of ['driver_id', 'zone_id', 'status', 'delivery_fee', 'notes', 'failed_reason']) {
      if (k in b) {
        fields.push(`${k} = ?`);
        if (['driver_id', 'zone_id', 'delivery_fee'].includes(k)) args.push(b[k] == null || b[k] === '' ? null : parseInt(b[k], 10));
        else args.push(b[k]);
      }
    }
    if (b.status) {
      const now = Math.floor(Date.now()/1000);
      if (b.status === 'picked_up' && !existing.picked_up_at) { fields.push('picked_up_at = ?'); args.push(now); }
      if (b.status === 'delivered' && !existing.delivered_at) {
        fields.push('delivered_at = ?'); args.push(now);
        // Increment driver total_deliveries
        if (existing.driver_id) {
          db.prepare(`UPDATE fnb_drivers SET total_deliveries = total_deliveries + 1, status = 'available' WHERE id = ?`).run(existing.driver_id);
        }
      }
      // Auto-set driver status
      if (b.driver_id || existing.driver_id) {
        if (b.status === 'assigned' || b.status === 'picked_up' || b.status === 'on_the_way') {
          db.prepare(`UPDATE fnb_drivers SET status = 'on_delivery' WHERE id = ?`).run(b.driver_id || existing.driver_id);
        }
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_deliveries SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  // Calculate delivery fee from address keywords
  router.post('/deliveries/calc-fee', (req, res) => {
    const b = req.body || {};
    const addr = (b.address || '').toLowerCase();
    const zones = db.prepare(`SELECT * FROM fnb_delivery_zones WHERE is_active = 1`).all();
    let match = null;
    for (const z of zones) {
      const kws = (z.area_keywords || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (kws.some(k => addr.includes(k))) { match = z; break; }
    }
    if (!match) match = zones[zones.length - 1]; // fallback farthest zone
    const distance = parseFloat(b.distance_km) || 0;
    const fee = (match?.base_fee || 0) + Math.max(0, distance - 3) * (match?.per_km_fee || 0);
    res.json({ ok: true, zone: match, distance_km: distance, fee });
  });

  // ── 12. KDS MULTI-STATION ROUTING ───────────────────────────────────
  router.get('/kds-stations', (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM fnb_kds_stations ORDER BY sort_order, name`
      : `SELECT * FROM fnb_kds_stations WHERE is_active = 1 ORDER BY sort_order, name`;
    res.json({ stations: db.prepare(sql).all() });
  });
  router.post('/kds-stations', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, error: 'name wajib' });
    const info = db.prepare(`INSERT INTO fnb_kds_stations (name, icon, category_keywords, printer_name, sort_order, is_active) VALUES (?,?,?,?,?,?)`)
      .run(b.name, b.icon || '🍳', b.category_keywords || '', b.printer_name || '',
           parseInt(b.sort_order, 10) || 0, b.is_active === false ? 0 : 1);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.patch('/kds-stations/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    for (const k of ['name', 'icon', 'category_keywords', 'printer_name', 'sort_order', 'is_active']) {
      if (k in b) { fields.push(`${k} = ?`); args.push(k === 'is_active' ? (b[k] ? 1 : 0) : k === 'sort_order' ? parseInt(b[k], 10) || 0 : b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_kds_stations SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/kds-stations/:id', (req, res) => { db.prepare(`DELETE FROM fnb_kds_stations WHERE id = ?`).run(req.params.id); res.json({ ok: true }); });
  // Route an item — returns matching station based on category match
  router.get('/kds-route', (req, res) => {
    const cat = String(req.query.category || '').toLowerCase();
    const stations = db.prepare(`SELECT * FROM fnb_kds_stations WHERE is_active = 1 ORDER BY sort_order`).all();
    const matched = stations.find(s => (s.category_keywords || '').split(',').map(x => x.trim().toLowerCase()).some(k => k && cat.includes(k)));
    res.json({ station: matched || stations[0] || null });
  });

  // ── 13. WHATSAPP BUSINESS ────────────────────────────────────────────
  router.get('/wa-config', (req, res) => {
    const cfg = db.prepare(`SELECT * FROM fnb_wa_config ORDER BY id LIMIT 1`).get();
    if (cfg) cfg.api_key = cfg.api_key ? '••••' + cfg.api_key.slice(-4) : '';
    res.json({ config: cfg });
  });
  router.patch('/wa-config', (req, res) => {
    const b = req.body || {};
    const cur = db.prepare(`SELECT * FROM fnb_wa_config ORDER BY id LIMIT 1`).get();
    if (!cur) { db.prepare(`INSERT INTO fnb_wa_config (provider, is_enabled) VALUES (?, ?)`).run(b.provider || 'fonnte', b.is_enabled ? 1 : 0); }
    const fields = []; const args = [];
    for (const k of ['provider', 'api_key', 'sender_number', 'business_account_id', 'webhook_token', 'is_enabled', 'notes']) {
      if (k in b && b[k] !== '••••') {
        fields.push(`${k} = ?`);
        args.push(k === 'is_enabled' ? (b[k] ? 1 : 0) : b[k]);
      }
    }
    fields.push('updated_at = ?'); args.push(Math.floor(Date.now()/1000));
    const id = cur?.id || db.prepare(`SELECT id FROM fnb_wa_config ORDER BY id LIMIT 1`).get().id;
    db.prepare(`UPDATE fnb_wa_config SET ${fields.join(', ')} WHERE id = ?`).run(...args, id);
    res.json({ ok: true });
  });
  router.post('/wa-send', async (req, res) => {
    const b = req.body || {};
    if (!b.recipient_phone || !b.message) return res.status(400).json({ ok: false, error: 'recipient_phone + message wajib' });
    const cfg = db.prepare(`SELECT * FROM fnb_wa_config ORDER BY id LIMIT 1`).get();
    const enabled = cfg?.is_enabled && cfg?.api_key && cfg?.sender_number;
    const info = db.prepare(`INSERT INTO fnb_wa_messages (recipient_phone, recipient_name, template_name, message, status) VALUES (?,?,?,?,?)`)
      .run(b.recipient_phone, b.recipient_name || '', b.template_name || '', b.message, enabled ? 'queued' : 'failed');
    if (!enabled) {
      db.prepare(`UPDATE fnb_wa_messages SET error = ?, status = 'failed' WHERE id = ?`)
        .run('WA integration belum di-enable di config', info.lastInsertRowid);
      return res.json({ ok: false, id: info.lastInsertRowid, error: 'WA integration belum di-enable' });
    }
    // Stub: simulate sending. Production: hit provider API (Fonnte/Wati/Twilio/Meta Cloud).
    db.prepare(`UPDATE fnb_wa_messages SET status = 'sent', sent_at = ?, provider_msg_id = ? WHERE id = ?`)
      .run(Math.floor(Date.now()/1000), 'stub-' + info.lastInsertRowid, info.lastInsertRowid);
    res.json({ ok: true, id: info.lastInsertRowid, simulated: true });
  });
  router.get('/wa-messages', (req, res) => {
    const where = []; const params = {};
    if (req.query.status) { where.push('status = @status'); params.status = req.query.status; }
    if (req.query.phone)  { where.push('recipient_phone = @phone'); params.phone = req.query.phone; }
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM fnb_wa_messages ${W} ORDER BY created_at DESC LIMIT 200`).all(params);
    const agg = db.prepare(`SELECT COUNT(*) total,
      COALESCE(SUM(CASE WHEN status='sent' OR status='delivered' OR status='read' THEN 1 ELSE 0 END),0) sent,
      COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) failed FROM fnb_wa_messages`).get();
    res.json({ messages: rows, summary: agg });
  });

  // ── 14. BANK AUTO-RECON ──────────────────────────────────────────────
  router.get('/bank-transactions', (req, res) => {
    const where = []; const params = {};
    if (req.query.from) { where.push('txn_date >= @from'); params.from = req.query.from; }
    if (req.query.to)   { where.push('txn_date <= @to');   params.to = req.query.to; }
    if (req.query.status === 'unmatched') where.push('matched_settlement_id IS NULL');
    if (req.query.status === 'matched')   where.push('matched_settlement_id IS NOT NULL');
    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM fnb_bank_transactions ${W} ORDER BY txn_date DESC, id DESC LIMIT 500`).all(params);
    const agg = db.prepare(`SELECT
      COUNT(*) total,
      COALESCE(SUM(CASE WHEN matched_settlement_id IS NULL THEN 1 ELSE 0 END),0) unmatched,
      COALESCE(SUM(CASE WHEN matched_settlement_id IS NOT NULL THEN 1 ELSE 0 END),0) matched,
      COALESCE(SUM(amount),0) total_amount
      FROM fnb_bank_transactions ${W}`).get(params);
    res.json({ transactions: rows, summary: agg });
  });
  router.post('/bank-transactions/import', (req, res) => {
    const b = req.body || {};
    const rows = Array.isArray(b.rows) ? b.rows : [];
    if (!rows.length) return res.status(400).json({ ok: false, error: 'rows wajib' });
    const ins = db.prepare(`INSERT INTO fnb_bank_transactions (txn_date, amount, description, reference_no, bank_name, account_number) VALUES (?,?,?,?,?,?)`);
    let imported = 0;
    db.transaction(() => {
      for (const r of rows) {
        if (!r.txn_date || r.amount == null) continue;
        ins.run(r.txn_date, parseInt(r.amount, 10), r.description || '', r.reference_no || '', r.bank_name || b.bank_name || '', r.account_number || b.account_number || '');
        imported++;
      }
    })();
    res.json({ ok: true, imported });
  });
  router.post('/bank-transactions/:id/match', (req, res) => {
    const b = req.body || {};
    const now = Math.floor(Date.now()/1000);
    db.prepare(`UPDATE fnb_bank_transactions SET matched_settlement_id = ?, matched_at = ?, match_confidence = ?, notes = ? WHERE id = ?`)
      .run(b.settlement_id || null, now, parseFloat(b.confidence) || 1.0, b.notes || '', req.params.id);
    res.json({ ok: true });
  });
  router.post('/bank-transactions/:id/unmatch', (req, res) => {
    db.prepare(`UPDATE fnb_bank_transactions SET matched_settlement_id = NULL, matched_at = NULL, match_confidence = NULL WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ── 15. ORDER TRANSFER ──────────────────────────────────────────────
  router.post('/order-transfers', (req, res) => {
    const b = req.body || {};
    if (!b.order_id || !b.to_table) return res.status(400).json({ ok: false, error: 'order_id + to_table wajib' });
    const info = db.prepare(`INSERT INTO fnb_order_transfers (order_id, order_ref, from_table, to_table, transferred_by, reason, notes) VALUES (?,?,?,?,?,?,?)`)
      .run(parseInt(b.order_id, 10), b.order_ref || '', b.from_table || '', b.to_table, b.transferred_by || 'manager', b.reason || '', b.notes || '');
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.get('/order-transfers', (req, res) => {
    const rows = db.prepare(`SELECT * FROM fnb_order_transfers ORDER BY created_at DESC LIMIT 200`).all();
    res.json({ transfers: rows });
  });

  // ── 16. BILL SPLIT ───────────────────────────────────────────────────
  router.post('/bill-splits', (req, res) => {
    const b = req.body || {};
    if (!b.parent_order_id) return res.status(400).json({ ok: false, error: 'parent_order_id wajib' });
    const splits = Array.isArray(b.splits) ? b.splits : [];
    const ins = db.prepare(`INSERT INTO fnb_bill_splits (parent_order_id, parent_order_ref, split_label, items_json, subtotal, payment_method, payment_status) VALUES (?,?,?,?,?,?,?)`);
    const ids = [];
    db.transaction(() => {
      for (const s of splits) {
        const info = ins.run(parseInt(b.parent_order_id, 10), b.parent_order_ref || '',
          s.label || '', JSON.stringify(s.items || []), parseInt(s.subtotal, 10) || 0,
          s.payment_method || '', s.payment_status || 'pending');
        ids.push(info.lastInsertRowid);
      }
    })();
    res.json({ ok: true, ids, count: ids.length });
  });
  router.get('/bill-splits/:orderId', (req, res) => {
    const rows = db.prepare(`SELECT * FROM fnb_bill_splits WHERE parent_order_id = ? ORDER BY id`).all(req.params.orderId);
    for (const r of rows) { try { r.items = JSON.parse(r.items_json || '[]'); } catch { r.items = []; } }
    res.json({ splits: rows });
  });
  router.patch('/bill-splits/:id', (req, res) => {
    const b = req.body || {};
    const fields = []; const args = [];
    if (b.payment_status) { fields.push('payment_status = ?'); args.push(b.payment_status); if (b.payment_status === 'paid') { fields.push('paid_at = ?'); args.push(Math.floor(Date.now()/1000)); } }
    if (b.payment_method) { fields.push('payment_method = ?'); args.push(b.payment_method); }
    if (b.paid_by) { fields.push('paid_by = ?'); args.push(b.paid_by); }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE fnb_bill_splits SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });
  router.delete('/bill-splits/:id', (req, res) => { db.prepare(`DELETE FROM fnb_bill_splits WHERE id = ?`).run(req.params.id); res.json({ ok: true }); });

  // ── 17. DRIVER TRACKING (realtime location) ─────────────────────────
  router.post('/drivers/:id/ping', (req, res) => {
    const b = req.body || {};
    const lat = parseFloat(b.lat); const lng = parseFloat(b.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ ok: false, error: 'lat + lng wajib' });
    const now = Math.floor(Date.now()/1000);
    db.prepare(`UPDATE fnb_drivers SET last_lat = ?, last_lng = ?, last_ping_at = ? WHERE id = ?`).run(lat, lng, now, req.params.id);
    res.json({ ok: true, last_ping_at: now });
  });
  router.get('/drivers/live', (req, res) => {
    const drivers = db.prepare(`SELECT id, name, phone, vehicle_type, vehicle_plate, status, last_lat, last_lng, last_ping_at, outlet FROM fnb_drivers WHERE is_active = 1`).all();
    const now = Math.floor(Date.now()/1000);
    for (const d of drivers) {
      d.ping_age_sec = d.last_ping_at ? (now - d.last_ping_at) : null;
      d.is_online    = d.ping_age_sec != null && d.ping_age_sec < 120;
    }
    res.json({ drivers, now });
  });

  // ── 18. MENU ENGINEERING MATRIX ─────────────────────────────────────
  // Classifies menu items by popularity (% of avg sales) × profitability
  // (food cost margin). 4 quadrants:
  //   Star      — high pop + high profit (push these)
  //   Plowhorse — high pop + low profit  (rework pricing/cost)
  //   Puzzle    — low pop + high profit  (promote/relocate)
  //   Dog       — low pop + low profit   (consider removing)
  router.get('/analytics/menu-engineering', (req, res) => {
    const from = req.query.from || new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);
    // Best-effort query — assume an `orders` table with items_json or an
    // `order_items` table. We try the most common shape and fall back.
    let items = [];
    try {
      items = db.prepare(`
        SELECT
          mi.id AS menu_item_id, mi.name AS title,
          COALESCE(mi.category, '—') AS category,
          COALESCE(mi.price, 0) AS price,
          COALESCE(mi.food_cost, 0) AS food_cost,
          COALESCE((SELECT SUM(oi.qty) FROM order_items oi WHERE oi.menu_item_id = mi.id
            AND date(oi.created_at,'unixepoch','localtime') BETWEEN ? AND ?), 0) AS qty_sold,
          COALESCE((SELECT SUM(oi.qty * oi.price) FROM order_items oi WHERE oi.menu_item_id = mi.id
            AND date(oi.created_at,'unixepoch','localtime') BETWEEN ? AND ?), 0) AS revenue
        FROM menu_items mi
      `).all(from, to, from, to);
    } catch (e) { /* table not found — produce empty matrix gracefully */ }
    const totalQty = items.reduce((a, r) => a + (r.qty_sold || 0), 0);
    const avgQty   = items.length ? totalQty / items.length : 0;
    const rows = items.map(r => {
      const margin = r.price > 0 ? (r.price - (r.food_cost || 0)) / r.price * 100 : 0;
      const popularity = avgQty > 0 ? (r.qty_sold || 0) / avgQty : 0;
      const highPop  = popularity >= 1;
      const highProf = margin >= 65;
      const quadrant = highPop && highProf ? 'star' : highPop && !highProf ? 'plowhorse'
                      : !highPop && highProf ? 'puzzle' : 'sleeper';
      return { ...r, margin_pct: +margin.toFixed(2), popularity_ratio: +popularity.toFixed(2), quadrant };
    }).sort((a, b) => b.revenue - a.revenue);
    const summary = {
      total_items: rows.length, avg_qty: +avgQty.toFixed(2),
      star:      rows.filter(r => r.quadrant === 'star').length,
      plowhorse: rows.filter(r => r.quadrant === 'plowhorse').length,
      puzzle:    rows.filter(r => r.quadrant === 'puzzle').length,
      sleeper:   rows.filter(r => r.quadrant === 'sleeper').length,
    };
    res.json({ from, to, summary, rows });
  });

  // Mount
  const mountPath = opts.mountPath || '/api/fnb';
  app.use(mountPath, router);
  console.log(`[fnb-features] mounted at ${mountPath} — 11 modules (recipes, combos, periods, dietary, happy-hour, reservations, tips, tiers, birthday, referral, delivery)`);

  return { router, db };
}

module.exports = { setupFnbFeatures };
