// server/master-items-backend.js
// ESB Core-aligned master data + Bill of Material + stock consumption on sale.
//
// Architecture (mirrors help.esb.id/content/esb-core):
//
//   audit_warehouse (existing)  ← Master Product (raw inventory)
//        ↑ replenished by procurement GR
//        ↓ consumed via BOM on sale
//   bill_of_materials           ← recipe linking sellable → raw
//        ↑
//   pos_menus + pos_menu_extras ← sellable items / add-ons
//        ↓ category
//   pos_menu_categories
//
// On every POS sale completion, call consumeStockForOrder(orderItems) which:
//   1. resolves BOM for each menu + extra
//   2. aggregates per SKU
//   3. converts unit (gr↔kg, ml↔l) if needed
//   4. atomically deducts audit_warehouse.current_stock
//   5. logs pos_events (event_type=stock_consumption) for audit trail

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

// ============================================================
// SCHEMA
// ============================================================
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS master_units (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  to_base_factor REAL NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_menu_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS pos_menus (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  emoji TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  free_extras INTEGER DEFAULT 0,
  is_popular INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (category_id) REFERENCES pos_menu_categories(id)
);

CREATE TABLE IF NOT EXISTS pos_menu_extra_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_menu_extras (
  id TEXT PRIMARY KEY,
  group_id TEXT,
  name TEXT NOT NULL,
  emoji TEXT,
  extra_price REAL DEFAULT 8000,
  is_available INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY (group_id) REFERENCES pos_menu_extra_groups(id)
);

-- Per-menu extra assignments (empty = all extras allowed)
CREATE TABLE IF NOT EXISTS pos_menu_extra_assignments (
  menu_id TEXT NOT NULL,
  extra_id TEXT NOT NULL,
  PRIMARY KEY (menu_id, extra_id),
  FOREIGN KEY (menu_id) REFERENCES pos_menus(id) ON DELETE CASCADE,
  FOREIGN KEY (extra_id) REFERENCES pos_menu_extras(id) ON DELETE CASCADE
);

-- THE KEY TABLE: recipe per menu/extra → which raw products consumed per 1 sold
CREATE TABLE IF NOT EXISTS bill_of_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('menu','extra')),
  parent_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  qty REAL NOT NULL,
  unit TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now')),
  UNIQUE(parent_type, parent_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_bom_parent ON bill_of_materials(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_bom_sku ON bill_of_materials(sku);
CREATE INDEX IF NOT EXISTS idx_menus_category ON pos_menus(category_id);
CREATE INDEX IF NOT EXISTS idx_menus_available ON pos_menus(is_available);
`;

// ============================================================
// SEED DATA — 21 menus, 5 cats, 17 extras, 4 groups, sample BOM
// ============================================================
const SEED_UNITS = [
  // Weight base = gr
  { code: 'gr', name: 'Gram', base_unit: 'gr', to_base_factor: 1 },
  { code: 'kg', name: 'Kilogram', base_unit: 'gr', to_base_factor: 1000 },
  // Volume base = ml
  { code: 'ml', name: 'Mililiter', base_unit: 'ml', to_base_factor: 1 },
  { code: 'l', name: 'Liter', base_unit: 'ml', to_base_factor: 1000 },
  // Count base = pcs
  { code: 'pcs', name: 'Pieces', base_unit: 'pcs', to_base_factor: 1 },
  { code: 'btl', name: 'Botol', base_unit: 'pcs', to_base_factor: 1 },
  { code: 'pak', name: 'Pak', base_unit: 'pcs', to_base_factor: 1 },
  // Edge: cup base = pcs too
  { code: 'cup', name: 'Cup', base_unit: 'pcs', to_base_factor: 1 },
];

const SEED_CATEGORIES = [
  { id: 'froyo', name: 'Froyo', emoji: '🍦', display_order: 1 },
  { id: 'smoothies', name: 'Smoothies', emoji: '🥤', display_order: 2 },
  { id: 'yogulato', name: 'Yogulato', emoji: '🍨', display_order: 3 },
  { id: 'takehome', name: 'Take Home', emoji: '📦', display_order: 4 },
  { id: 'collab', name: 'Collab Series', emoji: '✨', display_order: 5 },
];

const SEED_EXTRA_GROUPS = [
  { id: 'fresh', name: 'Fresh Fruits', emoji: '🍓', display_order: 1 },
  { id: 'crunchy', name: 'Crunchy', emoji: '🍪', display_order: 2 },
  { id: 'sweet', name: 'Sweet', emoji: '🍬', display_order: 3 },
  { id: 'sauce', name: 'Sauces', emoji: '🍯', display_order: 4 },
];

const SEED_EXTRAS = [
  { id: 't-strawberry', group_id: 'fresh', name: 'Strawberry', emoji: '🍓' },
  { id: 't-mango', group_id: 'fresh', name: 'Mango', emoji: '🥭' },
  { id: 't-banana', group_id: 'fresh', name: 'Banana', emoji: '🍌' },
  { id: 't-kiwi', group_id: 'fresh', name: 'Kiwi', emoji: '🥝' },
  { id: 't-blueberry', group_id: 'fresh', name: 'Blueberry', emoji: '🫐' },
  { id: 't-granola', group_id: 'crunchy', name: 'Granola', emoji: '🌾' },
  { id: 't-oreo', group_id: 'crunchy', name: 'Oreo Crumble', emoji: '🍪' },
  { id: 't-choco-chips', group_id: 'crunchy', name: 'Choco Chips', emoji: '🍫' },
  { id: 't-almond', group_id: 'crunchy', name: 'Sliced Almond', emoji: '🥜' },
  { id: 't-marshmallow', group_id: 'sweet', name: 'Marshmallow', emoji: '🍡' },
  { id: 't-mochi', group_id: 'sweet', name: 'Mochi', emoji: '🍡' },
  { id: 't-cookie-dough', group_id: 'sweet', name: 'Cookie Dough', emoji: '🍪' },
  { id: 't-jelly', group_id: 'sweet', name: 'Jelly Cubes', emoji: '🟣' },
  { id: 't-choco-syrup', group_id: 'sauce', name: 'Chocolate Syrup', emoji: '🍫' },
  { id: 't-caramel', group_id: 'sauce', name: 'Caramel', emoji: '🟫' },
  { id: 't-strawberry-sauce', group_id: 'sauce', name: 'Strawberry Sauce', emoji: '🍓' },
  { id: 't-honey', group_id: 'sauce', name: 'Honey', emoji: '🍯' },
];

const SEED_MENUS = [
  // Froyo
  { id: 'froyo-original', category_id: 'froyo', emoji: '🍦', name: 'Original Froyo', description: 'Plain yogurt froyo, slightly tangy', price: 25000, free_extras: 3, is_popular: 1 },
  { id: 'froyo-strawberry', category_id: 'froyo', emoji: '🍓', name: 'Strawberry Froyo', description: 'Real strawberry blended', price: 28000, free_extras: 3 },
  { id: 'froyo-mango', category_id: 'froyo', emoji: '🥭', name: 'Mango Froyo', description: 'Tropical mango froyo', price: 28000, free_extras: 3 },
  { id: 'froyo-chocolate', category_id: 'froyo', emoji: '🍫', name: 'Chocolate Froyo', description: 'Rich dark chocolate', price: 28000, free_extras: 3, is_popular: 1 },
  { id: 'froyo-matcha', category_id: 'froyo', emoji: '🍵', name: 'Matcha Froyo', description: 'Premium matcha powder', price: 30000, free_extras: 3 },
  // Smoothies
  { id: 'smoothie-mango', category_id: 'smoothies', emoji: '🥭', name: 'Mango Smoothie', description: 'Fresh mango blend', price: 32000, free_extras: 1 },
  { id: 'smoothie-strawberry', category_id: 'smoothies', emoji: '🍓', name: 'Strawberry Smoothie', description: 'Sweet strawberry', price: 32000, free_extras: 1 },
  { id: 'smoothie-berry', category_id: 'smoothies', emoji: '🫐', name: 'Mixed Berry', description: 'Berry medley', price: 35000, free_extras: 1, is_popular: 1 },
  { id: 'smoothie-tropical', category_id: 'smoothies', emoji: '🌴', name: 'Tropical Mix', description: 'Mango + pineapple + passion', price: 35000, free_extras: 1 },
  // Yogulato
  { id: 'yogu-vanilla', category_id: 'yogulato', emoji: '🍨', name: 'Vanilla Yogulato', description: 'Yogurt gelato hybrid', price: 30000, free_extras: 2 },
  { id: 'yogu-chocolate', category_id: 'yogulato', emoji: '🍫', name: 'Chocolate Yogulato', description: 'Rich chocolate', price: 32000, free_extras: 2 },
  { id: 'yogu-strawberry', category_id: 'yogulato', emoji: '🍓', name: 'Strawberry Yogulato', description: 'Real strawberry', price: 32000, free_extras: 2 },
  { id: 'yogu-matcha', category_id: 'yogulato', emoji: '🍵', name: 'Matcha Yogulato', description: 'Premium matcha', price: 34000, free_extras: 2 },
  // Takehome (no extras)
  { id: 'takehome-pint-orig', category_id: 'takehome', emoji: '📦', name: 'Pint Original', description: '473ml original froyo', price: 85000, free_extras: 0 },
  { id: 'takehome-pint-choco', category_id: 'takehome', emoji: '📦', name: 'Pint Chocolate', description: '473ml chocolate froyo', price: 90000, free_extras: 0 },
  { id: 'takehome-quart-orig', category_id: 'takehome', emoji: '📦', name: 'Quart Original', description: '946ml original froyo', price: 150000, free_extras: 0 },
  { id: 'takehome-quart-choco', category_id: 'takehome', emoji: '📦', name: 'Quart Chocolate', description: '946ml chocolate froyo', price: 160000, free_extras: 0 },
  // Collab
  { id: 'collab-1', category_id: 'collab', emoji: '✨', name: 'Collab Special 1', description: 'Limited edition', price: 38000, free_extras: 2 },
  { id: 'collab-2', category_id: 'collab', emoji: '✨', name: 'Collab Special 2', description: 'Limited edition', price: 38000, free_extras: 2 },
  { id: 'collab-3', category_id: 'collab', emoji: '✨', name: 'Collab Special 3', description: 'Limited edition', price: 40000, free_extras: 2 },
  { id: 'collab-4', category_id: 'collab', emoji: '✨', name: 'Collab Special 4', description: 'Limited edition', price: 40000, free_extras: 2 },
];

// Sample BOM — admin should adjust SKUs to match real audit_warehouse SKUs
const SEED_BOM = [
  // Froyo menus consume: base froyo + cup + maybe flavoring + spoon
  { parent_type: 'menu', parent_id: 'froyo-original',    sku: 'FROYO-BASE-PLAIN',   qty: 150, unit: 'gr' },
  { parent_type: 'menu', parent_id: 'froyo-original',    sku: 'CUP-MEDIUM',         qty: 1,   unit: 'pcs' },
  { parent_type: 'menu', parent_id: 'froyo-original',    sku: 'SPOON-PLASTIC',      qty: 1,   unit: 'pcs' },
  { parent_type: 'menu', parent_id: 'froyo-strawberry',  sku: 'FROYO-BASE-PLAIN',   qty: 150, unit: 'gr' },
  { parent_type: 'menu', parent_id: 'froyo-strawberry',  sku: 'PUREE-STRAWBERRY',   qty: 20,  unit: 'gr' },
  { parent_type: 'menu', parent_id: 'froyo-strawberry',  sku: 'CUP-MEDIUM',         qty: 1,   unit: 'pcs' },
  { parent_type: 'menu', parent_id: 'froyo-strawberry',  sku: 'SPOON-PLASTIC',      qty: 1,   unit: 'pcs' },
  { parent_type: 'menu', parent_id: 'froyo-chocolate',   sku: 'FROYO-BASE-CHOCO',   qty: 150, unit: 'gr' },
  { parent_type: 'menu', parent_id: 'froyo-chocolate',   sku: 'CUP-MEDIUM',         qty: 1,   unit: 'pcs' },
  { parent_type: 'menu', parent_id: 'froyo-chocolate',   sku: 'SPOON-PLASTIC',      qty: 1,   unit: 'pcs' },
  // Smoothies
  { parent_type: 'menu', parent_id: 'smoothie-mango',    sku: 'BASE-SMOOTHIE',      qty: 200, unit: 'ml' },
  { parent_type: 'menu', parent_id: 'smoothie-mango',    sku: 'PUREE-MANGO',        qty: 80,  unit: 'gr' },
  { parent_type: 'menu', parent_id: 'smoothie-mango',    sku: 'CUP-LARGE',          qty: 1,   unit: 'pcs' },
  { parent_type: 'menu', parent_id: 'smoothie-mango',    sku: 'STRAW',              qty: 1,   unit: 'pcs' },
  // Takehome
  { parent_type: 'menu', parent_id: 'takehome-pint-orig',  sku: 'FROYO-BASE-PLAIN', qty: 0.473, unit: 'kg' },
  { parent_type: 'menu', parent_id: 'takehome-pint-orig',  sku: 'CONTAINER-PINT',   qty: 1,     unit: 'pcs' },
  // Extras (toppings)
  { parent_type: 'extra', parent_id: 't-strawberry',   sku: 'TOPPING-STRAWBERRY',  qty: 30, unit: 'gr' },
  { parent_type: 'extra', parent_id: 't-mango',        sku: 'TOPPING-MANGO',       qty: 30, unit: 'gr' },
  { parent_type: 'extra', parent_id: 't-granola',      sku: 'TOPPING-GRANOLA',     qty: 20, unit: 'gr' },
  { parent_type: 'extra', parent_id: 't-oreo',         sku: 'TOPPING-OREO',        qty: 20, unit: 'gr' },
  { parent_type: 'extra', parent_id: 't-choco-syrup',  sku: 'SAUCE-CHOCO',         qty: 15, unit: 'ml' },
];

// ============================================================
// HELPERS
// ============================================================
function nowSec() { return Math.floor(Date.now() / 1000); }

/**
 * Convert qty from one unit to another via base_unit.
 * Returns null if conversion impossible (different base_units).
 */
function convertQty(qty, fromUnit, toUnit, unitMap) {
  if (fromUnit === toUnit) return qty;
  const from = unitMap.get(fromUnit);
  const to = unitMap.get(toUnit);
  if (!from || !to) return null;
  if (from.base_unit !== to.base_unit) return null;
  const qtyInBase = qty * from.to_base_factor;
  return qtyInBase / to.to_base_factor;
}

function loadUnitMap(db) {
  const rows = db.prepare(`SELECT * FROM master_units`).all();
  return new Map(rows.map(u => [u.code, u]));
}

/**
 * THE CORE FUNCTION — consume stock for a completed order.
 *
 * @param {Database} db
 * @param {Array} orderItems  [{ menu_id, qty, extras: [{ extra_id, qty }] }, ...]
 * @param {Object} ctx        { order_ref, actor, allow_negative? } — order_ref e.g. "ORD-202605-0001"
 * @returns {Object}          { ok, deductions: [{sku, deducted, new_stock, status}], errors: [] }
 */
function consumeStockForOrder(db, orderItems, ctx = {}) {
  if (!Array.isArray(orderItems) || !orderItems.length) {
    return { ok: false, errors: ['no order items'] };
  }
  const unitMap = loadUnitMap(db);

  // Aggregate per SKU. Map<sku, { totalQtyInBOMUnit, bomUnit, sources: [...] }>
  // If multiple BOM rows hit same SKU but different units, we convert all to first encountered unit.
  const agg = new Map();
  const errors = [];

  const stmtMenuBom = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type='menu' AND parent_id=?`);
  const stmtExtraBom = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type='extra' AND parent_id=?`);

  const addAgg = (sku, qty, unit, src) => {
    if (!agg.has(sku)) {
      agg.set(sku, { totalQty: 0, unit, sources: [] });
    }
    const cur = agg.get(sku);
    if (cur.unit !== unit) {
      const converted = convertQty(qty, unit, cur.unit, unitMap);
      if (converted === null) {
        errors.push(`unit mismatch for ${sku}: ${unit} vs ${cur.unit}`);
        return;
      }
      cur.totalQty += converted;
    } else {
      cur.totalQty += qty;
    }
    cur.sources.push(src);
  };

  for (const oi of orderItems) {
    if (!oi.menu_id || !oi.qty) continue;
    const menuBom = stmtMenuBom.all(oi.menu_id);
    if (menuBom.length === 0) {
      errors.push(`menu ${oi.menu_id} has no BOM defined`);
    }
    for (const b of menuBom) {
      addAgg(b.sku, b.qty * oi.qty, b.unit, { type: 'menu', id: oi.menu_id, qty: oi.qty });
    }
    for (const ex of (oi.extras || [])) {
      if (!ex.extra_id) continue;
      const exQty = ex.qty || 1;
      const exBom = stmtExtraBom.all(ex.extra_id);
      if (exBom.length === 0) {
        // Extras without BOM is OK (e.g., free toppings that don't track stock) — silent
        continue;
      }
      for (const b of exBom) {
        addAgg(b.sku, b.qty * exQty, b.unit, { type: 'extra', id: ex.extra_id, qty: exQty });
      }
    }
  }

  if (agg.size === 0 && errors.length) {
    return { ok: false, errors, deductions: [] };
  }

  // Deduct atomically
  const tx = db.transaction(() => {
    const deductions = [];
    const whGetStmt = db.prepare(`SELECT current_stock, unit FROM audit_warehouse WHERE sku = ?`);
    const whUpdStmt = db.prepare(`UPDATE audit_warehouse SET stock = ?, updated_at = ? WHERE sku = ?`); // reconciled: real col 'stock'
    const logStmt = (() => {
      try { return db.prepare(`INSERT INTO pos_events (event_type, payload, actor, created_at) VALUES (?,?,?,?)`); }
      catch { return null; }
    })();

    for (const [sku, info] of agg.entries()) {
      const wh = whGetStmt.get(sku);
      if (!wh) {
        deductions.push({ sku, status: 'sku_not_in_warehouse', requested_qty: info.totalQty });
        continue;
      }
      let deductQty = info.totalQty;
      if (info.unit !== wh.unit) {
        const converted = convertQty(info.totalQty, info.unit, wh.unit, unitMap);
        if (converted === null) {
          deductions.push({ sku, status: 'unit_conversion_failed', from: info.unit, to: wh.unit });
          continue;
        }
        deductQty = converted;
      }
      const newStock = (wh.current_stock || 0) - deductQty;
      if (newStock < 0 && !ctx.allow_negative) {
        deductions.push({ sku, status: 'insufficient_stock', available: wh.current_stock, requested: deductQty });
        // Skip update — let txn complete partial; caller checks errors
        continue;
      }
      whUpdStmt.run(newStock, nowSec(), sku);
      deductions.push({
        sku, status: 'ok',
        deducted: deductQty, unit: wh.unit,
        new_stock: newStock,
        warning: newStock < 0 ? 'negative_stock' : (newStock < 5 ? 'low_stock' : null)
      });
      if (logStmt) {
        try {
          logStmt.run('stock_consumption', JSON.stringify({
            sku, deducted: deductQty, unit: wh.unit, new_stock: newStock,
            order_ref: ctx.order_ref, sources: info.sources
          }), ctx.actor || 'pos', nowSec());
        } catch {}
      }
    }
    return deductions;
  });

  const deductions = tx();
  const hasFailures = deductions.some(d => d.status !== 'ok');
  return { ok: !hasFailures && !errors.length, deductions, errors };
}

/**
 * Estimate COGS per menu/extra from BOM × warehouse last cost.
 * Uses audit_warehouse.last_cost if present; falls back to 0.
 */
function calcCOGS(db, parentType, parentId) {
  const unitMap = loadUnitMap(db);
  const boms = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type=? AND parent_id=?`)
    .all(parentType, parentId);
  let total = 0;
  const breakdown = [];
  for (const b of boms) {
    // Try to read last_cost or unit_cost from warehouse (column name may vary)
    const wh = db.prepare(`SELECT * FROM audit_warehouse WHERE sku = ?`).get(b.sku);
    if (!wh) { breakdown.push({ sku: b.sku, cost: 0, note: 'sku not in warehouse' }); continue; }
    const cost = wh.last_cost || wh.unit_cost || wh.cogs || 0;
    let qtyInWhUnit = b.qty;
    if (b.unit !== wh.unit) {
      const conv = convertQty(b.qty, b.unit, wh.unit, unitMap);
      if (conv === null) { breakdown.push({ sku: b.sku, cost: 0, note: 'unit conversion failed' }); continue; }
      qtyInWhUnit = conv;
    }
    const line = qtyInWhUnit * cost;
    total += line;
    breakdown.push({ sku: b.sku, qty: b.qty, unit: b.unit, unit_cost: cost, line });
  }
  return { total, breakdown };
}

