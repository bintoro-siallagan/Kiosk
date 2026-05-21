// server/sales-stock-sync-backend.js
// Sales → Stock live hook — integrasi: tiap order POS/Kiosk baru,
// bahan baku resep otomatis dikonsumsi dari gudang (audit_warehouse).
//
//   global.consumeRecipeStock(order)  — dipanggil index.js saat order baru
//   GET  /api/sales-stock-sync        — log konsumsi + coverage + summary
//   POST /api/sales-stock-sync/simulate — dry-run (preview tanpa potong stok)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales_stock_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_ref TEXT, sku TEXT, item_name TEXT,
  qty_consumed REAL, unit TEXT, at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const r3 = (n) => Math.round(n * 1000) / 1000;

function setupSalesStockSync(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };

  // hitung konsumsi resep untuk daftar item order → [{sku,name,unit,qty}]
  const computeConsumption = (items) => {
    const out = [];
    for (const it of (items || [])) {
      const name = it.name || it.n || it.display_name;
      const qty = Number(it.qty || it.q || 1) || 1;
      if (!name) continue;
      const menu = one(`SELECT id FROM pos_menus WHERE name = ?`, name);
      if (!menu) continue; // item tak ter-mapping ke menu — lewati
      for (const r of many(`SELECT sku, qty FROM menu_recipes WHERE menu_id = ?`, menu.id)) {
        const wh = one(`SELECT name, unit FROM audit_warehouse WHERE id = ?`, r.sku);
        if (!wh) continue;
        out.push({ sku: r.sku, name: wh.name, unit: wh.unit, qty: r3(r.qty * qty) });
      }
    }
    return out;
  };

  // ── LIVE HOOK — dipanggil index.js setelah order baru tersimpan ──
  global.consumeRecipeStock = (order) => {
    try {
      const lines = computeConsumption(order && order.items);
      if (!lines.length) return;
      const upd = db.prepare(`UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = ? WHERE id = ?`);
      const log = db.prepare(`INSERT INTO sales_stock_log (order_ref, sku, item_name, qty_consumed, unit, at) VALUES (?,?,?,?,?,?)`);
      const N = nowSec();
      db.transaction(() => {
        for (const l of lines) { upd.run(l.qty, N, l.sku); log.run(String(order.id || '-'), l.sku, l.name, l.qty, l.unit, N); }
      })();
    } catch (e) { console.error('[sales-stock-sync] consume:', e.message); }
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const log = many(`SELECT * FROM sales_stock_log ORDER BY at DESC LIMIT 40`);
    const totalMenus = (one(`SELECT COUNT(*) c FROM pos_menus`) || { c: 0 }).c;
    const withRecipe = (one(`SELECT COUNT(DISTINCT menu_id) c FROM menu_recipes`) || { c: 0 }).c;
    const byIng = {};
    for (const l of many(`SELECT sku, item_name, unit, qty_consumed FROM sales_stock_log`)) {
      const k = l.sku; byIng[k] = byIng[k] || { sku: l.sku, name: l.item_name, unit: l.unit, total: 0 };
      byIng[k].total = r3(byIng[k].total + l.qty_consumed);
    }
    res.json({
      log,
      top_ingredients: Object.values(byIng).sort((a, b) => b.total - a.total).slice(0, 8),
      summary: {
        orders_synced: new Set(many(`SELECT order_ref FROM sales_stock_log`).map(r => r.order_ref)).size,
        consumption_lines: (one(`SELECT COUNT(*) c FROM sales_stock_log`) || { c: 0 }).c,
        recipe_coverage: `${withRecipe}/${totalMenus}`,
        coverage_pct: totalMenus ? Math.round(withRecipe / totalMenus * 100) : 0,
      },
    });
  });

  // dry-run — preview konsumsi tanpa potong stok
  router.post('/simulate', (req, res) => {
    const items = (req.body || {}).items || [];
    const lines = computeConsumption(items);
    res.json({ ok: true, consumption: lines, total_lines: lines.length });
  });

  const mountPath = opts.mountPath || '/api/sales-stock-sync';
  app.use(mountPath, router);
  console.log(`[sales-stock-sync] mounted at ${mountPath} — sales → stock live hook`);

  return { router, db };
}

module.exports = { setupSalesStockSync };
