
// Add points columns to orders (idempotent)
try { db.exec("ALTER TABLE orders ADD COLUMN points_redeemed INTEGER DEFAULT 0"); console.log("🎁 orders.points_redeemed added"); } catch(e){}
try { db.exec("ALTER TABLE orders ADD COLUMN points_discount INTEGER DEFAULT 0"); console.log("🎁 orders.points_discount added"); } catch(e){}
try { db.exec("ALTER TABLE orders ADD COLUMN points_earned   INTEGER DEFAULT 0"); console.log("🎁 orders.points_earned added");   } catch(e){}
// server/db.js — SQLite persistence layer (phase 1: orders only)
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

// WAL mode untuk better concurrency dan crash safety
db.pragma('journal_mode = WAL');
// Performance + write throughput tuning (added 2026-05-28 — POS hang root cause)
db.pragma('synchronous = NORMAL');         // safe w/ WAL, ~2-3× faster writes
db.pragma('wal_autocheckpoint = 1000');    // auto-checkpoint @ 1000 pages (~4MB)
db.pragma('busy_timeout = 8000');          // wait up to 8s on lock contention (concurrent writes from multi-module)
db.pragma('cache_size = -65536');          // 64MB page cache (default ~2MB)
db.pragma('temp_store = MEMORY');          // temp tables in RAM
db.pragma('mmap_size = 268435456');        // 256MB memory-mapped IO

// Force WAL checkpoint on startup (clean slate if WAL accumulated saat process restart)
try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { console.warn('[db] startup checkpoint:', e.message); }

