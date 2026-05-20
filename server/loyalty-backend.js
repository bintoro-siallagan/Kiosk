// server/loyalty-backend.js
// Loyalty Program — tier-based dengan earn multiplier, rewards catalog, expiry.
//
// Tier structure default (auto-seed):
//   BRONZE   — < Rp 500rb lifetime, earn 1.0x
//   SILVER   — Rp 500rb+, earn 1.25x
//   GOLD     — Rp 2jt+, earn 1.5x
//   PLATINUM — Rp 10jt+, earn 2.0x
//
// Earn rule:
//   Base: 1 point per Rp 10rb belanja (configurable via POINT_PER_AMOUNT)
//   Final = base × tier.earn_multiplier
//   Value redemption: 1 point = Rp 100 (configurable POINT_VALUE_IDR)
//
// Auto: tier upgrade saat lifetime_spend lewat threshold
// Auto: log ke pos_events buat audit + notifications buat tier-up

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const { toCsv } = require('./csv-util');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_lifetime_spend REAL DEFAULT 0,
  min_visits INTEGER DEFAULT 0,
  earn_multiplier REAL DEFAULT 1.0,
  color TEXT,
  emoji TEXT,
  sort_order INTEGER DEFAULT 0,
  benefits TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS loyalty_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  birthday TEXT,
  current_tier_code TEXT DEFAULT 'bronze',
  current_points INTEGER DEFAULT 0,
  lifetime_points INTEGER DEFAULT 0,
  lifetime_spend REAL DEFAULT 0,
  total_visits INTEGER DEFAULT 0,
  last_visit_at INTEGER,
  referral_code TEXT UNIQUE,
  referred_by INTEGER,
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  FOREIGN KEY (current_tier_code) REFERENCES loyalty_tiers(code),
  FOREIGN KEY (referred_by) REFERENCES loyalty_customers(id)
);
CREATE INDEX IF NOT EXISTS idx_cust_tier ON loyalty_customers(current_tier_code);
CREATE INDEX IF NOT EXISTS idx_cust_phone ON loyalty_customers(phone);
CREATE INDEX IF NOT EXISTS idx_cust_referral ON loyalty_customers(referral_code);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earn','redeem','expire','adjust','bonus','referral','tier_upgrade')),
  points INTEGER NOT NULL,
  balance_after INTEGER,
  ref_order_id TEXT,
  ref_redemption_id INTEGER,
  description TEXT,
  expires_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY (customer_id) REFERENCES loyalty_customers(id)
);
CREATE INDEX IF NOT EXISTS idx_tx_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_tx_created ON loyalty_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_tx_expires ON loyalty_transactions(expires_at);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT,
  cost_points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash_discount','free_item','voucher','tier_upgrade')),
  value_amount REAL,
  free_menu_id TEXT,
  min_tier_code TEXT DEFAULT 'bronze',
  max_redemptions_per_customer INTEGER,
  total_stock INTEGER,
  remaining_stock INTEGER,
  is_active INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  start_date INTEGER,
  end_date INTEGER,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  reward_id INTEGER NOT NULL,
  points_spent INTEGER NOT NULL,
  applied_to_order_ref TEXT,
  value_applied REAL,
  status TEXT NOT NULL DEFAULT 'used' CHECK (status IN ('used','voided','expired')),
  voided_at INTEGER,
  voided_by TEXT,
  void_reason TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY (customer_id) REFERENCES loyalty_customers(id),
  FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(id)
);
CREATE INDEX IF NOT EXISTS idx_red_customer ON loyalty_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_red_order ON loyalty_redemptions(applied_to_order_ref);
`;

const DEFAULT_TIERS = [
  { code: 'bronze',   name: 'Bronze',   min_lifetime_spend: 0,        earn_multiplier: 1.0,  color: '#92400e', emoji: '🥉', sort_order: 1, benefits: JSON.stringify({ description: 'Tier awal — semua customer mulai di sini' }) },
  { code: 'silver',   name: 'Silver',   min_lifetime_spend: 500000,   earn_multiplier: 1.25, color: '#9ca3af', emoji: '🥈', sort_order: 2, benefits: JSON.stringify({ description: '1.25x poin earn', perks: ['Birthday bonus 100 poin'] }) },
  { code: 'gold',     name: 'Gold',     min_lifetime_spend: 2000000,  earn_multiplier: 1.5,  color: '#eab308', emoji: '🥇', sort_order: 3, benefits: JSON.stringify({ description: '1.5x poin earn', perks: ['Birthday bonus 250 poin', 'Free upsize tiap minggu'] }) },
  { code: 'platinum', name: 'Platinum', min_lifetime_spend: 10000000, earn_multiplier: 2.0,  color: '#a78bfa', emoji: '💎', sort_order: 4, benefits: JSON.stringify({ description: '2x poin earn', perks: ['Birthday bonus 500 poin', 'Exclusive new menu', 'VIP fast lane'] }) },
];

const DEFAULT_REWARDS = [
  { name: 'Diskon Rp 5.000',  description: 'Potongan langsung Rp 5.000', emoji: '💸', cost_points: 50,  type: 'cash_discount', value_amount: 5000,  min_tier_code: 'bronze', display_order: 1 },
  { name: 'Diskon Rp 15.000', description: 'Potongan langsung Rp 15.000', emoji: '💸', cost_points: 150, type: 'cash_discount', value_amount: 15000, min_tier_code: 'bronze', display_order: 2 },
  { name: 'Diskon Rp 30.000', description: 'Potongan langsung Rp 30.000', emoji: '💎', cost_points: 300, type: 'cash_discount', value_amount: 30000, min_tier_code: 'silver', display_order: 3 },
  { name: 'Voucher Rp 50.000',description: 'Voucher Rp 50.000 (sekali pakai)', emoji: '🎫', cost_points: 500, type: 'voucher', value_amount: 50000, min_tier_code: 'gold', display_order: 4 },
];

const DEFAULT_CONFIG = {
  point_per_amount: 10000,       // 1 poin per Rp 10rb belanja
  point_value_idr: 100,          // 1 poin = Rp 100 saat redeem (untuk cash_discount)
  point_expiry_months: 12,       // poin expire 12 bulan setelah earn
  signup_bonus: 0,               // bonus poin saat daftar
  birthday_bonus_base: 100,      // bonus base saat ultah (tier multiplier applied)
  referral_bonus_referrer: 100,  // poin buat yang ngajak
  referral_bonus_referred: 50,   // poin buat yang baru gabung
};

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

function generateReferralCode(phone) {
  // 6 char code from phone hash
  const h = require('crypto').createHash('md5').update(phone + 'karya').digest('hex');
  return h.slice(0, 6).toUpperCase();
}

// ============================================================
// SETUP
// ============================================================
function setupLoyalty(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed tiers + rewards
  const tierCount = db.prepare(`SELECT COUNT(*) c FROM loyalty_tiers`).get().c;
  if (tierCount === 0) {
    const s = db.prepare(`INSERT INTO loyalty_tiers (code, name, min_lifetime_spend, earn_multiplier, color, emoji, sort_order, benefits) VALUES (?,?,?,?,?,?,?,?)`);
    for (const t of DEFAULT_TIERS) s.run(t.code, t.name, t.min_lifetime_spend, t.earn_multiplier, t.color, t.emoji, t.sort_order, t.benefits);
  }
  const rewardCount = db.prepare(`SELECT COUNT(*) c FROM loyalty_rewards`).get().c;
  if (rewardCount === 0) {
    const s = db.prepare(`INSERT INTO loyalty_rewards (name, description, emoji, cost_points, type, value_amount, min_tier_code, display_order) VALUES (?,?,?,?,?,?,?,?)`);
    for (const r of DEFAULT_REWARDS) s.run(r.name, r.description, r.emoji, r.cost_points, r.type, r.value_amount, r.min_tier_code, r.display_order);
  }

  // Load config from pos_config (fallback to defaults)
  function loadConfig() {
    const cfg = { ...DEFAULT_CONFIG };
    try {
      const rows = db.prepare(`SELECT key, value FROM pos_config WHERE key LIKE 'LOYALTY_%' OR key='POINT_VALUE_IDR' OR key='POINT_PER_AMOUNT'`).all();
      for (const r of rows) {
        const k = r.key.replace(/^LOYALTY_/, '').toLowerCase();
        cfg[k] = isNaN(Number(r.value)) ? r.value : Number(r.value);
      }
    } catch {}
    return cfg;
  }

  const logEvent = (e) => {
    try { if (typeof global.logPosEvent === 'function') global.logPosEvent(e); } catch {}
  };
  const dispatchNotif = async (n) => {
    try { if (typeof global.dispatchNotification === 'function') await global.dispatchNotification(n); } catch {}
  };
  const broadcast = (ev, payload) => {
    try { if (typeof global.broadcastPosEvent === 'function') global.broadcastPosEvent(ev, payload); } catch {}
  };

  // Compute tier based on lifetime_spend
  function computeTier(lifetimeSpend) {
    const tiers = db.prepare(`SELECT * FROM loyalty_tiers ORDER BY min_lifetime_spend DESC`).all();
    for (const t of tiers) {
      if (lifetimeSpend >= (t.min_lifetime_spend || 0)) return t;
    }
    return tiers[tiers.length - 1]; // fallback to lowest tier
  }

  function getCustomerById(id) {
    const c = db.prepare(`SELECT * FROM loyalty_customers WHERE id = ?`).get(id);
    if (!c) return null;
    const tier = db.prepare(`SELECT * FROM loyalty_tiers WHERE code = ?`).get(c.current_tier_code);
    return { ...c, tier };
  }

  function getCustomerByPhone(phone) {
    const c = db.prepare(`SELECT * FROM loyalty_customers WHERE phone = ?`).get(phone);
    if (!c) return null;
    const tier = db.prepare(`SELECT * FROM loyalty_tiers WHERE code = ?`).get(c.current_tier_code);
    return { ...c, tier };
  }

  // ============================================================
  // CORE: EARN points
  // ============================================================
  function earn(opts) {
    const { customer_id, order_total, order_ref, created_by } = opts;
    const c = db.prepare(`SELECT * FROM loyalty_customers WHERE id = ?`).get(customer_id);
    if (!c) throw new Error('customer not found');

    const cfg = loadConfig();
    const tier = db.prepare(`SELECT * FROM loyalty_tiers WHERE code = ?`).get(c.current_tier_code);
    const multiplier = tier?.earn_multiplier || 1.0;
    const basePoints = Math.floor(Number(order_total) / cfg.point_per_amount);
    const finalPoints = Math.floor(basePoints * multiplier);

    if (finalPoints <= 0) return { ok: false, reason: 'amount below threshold', points: 0 };

    const expiresAt = nowSec() + (cfg.point_expiry_months * 30 * 86400);
    const newCurrent = c.current_points + finalPoints;
    const newLifetimePoints = c.lifetime_points + finalPoints;
    const newLifetimeSpend = c.lifetime_spend + Number(order_total);
    const newVisits = c.total_visits + 1;

    const tx = db.transaction(() => {
      db.prepare(`UPDATE loyalty_customers SET
        current_points = ?, lifetime_points = ?, lifetime_spend = ?,
        total_visits = ?, last_visit_at = ?, updated_at = ?
        WHERE id = ?`)
        .run(newCurrent, newLifetimePoints, newLifetimeSpend, newVisits, nowSec(), nowSec(), customer_id);

      db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, ref_order_id, description, expires_at, created_by)
        VALUES (?, 'earn', ?, ?, ?, ?, ?, ?)`)
        .run(customer_id, finalPoints, newCurrent, order_ref || null,
          `Earn ${basePoints} × ${multiplier} (${tier?.name || 'Bronze'})`, expiresAt, created_by || null);

      // Auto tier upgrade
      const newTier = computeTier(newLifetimeSpend);
      if (newTier.code !== c.current_tier_code) {
        const oldOrder = tier?.sort_order || 0;
        const newOrder = newTier.sort_order || 0;
        if (newOrder > oldOrder) {
          db.prepare(`UPDATE loyalty_customers SET current_tier_code = ?, updated_at = ? WHERE id = ?`)
            .run(newTier.code, nowSec(), customer_id);
          db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, description, created_by)
            VALUES (?, 'tier_upgrade', 0, ?, ?, ?)`)
            .run(customer_id, newCurrent, `Upgrade ${c.current_tier_code} → ${newTier.code}`, created_by || 'system');

          logEvent({
            event_type: 'loyalty_tier_upgrade',
            payload: { customer_id, phone: c.phone, from: c.current_tier_code, to: newTier.code, lifetime_spend: newLifetimeSpend },
            order_ref, actor: created_by, severity: 'info'
          });
          dispatchNotif({
            event_type: 'loyalty_tier_upgrade', severity: 'info',
            title: `🎉 ${c.name || c.phone} naik ke tier ${newTier.name}!`,
            body: `Total belanja: Rp ${Math.round(newLifetimeSpend).toLocaleString('id-ID')}\nNew multiplier: ${newTier.earn_multiplier}x`,
            payload: { customer_id, new_tier: newTier.code }
          }).catch(() => {});
        }
      }
    });
    tx();

    broadcast('loyalty:earn', { customer_id, points: finalPoints, balance: newCurrent });
    logEvent({
      event_type: 'loyalty_earn',
      payload: { customer_id, points: finalPoints, multiplier, order_total, balance: newCurrent },
      order_ref, actor: created_by, severity: 'info'
    });

    return { ok: true, points_earned: finalPoints, base_points: basePoints, multiplier, new_balance: newCurrent };
  }

  // ============================================================
  // CORE: REDEEM reward
  // ============================================================
  function redeem(opts) {
    const { customer_id, reward_id, order_ref, created_by } = opts;
    const c = db.prepare(`SELECT * FROM loyalty_customers WHERE id = ?`).get(customer_id);
    if (!c) throw new Error('customer not found');
    const r = db.prepare(`SELECT * FROM loyalty_rewards WHERE id = ? AND is_active = 1`).get(reward_id);
    if (!r) throw new Error('reward not found or inactive');

    // Validations
    if (c.current_points < r.cost_points) throw new Error(`Poin gak cukup: ${c.current_points} < ${r.cost_points}`);

    const customerTier = db.prepare(`SELECT * FROM loyalty_tiers WHERE code = ?`).get(c.current_tier_code);
    const minTier = db.prepare(`SELECT * FROM loyalty_tiers WHERE code = ?`).get(r.min_tier_code);
    if (minTier && (customerTier?.sort_order || 0) < (minTier?.sort_order || 0)) {
      throw new Error(`Reward khusus tier ${minTier.name} ke atas`);
    }

    if (r.end_date && nowSec() > r.end_date) throw new Error('Reward expired');
    if (r.remaining_stock !== null && r.remaining_stock <= 0) throw new Error('Reward stock habis');

    if (r.max_redemptions_per_customer) {
      const used = db.prepare(`SELECT COUNT(*) c FROM loyalty_redemptions WHERE customer_id = ? AND reward_id = ? AND status = 'used'`)
        .get(customer_id, reward_id).c;
      if (used >= r.max_redemptions_per_customer) throw new Error(`Sudah mencapai limit redemption (${r.max_redemptions_per_customer}x)`);
    }

    const newBalance = c.current_points - r.cost_points;
    let redemptionId;

    const tx = db.transaction(() => {
      const info = db.prepare(`INSERT INTO loyalty_redemptions (customer_id, reward_id, points_spent, applied_to_order_ref, value_applied, status, created_by)
        VALUES (?,?,?,?,?, 'used', ?)`)
        .run(customer_id, reward_id, r.cost_points, order_ref || null, r.value_amount || 0, created_by || null);
      redemptionId = info.lastInsertRowid;

      db.prepare(`UPDATE loyalty_customers SET current_points = ?, updated_at = ? WHERE id = ?`)
        .run(newBalance, nowSec(), customer_id);

      db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, ref_order_id, ref_redemption_id, description, created_by)
        VALUES (?, 'redeem', ?, ?, ?, ?, ?, ?)`)
        .run(customer_id, -r.cost_points, newBalance, order_ref || null, redemptionId,
          `Redeem: ${r.name}`, created_by || null);

      if (r.remaining_stock !== null) {
        db.prepare(`UPDATE loyalty_rewards SET remaining_stock = remaining_stock - 1 WHERE id = ?`).run(reward_id);
      }
    });
    tx();

    broadcast('loyalty:redeem', { customer_id, reward_id, redemption_id: redemptionId });
    logEvent({
      event_type: 'loyalty_redeem',
      payload: { customer_id, reward_id, reward_name: r.name, points_spent: r.cost_points, value: r.value_amount, balance: newBalance },
      order_ref, actor: created_by, severity: 'info'
    });

    return { ok: true, redemption_id: redemptionId, points_spent: r.cost_points, new_balance: newBalance, reward: r };
  }

  // ============================================================
  // ROUTER
  // ============================================================
  const router = express.Router();
  router.use(express.json());

  // CUSTOMER CRUD
  router.get('/customers', (req, res) => {
    const { search, tier, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT c.*, t.name as tier_name, t.color as tier_color, t.emoji as tier_emoji FROM loyalty_customers c LEFT JOIN loyalty_tiers t ON t.code = c.current_tier_code WHERE c.is_active = 1`;
    const params = [];
    if (search) {
      sql += ' AND (c.phone LIKE ? OR c.name LIKE ? OR c.email LIKE ?)';
      const s = `%${search}%`; params.push(s, s, s);
    }
    if (tier) { sql += ' AND c.current_tier_code = ?'; params.push(tier); }
    sql += ' ORDER BY c.lifetime_spend DESC LIMIT ? OFFSET ?'; params.push(Number(limit), Number(offset));
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/customers/by-phone/:phone', (req, res) => {
    const c = getCustomerByPhone(req.params.phone);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json(c);
  });

  router.get('/customers/:id', (req, res) => {
    const c = getCustomerById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });
    res.json(c);
  });

  router.post('/customers', (req, res) => {
    const { phone, name, email, birthday, referral_code_used } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const cfg = loadConfig();
    const refCode = generateReferralCode(phone);
    let referredById = null;
    let signupBonus = cfg.signup_bonus || 0;

    if (referral_code_used) {
      const referrer = db.prepare(`SELECT * FROM loyalty_customers WHERE referral_code = ?`).get(referral_code_used);
      if (referrer) {
        referredById = referrer.id;
        signupBonus += cfg.referral_bonus_referred || 0;
      }
    }

    try {
      const tx = db.transaction(() => {
        const info = db.prepare(`INSERT INTO loyalty_customers (phone, name, email, birthday, referral_code, referred_by, current_points)
          VALUES (?,?,?,?,?,?,?)`)
          .run(phone, name || null, email || null, birthday || null, refCode, referredById, signupBonus);
        const newId = info.lastInsertRowid;

        if (signupBonus > 0) {
          db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, description)
            VALUES (?, 'bonus', ?, ?, ?)`)
            .run(newId, signupBonus, signupBonus,
              referredById ? `Signup bonus + referral` : 'Signup bonus');
        }

        // Reward referrer
        if (referredById && cfg.referral_bonus_referrer > 0) {
          const ref = db.prepare(`SELECT current_points FROM loyalty_customers WHERE id = ?`).get(referredById);
          const newRefBalance = (ref?.current_points || 0) + cfg.referral_bonus_referrer;
          db.prepare(`UPDATE loyalty_customers SET current_points = ? WHERE id = ?`).run(newRefBalance, referredById);
          db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, description)
            VALUES (?, 'referral', ?, ?, ?)`)
            .run(referredById, cfg.referral_bonus_referrer, newRefBalance, `Referral bonus: invited ${phone}`);
        }

        return newId;
      });
      const id = tx();
      res.json({ ok: true, id, referral_code: refCode });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'phone already registered' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/customers/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name', 'email', 'birthday', 'notes', 'is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push('updated_at = ?'); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE loyalty_customers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.get('/customers/:id/transactions', (req, res) => {
    const rows = db.prepare(`SELECT * FROM loyalty_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100`).all(req.params.id);
    res.json(rows);
  });

  router.get('/customers/:id/available-rewards', (req, res) => {
    const c = getCustomerById(req.params.id);
    if (!c) return res.status(404).json({ error: 'not found' });

    const tier = c.tier;
    const rewards = db.prepare(`SELECT r.*, t.sort_order as tier_sort FROM loyalty_rewards r LEFT JOIN loyalty_tiers t ON t.code = r.min_tier_code
      WHERE r.is_active = 1 AND (r.start_date IS NULL OR r.start_date <= ?) AND (r.end_date IS NULL OR r.end_date > ?)
      AND (r.total_stock IS NULL OR r.remaining_stock > 0)
      ORDER BY r.display_order, r.cost_points`).all(nowSec(), nowSec());

    const enriched = rewards.map(r => ({
      ...r,
      eligible: (tier?.sort_order || 0) >= (r.tier_sort || 0),
      affordable: c.current_points >= r.cost_points,
    }));

    res.json(enriched);
  });

  // EARN / REDEEM / ADJUST
  router.post('/earn', (req, res) => {
    try { res.json(earn(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/redeem', (req, res) => {
    try { res.json(redeem(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.post('/adjust', (req, res) => {
    const { customer_id, points, description, created_by } = req.body || {};
    if (!customer_id || !points || !description) return res.status(400).json({ error: 'customer_id + points + description required' });

    const c = db.prepare(`SELECT * FROM loyalty_customers WHERE id = ?`).get(customer_id);
    if (!c) return res.status(404).json({ error: 'customer not found' });

    const newBalance = c.current_points + Number(points);
    if (newBalance < 0) return res.status(400).json({ error: 'cannot result in negative balance' });

    const tx = db.transaction(() => {
      db.prepare(`UPDATE loyalty_customers SET current_points = ?, updated_at = ? WHERE id = ?`).run(newBalance, nowSec(), customer_id);
      db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, description, created_by)
        VALUES (?, 'adjust', ?, ?, ?, ?)`)
        .run(customer_id, Number(points), newBalance, description, created_by || null);
    });
    tx();

    logEvent({
      event_type: 'loyalty_adjust',
      payload: { customer_id, points, description, new_balance: newBalance },
      actor: created_by, severity: 'warning'  // adjust = manual override, worth flag
    });

    res.json({ ok: true, new_balance: newBalance });
  });

  // TIERS
  router.get('/tiers', (req, res) => {
    res.json(db.prepare(`SELECT * FROM loyalty_tiers ORDER BY sort_order`).all().map(t => ({ ...t, benefits: safeJson(t.benefits) })));
  });

  router.put('/tiers/:code', (req, res) => {
    const b = req.body || {};
    const allowed = ['name', 'min_lifetime_spend', 'min_visits', 'earn_multiplier', 'color', 'emoji', 'sort_order'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    if (b.benefits !== undefined) { sets.push('benefits = ?'); params.push(typeof b.benefits === 'object' ? JSON.stringify(b.benefits) : b.benefits); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.code);
    db.prepare(`UPDATE loyalty_tiers SET ${sets.join(', ')} WHERE code = ?`).run(...params);
    res.json({ ok: true });
  });

  // Tambah tier baru
  router.post('/tiers', (req, res) => {
    const b = req.body || {};
    const code = String(b.code || '').trim().toLowerCase();
    if (!code || !b.name) return res.status(400).json({ error: 'code + name wajib diisi' });
    if (!/^[a-z0-9_]+$/.test(code)) return res.status(400).json({ error: 'code cuma boleh huruf kecil/angka/underscore' });
    if (db.prepare(`SELECT code FROM loyalty_tiers WHERE code = ?`).get(code)) {
      return res.status(409).json({ error: `tier '${code}' sudah ada` });
    }
    const maxOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) m FROM loyalty_tiers`).get().m;
    db.prepare(`INSERT INTO loyalty_tiers (code, name, min_lifetime_spend, min_visits, earn_multiplier, color, emoji, sort_order, benefits)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      code, b.name,
      Number(b.min_lifetime_spend) || 0, Number(b.min_visits) || 0,
      Number(b.earn_multiplier) || 1.0, b.color || '#888888', b.emoji || '🎯',
      b.sort_order != null ? Number(b.sort_order) : maxOrder + 1,
      b.benefits ? (typeof b.benefits === 'object' ? JSON.stringify(b.benefits) : b.benefits) : null,
    );
    res.json({ ok: true, code });
  });

  // Hapus tier
  router.delete('/tiers/:code', (req, res) => {
    const code = req.params.code;
    if (code === 'bronze') return res.status(400).json({ error: 'tier dasar (bronze) gak bisa dihapus' });
    if (!db.prepare(`SELECT code FROM loyalty_tiers WHERE code = ?`).get(code)) {
      return res.status(404).json({ error: 'tier tidak ditemukan' });
    }
    const used = db.prepare(`SELECT COUNT(*) c FROM loyalty_customers WHERE current_tier_code = ?`).get(code).c;
    if (used > 0) return res.status(409).json({ error: `gak bisa dihapus — masih ada ${used} member di tier ini` });
    db.prepare(`DELETE FROM loyalty_tiers WHERE code = ?`).run(code);
    res.json({ ok: true });
  });

  // REWARDS
  router.get('/rewards', (req, res) => {
    res.json(db.prepare(`SELECT * FROM loyalty_rewards ORDER BY display_order, cost_points`).all());
  });

  router.post('/rewards', (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.cost_points || !b.type) return res.status(400).json({ error: 'name + cost_points + type required' });
    const info = db.prepare(`INSERT INTO loyalty_rewards (name, description, emoji, cost_points, type, value_amount, free_menu_id, min_tier_code, max_redemptions_per_customer, total_stock, remaining_stock, display_order, start_date, end_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(b.name, b.description || null, b.emoji || null, b.cost_points, b.type,
        b.value_amount || null, b.free_menu_id || null, b.min_tier_code || 'bronze',
        b.max_redemptions_per_customer || null, b.total_stock || null, b.total_stock || null,
        b.display_order || 0, b.start_date || null, b.end_date || null);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.put('/rewards/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name', 'description', 'emoji', 'cost_points', 'type', 'value_amount', 'free_menu_id', 'min_tier_code', 'max_redemptions_per_customer', 'is_active', 'display_order', 'start_date', 'end_date'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE loyalty_rewards SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // Hapus reward
  router.delete('/rewards/:id', (req, res) => {
    const id = req.params.id;
    const reward = db.prepare(`SELECT id FROM loyalty_rewards WHERE id = ?`).get(id);
    if (!reward) return res.status(404).json({ error: 'reward tidak ditemukan' });
    const used = db.prepare(`SELECT COUNT(*) c FROM loyalty_redemptions WHERE reward_id = ?`).get(id).c;
    if (used > 0) {
      // sudah pernah ditukar — jangan hard-delete (riwayat redemption hilang), nonaktifkan aja
      db.prepare(`UPDATE loyalty_rewards SET is_active = 0 WHERE id = ?`).run(id);
      return res.json({ ok: true, deactivated: true, note: `reward sudah ${used}x ditukar — dinonaktifkan, bukan dihapus` });
    }
    db.prepare(`DELETE FROM loyalty_rewards WHERE id = ?`).run(id);
    res.json({ ok: true, deleted: true });
  });

  // DASHBOARD STATS
  router.get('/stats', (req, res) => {
    const totalCustomers = db.prepare(`SELECT COUNT(*) c FROM loyalty_customers WHERE is_active = 1`).get().c;
    const tierDist = db.prepare(`SELECT current_tier_code as tier, COUNT(*) as count FROM loyalty_customers WHERE is_active = 1 GROUP BY current_tier_code`).all();
    const todayStart = Math.floor(new Date().setHours(0,0,0,0)/1000);
    const todayEarn = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(points),0) total FROM loyalty_transactions WHERE type='earn' AND created_at >= ?`).get(todayStart);
    const todayRedeem = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(ABS(points)),0) total FROM loyalty_transactions WHERE type='redeem' AND created_at >= ?`).get(todayStart);
    const outstandingLiability = db.prepare(`SELECT COALESCE(SUM(current_points),0) total FROM loyalty_customers WHERE is_active = 1`).get();

    const cfg = loadConfig();
    const liabilityValue = (outstandingLiability.total || 0) * cfg.point_value_idr;

    res.json({
      total_customers: totalCustomers,
      tier_distribution: tierDist,
      today: { earn: todayEarn, redeem: todayRedeem },
      outstanding_points: outstandingLiability.total,
      outstanding_liability_idr: liabilityValue,
      config: cfg
    });
  });

  // EXPIRY scheduler (call manually or via cron)
  router.post('/run-expiry', (req, res) => {
    const now = nowSec();
    const expiring = db.prepare(`SELECT customer_id, SUM(points) as expired_points FROM loyalty_transactions
      WHERE type='earn' AND expires_at IS NOT NULL AND expires_at < ?
        AND id NOT IN (SELECT id FROM loyalty_transactions WHERE type='expire' AND ref_redemption_id = loyalty_transactions.id)
      GROUP BY customer_id`).all(now);

    let processed = 0;
    for (const e of expiring) {
      // For simplicity, this is a basic implementation
      // Real expiry should track which earn batches were spent vs which expired
      const c = db.prepare(`SELECT current_points FROM loyalty_customers WHERE id = ?`).get(e.customer_id);
      const toExpire = Math.min(c.current_points, e.expired_points);
      if (toExpire <= 0) continue;
      const newBalance = c.current_points - toExpire;
      db.prepare(`UPDATE loyalty_customers SET current_points = ? WHERE id = ?`).run(newBalance, e.customer_id);
      db.prepare(`INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, description, created_by)
        VALUES (?, 'expire', ?, ?, ?, 'system')`)
        .run(e.customer_id, -toExpire, newBalance, `Auto-expire ${toExpire} points`);
      processed++;
    }
    res.json({ ok: true, processed });
  });

  // Export CSV — daftar member loyalty
  router.get('/export/customers.csv', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, t.name AS tier_name FROM loyalty_customers c
      LEFT JOIN loyalty_tiers t ON t.code = c.current_tier_code
      WHERE c.is_active = 1 ORDER BY c.lifetime_spend DESC
    `).all();
    const header = ['Phone', 'Nama', 'Tier', 'Poin Sekarang', 'Lifetime Poin', 'Total Belanja (Rp)', 'Kunjungan', 'Member Sejak'];
    const body = rows.map(c => [
      c.phone, c.name || '', c.tier_name || c.current_tier_code,
      c.current_points, c.lifetime_points, Math.round(c.lifetime_spend),
      c.total_visits, new Date((c.created_at || 0) * 1000).toLocaleDateString('id-ID'),
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=loyalty-customers.csv');
    res.send(toCsv(header, body));
  });

  const mountPath = opts.mountPath || '/api/loyalty';
  app.use(mountPath, router);
  console.log(`[loyalty] mounted at ${mountPath} — ${DEFAULT_TIERS.length} tiers seeded`);

  return { router, db, earn, redeem, getCustomerByPhone, getCustomerById };
}

module.exports = { setupLoyalty };
