// adminModules.js — shared catalog of AdminTools modules.
// TABS  = every admin module ({ id, label, color }).
// GROUPS = category grouping ({ name, icon, module, ids }).
// Used by AdminTools (its module sidebar) and AdminHome (the Tools rail submenu).

export const TABS = [
  { id: "dashboard", label: "📊 Owner Dashboard", color: "#F59E0B" },
  { id: "optimization", label: "📈 Optimization Center", color: "#0ea5e9" },
  { id: "staff", label: "👤 Staff & PIN", color: "#F59E0B" },
  { id: "gudang", label: "📦 Gudang & Stok", color: "#3B82F6" },
  { id: "waste", label: "🗑️ Log Waste", color: "#F97316" },
  { id: "config", label: "⚙️ Konfigurasi", color: "#A78BFA" },
  { id: "audit", label: "📋 Audit Trail", color: "#14B8A6" },
  { id: "master", label: "🍽️ Master Item", color: "#EC4899" },
  { id: "finance", label: "💰 Finance", color: "#10B981" },
  { id: "menu_builder", label: "🧱 Menu Builder", color: "#8B5CF6" },
  { id: "procurement_plus", label: "🚚 Procurement+", color: "#06B6D4" },
  { id: "aggregator", label: "🛵 Aggregator", color: "#FB7185" },
  { id: "payment", label: "💳 Payment Gateway", color: "#22D3EE" },
  { id: "loyalty", label: "🏅 Loyalty", color: "#FBBF24" },
  { id: "cashier_kpi", label: "📊 KPI Kasir", color: "#34D399" },
  { id: "checklist", label: "✅ Checklist", color: "#10B981" },
  { id: "hris", label: "👥 HRIS", color: "#A78BFA" },
  { id: "broadcast", label: "📣 Broadcast", color: "#f97316" },
  { id: "price_list", label: "💲 Price List", color: "#10b981" },
  { id: "goods_delivery", label: "🚚 Good Delivery", color: "#06B6D4" },
  { id: "goods_received", label: "📥 Good Received", color: "#0e7490" },
  { id: "stock_opname", label: "📋 Stock Opname", color: "#0891b2" },
  { id: "production", label: "🏭 Production", color: "#9a3412" },
  { id: "stock_transfer", label: "🔄 Stock Transfer", color: "#2563eb" },
  { id: "batch_tracking", label: "📅 Batch & Expiry", color: "#ca8a04" },
  { id: "outlet_master", label: "🏪 Outlet Master", color: "#15803d" },
  { id: "incidents", label: "🚨 Incident", color: "#dc2626" },
  { id: "escalation", label: "🚨 Escalation Matrix", color: "#ef4444" },
  { id: "cinema_ops", label: "🎬 Cinema Ops", color: "#a855f7" },
  { id: "cinema_ticketing", label: "🎟️ Cinema Ticketing", color: "#a855f7" },
  { id: "cinema_box_office", label: "🎬 Cinema Box Office", color: "#a855f7" },
  { id: "cinema_validate", label: "🎟️ Validasi Tiket Cinema", color: "#a855f7" },
  { id: "cinema_refund", label: "🔁 Refund Tiket Cinema", color: "#f59e0b" },
  { id: "cinema_bundles", label: "🍿 Cinema F&B Bundles", color: "#f59e0b" },
  { id: "cinema_bundle_redeem", label: "🍿 F&B Redemption Counter", color: "#f59e0b" },
  { id: "cinema_distribution", label: "🎬 Film Distribution & Settlement", color: "#a855f7" },
  { id: "cinema_in_studio_queue", label: "🍿 In-Studio Order Queue", color: "#f59e0b" },
  { id: "cinema_event_booking", label: "🎉 Studio Event Booking", color: "#a855f7" },
  { id: "cinema_price_list", label: "💲 Cinema Price List", color: "#10b981" },
  { id: "cinema_command_center", label: "🎬 Cinema Command Center", color: "#a855f7" },
  { id: "cinema_dashboard", label: "📊 Cinema Dashboard Reporting", color: "#a855f7" },
  { id: "cinema_emergency", label: "🚨 Cinema Emergency Ops", color: "#ef4444" },
  { id: "cinema_closing", label: "🧾 Cinema Daily Closing Report", color: "#fbbf24" },
  { id: "cinema_promotion", label: "🎁 Cinema Promotion", color: "#f59e0b" },
  { id: "cinema_loyalty", label: "🎫 Cinema Loyalty", color: "#fbbf24" },
  { id: "cinema_party", label: "🎂 Cinema Party Packages", color: "#ec4899" },
  { id: "cinema_subscriptions", label: "🎟️ Cinema Subscription Pass", color: "#a855f7" },
  { id: "cinema_holidays", label: "📅 Cinema Holiday Calendar", color: "#fbbf24" },
  { id: "cinema_seat_types", label: "💺 Cinema Seat Types", color: "#ec4899" },
  { id: "cinema_crm", label: "👥 Cinema CRM", color: "#22d3ee" },
  { id: "cinema_analytics", label: "📊 Cinema Analytics", color: "#a855f7" },
  { id: "cinema_campaign", label: "🎉 Cinema Campaign", color: "#ec4899" },
  { id: "cinema_inventory", label: "🍿 Cinema Inventory", color: "#10b981" },
  { id: "signage", label: "📺 Digital Signage", color: "#9333ea" },
  { id: "marquee", label: "📣 Text Jalan / Marquee", color: "#fbbf24" },
  { id: "platform", label: "🛰️ Karys Platform (Super-Admin)", color: "#fbbf24" },
  { id: "billing", label: "💳 Billing & Subscription", color: "#10b981" },
  { id: "demand_forecast", label: "📈 Demand Forecast", color: "#0284c7" },
  { id: "asset_maintenance", label: "🔧 Asset & Maintenance", color: "#78716c" },
  { id: "shift_roster", label: "📆 Shift Roster", color: "#059669" },
  { id: "notif_center", label: "🔔 Notification Center", color: "#db2777" },
  { id: "auto_reorder", label: "🔁 Auto-Reorder", color: "#3730a3" },
  { id: "purchase_return", label: "↩️ Purchase Return", color: "#be123c" },
  { id: "internal_return", label: "🔁 Internal Return", color: "#9f1239" },
  { id: "stock_list", label: "📃 Stock List", color: "#155e75" },
  { id: "quotation", label: "💬 Quotation", color: "#6366f1" },
  { id: "sales_order", label: "📑 Sales Order", color: "#6d28d9" },
  { id: "delivery_order", label: "🚛 Delivery Order", color: "#0891b2" },
  { id: "sales_invoice", label: "🧾 Sales Invoice", color: "#4338ca" },
  { id: "sales_return", label: "↪️ Sales Return", color: "#7e22ce" },
  { id: "b2b_customer", label: "🏢 B2B Customer", color: "#5b21b6" },
  { id: "sales_stock_sync", label: "🔗 Sales→Stock Sync", color: "#14b8a6" },
  { id: "simple_purchase", label: "🛒 Simple Purchase", color: "#65a30d" },
  { id: "petty_cash", label: "💵 Petty Cash", color: "#d97706" },
  { id: "purchase_invoice", label: "🧾 Invoice", color: "#a78bfa" },
  { id: "settlement", label: "🧮 Settlement", color: "#10b981" },
  { id: "journal", label: "📓 Jurnal", color: "#a78bfa" },
  { id: "coa", label: "📚 Chart of Accounts", color: "#1d4ed8" },
  { id: "general_ledger", label: "📒 General Ledger", color: "#0369a1" },
  { id: "reconciliation", label: "⚖️ Reconciliation", color: "#0d9488" },
  { id: "release_payment", label: "💸 Release Payment", color: "#c2410c" },
  { id: "period_closing", label: "🔒 Tutup Periode", color: "#64748b" },
  { id: "fin_statements", label: "📊 Lap. Keuangan", color: "#10b981" },
  { id: "finance_center", label: "💹 Finance Center", color: "#10b981" },
  { id: "finance_alert", label: "🚨 Finance Alert", color: "#ef4444" },
  { id: "ar", label: "📥 Piutang AR", color: "#3b82f6" },
  { id: "budget", label: "🎯 Budget", color: "#a78bfa" },
  { id: "budget_plan", label: "📋 Budget Plan", color: "#4f46e5" },
  { id: "payroll", label: "💼 Payroll", color: "#06B6D4" },
  { id: "franchise", label: "🏛️ Franchise", color: "#fbbf24" },
  { id: "consolidation", label: "🏛️ Konsolidasi", color: "#1e40af" },
  { id: "core_tax", label: "🧾 Core Tax", color: "#b91c1c" },
  { id: "cash_flow", label: "💧 Laporan Arus Kas", color: "#0d9488" },
  { id: "ap_aging", label: "📑 AP Aging", color: "#dc2626" },
  { id: "supplier_master", label: "🏭 Supplier Master", color: "#8b5cf6" },
  { id: "compliance", label: "📋 Compliance & Izin", color: "#15803d" },
  { id: "sales_pipeline", label: "🎯 Sales Pipeline", color: "#6366f1" },
  { id: "contract", label: "📄 Contract Mgmt", color: "#ca8a04" },
  { id: "rfq", label: "📨 RFQ / Tender", color: "#0891b2" },
  { id: "risk", label: "⚠️ Risk Management", color: "#dc2626" },
  { id: "quality", label: "🛡️ Quality & Food Safety", color: "#16a34a" },
  { id: "internal_audit", label: "🔍 Internal Audit", color: "#7c3aed" },
  { id: "document_hub", label: "📚 Document / SOP Hub", color: "#0891b2" },
  { id: "helpdesk", label: "🎫 Helpdesk / Complaint", color: "#f97316" },
  { id: "food_cost", label: "🍳 Food Cost", color: "#f97316" },
  { id: "conv_fee", label: "🧾 Biaya Layanan", color: "#fb923c" },
  { id: "reward", label: "🎮 Reward", color: "#a855f7" },
  { id: "reward_benefit", label: "🎁 Reward Benefit", color: "#ec4899" },
  { id: "motivation", label: "🧠 Motivasi", color: "#22c55e" },
  { id: "hr_command", label: "🏥 HR Command", color: "#14b8a6" },
  { id: "anti_fraud", label: "🛡️ Anti-Fraud", color: "#ef4444" },
  { id: "talenta", label: "🔗 Talenta", color: "#0ea5e9" },
  { id: "customer_intel", label: "🎯 Customer Intel", color: "#d946ef" },
  { id: "mkt_behavior", label: "📊 Behavior", color: "#22d3ee" },
  { id: "loyalty_promo", label: "🎁 Loyalty & Promo", color: "#f43f5e" },
  { id: "feedback_segment", label: "💬 Feedback", color: "#eab308" },
  { id: "clv_churn", label: "📉 CLV & Churn", color: "#10b981" },
  { id: "geo_engage", label: "🗺️ Geo & Journey", color: "#6366f1" },
  { id: "campaign", label: "📡 Campaign", color: "#fb7185" },
  { id: "rbac", label: "🔐 Roles & Akses", color: "#a855f7" },
  { id: "approval", label: "⚖️ Approval", color: "#f59e0b" },
  { id: "device_session", label: "🖥️ Device & Sesi", color: "#3b82f6" },
  { id: "security", label: "🛡️ Security", color: "#e11d48" },
  { id: "role_dash", label: "📊 Role Dashboard", color: "#818cf8" },
  { id: "self_audit", label: "🔎 Self-Audit", color: "#16a34a" },
  { id: "item_master", label: "📦 Item Master", color: "#0891b2" },
  { id: "master_unit", label: "📐 Master Unit", color: "#0e7490" },
  { id: "master_category", label: "🗂️ Master Category", color: "#0891b2" },
  { id: "food_cost_calc", label: "🧮 Food Cost Calc", color: "#ea580c" },
  { id: "item_pricing", label: "💲 Item Pricing", color: "#22c55e" },
  { id: "item_config", label: "🔧 Item Config", color: "#0d9488" },
  { id: "item_rules", label: "🍽️ Item Rules", color: "#ea580c" },
  { id: "item_intel", label: "🩺 Item Health", color: "#16a34a" },
  { id: "product_hub", label: "🛍️ Product Hub", color: "#8b5cf6" },
  { id: "product_ver", label: "📜 Versioning", color: "#7c3aed" },
  // ── F&B Enhanced pack (closes audit gap: recipe BOM, combo, periods,
  // dietary tags, happy hour, reservation, tip pool, membership tier,
  // birthday promo, referral, delivery)
  { id: "fnb_recipe",           label: "🍱 F&B Recipe BOM",        color: "#10b981" },
  { id: "fnb_combo",            label: "🍔 F&B Combo / Set Meal",  color: "#f59e0b" },
  { id: "fnb_menu_periods",     label: "⏰ Menu Periods",          color: "#22d3ee" },
  { id: "fnb_dietary_tags",     label: "🌱 Dietary / Allergen",    color: "#16a34a" },
  { id: "fnb_happy_hour",       label: "🕐 Happy Hour Pricing",    color: "#fbbf24" },
  { id: "fnb_reservation",      label: "📅 Reservation",           color: "#a855f7" },
  { id: "fnb_tip_pool",         label: "💵 Tip Pool",              color: "#f59e0b" },
  { id: "fnb_membership_tier",  label: "🏅 Membership Tier",       color: "#fbbf24" },
  { id: "fnb_birthday_promo",   label: "🎂 Birthday Promo",        color: "#ec4899" },
  { id: "fnb_referral",         label: "🤝 Referral Program",      color: "#22d3ee" },
  { id: "fnb_delivery",         label: "🚴 Delivery & Drivers",    color: "#3b82f6" },
  { id: "fnb_menu_engineering", label: "📊 Menu Engineering",      color: "#a855f7" },
  { id: "fnb_bill_split",       label: "🧾 Bill Split & Merge",    color: "#22d3ee" },
  { id: "fnb_order_transfer",   label: "🔄 Order Transfer Meja",   color: "#a78bfa" },
  { id: "fnb_kds_routing",      label: "🍳 KDS Multi-Station",     color: "#fb923c" },
  { id: "fnb_whatsapp",         label: "💬 WhatsApp Business",     color: "#25d366" },
  { id: "fnb_bank_recon",       label: "🏦 Banking Auto-Recon",    color: "#10b981" },
  { id: "fnb_driver_tracking",  label: "📍 Driver Realtime",       color: "#3b82f6" },
  { id: "fnb_payment_methods",  label: "💳 Payment Methods Master", color: "#10b981" },
];

