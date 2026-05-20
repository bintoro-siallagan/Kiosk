// server/cashier-kpi-backend.js
// KPI Kasir — gabungin performa transaksi (pos_payments) dengan
// penilaian customer (customer_feedback) per kasir.
//
// KPI score digerakin sama rating customer: feedback jelek → KPI jelek.
// Dipakai HRD buat review performa kasir + keputusan reward.
//
// Endpoints:
//   GET /api/cashier-kpi?from=&to=        — array per kasir (JSON)
//   GET /api/cashier-kpi/export.csv?from=&to=  — CSV buat HRD (Excel)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(headers, rows) {
  // BOM biar Excel baca UTF-8 (teks Indonesia) dengan benar
  return '﻿' + [headers, ...rows].map(r => r.map(csvField).join(',')).join('\r\n');
}

// Hitung KPI per kasir untuk rentang waktu tertentu
function computeKpi(db, from, to) {
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

  const cashiers = Object.values(map).map(m => ({
    ...m,
    kpi_score: m.feedback_count > 0 ? Math.round((m.avg_rating / 5) * 100) : null,
  }));
  cashiers.sort((a, b) => (b.kpi_score ?? -1) - (a.kpi_score ?? -1));

  const rated = cashiers.filter(c => c.kpi_score !== null);
  return {
    from, to, cashiers,
    summary: {
      total_cashiers: cashiers.length,
      rated_cashiers: rated.length,
      avg_kpi: rated.length ? Math.round(rated.reduce((s, c) => s + c.kpi_score, 0) / rated.length) : null,
      total_bad_reviews: cashiers.reduce((s, c) => s + c.bad_count, 0),
    },
  };
}

function setupCashierKpi(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const router = express.Router();
  const rangeOf = (req) => ({
    from: Number(req.query.from || Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)),
    to: Number(req.query.to || Math.floor(Date.now() / 1000)),
  });

  router.get('/', (req, res) => {
    const { from, to } = rangeOf(req);
    res.json(computeKpi(db, from, to));
  });

  // Export CSV — buat HRD: review performa + keputusan reward
  router.get('/export.csv', (req, res) => {
    const { from, to } = rangeOf(req);
    const { cashiers } = computeKpi(db, from, to);
    const headers = [
      'Kasir', 'KPI Score', 'Rating Rata-rata', 'Total Review',
      'Review Bagus (4-5*)', 'Review Jelek (1-2*)', 'Transaksi', 'Total Sales (Rp)', 'Void',
    ];
    const rows = cashiers.map(c => [
      c.cashier,
      c.kpi_score == null ? '-' : c.kpi_score,
      c.feedback_count > 0 ? c.avg_rating : '-',
      c.feedback_count, c.good_count, c.bad_count,
      c.transactions, Math.round(c.total_sales), c.voided,
    ]);
    const dr = new Date(from * 1000).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=kpi-kasir-${dr}.csv`);
    res.send(toCsv(headers, rows));
  });

  const mountPath = opts.mountPath || '/api/cashier-kpi';
  app.use(mountPath, router);
  console.log(`[cashier-kpi] mounted at ${mountPath} — performa + rating per kasir`);

  return { router, db };
}

module.exports = { setupCashierKpi };
