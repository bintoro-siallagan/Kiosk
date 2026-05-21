// server/item-intel-backend.js
// Item Intelligence — Health Monitor, AI tag, loyalty rule, supplier
// link, central kitchen flow & approval rule.
//
//   GET /api/item-intel

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS item_intel (
  item_code TEXT PRIMARY KEY,
  margin_pct REAL, waste_pct REAL, monthly_sold INTEGER,
  point_multiplier REAL DEFAULT 1, seasonal INTEGER DEFAULT 0
);
`;
// Reference config (struktur — ilustratif)
const APPROVAL_RULES = [
  { change: 'Perubahan Harga', approver: 'Outlet Manager', icon: '💲' },
  { change: 'Stock Adjustment', approver: 'Supervisor', icon: '📦' },
  { change: 'Update Recipe / BOM', approver: 'Area Manager', icon: '🍳' },
  { change: 'Tambah / Hapus Item', approver: 'Super Admin', icon: '➕' },
];
const SUPPLIERS = [
  { name: 'PT Dairy Prima', supplies: 'Yogurt Base, Susu', lead_time: '2 hari', moq: '50 kg' },
  { name: 'Fresh Fruit Co', supplies: 'Buah-buahan', lead_time: '1 hari', moq: '20 kg' },
  { name: 'Packaging Mandiri', supplies: 'Cup, Lid, Sendok', lead_time: '5 hari', moq: '1.000 pcs' },
  { name: 'Topping Supplier ID', supplies: 'Granola, Oreo, Mochi', lead_time: '3 hari', moq: '10 kg' },
];
const CENTRAL_KITCHEN = [
  { name: 'House Signature Sauce', type: 'Sauce' },
  { name: 'Yogurt Base Mix', type: 'Base' },
  { name: 'Waffle Cone Dough', type: 'Dough' },
];

function healthOf(m) {
  if (m.waste_pct > 8) return { status: 'High Waste', color: '#ef4444' };
  if (m.monthly_sold < 35) return { status: 'Slow Moving', color: '#f59e0b' };
  if (m.margin_pct < 52) return { status: 'Low Margin', color: '#fb923c' };
  return { status: 'Healthy', color: '#10b981' };
}

function setupItemIntel(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // Seed intel per finished-goods item
  if (db.prepare(`SELECT COUNT(*) c FROM item_intel`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO item_intel (item_code, margin_pct, waste_pct, monthly_sold, point_multiplier, seasonal) VALUES (?,?,?,?,?,?)`);
    let i = 0;
    for (const it of many(`SELECT item_code FROM item_master WHERE item_type = 'Finished Goods'`)) {
      ins.run(it.item_code, 48 + (i * 7) % 32, 1 + (i * 5) % 13, 20 + (i * 23) % 180,
        i % 4 === 0 ? 2 : 1, i % 7 === 0 ? 1 : 0);
      i++;
    }
  }

  const router = express.Router();

  router.get('/', (req, res) => {
    const rows = many(`SELECT m.item_code, m.name, m.category, i.*
      FROM item_master m JOIN item_intel i ON i.item_code = m.item_code
      WHERE m.item_type = 'Finished Goods' ORDER BY i.monthly_sold DESC`);
    const soldRank = rows.map(r => r.monthly_sold).sort((a, b) => b - a);
    const top5 = soldRank[4] || 0;

    const items = rows.map(r => {
      const h = healthOf(r);
      const tags = [];
      if (r.monthly_sold >= top5) tags.push('Best Seller');
      if (r.margin_pct >= 65) tags.push('High Margin');
      if (r.seasonal) tags.push('Seasonal');
      if (r.margin_pct >= 60 && r.monthly_sold < 70) tags.push('Upsell Target');
      if (r.monthly_sold < 35) tags.push('Slow Moving');
      if (r.point_multiplier > 1) tags.push('2x Point');
      return {
        item_code: r.item_code, name: r.name, category: r.category,
        margin_pct: Math.round(r.margin_pct), waste_pct: Math.round(r.waste_pct),
        monthly_sold: r.monthly_sold, point_multiplier: r.point_multiplier,
        health: h.status, health_color: h.color, tags,
      };
    });
    const hDist = {};
    for (const it of items) hDist[it.health] = (hDist[it.health] || 0) + 1;

    res.json({
      items,
      health_dist: ['Healthy', 'Slow Moving', 'Low Margin', 'High Waste'].map(s => ({ status: s, count: hDist[s] || 0 })),
      approval_rules: APPROVAL_RULES,
      suppliers: SUPPLIERS,
      central_kitchen: CENTRAL_KITCHEN,
      summary: {
        total: items.length,
        healthy: hDist['Healthy'] || 0,
        attention: (hDist['Slow Moving'] || 0) + (hDist['High Waste'] || 0) + (hDist['Low Margin'] || 0),
        avg_margin: items.length ? Math.round(items.reduce((s, i) => s + i.margin_pct, 0) / items.length) : 0,
        loyalty_boosted: items.filter(i => i.point_multiplier > 1).length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/item-intel';
  app.use(mountPath, router);
  console.log(`[item-intel] mounted at ${mountPath} — item health & AI tags`);

  return { router, db };
}

module.exports = { setupItemIntel };