// Periodic checkpoint — every 2 min, truncate WAL agar gak balloon
setInterval(() => {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) { /* lock held, skip */ }
}, 2 * 60 * 1000).unref();

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id              TEXT PRIMARY KEY,
    time            INTEGER NOT NULL,
    type            TEXT,
    "table"         TEXT,
    status          TEXT,
    pay             TEXT,
    items           TEXT,
    addons          TEXT,
    subtotal        INTEGER,
    tax             INTEGER,
    total           INTEGER,
    customer_id     TEXT,
    customer_name   TEXT,
    customer_phone  TEXT,
    promo_code      TEXT,
    promo_discount  INTEGER,
    midtrans_id     TEXT,
    cash_received   INTEGER,
    cash_change     INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_orders_time   ON orders(time);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

  CREATE TABLE IF NOT EXISTS customers (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    phone       TEXT,
    visits      INTEGER DEFAULT 0,
    total_spend INTEGER DEFAULT 0,
    created_at  INTEGER,
    last_visit  INTEGER,
    tags        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

  CREATE TABLE IF NOT EXISTS promos (
    id            TEXT PRIMARY KEY,
    code          TEXT UNIQUE NOT NULL,
    type          TEXT,
    value         REAL,
    "desc"        TEXT,
    min_order     INTEGER DEFAULT 0,
    max_discount  INTEGER DEFAULT 0,
    usage_limit   INTEGER DEFAULT 0,
    used_count    INTEGER DEFAULT 0,
    valid_from    INTEGER,
    valid_until   INTEGER,
    active        INTEGER DEFAULT 1,
    for_member    INTEGER DEFAULT 0,
    bogo_config   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_promos_code ON promos(code);

  -- Migration: add bogo_config to existing DBs (safe — fails silently if exists)


  CREATE TABLE IF NOT EXISTS tables (
    id        TEXT PRIMARY KEY,
    name      TEXT,
    zone      TEXT,
    capacity  INTEGER DEFAULT 4,
    status    TEXT DEFAULT 'available',
    qr_code   TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id            TEXT PRIMARY KEY,
    opened_by     TEXT,
    opened_at     INTEGER,
    opening_cash  INTEGER DEFAULT 0,
    closed_at     INTEGER,
    closing_cash  INTEGER,
    sales         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_shifts_closed ON shifts(closed_at);

  CREATE TABLE IF NOT EXISTS menu_overrides (
    item_id TEXT PRIMARY KEY,
    avail   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    pin     TEXT NOT NULL,
    role    TEXT,
    active  INTEGER DEFAULT 1,
    created_at INTEGER
  );
  -- enterprise auth fields (idempotent ALTER below)


  CREATE TABLE IF NOT EXISTS point_transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   TEXT NOT NULL,
    order_id      TEXT,
    type          TEXT NOT NULL,
    amount        INTEGER NOT NULL,
    balance_after INTEGER,
    created_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_pt_customer ON point_transactions(customer_id);
`);

// Add points column to customers (idempotent)
try { db.exec("ALTER TABLE customers ADD COLUMN points INTEGER DEFAULT 0"); console.log("🎁 customers.points column added"); }
catch (e) { /* column already exists */ }

// ─── ENTERPRISE AUTH MIGRATIONS (idempotent) ─────────────────────────
try { db.exec("ALTER TABLE admin_users ADD COLUMN username TEXT"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN email TEXT"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN password_hash TEXT"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN password_salt TEXT"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN password_changed_at INTEGER"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN must_change_password INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN last_login_at INTEGER"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN last_login_ip TEXT"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN failed_login_count INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE admin_users ADD COLUMN locked_until INTEGER"); } catch {}
// Multi-tenant: company_id (NULL = karys super-admin akses semua company / global)
try { db.exec("ALTER TABLE admin_users ADD COLUMN company_id INTEGER"); } catch {}
// P6 — Per-user vertical filter (fnb|cinema|hybrid|null=inherit company)
try { db.exec("ALTER TABLE admin_users ADD COLUMN vertical TEXT"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN company_id INTEGER"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id)"); } catch {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username) WHERE username IS NOT NULL"); } catch {}

// Login audit log
try {
  db.exec(`CREATE TABLE IF NOT EXISTS admin_login_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT, username TEXT, ip TEXT, user_agent TEXT,
    method TEXT, success INTEGER DEFAULT 0,
    error TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_login_audit_user ON admin_login_audit(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_admin_login_audit_created ON admin_login_audit(created_at)`);
} catch {}

try { db.exec("ALTER TABLE orders ADD COLUMN convenience_fee INTEGER DEFAULT 0"); console.log("🧾 orders.convenience_fee added"); }
catch (e) { /* column already exists */ }

// Service charge (dine-in) — auto-apply 5% pas dine-in. Disimpan per-order
// biar audit trail jelas + bisa lihat di laporan.
try { db.exec("ALTER TABLE orders ADD COLUMN service_charge INTEGER DEFAULT 0"); console.log("🍽️ orders.service_charge added"); }
catch (e) { /* column already exists */ }

// Multi-outlet + new/recommendation tags untuk master menu
try { db.exec("ALTER TABLE pos_menus ADD COLUMN is_new INTEGER DEFAULT 0"); console.log("🆕 pos_menus.is_new added"); } catch {}
try { db.exec("ALTER TABLE pos_menus ADD COLUMN is_chef_choice INTEGER DEFAULT 0"); console.log("👨‍🍳 pos_menus.is_chef_choice added"); } catch {}
try { db.exec("ALTER TABLE pos_menus ADD COLUMN new_until INTEGER"); console.log("📅 pos_menus.new_until added"); } catch {}
try { db.exec("ALTER TABLE pos_menus ADD COLUMN badge_text TEXT"); console.log("🏷️ pos_menus.badge_text added"); } catch {}
try { db.exec("ALTER TABLE pos_menus ADD COLUMN badge_color TEXT"); console.log("🎨 pos_menus.badge_color added"); } catch {}
try { db.exec("ALTER TABLE pos_menus ADD COLUMN outlet_ids TEXT"); console.log("🏪 pos_menus.outlet_ids (JSON) added"); } catch {}

// Service charge config — idempotent insert (skip kalau sudah ada)
try {
  const now = Math.floor(Date.now() / 1000);
  const ins = db.prepare(`INSERT OR IGNORE INTO pos_config (key, value, type, description, category, updated_at) VALUES (?,?,?,?,?,?)`);
  ins.run("SERVICE_CHARGE_DINEIN_PCT",     "5",       "json", "Service charge % otomatis untuk dine-in", "pricing", now);
  ins.run("SERVICE_CHARGE_DINEIN_ENABLED", "true",    "json", "Aktifkan auto-service-charge dine-in",     "pricing", now);
  ins.run("SERVICE_CHARGE_LABEL",          '"Service Charge"', "json", "Label service charge di struk",   "pricing", now);
} catch (e) { /* pos_config belum dibuat saat migration ini jalan */ }

const stmts = {
  insert: db.prepare(`
    INSERT OR REPLACE INTO orders (
      id, time, type, "table", status, pay, items, addons,
      subtotal, tax, total,
      customer_id, customer_name, customer_phone,
      promo_code, promo_discount, promo_free_items,
      midtrans_id, cash_received, cash_change, points_redeemed, points_discount, points_earned, kasir, source, convenience_fee, service_charge, company_id
    ) VALUES (
      @id, @time, @type, @table, @status, @pay, @items, @addons,
      @subtotal, @tax, @total,
      @customer_id, @customer_name, @customer_phone,
      @promo_code, @promo_discount, @promo_free_items,
      @midtrans_id, @cash_received, @cash_change, @points_redeemed, @points_discount, @points_earned, @kasir, @source, @convenience_fee, @service_charge, @company_id
    )
  `),
  updateStatus: db.prepare(`UPDATE orders SET status = ? WHERE id = ?`),
  selectAll:    db.prepare(`SELECT * FROM orders ORDER BY time ASC`),
  count:        db.prepare(`SELECT COUNT(*) AS n FROM orders`),
};

function orderToRow(o) {
  return {
    id: o.id,
    time: o.time,
    type: o.type || null,
    table: o.table || null,
    status: o.status || null,
    pay: o.pay || null,
    items: JSON.stringify(o.items || []),
    addons: JSON.stringify(o.addons || {}),
    subtotal: o.subtotal ?? null,
    tax: o.tax ?? null,
    total: o.total ?? null,
    customer_id: o.customerId || null,
    customer_name: o.customerName || null,
    customer_phone: o.customerPhone || null,
    promo_code: o.promoCode || null,
    promo_discount: o.promoDiscount ?? 0,
    promo_free_items: o.promoFreeItems ? JSON.stringify(o.promoFreeItems) : null,
    midtrans_id: o.midtransId || null,
    cash_received: o.cashReceived ?? null,
    cash_change: o.cashChange ?? null,
    points_redeemed: o.pointsRedeemed ?? 0,
    points_discount: o.pointsDiscount ?? 0,
    points_earned:   o.pointsEarned   ?? 0,
    kasir:           o.kasir || null,
    source:          o.source || null,
    convenience_fee: o.convenienceFee ?? 0,
    service_charge:  o.serviceCharge ?? 0,
    company_id:      o.companyId ?? null,  // multi-tenant tag
  };
}

function rowToOrder(r) {
  return {
    id: r.id,
    time: r.time,
    type: r.type,
    table: r.table,
    status: r.status,
    pay: r.pay,
    items: r.items ? JSON.parse(r.items) : [],
    addons: r.addons ? JSON.parse(r.addons) : {},
    subtotal: r.subtotal,
    tax: r.tax,
    total: r.total,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    promoCode: r.promo_code,
    promoDiscount: r.promo_discount,
    promoFreeItems: r.promo_free_items ? JSON.parse(r.promo_free_items) : null,
    midtransId: r.midtrans_id,
    cashReceived: r.cash_received,
    cashChange: r.cash_change,
    pointsRedeemed: r.points_redeemed || 0,
    pointsDiscount: r.points_discount || 0,
    pointsEarned:   r.points_earned   || 0,
    kasir: r.kasir || null,
    source: r.source || null,
    convenienceFee: r.convenience_fee || 0,
    serviceCharge:  r.service_charge || 0,
    cancelledAt:    r.cancelled_at || null,
    cancelReason:   r.cancel_reason || null,
    cancelledBy:    r.cancelled_by || null,
    refundedAmount: r.refunded_amount || 0,
    refundedAt:     r.refunded_at || null,
    refundedBy:     r.refunded_by || null,
    refundReason:   r.refund_reason || null,
    payments:       r.payments ? (typeof r.payments === 'string' ? JSON.parse(r.payments) : r.payments) : [],
    companyId:      r.company_id ?? null,  // multi-tenant tag
  };
}

function loadAllOrders() {
  return stmts.selectAll.all().map(rowToOrder);
}

function insertOrder(order) {
  stmts.insert.run(orderToRow(order));
}

// Cancel/Refund prepared statements (standalone — separate from stmts object)
const _updateCancelStmt = db.prepare(`
  UPDATE orders
  SET status = ?, cancelled_at = ?, cancel_reason = ?, cancelled_by = ?
  WHERE id = ?
`);

const _updateRefundStmt = db.prepare(`
  UPDATE orders
  SET status = ?, refunded_amount = ?, refunded_at = ?, refunded_by = ?, refund_reason = ?
  WHERE id = ?
`);

function updateOrderCancel(id, cancelledAt, reason, cancelledBy) {
  _updateCancelStmt.run('cancelled', cancelledAt, reason, cancelledBy, id);
}

function updateOrderRefund(id, status, refundedAmount, refundedAt, refundedBy, reason) {
  _updateRefundStmt.run(status, refundedAmount, refundedAt, refundedBy, reason, id);
}

const _updateItemsStmt = db.prepare(`
  UPDATE orders
  SET items = ?, subtotal = ?, tax = ?, total = ?
  WHERE id = ?
`);

const _updatePaymentsStmt = db.prepare(`
  UPDATE orders
  SET status = ?, pay = ?, payments = ?
  WHERE id = ?
`);

function updateOrderPayments(id, status, pay, payments) {
  const paymentsJson = typeof payments === 'string' ? payments : JSON.stringify(payments || []);
  _updatePaymentsStmt.run(status, pay, paymentsJson, id);
}

function updateOrderItems(id, items, subtotal, tax, total) {
  const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
  _updateItemsStmt.run(itemsJson, subtotal || 0, tax || 0, total || 0, id);
}

function updateOrderStatus(id, status) {
  stmts.updateStatus.run(status, id);
}

function getOrderCount() {
  return stmts.count.get().n;
}

console.log(`📦 SQLite DB ready (${DB_PATH}) — ${getOrderCount()} orders persisted`);

// ─── CUSTOMERS ──────────────────────────────────────────────────────────
const customerStmts = {
  insert: db.prepare(`
    INSERT OR REPLACE INTO customers (
      id, name, phone, visits, total_spend, created_at, last_visit, tags, points, company_id
    ) VALUES (
      @id, @name, @phone, @visits, @total_spend, @created_at, @last_visit, @tags, @points, @company_id
    )
  `),
  selectAll: db.prepare(`SELECT * FROM customers ORDER BY last_visit DESC NULLS LAST`),
  delete:    db.prepare(`DELETE FROM customers WHERE id = ?`),
  count:     db.prepare(`SELECT COUNT(*) AS n FROM customers`),
};

function customerToRow(c) {
  return {
    id:          c.id,
    name:        c.name || null,
    phone:       c.phone || null,
    visits:      c.visits ?? 0,
    total_spend: c.totalSpend ?? 0,
    created_at:  c.createdAt ?? Date.now(),
    last_visit:  c.lastVisit ?? null,
    tags:        JSON.stringify(c.tags || []),
    points:      c.points ?? 0,
    company_id:  c.company_id ?? null,
  };
}

function rowToCustomer(r) {
  return {
    id:         r.id,
    name:       r.name,
    phone:      r.phone,
    visits:     r.visits,
    totalSpend: r.total_spend,
    createdAt:  r.created_at,
    lastVisit:  r.last_visit,
    tags:       r.tags ? JSON.parse(r.tags) : [],
    points:     r.points || 0,
    company_id: r.company_id ?? null,
  };
}

function loadAllCustomers() { return customerStmts.selectAll.all().map(rowToCustomer); }
function insertCustomer(c)  { customerStmts.insert.run(customerToRow(c)); }
function deleteCustomer(id) { customerStmts.delete.run(id); }
function getCustomerCount() { return customerStmts.count.get().n; }

console.log(`👤 Customers persisted: ${getCustomerCount()}`);

// Idempotent migration for existing DBs missing bogo_config
try { db.exec("ALTER TABLE promos ADD COLUMN bogo_config TEXT"); } catch(e) { /* column exists */ }
try { db.exec("ALTER TABLE promos ADD COLUMN required_payment_hint TEXT"); } catch(e) { /* column exists */ }

// ─── PROMOS ─────────────────────────────────────────
const promoStmts = {
  insert: db.prepare(`INSERT OR REPLACE INTO promos (id,code,type,value,"desc",min_order,max_discount,usage_limit,used_count,valid_from,valid_until,active,for_member,bogo_config,required_payment_hint) VALUES (@id,@code,@type,@value,@desc,@min_order,@max_discount,@usage_limit,@used_count,@valid_from,@valid_until,@active,@for_member,@bogo_config,@required_payment_hint)`),
  selectAll: db.prepare(`SELECT * FROM promos`),
  delete:    db.prepare(`DELETE FROM promos WHERE id = ?`),
};
const promoToRow = p => ({
  id:p.id, code:p.code, type:p.type, value:p.value, desc:p.desc||null,
  min_order:p.minOrder??0, max_discount:p.maxDiscount??0,
  usage_limit:p.usageLimit??0, used_count:p.usedCount??0,
  valid_from:p.validFrom??null, valid_until:p.validUntil??null,
  active:p.active?1:0, for_member:p.forMember?1:0, bogo_config: p.bogoConfig ? JSON.stringify(p.bogoConfig) : null,
  required_payment_hint: p.requiredPaymentHint || null,
});
const rowToPromo = r => ({
  id:r.id, code:r.code, type:r.type, value:r.value, desc:r.desc,
  minOrder:r.min_order, maxDiscount:r.max_discount,
  usageLimit:r.usage_limit, usedCount:r.used_count,
  validFrom:r.valid_from, validUntil:r.valid_until,
  active:!!r.active, forMember:!!r.for_member,
  bogoConfig: r.bogo_config ? (()=>{try{return JSON.parse(r.bogo_config);}catch{return null}})() : null,
  requiredPaymentHint: r.required_payment_hint || null,
});
function loadAllPromos() { return promoStmts.selectAll.all().map(rowToPromo); }
function insertPromo(p)  { promoStmts.insert.run(promoToRow(p)); }
function deletePromo(id) { promoStmts.delete.run(id); }

// ─── TABLES ─────────────────────────────────────────
const tableStmts = {
  insert: db.prepare(`INSERT OR REPLACE INTO tables (id,name,zone,capacity,status,qr_code) VALUES (@id,@name,@zone,@capacity,@status,@qr_code)`),
  selectAll: db.prepare(`SELECT * FROM tables ORDER BY id`),
  delete:    db.prepare(`DELETE FROM tables WHERE id = ?`),
};
const tableToRow = t => ({
  id:t.id, name:t.name||null, zone:t.zone||null,
  capacity:t.capacity??4, status:t.status||'available', qr_code:t.qrCode||t.id,
});
const rowToTable = r => ({
  id:r.id, name:r.name, zone:r.zone,
  capacity:r.capacity, status:r.status, qrCode:r.qr_code,
});
function loadAllTables() { return tableStmts.selectAll.all().map(rowToTable); }
function insertTable(t)  { tableStmts.insert.run(tableToRow(t)); }
function deleteTable(id) { tableStmts.delete.run(id); }

// ─── SHIFTS ─────────────────────────────────────────
const shiftStmts = {
  insert: db.prepare(`INSERT OR REPLACE INTO shifts (id,opened_by,opened_at,opening_cash,closed_at,closing_cash,sales) VALUES (@id,@opened_by,@opened_at,@opening_cash,@closed_at,@closing_cash,@sales)`),
  selectAll: db.prepare(`SELECT * FROM shifts ORDER BY opened_at DESC`),
  selectActive: db.prepare(`SELECT * FROM shifts WHERE closed_at IS NULL LIMIT 1`),
};
const shiftToRow = s => ({
  id:s.id, opened_by:s.openedBy||s.kasirName||null,
  opened_at:s.openedAt??s.openAt??Date.now(),
  opening_cash:s.openingCash??0,
  closed_at:s.closedAt??s.closeAt??null,
  closing_cash:s.closingCash??null,
  sales:JSON.stringify({
    totalOrders:  s.totalOrders  || 0,
    totalRevenue: s.totalRevenue || 0,
    byPayment:    s.byPayment    || {},
  }),
});
const rowToShift = r => {
  let parsed = null;
  try { parsed = r.sales ? JSON.parse(r.sales) : null; } catch {}
  if (typeof parsed === 'number') parsed = { totalRevenue: parsed };
  if (!parsed || typeof parsed !== 'object') parsed = {};
  return {
    id:r.id, openedBy:r.opened_by, openedAt:r.opened_at,
    openingCash:r.opening_cash, closedAt:r.closed_at, closingCash:r.closing_cash,
    totalOrders:  parsed.totalOrders  || 0,
    totalRevenue: parsed.totalRevenue || 0,
    byPayment:    parsed.byPayment    || {},
    kasirName:    r.opened_by || "Kasir",
  };
};
function loadAllShifts()   { return shiftStmts.selectAll.all().map(rowToShift); }
function loadActiveShift() { const r = shiftStmts.selectActive.get(); return r ? rowToShift(r) : null; }
function insertShift(s)    { shiftStmts.insert.run(shiftToRow(s)); }
function updateShift(id, updates) {
  const cur = shiftStmts.selectAll.all().find(r => r.id === id);
  if (!cur) return;
  const merged = { ...rowToShift(cur), ...updates, id };
  shiftStmts.insert.run(shiftToRow(merged));
}

// ─── MENU OVERRIDES ─────────────────────────────────
const moStmts = {
  upsert:    db.prepare(`INSERT OR REPLACE INTO menu_overrides (item_id,avail) VALUES (?, ?)`),
  selectAll: db.prepare(`SELECT * FROM menu_overrides`),
};
function getMenuOverrides() {
  const m = new Map();
  moStmts.selectAll.all().forEach(r => m.set(r.item_id, !!r.avail));
  return m;
}
function setMenuOverride(itemId, avail) { moStmts.upsert.run(itemId, avail?1:0); }

console.log(`🎟️  Promos persisted: ${loadAllPromos().length}`);
console.log(`🪑 Tables persisted: ${loadAllTables().length}`);
console.log(`🕐 Shifts persisted: ${loadAllShifts().length} (active: ${loadActiveShift() ? "yes" : "no"})`);
console.log(`📋 Menu overrides: ${getMenuOverrides().size}`);

// ─── ADMIN USERS (enterprise auth: username + password_hash) ─────────
const adminUserStmts = {
  insert: db.prepare(`INSERT OR REPLACE INTO admin_users
    (id, name, pin, role, active, created_at,
     username, email, password_hash, password_salt, password_changed_at,
     must_change_password, last_login_at, last_login_ip,
     failed_login_count, locked_until, company_id, vertical)
    VALUES (@id, @name, @pin, @role, @active, @created_at,
     @username, @email, @password_hash, @password_salt, @password_changed_at,
     @must_change_password, @last_login_at, @last_login_ip,
     @failed_login_count, @locked_until, @company_id, @vertical)`),
  selectAll: db.prepare(`SELECT * FROM admin_users ORDER BY id`),
  delete:    db.prepare(`DELETE FROM admin_users WHERE id = ?`),
};
const adminUserToRow = u => {
  // Multi-tenant guard: super-admin (role contains 'super' OR username='admin')
  // MUST have company_id = NULL. Force-override walau u.company_id ada nilai
  // (jaga kalau ada cache stale yg overwrite saat login flow).
  let companyId = u.company_id ?? null;
  const isSuperAdminRole = (u.role && /super/i.test(u.role)) || (u.username && u.username.toLowerCase() === 'admin');
  if (isSuperAdminRole) companyId = null;
  // Vertical: validate enum, null = inherit company
  let vertical = u.vertical || null;
  if (vertical && !['fnb', 'cinema', 'hybrid'].includes(vertical)) vertical = null;
  return {
    id: u.id, name: u.name, pin: u.pin, role: u.role || 'kasir',
    active: u.active === false ? 0 : 1, created_at: u.createdAt ?? Date.now(),
    username: u.username || null, email: u.email || null,
    password_hash: u.password_hash || null, password_salt: u.password_salt || null,
    password_changed_at: u.password_changed_at || null,
    must_change_password: u.must_change_password ? 1 : 0,
    last_login_at: u.last_login_at || null, last_login_ip: u.last_login_ip || null,
    failed_login_count: u.failed_login_count || 0,
    locked_until: u.locked_until || null,
    company_id: companyId,
    vertical,
  };
};
const rowToAdminUser = r => ({
  id: r.id, name: r.name, pin: r.pin, role: r.role,
  active: !!r.active, createdAt: r.created_at,
  username: r.username, email: r.email,
  password_hash: r.password_hash, password_salt: r.password_salt,
  password_changed_at: r.password_changed_at,
  must_change_password: !!r.must_change_password,
  last_login_at: r.last_login_at, last_login_ip: r.last_login_ip,
  failed_login_count: r.failed_login_count || 0,
  locked_until: r.locked_until,
  // Multi-tenant: company_id (NULL = karys super-admin)
  company_id: r.company_id ?? null,
  vertical: r.vertical || null,
});
function loadAllAdminUsers() { return adminUserStmts.selectAll.all().map(rowToAdminUser); }
function insertAdminUser(u)  { adminUserStmts.insert.run(adminUserToRow(u)); }
function deleteAdminUser(id) { adminUserStmts.delete.run(id); }
// Login audit log helper
function logLoginAttempt(entry) {
  try {
    db.prepare(`INSERT INTO admin_login_audit (user_id, username, ip, user_agent, method, success, error) VALUES (?,?,?,?,?,?,?)`)
      .run(entry.user_id || null, entry.username || null, entry.ip || null, entry.user_agent || null,
           entry.method || 'password', entry.success ? 1 : 0, entry.error || null);
  } catch {}
}
function recentLoginAudit(limit = 100) {
  try { return db.prepare(`SELECT * FROM admin_login_audit ORDER BY created_at DESC LIMIT ?`).all(limit); }
  catch { return []; }
}
console.log(`🔐 Admin users persisted: ${loadAllAdminUsers().length}`);

// ─── POINT TRANSACTIONS ─────────────────────────────
const ptStmts = {
  insert:    db.prepare(`INSERT INTO point_transactions (customer_id,order_id,type,amount,balance_after,created_at) VALUES (@customer_id,@order_id,@type,@amount,@balance_after,@created_at)`),
  byCustomer: db.prepare(`SELECT * FROM point_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?`),
};
function insertPointTx(tx) {
  ptStmts.insert.run({
    customer_id: tx.customerId, order_id: tx.orderId||null,
    type: tx.type, amount: tx.amount, balance_after: tx.balanceAfter??null,
    created_at: tx.createdAt??Date.now(),
  });
}
function getPointHistory(customerId, limit=20) {
  return ptStmts.byCustomer.all(customerId, limit).map(r => ({
    id: r.id, customerId: r.customer_id, orderId: r.order_id,
    type: r.type, amount: r.amount, balanceAfter: r.balance_after, createdAt: r.created_at,
  }));
}

// ─── TRANSACTION WRAPPER ────────────────────────────────────────────────
// Wraps multiple DB operations atomically. If any throws, all rollback.
function runInTransaction(fn) {
  return db.transaction(fn)();
}


module.exports = {
  db,
  loadAllOrders, insertOrder, updateOrderStatus, updateOrderItems, updateOrderCancel, updateOrderRefund, updateOrderPayments, getOrderCount,
  loadAllCustomers, insertCustomer, deleteCustomer, getCustomerCount,
  loadAllPromos, insertPromo, deletePromo,
  loadAllTables, insertTable, deleteTable,
  loadAllShifts, loadActiveShift, insertShift, updateShift,
  getMenuOverrides, setMenuOverride,

  loadAllAdminUsers, insertAdminUser, deleteAdminUser,
  logLoginAttempt, recentLoginAudit,
  rawDb: db,

  insertPointTx, getPointHistory,
  runInTransaction,
};
