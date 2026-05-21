// server/goods-received-backend.js
// Good Received (GR) — outlet konfirmasi terima barang dari Good
// Delivery. Konfirmasi → stok nambah, finance tarik GR ke invoice.
//
//   GET  /api/goods-received             — daftar GR (pending + received)
//   POST /api/goods-received/:id/confirm — konfirmasi terima { received_by, items? }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS goods_received (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gr_number TEXT, gd_ref TEXT, po_ref TEXT, outlet TEXT,
  items TEXT, status TEXT DEFAULT 'pending', has_discrepancy INTEGER DEFAULT 0,
  received_by TEXT, received_at INTEGER, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const J = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function setupGoodsReceived(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Seed GR demo (sekali)
  if (db.prepare(`SELECT COUNT(*) c FROM goods_received`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO goods_received
      (gr_number, gd_ref, po_ref, outlet, items, status, has_discrepancy, received_by, received_at, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const N = nowSec();
    // [gr, gd, po, outlet, items[[sku,name,qtyOrder,qtyRecv,unit]], status, disc, by, recvDaysAgo, createdDaysAgo]
    const seed = [
      ['GR-2026-001', 'GD-2026-014', 'PO-2026-008', 'Paskal',
        [['RM01', 'Yogurt Base Plain', 20, null, 'kg'], ['PK01', 'Cup 12oz', 500, null, 'pcs'], ['TP01', 'Granola', 5, null, 'kg']], 'pending', 0, null, null, 1],
      ['GR-2026-002', 'GD-2026-015', 'PO-2026-009', 'Sudirman',
        [['RM05', 'Buah Strawberry', 10, null, 'kg'], ['RM06', 'Buah Mango', 10, null, 'kg']], 'pending', 0, null, null, 0],
      ['GR-2026-003', 'GD-2026-016', 'PO-2026-010', 'BSD City',
        [['PK02', 'Cup 16oz', 300, null, 'pcs'], ['PK03', 'Lid Dome', 300, null, 'pcs'], ['PK04', 'Sendok Froyo', 500, null, 'pcs']], 'pending', 0, null, null, 0],
      ['GR-2026-004', 'GD-2026-011', 'PO-2026-006', 'Paskal',
        [['RM02', 'Yogurt Base Charcoal', 15, 15, 'kg'], ['RM03', 'Susu Skim UHT', 20, 20, 'liter']], 'received', 0, 'Outlet Manager', N - 3 * 86400, 4],
      ['GR-2026-005', 'GD-2026-012', 'PO-2026-007', 'Kemang',
        [['RM07', 'Matcha Powder', 3, 2.5, 'kg']], 'received', 1, 'Supervisor', N - 6 * 86400, 7],
    ];
    for (const [gr, gd, po, ol, items, st, disc, by, rcv, cr] of seed) {
      ins.run(gr, gd, po, ol, JSON.stringify(items.map(([sku, name, qo, qr, unit]) =>
        ({ sku, name, qty_ordered: qo, qty_received: qr, unit }))), st, disc, by, rcv, N - cr * 86400);
    }
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM goods_received ORDER BY created_at DESC`).all()
      .map(r => ({ ...r, items: J(r.items), has_discrepancy: !!r.has_discrepancy }));
    res.json({
      pending: rows.filter(r => r.status === 'pending'),
      received: rows.filter(r => r.status === 'received'),
      summary: {
        pending: rows.filter(r => r.status === 'pending').length,
        received: rows.filter(r => r.status === 'received').length,
        discrepancy: rows.filter(r => r.has_discrepancy).length,
        items_received: rows.filter(r => r.status === 'received')
          .reduce((s, r) => s + r.items.reduce((a, i) => a + (i.qty_received || 0), 0), 0),
      },
    });
  });

  router.post('/:id/confirm', (req, res) => {
    const gr = db.prepare(`SELECT * FROM goods_received WHERE id = ?`).get(req.params.id);
    if (!gr) return res.status(404).json({ error: 'GR tidak ditemukan' });
    if (gr.status !== 'pending') return res.status(409).json({ error: 'GR sudah dikonfirmasi' });
    const items = J(gr.items);
    const override = (req.body || {}).items || {}; // { sku: qty_received }
    let discrepancy = false;

    const tx = db.transaction(() => {
      const post = db.prepare(`UPDATE audit_warehouse SET stock = stock + ?, last_restock = ? WHERE id = ?`);
      for (const it of items) {
        const qr = override[it.sku] != null ? Number(override[it.sku]) : it.qty_ordered;
        it.qty_received = qr;
        if (qr !== it.qty_ordered) discrepancy = true;
        try { post.run(qr, nowSec(), it.sku); } catch { /* sku bukan stock item — skip */ }
      }
      db.prepare(`UPDATE goods_received SET items=?, status='received', has_discrepancy=?, received_by=?, received_at=? WHERE id=?`)
        .run(JSON.stringify(items), discrepancy ? 1 : 0, (req.body || {}).received_by || 'Outlet Manager', nowSec(), gr.id);
    });
    tx();
    res.json({ ok: true, has_discrepancy: discrepancy, items_posted: items.length });
  });

  const mountPath = opts.mountPath || '/api/goods-received';
  app.use(mountPath, router);
  console.log(`[goods-received] mounted at ${mountPath} — GR + stock posting`);

  return { router, db };
}

module.exports = { setupGoodsReceived };