// Urutan value-chain enterprise: Operasi → Product → Inventory → Commerce
// → Finance → HRIS → Customer → Security. Tiap grup urut alur kerja.
export const GROUPS = [
  { name: "Dashboard", icon: "📊", module: "pos", ids: ["dashboard", "optimization"] },
  { name: "Operasi & Outlet", icon: "🛰️", module: "pos", ids: ["outlet_master", "staff", "checklist", "cashier_kpi", "gudang", "waste", "asset_maintenance", "quality", "incidents", "escalation", "compliance", "document_hub", "notif_center", "config", "audit"] },
  // 🎬 Cinema vertical — dedicated top-level group dengan 4 sub-kategori.
  // Sub-grouping via `categories` field; AdminHome rail renderer support nested.
  // 🍽️ F&B Enhanced — dedicated top-level group untuk feature-pack baru
  // (recipe BOM, combo, periods, dietary, happy hour, reservation, tips,
  // membership tier, birthday, referral, delivery)
  { name: "F&B Enhanced", icon: "🍽️", module: "pos",
    ids: [
      "fnb_recipe", "fnb_combo", "fnb_menu_periods", "fnb_dietary_tags",
      "fnb_happy_hour", "fnb_reservation", "fnb_tip_pool",
      "fnb_membership_tier", "fnb_birthday_promo", "fnb_referral",
      "fnb_delivery", "fnb_driver_tracking",
      "fnb_menu_engineering",
      "fnb_bill_split", "fnb_order_transfer",
      "fnb_kds_routing",
      "fnb_whatsapp", "fnb_bank_recon",
      "fnb_payment_methods",
    ],
    categories: [
      { name: "🍱 Menu & Product",  ids: ["fnb_recipe", "fnb_combo", "fnb_menu_periods", "fnb_dietary_tags", "fnb_menu_engineering"] },
      { name: "🕐 Pricing",         ids: ["fnb_happy_hour"] },
      { name: "📅 Customer Ops",    ids: ["fnb_reservation", "fnb_order_transfer", "fnb_bill_split"] },
      { name: "👥 Loyalty",         ids: ["fnb_membership_tier", "fnb_birthday_promo", "fnb_referral"] },
      { name: "💵 Staff",           ids: ["fnb_tip_pool"] },
      { name: "🚴 Delivery",        ids: ["fnb_delivery", "fnb_driver_tracking"] },
      { name: "🍳 Kitchen",         ids: ["fnb_kds_routing"] },
      { name: "🔗 Integration",     ids: ["fnb_whatsapp", "fnb_bank_recon"] },
      { name: "💳 Payments",        ids: ["fnb_payment_methods"] },
    ],
  },
  { name: "Cinema", icon: "🎬", module: "pos",
    ids: [
      "cinema_command_center", "cinema_ops", "cinema_ticketing", "cinema_box_office", "cinema_validate", "cinema_refund", "cinema_in_studio_queue", "cinema_event_booking",
      "cinema_bundles", "cinema_bundle_redeem", "cinema_inventory",
      "cinema_distribution", "cinema_price_list", "cinema_holidays", "cinema_seat_types", "cinema_promotion", "cinema_loyalty", "cinema_party", "cinema_subscriptions", "cinema_campaign",
      "cinema_crm", "cinema_analytics",
    ],
    categories: [
      { name: "🛰️ Operations",        ids: ["cinema_command_center", "cinema_ops", "cinema_ticketing", "cinema_box_office", "cinema_validate", "cinema_refund", "cinema_in_studio_queue", "cinema_event_booking"] },
      { name: "🍿 F&B",                ids: ["cinema_bundles", "cinema_bundle_redeem", "cinema_inventory"] },
      { name: "💲 Catalog & Pricing",  ids: ["cinema_distribution", "cinema_price_list", "cinema_holidays", "cinema_seat_types", "cinema_promotion", "cinema_loyalty", "cinema_party", "cinema_subscriptions", "cinema_campaign"] },
      { name: "📊 Intelligence",       ids: ["cinema_crm", "cinema_analytics"] },
    ],
  },
  { name: "Product", icon: "📦", module: "config", ids: ["master_category", "master_unit", "item_master", "item_pricing", "item_config", "item_rules", "food_cost", "food_cost_calc", "item_intel", "product_hub", "product_ver"] },
  { name: "Inventory & Procurement", icon: "🚚", module: "stock", ids: ["stock_list", "batch_tracking", "stock_opname", "stock_transfer", "production", "sales_stock_sync", "demand_forecast", "auto_reorder", "supplier_master", "rfq", "price_list", "procurement_plus", "simple_purchase", "petty_cash", "goods_delivery", "goods_received", "purchase_invoice", "purchase_return", "internal_return"] },
  { name: "Commerce", icon: "🛒", module: "pos", ids: ["master", "menu_builder", "payment", "conv_fee", "aggregator", "loyalty", "broadcast", "sales_pipeline", "b2b_customer", "quotation", "sales_order", "delivery_order", "sales_invoice", "sales_return"] },
  { name: "Finance", icon: "💰", module: "finance", ids: ["coa", "general_ledger", "journal", "settlement", "reconciliation", "release_payment", "ar", "ap_aging", "finance", "fin_statements", "cash_flow", "finance_center", "finance_alert", "budget", "budget_plan", "period_closing", "consolidation", "core_tax", "franchise"] },
  { name: "HRIS & Reward", icon: "👥", module: "hr", ids: ["hris", "shift_roster", "payroll", "talenta", "reward", "reward_benefit", "motivation", "hr_command"] },
  { name: "Customer & Marketing", icon: "🎯", module: "marketing", ids: ["customer_intel", "mkt_behavior", "clv_churn", "feedback_segment", "geo_engage", "loyalty_promo", "campaign", "signage", "marquee", "helpdesk"] },
  { name: "Security & Admin", icon: "🔐", module: "rbac", ids: ["rbac", "role_dash", "approval", "device_session", "security", "contract", "risk", "internal_audit", "anti_fraud", "self_audit", "platform", "billing"] },
];

