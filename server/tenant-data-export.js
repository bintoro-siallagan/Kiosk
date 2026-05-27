// server/tenant-data-export.js
// White-label P2C — GDPR-ready tenant data export.
// Customer/tenant can download their data: orders, customers, menu, sales summary.
// All scoped to req.companyScope so no cross-tenant leak.
//
// Routes (mounted at /api/companies/export):
//   GET /orders.csv      — all orders for tenant
//   GET /customers.csv   — all members for tenant
//   GET /menu.csv        — menu (from pos_menus)
//   GET /sales-summary.csv — daily aggregates last 90 days
//   GET /manifest.json   — list of available exports

const Database = require('better-sqlite3');
const path = require('path');
const express = require('express');

function _csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Escape quotes by doubling
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _csvRow(arr) {
  return arr.map(_csvCell).join(',') + '\n';
}

function _sendCSV(res, filename, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache');
  let out = _csvRow(header);
  for (const r of rows) out += _csvRow(r);
  res.send(out);
}

function setupTenantDataExport(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'), { readonly: true });
  db.pragma('journal_mode = WAL');

  const router = express.Router();

  // GET /manifest.json — list available exports + counts
  router.get('/manifest.json', (req, res) => {
    const sc = req.companyScope || {};
    const cid = sc.company_id;
    if (!cid) return res.status(400).json({ error: 'no company scope' });
    try {
      const counts = {
        orders: db.prepare(`SELECT COUNT(*) c FROM orders WHERE company_id = ?`).get(cid).c,
        customers: db.prepare(`SELECT COUNT(*) c FROM customers WHERE company_id = ?`).get(cid).c,
        menus: db.prepare(`SELECT COUNT(*) c FROM pos_menus WHERE company_id = ?`).get(cid).c,
      };
      res.json({
        company_id: cid,
        generated_at: new Date().toISOString(),
        exports: [
          { kind: 'orders',         url: '/api/companies/export/orders.csv',         count: counts.orders },
          { kind: 'customers',      url: '/api/companies/export/customers.csv',      count: counts.customers },
          { kind: 'menu',           url: '/api/companies/export/menu.csv',           count: counts.menus },
          { kind: 'sales_summary',  url: '/api/companies/export/sales-summary.csv',  count: 'last 90 days' },
        ],
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /orders.csv
  router.get('/orders.csv', (req, res) => {
    const sc = req.companyScope || {};
    const cid = sc.company_id;
    if (!cid) return res.status(400).send('no company scope');
    try {
      const rows = db.prepare(`SELECT id, time, type, status, pay, kasir, source, table_name AS "table",
                                      customerName, customerPhone, customerId,
                                      subtotal, tax, convenienceFee, serviceCharge, total,
                                      promoCode, promoDiscount, pointsRedeemed, pointsDiscount, cashReceived
                               FROM orders WHERE company_id = ? ORDER BY time DESC`).all(cid);
      const header = ['id', 'time_iso', 'type', 'status', 'pay', 'cashier', 'source', 'table',
                      'customer_name', 'customer_phone', 'customer_id',
                      'subtotal', 'tax', 'convenience_fee', 'service_charge', 'total',
                      'promo_code', 'promo_discount', 'points_redeemed', 'points_discount', 'cash_received'];
      const data = rows.map(r => [
        r.id, new Date(r.time).toISOString(), r.type, r.status, r.pay, r.kasir, r.source, r.table,
        r.customerName, r.customerPhone, r.customerId,
        r.subtotal, r.tax, r.convenienceFee, r.serviceCharge, r.total,
        r.promoCode, r.promoDiscount, r.pointsRedeemed, r.pointsDiscount, r.cashReceived,
      ]);
      _sendCSV(res, `orders-company${cid}-${Date.now()}.csv`, header, data);
    } catch (e) { res.status(500).send('error: ' + e.message); }
  });

  // GET /customers.csv
  router.get('/customers.csv', (req, res) => {
    const sc = req.companyScope || {};
    const cid = sc.company_id;
    if (!cid) return res.status(400).send('no company scope');
    try {
      const rows = db.prepare(`SELECT id, name, phone, email, tags, visits, points, created_at
                               FROM customers WHERE company_id = ? ORDER BY visits DESC`).all(cid);
      const header = ['id', 'name', 'phone', 'email', 'tags', 'visits', 'points', 'joined_at'];
      const data = rows.map(r => [r.id, r.name, r.phone, r.email, r.tags, r.visits, r.points,
                                  r.created_at ? new Date(r.created_at * 1000).toISOString() : '']);
      _sendCSV(res, `customers-company${cid}-${Date.now()}.csv`, header, data);
    } catch (e) { res.status(500).send('error: ' + e.message); }
  });

  // GET /menu.csv
  router.get('/menu.csv', (req, res) => {
    const sc = req.companyScope || {};
    const cid = sc.company_id;
    if (!cid) return res.status(400).send('no company scope');
    try {
      const rows = db.prepare(`SELECT id, category_id, emoji, name, description, price,
                                      free_extras, is_popular, is_available, image_url, badge_text
                               FROM pos_menus WHERE company_id = ? ORDER BY category_id, name`).all(cid);
      const header = ['id', 'category_id', 'emoji', 'name', 'description', 'price',
                      'free_extras', 'is_popular', 'is_available', 'image_url', 'badge_text'];
      const data = rows.map(r => [r.id, r.category_id, r.emoji, r.name, r.description, r.price,
                                  r.free_extras, r.is_popular, r.is_available, r.image_url, r.badge_text]);
      _sendCSV(res, `menu-company${cid}-${Date.now()}.csv`, header, data);
    } catch (e) { res.status(500).send('error: ' + e.message); }
  });

  // GET /sales-summary.csv — daily aggregates last 90 days
  router.get('/sales-summary.csv', (req, res) => {
    const sc = req.companyScope || {};
    const cid = sc.company_id;
    if (!cid) return res.status(400).send('no company scope');
    try {
      const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const rows = db.prepare(`
        SELECT
          date(time/1000, 'unixepoch', 'localtime') AS day,
          COUNT(*) AS order_count,
          COUNT(CASE WHEN status='completed' OR status='paid' THEN 1 END) AS completed_count,
          SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END) AS gross_revenue,
          SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
          AVG(CASE WHEN status!='cancelled' THEN total END) AS avg_bill
        FROM orders
        WHERE company_id = ? AND time >= ?
        GROUP BY day
        ORDER BY day DESC
      `).all(cid, since);
      const header = ['date', 'order_count', 'completed_count', 'gross_revenue', 'cancelled_count', 'avg_bill'];
      const data = rows.map(r => [r.day, r.order_count, r.completed_count,
                                  Math.round(r.gross_revenue || 0), r.cancelled_count,
                                  Math.round(r.avg_bill || 0)]);
      _sendCSV(res, `sales-summary-company${cid}-${Date.now()}.csv`, header, data);
    } catch (e) { res.status(500).send('error: ' + e.message); }
  });

  const mountPath = opts.mountPath || '/api/companies/export';
  app.use(mountPath, router);
  console.log(`[tenant-data-export] mounted at ${mountPath} — GDPR-ready CSV exports`);

  return { router };
}

module.exports = { setupTenantDataExport };
