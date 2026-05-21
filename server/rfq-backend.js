// server/rfq-backend.js
// RFQ / Tender — banding penawaran multi-vendor sebelum PO. Minta
// quote ke beberapa vendor, bandingkan, pilih pemenang.
//
//   GET  /api/rfq               — daftar RFQ + quote + pemenang
//   POST /api/rfq               — buat RFQ
//   POST /api/rfq/:id/quote     — tambah penawaran vendor
//   POST /api/rfq/:id/award     — tetapkan pemenang { vendor }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rfq_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, rfq_no TEXT, item TEXT, qty REAL, unit TEXT,
  quotes TEXT DEFAULT '[]', status TEXT DEFAULT 'open', awarded_vendor TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupRfq(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  if (db.prepare(`SELECT COUNT(*) c FROM rfq_docs`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO rfq_docs (rfq_no, item, qty, unit, quotes, status, awarded_vendor) VALUES (?,?,?,?,?,?,?)`);
    // [no, item, qty, unit, quotes[[vendor,price,leadDays]], status, awarded]
    [
      ['RFQ-2026-001', 'Yogurt Base Plain', 500, 'kg',
        [['PT Dairy Nusantara', 32000, 3], ['UD Susu Murni', 30500, 5], ['CV Lacto Prima', 33000, 2]], 'awarded', 'UD Susu Murni'],
      ['RFQ-2026-002', 'Cup 16oz Custom Print', 20000, 'pcs',
        [['CV Kemasan Prima', 850, 7], ['PT Pack Indo', 920, 5], ['Toko Plastik Jaya', 790, 10]], 'open', null],
      ['RFQ-2026-003', 'Mesin Soft Serve', 3, 'unit',
        [['PT Mesin Pangan Tek', 48000000, 14]], 'open', null],
    ].forEach(([no, it, q, u, qt, st, aw]) =>
      ins.run(no, it, q, u, JSON.stringify(qt.map(([vendor, price, lead]) => ({ vendor, price, lead_days: lead }))), st, aw));
  }

  const shape = (r) => {
    const quotes = J(r.quotes).slice().sort((a, b) => a.price - b.price);
    return { ...r, quotes, best: quotes[0] || null, vendor_count: quotes.length };
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM rfq_docs ORDER BY created_at DESC`).all().map(shape);
    res.json({
      rfqs: rows,
      summary: {
        total: rows.length,
        open: rows.filter(r => r.status === 'open').length,
        awarded: rows.filter(r => r.status === 'awarded').length,
        total_quotes: rows.reduce((a, r) => a + r.vendor_count, 0),
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    if (!b.item || !String(b.item).trim()) return res.status(400).json({ error: 'item wajib' });
    const n = db.prepare(`SELECT COUNT(*) c FROM rfq_docs`).get().c;
    db.prepare(`INSERT INTO rfq_docs (rfq_no, item, qty, unit, quotes, status) VALUES (?,?,?,?,'[]','open')`)
      .run(`RFQ-2026-${String(n + 1).padStart(3, '0')}`, String(b.item).trim(), Number(b.qty) || 0, b.unit || 'pcs');
    res.json({ ok: true });
  });

  router.post('/:id/quote', (req, res) => {
    const r = db.prepare(`SELECT * FROM rfq_docs WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'RFQ tidak ditemukan' });
    if (r.status !== 'open') return res.status(409).json({ error: 'RFQ sudah ditutup' });
    const b = req.body || {};
    if (!b.vendor || !(Number(b.price) > 0)) return res.status(400).json({ error: 'vendor & harga wajib' });
    const quotes = J(r.quotes);
    quotes.push({ vendor: String(b.vendor).trim(), price: Number(b.price), lead_days: Number(b.lead_days) || 0 });
    db.prepare(`UPDATE rfq_docs SET quotes = ? WHERE id = ?`).run(JSON.stringify(quotes), r.id);
    res.json({ ok: true });
  });

  router.post('/:id/award', (req, res) => {
    const r = db.prepare(`SELECT * FROM rfq_docs WHERE id = ?`).get(req.params.id);
    if (!r) return res.status(404).json({ error: 'RFQ tidak ditemukan' });
    const quotes = J(r.quotes);
    const vendor = (req.body || {}).vendor || (quotes.slice().sort((a, b) => a.price - b.price)[0] || {}).vendor;
    if (!vendor) return res.status(400).json({ error: 'belum ada penawaran' });
    db.prepare(`UPDATE rfq_docs SET status = 'awarded', awarded_vendor = ? WHERE id = ?`).run(vendor, r.id);
    res.json({ ok: true, awarded_vendor: vendor });
  });

  const mountPath = opts.mountPath || '/api/rfq';
  app.use(mountPath, router);
  console.log(`[rfq] mounted at ${mountPath} — RFQ / tender / vendor bidding`);

  return { router, db };
}

module.exports = { setupRfq };
