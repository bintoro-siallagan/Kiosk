// server/leaderboard-backend.js
// Customer spend gamification — "Sultan Leaderboard".
// Setelah transaksi: customer dapet gelar (Sultan/Crazy Rich/dll) +
// lihat peringkat belanja JAM INI. Reset tiap 1 jam → tiap jam ada
// Sultan baru. Layar celebration didesain biar enak di-screenshot &
// dishare ke WA Story / Instagram (apresiasi customer).
//
//   POST /api/leaderboard/record  — { name, amount } → gelar + rank + top + stats
//   GET  /api/leaderboard         — leaderboard belanja jam ini

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS spend_leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  amount REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_lb_created ON spend_leaderboard(created_at);
`;

// Gelar berdasarkan nominal transaksi
const TITLES = [
  { min: 300000, title: 'SULTAN',         emoji: '👑', color: '#fbbf24' },
  { min: 150000, title: 'Crazy Rich',     emoji: '💎', color: '#22d3ee' },
  { min: 80000,  title: 'Big Spender',    emoji: '🔥', color: '#f97316' },
  { min: 40000,  title: 'Foodie Sejati',  emoji: '😋', color: '#34d399' },
  { min: 0,      title: 'Hemat Pejuang',  emoji: '🌱', color: '#a3e635' },
];
const titleFor = (amt) => TITLES.find(t => amt >= t.min) || TITLES[TITLES.length - 1];

// Reset tiap 1 jam — window = jam berjalan (mis. 14:00–14:59)
const hourStart = () => { const d = new Date(); d.setMinutes(0, 0, 0); return Math.floor(d.getTime() / 1000); };
const hourLabel = () => {
  const h = new Date().getHours();
  return `${String(h).padStart(2, '0')}.00–${String(h).padStart(2, '0')}.59`;
};

function setupLeaderboard(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  const topNow = (limit) => db.prepare(
    `SELECT name, amount FROM spend_leaderboard WHERE created_at >= ? ORDER BY amount DESC, id ASC LIMIT ?`
  ).all(hourStart(), limit)
    .map((r, i) => ({ rank: i + 1, name: r.name || 'Tamu', amount: r.amount, ...titleFor(r.amount) }));

  const statsNow = () => {
    const s = db.prepare(
      `SELECT COALESCE(MAX(amount),0) top_transaction, COALESCE(AVG(amount),0) avg_bill, COUNT(*) count
       FROM spend_leaderboard WHERE created_at >= ?`
    ).get(hourStart());
    return { top_transaction: Math.round(s.top_transaction), avg_bill: Math.round(s.avg_bill), count: s.count };
  };

  // GET — leaderboard belanja jam ini
  router.get('/', (req, res) => {
    res.json({
      window: hourLabel(),
      top: topNow(Math.min(Number(req.query.limit) || 10, 50)),
      stats: statsNow(),
    });
  });

  // POST — catat transaksi, balikin gelar + rank + leaderboard + stats jam ini
  router.post('/record', (req, res) => {
    const { name, amount } = req.body || {};
    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'amount tidak valid' });
    db.prepare(`INSERT INTO spend_leaderboard (name, amount) VALUES (?,?)`)
      .run((name || '').trim() || 'Tamu', amt);
    const all = db.prepare(`SELECT amount FROM spend_leaderboard WHERE created_at >= ?`).all(hourStart());
    const rank = all.filter(r => r.amount > amt).length + 1;
    res.json({
      window: hourLabel(),
      title: titleFor(amt),
      amount: amt,
      rank,
      total_hour: all.length,
      top: topNow(8),
      stats: statsNow(),
    });
  });

  const mountPath = opts.mountPath || '/api/leaderboard';
  app.use(mountPath, router);
  console.log(`[leaderboard] mounted at ${mountPath} — hourly Sultan leaderboard`);

  return { router, db };
}

module.exports = { setupLeaderboard };
