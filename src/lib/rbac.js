// src/lib/rbac.js — Shared RBAC helper (frontend)
// Lazy preset matrix: role → { module: level }
// Wildcard support: 'cinema-*' match cinema-ops, cinema-pos, dll
// Default '*' = fallback level untuk modul yg gak listed.

// Level hierarchy:
//   none  (0) — no access at all (gak lihat menu)
//   view  (1) — read-only (list, detail)
//   update (2) — edit existing (PUT/PATCH) + create new (POST)
//   full  (3) — semua di atas + delete + approve

const LEVEL_NUM = { none: 0, view: 1, update: 2, full: 3 };

// Action-to-minimum-level required
const ACTION_NEEDS = {
  view: 1, list: 1, read: 1,
  update: 2, edit: 2, create: 2, add: 2,
  delete: 3, remove: 3,
  approve: 3, reject: 3, refund: 3,
};

// Role preset matrix
// Module names: pos, kds, kiosk, flow, finance, stock, procurement, hr,
// menu, promo, customers, reports, settings, users, branding,
// cinema-ops, cinema-pos, cinema-snack, cinema-tickets, cinema-promotion
const ROLE_PRESETS = {
  // ─── PLATFORM ───
  'super-admin':     { '*': 'full' },
  'owner':           { '*': 'full' },

  // ─── GENERAL (semua modul) ───
  'manager':         { '*': 'full' },
  'supervisor':      { '*': 'update' },
  'staff':           { '*': 'view' },

  // ─── DEPARTMENT-SPECIFIC ───
  // FNB
  'fnb-manager':     { 'pos': 'full', 'kds': 'full', 'stock': 'full', 'menu': 'full', 'promo': 'full', 'customers': 'full', 'reports': 'view', '*': 'none' },
  'fnb-spv':         { 'pos': 'update', 'kds': 'update', 'stock': 'update', 'menu': 'update', 'promo': 'view', 'customers': 'view', 'reports': 'view', '*': 'none' },
  'fnb-staff':       { 'pos': 'view', 'kds': 'view', 'menu': 'view', '*': 'none' },

  // Cinema
  'cinema-manager':  { 'cinema-*': 'full', 'reports': 'view', '*': 'none' },
  'cinema-spv':      { 'cinema-*': 'update', 'reports': 'view', '*': 'none' },
  'cinema-staff':    { 'cinema-*': 'view', '*': 'none' },

  // Finance
  'finance-manager': { 'finance': 'full', 'reports': 'full', 'orders': 'view', '*': 'view' },
  'finance-spv':     { 'finance': 'update', 'reports': 'view', 'orders': 'view', '*': 'none' },  // edit payment OK, delete NO
  'finance-staff':   { 'finance': 'view', 'reports': 'view', '*': 'none' },

  // HR
  'hr-manager':      { 'hr': 'full', 'users': 'full', '*': 'none' },
  'hr-spv':          { 'hr': 'update', 'users': 'view', '*': 'none' },
  'hr-staff':        { 'hr': 'update', '*': 'none' },  // edit OK, delete NO

  // Procurement
  'procurement-manager': { 'procurement': 'full', 'stock': 'full', '*': 'view' },
  'procurement-spv':     { 'procurement': 'update', 'stock': 'update', '*': 'none' },
  'procurement-staff':   { 'procurement': 'update', 'stock': 'view', '*': 'none' },

  // Marketing
  'marketing-manager': { 'promo': 'full', 'customers': 'full', 'branding': 'full', '*': 'view' },
  'marketing-spv':     { 'promo': 'update', 'customers': 'view', '*': 'none' },
  'marketing-staff':   { 'promo': 'update', 'customers': 'view', '*': 'none' },  // edit promo OK, delete NO

  // Operational roles
  'kasir':           { 'pos': 'update', 'cinema-pos': 'update', 'orders': 'view', '*': 'none' },
  'kitchen':         { 'kds': 'update', 'menu': 'view', '*': 'none' },
  'warehouse':       { 'stock': 'update', 'procurement': 'view', '*': 'none' },
};

// Get level for role + module (walks wildcard)
export function getLevel(role, module) {
  const perms = ROLE_PRESETS[role] || {};
  // Exact match
  if (perms[module]) return perms[module];
  // Wildcard prefix
  for (const key of Object.keys(perms)) {
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      if (module.startsWith(prefix)) return perms[key];
    }
  }
  return perms['*'] || 'none';
}

