// server/item-master-backend.js
// Item Master — registry terpadu semua item: finished goods, raw
// material, packaging, modifier. Item core + kategori + tipe.
//
//   GET /api/item-master   — items + tipe + kategori + summary

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS item_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_code TEXT UNIQUE, sku TEXT, barcode TEXT,
  name TEXT, short_name TEXT, category TEXT, subcategory TEXT,
  item_type TEXT, base_price REAL DEFAULT 0, uom TEXT DEFAULT 'pcs',
  status TEXT DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
// 7 tipe item
const TYPES = [
  { type: 'Finished Goods', icon: '🍦' }, { type: 'Raw Material', icon: '🌾' },
  { type: 'Semi Finished', icon: '🧪' }, { type: 'Modifier', icon: '➕' },
  { type: 'Packaging', icon: '📦' }, { type: 'Service Item', icon: '🛎️' },
  { type: 'Promo Item', icon: '🎁' },
];
const CAT_MAP = { froyo: 'Frozen Yogurt', smoothies: 'Beverage', yogulato: 'Frozen Yogurt', takehome: 'Take Home', collab: 'Signature' };

function setupItemMaster(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // Seed registry dari pos_menus (finished goods) + audit_warehouse (material)
  if (db.prepare(`SELECT COUNT(*) c FROM item_master`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO item_master
      (item_code, sku, barcode, name, short_name, category, subcategory, item_type, base_price, uom)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let n = 1;
    const bc = () => '899' + String(2000000000 + n);
    for (const m of many(`SELECT category_id, name, price FROM pos_menus ORDER BY category_id, price`)) {
      const cat3 = (m.category_id || 'gen').slice(0, 3).toUpperCase();
      const code = `FG-${cat3}-${String(n).padStart(3, '0')}`;
      ins.run(code, 'SKU-' + code, bc(), m.name, m.name.split(' ')[0],
        CAT_MAP[m.category_id] || 'Lainnya', (m.category_id || '').replace(/^\w/, c => c.toUpperCase()),
        'Finished Goods', m.price || 0, 'pcs');
      n++;
    }
    for (const w of many(`SELECT id, name, unit, cost_per_unit FROM audit_warehouse ORDER BY id`)) {
      const type = /^RM/i.test(w.id) ? 'Raw Material' : /^PK/i.test(w.id) ? 'Packaging' : /^TP/i.test(w.id) ? 'Modifier' : 'Raw Material';
      ins.run(w.id, 'SKU-' + w.id, bc(), w.name, w.name.split(' ').slice(0, 2).join(' '),
        type === 'Packaging' ? 'Packaging' : type === 'Modifier' ? 'Topping' : 'Bahan Baku', '',
        type, w.cost_per_unit || 0, w.unit || 'pcs');
      n++;
    }
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const items = many(`SELECT * FROM item_master ORDER BY item_type, name`);
    const typeCount = {};
    const catCount = {};
    for (const it of items) {
      typeCount[it.item_type] = (typeCount[it.item_type] || 0) + 1;
      catCount[it.category] = (catCount[it.category] || 0) + 1;
    }
    res.json({
      items,
      types: TYPES.map(t => ({ ...t, count: typeCount[t.type] || 0 })),
      categories: Object.entries(catCount).map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      summary: {
        total: items.length,
        finished_goods: typeCount['Finished Goods'] || 0,
        raw_material: typeCount['Raw Material'] || 0,
        packaging: typeCount['Packaging'] || 0,
        active: items.filter(i => i.status === 'active').length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/item-master';
  app.use(mountPath, router);
  console.log(`[item-master] mounted at ${mountPath} — unified item registry`);

  return { router, db };
}

module.exports = { setupItemMaster };
