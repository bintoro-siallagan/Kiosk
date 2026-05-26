// server/stock-list-backend.js
// Stock List — daftar lengkap stok gudang + valuasi inventory, status
// per item & breakdown per kategori. Read-only report.
//
//   GET /api/stock-list   — semua item stok + valuasi + summary

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function setupStockList(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const statusOf = (w) => {
    if (w.stock <= 0) return { status: 'out', label: 'HABIS', color: '#ef4444' };
    if (w.stock <= (w.reorder_point || w.min_stock || 0)) return { status: 'low', label: 'MENIPIS', color: '#f59e0b' };
    if (w.max_stock && w.stock >= w.max_stock) return { status: 'over', label: 'OVERSTOCK', color: '#a855f7' };
    return { status: 'ok', label: 'AMAN', color: '#10b981' };
  };

  const router = express.Router();

  router.get('/', (req, res) => {
    // Multi-tenant: filter by company_id from req.companyScope
    const sc = req.companyScope || {};
    const whereSql = sc.is_super_admin ? '' : 'WHERE company_id = ? OR company_id IS NULL';
    const args = sc.is_super_admin ? [] : [sc.company_id];
    const rows = whereSql
      ? db.prepare(`SELECT id, name, unit, stock, min_stock, max_stock, daily_use, cost_per_unit, category, reorder_point, company_id FROM audit_warehouse ${whereSql} ORDER BY category, id`).all(...args)
      : many(`SELECT id, name, unit, stock, min_stock, max_stock, daily_use, cost_per_unit, category, reorder_point, company_id FROM audit_warehouse ORDER BY category, id`);
    const items = rows.map(w => {
      const st = statusOf(w);
      return {
        sku: w.id, name: w.name, unit: w.unit, category: w.category || 'Lainnya',
        stock: w.stock, min_stock: w.min_stock, reorder_point: w.reorder_point,
        cost_per_unit: w.cost_per_unit || 0, stock_value: Math.round((w.stock || 0) * (w.cost_per_unit || 0)),
        days_left: w.daily_use > 0 ? Math.round(w.stock / w.daily_use * 10) / 10 : null,
        company_id: w.company_id, // expose untuk scopeFilter middleware
        ...st,
      };
    });
    const catMap = {};
    for (const it of items) {
      const c = catMap[it.category] = catMap[it.category] || { category: it.category, count: 0, value: 0 };
      c.count++; c.value += it.stock_value;
    }
    res.json({
      items,
      categories: Object.values(catMap).sort((a, b) => b.value - a.value),
      summary: {
        total_items: items.length,
        total_value: items.reduce((s, i) => s + i.stock_value, 0),
        out: items.filter(i => i.status === 'out').length,
        low: items.filter(i => i.status === 'low').length,
        over: items.filter(i => i.status === 'over').length,
        healthy: items.filter(i => i.status === 'ok').length,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/stock-list';
  app.use(mountPath, router);
  console.log(`[stock-list] mounted at ${mountPath} — warehouse stock list & valuation`);

  return { router, db };
}

module.exports = { setupStockList };
