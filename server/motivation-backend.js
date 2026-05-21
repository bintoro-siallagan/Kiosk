// server/motivation-backend.js
// Smart Motivation — encouragement, achievement unlock & streak reward.
// SELALU positif — apresiasi, bukan punishment / monitoring.
//
//   GET /api/motivation   — feed motivasi per crew

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const LEVELS = [
  { tier: 'bronze', name: 'Bronze Crew', icon: '🥉', min: 0 },
  { tier: 'silver', name: 'Silver Crew', icon: '🥈', min: 1500 },
  { tier: 'gold',   name: 'Gold Crew',   icon: '🥇', min: 3500 },
  { tier: 'elite',  name: 'Elite Crew',  icon: '💎', min: 6000 },
];
const ACH = {
  'perfect-opening':   { icon: '🏆', name: 'Perfect Opening' },
  'zero-complaint':    { icon: '🏆', name: 'Zero Complaint' },
  'fastest-service':   { icon: '🏆', name: 'Fastest Service' },
  'best-upselling':    { icon: '🏆', name: 'Best Upselling' },
  'customer-favorite': { icon: '🏆', name: 'Customer Favorite' },
  '7-days-consistent': { icon: '🏆', name: '7 Days Consistent' },
  'outlet-hero':       { icon: '🏆', name: 'Outlet Hero' },
};
// Reward milestone streak
const STREAK_MILES = [
  { d: 3,  icon: '⚡', reward: '+100 XP Boost' },
  { d: 7,  icon: '☕', reward: 'Free Drink Voucher' },
  { d: 14, icon: '🍽️', reward: 'Meal Voucher' },
  { d: 30, icon: '🎁', reward: 'Bonus Incentive' },
];

function levelInfo(xp) {
  let cur = LEVELS[0], idx = 0;
  LEVELS.forEach((l, i) => { if (xp >= l.min) { cur = l; idx = i; } });
  const next = LEVELS[idx + 1] || null;
  const progress = next ? Math.round((xp - cur.min) / (next.min - cur.min) * 100) : 100;
  return { level: cur, next, progress, xp_to_next: next ? next.min - xp : 0 };
}

function setupMotivation(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const router = express.Router();

  router.get('/', (req, res) => {
    let crew = [];
    try { crew = db.prepare(`SELECT * FROM staff_rewards`).all(); } catch { crew = []; }

    // ── Encouragement — 1 pesan paling relevan per crew, selalu positif ──
    const encouragements = crew.map(c => {
      const li = levelInfo(c.xp);
      let ach = []; try { ach = JSON.parse(c.achievements || '[]'); } catch { ach = []; }
      let icon, message;
      if (li.next && li.progress >= 70) {
        icon = '🔥'; message = `Tinggal ${li.xp_to_next.toLocaleString('id-ID')} XP lagi ke ${li.next.name} — dikit lagi, gas!`;
      } else if (c.streak_days >= 7) {
        icon = '👏'; message = `Streak ${c.streak_days} hari — konsistensi kamu luar biasa, pertahankan!`;
      } else if (ach.length >= 3) {
        icon = '🌟'; message = `${ach.length} achievement ke-unlock — kamu panutan tim!`;
      } else if (li.level.tier === 'elite') {
        icon = '💎'; message = 'Elite Crew sejati — terus jadi inspirasi outlet!';
      } else if (c.streak_days >= 1 && c.streak_days < 3) {
        icon = '⚡'; message = `${3 - c.streak_days} hari lagi ke streak reward pertama — ayo!`;
      } else {
        icon = '💪'; message = 'Terus semangat — setiap shift kamu dihargai tim!';
      }
      return { staff_name: c.staff_name, outlet: c.outlet, level: li.level, icon, message };
    });

    // ── Streak rewards — crew yang capai milestone ──
    const streak_rewards = crew.filter(c => c.streak_days >= 3).map(c => {
      let m = STREAK_MILES[0];
      for (const s of STREAK_MILES) if (c.streak_days >= s.d) m = s;
      return { staff_name: c.staff_name, outlet: c.outlet, streak_days: c.streak_days, milestone: m.d, icon: m.icon, reward: m.reward };
    }).sort((a, b) => b.streak_days - a.streak_days);

    // ── Achievement unlocks — wall apresiasi ──
    const achievement_unlocks = [];
    for (const c of crew) {
      let ach = []; try { ach = JSON.parse(c.achievements || '[]'); } catch { ach = []; }
      for (const id of ach) if (ACH[id]) achievement_unlocks.push({ staff_name: c.staff_name, outlet: c.outlet, ...ACH[id] });
    }

    res.json({
      encouragements,
      streak_rewards,
      achievement_unlocks,
      summary: {
        crew_count: crew.length,
        encouragement_count: encouragements.length,
        streak_rewards_count: streak_rewards.length,
        achievements_celebrated: achievement_unlocks.length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/motivation';
  app.use(mountPath, router);
  console.log(`[motivation] mounted at ${mountPath} — smart motivation feed`);

  return { router, db };
}

module.exports = { setupMotivation };
