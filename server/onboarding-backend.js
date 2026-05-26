// server/onboarding-backend.js
// Sample data starter pack untuk tenant baru.
// POST /api/onboarding/seed-sample — load 8 menu items + 3 customers + departments
// untuk current tenant scope (req.companyScope.company_id).
//
// Idempotent dengan unique markers — re-run gak duplicate.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SAMPLE_MENU = [
  { id: 9001, cat: 'main',   emoji: '🍔', name: 'Sample Burger',     desc: 'Beef patty + cheese + sayur', price: 35000, avail: 1 },
  { id: 9002, cat: 'main',   emoji: '🍕', name: 'Sample Pizza',      desc: 'Mozzarella + tomato + basil', price: 65000, avail: 1 },
  { id: 9003, cat: 'main',   emoji: '🍜', name: 'Sample Noodle',     desc: 'Mie ayam + pangsit',         price: 28000, avail: 1 },
  { id: 9004, cat: 'snack',  emoji: '🍟', name: 'Sample Fries',      desc: 'Crispy potato + sauce',      price: 18000, avail: 1 },
  { id: 9005, cat: 'snack',  emoji: '🥗', name: 'Sample Salad',      desc: 'Fresh greens + dressing',    price: 32000, avail: 1 },
  { id: 9006, cat: 'drink',  emoji: '☕', name: 'Sample Kopi Susu',   desc: 'Espresso + susu segar',      price: 22000, avail: 1 },
  { id: 9007, cat: 'drink',  emoji: '🧋', name: 'Sample Boba',       desc: 'Milk tea + tapioca pearls',  price: 25000, avail: 1 },
  { id: 9008, cat: 'dessert',emoji: '🍰', name: 'Sample Cheesecake', desc: 'New York style',             price: 32000, avail: 1 },
];

const SAMPLE_CUSTOMERS = [
  { name: 'Demo Customer 1', phone: '0812-1111-1111' },
  { name: 'Demo Customer 2', phone: '0812-2222-2222' },
  { name: 'Demo Customer 3', phone: '0812-3333-3333' },
];

const SAMPLE_CATEGORIES = [
  { id: 'main', name: 'Makanan Utama', emoji: '🍽️', order: 1 },
  { id: 'snack', name: 'Snack', emoji: '🍟', order: 2 },
  { id: 'drink', name: 'Minuman', emoji: '🥤', order: 3 },
  { id: 'dessert', name: 'Dessert', emoji: '🍰', order: 4 },
];

function nowSec() { return Math.floor(Date.now() / 1000); }