// Check: bisa lakukan action di modul?
export function canDo(role, module, action) {
  if (!role) return false;
  const level = getLevel(role, module);
  const have = LEVEL_NUM[level] || 0;
  const need = ACTION_NEEDS[action] || 1;
  return have >= need;
}

// Convenience helpers
export function canView(role, module) { return canDo(role, module, 'view'); }
export function canEdit(role, module) { return canDo(role, module, 'update'); }
export function canDelete(role, module) { return canDo(role, module, 'delete'); }
export function canApprove(role, module) { return canDo(role, module, 'approve'); }

// List role utk dropdown (label + key)
export const ROLE_LIST = [
  { id: 'owner',              name: 'Owner / Director',     icon: '💼', desc: 'Akses penuh semua modul' },
  { id: 'manager',            name: 'General Manager',      icon: '👑', desc: 'Akses penuh semua modul (selain platform admin)' },
  { id: 'supervisor',         name: 'General Supervisor',   icon: '🧭', desc: 'Bisa edit semua, tidak bisa delete/approve' },
  { id: 'staff',              name: 'General Staff',        icon: '👤', desc: 'View-only semua modul' },
  { id: 'fnb-manager',        name: 'F&B Manager',          icon: '🍔', desc: 'Full akses POS/KDS/Stock/Menu/Promo F&B' },
  { id: 'fnb-spv',            name: 'F&B Supervisor',       icon: '🧭', desc: 'Edit POS/KDS/Stock/Menu, view promo/customer' },
  { id: 'fnb-staff',          name: 'F&B Staff',            icon: '👤', desc: 'View POS/KDS/Menu' },
  { id: 'cinema-manager',     name: 'Cinema Manager',       icon: '🎬', desc: 'Full akses semua modul Cinema' },
  { id: 'cinema-spv',         name: 'Cinema Supervisor',    icon: '🎬', desc: 'Edit modul Cinema, tidak bisa delete' },
  { id: 'cinema-staff',       name: 'Cinema Staff',         icon: '👤', desc: 'View-only modul Cinema' },
  { id: 'finance-manager',    name: 'Finance Manager',      icon: '💰', desc: 'Full Finance + Reports, view operasional' },
  { id: 'finance-spv',        name: 'Finance Supervisor',   icon: '💰', desc: 'Edit payment, view reports' },
  { id: 'finance-staff',      name: 'Finance Staff',        icon: '💰', desc: 'View finance + reports' },
  { id: 'hr-manager',         name: 'HR Manager',           icon: '👥', desc: 'Full HR + User Management' },
  { id: 'hr-spv',             name: 'HR Supervisor',        icon: '🧭', desc: 'Edit HR, view users' },
  { id: 'hr-staff',           name: 'HR Staff',             icon: '👤', desc: 'Edit HR (tidak bisa hapus)' },
  { id: 'procurement-manager', name: 'Procurement Manager', icon: '📦', desc: 'Full Procurement + Stock' },
  { id: 'procurement-spv',    name: 'Procurement Supervisor', icon: '🧭', desc: 'Edit procurement + stock, no delete' },
  { id: 'procurement-staff',  name: 'Procurement Staff',    icon: '👤', desc: 'Edit procurement (tidak bisa hapus)' },
  { id: 'marketing-manager',  name: 'Marketing Manager',    icon: '📢', desc: 'Full Promo + Customer + Branding' },
  { id: 'marketing-spv',      name: 'Marketing Supervisor', icon: '🧭', desc: 'Edit promo, view customer' },
  { id: 'marketing-staff',    name: 'Marketing Staff',      icon: '👤', desc: 'Edit promo (tidak bisa hapus)' },
  { id: 'kasir',              name: 'Kasir / Cashier',      icon: '🧾', desc: 'Hanya POS + Cinema POS' },
  { id: 'kitchen',            name: 'Kitchen Staff',        icon: '👨‍🍳', desc: 'Hanya KDS + view menu' },
  { id: 'warehouse',          name: 'Warehouse Staff',      icon: '📦', desc: 'Hanya Stock + view Procurement' },
];
