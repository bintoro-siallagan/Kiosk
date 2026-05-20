// server/feedback-backend.js
// Customer satisfaction feedback — rating bintang 1-5 + komentar.
// Dikumpulin dari popup POS setelah struk ditutup (source 'pos'); nanti
// bisa juga dari QR rating outlet (source 'qr').
//
// Endpoints di /api/feedback:
//   POST /         — simpan { order_ref, rating, comment, cashier, customer_phone, source }
//   GET  /         — list feedback terbaru (?limit=)
//   GET  /stats    — ringkasan: count, avg_rating, distribusi bintang (?from=)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS customer_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  cashier TEXT,
  customer_phone TEXT,
  source TEXT DEFAULT 'pos',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON customer_feedback(created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON customer_feedback(rating);
`;

function setupFeedback(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  // Simpan feedback
  router.post('/', (req, res) => {
    const { order_ref, rating, comment, cashier, customer_phone, source } = req.body || {};
    const r = parseInt(rating, 10);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'rating harus 1-5' });

    const info = db.prepare(`
      INSERT INTO customer_feedback (order_ref, rating, comment, cashier, customer_phone, source)
      VALUES (?,?,?,?,?,?)
    `).run(order_ref || null, r, (comment || '').trim() || null, cashier || null,
      customer_phone || null, source || 'pos');

    // Audit + alert kalau rating jelek
    try {
      if (typeof global.logPosEvent === 'function') global.logPosEvent({
        event_type: 'customer_feedback', event_subtype: source || 'pos',
        payload: { rating: r, order_ref, has_comment: !!(comment && comment.trim()) },
        order_ref: order_ref || null, actor: cashier || null,
        severity: r <= 2 ? 'warning' : 'info',
      });
    } catch {}

    res.json({ ok: true, id: info.lastInsertRowid });
  });

  // List terbaru
  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(db.prepare(`SELECT * FROM customer_feedback ORDER BY created_at DESC LIMIT ?`).all(limit));
  });

  // Ringkasan — buat dashboard / KPI
  router.get('/stats', (req, res) => {
    const from = Number(req.query.from || 0);
    const agg = db.prepare(`
      SELECT COUNT(*) count, COALESCE(AVG(rating), 0) avg_rating
      FROM customer_feedback WHERE created_at >= ?
    `).get(from);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of db.prepare(`SELECT rating, COUNT(*) c FROM customer_feedback WHERE created_at >= ? GROUP BY rating`).all(from)) {
      distribution[d.rating] = d.c;
    }
    res.json({
      count: agg.count,
      avg_rating: Math.round((agg.avg_rating || 0) * 100) / 100,
      distribution,
    });
  });

  // Per-kasir — buat KPI kasir (feedback jelek → KPI jelek).
  router.get('/by-cashier', (req, res) => {
    const from = Number(req.query.from || 0);
    res.json(db.prepare(`
      SELECT cashier,
        COUNT(*) count,
        COALESCE(AVG(rating), 0) avg_rating,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) bad_count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) good_count
      FROM customer_feedback
      WHERE created_at >= ? AND cashier IS NOT NULL AND cashier != ''
      GROUP BY cashier
      ORDER BY avg_rating ASC
    `).all(from).map(r => ({ ...r, avg_rating: Math.round(r.avg_rating * 100) / 100 })));
  });

  const mountPath = opts.mountPath || '/api/feedback';
  app.use(mountPath, router);
  console.log(`[feedback] mounted at ${mountPath} — customer satisfaction ratings`);

  return { router, db };
}

module.exports = { setupFeedback };
