// server/feedback-segment-backend.js
// Customer Feedback + Behavioral Segmentation — satisfaction trend,
// rating, complaint, perbandingan channel/kasir + persona marketing.
//
//   GET /api/feedback-segment

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DAY = 86400;
const normSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : (t || 0));
const fmtDay = (sec) => new Date(sec * 1000).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

const PERSONA = {
  'VIP':          { icon: '👑', desc: 'Member premium — prioritas tertinggi.' },
  'Promo Hunter': { icon: '🎯', desc: 'Sering pakai promo — sensitif harga.' },
  'High Spender': { icon: '💎', desc: 'Spending besar — kandidat VIP.' },
  'Loyal':        { icon: '💚', desc: 'Sering datang — pelanggan setia.' },
  'New':          { icon: '✨', desc: 'Pelanggan baru — butuh welcome journey.' },
  'Inactive':     { icon: '😴', desc: 'Lama gak datang — perlu reaktivasi.' },
  'Regular':      { icon: '🙂', desc: 'Pelanggan reguler.' },
};
const PERSONA_ORDER = ['VIP', 'Promo Hunter', 'High Spender', 'Loyal', 'New', 'Inactive', 'Regular'];

function setupFeedbackSegment(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    // ── Feedback ──
    const fb = many(`SELECT rating, comment, cashier, source, created_at FROM customer_feedback`);
    const total = fb.length || 1;
    const avg = Math.round(fb.reduce((s, f) => s + (f.rating || 0), 0) / total * 10) / 10;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of fb) if (dist[f.rating] != null) dist[f.rating]++;

    const grp = (key) => {
      const m = {};
      for (const f of fb) {
        const k = f[key] || '—';
        (m[k] = m[k] || []).push(f.rating || 0);
      }
      return Object.entries(m).map(([k, arr]) => ({
        name: k, count: arr.length, avg: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10,
      })).sort((a, b) => b.count - a.count);
    };

    // trend harian (10 hari terakhir yang ada feedback)
    const byDay = {};
    for (const f of fb) {
      const d = Math.floor(normSec(f.created_at) / DAY);
      (byDay[d] = byDay[d] || []).push(f.rating || 0);
    }
    const trend = Object.keys(byDay).map(Number).sort((a, b) => a - b).slice(-10).map(d => {
      const arr = byDay[d];
      return { date: fmtDay(d * DAY), count: arr.length, avg: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 };
    });

    const complaints = fb.filter(f => (f.rating || 5) <= 2)
      .sort((a, b) => normSec(b.created_at) - normSec(a.created_at))
      .slice(0, 8)
      .map(f => ({ rating: f.rating, comment: f.comment || '(tanpa komentar)', source: f.source || '—', cashier: f.cashier || '—' }));

    // ── Behavioral segmentation ──
    const promoByPhone = {};
    for (const r of many(`SELECT customer_phone, COUNT(*) c FROM orders
      WHERE promo_code IS NOT NULL AND promo_code != '' AND customer_phone IS NOT NULL GROUP BY customer_phone`)) {
      promoByPhone[r.customer_phone] = r.c;
    }
    const customers = many(`SELECT phone, visits, total_spend, last_visit, tags FROM customers WHERE visits > 0`);
    const now = Date.now();
    const segCount = {};
    for (const c of customers) {
      const recencyDays = Math.floor((now - (c.last_visit > 1e12 ? c.last_visit : (c.last_visit || 0) * 1000)) / (DAY * 1000));
      const tags = String(c.tags || '');
      let persona;
      if (recencyDays > 60) persona = 'Inactive';
      else if (/vip/i.test(tags)) persona = 'VIP';
      else if ((promoByPhone[c.phone] || 0) >= 2) persona = 'Promo Hunter';
      else if ((c.total_spend || 0) >= 3000000) persona = 'High Spender';
      else if ((c.visits || 0) >= 10) persona = 'Loyal';
      else if ((c.visits || 0) <= 2) persona = 'New';
      else persona = 'Regular';
      segCount[persona] = (segCount[persona] || 0) + 1;
    }

    res.json({
      feedback: {
        avg_rating: avg, total: fb.length, distribution: dist,
        by_source: grp('source'), by_cashier: grp('cashier'),
        trend, complaints,
      },
      segments: PERSONA_ORDER.filter(p => segCount[p]).map(p => ({
        name: p, count: segCount[p], ...PERSONA[p],
      })),
      summary: {
        avg_rating: avg,
        satisfaction_label: avg >= 4.5 ? 'Sangat Puas' : avg >= 4 ? 'Puas' : avg >= 3 ? 'Cukup' : 'Perlu Perhatian',
        complaint_count: fb.filter(f => (f.rating || 5) <= 2).length,
        total_customers: customers.length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/feedback-segment';
  app.use(mountPath, router);
  console.log(`[feedback-segment] mounted at ${mountPath} — feedback & segmentation`);

  return { router, db };
}

module.exports = { setupFeedbackSegment };
