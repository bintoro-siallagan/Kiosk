// server/loyalty-promo-backend.js
// Loyalty + Promo + Campaign Analytics — promo performance, redemption
// rate, loyalty point flow, member retention, channel response.
//
//   GET /api/loyalty-promo

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function setupLoyaltyPromo(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };
  const one = (s) => { try { return db.prepare(s).get(); } catch { return null; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    // ── Promo performance (dari order nyata) ──
    const promoOrders = many(`SELECT promo_code AS code, COUNT(*) AS orders,
      COALESCE(SUM(promo_discount),0) AS discount, COALESCE(SUM(total),0) AS revenue
      FROM orders WHERE promo_code IS NOT NULL AND promo_code != '' GROUP BY promo_code ORDER BY orders DESC`)
      .map(p => ({ ...p, roi: p.discount > 0 ? Math.round(p.revenue / p.discount * 10) / 10 : null }));

    // ── Katalog promo + redemption rate ──
    const catalog = many(`SELECT code, type, value, used_count, usage_limit, active, for_member FROM promos ORDER BY used_count DESC`)
      .map(p => ({ ...p, redemption_rate: p.usage_limit > 0 ? Math.round(p.used_count / p.usage_limit * 100) : 0 }));

    // ── Loyalty ──
    const members = (one(`SELECT COUNT(*) c FROM customers WHERE tags LIKE '%member%' OR tags LIKE '%vip%'`) || { c: 0 }).c;
    const vip = (one(`SELECT COUNT(*) c FROM customers WHERE tags LIKE '%vip%'`) || { c: 0 }).c;
    const repeatMembers = (one(`SELECT COUNT(*) c FROM customers WHERE (tags LIKE '%member%' OR tags LIKE '%vip%') AND visits >= 2`) || { c: 0 }).c;
    const totalPoints = (one(`SELECT COALESCE(SUM(points),0) p FROM customers`) || { p: 0 }).p;
    const pts = one(`SELECT COALESCE(SUM(points_earned),0) e, COALESCE(SUM(points_redeemed),0) r, COALESCE(SUM(points_discount),0) d FROM orders`) || { e: 0, r: 0, d: 0 };

    // ── Channel response (QR scan source) ──
    const channel = { cashier: 0, kiosk: 0, qr: 0 };
    for (const o of many(`SELECT source FROM orders`)) {
      const s = o.source || 'pos';
      if (/kiosk/i.test(s)) channel.kiosk++;
      else if (/customer|qr/i.test(s)) channel.qr++;
      else channel.cashier++;
    }

    const totalDisc = promoOrders.reduce((s, p) => s + p.discount, 0);
    const totalPromoOrders = promoOrders.reduce((s, p) => s + p.orders, 0);

    res.json({
      promo: {
        usage: promoOrders,
        catalog,
        summary: {
          promo_orders: totalPromoOrders,
          total_discount: totalDisc,
          promo_revenue: promoOrders.reduce((s, p) => s + p.revenue, 0),
          active_promos: catalog.filter(p => p.active).length,
          best_promo: promoOrders[0] ? promoOrders[0].code : '—',
        },
      },
      loyalty: {
        members, vip,
        retention_rate: members ? Math.round(repeatMembers / members * 100) : 0,
        total_points: totalPoints,
        point_earned: pts.e,
        point_used: pts.r,
        point_discount_value: pts.d,
      },
      channel,
    });
  });

  const mountPath = opts.mountPath || '/api/loyalty-promo';
  app.use(mountPath, router);
  console.log(`[loyalty-promo] mounted at ${mountPath} — loyalty & promo analytics`);

  return { router, db };
}

module.exports = { setupLoyaltyPromo };
