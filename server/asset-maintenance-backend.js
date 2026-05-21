// server/asset-maintenance-backend.js
// Asset & Maintenance — registry aset/peralatan + jadwal maintenance
// preventif (last service, next due).
//
//   GET  /api/asset-maintenance            — aset + jadwal + summary
//   POST /api/asset-maintenance            — tambah aset
//   POST /api/asset-maintenance/:id/service — catat service

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, asset_code TEXT, name TEXT, category TEXT,
  outlet TEXT, status TEXT DEFAULT 'operational', last_service INTEGER, next_service INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const CATEGORIES = ['Machine', 'Refrigeration', 'IT Equipment', 'Furniture'];
const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);

function setupAssetMaintenance(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM assets`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO assets (asset_code, name, category, outlet, status, last_service, next_service) VALUES (?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [name, category, outlet, status, lastSvcDaysAgo, nextSvcDays]
    [
      ['Mesin Froyo Soft-Serve', 'Machine', 'Paskal', 'operational', 40, 20],
      ['Mesin Froyo Soft-Serve', 'Machine', 'Dago', 'maintenance', 95, -3],
      ['Chest Freezer 500L', 'Refrigeration', 'Paskal', 'operational', 30, 45],
      ['Display Chiller', 'Refrigeration', 'Sudirman', 'broken', 120, -8],
      ['POS Terminal', 'IT Equipment', 'Paskal', 'operational', 25, 60],
      ['AC Split 2PK', 'Machine', 'Dago', 'operational', 50, 15],
      ['Waffle Maker', 'Machine', 'Kemang', 'operational', 18, 30],
      ['CCTV System 8-Ch', 'IT Equipment', 'BSD City', 'operational', 60, 90],
      ['Blender Industrial', 'Machine', 'Sudirman', 'maintenance', 70, 5],
      ['Kiosk Self-Order Display', 'IT Equipment', 'BSD City', 'operational', 35, 40],
    ].forEach(([nm, c, o, st, ls, ns]) => ins.run(`AST-${String(i++).padStart(3, '0')}`, nm, c, o, st, N - ls * DAY, N + ns * DAY));
  }

  const maintStatus = (a) => {
    if (a.status === 'broken') return { m: 'critical', color: '#ef4444', label: 'RUSAK' };
    if (a.status === 'maintenance') return { m: 'maintenance', color: '#f59e0b', label: 'MAINTENANCE' };
    const days = Math.floor((a.next_service - nowSec()) / DAY);
    if (days < 0) return { m: 'overdue', color: '#ef4444', label: 'TELAT SERVICE' };
    if (days <= 7) return { m: 'due_soon', color: '#f59e0b', label: 'SEGERA SERVICE' };
    return { m: 'ok', color: '#10b981', label: 'OPERASIONAL' };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const assets = db.prepare(`SELECT * FROM assets ORDER BY next_service ASC`).all()
      .map(a => { const ms = maintStatus(a); return { ...a, ...ms, days_to_service: Math.floor((a.next_service - nowSec()) / DAY) }; });
    res.json({
      assets, categories: CATEGORIES,
      summary: {
        total: assets.length,
        operational: assets.filter(a => a.m === 'ok').length,
        need_attention: assets.filter(a => ['critical', 'overdue', 'maintenance'].includes(a.m)).length,
        due_soon: assets.filter(a => a.m === 'due_soon').length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama aset wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM assets`).get().c;
    db.prepare(`INSERT INTO assets (asset_code, name, category, outlet, status, last_service, next_service)
      VALUES (?,?,?,?, 'operational', ?, ?)`).run(`AST-${String(n + 1).padStart(3, '0')}`, String(b.name).trim(),
      CATEGORIES.includes(b.category) ? b.category : 'Machine', (b.outlet || '-').trim(), nowSec(), nowSec() + 90 * DAY);
    res.json({ ok: true });
  });

  router.post('/:id/service', (req, res) => {
    const a = db.prepare(`SELECT * FROM assets WHERE id = ?`).get(req.params.id);
    if (!a) return res.status(404).json({ error: 'aset tidak ditemukan' });
    const next = Number((req.body || {}).next_in_days) || 90;
    db.prepare(`UPDATE assets SET status='operational', last_service=?, next_service=? WHERE id=?`)
      .run(nowSec(), nowSec() + next * DAY, a.id);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/asset-maintenance';
  app.use(mountPath, router);
  console.log(`[asset-maintenance] mounted at ${mountPath} — asset registry & maintenance`);

  return { router, db };
}

module.exports = { setupAssetMaintenance };