// ─── MULTI-TENANT: GROUP FILTER BY VERTICAL ──────────────────────────────
// F&B owner gak butuh modul cinema_*. Cinema owner gak butuh modul fnb_*.
// Super-admin (kapten platform) liat semua + ada Karys Platform tab.
// Heuristik: prefix id (cinema_* / fnb_*) → vertical-specific. Lainnya = shared.

const CINEMA_PREFIX = ["cinema_", "cinema-"];
const FNB_PREFIX    = ["fnb_", "fnb-"];

function _moduleVertical(id) {
  const s = String(id || "").toLowerCase();
  if (CINEMA_PREFIX.some(p => s.startsWith(p))) return "cinema";
  if (FNB_PREFIX.some(p => s.startsWith(p))) return "fnb";
  return "shared"; // generic modul (finance, payroll, dst)
}

// ─── FEATURE ENTITLEMENT — module ID → required feature code ──────────────
// Plan punya array features (dari billing_plans.features_json) — kalau modul
// gak punya feature di list, hide / lock dengan badge UPGRADE.
// Wildcard '*' di tenant features = unlock all (Trial/Enterprise).
const MODULE_FEATURE = {
  // ── BASE (semua plan ada) ──
  dashboard: "dashboard", config: "settings", outlet_master: "settings",
  menu_builder: "menu", master: "menu", item_master: "menu", item_pricing: "menu",
  item_config: "menu", item_rules: "menu", item_intel: "menu",
  product_hub: "menu", product_versioning: "menu", price_list: "menu",
  master_unit: "menu", master_category: "menu",
  fnb_menu_periods: "menu", fnb_recipe: "menu", fnb_combo: "menu", fnb_dietary_tags: "menu",
  staff: "settings", departments: "departments", admin_users: "settings",
  email_config: "settings", outlet_pin_config: "settings",
  marquee: "settings", optimization: "settings",
  // ── LOYALTY ──
  loyalty: "loyalty", loyalty_promo: "loyalty", reward: "reward", reward_benefit: "reward",
  customer_intel: "customer_intel", feedback_segment: "customer_intel", clv_churn: "customer_intel",
  fnb_membership_tier: "membership", fnb_birthday_promo: "loyalty", fnb_referral: "loyalty",
  fnb_happy_hour: "promo",
  // ── INVENTORY ──
  gudang: "inventory", waste: "inventory", stock_list: "inventory",
  stock_opname: "stock_opname", stock_transfer: "inventory",
  goods_received: "goods_received", goods_delivery: "goods_delivery",
  procurement_plus: "procurement", simple_purchase: "procurement",
  auto_reorder: "auto_reorder", batch_tracking: "batch_tracking",
  production: "production", food_cost: "inventory",
  purchase_invoice: "procurement", purchase_return: "procurement", internal_return: "inventory",
  // ── FINANCE ──
  finance: "finance", finance_center: "finance_center", finance_alert: "finance_center",
  ar: "ar", journal: "journal", general_ledger: "gl", coa: "coa",
  reconciliation: "reconciliation", release_payment: "finance", settlement: "finance",
  fin_statements: "fin_statements", budget: "budget", budget_plan: "budget",
  petty_cash: "finance", aggregator: "finance", payment: "finance", convenience_fee: "finance",
  period_closing: "period_closing", food_cost_calc: "food_cost",
  cash_flow: "cash_flow", core_tax: "core_tax",
  // ── HR ──
  hris: "hris", hr: "hr", hr_command: "hr",
  payroll: "payroll", talenta: "talenta",
  shift_roster: "shift_roster", cashier_kpi: "hr",
  user_kpi: "hr", motivation: "motivation",
  // ── MARKETING ──
  campaign: "campaign", broadcast: "broadcast",
  marketing_behavior: "marketing", geo_engagement: "geo_engagement",
  pos_behavior: "marketing",
  // ── MULTI-OUTLET / FIELD OPS ──
  remote_ops_command: "remote_ops", outlet_launch: "launch",
  service_visit: "service_visit",
  incidents: "incidents", escalation: "escalation",
  // ── CINEMA (all) ──
  cinema_ops: "cinema_all", cinema_ticketing: "cinema_all", cinema_box_office: "cinema_all",
  cinema_validate: "cinema_all", cinema_refund: "cinema_all", cinema_bundles: "cinema_all",
  cinema_bundle_redeem: "cinema_all", cinema_distribution: "cinema_all",
  cinema_in_studio_queue: "cinema_all", cinema_event_booking: "cinema_all",
  cinema_price_list: "cinema_all", cinema_command_center: "cinema_all",
  cinema_promotion: "cinema_all", cinema_loyalty: "cinema_all", cinema_party: "cinema_all",
  cinema_subscriptions: "cinema_all", cinema_holidays: "cinema_all", cinema_seat_types: "cinema_all",
  cinema_crm: "cinema_all", cinema_analytics: "cinema_all", cinema_campaign: "cinema_all",
  cinema_inventory: "cinema_all", cinema_dashboard: "cinema_all",
  cinema_emergency: "cinema_all", cinema_closing: "cinema_all", cinema_cashier_kpi: "cinema_all",
  // ── ENTERPRISE ──
  quality: "quality", internal_audit: "internal_audit", document_hub: "document_hub",
  helpdesk: "helpdesk", risk: "risk", contract: "contract", rfq: "rfq",
  signage: "signage", compliance: "compliance", self_audit: "self_audit", anti_fraud: "anti_fraud",
  consolidation: "consolidation", platform: "platform", billing: "settings",
  approval: "settings", device_session: "settings", security: "settings",
  role_dash: "settings", rbac: "settings",
  refund_cancel: "anti_fraud", demand_forecast: "inventory", asset_maintenance: "inventory",
  notif_center: "settings", checklist: "settings",
  sales_pipeline: "marketing", franchise: "settings",
  sales_order: "procurement", sales_invoice: "ar", sales_return: "ar",
  delivery_order: "goods_delivery", quotation: "marketing", b2b_customer: "marketing",
  sales_stock_sync: "inventory",
  // ── FNB ENHANCED (mostly loyalty/marketing) ──
  fnb_reservation: "membership", fnb_tip_pool: "hr",
  fnb_delivery: "goods_delivery", fnb_menu_engineering: "marketing",
  fnb_bill_split: "settings", fnb_order_transfer: "settings",
  fnb_kds_routing: "settings", fnb_whatsapp: "broadcast",
  fnb_bank_recon: "reconciliation", fnb_driver_tracking: "goods_delivery",
  fnb_payment_methods: "finance",
};

