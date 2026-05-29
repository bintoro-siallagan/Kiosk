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

// Hitung upsell rate per kasir — orders yg ada minimal 1 item ber-flag is_upsell.
// Dipakai utk KPI: kasir yg sungguh-sungguh nawarin upsell akan terlihat jujur.
function computeUpsellByActor(db, from, to) {
  // Set item IDs yg ditandai upsell oleh admin
  let upsellIds = new Set();
  try {
    const rows = db.prepare(`SELECT id FROM pos_menus WHERE is_upsell = 1`).all();
    upsellIds = new Set(rows.map(r => String(r.id)));
  } catch { return new Map(); }
  if (!upsellIds.size) return new Map();

  // Orders dgn kasir + items JSON.
  // Prefer orders.kasir kalau ada; fallback ke pos_payments.actor join.
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT o.id, o.kasir, o.items
      FROM orders o
      WHERE o.time BETWEEN ? AND ?
        AND o.kasir IS NOT NULL AND o.kasir != ''
        AND (o.status IS NULL OR o.status != 'cancelled')
    `).all(from * 1000, to * 1000);
  } catch {}

  // Kalau gak ada orders.kasir (DB lama / migration belum jalan), gabung via pos_payments
  if (!rows.length) {
    try {
      rows = db.prepare(`
        SELECT o.id, pp.actor AS kasir, o.items
        FROM pos_payments pp
        LEFT JOIN orders o ON o.id = pp.order_ref
        WHERE pp.created_at BETWEEN ? AND ?
          AND pp.status = 'completed'
          AND pp.actor IS NOT NULL AND pp.actor != ''
          AND o.items IS NOT NULL
      `).all(from, to);
    } catch {}
  }

  const byCashier = new Map();
  for (const r of rows) {
    const stat = byCashier.get(r.kasir) || { total: 0, withUpsell: 0 };
    stat.total++;
    try {
      const items = JSON.parse(r.items || '[]');
      if (Array.isArray(items) && items.some(it => upsellIds.has(String(it.id)))) {
        stat.withUpsell++;
      }
    } catch {}
    byCashier.set(r.kasir, stat);
  }
  return byCashier;
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

  // Upsell rate per kasir — bisa empty kalau belum ada item ber-flag is_upsell
  const upsellMap = computeUpsellByActor(db, from, to);

  const map = {};
  const blank = (name) => ({
    cashier: name, transactions: 0, total_sales: 0, voided: 0,
    feedback_count: 0, avg_rating: 0, bad_count: 0, good_count: 0,
    upsell_orders: 0, upsell_total: 0, upsell_rate: null,
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
  for (const [cashier, s] of upsellMap) {
    const m = map[cashier] || (map[cashier] = blank(cashier));
    m.upsell_orders = s.withUpsell;
    m.upsell_total = s.total;
    m.upsell_rate = s.total > 0 ? Math.round((s.withUpsell / s.total) * 100) : null;
  }

  // KPI score — weighted blend, supaya bukan hanya rating-driven.
  // Bobot disesuaikan untuk reflect prioritas operasional:
  //   45% customer rating (cermin pengalaman utama)
  //   30% sales achievement vs target (effort + result)
  //   15% upsell rate (effort nawarin)
  //   10% void inverse (akurasi + kepatuhan)
  // Item yg belum punya data → fallback ke rating-only (legacy compatibility).
  function scoreOf(m, dailyTarget) {
    const ratingScore = m.feedback_count > 0 ? (m.avg_rating / 5) * 100 : null;
    const salesScore = dailyTarget && dailyTarget > 0
      ? Math.min(100, Math.round((m.total_sales / dailyTarget) * 100))
      : null;
    const upsellScore = m.upsell_rate != null ? m.upsell_rate : null;
    const voidScore = m.transactions > 0
      ? Math.max(0, 100 - Math.round((m.voided / m.transactions) * 100))
      : null;

    // Kalau rating gak ada, gunakan legacy null (preserve old behavior).
    if (ratingScore == null && salesScore == null && upsellScore == null) return null;

    const dims = [
      { val: ratingScore, weight: 0.45 },
      { val: salesScore,  weight: 0.30 },
      { val: upsellScore, weight: 0.15 },
      { val: voidScore,   weight: 0.10 },
    ].filter(d => d.val != null);
    const totalWeight = dims.reduce((s, d) => s + d.weight, 0);
    if (totalWeight === 0) return null;
    const weighted = dims.reduce((s, d) => s + d.val * d.weight, 0) / totalWeight;
    return Math.round(weighted);
  }

  // Daily target — dipake utk salesScore. Bisa null kalau belum di-set.
  let dailyTarget = null;
  try {
    const ds = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const t = db.prepare(`SELECT target FROM checklist_submissions WHERE type='opening' AND target IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 1`).get(ds);
    dailyTarget = t?.target || null;
  } catch {}

  const cashiers = Object.values(map).map(m => ({
    ...m,
    kpi_score: scoreOf(m, dailyTarget),
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
      avg_upsell_rate: (() => {
        const u = cashiers.filter(c => c.upsell_rate != null);
        return u.length ? Math.round(u.reduce((s, c) => s + c.upsell_rate, 0) / u.length) : null;
      })(),
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

  // ── MyKPI — cermin jujur per kasir ──
  // Kasir yg sedang login bisa lihat performa diri sendiri: hari ini, minggu ini,
  // dan delta vs minggu lalu. Bahasa growth ("📈 +12% upsell vs minggu lalu"),
  // bukan punishment. Filosofi: yang baik makin baik, yang kurang baik akan jadi baik.
  router.get('/me', (req, res) => {
    const cashierName = (global.getSessionUserName && global.getSessionUserName(req)) || null;
    if (!cashierName) return res.status(401).json({ error: 'session required — login dulu' });

    const now = Math.floor(Date.now() / 1000);
    const dayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    // Awal minggu = Senin pagi (locale Indonesia). Day 0 = Minggu → konversi.
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
    const weekStartMs = d.getTime() - (dayOfWeek - 1) * 86400 * 1000;
    const weekStart = Math.floor(weekStartMs / 1000);
    const lastWeekStart = weekStart - 7 * 86400;
    const lastWeekEnd = weekStart;

    const pick = (resObj) => resObj.cashiers.find(c => c.cashier === cashierName) || null;
    const todayMe    = pick(computeKpi(db, dayStart, now));
    const thisWeekMe = pick(computeKpi(db, weekStart, now));
    const lastWeekMe = pick(computeKpi(db, lastWeekStart, lastWeekEnd));

    // Growth delta — tone untuk UI: up / down / flat / unknown
    function delta(curr, prev) {
      const c = curr == null ? null : Number(curr);
      const p = prev == null ? null : Number(prev);
      if (c == null && p == null) return null;
      if (p == null || p === 0) {
        if (c == null) return null;
        return { diff: c, pct: null, tone: c > 0 ? 'up' : 'flat' };
      }
      if (c == null) return { diff: -p, pct: -100, tone: 'down' };
      const diff = c - p;
      const pct = Math.round((diff / Math.abs(p)) * 100);
      return { diff: Math.round(diff * 100) / 100, pct, tone: diff > 0.001 ? 'up' : diff < -0.001 ? 'down' : 'flat' };
    }

    const deltas = (thisWeekMe || lastWeekMe) ? {
      kpi_score:   delta(thisWeekMe?.kpi_score,   lastWeekMe?.kpi_score),
      total_sales: delta(thisWeekMe?.total_sales, lastWeekMe?.total_sales),
      avg_rating:  delta(thisWeekMe?.avg_rating,  lastWeekMe?.avg_rating),
      upsell_rate: delta(thisWeekMe?.upsell_rate, lastWeekMe?.upsell_rate),
      transactions: delta(thisWeekMe?.transactions, lastWeekMe?.transactions),
    } : null;

    // Daily target — konteks utk hitung sales achievement hari ini
    let daily_target = null;
    try {
      const t = db.prepare(`SELECT target FROM checklist_submissions WHERE type='opening' AND target IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 1`).get(dayStart);
      daily_target = t?.target || null;
    } catch {}

    res.json({
      cashier: cashierName,
      today: todayMe,
      this_week: thisWeekMe,
      last_week: lastWeekMe,
      deltas,
      daily_target,
      achievement_pct: daily_target && todayMe ? Math.round((todayMe.total_sales / daily_target) * 100) : null,
      generated_at: now,
    });
  });

  // ── Morning Recognition — pengakuan yang lahir dari fakta kemarin ──
  // Saat kasir buka shift pagi-pagi, panggil ini. Kalau ada pencapaian
  // kemarin (Top Sales, Top Upsell, Perfect Rating, dll), POS tampilkan
  // celebration. Tidak manipulatif — hanya cermin yang merayakan.
  router.get('/me/recognition', (req, res) => {
    const cashierName = (global.getSessionUserName && global.getSessionUserName(req)) || null;
    if (!cashierName) return res.status(401).json({ error: 'session required' });

    const d = new Date(); d.setHours(0, 0, 0, 0);
    const yEnd = Math.floor(d.getTime() / 1000);
    const yStart = yEnd - 86400;

    const result = computeKpi(db, yStart, yEnd);
    const all = result.cashiers || [];
    const me = all.find(c => c.cashier === cashierName);

    if (!me) {
      return res.json({ cashier: cashierName, badges: [], message: null, yesterday_kpi: null });
    }

    const badges = [];
    const topSales = [...all].filter(x => x.transactions > 0).sort((a, b) => b.total_sales - a.total_sales)[0];
    if (topSales?.cashier === cashierName && me.total_sales > 0) {
      badges.push({ id: 'top-sales', icon: '🏆', label: 'Top Sales' });
    }
    const upsellPool = all.filter(x => x.upsell_rate != null && x.upsell_total >= 5);
    const topUpsell = upsellPool.sort((a, b) => b.upsell_rate - a.upsell_rate)[0];
    if (topUpsell?.cashier === cashierName && me.upsell_rate >= 50) {
      badges.push({ id: 'top-upsell', icon: '📈', label: 'Top Upsell' });
    }
    if (me.feedback_count >= 3 && me.avg_rating >= 4.8) {
      badges.push({ id: 'perfect-rating', icon: '⭐', label: 'Perfect Rating' });
    }
    if (me.feedback_count >= 5 && me.bad_count === 0) {
      badges.push({ id: 'zero-complaint', icon: '💎', label: 'Zero Complaint' });
    }
    if (topSales?.cashier === cashierName && me.kpi_score != null && me.kpi_score >= 85) {
      badges.push({ id: 'champion', icon: '👑', label: 'Champion' });
    }

    let message = null;
    if (badges.length >= 3) message = 'Kemarin Anda luar biasa. Hari ini, tetap dengan sungguh-sungguh.';
    else if (badges.length > 0) message = `Kemarin Anda meraih ${badges.length} pengakuan. Lanjutkan ritmenya hari ini.`;

    res.json({
      cashier: cashierName,
      badges,
      message,
      yesterday_kpi: me.kpi_score,
    });
  });

  router.get('/', (req, res) => {
    const { from, to } = rangeOf(req);
    const result = computeKpi(db, from, to);
    // Target hari ini (dari opening checklist) vs actual sales hari ini
    const ds = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    let target = null, actual = 0;
    try {
      const t = db.prepare(`SELECT target FROM checklist_submissions WHERE type='opening' AND target IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 1`).get(ds);
      target = t?.target || null;
    } catch (e) { /* checklist belum ada */ }
    try {
      actual = db.prepare(`SELECT COALESCE(SUM(amount_applied), 0) s FROM pos_payments WHERE status='completed' AND created_at >= ?`).get(ds).s;
    } catch (e) { /* pos_payments belum ada */ }
    result.daily_target = { target, actual, achievement_pct: target ? Math.round((actual / target) * 100) : null };
    res.json(result);
  });

  // Export CSV — buat HRD: review performa + keputusan reward
  router.get('/export.csv', (req, res) => {
    const { from, to } = rangeOf(req);
    const { cashiers } = computeKpi(db, from, to);
    const headers = [
      'Kasir', 'KPI Score', 'Rating Rata-rata', 'Total Review',
      'Review Bagus (4-5*)', 'Review Jelek (1-2*)',
      'Transaksi', 'Total Sales (Rp)', 'Void',
      'Upsell Rate (%)', 'Upsell Orders', 'Total Orders Upsell',
    ];
    const rows = cashiers.map(c => [
      c.cashier,
      c.kpi_score == null ? '-' : c.kpi_score,
      c.feedback_count > 0 ? c.avg_rating : '-',
      c.feedback_count, c.good_count, c.bad_count,
      c.transactions, Math.round(c.total_sales), c.voided,
      c.upsell_rate == null ? '-' : c.upsell_rate,
      c.upsell_orders, c.upsell_total,
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
