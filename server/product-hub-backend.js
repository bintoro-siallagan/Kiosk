// server/product-hub-backend.js
// Product Hub — agregasi semua modul item (master/pricing/config/
// rules/intel) jadi satu Product Quick View 360°.
//
//   GET /api/product-hub

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function healthOf(margin, waste, sold) {
  if (waste > 8) return { status: 'High Waste', color: '#ef4444' };
  if (sold < 35) return { status: 'Slow Moving', color: '#f59e0b' };
  if (margin < 52) return { status: 'Low Margin', color: '#fb923c' };
  return { status: 'Healthy', color: '#10b981' };
}

function setupProductHub(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };
  const mapBy = (rows, k) => { const m = {}; for (const r of rows) m[r[k]] = r; return m; };

  const router = express.Router();

  router.get('/', (req, res) => {
    const fg = many(`SELECT item_code, name, category FROM item_master WHERE item_type = 'Finished Goods'`);
    const pricing = mapBy(many(`SELECT * FROM item_pricing`), 'item_code');
    const inv = mapBy(many(`SELECT * FROM item_inventory`), 'item_code');
    const rules = mapBy(many(`SELECT * FROM item_rules`), 'item_code');
    const intel = mapBy(many(`SELECT * FROM item_intel`), 'item_code');
    const emoji = {};
    for (const m of many(`SELECT name, emoji FROM pos_menus`)) emoji[m.name] = m.emoji;

    const soldList = Object.values(intel).map(x => x.monthly_sold || 0).sort((a, b) => b - a);
    const top5 = soldList[4] || 0;

    const products = fg.map(it => {
      const pr = pricing[it.item_code] || {}, iv = inv[it.item_code] || {};
      const ru = rules[it.item_code] || {}, ai = intel[it.item_code] || {};
      const margin = Math.round(ai.margin_pct || 0), waste = Math.round(ai.waste_pct || 0), sold = ai.monthly_sold || 0;
      const h = healthOf(margin, waste, sold);
      const tags = [];
      if (sold >= top5 && top5) tags.push('Best Seller');
      if (margin >= 65) tags.push('High Margin');
      if (ai.seasonal) tags.push('Seasonal');
      if (sold < 35) tags.push('Slow Moving');
      if ((ai.point_multiplier || 1) > 1) tags.push('2x Point');
      let channels = []; try { channels = JSON.parse(pr.channels || '[]'); } catch { channels = []; }
      return {
        item_code: it.item_code, name: it.name, category: it.category, emoji: emoji[it.name] || '🍦',
        price_dinein: pr.price_dinein || 0, price_online: pr.price_online || 0, tax_type: pr.tax_type || 'PPN 11%',
        channels,
        inventory_type: iv.inventory_type || 'non-stock',
        kitchen_station: ru.kitchen_station || 'Bar', availability_mode: ru.availability_mode || 'Always',
        promo_eligible: !!ru.promo_eligible, loyalty_eligible: !!ru.loyalty_eligible,
        margin_pct: margin, waste_pct: waste, monthly_sold: sold,
        point_multiplier: ai.point_multiplier || 1,
        health: h.status, health_color: h.color, tags,
      };
    });

    const n = products.length || 1;
    res.json({
      products,
      summary: {
        total: products.length,
        healthy: products.filter(p => p.health === 'Healthy').length,
        avg_margin: Math.round(products.reduce((s, p) => s + p.margin_pct, 0) / n),
        avg_price: Math.round(products.reduce((s, p) => s + p.price_dinein, 0) / n),
        total_sold: products.reduce((s, p) => s + p.monthly_sold, 0),
        promo_items: products.filter(p => p.promo_eligible).length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/product-hub';
  app.use(mountPath, router);
  console.log(`[product-hub] mounted at ${mountPath} — product 360 quick view`);

  return { router, db };
}

module.exports = { setupProductHub };
