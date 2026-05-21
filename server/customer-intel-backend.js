// server/customer-intel-backend.js
// Customer Intelligence — RFM analysis, visit frequency & segmentasi.
// Fondasi marketing data: siapa champion, siapa at-risk, siapa dormant.
//
//   GET /api/customer-intel

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DAY = 86400000; // ms
const normMs = (t) => (t > 1e12 ? t : (t || 0) * 1000); // detik → ms kalau perlu

const rScore = (d) => (d <= 7 ? 5 : d <= 14 ? 4 : d <= 30 ? 3 : d <= 60 ? 2 : 1);
const fScore = (v) => (v >= 20 ? 5 : v >= 10 ? 4 : v >= 5 ? 3 : v >= 2 ? 2 : 1);
const mScore = (m) => (m >= 5e6 ? 5 : m >= 2e6 ? 4 : m >= 1e6 ? 3 : m >= 3e5 ? 2 : 1);

function segmentOf(r, f) {
  if (r >= 4 && f >= 4) return 'Champion';
  if (f >= 4) return 'Loyal';
  if (r <= 2 && f >= 3) return 'At Risk';
  if (r <= 2) return 'Dormant';
  if (r >= 4 && f <= 2) return 'New';
  if (r >= 3 && f >= 2) return 'Potential';
  return 'Need Attention';
}
const SEGMENT_META = {
  'Champion':       { icon: '👑', color: '#fbbf24', action: 'Reward & jaga — pelanggan paling bernilai.' },
  'Loyal':          { icon: '💚', color: '#10b981', action: 'Upsell & ajak jadi referral source.' },
  'Potential':      { icon: '🌱', color: '#3b82f6', action: 'Dorong naik kelas — promo bertingkat.' },
  'New':            { icon: '✨', color: '#22d3ee', action: 'Welcome journey & promo kunjungan ke-2.' },
  'At Risk':        { icon: '⚠️', color: '#f59e0b', action: 'Win-back campaign — sebelum hilang.' },
  'Dormant':        { icon: '😴', color: '#ef4444', action: 'Comeback promo agresif.' },
  'Need Attention': { icon: '👀', color: '#9ca3af', action: 'Pantau & nudge ringan.' },
};
const SEG_ORDER = ['Champion', 'Loyal', 'Potential', 'New', 'At Risk', 'Dormant', 'Need Attention'];

const maskPhone = (p) => {
  const s = String(p || '');
  return s.length >= 8 ? s.slice(0, 4) + '****' + s.slice(-3) : s;
};

function setupCustomerIntel(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const now = Date.now();
    const rows = many(`SELECT id, name, phone, visits, total_spend, last_visit, points, tags FROM customers WHERE visits > 0`);

    const customers = rows.map(c => {
      const recency_days = Math.max(0, Math.floor((now - normMs(c.last_visit)) / DAY));
      const r = rScore(recency_days), f = fScore(c.visits || 0), m = mScore(c.total_spend || 0);
      const segment = segmentOf(r, f);
      const visit_class = recency_days > 45 ? 'dormant'
        : (c.visits >= 8 ? 'loyal' : c.visits >= 2 ? 'repeat' : 'first-time');
      return {
        name: c.name || '—', phone: maskPhone(c.phone),
        recency_days, frequency: c.visits || 0, monetary: c.total_spend || 0,
        r, f, m, rfm: `${r}${f}${m}`, score: r + f + m,
        segment, visit_class, points: c.points || 0,
      };
    }).sort((a, b) => b.score - a.score || b.monetary - a.monetary);

    const segCount = {}, visitCount = { 'first-time': 0, repeat: 0, loyal: 0, dormant: 0 };
    for (const c of customers) {
      segCount[c.segment] = (segCount[c.segment] || 0) + 1;
      visitCount[c.visit_class]++;
    }
    const n = customers.length || 1;

    res.json({
      customers,
      segments: SEG_ORDER.filter(s => segCount[s]).map(s => ({
        name: s, count: segCount[s], ...SEGMENT_META[s],
      })),
      visit_frequency: visitCount,
      summary: {
        total: customers.length,
        champions: segCount['Champion'] || 0,
        at_risk: segCount['At Risk'] || 0,
        dormant: segCount['Dormant'] || 0,
        avg_recency: Math.round(customers.reduce((s, c) => s + c.recency_days, 0) / n),
        avg_frequency: Math.round(customers.reduce((s, c) => s + c.frequency, 0) / n),
        total_monetary: customers.reduce((s, c) => s + c.monetary, 0),
      },
    });
  });

  const mountPath = opts.mountPath || '/api/customer-intel';
  app.use(mountPath, router);
  console.log(`[customer-intel] mounted at ${mountPath} — RFM & customer segmentation`);

  return { router, db };
}

module.exports = { setupCustomerIntel };
