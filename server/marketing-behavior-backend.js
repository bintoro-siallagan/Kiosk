// server/marketing-behavior-backend.js
// Customer Behavior + Product Analytics — jam/hari favorit, channel,
// dine-in/takeaway, best-seller, slow-moving, upselling, peak time.
//
//   GET /api/marketing-behavior

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const normMs = (t) => (t > 1e12 ? t : (t || 0) * 1000);

function setupMarketingBehavior(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const orders = many(`SELECT time, type, source, items, total FROM orders`);

    const byHour = Array(24).fill(0);
    const byDay = Array(7).fill(0);
    const byType = { dinein: 0, takeaway: 0 };
    const byChannel = { cashier: 0, kiosk: 0, qr: 0 };
    const menu = {};
    let upsellOrders = 0, totalRevenue = 0;

    for (const o of orders) {
      const dt = new Date(normMs(o.time));
      const h = dt.getHours(), dy = dt.getDay();
      if (h >= 0 && h < 24) byHour[h]++;
      if (dy >= 0 && dy < 7) byDay[dy]++;
      if (/dine/i.test(o.type || '')) byType.dinein++; else byType.takeaway++;
      const src = o.source || 'pos';
      if (/kiosk/i.test(src)) byChannel.kiosk++;
      else if (/customer|qr/i.test(src)) byChannel.qr++;
      else byChannel.cashier++;
      totalRevenue += o.total || 0;

      let items = []; try { items = JSON.parse(o.items || '[]'); } catch { items = []; }
      let hasAddon = false;
      for (const it of items) {
        const nm = (it.n || it.name || it.display_name || 'Item').toString();
        const q = it.q || it.qty || 1, p = it.p || it.price || 0;
        const m = menu[nm] = menu[nm] || { qty: 0, revenue: 0 };
        m.qty += q; m.revenue += q * p;
        if ((it.addonTotal || 0) > 0) hasAddon = true;
      }
      if (hasAddon) upsellOrders++;
    }

    const menuArr = Object.entries(menu).map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.qty - a.qty);
    const count = orders.length || 1;
    const peakHour = byHour.indexOf(Math.max(...byHour));
    const peakDay = byDay.indexOf(Math.max(...byDay));

    res.json({
      by_hour: byHour,
      by_day: byDay.map((v, i) => ({ day: DAYS[i], count: v })),
      by_type: byType,
      by_channel: byChannel,
      best_seller: menuArr.slice(0, 8),
      slow_moving: menuArr.slice(-5).reverse(),
      summary: {
        total_orders: orders.length,
        avg_spending: Math.round(totalRevenue / count),
        upsell_rate: Math.round(upsellOrders / count * 100),
        peak_hour: peakHour,
        peak_day: DAYS[peakDay] || '—',
        menu_variety: menuArr.length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/marketing-behavior';
  app.use(mountPath, router);
  console.log(`[marketing-behavior] mounted at ${mountPath} — behavior & product analytics`);

  return { router, db };
}

module.exports = { setupMarketingBehavior };
