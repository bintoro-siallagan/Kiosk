// server/food-cost-backend.js
// Real-time Food Cost — tiap menu punya resep (menu_recipes: bahan +
// qty). Food cost dihitung LIVE dari harga bahan di warehouse, jadi
// begitu harga bahan naik, food cost & margin ikut update.
//
//   GET /api/food-cost   — food cost + margin per menu + summary

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS menu_recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  qty REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;

function setupFoodCost(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  // ── Seed resep tiap menu (sekali) ──
  if (db.prepare(`SELECT COUNT(*) c FROM menu_recipes`).get().c === 0) {
    const menus = many(`SELECT id, name, category_id FROM pos_menus`);
    const ins = db.prepare(`INSERT INTO menu_recipes (menu_id, sku, qty) VALUES (?,?,?)`);
    for (const m of menus) {
      const cat = m.category_id, nm = (m.name || '').toLowerCase();
      const lines = [];
      const add = (sku, qty) => lines.push([sku, qty]);
      if (cat === 'froyo') { add('RM01', 0.10); add('PK01', 1); add('PK03', 1); add('PK04', 1); }
      else if (cat === 'yogulato') { add('RM01', 0.13); add('RM03', 0.05); add('PK01', 1); add('PK03', 1); add('PK04', 1); }
      else if (cat === 'smoothies') { add('RM01', 0.06); add('RM03', 0.12); add('RM04', 0.025); add('PK02', 1); add('PK03', 1); add('PK04', 1); }
      else if (cat === 'collab') { add('RM01', 0.12); add('TP01', 0.03); add('TP04', 0.03); add('PK02', 1); add('PK03', 1); add('PK04', 1); }
      else if (cat === 'takehome') { add('RM01', /quart/.test(nm) ? 0.9 : 0.45); add('PK05', 1); }
      else { add('RM01', 0.10); add('PK01', 1); add('PK04', 1); }
      if (/strawberry/.test(nm)) add('RM05', 0.04);
      if (/mango/.test(nm)) add('RM06', 0.05);
      if (/matcha/.test(nm)) add('RM07', 0.012);
      if (/choco/.test(nm)) add('TP03', 0.03);
      if (/mixed berry|tropical/.test(nm)) { add('RM05', 0.04); add('RM06', 0.04); }
      for (const [sku, qty] of lines) ins.run(m.id, sku, qty);
    }
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const menus = many(`SELECT id, name, price, category_id FROM pos_menus ORDER BY category_id, price`);
    const wh = {};
    for (const w of many(`SELECT id, name, unit, cost_per_unit FROM audit_warehouse`)) wh[w.id] = w;

    const items = menus.map(m => {
      const recipe = many(`SELECT sku, qty FROM menu_recipes WHERE menu_id = ?`, m.id).map(r => {
        const w = wh[r.sku] || { name: r.sku, unit: '', cost_per_unit: 0 };
        return { sku: r.sku, name: w.name, qty: r.qty, unit: w.unit, cost: Math.round(r.qty * w.cost_per_unit) };
      });
      const food_cost = recipe.reduce((s, r) => s + r.cost, 0);
      const margin = m.price - food_cost;
      return {
        menu_id: m.id, name: m.name, category: m.category_id, price: m.price, recipe, food_cost,
        food_cost_pct: m.price ? Math.round(food_cost / m.price * 100) : 0,
        margin, margin_pct: m.price ? Math.round(margin / m.price * 100) : 0,
      };
    });
    const withRecipe = items.filter(i => i.recipe.length > 0);

    res.json({
      items,
      summary: {
        total_menu: items.length,
        avg_food_cost_pct: withRecipe.length
          ? Math.round(withRecipe.reduce((s, i) => s + i.food_cost_pct, 0) / withRecipe.length) : 0,
        high_count: items.filter(i => i.food_cost_pct > 40).length,
        best: withRecipe.slice().sort((a, b) => a.food_cost_pct - b.food_cost_pct)[0]?.name || '-',
        worst: withRecipe.slice().sort((a, b) => b.food_cost_pct - a.food_cost_pct)[0]?.name || '-',
      },
    });
  });

  const mountPath = opts.mountPath || '/api/food-cost';
  app.use(mountPath, router);
  console.log(`[food-cost] mounted at ${mountPath} — real-time food cost`);

  return { router, db };
}

module.exports = { setupFoodCost };
