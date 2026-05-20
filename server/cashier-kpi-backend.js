// server/cashier-kpi-backend.js
// KPI Kasir — gabungin performa transaksi (pos_payments) dengan
// penilaian customer (customer_feedback) per kasir.
//
// KPI score digerakin sama rating customer: feedback jelek → KPI jelek.
//
// Endpoint:
//   GET /api/cashier-kpi?from=&to=  — array per kasir, sorted by kpi_score

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function setupCashierKpi(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const router = express.Router();

  router.get('/', (req, res) => {
    const from = Number(req.query.from || Math.floor(new Date().setHours(0, 0, 0, 0) / 1000));
    const to = Number(req.query.to || Math.floor(Date.now() / 1000));

    // Transaksi + sales per kasir (pos_payments.actor)
    let sales = [];
    try {
      sales = db.prepare(`
        SELECT actor AS cashier,
          COUNT(DISTINCT order_ref) AS transactions,
          COALESCE(SUM(CASE WHEN status='completed' THEN amount_applied ELSE 0 END), 0) AS total_sales,
          SUM(CASE WHEN status='voided' THEN 1 ELSE 0 END) AS voided
        FROM pos_payments
        WHERE created_at BETWEEN ? AND ? AND actor IS NOT NULL AND actor != ''
        GROUP BY actor
      `).all(from, to);
    } catch (e) { /* pos_payments belum ada — soft fail */ }

    // Penilaian customer per kasir (customer_feedback.cashier)
    let fb = [];
    try {
      fb = db.prepare(`
        SELECT cashier,
          COUNT(*) AS feedback_count,
          COALESCE(AVG(rating), 0) AS avg_rating,
          SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS bad_count,
          SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) AS good_count
        FROM customer_feedback
        WHERE created_at BETWEEN ? AND ? AND cashier IS NOT NULL AND cashier != ''
        GROUP BY cashier
      `).all(from, to);
    } catch (e) { /* customer_feedback belum ada — soft fail */ }

    // Merge by nama kasir
    const map = {};
    const blank = (name) => ({
      cashier: name, transactions: 0, total_sales: 0, voided: 0,
      feedback_count: 0, avg_rating: 0, bad_count: 0, good_count: 0,
    });
    for (const s of sales) {
      map[s.cashier] = { ...blank(s.cashier), transactions: s.transactions, total_sales: s.total_sales, voided: s.voided };
    }
    for (const f of fb) {
      const m = map[f.cashier] || (map[f.cashier] = blank(f.cashier));
      m.feedback_count = f.feedback_count;
      m.avg_rating = Math.round(f.avg_rating * 100) / 100;
      m.bad_count = f.bad_count;
      m.good_count = f.good_count;
    }

    // KPI score (0-100) — digerakin rating customer; null kalau belum dinilai
    const cashiers = Object.values(map).map(m => ({
      ...m,
      kpi_score: m.feedback_count > 0 ? Math.round((m.avg_rating / 5) * 100) : null,
    }));
    cashiers.sort((a, b) => (b.kpi_score ?? -1) - (a.kpi_score ?? -1));

    const rated = cashiers.filter(c => c.kpi_score !== null);
    res.json({
      from, to,
      cashiers,
      summary: {
        total_cashiers: cashiers.length,
        rated_cashiers: rated.length,
        avg_kpi: rated.length ? Math.round(rated.reduce((s, c) => s + c.kpi_score, 0) / rated.length) : null,
        total_bad_reviews: cashiers.reduce((s, c) => s + c.bad_count, 0),
      },
    });
  });

  const mountPath = opts.mountPath || '/api/cashier-kpi';
  app.use(mountPath, router);
  console.log(`[cashier-kpi] mounted at ${mountPath} — performa + rating per kasir`);

  return { router, db };
}

module.exports = { setupCashierKpi };
