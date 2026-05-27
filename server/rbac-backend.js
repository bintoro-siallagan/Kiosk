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
  // ─── GENERAL (semua modul) ───
  { id: 'manager',        name: 'General Manager',  cat: 'Management',  icon: '👑' },
  { id: 'staff',          name: 'General Staff',    cat: 'Operations',  icon: '👤' },
  // ─── LEGACY MANAGEMENT ───
  { id: 'area-manager',   name: 'Area Manager',     cat: 'Management',  icon: '🗺️' },
  { id: 'outlet-manager', name: 'Outlet Manager',   cat: 'Management',  icon: '🏪' },
  { id: 'supervisor',     name: 'Supervisor',       cat: 'Operations',  icon: '🧭' },
  // ─── F&B DEPT ───
  { id: 'fnb-manager',    name: 'F&B Manager',      cat: 'F&B',         icon: '🍔' },
  { id: 'fnb-spv',        name: 'F&B Supervisor',   cat: 'F&B',         icon: '🧭' },
  { id: 'fnb-staff',      name: 'F&B Staff',        cat: 'F&B',         icon: '👤' },
  // ─── CINEMA DEPT ───
  { id: 'cinema-manager', name: 'Cinema Manager',   cat: 'Cinema',      icon: '🎬' },
  { id: 'cinema-spv',     name: 'Cinema Supervisor',cat: 'Cinema',      icon: '🎬' },
  { id: 'cinema-staff',   name: 'Cinema Staff',     cat: 'Cinema',      icon: '👤' },
  // ─── FINANCE DEPT ───
  { id: 'finance-manager',name: 'Finance Manager',  cat: 'Finance',     icon: '💰' },
  { id: 'finance-spv',    name: 'Finance Supervisor',cat: 'Finance',    icon: '💰' },
  { id: 'finance',        name: 'Finance Staff',    cat: 'Finance',     icon: '💰' },
  // ─── HR ───
  { id: 'hr-manager',     name: 'HR Manager',       cat: 'HR',          icon: '👥' },
  { id: 'hr',             name: 'HR Staff',         cat: 'HR',          icon: '👥' },
  // ─── PROCUREMENT ───
  { id: 'procurement-manager',name:'Procurement Manager',cat:'Operations',icon:'📦' },
  { id: 'procurement',    name: 'Procurement',      cat: 'Operations',  icon: '🛒' },
  // ─── MARKETING ───
  { id: 'marketing-manager',name:'Marketing Manager',cat:'Marketing',   icon:'📢' },
  { id: 'marketing',      name: 'Marketing Team',   cat: 'Marketing',   icon: '🎯' },
  // ─── OPERATIONAL ───
  { id: 'cashier',        name: 'Cashier / Crew',   cat: 'Operations',  icon: '🧑‍💼' },
  { id: 'kasir',          name: 'Kasir',            cat: 'Operations',  icon: '🧾' },
  { id: 'kitchen',        name: 'Kitchen Staff',    cat: 'Operations',  icon: '👨‍🍳' },
  { id: 'warehouse',      name: 'Warehouse Staff',  cat: 'Operations',  icon: '📦' },
  // ─── COMPLIANCE / FRANCHISE / CUSTOMER ───
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
  'super-admin':         'ALL_FULL',
  'auditor':             'ALL_VIEW',
  'owner':               'ALL_FULL',
  // General tier
  'manager':             'ALL_FULL',
  'staff':               'ALL_VIEW',
  // Legacy management
  'area-manager':        { command: 'L', pos: 'L', kds: 'L', stock: 'A', procurement: 'A', hr: 'L', marketing: 'L', reward: 'L', audit: 'L' },
  'outlet-manager':      { pos: 'E', kds: 'L', stock: 'E', hr: 'E', marketing: 'L', reward: 'L', command: 'L', audit: 'L' },
  'supervisor':          { pos: 'A', kds: 'L', stock: 'L', audit: 'E' },
  // F&B
  'fnb-manager':         { pos: 'F', kds: 'F', stock: 'F', marketing: 'L', reward: 'L', audit: 'L' },
  'fnb-spv':             { pos: 'E', kds: 'E', stock: 'E', audit: 'L' },
  'fnb-staff':           { pos: 'L', kds: 'L' },
  // Cinema — modul khusus belum di matrix backend, beri akses operasional umum
  'cinema-manager':      { command: 'L', marketing: 'L', reward: 'L', audit: 'L' },
  'cinema-spv':          { command: 'L', marketing: 'L', audit: 'L' },
  'cinema-staff':        { command: 'L' },
  // Finance
  'finance-manager':     { finance: 'F', procurement: 'A', audit: 'F', command: 'L' },
  'finance-spv':         { finance: 'E', audit: 'L' },  // edit payment OK, delete NO
  'finance':             { finance: 'F', procurement: 'L', audit: 'L' },
  // HR
  'hr-manager':          { hr: 'F', reward: 'F', audit: 'L' },
  'hr':                  { hr: 'F', reward: 'E', audit: 'L' },
  // Procurement
  'procurement-manager': { procurement: 'F', stock: 'F', finance: 'L' },
  'procurement':         { procurement: 'E', stock: 'L', finance: 'L' },
  // Marketing
  'marketing-manager':   { marketing: 'F', reward: 'F', command: 'L' },
  'marketing':           { marketing: 'F', reward: 'L', command: 'L' },
  // Operational
  'cashier':             { pos: 'E', marketing: 'L', reward: 'L' },
  'kasir':               { pos: 'E', marketing: 'L', reward: 'L' },
  'kitchen':             { kds: 'E' },
  'warehouse':           { stock: 'E', procurement: 'L' },
  // Compliance / Franchise / Customer
  'franchise':           { command: 'L', finance: 'L', marketing: 'L', reward: 'L' },
  'customer':            {},
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

  // Seed matrix dari default — pakai INSERT OR IGNORE biar idempotent.
  // Tetap aman dijalankan tiap startup: role baru dapat default,
  // role lama yg udah customize gak ke-overwrite (karena IGNORE on PK conflict).
  const ins = db.prepare(`INSERT OR IGNORE INTO rbac_permissions (role_id, module_id, level) VALUES (?,?,?)`);
  for (const r of ROLES) {
    const def = defaultsFor(r.id);
    for (const m of MODULE_IDS) ins.run(r.id, m, def[m]);
  }

  // Custom roles table — selain 15 ROLES hardcoded, admin bisa tambah role baru
  db.exec(`CREATE TABLE IF NOT EXISTS rbac_custom_roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cat TEXT,
    icon TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);

  function allRoles() {
    const custom = db.prepare(`SELECT id, name, cat, icon FROM rbac_custom_roles ORDER BY created_at`).all();
    return [...ROLES, ...custom.map(c => ({ ...c, custom: true }))];
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const perms = db.prepare(`SELECT role_id, module_id, level FROM rbac_permissions`).all();
    const accessByRole = {};
    for (const p of perms) {
      accessByRole[p.role_id] = (accessByRole[p.role_id] || 0) + (p.level !== 'none' ? 1 : 0);
    }
    const roles = allRoles();
    res.json({
      roles: roles.map(r => ({ ...r, modules_accessible: accessByRole[r.id] || 0 })),
      modules: MODULES,
      levels: LEVELS,
      permissions: perms,
      summary: {
        roles: roles.length,
        modules: MODULES.length,
        full_access_roles: ROLES.filter(r => DEFAULTS[r.id] === 'ALL_FULL').length,
        readonly_roles: ROLES.filter(r => DEFAULTS[r.id] === 'ALL_VIEW').length,
        custom_roles: roles.filter(r => r.custom).length,
      },
    });
  });

  // POST /roles — tambah custom role
  router.post('/roles', (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name wajib diisi' });
    // Auto-generate id dari name kalau gak provide
    const id = String(b.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 40);
    if (!id) return res.status(400).json({ error: 'id role tidak valid' });
    // Check duplicate (hardcoded ROLES + custom)
    if (ROLES.find(r => r.id === id)) return res.status(409).json({ error: `role '${id}' sudah ada sebagai built-in` });
    const exists = db.prepare(`SELECT id FROM rbac_custom_roles WHERE id = ?`).get(id);
    if (exists) return res.status(409).json({ error: `role '${id}' sudah ada` });
    try {
      db.prepare(`INSERT INTO rbac_custom_roles (id, name, cat, icon) VALUES (?,?,?,?)`)
        .run(id, name, b.cat || 'Custom', b.icon || '⚙️');
      // Seed default permissions = 'none' untuk semua module (admin atur manual lewat matrix)
      const ins = db.prepare(`INSERT OR IGNORE INTO rbac_permissions (role_id, module_id, level) VALUES (?,?,?)`);
      for (const m of MODULE_IDS) ins.run(id, m, b.default_level || 'none');
      res.json({ ok: true, id, name, custom: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PATCH /roles/:id — rename / update icon
  router.patch('/roles/:id', (req, res) => {
    const b = req.body || {};
    const row = db.prepare(`SELECT * FROM rbac_custom_roles WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'custom role tidak ditemukan (built-in roles tidak bisa di-rename)' });
    const fields = []; const args = [];
    if (b.name) { fields.push('name = ?'); args.push(String(b.name).trim()); }
    if (b.cat) { fields.push('cat = ?'); args.push(String(b.cat)); }
    if (b.icon) { fields.push('icon = ?'); args.push(String(b.icon)); }
    if (!fields.length) return res.json({ ok: true, noop: true });
    args.push(req.params.id);
    db.prepare(`UPDATE rbac_custom_roles SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  // DELETE /roles/:id — hapus custom role + cleanup permissions
  router.delete('/roles/:id', (req, res) => {
    if (ROLES.find(r => r.id === req.params.id)) {
      return res.status(400).json({ error: 'role built-in tidak bisa dihapus' });
    }
    const row = db.prepare(`SELECT id FROM rbac_custom_roles WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    db.prepare(`DELETE FROM rbac_custom_roles WHERE id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM rbac_permissions WHERE role_id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/permission', (req, res) => {
    const b = req.body || {};
    const validRole = ROLES.find(r => r.id === b.role_id) || db.prepare(`SELECT id FROM rbac_custom_roles WHERE id = ?`).get(b.role_id);
    if (!validRole) return res.status(400).json({ error: 'role tidak valid' });
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
