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
  // Migration: outlet_code column buat per-outlet filter (Bintoro: "bisa per outlet kapten?")
  try { db.exec(`ALTER TABLE customer_feedback ADD COLUMN outlet_code TEXT`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_outlet ON customer_feedback(outlet_code)`); } catch {}

  const router = express.Router();
  router.use(express.json());

  // Simpan feedback
  router.post('/', (req, res) => {
    const { order_ref, rating, comment, cashier, customer_phone, source } = req.body || {};
    const r = parseInt(rating, 10);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'rating harus 1-5' });

    // Auto-derive cashier kalau gak dikirim (mis. dari QR struk public —
    // customer gak tau siapa kasirnya). Lookup pos_payments.actor by order_ref,
    // fallback ke cinema_tickets.cashier_name (untuk struk cinema).
    let cashierResolved = cashier || null;
    if (!cashierResolved && order_ref) {
      try {
        const fromPay = db.prepare(`SELECT actor FROM pos_payments WHERE order_ref = ? AND actor IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(order_ref);
        if (fromPay?.actor) cashierResolved = fromPay.actor;
      } catch {}
      if (!cashierResolved) {
        try {
          const fromCinema = db.prepare(`SELECT cashier_name FROM cinema_tickets WHERE code = ? AND cashier_name IS NOT NULL LIMIT 1`).get(order_ref);
          if (fromCinema?.cashier_name) cashierResolved = fromCinema.cashier_name;
        } catch {}
      }
    }

    // Auto-derive outlet_code dari kasir name → admin_users.outlet_code.
    // Kalau kasir gak ditemukan / outlet kasir kosong, biarkan null (legacy data).
    let outletResolved = (req.body && req.body.outlet_code) || null;
    if (!outletResolved && cashierResolved) {
      try {
        const row = db.prepare(`SELECT outlet_code FROM admin_users WHERE name = ? AND outlet_code IS NOT NULL LIMIT 1`).get(cashierResolved);
        if (row?.outlet_code) outletResolved = row.outlet_code;
      } catch {}
    }

    const info = db.prepare(`
      INSERT INTO customer_feedback (order_ref, rating, comment, cashier, customer_phone, source, outlet_code)
      VALUES (?,?,?,?,?,?,?)
    `).run(order_ref || null, r, (comment || '').trim() || null, cashierResolved,
      customer_phone || null, source || 'pos', outletResolved);

    // Audit + alert kalau rating jelek
    try {
      if (typeof global.logPosEvent === 'function') global.logPosEvent({
        event_type: 'customer_feedback', event_subtype: source || 'pos',
        payload: { rating: r, order_ref, has_comment: !!(comment && comment.trim()), cashier: cashierResolved },
        order_ref: order_ref || null, actor: cashierResolved || null,
        severity: r <= 2 ? 'warning' : 'info',
      });
    } catch {}

    res.json({ ok: true, id: info.lastInsertRowid });
  });

  // Helper: build WHERE clause utk outlet filter — terima ?outlet=A atau ?outlets=A,B,C
  // Return { sql: " AND ...", params: [...] } siap di-inject ke query.
  // (Defensive: kalau column outlet_code belum ada, defer-fail di runtime → return no-op)
  function outletWhere(req) {
    const single = req.query.outlet;
    const multi  = req.query.outlets;
    if (single) return { sql: ` AND outlet_code = ?`, params: [String(single)] };
    if (multi) {
      const arr = String(multi).split(',').map(s => s.trim()).filter(Boolean);
      if (!arr.length) return { sql: '', params: [] };
      return { sql: ` AND outlet_code IN (${arr.map(() => '?').join(',')})`, params: arr };
    }
    return { sql: '', params: [] };
  }

  // List terbaru
  router.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const ow = outletWhere(req);
    res.json(db.prepare(`SELECT * FROM customer_feedback WHERE 1=1 ${ow.sql} ORDER BY created_at DESC LIMIT ?`).all(...ow.params, limit));
  });

  // Ringkasan — buat dashboard / KPI
  router.get('/stats', (req, res) => {
    const from = Number(req.query.from || 0);
    const ow = outletWhere(req);
    const agg = db.prepare(`
      SELECT COUNT(*) count, COALESCE(AVG(rating), 0) avg_rating
      FROM customer_feedback WHERE created_at >= ? ${ow.sql}
    `).get(from, ...ow.params);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of db.prepare(`SELECT rating, COUNT(*) c FROM customer_feedback WHERE created_at >= ? ${ow.sql} GROUP BY rating`).all(from, ...ow.params)) {
      distribution[d.rating] = d.c;
    }
    res.json({
      count: agg.count,
      avg_rating: Math.round((agg.avg_rating || 0) * 100) / 100,
      distribution,
    });
  });

  // Per-channel (pos / kiosk / qr) — lihat channel mana yang ratingnya jelek.
  router.get('/by-source', (req, res) => {
    const from = Number(req.query.from || 0);
    const to = Number(req.query.to || Math.floor(Date.now() / 1000));
    const ow = outletWhere(req);
    res.json(db.prepare(`
      SELECT source,
        COUNT(*) count,
        COALESCE(AVG(rating), 0) avg_rating,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) bad_count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) good_count
      FROM customer_feedback
      WHERE created_at >= ? AND created_at <= ? ${ow.sql}
      GROUP BY source
      ORDER BY avg_rating ASC
    `).all(from, to, ...ow.params).map(r => ({ ...r, avg_rating: Math.round(r.avg_rating * 100) / 100 })));
  });

  // Per-kasir — buat KPI kasir (feedback jelek → KPI jelek).
  router.get('/by-cashier', (req, res) => {
    const from = Number(req.query.from || 0);
    const ow = outletWhere(req);
    res.json(db.prepare(`
      SELECT cashier,
        COUNT(*) count,
        COALESCE(AVG(rating), 0) avg_rating,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) bad_count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) good_count
      FROM customer_feedback
      WHERE created_at >= ? AND cashier IS NOT NULL AND cashier != '' ${ow.sql}
      GROUP BY cashier
      ORDER BY avg_rating ASC
    `).all(from, ...ow.params).map(r => ({ ...r, avg_rating: Math.round(r.avg_rating * 100) / 100 })));
  });

  // Per-outlet — leaderboard outlet (yg butuh perhatian first)
  router.get('/by-outlet', (req, res) => {
    const from = Number(req.query.from || 0);
    res.json(db.prepare(`
      SELECT outlet_code,
        COUNT(*) count,
        COALESCE(AVG(rating), 0) avg_rating,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) bad_count,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) good_count
      FROM customer_feedback
      WHERE created_at >= ? AND outlet_code IS NOT NULL AND outlet_code != ''
      GROUP BY outlet_code
      ORDER BY avg_rating ASC
    `).all(from).map(r => ({ ...r, avg_rating: Math.round(r.avg_rating * 100) / 100 })));
  });

  // Export CSV — semua review buat HRD / arsip
  router.get('/export.csv', (req, res) => {
    const from = Number(req.query.from || 0);
    const to = Number(req.query.to || Math.floor(Date.now() / 1000));
    const ow = outletWhere(req);
    const rows = db.prepare(`
      SELECT created_at, source, cashier, rating, comment, order_ref, outlet_code
      FROM customer_feedback WHERE created_at BETWEEN ? AND ? ${ow.sql}
      ORDER BY created_at DESC
    `).all(from, to, ...ow.params);
    const cf = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const CH = { pos: 'POS', kiosk: 'Kiosk', qr: 'QR Order', 'qr-struk': 'QR Struk' };
    const header = ['Tanggal', 'Outlet', 'Channel', 'Kasir', 'Rating', 'Komentar', 'Order Ref'];
    const body = rows.map(r => [
      new Date((r.created_at || 0) * 1000).toLocaleString('id-ID'),
      r.outlet_code || '',
      CH[r.source] || r.source || '',
      r.cashier || '',
      r.rating,
      r.comment || '',
      r.order_ref || '',
    ].map(cf).join(','));
    const csv = '﻿' + [header.join(','), ...body].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=feedback-customer.csv`);
    res.send(csv);
  });

  const mountPath = opts.mountPath || '/api/feedback';
  app.use(mountPath, router);
  console.log(`[feedback] mounted at ${mountPath} — customer satisfaction ratings`);

  return { router, db };
}

module.exports = { setupFeedback };
