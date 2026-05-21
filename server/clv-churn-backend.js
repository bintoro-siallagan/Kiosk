// server/clv-churn-backend.js
// Customer Lifetime Value + Churn Detection — nilai customer seumur
// hidup + deteksi customer mulai jarang datang → target comeback promo.
//
//   GET /api/clv-churn

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DAY = 86400000; // ms
const normMs = (t) => (t > 1e12 ? t : (t || 0) * 1000);

const CLV_TIER = (v) => (v >= 1e7 ? 'Platinum' : v >= 5e6 ? 'Gold' : v >= 2e6 ? 'Silver' : 'Bronze');
// suggested comeback promo per stage churn
const COMEBACK = {
  'At Risk': 'Comeback 20% OFF — sebelum hilang',
  'Churned': 'We Miss You — 30% OFF + free topping',
};

function setupClvChurn(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const now = Date.now();
    const rows = many(`SELECT name, phone, visits, total_spend, last_visit, created_at, tags FROM customers WHERE visits > 0`);

    const customers = rows.map(c => {
      const visits = Math.max(1, c.visits || 1);
      const clv = c.total_spend || 0;
      const avg_order = Math.round(clv / visits);
      const lifespanDays = Math.max(1, Math.floor((now - normMs(c.created_at || c.last_visit)) / DAY));
      const visitsPerMonth = visits / Math.max(1, lifespanDays / 30);
      const projected_12mo = Math.round(avg_order * visitsPerMonth * 12);
      const recency_days = Math.max(0, Math.floor((now - normMs(c.last_visit)) / DAY));
      const typical_gap = Math.max(1, Math.round(lifespanDays / visits));
      const tier = CLV_TIER(clv);

      let stage;
      if ((c.visits || 0) < 2) stage = 'New';
      else {
        const ratio = recency_days / typical_gap;
        stage = ratio <= 1.5 ? 'Active' : ratio <= 3 ? 'Cooling' : ratio <= 6 ? 'At Risk' : 'Churned';
      }
      return {
        name: c.name || '—', phone: c.phone,
        clv, avg_order, projected_12mo, tier,
        visits: c.visits || 0, recency_days, typical_gap, stage,
      };
    });

    // ── CLV ──
    const tier_dist = { Platinum: 0, Gold: 0, Silver: 0, Bronze: 0 };
    for (const c of customers) tier_dist[c.tier]++;
    const byClv = customers.slice().sort((a, b) => b.clv - a.clv);
    const totalClv = customers.reduce((s, c) => s + c.clv, 0);

    // ── Churn ──
    const stage_dist = { New: 0, Active: 0, Cooling: 0, 'At Risk': 0, Churned: 0 };
    for (const c of customers) stage_dist[c.stage]++;
    const comeback_targets = customers
      .filter(c => c.stage === 'At Risk' || c.stage === 'Churned')
      .sort((a, b) => b.clv - a.clv)
      .map(c => ({
        name: c.name, phone: c.phone, recency_days: c.recency_days, typical_gap: c.typical_gap,
        stage: c.stage, clv: c.clv, suggested_promo: COMEBACK[c.stage],
      }));
    const churned = stage_dist['At Risk'] + stage_dist.Churned;

    res.json({
      clv: {
        top: byClv.slice(0, 10),
        tier_dist,
        summary: {
          total_clv: totalClv,
          avg_clv: Math.round(totalClv / (customers.length || 1)),
          projected_total: customers.reduce((s, c) => s + c.projected_12mo, 0),
          top_customer: byClv[0] ? byClv[0].name : '—',
        },
      },
      churn: {
        stage_dist,
        comeback_targets,
        summary: {
          churn_rate: Math.round(churned / (customers.length || 1) * 100),
          at_risk: stage_dist['At Risk'],
          churned: stage_dist.Churned,
          active: stage_dist.Active,
        },
      },
      total_customers: customers.length,
    });
  });

  const mountPath = opts.mountPath || '/api/clv-churn';
  app.use(mountPath, router);
  console.log(`[clv-churn] mounted at ${mountPath} — CLV & churn detection`);

  return { router, db };
}

module.exports = { setupClvChurn };