export function getModuleFeature(moduleId) {
  return MODULE_FEATURE[moduleId] || "settings"; // default ke base.settings
}

// Filter modules berdasarkan tenant features (dari /api/billing/features)
// features: array of strings, '*' = unlock all
// MODE 'hide' = filter out yang ke-gate (default lama)
// MODE 'lock' = tetap tampil tapi return list locked ids untuk badge UPGRADE
export function filterGroupsByFeatures(groups, features, mode = "hide") {
  if (!features || features.includes("*")) return groups;
  const hasFeature = (id) => features.includes(getModuleFeature(id));
  if (mode === "hide") {
    return groups
      .map(g => ({
        ...g,
        ids: (g.ids || []).filter(hasFeature),
        categories: (g.categories || []).map(c => ({
          ...c,
          ids: (c.ids || []).filter(hasFeature),
        })).filter(c => c.ids.length > 0),
      }))
      .filter(g => g.ids.length > 0 || (g.categories && g.categories.length > 0));
  }
  // mode === "lock": kembalikan groups apa adanya, plus expose isLocked(id)
  return groups;
}

// Helper untuk frontend cek apakah module locked
export function isModuleLocked(id, features) {
  if (!features || features.includes("*")) return false;
  return !features.includes(getModuleFeature(id));
}

