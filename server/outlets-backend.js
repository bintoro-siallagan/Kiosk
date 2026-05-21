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

  // ── Outlet Detail (Level 3 drill-down) ──
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const det = (id, salt) => ((id * 31 + salt * 17) % 17) - 8;   // -8..8 deterministik

  router.get('/:id', (req, res) => {
    const o = db.prepare(`SELECT * FROM outlets WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'outlet tidak ditemukan' });
    const h = o.health_score, iss = o.open_issues, staff = o.staff_count, rev = o.revenue_today, g = o.growth_pct;

    const health_components = [
      { key: 'SOP & Disiplin',    score: clamp(h + det(o.id, 1)) },
      { key: 'Sales vs Target',   score: clamp(58 + g * 2.4) },
      { key: 'Customer Feedback', score: clamp(h + det(o.id, 2)) },
      { key: 'Stock & Supply',    score: clamp(h + det(o.id, 3) - Math.min(iss, 12)) },
      { key: 'Issue & Risk',      score: clamp(100 - iss * 5) },
      { key: 'Workforce',         score: clamp(56 + staff * 6) },
    ];

    const avg_bill = 48000 + det(o.id, 4) * 2200;
    const transactions = Math.round(rev / avg_bill);
    const target = Math.round(rev / ((88 + det(o.id, 5)) / 100) / 10000) * 10000;

    const stockTotal = 42 + det(o.id, 8);
    const stockCrit = Math.min(8, Math.round(iss / 3));
    const stockLow = Math.min(14, Math.max(0, iss - stockCrit));

    const ISSUES = ['Waste topping berlebih', 'Void transaksi tinggi', 'Stok bahan menipis',
      'Komplain antrian lama', 'Absensi telat staff', 'Suhu chiller di luar standar'];
    const recent = [];
    for (let i = 0; i < Math.min(iss, 4); i++) {
      recent.push({
        text: ISSUES[(o.id + i) % ISSUES.length],
        severity: i === 0 && iss >= 8 ? 'critical' : i < 2 ? 'warning' : 'info',
      });
    }

    res.json({
      outlet: { ...o, status: statusOf(h) },
      health_components,
      sales: { revenue: rev, growth_pct: g, target, target_pct: target ? Math.round(rev / target * 100) : 0, transactions, avg_bill },
      workforce: { staff_count: staff, on_duty: Math.max(1, staff - (o.id % 2)), attendance_pct: clamp(86 + det(o.id, 7)) },
      stock: { total: stockTotal, critical: stockCrit, low: stockLow, ok: stockTotal - stockCrit - stockLow },
      issues: { open: iss, critical: Math.round(iss / 4), recent },
    });
  });

  const mountPath = opts.mountPath || '/api/outlets';
  app.use(mountPath, router);
  console.log(`[outlets] mounted at ${mountPath} — multi-outlet overview + detail`);

  return { router, db };
}

module.exports = { setupOutlets };
