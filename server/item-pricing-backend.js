// server/item-pricing-backend.js
// Item Pricing — multi-price (dine-in/takeaway/online/kiosk/employee/
// franchise), sales channel rule & tax/finance config per item.
//
//   GET  /api/item-pricing          — items + pricing + channel + finance
//   POST /api/item-pricing/:code    — update pricing/channel/tax 1 item

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS item_pricing (
  item_code TEXT PRIMARY KEY,
  price_dinein REAL, price_takeaway REAL, price_online REAL,
  price_kiosk REAL, price_employee REAL, price_franchise REAL,
  channels TEXT, tax_type TEXT DEFAULT 'PPN 11%',
  sales_account TEXT DEFAULT '4-100 Pendapatan Penjualan',
  cogs_account TEXT DEFAULT '5-100 HPP'
);
`;
const CHANNELS = ['POS', 'QR Order', 'Kiosk', 'Delivery', 'Cinema', 'Signage'];
const PRICE_FIELDS = ['price_dinein', 'price_takeaway', 'price_online', 'price_kiosk', 'price_employee', 'price_franchise'];
const TAX_TYPES = ['PPN 11%', 'Non-PPN', 'PPN 11% + Service 5%'];

function setupItemPricing(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  // Seed pricing per finished-goods item
  const fg = many(`SELECT item_code, name, base_price FROM item_master WHERE item_type = 'Finished Goods'`);
  const ins = db.prepare(`INSERT OR IGNORE INTO item_pricing
    (item_code, price_dinein, price_takeaway, price_online, price_kiosk, price_employee, price_franchise, channels)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const it of fg) {
    const b = it.base_price || 0;
    ins.run(it.item_code, b, b, b + 2500, b, Math.round(b * 0.7 / 500) * 500, b, JSON.stringify(CHANNELS));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = many(`SELECT m.item_code, m.name, m.category, m.base_price, p.*
      FROM item_master m JOIN item_pricing p ON p.item_code = m.item_code
      WHERE m.item_type = 'Finished Goods' ORDER BY m.category, m.name`);
    const items = rows.map(r => ({
      item_code: r.item_code, name: r.name, category: r.category,
      prices: {
        dinein: r.price_dinein, takeaway: r.price_takeaway, online: r.price_online,
        kiosk: r.price_kiosk, employee: r.price_employee, franchise: r.price_franchise,
      },
      channels: (() => { try { return JSON.parse(r.channels || '[]'); } catch { return []; } })(),
      tax_type: r.tax_type, sales_account: r.sales_account, cogs_account: r.cogs_account,
    }));
    res.json({
      items, channel_catalog: CHANNELS, tax_types: TAX_TYPES,
      summary: {
        total: items.length,
        avg_dinein: items.length ? Math.round(items.reduce((s, i) => s + (i.prices.dinein || 0), 0) / items.length) : 0,
        online_markup: 2500,
        full_channel: items.filter(i => i.channels.length === CHANNELS.length).length,
      },
    });
  });

  router.post('/:code', (req, res) => {
    const row = db.prepare(`SELECT * FROM item_pricing WHERE item_code = ?`).get(req.params.code);
    if (!row) return res.status(404).json({ error: 'item tidak ditemukan' });
    const b = req.body || {};
    const p = b.prices || {};
    const map = { dinein: 'price_dinein', takeaway: 'price_takeaway', online: 'price_online', kiosk: 'price_kiosk', employee: 'price_employee', franchise: 'price_franchise' };
    const next = {};
    for (const [k, col] of Object.entries(map)) next[col] = p[k] != null ? Math.max(0, Number(p[k]) || 0) : row[col];
    const channels = Array.isArray(b.channels) ? b.channels.filter(c => CHANNELS.includes(c)) : JSON.parse(row.channels || '[]');
    const tax = TAX_TYPES.includes(b.tax_type) ? b.tax_type : row.tax_type;
    db.prepare(`UPDATE item_pricing SET price_dinein=?, price_takeaway=?, price_online=?, price_kiosk=?,
      price_employee=?, price_franchise=?, channels=?, tax_type=? WHERE item_code=?`).run(
      next.price_dinein, next.price_takeaway, next.price_online, next.price_kiosk,
      next.price_employee, next.price_franchise, JSON.stringify(channels), tax, row.item_code);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/item-pricing';
  app.use(mountPath, router);
  console.log(`[item-pricing] mounted at ${mountPath} — multi-price & channel rule`);

  return { router, db };
}

module.exports = { setupItemPricing };
