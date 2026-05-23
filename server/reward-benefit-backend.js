// server/reward-benefit-backend.js
// Reward Benefit — crew tukar point jadi benefit nyata: meal voucher,
// cashback, merchandise, cinema voucher, bonus incentive, shift priority.
//
//   GET  /api/reward-benefits             — katalog + riwayat redeem
//   POST /api/reward-benefits/redeem      — tukar point { staffId, rewardId }
//   POST /api/reward-benefits/:id/status  — update status redemption

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER,
  staff_name TEXT,
  reward_id TEXT,
  reward_name TEXT,
  reward_icon TEXT,
  point_cost INTEGER,
  status TEXT DEFAULT 'pending',
  redeemed_at INTEGER,
  updated_at INTEGER
);
`;

// Katalog benefit yang bisa ditukar
const CATALOG = [
  { id: 'free-drink',      icon: '☕',  name: 'Free Drink Voucher',        category: 'Voucher',     cost: 100 },
  { id: 'meal-voucher',    icon: '🍽️', name: 'Meal Voucher Rp 50.000',    category: 'Voucher',     cost: 200 },
  { id: 'shift-priority',  icon: '⏰',  name: 'Shift Priority Pass',        category: 'Perk',        cost: 250 },
  { id: 'merchandise',     icon: '👕',  name: 'Merchandise Pack',           category: 'Merchandise', cost: 300 },
  { id: 'cinema-voucher',  icon: '🎬',  name: 'Cinema Voucher (2 tiket)',   category: 'Voucher',     cost: 350 },
  { id: 'cashback',        icon: '💵',  name: 'Cashback Rp 100.000',        category: 'Cashback',    cost: 450 },
  { id: 'bonus-incentive', icon: '🎁',  name: 'Bonus Incentive Rp 250.000', category: 'Incentive',   cost: 800 },
  { id: 'extra-dayoff',    icon: '🏖️', name: 'Extra Day Off',              category: 'Perk',        cost: 1000 },
];
const CAT_MAP = Object.fromEntries(CATALOG.map(r => [r.id, r]));
const STATUS = ['pending', 'approved', 'delivered'];
const nowSec = () => Math.floor(Date.now() / 1000);

function setupRewardBenefits(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed beberapa redemption demo (sekali) — historical, gak potong point
  if (db.prepare(`SELECT COUNT(*) c FROM reward_redemptions`).get().c === 0) {
    const crew = db.prepare(`SELECT id, staff_name FROM staff_rewards`).all();
    if (crew.length) {
      const ins = db.prepare(`INSERT INTO reward_redemptions
        (staff_id, staff_name, reward_id, reward_name, reward_icon, point_cost, status, redeemed_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      const pick = (n) => crew[n % crew.length];
      const seed = [
        [pick(0), 'meal-voucher', 'delivered', 6], [pick(1), 'cinema-voucher', 'delivered', 5],
        [pick(2), 'merchandise', 'approved', 2], [pick(3), 'free-drink', 'pending', 1],
      ];
      for (const [c, rid, st, daysAgo] of seed) {
        const r = CAT_MAP[rid];
        ins.run(c.id, c.staff_name, r.id, r.name, r.icon, r.cost, st, nowSec() - daysAgo * 86400, nowSec());
      }
    }
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const redemptions = db.prepare(`SELECT * FROM reward_redemptions ORDER BY redeemed_at DESC`).all();
    const crew = db.prepare(`SELECT id, staff_name, role, outlet, points FROM staff_rewards ORDER BY points DESC`).all();
    res.json({
      catalog: CATALOG,
      crew,
      redemptions,
      summary: {
        total_redeemed: redemptions.length,
        points_spent: redemptions.reduce((s, r) => s + r.point_cost, 0),
        pending: redemptions.filter(r => r.status === 'pending').length,
        delivered: redemptions.filter(r => r.status === 'delivered').length,
      },
    });
  });

  router.post('/redeem', (req, res) => {
    const reward = CAT_MAP[(req.body || {}).rewardId];
    if (!reward) return res.status(400).json({ error: 'reward tidak valid' });
    const staff = db.prepare(`SELECT * FROM staff_rewards WHERE id = ?`).get((req.body || {}).staffId);
    if (!staff) return res.status(404).json({ error: 'crew tidak ditemukan' });
    if (staff.points < reward.cost)
      return res.status(400).json({ error: `point kurang — butuh ${reward.cost}, punya ${staff.points}` });

    const tx = db.transaction(() => {
      db.prepare(`UPDATE staff_rewards SET points = points - ?, updated_at = ? WHERE id = ?`)
        .run(reward.cost, nowSec(), staff.id);
      return db.prepare(`INSERT INTO reward_redemptions
        (staff_id, staff_name, reward_id, reward_name, reward_icon, point_cost, status, redeemed_at, updated_at)
        VALUES (?,?,?,?,?,?, 'pending', ?, ?)`).run(
        staff.id, staff.staff_name, reward.id, reward.name, reward.icon, reward.cost, nowSec(), nowSec());
    });
    const r = tx();
    res.json({ ok: true, id: r.lastInsertRowid, points_left: staff.points - reward.cost });
  });

  router.post('/:id/status', (req, res) => {
    const row = db.prepare(`SELECT * FROM reward_redemptions WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'redemption tidak ditemukan' });
    const status = (req.body || {}).status;
    if (!STATUS.includes(status)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE reward_redemptions SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, nowSec(), row.id);
    res.json({ ok: true, status });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM reward_redemptions WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['staff_name', 'reward_name', 'reward_icon', 'point_cost', 'status']) {
      if (b[k] !== undefined) {
        if (k === 'status' && !STATUS.includes(b[k])) return res.status(400).json({ error: 'status tidak valid' });
        fields.push(`${k} = ?`); args.push(b[k]);
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    fields.push('updated_at = ?'); args.push(nowSec());
    args.push(req.params.id);
    db.prepare(`UPDATE reward_redemptions SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM reward_redemptions WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/reward-benefits';
  app.use(mountPath, router);
  console.log(`[reward-benefits] mounted at ${mountPath} — point redemption`);

  return { router, db };
}

module.exports = { setupRewardBenefits };
