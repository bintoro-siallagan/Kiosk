// server/master-menu-builder-backend.js
// Master Menu Builder: size variants (small/medium/large) + packages (bundles).
// ADDITIVE module — extends existing master-items-backend.js. Mount at SAME path /api/master.
//
// Provides consumeStockForOrderV2() that handles:
//   - Regular menus with BOM (same as V1)
//   - Menus with size variants (BOM × size.bom_multiplier, price = base + adjustment)
//   - Packages that expand to constituent menus
//
// Replace global.consumeStockForOrder with this V2 for size+package support.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
-- Master size types
CREATE TABLE IF NOT EXISTS pos_menu_sizes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

-- Per-menu size variants
CREATE TABLE IF NOT EXISTS pos_menu_size_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  price_adjustment REAL DEFAULT 0,
  bom_multiplier REAL DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  is_available INTEGER DEFAULT 1,
  UNIQUE(menu_id, size_id),
  FOREIGN KEY (menu_id) REFERENCES pos_menus(id) ON DELETE CASCADE,
  FOREIGN KEY (size_id) REFERENCES pos_menu_sizes(id)
);
CREATE INDEX IF NOT EXISTS idx_variants_menu ON pos_menu_size_variants(menu_id);

-- Packages / Bundles
CREATE TABLE IF NOT EXISTS pos_menu_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  package_price REAL NOT NULL,
  is_active INTEGER DEFAULT 1,
  valid_from INTEGER,
  valid_until INTEGER,
  category_id TEXT,
  display_order INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS pos_menu_package_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id TEXT NOT NULL,
  menu_id TEXT NOT NULL,
  size_id TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  is_swappable INTEGER DEFAULT 0,
  swap_category_id TEXT,
  display_order INTEGER DEFAULT 0,
  FOREIGN KEY (package_id) REFERENCES pos_menu_packages(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_id) REFERENCES pos_menus(id)
);
CREATE INDEX IF NOT EXISTS idx_pkg_items_pkg ON pos_menu_package_items(package_id);
`;

const SEED_SIZES = [
  { id: 'small', name: 'Small', display_order: 1 },
  { id: 'medium', name: 'Medium', display_order: 2 },
  { id: 'large', name: 'Large', display_order: 3 },
];

function nowSec() { return Math.floor(Date.now() / 1000); }

// ============================================================
// UNIT CONVERSION HELPER (re-implemented here for self-containment)
// ============================================================
function loadUnitMap(db) {
  try {
    const rows = db.prepare(`SELECT * FROM master_units`).all();
    return new Map(rows.map(u => [u.code, u]));
  } catch { return new Map(); }
}

function convertQty(qty, fromUnit, toUnit, unitMap) {
  if (fromUnit === toUnit) return qty;
  const from = unitMap.get(fromUnit);
  const to = unitMap.get(toUnit);
  if (!from || !to) return null;
  if (from.base_unit !== to.base_unit) return null;
  return (qty * from.to_base_factor) / to.to_base_factor;
}

// ============================================================
// CORE: consumeStockForOrderV2 with size + package support
// ============================================================
function consumeStockForOrderV2(db, orderItems, ctx = {}) {
  if (!Array.isArray(orderItems) || !orderItems.length) {
    return { ok: false, errors: ['no order items'] };
  }
  const unitMap = loadUnitMap(db);
  const agg = new Map();
  const errors = [];

  const stmtMenuBom = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type='menu' AND parent_id=?`);
  const stmtExtraBom = db.prepare(`SELECT sku, qty, unit FROM bill_of_materials WHERE parent_type='extra' AND parent_id=?`);
  const stmtSizeVariant = db.prepare(`SELECT bom_multiplier FROM pos_menu_size_variants WHERE menu_id=? AND size_id=?`);
  const stmtPackageItems = db.prepare(`SELECT menu_id, size_id, qty FROM pos_menu_package_items WHERE package_id=?`);

  const addAgg = (sku, qty, unit, src) => {
    if (!agg.has(sku)) agg.set(sku, { totalQty: 0, unit, sources: [] });
    const cur = agg.get(sku);
    if (cur.unit !== unit) {
      const converted = convertQty(qty, unit, cur.unit, unitMap);
      if (converted === null) { errors.push(`unit mismatch for ${sku}: ${unit} vs ${cur.unit}`); return; }
      cur.totalQty += converted;
    } else { cur.totalQty += qty; }
    cur.sources.push(src);
  };

  // Recursive: handles regular menu (with optional size) AND package expansion
  const processMenu = (menuId, qty, sizeId, extras, depth = 0) => {
    if (depth > 5) { errors.push(`max recursion depth for ${menuId} (cycle?)`); return; }

    // Check if it's a package first
    const isPackage = db.prepare(`SELECT id FROM pos_menu_packages WHERE id=?`).get(menuId);
    if (isPackage) {
      const pkgItems = stmtPackageItems.all(menuId);
      if (pkgItems.length === 0) {
        errors.push(`package ${menuId} has no items defined`);
        return;
      }
      for (const pi of pkgItems) {
        processMenu(pi.menu_id, qty * pi.qty, pi.size_id || sizeId, [], depth + 1);
      }
      return;
    }

    // Regular menu — apply size multiplier to BOM qty if size given
    let multiplier = 1;
    if (sizeId) {
      const variant = stmtSizeVariant.get(menuId, sizeId);
      if (variant) multiplier = variant.bom_multiplier || 1;
    }
    const menuBom = stmtMenuBom.all(menuId);
    if (menuBom.length === 0) {
      errors.push(`menu ${menuId} has no BOM`);
    }
    for (const b of menuBom) {
      addAgg(b.sku, b.qty * qty * multiplier, b.unit, { type: 'menu', id: menuId, qty, size_id: sizeId, multiplier });
    }
    for (const ex of (extras || [])) {
      if (!ex.extra_id) continue;
      const exQty = ex.qty || 1;
      const exBom = stmtExtraBom.all(ex.extra_id);
      for (const b of exBom) {
        addAgg(b.sku, b.qty * exQty, b.unit, { type: 'extra', id: ex.extra_id, qty: exQty });
      }
    }
  };

  for (const oi of orderItems) {
    if (!oi.menu_id || !oi.qty) continue;
    processMenu(oi.menu_id, oi.qty, oi.size_id || null, oi.extras || []);
  }

  if (agg.size === 0 && errors.length) {
    return { ok: false, errors, deductions: [] };
  }

  // Deduct atomically (same logic as V1)
  const tx = db.transaction(() => {
    const deductions = [];
    const whGetStmt = db.prepare(`SELECT current_stock, unit FROM audit_warehouse WHERE sku = ?`);
    const whUpdStmt = db.prepare(`UPDATE audit_warehouse SET stock = ?, updated_at = ? WHERE sku = ?`); // reconciled: real col 'stock'
    const logStmt = (() => { try { return db.prepare(`INSERT INTO pos_events (event_type, payload, actor, created_at) VALUES (?,?,?,?)`); } catch { return null; } })();

    for (const [sku, info] of agg.entries()) {
      const wh = whGetStmt.get(sku);
      if (!wh) { deductions.push({ sku, status: 'sku_not_in_warehouse', requested_qty: info.totalQty }); continue; }
      let deductQty = info.totalQty;
      if (info.unit !== wh.unit) {
        const conv = convertQty(info.totalQty, info.unit, wh.unit, unitMap);
        if (conv === null) { deductions.push({ sku, status: 'unit_conversion_failed', from: info.unit, to: wh.unit }); continue; }
        deductQty = conv;
      }
      const newStock = (wh.current_stock || 0) - deductQty;
      if (newStock < 0 && !ctx.allow_negative) {
        deductions.push({ sku, status: 'insufficient_stock', available: wh.current_stock, requested: deductQty });
        continue;
      }
      whUpdStmt.run(newStock, nowSec(), sku);
      deductions.push({ sku, status: 'ok', deducted: deductQty, unit: wh.unit, new_stock: newStock,
        warning: newStock < 0 ? 'negative_stock' : (newStock < 5 ? 'low_stock' : null) });
      if (logStmt) {
        try {
          logStmt.run('stock_consumption', JSON.stringify({
            sku, deducted: deductQty, unit: wh.unit, new_stock: newStock,
            order_ref: ctx.order_ref, sources: info.sources, v: 2
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

// Effective price calc (base menu price + size adjustment)
function getMenuPrice(db, menuId, sizeId) {
  const menu = db.prepare(`SELECT price FROM pos_menus WHERE id=?`).get(menuId);
  if (!menu) {
    const pkg = db.prepare(`SELECT package_price FROM pos_menu_packages WHERE id=?`).get(menuId);
    return pkg ? pkg.package_price : 0;
  }
  let price = menu.price;
  if (sizeId) {
    const variant = db.prepare(`SELECT price_adjustment FROM pos_menu_size_variants WHERE menu_id=? AND size_id=?`).get(menuId, sizeId);
    if (variant) price += variant.price_adjustment;
  }
  return price;
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupMenuBuilder(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  // Seed default sizes
  const sizeCount = db.prepare(`SELECT COUNT(*) c FROM pos_menu_sizes`).get().c;
  if (sizeCount === 0) {
    const s = db.prepare(`INSERT INTO pos_menu_sizes (id, name, display_order) VALUES (?,?,?)`);
    for (const sz of SEED_SIZES) s.run(sz.id, sz.name, sz.display_order);
  }

  const router = express.Router();
  router.use(express.json());

  // ========== SIZES ==========
  router.get('/menu-sizes', (req, res) => res.json(db.prepare(`SELECT * FROM pos_menu_sizes WHERE is_active=1 ORDER BY display_order`).all()));

  router.post('/menu-sizes', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name) return res.status(400).json({ error: 'id, name required' });
    try {
      db.prepare(`INSERT INTO pos_menu_sizes (id, name, display_order) VALUES (?,?,?)`)
        .run(b.id, b.name, b.display_order || 0);
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  // ========== SIZE VARIANTS PER MENU ==========
  router.get('/menus/:menu_id/sizes', (req, res) => {
    const rows = db.prepare(`
      SELECT v.*, s.name AS size_name, s.display_order
      FROM pos_menu_size_variants v JOIN pos_menu_sizes s ON s.id = v.size_id
      WHERE v.menu_id = ?
      ORDER BY s.display_order
    `).all(req.params.menu_id);
    res.json(rows);
  });

  router.put('/menus/:menu_id/sizes', (req, res) => {
    const { variants } = req.body || {};
    if (!Array.isArray(variants)) return res.status(400).json({ error: 'variants array required' });
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM pos_menu_size_variants WHERE menu_id = ?`).run(req.params.menu_id);
      const s = db.prepare(`INSERT INTO pos_menu_size_variants (menu_id, size_id, price_adjustment, bom_multiplier, is_default, is_available) VALUES (?,?,?,?,?,?)`);
      for (const v of variants) {
        if (!v.size_id) continue;
        s.run(req.params.menu_id, v.size_id, v.price_adjustment || 0, v.bom_multiplier || 1,
          v.is_default ? 1 : 0, v.is_available !== false ? 1 : 0);
      }
    });
    tx();
    res.json({ ok: true, count: variants.length });
  });

  // ========== PACKAGES ==========
  router.get('/packages', (req, res) => {
    const { active } = req.query;
    let sql = `SELECT p.*, (SELECT COUNT(*) FROM pos_menu_package_items WHERE package_id = p.id) AS item_count FROM pos_menu_packages p WHERE 1=1`;
    const params = [];
    if (active !== undefined) { sql += ' AND p.is_active = ?'; params.push(active === 'true' ? 1 : 0); }
    sql += ' ORDER BY p.display_order, p.name';
    res.json(db.prepare(sql).all(...params));
  });

  router.get('/packages/:id', (req, res) => {
    const pkg = db.prepare(`SELECT * FROM pos_menu_packages WHERE id = ?`).get(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'not found' });
    pkg.items = db.prepare(`
      SELECT pi.*, m.name AS menu_name, m.emoji AS menu_emoji, m.price AS menu_price, s.name AS size_name
      FROM pos_menu_package_items pi
      LEFT JOIN pos_menus m ON m.id = pi.menu_id
      LEFT JOIN pos_menu_sizes s ON s.id = pi.size_id
      WHERE pi.package_id = ?
      ORDER BY pi.display_order
    `).all(req.params.id);

    // Calculate savings vs individual
    let individualTotal = 0;
    for (const it of pkg.items) {
      individualTotal += getMenuPrice(db, it.menu_id, it.size_id) * it.qty;
    }
    pkg.individual_total = individualTotal;
    pkg.savings = individualTotal - pkg.package_price;
    pkg.savings_pct = individualTotal > 0 ? (pkg.savings / individualTotal * 100) : 0;

    res.json(pkg);
  });

  router.post('/packages', (req, res) => {
    const b = req.body || {};
    if (!b.id || !b.name || b.package_price === undefined) {
      return res.status(400).json({ error: 'id, name, package_price required' });
    }
    try {
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO pos_menu_packages (id, name, emoji, description, package_price, is_active, valid_from, valid_until, category_id, display_order)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(b.id, b.name, b.emoji || null, b.description || null, b.package_price,
          b.is_active !== false ? 1 : 0, b.valid_from || null, b.valid_until || null,
          b.category_id || null, b.display_order || 0);
        if (Array.isArray(b.items)) {
          const s = db.prepare(`INSERT INTO pos_menu_package_items (package_id, menu_id, size_id, qty, is_swappable, swap_category_id, display_order) VALUES (?,?,?,?,?,?,?)`);
          b.items.forEach((it, i) => s.run(b.id, it.menu_id, it.size_id || null, it.qty || 1,
            it.is_swappable ? 1 : 0, it.swap_category_id || null, it.display_order || i));
        }
      });
      tx();
      res.json({ ok: true, id: b.id });
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'package id exists' });
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/packages/:id', (req, res) => {
    const b = req.body || {};
    const tx = db.transaction(() => {
      const allowed = ['name','emoji','description','package_price','is_active','valid_from','valid_until','category_id','display_order'];
      const sets = [], params = [];
      for (const k of allowed) if (b[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
      }
      if (sets.length) {
        sets.push(`updated_at = ?`); params.push(nowSec());
        params.push(req.params.id);
        db.prepare(`UPDATE pos_menu_packages SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      }
      if (Array.isArray(b.items)) {
        db.prepare(`DELETE FROM pos_menu_package_items WHERE package_id = ?`).run(req.params.id);
        const s = db.prepare(`INSERT INTO pos_menu_package_items (package_id, menu_id, size_id, qty, is_swappable, swap_category_id, display_order) VALUES (?,?,?,?,?,?,?)`);
        b.items.forEach((it, i) => s.run(req.params.id, it.menu_id, it.size_id || null, it.qty || 1,
          it.is_swappable ? 1 : 0, it.swap_category_id || null, it.display_order || i));
      }
    });
    tx();
    res.json({ ok: true });
  });

  router.delete('/packages/:id', (req, res) => {
    db.prepare(`DELETE FROM pos_menu_packages WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // ========== V2 CONSUME ==========
  router.post('/consume-stock-v2', (req, res) => {
    const { items, order_ref, actor, allow_negative } = req.body || {};
    const result = consumeStockForOrderV2(db, items, { order_ref, actor, allow_negative });
    if (!result.ok) return res.status(207).json(result);
    res.json(result);
  });

  // Get effective price for menu (with optional size)
  router.get('/menu-price/:menu_id', (req, res) => {
    const { size_id } = req.query;
    res.json({ menu_id: req.params.menu_id, size_id: size_id || null, price: getMenuPrice(db, req.params.menu_id, size_id) });
  });

  // ========== FULL MENU SHAPE V2 (with sizes + packages) ==========
  router.get('/menu-full', (req, res) => {
    const outlet = req.query.outlet;
    const allMenus = db.prepare(`
      SELECT m.*, c.name AS category_name FROM pos_menus m
      LEFT JOIN pos_menu_categories c ON c.id = m.category_id
      WHERE m.is_available = 1
      ORDER BY c.display_order, m.display_order
    `).all();

    // Outlet filter — fail-open: bad JSON or empty outlet_ids = available everywhere.
    const menus = outlet ? allMenus.filter(m => {
      if (!m.outlet_ids || m.outlet_ids === '' || m.outlet_ids === '[]') return true;
      try {
        const ids = JSON.parse(m.outlet_ids);
        return Array.isArray(ids) && (ids.length === 0 || ids.includes(outlet));
      } catch { return true; }
    }) : allMenus;

    const enrichedMenus = menus.map(m => {
      const variants = db.prepare(`
        SELECT v.*, s.name AS size_name FROM pos_menu_size_variants v
        JOIN pos_menu_sizes s ON s.id = v.size_id
        WHERE v.menu_id = ? AND v.is_available = 1
        ORDER BY s.display_order
      `).all(m.id);
      return { ...m, size_variants: variants };
    });

    const packages = db.prepare(`
      SELECT * FROM pos_menu_packages
      WHERE is_active = 1
        AND (valid_from IS NULL OR valid_from <= strftime('%s','now'))
        AND (valid_until IS NULL OR valid_until >= strftime('%s','now'))
      ORDER BY display_order, name
    `).all();

    const enrichedPackages = packages.map(p => {
      const items = db.prepare(`
        SELECT pi.*, m.name AS menu_name, m.emoji AS menu_emoji
        FROM pos_menu_package_items pi
        LEFT JOIN pos_menus m ON m.id = pi.menu_id
        WHERE pi.package_id = ? ORDER BY pi.display_order
      `).all(p.id);
      return { ...p, items };
    });

    res.json({ menus: enrichedMenus, packages: enrichedPackages });
  });

  const mountPath = opts.mountPath || '/api/master';
  app.use(mountPath, router);

  console.log(`[menu-builder] mounted at ${mountPath}`);
  console.log(`[menu-builder] sizes, packages, consume-stock-v2`);

  return {
    router, db,
    consumeStockForOrderV2: (items, ctx) => consumeStockForOrderV2(db, items, ctx),
    getMenuPrice: (menuId, sizeId) => getMenuPrice(db, menuId, sizeId)
  };
}

module.exports = { setupMenuBuilder, SCHEMA_SQL, consumeStockForOrderV2 };