/**
 * Build legacy menu shape for frontend (drop-in for hardcoded `let menu=[...]`).
 */
function buildLegacyMenu(db) {
  const menus = db.prepare(`
    SELECT m.*, c.name AS category_name
    FROM pos_menus m
    JOIN pos_menu_categories c ON c.id = m.category_id
    WHERE m.is_available = 1 AND c.is_active = 1
    ORDER BY c.display_order, m.display_order, m.name
  `).all();

  const allGroups = db.prepare(`SELECT * FROM pos_menu_extra_groups WHERE is_active = 1 ORDER BY display_order`).all();
  const allExtras = db.prepare(`SELECT * FROM pos_menu_extras WHERE is_available = 1 ORDER BY display_order, name`).all();
  const assignments = db.prepare(`SELECT * FROM pos_menu_extra_assignments`).all();

  // assignmentMap: menu_id → Set<extra_id>; absence = all extras allowed
  const assignMap = new Map();
  for (const a of assignments) {
    if (!assignMap.has(a.menu_id)) assignMap.set(a.menu_id, new Set());
    assignMap.get(a.menu_id).add(a.extra_id);
  }

  return menus.map(m => {
    const allowedExtras = assignMap.has(m.id)
      ? allExtras.filter(e => assignMap.get(m.id).has(e.id))
      : allExtras;
    // Group the allowed extras for UI
    const grouped = allGroups
      .map(g => ({
        id: g.id, name: g.name, emoji: g.emoji,
        toppings: allowedExtras
          .filter(e => e.group_id === g.id)
          .map(e => ({ id: e.id, name: e.name, emoji: e.emoji, extra: e.extra_price }))
      }))
      .filter(g => g.toppings.length > 0);
    return {
      id: m.id,
      cat: m.category_id,
      emoji: m.emoji,
      name: m.name,
      desc: m.description,
      price: m.price,
      freeToppings: m.free_extras,
      popular: m.is_popular === 1,
      avail: m.is_available === 1,
      image: m.image_url,
      toppings: grouped,
    };
  });
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupMasterItems(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  // Auto-seed units on first run (units are stable, safe to seed always)
  const unitCount = db.prepare(`SELECT COUNT(*) c FROM master_units`).get().c;
  if (unitCount === 0) {
    const s = db.prepare(`INSERT INTO master_units (code, name, base_unit, to_base_factor) VALUES (?,?,?,?)`);
    for (const u of SEED_UNITS) s.run(u.code, u.name, u.base_unit, u.to_base_factor);
  }

  const router = express.Router();
  router.use(express.json());

  // ========== SEED ==========
  router.post('/seed', (req, res) => {
    const { force, menu: legacyMenu } = req.body || {};
    const existing = db.prepare(`SELECT COUNT(*) c FROM pos_menus`).get().c;
    if (existing > 0 && !force) {
      return res.status(409).json({ error: 'already seeded', count: existing, hint: 'use {force:true} to re-seed' });
    }
    const tx = db.transaction(() => {
      if (force) {
        db.exec(`DELETE FROM bill_of_materials;
                 DELETE FROM pos_menu_extra_assignments;
                 DELETE FROM pos_menu_extras;
                 DELETE FROM pos_menu_extra_groups;
                 DELETE FROM pos_menus;
                 DELETE FROM pos_menu_categories;`);
      }
      const cs = db.prepare(`INSERT INTO pos_menu_categories (id, name, emoji, display_order) VALUES (?,?,?,?)`);
      for (const c of SEED_CATEGORIES) cs.run(c.id, c.name, c.emoji, c.display_order);

      const gs = db.prepare(`INSERT INTO pos_menu_extra_groups (id, name, emoji, display_order) VALUES (?,?,?,?)`);
      for (const g of SEED_EXTRA_GROUPS) gs.run(g.id, g.name, g.emoji, g.display_order);

      const es = db.prepare(`INSERT INTO pos_menu_extras (id, group_id, name, emoji, extra_price) VALUES (?,?,?,?,?)`);
      for (const e of SEED_EXTRAS) es.run(e.id, e.group_id, e.name, e.emoji, 8000);

      const menusToSeed = legacyMenu
        ? legacyMenu.map(m => ({
            id: m.id, category_id: m.cat, emoji: m.emoji, name: m.name,
            description: m.desc || '', price: m.price,
            free_extras: m.freeToppings || 0,
            is_popular: m.popular ? 1 : 0,
            is_available: m.avail !== false ? 1 : 0,
          }))
        : SEED_MENUS;
      const ms = db.prepare(`INSERT INTO pos_menus (id, category_id, emoji, name, description, price, free_extras, is_popular, is_available, display_order) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      menusToSeed.forEach((m, i) => ms.run(m.id, m.category_id, m.emoji, m.name, m.description, m.price,
        m.free_extras || 0, m.is_popular || 0, m.is_available ?? 1, i));

      // Takehome restrictions: no extras
      const assignStmt = db.prepare(`INSERT INTO pos_menu_extra_assignments (menu_id, extra_id) VALUES (?,?)`);
      // (empty assignments for takehome menus → handled via UI; since absence = all allowed,
      // takehome needs sentinel — easiest: set free_extras=0 AND zero-out via UI. Leaving for admin.)

      // BOM
      const bs = db.prepare(`INSERT INTO bill_of_materials (parent_type, parent_id, sku, qty, unit) VALUES (?,?,?,?,?)`);
      for (const b of SEED_BOM) bs.run(b.parent_type, b.parent_id, b.sku, b.qty, b.unit);
    });

    try {
      tx();
      res.json({
        ok: true,
        seeded: {
          categories: db.prepare(`SELECT COUNT(*) c FROM pos_menu_categories`).get().c,
          menus: db.prepare(`SELECT COUNT(*) c FROM pos_menus`).get().c,
          extras: db.prepare(`SELECT COUNT(*) c FROM pos_menu_extras`).get().c,
          extra_groups: db.prepare(`SELECT COUNT(*) c FROM pos_menu_extra_groups`).get().c,
          bom_rows: db.prepare(`SELECT COUNT(*) c FROM bill_of_materials`).get().c,
        }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ========== LEGACY MENU SHAPE ==========
  router.get('/menu', (req, res) => res.json(buildLegacyMenu(db)));

  // ========== STOCK CONSUMPTION ON SALE ==========
  // POST { items: [{ menu_id, qty, extras: [{ extra_id, qty }] }], order_ref, actor, allow_negative? }
  router.post('/consume-stock', (req, res) => {
    const { items, order_ref, actor, allow_negative } = req.body || {};
    const result = consumeStockForOrder(db, items, { order_ref, actor, allow_negative });
    if (!result.ok) return res.status(207).json(result);  // 207 = multi-status; some succeeded, some failed
    res.json(result);
  });

  // Dry-run: preview consumption without applying
  router.post('/consume-stock/preview', (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
    const unitMap = loadUnitMap(db);
    const agg = new Map();
    const stmtMenuBom = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type='menu' AND parent_id=?`);
    const stmtExtraBom = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type='extra' AND parent_id=?`);
    for (const oi of items) {
      const menuBom = stmtMenuBom.all(oi.menu_id);
      for (const b of menuBom) {
        const k = `${b.sku}|${b.unit}`;
        agg.set(k, (agg.get(k) || 0) + b.qty * (oi.qty || 1));
      }
      for (const ex of (oi.extras || [])) {
        const exBom = stmtExtraBom.all(ex.extra_id);
        for (const b of exBom) {
          const k = `${b.sku}|${b.unit}`;
          agg.set(k, (agg.get(k) || 0) + b.qty * (ex.qty || 1));
        }
      }
    }
    const preview = [];
    for (const [k, qty] of agg) {
      const [sku, unit] = k.split('|');
      const wh = db.prepare(`SELECT current_stock, unit FROM audit_warehouse WHERE sku = ?`).get(sku);
      let deductQty = qty;
      if (wh && unit !== wh.unit) {
        const conv = convertQty(qty, unit, wh.unit, unitMap);
        if (conv !== null) deductQty = conv;
      }
      preview.push({
        sku, deduct_qty: deductQty, unit: wh?.unit || unit,
        current_stock: wh?.current_stock ?? null,
        after: wh ? wh.current_stock - deductQty : null,
        status: !wh ? 'sku_not_in_warehouse' : (wh.current_stock - deductQty < 0 ? 'will_go_negative' : 'ok')
      });
    }
    res.json({ preview });
  });

  // ========== UNITS ==========
  router.get('/units', (req, res) => res.json(db.prepare(`SELECT * FROM master_units ORDER BY base_unit, code`).all()));

  router.post('/units', (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.name || !b.base_unit) return res.status(400).json({ error: 'code, name, base_unit required' });
    try {
      db.prepare(`INSERT INTO master_units (code, name, base_unit, to_base_factor) VALUES (?,?,?,?)`)
        .run(b.code, b.name, b.base_unit, b.to_base_factor || 1);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'unit code exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/units/:code', (req, res) => {
    const inUse = db.prepare(`SELECT COUNT(*) c FROM bill_of_materials WHERE unit = ?`).get(req.params.code).c;
    if (inUse > 0) return res.status(409).json({ error: `${inUse} BOM rows still use this unit` });
    db.prepare(`DELETE FROM master_units WHERE code = ?`).run(req.params.code);
    res.json({ ok: true });
  });

  // ========== CATEGORIES ==========
  router.get('/categories', (req, res) => res.json(db.prepare(`SELECT * FROM pos_menu_categories ORDER BY display_order, name`).all()));

  router.post('/categories', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name) return res.status(400).json({ error: 'id and name required' });
    try {
      db.prepare(`INSERT INTO pos_menu_categories (id, name, emoji, display_order) VALUES (?,?,?,?)`)
        .run(b.id, b.name, b.emoji, b.display_order || 0);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'category id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/categories/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name','emoji','display_order','is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push(`updated_at = ?`); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE pos_menu_categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/categories/:id', (req, res) => {
    const inUse = db.prepare(`SELECT COUNT(*) c FROM pos_menus WHERE category_id = ?`).get(req.params.id).c;
    if (inUse > 0) return res.status(409).json({ error: `${inUse} menus still in this category` });
    db.prepare(`DELETE FROM pos_menu_categories WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Outlet filter helper — fail-open: bad JSON or empty = show in all outlets.
  function filterByOutlet(rows, outletId) {
    if (!outletId) return rows;
    return rows.filter(m => {
      if (!m.outlet_ids || m.outlet_ids === '' || m.outlet_ids === '[]') return true;
      try {
        const ids = JSON.parse(m.outlet_ids);
        return Array.isArray(ids) && (ids.length === 0 || ids.includes(outletId));
      } catch { return true; }
    });
  }

  // ========== MENUS ==========
  router.get('/menus', (req, res) => {
    const { category_id, available, search, outlet } = req.query;
    let sql = `SELECT m.*, c.name AS category_name FROM pos_menus m
               JOIN pos_menu_categories c ON c.id = m.category_id WHERE 1=1`;
    const params = [];
    if (category_id) { sql += ' AND m.category_id = ?'; params.push(category_id); }
    if (available !== undefined) { sql += ' AND m.is_available = ?'; params.push(available === 'true' ? 1 : 0); }
    if (search) { sql += ' AND (m.name LIKE ? OR m.id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY c.display_order, m.display_order, m.name';
    const rows = db.prepare(sql).all(...params);
    res.json(filterByOutlet(rows, outlet));
  });

  router.get('/menus/:id', (req, res) => {
    const menu = db.prepare(`SELECT * FROM pos_menus WHERE id = ?`).get(req.params.id);
    if (!menu) return res.status(404).json({ error: 'not found' });
    menu.allowed_extras = db.prepare(`SELECT extra_id FROM pos_menu_extra_assignments WHERE menu_id = ?`)
      .all(req.params.id).map(r => r.extra_id);
    menu.bom = db.prepare(`SELECT * FROM bill_of_materials WHERE parent_type='menu' AND parent_id = ? ORDER BY id`)
      .all(req.params.id);
    const cogs = calcCOGS(db, 'menu', req.params.id);
    menu.cogs_total = cogs.total;
    menu.cogs_breakdown = cogs.breakdown;
    menu.margin = menu.price - cogs.total;
    menu.margin_pct = menu.price ? ((menu.price - cogs.total) / menu.price * 100) : 0;
    res.json(menu);
  });

  // Normalize outlet_ids body input → JSON string or null.
  // Accepts: array, JSON string, '', null → returns null (= all outlets) or stringified array.
  function normalizeOutletIds(input) {
    if (input == null || input === '') return null;
    let arr = input;
    if (typeof input === 'string') {
      try { arr = JSON.parse(input); } catch { return null; }
    }
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return JSON.stringify(arr.filter(x => typeof x === 'string' && x.length));
  }

  router.post('/menus', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name || !b.category_id || b.price === undefined) {
      return res.status(400).json({ error: 'id, name, category_id, price required' });
    }
    try {
      const outletIds = normalizeOutletIds(b.outlet_ids);
      db.prepare(`
        INSERT INTO pos_menus (id, category_id, emoji, name, description, price,
          free_extras, is_popular, is_available, image_url, display_order, outlet_ids)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(b.id, b.category_id, b.emoji, b.name, b.description || '', b.price,
        b.free_extras || 0, b.is_popular ? 1 : 0, b.is_available !== false ? 1 : 0,
        b.image_url, b.display_order || 0, outletIds);
      if (Array.isArray(b.allowed_extras)) {
        const s = db.prepare(`INSERT INTO pos_menu_extra_assignments (menu_id, extra_id) VALUES (?,?)`);
        for (const e of b.allowed_extras) s.run(b.id, e);
      }
      res.json({ ok: true, id: b.id });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'menu id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // POST /menus/:id/image — upload menu item image (multipart)
  // Server saves under /server/uploads/menu_<id>_<timestamp>.<ext>, returns public url.
  router.post('/menus/:id/image', (req, res) => {
    const upload = opts.uploadMiddleware;
    if (!upload) return res.status(500).json({ error: 'upload middleware not configured' });
    upload.single('image')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'no image uploaded' });
      const url = `/uploads/${req.file.filename}`;
      try {
        const r = db.prepare(`UPDATE pos_menus SET image_url = ?, updated_at = strftime('%s','now') WHERE id = ?`).run(url, req.params.id);
        if (!r.changes) return res.status(404).json({ error: 'menu not found' });
        res.json({ ok: true, image_url: url });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });

  // DELETE /menus/:id/image — remove image association
  router.delete('/menus/:id/image', (req, res) => {
    try {
      db.prepare(`UPDATE pos_menus SET image_url = NULL, updated_at = strftime('%s','now') WHERE id = ?`).run(req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/menus/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['category_id','emoji','name','description','price','free_extras',
      'is_popular','is_available','image_url','display_order'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (b.outlet_ids !== undefined) {
      sets.push('outlet_ids = ?');
      params.push(normalizeOutletIds(b.outlet_ids));
    }
    if (sets.length) {
      sets.push(`updated_at = ?`); params.push(nowSec());
      params.push(req.params.id);
      db.prepare(`UPDATE pos_menus SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    }
    if (Array.isArray(b.allowed_extras)) {
      db.prepare(`DELETE FROM pos_menu_extra_assignments WHERE menu_id = ?`).run(req.params.id);
      const s = db.prepare(`INSERT INTO pos_menu_extra_assignments (menu_id, extra_id) VALUES (?,?)`);
      for (const e of b.allowed_extras) s.run(req.params.id, e);
    }
    res.json({ ok: true });
  });

  // PATCH /menus/:id — partial update including outlet_ids.
  router.patch('/menus/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['category_id','emoji','name','description','price','free_extras',
      'is_popular','is_available','image_url','display_order'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (b.outlet_ids !== undefined) {
      sets.push('outlet_ids = ?');
      params.push(normalizeOutletIds(b.outlet_ids));
    }
    if (!sets.length) return res.json({ ok: true, noop: true });
    sets.push(`updated_at = ?`); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE pos_menus SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/menus/:id', (req, res) => {
    db.prepare(`DELETE FROM pos_menus WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/menus/bulk-toggle', (req, res) => {
    const { ids, is_available } = req.body || {};
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const s = db.prepare(`UPDATE pos_menus SET is_available = ?, updated_at = ? WHERE id = ?`);
    const tx = db.transaction(() => { for (const id of ids) s.run(is_available ? 1 : 0, nowSec(), id); });
    tx();
    res.json({ ok: true, updated: ids.length });
  });

  // ========== EXTRAS ==========
  router.get('/extras', (req, res) => {
    const { group_id, available } = req.query;
    let sql = `SELECT e.*, g.name AS group_name FROM pos_menu_extras e
               LEFT JOIN pos_menu_extra_groups g ON g.id = e.group_id WHERE 1=1`;
    const params = [];
    if (group_id) { sql += ' AND e.group_id = ?'; params.push(group_id); }
    if (available !== undefined) { sql += ' AND e.is_available = ?'; params.push(available === 'true' ? 1 : 0); }
    sql += ' ORDER BY g.display_order, e.display_order, e.name';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/extras/:id', (req, res) => {
    const ex = db.prepare(`SELECT * FROM pos_menu_extras WHERE id = ?`).get(req.params.id);
    if (!ex) return res.status(404).json({ error: 'not found' });
    ex.bom = db.prepare(`SELECT * FROM bill_of_materials WHERE parent_type='extra' AND parent_id = ?`).all(req.params.id);
    const cogs = calcCOGS(db, 'extra', req.params.id);
    ex.cogs_total = cogs.total;
    ex.cogs_breakdown = cogs.breakdown;
    res.json(ex);
  });

  router.post('/extras', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name) return res.status(400).json({ error: 'id and name required' });
    try {
      db.prepare(`INSERT INTO pos_menu_extras (id, group_id, name, emoji, extra_price, is_available, display_order) VALUES (?,?,?,?,?,?,?)`)
        .run(b.id, b.group_id, b.name, b.emoji, b.extra_price || 8000, b.is_available !== false ? 1 : 0, b.display_order || 0);
      res.json({ ok: true, id: b.id });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'extra id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/extras/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['group_id','name','emoji','extra_price','is_available','display_order'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push(`updated_at = ?`); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE pos_menu_extras SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/extras/:id', (req, res) => {
    db.prepare(`DELETE FROM pos_menu_extras WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  router.post('/extras/set-price', (req, res) => {
    const { price } = req.body || {};
    if (typeof price !== 'number') return res.status(400).json({ error: 'price required' });
    const info = db.prepare(`UPDATE pos_menu_extras SET extra_price = ?, updated_at = ?`).run(price, nowSec());
    res.json({ ok: true, updated: info.changes });
  });

  // ========== EXTRA GROUPS ==========
  router.get('/extra-groups', (req, res) => res.json(db.prepare(`SELECT * FROM pos_menu_extra_groups ORDER BY display_order`).all()));

  router.post('/extra-groups', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name) return res.status(400).json({ error: 'id and name required' });
    try {
      db.prepare(`INSERT INTO pos_menu_extra_groups (id, name, emoji, display_order) VALUES (?,?,?,?)`)
        .run(b.id, b.name, b.emoji, b.display_order || 0);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'group id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/extra-groups/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['name','emoji','display_order','is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE pos_menu_extra_groups SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ========== BOM ==========
  router.get('/bom', (req, res) => {
    const { parent_type, parent_id, sku } = req.query;
    let sql = `SELECT * FROM bill_of_materials WHERE 1=1`;
    const params = [];
    if (parent_type) { sql += ' AND parent_type = ?'; params.push(parent_type); }
    if (parent_id) { sql += ' AND parent_id = ?'; params.push(parent_id); }
    if (sku) { sql += ' AND sku = ?'; params.push(sku); }
    sql += ' ORDER BY parent_type, parent_id, sku';
    res.json(db.prepare(sql).all(...params));
  });

  router.post('/bom', (req, res) => {
    const b = req.body || {};
    if (!b.parent_type || !b.parent_id || !b.sku || b.qty === undefined || !b.unit) {
      return res.status(400).json({ error: 'parent_type, parent_id, sku, qty, unit required' });
    }
    try {
      const info = db.prepare(`INSERT INTO bill_of_materials (parent_type, parent_id, sku, qty, unit, notes) VALUES (?,?,?,?,?,?)`)
        .run(b.parent_type, b.parent_id, b.sku, b.qty, b.unit, b.notes);
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'BOM row for this parent+sku already exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/bom/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['sku','qty','unit','notes'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) { sets.push(`${k} = ?`); params.push(b[k]); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    sets.push(`updated_at = ?`); params.push(nowSec());
    params.push(req.params.id);
    db.prepare(`UPDATE bill_of_materials SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/bom/:id', (req, res) => {
    db.prepare(`DELETE FROM bill_of_materials WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Bulk replace BOM for a parent
  router.put('/bom/:parent_type/:parent_id', (req, res) => {
    const { parent_type, parent_id } = req.params;
    const { rows } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' });
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM bill_of_materials WHERE parent_type = ? AND parent_id = ?`).run(parent_type, parent_id);
      const s = db.prepare(`INSERT INTO bill_of_materials (parent_type, parent_id, sku, qty, unit, notes) VALUES (?,?,?,?,?,?)`);
      for (const r of rows) {
        if (!r.sku || r.qty === undefined || !r.unit) continue;
        s.run(parent_type, parent_id, r.sku, r.qty, r.unit, r.notes);
      }
    });
    tx();
    res.json({ ok: true, count: rows.length });
  });

  // COGS report — all menus with their margin
  router.get('/cogs-report', (req, res) => {
    const menus = db.prepare(`SELECT id, name, price FROM pos_menus WHERE is_available = 1`).all();
    const rows = menus.map(m => {
      const cogs = calcCOGS(db, 'menu', m.id);
      return {
        id: m.id, name: m.name, price: m.price,
        cogs: cogs.total,
        margin: m.price - cogs.total,
        margin_pct: m.price ? ((m.price - cogs.total) / m.price * 100) : 0,
        bom_complete: cogs.breakdown.length > 0 && cogs.breakdown.every(b => !b.note)
      };
    });
    res.json(rows);
  });

  // Mount
  const mountPath = opts.mountPath || '/api/master';
  app.use(mountPath, router);

  console.log(`[master-items] mounted at ${mountPath}`);
  console.log(`[master-items] legacy menu: ${mountPath}/menu | consume-stock: ${mountPath}/consume-stock`);

  return {
    router, db,
    consumeStockForOrder: (items, ctx) => consumeStockForOrder(db, items, ctx),
    calcCOGS: (type, id) => calcCOGS(db, type, id),
    buildLegacyMenu: () => buildLegacyMenu(db),
  };
}

module.exports = { setupMasterItems, SCHEMA_SQL };
