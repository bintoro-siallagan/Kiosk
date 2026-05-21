// server/reward-backend.js
// Staff Reward Engine — XP, point, level, achievement, leaderboard.
// Fokus appreciation & gamification — bukan surveillance/punishment.
//
//   GET  /api/rewards                  — semua crew + level + leaderboard
//   POST /api/rewards/:id/award        — kasih XP/point { xp, points, reason }
//   POST /api/rewards/:id/achievement  — unlock achievement { achievementId }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_name TEXT NOT NULL,
  role TEXT,
  outlet TEXT,
  xp INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  achievements TEXT DEFAULT '[]',
  updated_at INTEGER
);
`;

// Level — naik berdasarkan XP
const LEVELS = [
  { tier: 'bronze', name: 'Bronze Crew', icon: '🥉', min: 0,    color: '#cd7f32' },
  { tier: 'silver', name: 'Silver Crew', icon: '🥈', min: 1500, color: '#9ca3af' },
  { tier: 'gold',   name: 'Gold Crew',   icon: '🥇', min: 3500, color: '#fbbf24' },
  { tier: 'elite',  name: 'Elite Crew',  icon: '💎', min: 6000, color: '#22d3ee' },
];

// Katalog achievement
const ACHIEVEMENTS = [
  { id: 'perfect-opening',   icon: '🏆', name: 'Perfect Opening',   desc: 'Buka outlet tepat waktu & checklist lengkap', xp: 300 },
  { id: 'zero-complaint',    icon: '🏆', name: 'Zero Complaint',    desc: 'Sebulan penuh tanpa komplain customer',       xp: 400 },
  { id: 'fastest-service',   icon: '🏆', name: 'Fastest Service',   desc: 'Rata-rata service time tercepat di outlet',  xp: 350 },
  { id: 'best-upselling',    icon: '🏆', name: 'Best Upselling',    desc: 'Upselling tertinggi periode ini',            xp: 400 },
  { id: 'customer-favorite', icon: '🏆', name: 'Customer Favorite', desc: 'Rating customer tertinggi',                  xp: 350 },
  { id: '7-days-consistent', icon: '🏆', name: '7 Days Consistent', desc: '7 hari berturut hadir tepat waktu',          xp: 250 },
  { id: 'outlet-hero',       icon: '🏆', name: 'Outlet Hero',       desc: 'Kontribusi terbaik outlet bulan ini',        xp: 500 },
];
const ACH_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

const nowSec = () => Math.floor(Date.now() / 1000);

function levelInfo(xp) {
  let cur = LEVELS[0], idx = 0;
  LEVELS.forEach((l, i) => { if (xp >= l.min) { cur = l; idx = i; } });
  const next = LEVELS[idx + 1] || null;
  const progress = next ? Math.round((xp - cur.min) / (next.min - cur.min) * 100) : 100;
  return { level: cur, next, progress_pct: Math.max(0, Math.min(100, progress)), xp_to_next: next ? next.min - xp : 0 };
}

function setupRewards(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed crew demo (sekali)
  if (db.prepare(`SELECT COUNT(*) c FROM staff_rewards`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO staff_rewards (staff_name, role, outlet, xp, points, streak_days, achievements, updated_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    const crew = [
      ['Nadia Sari',       'crew',       'BSD City',   6300, 410, 15, ['outlet-hero', 'customer-favorite', '7-days-consistent', 'fastest-service', 'zero-complaint']],
      ['Rizki Pratama',    'supervisor', 'Paskal',     7200, 480, 12, ['outlet-hero', 'perfect-opening', 'zero-complaint', 'best-upselling']],
      ['Putri Anggraini',  'barista',    'Sudirman',   5400, 360,  9, ['fastest-service', 'customer-favorite', '7-days-consistent']],
      ['Andi Saputra',     'kasir',      'BSD City',   4100, 280,  7, ['best-upselling', 'zero-complaint']],
      ['Sari Wulandari',   'crew',       'Kemang',     3800, 250,  5, ['customer-favorite']],
      ['Budi Santoso',     'barista',    'Dago',       2900, 190,  4, ['perfect-opening']],
      ['Maya Lestari',     'kasir',      'Sudirman',   2300, 150,  6, ['7-days-consistent']],
      ['Dimas Prakoso',    'crew',       'Paskal',     1800, 120,  3, ['fastest-service']],
      ['Ayu Permata',      'barista',    'Balikpapan', 1100,  80,  2, []],
      ['Fajar Nugroho',    'kasir',      'Dago',        700,  50,  1, []],
    ];
    for (const [n, r, o, xp, pt, st, ach] of crew) ins.run(n, r, o, xp, pt, st, JSON.stringify(ach), nowSec());
  }

  const decorate = (row) => {
    const ach = (() => { try { return JSON.parse(row.achievements || '[]'); } catch { return []; } })();
    return {
      ...row,
      achievements: ach.map(id => ACH_MAP[id]).filter(Boolean),
      achievement_count: ach.length,
      ...levelInfo(row.xp),
    };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM staff_rewards`).all().map(decorate);
    const byXp = rows.slice().sort((a, b) => b.xp - a.xp);
    const tierCount = {};
    for (const r of rows) tierCount[r.level.tier] = (tierCount[r.level.tier] || 0) + 1;
    res.json({
      crew: byXp,
      leaderboard: byXp.slice(0, 10).map((r, i) => ({
        rank: i + 1, staff_name: r.staff_name, outlet: r.outlet, role: r.role,
        xp: r.xp, points: r.points, level: r.level, streak_days: r.streak_days,
      })),
      catalog: { levels: LEVELS, achievements: ACHIEVEMENTS },
      summary: {
        total_crew: rows.length,
        tier: { bronze: tierCount.bronze || 0, silver: tierCount.silver || 0, gold: tierCount.gold || 0, elite: tierCount.elite || 0 },
        total_xp: rows.reduce((s, r) => s + r.xp, 0),
        total_points: rows.reduce((s, r) => s + r.points, 0),
        achievements_unlocked: rows.reduce((s, r) => s + r.achievement_count, 0),
      },
    });
  });

  router.post('/:id/award', (req, res) => {
    const row = db.prepare(`SELECT * FROM staff_rewards WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'crew tidak ditemukan' });
    const xp = Math.max(0, parseInt(req.body.xp) || 0);
    const points = Math.max(0, parseInt(req.body.points) || 0);
    if (!xp && !points) return res.status(400).json({ error: 'XP atau point wajib diisi' });
    db.prepare(`UPDATE staff_rewards SET xp = xp + ?, points = points + ?, updated_at = ? WHERE id = ?`)
      .run(xp, points, nowSec(), row.id);
    res.json({ ok: true, ...decorate(db.prepare(`SELECT * FROM staff_rewards WHERE id = ?`).get(row.id)) });
  });

  router.post('/:id/achievement', (req, res) => {
    const row = db.prepare(`SELECT * FROM staff_rewards WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'crew tidak ditemukan' });
    const aid = req.body.achievementId;
    const ach = ACH_MAP[aid];
    if (!ach) return res.status(400).json({ error: 'achievement tidak valid' });
    let list; try { list = JSON.parse(row.achievements || '[]'); } catch { list = []; }
    if (list.includes(aid)) return res.status(409).json({ error: 'achievement sudah ke-unlock' });
    list.push(aid);
    db.prepare(`UPDATE staff_rewards SET achievements = ?, xp = xp + ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(list), ach.xp, nowSec(), row.id);
    res.json({ ok: true, unlocked: ach, ...decorate(db.prepare(`SELECT * FROM staff_rewards WHERE id = ?`).get(row.id)) });
  });

  const mountPath = opts.mountPath || '/api/rewards';
  app.use(mountPath, router);
  console.log(`[rewards] mounted at ${mountPath} — staff reward engine`);

  return { router, db };
}

module.exports = { setupRewards };
