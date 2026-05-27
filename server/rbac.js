// server/rbac.js — Server-side RBAC helpers
// Mirror logic dari src/lib/rbac.js (kept in sync manually).

const LEVEL_NUM = { none: 0, view: 1, update: 2, full: 3 };
const ACTION_NEEDS = {
  view: 1, list: 1, read: 1,
  update: 2, edit: 2, create: 2, add: 2,
  delete: 3, remove: 3,
  approve: 3, reject: 3, refund: 3,
};

const ROLE_PRESETS = {
  'super-admin':     { '*': 'full' },
  'owner':           { '*': 'full' },
  'manager':         { '*': 'full' },
  'supervisor':      { '*': 'update' },
  'staff':           { '*': 'view' },
  'fnb-manager':     { 'pos': 'full', 'kds': 'full', 'stock': 'full', 'menu': 'full', 'promo': 'full', 'customers': 'full', 'reports': 'view', '*': 'none' },
  'fnb-spv':         { 'pos': 'update', 'kds': 'update', 'stock': 'update', 'menu': 'update', 'promo': 'view', 'customers': 'view', 'reports': 'view', '*': 'none' },
  'fnb-staff':       { 'pos': 'view', 'kds': 'view', 'menu': 'view', '*': 'none' },
  'cinema-manager':  { 'cinema-*': 'full', 'reports': 'view', '*': 'none' },
  'cinema-spv':      { 'cinema-*': 'update', 'reports': 'view', '*': 'none' },
  'cinema-staff':    { 'cinema-*': 'view', '*': 'none' },
  'finance-manager': { 'finance': 'full', 'reports': 'full', 'orders': 'view', '*': 'view' },
  'finance-spv':     { 'finance': 'update', 'reports': 'view', 'orders': 'view', '*': 'none' },
  'finance-staff':   { 'finance': 'view', 'reports': 'view', '*': 'none' },
  'hr-manager':      { 'hr': 'full', 'users': 'full', '*': 'none' },
  'hr-spv':          { 'hr': 'update', 'users': 'view', '*': 'none' },
  'hr-staff':        { 'hr': 'update', '*': 'none' },
  'procurement-manager': { 'procurement': 'full', 'stock': 'full', '*': 'view' },
  'procurement-spv':     { 'procurement': 'update', 'stock': 'update', '*': 'none' },
  'procurement-staff':   { 'procurement': 'update', 'stock': 'view', '*': 'none' },
  'marketing-manager': { 'promo': 'full', 'customers': 'full', 'branding': 'full', '*': 'view' },
  'marketing-spv':     { 'promo': 'update', 'customers': 'view', '*': 'none' },
  'marketing-staff':   { 'promo': 'update', 'customers': 'view', '*': 'none' },
  'kasir':           { 'pos': 'update', 'cinema-pos': 'update', 'orders': 'view', '*': 'none' },
  'kitchen':         { 'kds': 'update', 'menu': 'view', '*': 'none' },
  'warehouse':       { 'stock': 'update', 'procurement': 'view', '*': 'none' },
};

function getLevel(role, module) {
  const perms = ROLE_PRESETS[role] || {};
  if (perms[module]) return perms[module];
  for (const key of Object.keys(perms)) {
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      if (module.startsWith(prefix)) return perms[key];
    }
  }
  return perms['*'] || 'none';
}

function canDo(role, module, action) {
  if (!role) return false;
  const level = getLevel(role, module);
  const have = LEVEL_NUM[level] || 0;
  const need = ACTION_NEEDS[action] || 1;
  return have >= need;
}

// Express middleware: requireLevel('finance', 'update')
// Returns 403 kalau current session.role tidak punya level minimum
function requireLevel(module, action, getSession) {
  return (req, res, next) => {
    const sess = (typeof getSession === 'function') ? getSession(req) : (req.session || req.adminUser);
    const role = sess?.role;
    if (!role) return res.status(401).json({ error: 'Not authenticated' });
    if (!canDo(role, module, action)) {
      return res.status(403).json({ error: `Role "${role}" tidak punya akses ${action} pada modul ${module}` });
    }
    next();
  };
}

module.exports = { getLevel, canDo, requireLevel, ROLE_PRESETS };
