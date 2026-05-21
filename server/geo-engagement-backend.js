// server/geo-engagement-backend.js
// Geo & Outlet + Engagement + Customer Journey Analytics.
//
//   GET /api/geo-engagement

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function setupGeoEngagement(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };
  const one = (s) => { try { return db.prepare(s).get(); } catch { return null; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    // ── GEO & OUTLET ──
    const outlets = many(`SELECT name, area, revenue_today, health_score FROM outlets ORDER BY revenue_today DESC`)
      .map(o => ({ name: o.name, area: o.area, revenue: Math.round(o.revenue_today || 0), health: o.health_score || 0 }));
    const areaMap = {};
    for (const o of outlets) {
      const a = areaMap[o.area] = areaMap[o.area] || { area: o.area, outlets: 0, revenue: 0, health: 0 };
      a.outlets++; a.revenue += o.revenue; a.health += o.health;
    }
    const by_area = Object.values(areaMap).map(a => ({
      area: a.area, outlets: a.outlets, revenue: a.revenue, avg_health: Math.round(a.health / a.outlets),
    })).sort((x, y) => y.revenue - x.revenue);

    // ── ENGAGEMENT ──
    const channel = { cashier: 0, kiosk: 0, qr: 0 };
    for (const o of many(`SELECT source FROM orders`)) {
      const s = o.source || 'pos';
      if (/kiosk/i.test(s)) channel.kiosk++;
      else if (/customer|qr/i.test(s)) channel.qr++;
      else channel.cashier++;
    }
    const totalOrders = channel.cashier + channel.kiosk + channel.qr || 1;
    const totalCust = (one(`SELECT COUNT(*) c FROM customers`) || { c: 0 }).c;
    const members = (one(`SELECT COUNT(*) c FROM customers WHERE tags LIKE '%member%' OR tags LIKE '%vip%'`) || { c: 0 }).c;
    const withPoints = (one(`SELECT COUNT(*) c FROM customers WHERE points > 0`) || { c: 0 }).c;
    const ordered = (one(`SELECT COUNT(*) c FROM customers WHERE visits >= 1`) || { c: 0 }).c;
    const repeat = (one(`SELECT COUNT(*) c FROM customers WHERE visits >= 2`) || { c: 0 }).c;
    const loyal = (one(`SELECT COUNT(*) c FROM customers WHERE visits >= 10`) || { c: 0 }).c;
    const feedbackCount = (one(`SELECT COUNT(*) c FROM customer_feedback`) || { c: 0 }).c;

    // ── CUSTOMER JOURNEY (lifecycle funnel) ──
    const journey = [
      { stage: 'Total Customer', icon: '👥', count: totalCust },
      { stage: 'Aktif Order', icon: '🛒', count: ordered },
      { stage: 'Repeat Order', icon: '🔁', count: repeat },
      { stage: 'Jadi Member', icon: '💳', count: members },
      { stage: 'Loyalty Aktif', icon: '⭐', count: withPoints },
      { stage: 'Loyal Customer', icon: '👑', count: loyal },
    ].map(s => ({ ...s, pct: totalCust ? Math.round(s.count / totalCust * 100) : 0 }));

    res.json({
      geo: {
        outlets, by_area,
        peak_outlet: outlets[0] ? outlets[0].name : '—',
        peak_area: by_area[0] ? by_area[0].area : '—',
        network_revenue: outlets.reduce((s, o) => s + o.revenue, 0),
      },
      engagement: {
        channel,
        self_service_rate: Math.round((channel.kiosk + channel.qr) / totalOrders * 100),
        qr_rate: Math.round(channel.qr / totalOrders * 100),
        loyalty_participation: totalCust ? Math.round(withPoints / totalCust * 100) : 0,
        feedback_count: feedbackCount,
        members,
      },
      journey,
      summary: {
        outlets: outlets.length,
        areas: by_area.length,
        total_customers: totalCust,
        member_conversion: ordered ? Math.round(members / ordered * 100) : 0,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/geo-engagement';
  app.use(mountPath, router);
  console.log(`[geo-engagement] mounted at ${mountPath} — geo, engagement & journey`);

  return { router, db };
}

module.exports = { setupGeoEngagement };