function setupOnboarding(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const router = express.Router();
  router.use(express.json());

  // POST /api/onboarding/seed-sample
  // Auto-inject company_id dari req.companyScope.
  router.post('/seed-sample', (req, res) => {
    const scope = req.companyScope || {};
    const companyId = scope.company_id;
    if (!companyId || scope.is_super_admin) {
      return res.status(400).json({ error: 'Endpoint untuk tenant scope. Login sebagai owner tenant dulu.' });
    }

    const results = { menu_added: 0, customers_added: 0, categories_added: 0, already_have: false };

    try {
      // Check apakah tenant sudah punya menu — kalau iya, skip
      const existingMenu = db.prepare(`SELECT COUNT(*) c FROM pos_menus WHERE company_id = ?`).get(companyId).c;
      if (existingMenu > 0) {
        results.already_have = true;
        results.existing_menu = existingMenu;
        return res.status(409).json({ error: 'Tenant sudah punya menu items', ...results });
      }

      const tx = db.transaction(() => {
        // 1. Seed categories (kalau belum)
        const catIns = db.prepare(`INSERT OR IGNORE INTO pos_menu_categories (id, name, emoji, display_order, company_id) VALUES (?,?,?,?,?)`);
        for (const c of SAMPLE_CATEGORIES) {
          // ID unique per category — append company suffix biar gak conflict cross-tenant
          const catId = `${c.id}_${companyId}`;
          catIns.run(catId, c.name, c.emoji, c.order, companyId);
          results.categories_added++;
        }

        // 2. Seed menu items (pos_menus.id is TEXT)
        const menuIns = db.prepare(`INSERT OR IGNORE INTO pos_menus (id, category_id, emoji, name, description, price, is_available, company_id) VALUES (?,?,?,?,?,?,?,?)`);
        for (const m of SAMPLE_MENU) {
          const itemId = `M_DEMO_${m.id}_${companyId}`;
          const catId = `${m.cat}_${companyId}`;
          menuIns.run(itemId, catId, m.emoji, m.name, m.desc, m.price, m.avail, companyId);
          results.menu_added++;
        }

        // 3. Seed customers
        const custIns = db.prepare(`INSERT OR IGNORE INTO customers (id, name, phone, visits, total_spend, created_at, last_visit, tags, points, company_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
        for (const c of SAMPLE_CUSTOMERS) {
          const cid = `C_DEMO_${companyId}_${Math.random().toString(36).slice(2, 7)}`;
          custIns.run(cid, c.name, c.phone, 0, 0, Date.now(), null, JSON.stringify(['sample','demo']), 0, companyId);
          results.customers_added++;
        }
      });
      tx();

      console.log(`[onboarding] seeded sample for company_id=${companyId}: ${results.menu_added} menu, ${results.customers_added} customers, ${results.categories_added} categories`);
      res.json({ ok: true, ...results, message: 'Sample data berhasil di-load — refresh untuk melihat hasilnya' });
    } catch (e) {
      console.error('[onboarding] seed error', e);
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/onboarding/reset-sample — hapus semua data sample (untuk reset demo)
  router.post('/reset-sample', (req, res) => {
    const scope = req.companyScope || {};
    if (!scope.company_id || scope.is_super_admin) return res.status(400).json({ error: 'tenant scope only' });
    try {
      const menuDel = db.prepare(`DELETE FROM pos_menus WHERE company_id = ? AND id LIKE 'M_DEMO_%'`).run(scope.company_id);
      const catDel = db.prepare(`DELETE FROM pos_menu_categories WHERE company_id = ? AND id LIKE ?`).run(scope.company_id, `%_${scope.company_id}`);
      const custDel = db.prepare(`DELETE FROM customers WHERE company_id = ? AND id LIKE 'C_DEMO_%'`).run(scope.company_id);
      res.json({ ok: true, menu_removed: menuDel.changes, categories_removed: catDel.changes, customers_removed: custDel.changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/onboarding/status — quick check buat banner
  router.get('/status', (req, res) => {
    const scope = req.companyScope || {};
    if (!scope.company_id || scope.is_super_admin) return res.json({ super_admin: true });
    try {
      const menuCount = db.prepare(`SELECT COUNT(*) c FROM pos_menus WHERE company_id = ?`).get(scope.company_id).c;
      const custCount = db.prepare(`SELECT COUNT(*) c FROM customers WHERE company_id = ?`).get(scope.company_id).c;
      const orderCount = db.prepare(`SELECT COUNT(*) c FROM orders WHERE company_id = ?`).get(scope.company_id).c;
      const outletCount = db.prepare(`SELECT COUNT(*) c FROM outlet_master WHERE company_id = ?`).get(scope.company_id).c;
      const outletWithGps = db.prepare(`SELECT COUNT(*) c FROM outlet_master WHERE company_id = ? AND lat IS NOT NULL`).get(scope.company_id).c;
      res.json({
        menu_count: menuCount,
        customer_count: custCount,
        order_count: orderCount,
        outlet_count: outletCount,
        outlet_with_gps: outletWithGps,
        is_fresh: menuCount === 0 && custCount === 0 && orderCount === 0,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.use(opts.mountPath || '/api/onboarding', router);
  console.log(`[onboarding] mounted at ${opts.mountPath || '/api/onboarding'} — sample data starter pack`);

  return { router, db };
}

module.exports = { setupOnboarding };
