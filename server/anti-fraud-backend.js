// server/anti-fraud-backend.js
// Anti-Fraud Engine — deteksi pola mencurigakan: abuse reward, fake
// transaction (void cepat), refund tinggi, unusual employee discount.
// Rule-based scan — fokus integritas, bukan menuduh.
//
//   GET /api/anti-fraud

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const nowSec = () => Math.floor(Date.now() / 1000);
const norm = (t) => (t > 1e12 ? Math.floor(t / 1000) : (t || 0)); // ms → detik
const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

function setupAntiFraud(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const now = nowSec();
    const wk = now - 7 * 86400;
    const alerts = [];
    const A = (severity, icon, category, title, detail) => alerts.push({ severity, icon, category, title, detail });

    // ── Rule 1 — Abuse reward (crew redeem berlebihan) ──
    const red = many(`SELECT staff_name, point_cost, redeemed_at FROM reward_redemptions WHERE redeemed_at > ?`, wk);
    const byStaff = {};
    for (const r of red) (byStaff[r.staff_name] = byStaff[r.staff_name] || []).push(r);
    for (const [name, list] of Object.entries(byStaff)) {
      if (list.length >= 3) {
        const pts = list.reduce((s, r) => s + r.point_cost, 0);
        A('warning', '🎁', 'Abuse Reward', `Redeem ${name} di luar kebiasaan`,
          `${name} redeem ${list.length} benefit dalam 7 hari (${pts} poin) — cek pola redemption.`);
      }
    }

    // ── Rules order ──
    const orders = many(`SELECT id, time, subtotal, promo_discount, cancelled_at, refunded_at, refunded_amount FROM orders`);
    let fastVoid = 0, refundCount = 0, refundTotal = 0;
    const bigDisc = [];
    for (const o of orders) {
      const created = norm(o.time);
      if (o.cancelled_at) {
        const gap = norm(o.cancelled_at) - created;
        if (gap >= 0 && gap <= 180) fastVoid++;
      }
      if (o.refunded_at && norm(o.refunded_at) > wk) { refundCount++; refundTotal += o.refunded_amount || 0; }
      const sub = o.subtotal || 0, disc = o.promo_discount || 0;
      if (sub > 0 && disc / sub > 0.35) bigDisc.push({ id: o.id, pct: Math.round(disc / sub * 100) });
    }

    // ── Rule 2 — Fake transaction (void <3 menit) ──
    if (fastVoid >= 3) {
      A('critical', '⚡', 'Fake Transaction', `${fastVoid} order di-void <3 menit`,
        'Transaksi dibatalkan sangat cepat setelah dibuat — indikasi order fiktif. Verifikasi kasir/outlet.');
    }
    // ── Rule 3 — Refund tinggi ──
    if (refundCount >= 5) {
      A('warning', '↩️', 'Refund Tinggi', `${refundCount} refund dalam 7 hari`,
        `Total refund ${fmtRp(refundTotal)} — cek keabsahan, kemungkinan abuse refund.`);
    }
    // ── Rule 4 — Unusual employee discount ──
    if (bigDisc.length) {
      A('warning', '🏷️', 'Unusual Discount', `${bigDisc.length} order diskon >35%`,
        `Diskon abnormal besar (contoh order ${bigDisc[0].id} −${bigDisc[0].pct}%) — cek otorisasi employee discount.`);
    }

    const sev = (s) => alerts.filter(a => a.severity === s).length;
    res.json({
      generated_at: now,
      alerts,
      summary: { total: alerts.length, critical: sev('critical'), warning: sev('warning'), info: sev('info') },
      healthy: alerts.length === 0,
      scanned: { redemptions_7d: red.length, orders: orders.length },
    });
  });

  const mountPath = opts.mountPath || '/api/anti-fraud';
  app.use(mountPath, router);
  console.log(`[anti-fraud] mounted at ${mountPath} — fraud detection engine`);

  return { router, db };
}

module.exports = { setupAntiFraud };
