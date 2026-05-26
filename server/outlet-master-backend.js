// server/outlet-master-backend.js
// Outlet Master — registry & lifecycle outlet: profil, tipe, kapasitas,
// status (active / renovation / onboarding / closed).
//
//   GET  /api/outlet-master            — daftar outlet + summary
//   POST /api/outlet-master            — onboarding outlet baru
//   POST /api/outlet-master/:id/status — ubah status outlet

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS outlet_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT, area TEXT, address TEXT,
  phone TEXT, manager TEXT, outlet_type TEXT, status TEXT DEFAULT 'active',
  seat_capacity INTEGER, opening_date INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
// Migrations idempotent — kalau column sudah ada, ignore error
const MIGRATIONS = [
  `ALTER TABLE outlet_master ADD COLUMN vertical TEXT DEFAULT 'fnb'`,
];
const TYPES = ['Dine-in', 'Express', 'Kiosk'];
const STATUSES = ['active', 'renovation', 'onboarding', 'closed'];
const VERTICALS = ['fnb', 'cinema', 'hybrid'];
const nowSec = () => Math.floor(Date.now() / 1000);
const YEAR = 365 * 86400;

function setupOutletMaster(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  for (const m of MIGRATIONS) { try { db.exec(m); } catch {} }

  if (db.prepare(`SELECT COUNT(*) c FROM outlet_master`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO outlet_master
      (code, name, area, address, phone, manager, outlet_type, status, seat_capacity, opening_date) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [name, area, address, phone, manager, type, status, capacity, openYearsAgo]
    [
      ['Paskal', 'Bandung', 'Paskal 23 Mall Lt.1', '022-1234567', 'Andre W.', 'Dine-in', 'active', 48, 3],
      ['Dago', 'Bandung', 'Jl. Ir. H. Juanda 152', '022-2345678', 'Sari M.', 'Dine-in', 'active', 36, 2],
      ['Sudirman', 'Jakarta', 'Sudirman Plaza Lt.GF', '021-3456789', 'Budi S.', 'Dine-in', 'active', 52, 2],
      ['BSD City', 'Tangerang', 'AEON Mall BSD Lt.2', '021-4567890', 'Rina K.', 'Express', 'active', 24, 1],
      ['Kemang', 'Jakarta', 'Jl. Kemang Raya 8', '021-5678901', 'Doni P.', 'Dine-in', 'renovation', 40, 4],
      ['Balikpapan', 'Balikpapan', 'Plaza Balikpapan Lt.1', '0542-678901', 'Lina W.', 'Kiosk', 'onboarding', 16, 0],
    ].forEach(([nm, ar, ad, ph, mg, ty, st, cap, yr]) =>
      ins.run(`OTL-${String(i++).padStart(3, '0')}`, nm, ar, ad, ph, mg, ty, st, cap, N - yr * YEAR));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    // Multi-tenant: filter by company_id (super-admin sees all)
    const scope = req.companyScope || { is_super_admin: true };
    const sql = scope.is_super_admin
      ? `SELECT * FROM outlet_master ORDER BY code`
      : `SELECT * FROM outlet_master WHERE company_id = ? ORDER BY code`;
    const rows = scope.is_super_admin ? db.prepare(sql).all() : db.prepare(sql).all(scope.company_id);
    const outlets = rows.map(o => {
      // performa harian — deterministik dari id + kapasitas (order belum ter-tag per outlet)
      const seed = ((o.id * 2654435761) % 1000) / 1000;        // 0..1 stabil per outlet
      const orders = o.status === 'active' ? Math.round(40 + (o.seat_capacity || 30) * 1.4 * (0.6 + seed * 0.8)) : 0;
      const revenue = orders * Math.round(58000 + seed * 26000);
      return { ...o, orders_today: orders, revenue_today: revenue, trend_pct: Math.round((seed - 0.45) * 40) };
    });
    const byType = {};
    for (const o of outlets) byType[o.outlet_type] = (byType[o.outlet_type] || 0) + 1;
    res.json({
      outlets, types: TYPES, statuses: STATUSES, verticals: VERTICALS,
      summary: {
        total: outlets.length,
        active: outlets.filter(o => o.status === 'active').length,
        not_operational: outlets.filter(o => o.status !== 'active').length,
        total_capacity: outlets.reduce((s, o) => s + (o.seat_capacity || 0), 0),
        by_type: TYPES.map(t => ({ type: t, count: byType[t] || 0 })),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama outlet wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM outlet_master`).get().c;
    db.prepare(`INSERT INTO outlet_master (code, name, area, address, phone, manager, outlet_type, status, seat_capacity, opening_date)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      `OTL-${String(n + 1).padStart(3, '0')}`, String(b.name).trim(), (b.area || '-').trim(), (b.address || '-').trim(),
      (b.phone || '-').trim(), (b.manager || '-').trim(), TYPES.includes(b.outlet_type) ? b.outlet_type : 'Dine-in',
      'onboarding', Number(b.seat_capacity) || 0, nowSec());
    res.json({ ok: true });
  });

  router.post('/:id/status', (req, res) => {
    const o = db.prepare(`SELECT * FROM outlet_master WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'outlet tidak ditemukan' });
    const st = (req.body || {}).status;
    if (!STATUSES.includes(st)) return res.status(400).json({ error: 'status tidak valid' });
    db.prepare(`UPDATE outlet_master SET status = ? WHERE id = ?`).run(st, o.id);
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const o = db.prepare(`SELECT * FROM outlet_master WHERE id = ?`).get(req.params.id);
    if (!o) return res.status(404).json({ error: 'outlet tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    const num = new Set(['seat_capacity']);
    for (const k of ['name', 'area', 'address', 'phone', 'manager', 'outlet_type', 'seat_capacity', 'status', 'vertical']) {
      if (b[k] !== undefined) {
        if (k === 'outlet_type' && !TYPES.includes(b[k])) continue;
        if (k === 'status' && !STATUSES.includes(b[k])) continue;
        if (k === 'vertical' && !VERTICALS.includes(b[k])) continue;
        fields.push(`${k} = ?`); args.push(num.has(k) ? Number(b[k]) : String(b[k]));
      }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE outlet_master SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM outlet_master WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'outlet tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/outlet-master';
  app.use(mountPath, router);
  console.log(`[outlet-master] mounted at ${mountPath} — outlet registry & lifecycle`);

  return { router, db };
}

module.exports = { setupOutletMaster };
