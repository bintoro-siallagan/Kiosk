// server/rbac-backend.js
// RBAC Core — 15 role × 12 modul, permission matrix dinamis.
// Level akses: none < view < edit < approve < full.
//
//   GET  /api/rbac              — roles + modules + permission matrix
//   POST /api/rbac/permission   — { role_id, module_id, level } upsert

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rbac_permissions (
  role_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'none',
  PRIMARY KEY (role_id, module_id)
);
`;

const ROLES = [
  { id: 'super-admin',    name: 'Super Admin',      cat: 'HQ / IT',     icon: '👑' },
  { id: 'owner',          name: 'Owner / Director', cat: 'Executive',   icon: '💼' },
  { id: 'area-manager',   name: 'Area Manager',     cat: 'Management',  icon: '🗺️' },
  { id: 'outlet-manager', name: 'Outlet Manager',   cat: 'Management',  icon: '🏪' },
  { id: 'supervisor',     name: 'Supervisor',       cat: 'Operations',  icon: '🧭' },
  { id: 'cashier',        name: 'Cashier / Crew',   cat: 'Operations',  icon: '🧑‍💼' },
  { id: 'kitchen',        name: 'Kitchen Staff',    cat: 'Operations',  icon: '👨‍🍳' },
  { id: 'warehouse',      name: 'Warehouse Staff',  cat: 'Operations',  icon: '📦' },
  { id: 'procurement',    name: 'Procurement',      cat: 'Operations',  icon: '🛒' },
  { id: 'finance',        name: 'Finance Staff',    cat: 'Finance',     icon: '💰' },
  { id: 'hr',             name: 'HR Staff',         cat: 'HR',          icon: '👥' },
  { id: 'marketing',      name: 'Marketing Team',   cat: 'Marketing',   icon: '🎯' },
  { id: 'auditor',        name: 'Auditor',          cat: 'Compliance',  icon: '🔍' },
  { id: 'franchise',      name: 'Franchise Owner',  cat: 'Franchise',   icon: '🏛️' },
  { id: 'customer',       name: 'Customer',         cat: 'Customer',    icon: '🙋' },
];
const MODULES = [
  { id: 'pos',         name: 'POS & Transaksi',   icon: '🛒' },
  { id: 'kds',         name: 'Kitchen Display',   icon: '👨‍🍳' },
  { id: 'finance',     name: 'Finance',           icon: '💰' },
  { id: 'stock',       name: 'Stock & Warehouse', icon: '📦' },
  { id: 'procurement', name: 'Procurement',       icon: '📋' },
  { id: 'hr',          name: 'HR & Payroll',      icon: '👥' },
  { id: 'marketing',   name: 'Marketing',         icon: '🎯' },
  { id: 'reward',      name: 'Staff Reward',      icon: '🎮' },
  { id: 'command',     name: 'Command Center',    icon: '🛰️' },
  { id: 'config',      name: 'Config & Outlet',   icon: '⚙️' },
  { id: 'audit',       name: 'Audit Trail',       icon: '🔍' },
  { id: 'rbac',        name: 'Role Management',   icon: '🔐' },
];
const MODULE_IDS = MODULES.map(m => m.id);
const LEVELS = ['none', 'view', 'edit', 'approve', 'full'];

// L = view, E = edit, A = approve, F = full (sisanya none)
const DEFAULTS = {
  'super-admin': 'ALL_FULL',
  'auditor': 'ALL_VIEW',
  'owner':          { command: 'L', finance: 'A', procurement: 'A', hr: 'L', marketing: 'L', reward: 'L', audit: 'L', config: 'L' },
  'area-manager':   { command: 'L', pos: 'L', kds: 'L', stock: 'A', procurement: 'A', hr: 'L', marketing: 'L', reward: 'L', audit: 'L' },
  'outlet-manager': { pos: 'E', kds: 'L', stock: 'E', hr: 'E', marketing: 'L', reward: 'L', command: 'L', audit: 'L' },
  'supervisor':     { pos: 'A', kds: 'L', stock: 'L', audit: 'E' },
  'cashier':        { pos: 'E', marketing: 'L', reward: 'L' },
  'kitchen':        { kds: 'E' },
  'warehouse':      { stock: 'E', procurement: 'L' },
  'procurement':    { procurement: 'E', stock: 'L', finance: 'L' },
  'finance':        { finance: 'F', procurement: 'L', audit: 'L' },
  'hr':             { hr: 'F', reward: 'E', audit: 'L' },
  'marketing':      { marketing: 'F', reward: 'L', command: 'L' },
  'franchise':      { command: 'L', finance: 'L', marketing: 'L', reward: 'L' },
  'customer':       {},
};
const ABBR = { L: 'view', E: 'edit', A: 'approve', F: 'full' };

function defaultsFor(roleId) {
  const d = DEFAULTS[roleId];
  const out = {};
  for (const m of MODULE_IDS) {
    if (d === 'ALL_FULL') out[m] = 'full';
    else if (d === 'ALL_VIEW') out[m] = 'view';
    else out[m] = ABBR[(d || {})[m]] || 'none';
  }
  return out;
}

function setupRBAC(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed matrix dari default (sekali)
  if (db.prepare(`SELECT COUNT(*) c FROM rbac_permissions`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO rbac_permissions (role_id, module_id, level) VALUES (?,?,?)`);
    for (const r of ROLES) {
      const def = defaultsFor(r.id);
      for (const m of MODULE_IDS) ins.run(r.id, m, def[m]);
    }
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const perms = db.prepare(`SELECT role_id, module_id, level FROM rbac_permissions`).all();
    const accessByRole = {};
    for (const p of perms) {
      accessByRole[p.role_id] = (accessByRole[p.role_id] || 0) + (p.level !== 'none' ? 1 : 0);
    }
    res.json({
      roles: ROLES.map(r => ({ ...r, modules_accessible: accessByRole[r.id] || 0 })),
      modules: MODULES,
      levels: LEVELS,
      permissions: perms,
      summary: {
        roles: ROLES.length,
        modules: MODULES.length,
        full_access_roles: ROLES.filter(r => DEFAULTS[r.id] === 'ALL_FULL').length,
        readonly_roles: ROLES.filter(r => DEFAULTS[r.id] === 'ALL_VIEW').length,
      },
    });
  });

  router.post('/permission', (req, res) => {
    const b = req.body || {};
    if (!ROLES.find(r => r.id === b.role_id)) return res.status(400).json({ error: 'role tidak valid' });
    if (!MODULE_IDS.includes(b.module_id)) return res.status(400).json({ error: 'module tidak valid' });
    if (!LEVELS.includes(b.level)) return res.status(400).json({ error: 'level tidak valid' });
    db.prepare(`INSERT INTO rbac_permissions (role_id, module_id, level) VALUES (?,?,?)
      ON CONFLICT(role_id, module_id) DO UPDATE SET level = excluded.level`).run(b.role_id, b.module_id, b.level);
    res.json({ ok: true, role_id: b.role_id, module_id: b.module_id, level: b.level });
  });

  // PATCH by composite key: /:role_id/:module_id — update level
  router.patch('/:role_id/:module_id', (req, res) => {
    const { role_id, module_id } = req.params;
    const row = db.prepare(`SELECT * FROM rbac_permissions WHERE role_id = ? AND module_id = ?`).get(role_id, module_id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    if (b.level === undefined) return res.json({ ok: true, noop: true });
    if (!LEVELS.includes(b.level)) return res.status(400).json({ error: 'level tidak valid' });
    db.prepare(`UPDATE rbac_permissions SET level = ? WHERE role_id = ? AND module_id = ?`).run(b.level, role_id, module_id);
    res.json({ ok: true });
  });

  // DELETE by composite key — reset to 'none'
  router.delete('/:role_id/:module_id', (req, res) => {
    const { role_id, module_id } = req.params;
    const info = db.prepare(`UPDATE rbac_permissions SET level = 'none' WHERE role_id = ? AND module_id = ?`).run(role_id, module_id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  // DELETE entire role's permissions — /:role_id
  router.delete('/:role_id', (req, res) => {
    const info = db.prepare(`UPDATE rbac_permissions SET level = 'none' WHERE role_id = ?`).run(req.params.role_id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true, reset: info.changes });
  });

  const mountPath = opts.mountPath || '/api/rbac';
  app.use(mountPath, router);
  console.log(`[rbac] mounted at ${mountPath} — role & permission matrix`);

  return { router, db };
}

module.exports = { setupRBAC };
