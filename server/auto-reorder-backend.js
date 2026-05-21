// server/auto-reorder-backend.js
// Auto-Reorder Engine — integrasi Inventory → Procurement. Stok yang
// mencapai reorder point otomatis dibikinin Purchase Request, masuk
// ke chain procurement (PR → PO → GD → GR).
//
//   GET  /api/auto-reorder           — analisa reorder + PR ter-generate
//   POST /api/auto-reorder/generate  — generate PR untuk semua item low

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupAutoReorder(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const analyze = () => {
    const priceBySku = {};
    for (const p of many(`SELECT sku, price, supplier FROM price_list WHERE is_active = 1`)) priceBySku[p.sku] = p;
    return many(`SELECT id, name, unit, stock, reorder_point, reorder_qty, cost_per_unit FROM audit_warehouse ORDER BY (stock*1.0/NULLIF(reorder_point,0))`).map(w => {
      const pl = priceBySku[w.id] || {};
      const estPrice = pl.price || w.cost_per_unit || 0;
      const status = w.stock <= w.reorder_point ? 'reorder' : w.stock <= w.reorder_point * 1.4 ? 'watch' : 'ok';
      return {
        sku: w.id, name: w.name, unit: w.unit, stock: w.stock,
        reorder_point: w.reorder_point, reorder_qty: w.reorder_qty,
        supplier: pl.supplier || '—', est_price: estPrice, est_total: Math.round(w.reorder_qty * estPrice),
        status,
      };
    });
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const items = analyze();
    const needReorder = items.filter(i => i.status === 'reorder');
    const generated = many(`SELECT pr_number, status, total_estimated, created_at FROM purchase_requests
      WHERE requested_by = 'Auto-Reorder Engine' ORDER BY created_at DESC`).map(pr => ({
      ...pr, items: (db.prepare(`SELECT COUNT(*) c FROM pr_items pi JOIN purchase_requests p ON p.id = pi.pr_id WHERE p.pr_number = ?`).get(pr.pr_number) || { c: 0 }).c,
    }));
    res.json({
      items, generated_prs: generated,
      summary: {
        total_items: items.length,
        needs_reorder: needReorder.length,
        watch: items.filter(i => i.status === 'watch').length,
        est_reorder_cost: needReorder.reduce((s, i) => s + i.est_total, 0),
        prs_generated: generated.length,
      },
    });
  });

  router.post('/generate', (req, res) => {
    const low = analyze().filter(i => i.status === 'reorder');
    if (!low.length) return res.status(400).json({ error: 'tidak ada item yang mencapai reorder point' });
    const N = nowSec();
    const n = db.prepare(`SELECT COUNT(*) c FROM purchase_requests`).get().c;
    const prNumber = `PR-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(n + 1).padStart(4, '0')}`;
    const totalEst = low.reduce((s, i) => s + i.est_total, 0);
    let prId;
    db.transaction(() => {
      prId = db.prepare(`INSERT INTO purchase_requests
        (pr_number, requested_by, department, request_date, needed_date, priority, status, notes, total_estimated, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(prNumber, 'Auto-Reorder Engine', 'Warehouse', N, N + 3 * DAY,
        'high', 'submitted', `Auto-generated — ${low.length} item mencapai reorder point`, totalEst, N, N).lastInsertRowid;
      const pi = db.prepare(`INSERT INTO pr_items (pr_id, sku, item_name, quantity, unit, estimated_price, subtotal, notes) VALUES (?,?,?,?,?,?,?,?)`);
      for (const it of low) pi.run(prId, it.sku, it.name, it.reorder_qty, it.unit, it.est_price, it.est_total,
        `Stok ${it.stock} ${it.unit} ≤ reorder point ${it.reorder_point}`);
    })();
    res.json({ ok: true, pr_number: prNumber, items: low.length, total_estimated: totalEst });
  });

  const mountPath = opts.mountPath || '/api/auto-reorder';
  app.use(mountPath, router);
  console.log(`[auto-reorder] mounted at ${mountPath} — inventory → procurement auto-PR`);

  return { router, db };
}

module.exports = { setupAutoReorder };
