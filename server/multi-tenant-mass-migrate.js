// server/multi-tenant-mass-migrate.js
// One-shot migration: ALTER all leaky tables → ADD COLUMN company_id INTEGER
// + backfill semua row existing ke company_id=1 (BTS legacy data).
// + plus generic response-filter middleware untuk runtime isolation.
//
// Loaded by index.js sebelum server.listen.

const Database = require('better-sqlite3');
const path = require('path');

// Tabel yang NULL-able tetap company_id NULL (global config, shared catalog):
const SKIP_TABLES = new Set([
  'sqlite_sequence', 'sqlite_stat1', 'sqlite_stat4',
  // Shared catalogs (intentionally cross-tenant):
  'billing_plans',              // SaaS plan catalog — shared
  'cinema_distributors',         // film distributors — shared
  'cinema_genre_combos',         // genre map — shared
  'admin_roles', 'rbac_modules', 'rbac_permissions',  // RBAC matrix — shared
  // Session / audit / logs — global, not per-tenant:
  'admin_login_audit', 'admin_session_log',
  'password_reset_tokens', 'login_attempts',
  // Companies table itself:
  'companies',
]);

// Tabel yang dimiliki BTS (company_id=1) historis (F&B):
const FNB_LEGACY_TABLES = new Set([
  'orders', 'customers', 'menu_overrides', 'pos_menus', 'pos_menu_categories',
  'pos_menu_extras', 'pos_menu_extra_groups', 'pos_menu_extra_assignments',
  'pos_menu_sizes', 'pos_menu_size_variants', 'pos_menu_packages',
  'menu_recipes', 'item_master',
  'kds_tickets', 'kds_tracking',
  'loyalty_customers', 'point_transactions', 'rewards_redeemed',
  'promos', 'campaigns', 'auto_promos',
  'stock_movements', 'inventory_items', 'inventory_low_stock',
  'reviews_kiosk',
  // ... yang lain default ke 1
]);

// Tabel yang dimiliki CMX (company_id=2) — Cinema:
const CINEMA_LEGACY_TABLES = new Set([
  'cinema_tickets', 'cinema_films', 'cinema_showtimes', 'cinema_studios',
  'cinema_promotions', 'cinema_bundles', 'cinema_loyalty', 'cinema_loyalty_transactions',
  'cinema_party_packages', 'cinema_party_bookings',
  'cinema_subscription_plans', 'cinema_subscriptions',
  'cinema_cleaning_schedule', 'cinema_holidays', 'cinema_seat_types',
  'cinema_price_list', 'cinema_outlet_pricing', 'cinema_inventory_items',
  'cinema_promo_redeem',
]);

function massMigrate(opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
  let added = 0, backfilled = 0, skipped = 0;

  for (const { name: t } of tables) {
    if (SKIP_TABLES.has(t)) { skipped++; continue; }
    const cols = db.prepare(`PRAGMA table_info("${t}")`).all();
    const hasCompanyId = cols.some(c => c.name === 'company_id');
    if (!hasCompanyId) {
      try {
        db.exec(`ALTER TABLE "${t}" ADD COLUMN company_id INTEGER`);
        added++;
      } catch (e) {
        if (!String(e.message || '').includes('duplicate column')) {
          console.warn(`[multi-tenant-migrate] ALTER ${t} failed: ${e.message}`);
        }
      }
    }
    // Backfill: rows with NULL company_id → default by table heuristic
    try {
      const nullRows = db.prepare(`SELECT COUNT(*) c FROM "${t}" WHERE company_id IS NULL`).get();
      if (nullRows.c > 0) {
        const defaultCid = CINEMA_LEGACY_TABLES.has(t) ? 2 : 1;
        db.prepare(`UPDATE "${t}" SET company_id = ? WHERE company_id IS NULL`).run(defaultCid);
        backfilled += nullRows.c;
      }
    } catch {}
  }

  console.log(`[multi-tenant-migrate] altered ${added} tables, backfilled ${backfilled} rows, skipped ${skipped} system/shared tables`);
  return { added, backfilled, skipped };
}

// ─── GENERIC RESPONSE FILTER MIDDLEWARE ───────────────────────────────────
// Intercepts res.json — strips items with company_id != tenant scope.
// Bypassed untuk: super-admin, path tertentu (auth, billing, signage public, dst).
const BYPASS_PATH_PREFIXES = [
  '/api/auth/',                  // login flow uses other guards
  '/api/health',
  '/api/companies/signup',       // public signup
  '/api/billing/plans',          // public plan catalog
  '/api/billing/my',              // self-scoped via /my pattern
  '/api/marquee',                // shared marquee feed
  '/api/cinema/loyalty-tiers',   // shared tier defn
  '/api/rbac',                   // RBAC matrix shared
  '/api/departments',            // shared dept catalog
  '/api/notifications/test',
  '/api/cinema/films',           // already filtered by cinema-backend
  '/api/cinema/showtimes',
  '/api/cinema/studios',
];

const ARRAY_KEYS_TO_SCAN = [
  'data', 'items', 'rows', 'list', 'results',
  'orders', 'customers', 'tickets', 'films', 'showtimes', 'studios',
  'outlets', 'users', 'employees', 'launches', 'notifications', 'feeds',
  'promos', 'campaigns', 'memberships', 'plans', 'subscriptions',
  'invoices', 'expenses', 'receipts', 'transactions', 'audit', 'submissions',
  'logs', 'incidents', 'requests', 'approvals', 'documents', 'reviews',
  'feedback', 'assets', 'contracts', 'risks', 'audits', 'inventory',
  'menu', 'menus', 'categories', 'recipes', 'pricing', 'packages',
  'reservations', 'bookings', 'tasks', 'shifts', 'payslips', 'payments',
  'leaves', 'rosters', 'reorders', 'returns', 'deliveries', 'quotations',
  'rfqs', 'pos', 'kds', 'tippools', 'kpis',
];

function shouldBypass(pathname) {
  return BYPASS_PATH_PREFIXES.some(p => pathname.startsWith(p));
}

// Filter array of objects by company_id match
function filterByScope(arr, companyId) {
  return arr.filter(x => {
    if (x == null || typeof x !== 'object') return true;
    const cid = x.company_id;
    return cid == null || cid === companyId;
  });
}

function scopeFilterMiddleware(req, res, next) {
  const sc = req.companyScope || {};
  // Super-admin atau no scope set → bypass
  if (sc.is_super_admin || sc.company_id == null) return next();
  const path = req.path || req.url || '';
  if (shouldBypass(path)) return next();

  const _json = res.json.bind(res);
  res.json = (body) => {
    try {
      if (Array.isArray(body)) {
        body = filterByScope(body, sc.company_id);
      } else if (body && typeof body === 'object') {
        for (const k of ARRAY_KEYS_TO_SCAN) {
          if (Array.isArray(body[k])) {
            const before = body[k].length;
            body[k] = filterByScope(body[k], sc.company_id);
            // Adjust 'total' if exists (common pagination pattern)
            if (typeof body.total === 'number' && k === 'data') {
              body.total = body[k].length;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[scope-filter] error', e.message);
    }
    return _json(body);
  };
  next();
}

module.exports = { massMigrate, scopeFilterMiddleware };
