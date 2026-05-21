// server/engagement-backend.js
// Sales & Engagement — Command Center Core Indicator #4.
// Channel mix (POS/Kiosk/QR), self-service adoption, promo & loyalty engagement.
//
//   GET /api/engagement → { summary, channels, promo, loyalty }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SRC = {
  pos:             { label: 'POS — Kasir',       icon: '🧾', self: false },
  kiosk:           { label: 'Kiosk Self-Order',  icon: '🖥️', self: true },
  customer_portal: { label: 'QR Order',          icon: '📱', self: true },
};

function setupEngagement(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    // ── Channel mix ──
    const rows = many(`SELECT source, COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders GROUP BY source`);
    const totalOrders = rows.reduce((s, r) => s + r.orders, 0) || 1;
    const channels = rows.map(r => {
      const meta = SRC[r.source] || { label: 'Lainnya', icon: '•', self: false };
      return {
        source: r.source || 'lainnya', label: meta.label, icon: meta.icon, self_service: meta.self,
        orders: r.orders, revenue: r.revenue, pct: Math.round(r.orders / totalOrders * 100),
      };
    }).sort((a, b) => b.orders - a.orders);
    const selfOrders = channels.filter(c => c.self_service).reduce((s, c) => s + c.orders, 0);

    // ── Promo engagement ──
    const promo = one(`SELECT COUNT(*) total,
      SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) active,
      COALESCE(SUM(used_count),0) redemptions FROM promos`) || { total: 0, active: 0, redemptions: 0 };

    // ── Loyalty engagement ──
    const loy = one(`SELECT COUNT(*) members, COALESCE(SUM(current_points),0) points,
      SUM(CASE WHEN total_visits>=2 THEN 1 ELSE 0 END) repeat
      FROM loyalty_customers WHERE is_active=1`) || { members: 0, points: 0, repeat: 0 };

    res.json({
      summary: {
        total_orders: totalOrders,
        self_service_pct: Math.round(selfOrders / totalOrders * 100),
        promo_redemptions: promo.redemptions || 0,
        loyalty_members: loy.members || 0,
      },
      channels,
      promo: { total: promo.total || 0, active: promo.active || 0, redemptions: promo.redemptions || 0 },
      loyalty: {
        members: loy.members || 0, points_outstanding: loy.points || 0,
        repeat: loy.repeat || 0, repeat_pct: loy.members ? Math.round((loy.repeat || 0) / loy.members * 100) : 0,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/engagement';
  app.use(mountPath, router);
  console.log(`[engagement] mounted at ${mountPath} — channel mix + engagement`);

  return { router, db };
}

module.exports = { setupEngagement };