// Suggest plan untuk unlock feature tertentu
const FEATURE_TO_REQUIRED_PLAN = {
  pos: "STARTER", kiosk: "STARTER", qr_order: "STARTER", dashboard: "STARTER", menu: "STARTER", settings: "STARTER", departments: "STARTER",
  loyalty: "GROWTH", promo: "GROWTH", reward: "GROWTH", membership: "GROWTH", customer_intel: "GROWTH",
  inventory: "GROWTH", item_master: "GROWTH", stock_opname: "GROWTH", goods_received: "GROWTH", goods_delivery: "GROWTH",
  supplier: "GROWTH", procurement: "GROWTH", auto_reorder: "GROWTH", batch_tracking: "GROWTH", production: "GROWTH",
  finance: "PRO", finance_center: "PRO", ar: "PRO", ap: "PRO", journal: "PRO", gl: "PRO", coa: "PRO",
  budget: "PRO", tax: "PRO", cash_flow: "PRO", fin_statements: "PRO", period_closing: "PRO",
  food_cost: "PRO", payroll_finance: "PRO", reconciliation: "PRO",
  hris: "PRO", hr: "PRO", payroll: "PRO", shift_roster: "PRO", attendance: "PRO", talenta: "PRO", motivation: "PRO",
  marketing: "PRO", campaign: "PRO", crm: "PRO", broadcast: "PRO", geo_engagement: "PRO", clv_churn: "PRO",
  multi_outlet: "ENTERPRISE", remote_ops: "ENTERPRISE", launch: "ENTERPRISE", service_visit: "ENTERPRISE", incidents: "ENTERPRISE",
  cinema_all: "ENTERPRISE",
  quality: "ENTERPRISE", internal_audit: "ENTERPRISE", document_hub: "ENTERPRISE", helpdesk: "ENTERPRISE",
  risk: "ENTERPRISE", contract: "ENTERPRISE", rfq: "ENTERPRISE", signage: "ENTERPRISE", compliance: "ENTERPRISE",
};
export function requiredPlanFor(moduleId) {
  return FEATURE_TO_REQUIRED_PLAN[getModuleFeature(moduleId)] || "ENTERPRISE";
}

