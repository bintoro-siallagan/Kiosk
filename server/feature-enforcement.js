// server/feature-enforcement.js
// Multi-tenant 402 Payment Required enforcement.
// Maps endpoint URL → required feature, blocks if tenant's plan tidak mengandung.
//
// Loaded by index.js → app.use(featureGateMiddleware) right after scope middleware.

const Database = require('better-sqlite3');
const path = require('path');

// Plan → array of feature codes (mirror dari billing-engine-backend.js PLAN_FEATURES)
const PLAN_FEATURES_LOCAL = {
  TRIAL: ['*'],
  STARTER:    ['pos','kiosk','qr_order','dashboard','menu','settings','departments'],
  GROWTH:     ['pos','kiosk','qr_order','dashboard','menu','settings','departments',
               'loyalty','promo','reward','membership','customer_intel',
               'inventory','item_master','stock_opname','goods_received','goods_delivery','supplier','procurement','auto_reorder','batch_tracking','production'],
  PRO:        ['pos','kiosk','qr_order','dashboard','menu','settings','departments',
               'loyalty','promo','reward','membership','customer_intel',
               'inventory','item_master','stock_opname','goods_received','goods_delivery','supplier','procurement','auto_reorder','batch_tracking','production',
               'finance','finance_center','ar','ap','budget','journal','gl','coa','reconciliation','tax','food_cost','cash_flow','fin_statements','period_closing','payroll_finance',
               'hr','hris','payroll','shift_roster','attendance','talenta','leave','motivation','reward_staff',
               'marketing','campaign','crm','broadcast','geo_engagement','clv_churn','feedback_segment'],
  ENTERPRISE: ['*'],
};

// Endpoint URL prefix → required feature.
// Order matters: more specific patterns FIRST.
const ENDPOINT_RULES = [
  // ── BASE (semua plan boleh) — skip gating ──
  { match: /^\/api\/(pos|kds|cds|kiosk|menu|orders|outlet-master|departments|customers|reviews)(\/|$|\?)/, feature: null }, // null = no gate
  { match: /^\/api\/(auth|companies|billing|onboarding|health|signage|marquee|rbac|notifications|notification-center|self-audit|seed|tools|webhooks|bridge|menu|toppings|kiosk)(\/|$|\?)/, feature: null },
  { match: /^\/api\/(item-master|item-pricing|item-config|item-rules|item-intel|master-)/, feature: null },
  { match: /^\/api\/(payment-gateway|aggregator|convenience-fee|refund-cancel|anti-fraud)/, feature: null },
  { match: /^\/api\/(remote-ops|launch|service|outlet-launch|incidents|escalation)/, feature: null }, // KROC features — assume base for multi-outlet, gated separately at module level
  { match: /^\/api\/(role-dashboard|rbac|admin-users|approval|device-session|security-center|email)/, feature: null },

  // ── LOYALTY ──
  { match: /^\/api\/(loyalty|loyalty-promo|reward|reward-benefit|customer-intel|feedback-segment|clv-churn|geo-engagement|promos)/, feature: 'loyalty' },
  { match: /^\/api\/(broadcast|campaign|campaign-impact|engagement|marketing-behavior|pos-behavior|promo-insight)/, feature: 'marketing' },

  // ── INVENTORY ──
  { match: /^\/api\/(stock-list|stock-opname|stock-transfer|goods-received|goods-delivery|supplier-master|simple-purchase|procurement|procurement-gaps|auto-reorder|batch-tracking|purchase-invoice|purchase-return|internal-return|asset-maintenance|demand-forecast|food-cost|food-cost-calc|production|sales-stock-sync)/, feature: 'inventory' },

  // ── FINANCE ──
  { match: /^\/api\/(finance|finance-center|finance-alert|ar|ar-aging|ap-aging|journal|general-ledger|coa|reconciliation|release-payment|settlement|fin-statements|financial-statements|budget|budget-plan|petty-cash|period-closing|cash-flow|core-tax|bank-recon)/, feature: 'finance' },

  // ── HR ──
  { match: /^\/api\/(hr-command|hris|payroll|talenta|shift-roster|user-kpi|cashier-kpi|motivation)/, feature: 'hr' },

  // ── CINEMA ──
  { match: /^\/api\/cinema(\/|$)/, feature: 'cinema_all' },

  // ── ENTERPRISE (compliance suite) ──
  { match: /^\/api\/(quality|internal-audit|document-hub|helpdesk|risk|contract|rfq|compliance|consolidation|sales-pipeline|franchise|sales-order|sales-invoice|sales-return|b2b-customer|quotation|delivery-order)/, feature: 'cinema_all' /* re-use cinema_all marker = Enterprise-only */ },
];

// Cache: company_id → { features, expiresAt }
const _cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function getTenantFeatures(db, companyId) {
  if (companyId == null) return ['*'];
  const cached = _cache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.features;
  try {
    const tb = db.prepare(`SELECT plan_code FROM tenant_billing WHERE company_id = ? AND status = 'active'`).get(companyId);
    const features = tb ? (PLAN_FEATURES_LOCAL[tb.plan_code] || []) : [];
    _cache.set(companyId, { features, expiresAt: Date.now() + CACHE_TTL_MS });
    return features;
  } catch { return []; }
}

function clearCache(companyId) {
  if (companyId == null) _cache.clear();
  else _cache.delete(companyId);
}

function lookupRequiredFeature(pathname) {
  for (const rule of ENDPOINT_RULES) {
    if (rule.match.test(pathname)) return rule.feature;
  }
  return null; // unknown → allow (fail-open for safety)
}

function setupFeatureEnforcement(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  app.use((req, res, next) => {
    // Bypass super-admin
    const sc = req.companyScope || {};
    if (sc.is_super_admin || sc.company_id == null) return next();

    const feature = lookupRequiredFeature(req.path || req.url || '');
    if (!feature) return next(); // public/base endpoint

    const features = getTenantFeatures(db, sc.company_id);
    if (features.includes('*') || features.includes(feature)) return next();

    // 402 — feature not in plan
    return res.status(402).json({
      error: 'Payment Required',
      message: `Fitur ini bagian dari plan yang belum kamu subscribe. Upgrade dulu di Billing.`,
      required_feature: feature,
      tenant_features: features,
      upgrade_url: '/?admin#billing',
    });
  });

  console.log('[feature-enforcement] middleware armed — 402 untuk endpoint yg feature-nya gak di-cover plan');
  return { clearCache, getTenantFeatures: (cid) => getTenantFeatures(db, cid) };
}

module.exports = { setupFeatureEnforcement, clearCache };
