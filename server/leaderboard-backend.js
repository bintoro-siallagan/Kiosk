// server/leaderboard-backend.js
// Customer spend gamification — "Sultan Leaderboard".
// Setelah transaksi: customer dapet gelar (Sultan/Crazy Rich/dll) +
// lihat peringkat belanja hari ini. Bikin customer senang & balik lagi.
//
//   POST /api/leaderboard/record  — { name, amount } → gelar + rank + top
//   GET  /api/leaderboard         — leaderboard belanja hari ini

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
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000); };

function setupLeaderboard(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  const topToday = (limit) => {
    const rows = db.prepare(
      `SELECT name, amount FROM spend_leaderboard WHERE created_at >= ? ORDER BY amount DESC, id ASC LIMIT ?`
    ).all(dayStart(), limit);
    return rows.map((r, i) => ({ rank: i + 1, name: r.name || 'Tamu', amount: r.amount, ...titleFor(r.amount) }));
  };

  // GET — leaderboard belanja hari ini
  router.get('/', (req, res) => {
    res.json({
      date: new Date().toISOString().slice(0, 10),
      top: topToday(Math.min(Number(req.query.limit) || 10, 50)),
    });
  });

  // POST — catat transaksi, balikin gelar + rank + leaderboard
  router.post('/record', (req, res) => {
    const { name, amount } = req.body || {};
    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'amount tidak valid' });
    db.prepare(`INSERT INTO spend_leaderboard (name, amount) VALUES (?,?)`)
      .run((name || '').trim() || 'Tamu', amt);
    const all = db.prepare(`SELECT amount FROM spend_leaderboard WHERE created_at >= ?`).all(dayStart());
    const rank = all.filter(r => r.amount > amt).length + 1;
    res.json({
      title: titleFor(amt),
      amount: amt,
      rank,
      total_today: all.length,
      top: topToday(8),
    });
  });

  const mountPath = opts.mountPath || '/api/leaderboard';
  app.use(mountPath, router);
  console.log(`[leaderboard] mounted at ${mountPath} — customer spend gamification`);

  return { router, db };
}

module.exports = { setupLeaderboard };