// Super-admin-only modules — sembunyikan dari semua user company-scoped
const SUPER_ADMIN_ONLY = new Set(["platform"]);

// Filter GROUPS untuk user dengan vertical tertentu.
// vertical: 'fnb' | 'cinema' | 'hybrid' | null (= super-admin, lihat semua)
export function filterGroupsForVertical(groups, vertical, opts = {}) {
  const isSuperAdmin = opts.is_super_admin || !vertical;
  if (isSuperAdmin) return groups; // super-admin lihat semua
  return groups
    .map(g => {
      const filteredIds = (g.ids || []).filter(id => {
        if (SUPER_ADMIN_ONLY.has(id)) return false; // hide platform tab dari non-super-admin
        const v = _moduleVertical(id);
        if (v === "shared") return true;
        if (vertical === "hybrid") return true; // hybrid → liat keduanya
        return v === vertical;
      });
      const filteredCategories = (g.categories || []).map(c => ({
        ...c,
        ids: (c.ids || []).filter(id => {
          if (SUPER_ADMIN_ONLY.has(id)) return false;
          const v = _moduleVertical(id);
          if (v === "shared") return true;
          if (vertical === "hybrid") return true;
          return v === vertical;
        }),
      })).filter(c => c.ids.length > 0);
      return { ...g, ids: filteredIds, categories: filteredCategories };
    })
    .filter(g => g.ids.length > 0); // drop empty group
}
