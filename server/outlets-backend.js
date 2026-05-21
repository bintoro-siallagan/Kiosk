// server/outlets-backend.js
// Multi-Outlet Overview — Command Center.
// Owner multi-cabang lihat semua outlet sekaligus: revenue, health,
// issue, staff per outlet, dikelompokin per Area.
//
//   GET /api/outlets  →  { summary, areas }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS outlets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL,
  name TEXT NOT NULL,
  manager TEXT,
  revenue_today REAL DEFAULT 0,
  growth_pct INTEGER DEFAULT 0,
  health_score INTEGER DEFAULT 75,
  open_issues INTEGER DEFAULT 0,
  staff_count INTEGER DEFAULT 0,
  is_flagship INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

// [area, name, manager, revenue, growth%, health, issues, staff, flagship]
const SEED = [
  ['Bandung',    'Paskal',     'Andre W.', 4200000,  12, 88,  2, 6, 1],
  ['Bandung',    'Dago',       'Sari M.',  2800000,   5, 79,  5, 4, 0],
  ['Jakarta',    'Sudirman',   'Budi P.',  6100000,  18, 91,  1, 8, 0],
  ['Jakarta',    'Kemang',     'Rina S.',  3400000,  -8, 62,  9, 5, 0],
  ['Tangerang',  'BSD City',   'Doni K.',  3900000,   9, 84,  3, 6, 0],
  ['Kalimantan', 'Balikpapan', 'Wati L.',  1900000, -15, 54, 12, 4, 0],
];

const statusOf = (h) => (h >= 80 ? 'healthy' : h >= 60 ? 'attention' : 'critical');

function setupOutlets(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM outlets`).get().c === 0) {
    const s = db.prepare(`INSERT INTO outlets
      (area, name, manager, revenue_today, growth_pct, health_score, open_issues, staff_count, is_flagship)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    for (const r of SEED) s.run(...r);
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM outlets ORDER BY area, name`).all()
      .map(o => ({ ...o, status: statusOf(o.health_score) }));
    const byArea = {};
    rows.forEach(o => { (byArea[o.area] = byArea[o.area] || []).push(o); });
    res.json({
      summary: {
        total: rows.length,
        areas: Object.keys(byArea).length,
        healthy: rows.filter(o => o.status === 'healthy').length,
        attention: rows.filter(o => o.status === 'attention').length,
        critical: rows.filter(o => o.status === 'critical').length,
        total_revenue: rows.reduce((s, o) => s + o.revenue_today, 0),
        total_staff: rows.reduce((s, o) => s + o.staff_count, 0),
      },
      areas: Object.entries(byArea)
        .map(([area, outlets]) => ({
          area, outlets,
          revenue: outlets.reduce((s, o) => s + o.revenue_today, 0),
        }))
        .sort((a, b) => b.revenue - a.revenue),
    });
  });

  const mountPath = opts.mountPath || '/api/outlets';
  app.use(mountPath, router);
  console.log(`[outlets] mounted at ${mountPath} — multi-outlet overview`);

  return { router, db };
}

module.exports = { setupOutlets };
