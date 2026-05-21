// server/stock-transfer-backend.js
// Stock Transfer — transfer stok antar lokasi (gudang pusat ↔ outlet,
// outlet ↔ outlet). Workflow: request → kirim → terima.
//
//   GET  /api/stock-transfer             — daftar transfer + summary
//   POST /api/stock-transfer             — buat transfer baru
//   POST /api/stock-transfer/:id/send    — kirim (in transit)
//   POST /api/stock-transfer/:id/receive — terima di tujuan

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, transfer_no TEXT, from_location TEXT, to_location TEXT,
  items TEXT, status TEXT DEFAULT 'requested', requested_by TEXT, notes TEXT,
  sent_at INTEGER, received_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const LOCATIONS = ['Gudang Pusat', 'Paskal', 'Dago', 'Sudirman', 'BSD City', 'Kemang', 'Balikpapan'];
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupStockTransfer(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const genNo = () => `TRF-202605-${String(db.prepare(`SELECT COUNT(*) c FROM stock_transfers`).get().c + 1).padStart(3, '0')}`;

  if (db.prepare(`SELECT COUNT(*) c FROM stock_transfers`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO stock_transfers
      (transfer_no, from_location, to_location, items, status, requested_by, sent_at, received_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const N = nowSec(); let i = 1;
    // [from, to, items[[sku,name,qty,unit]], status, sentDaysAgo, recvDaysAgo]
    [
      ['Gudang Pusat', 'Paskal', [['RM01', 'Yogurt Base Plain', 20, 'kg'], ['PK01', 'Cup 12oz', 200, 'pcs']], 'in_transit', 1, null],
      ['Paskal', 'Dago', [['TP01', 'Granola', 3, 'kg']], 'requested', null, null],
      ['Gudang Pusat', 'Kemang', [['RM05', 'Buah Strawberry', 8, 'kg'], ['RM06', 'Buah Mango', 5, 'kg']], 'received', 4, 3],
      ['Sudirman', 'BSD City', [['PK02', 'Cup 16oz', 100, 'pcs']], 'requested', null, null],
      ['Gudang Pusat', 'Dago', [['RM03', 'Susu Skim UHT', 10, 'liter']], 'in_transit', 0, null],
    ].forEach(([f, t, items, st, sd, rd]) => ins.run(genNo(), f, t,
      JSON.stringify(items.map(([sku, name, qty, unit]) => ({ sku, name, qty, unit }))), st, 'Outlet Manager',
      sd != null ? N - sd * 86400 : null, rd != null ? N - rd * 86400 : null, N - (i++) * 86400));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const transfers = db.prepare(`SELECT * FROM stock_transfers ORDER BY created_at DESC`).all()
      .map(t => ({ ...t, items: J(t.items) }));
    res.json({
      transfers, locations: LOCATIONS,
      summary: {
        total: transfers.length,
        requested: transfers.filter(t => t.status === 'requested').length,
        in_transit: transfers.filter(t => t.status === 'in_transit').length,
        received: transfers.filter(t => t.status === 'received').length,
      },
    });
  });

  router.post('/', (req, res) => {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items.filter(i => i.sku && Number(i.qty) > 0) : [];
    if (!b.from_location || !b.to_location || b.from_location === b.to_location)
      return res.status(400).json({ error: 'lokasi asal & tujuan wajib & beda' });
    if (!items.length) return res.status(400).json({ error: 'minimal 1 item' });
    const r = db.prepare(`INSERT INTO stock_transfers (transfer_no, from_location, to_location, items, status, requested_by, notes)
      VALUES (?,?,?,?, 'requested', ?, ?)`).run(genNo(), b.from_location, b.to_location, JSON.stringify(items),
      (b.requested_by || 'Outlet Manager').trim(), (b.notes || '').trim());
    res.json({ ok: true, id: r.lastInsertRowid });
  });

  const step = (from, to, field) => (req, res) => {
    const t = db.prepare(`SELECT * FROM stock_transfers WHERE id = ?`).get(req.params.id);
    if (!t) return res.status(404).json({ error: 'transfer tidak ditemukan' });
    if (t.status !== from) return res.status(409).json({ error: `transfer tidak berstatus ${from}` });
    db.prepare(`UPDATE stock_transfers SET status=?, ${field}=? WHERE id=?`).run(to, nowSec(), t.id);
    res.json({ ok: true });
  };
  router.post('/:id/send', step('requested', 'in_transit', 'sent_at'));
  router.post('/:id/receive', step('in_transit', 'received', 'received_at'));

  const mountPath = opts.mountPath || '/api/stock-transfer';
  app.use(mountPath, router);
  console.log(`[stock-transfer] mounted at ${mountPath} — inter-location stock transfer`);

  return { router, db };
}

module.exports = { setupStockTransfer };
