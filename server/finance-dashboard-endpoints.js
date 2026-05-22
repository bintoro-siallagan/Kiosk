// server/finance-dashboard-endpoints.js
// Patch endpoints buat OwnerDashboard yang belum ada di Wave 2 finance-backend.
// File ini standalone — tinggal require & setup di server/index.js setelah setupFinance.
//
// Endpoint yang ditambah:
//   GET  /api/finance/revenue-trend?days=30   — daily revenue series buat sparkline + main chart
//   GET  /api/finance/by-channel?from=&to=    — revenue breakdown per channel (direct vs aggregator)
//
// Setup di server/index.js:
//   const { setupFinanceDashboard } = require('./finance-dashboard-endpoints');
//   setupFinanceDashboard(app, { dbPath: DB_PATH });

const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

function setupFinanceDashboard(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');

  // ============================================================
  // GET /api/finance/revenue-trend?days=30
  // Return: { points: [{ date: 'YYYY-MM-DD', revenue, orders }] }
  // ============================================================
  app.get('/api/finance/revenue-trend', (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const now = new Date();
    const points = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dayStart = Math.floor(d.getTime() / 1000);
      const dayEnd = dayStart + 86399;
      const dateStr = d.toISOString().slice(0, 10);

      // Try multiple table names buat kompatibilitas dengan apapun schema yang ada
      let revenue = 0, orders = 0;

      // Coba pos_payments dulu (Wave 1-3 schema)
      try {
        const r = db.prepare(`
          SELECT
            COALESCE(SUM(amount_applied), 0) AS rev,
            COUNT(DISTINCT order_ref) AS orders
          FROM pos_payments
          WHERE status = 'completed' AND created_at >= ? AND created_at <= ?
        `).get(dayStart, dayEnd);
        if (r) { revenue = r.rev || 0; orders = r.orders || 0; }
      } catch {}

      // Fallback: pos_events dengan event_type sale completion
      if (revenue === 0) {
        try {
          const r = db.prepare(`
            SELECT COUNT(DISTINCT order_ref) AS orders
            FROM pos_events
            WHERE event_type IN ('order_completed', 'pos_sale') AND created_at >= ? AND created_at <= ?
          `).get(dayStart, dayEnd);
          if (r) orders = r.orders || 0;
        } catch {}
      }

      points.push({ date: dateStr, revenue, orders });
    }

    res.json({ days, points });
  });

  // ============================================================
  // GET /api/finance/by-channel?from=&to=
  // Return: { channels: [{ channel, label, amount, count }] }
  // ============================================================
  app.get('/api/finance/by-channel', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const from = Number(req.query.from) || (now - 86400);
    const to = Number(req.query.to) || now;

    const channels = [];

    // Direct sales (dari pos_payments minus aggregator orders)
    let directRev = 0, directCount = 0;
    try {
      const allRev = db.prepare(`
        SELECT COALESCE(SUM(amount_applied), 0) AS rev, COUNT(DISTINCT order_ref) AS orders
        FROM pos_payments
        WHERE status = 'completed' AND created_at >= ? AND created_at <= ?
      `).get(from, to);
      directRev = allRev.rev || 0;
      directCount = allRev.orders || 0;
    } catch {}

    // Aggregator orders (kurangi dari direct kalau aggregator pakai pos_payments juga)
    let aggregatorTotal = { gross: 0, count: 0 };
    try {
      const agg = db.prepare(`
        SELECT provider_code, COUNT(*) AS count, COALESCE(SUM(gross_amount), 0) AS gross
        FROM aggregator_orders
        WHERE status = 'completed' AND received_at >= ? AND received_at <= ?
        GROUP BY provider_code
      `).all(from, to);
      for (const a of agg) {
        channels.push({
          channel: a.provider_code,
          label: a.provider_code.toUpperCase(),
          amount: a.gross || 0,
          count: a.count || 0
        });
        aggregatorTotal.gross += a.gross || 0;
        aggregatorTotal.count += a.count || 0;
      }
    } catch {}

    // Direct = total - aggregator (asumsi aggregator dicatat di pos_payments juga)
    // Kalau aggregator gak diintegrasi ke pos_payments, direct = pos_payments full
    const directAmount = Math.max(0, directRev - aggregatorTotal.gross);
    const directCnt = Math.max(0, directCount - aggregatorTotal.count);

    if (directAmount > 0 || directCnt > 0) {
      channels.unshift({
        channel: 'direct',
        label: 'Direct (Dine-In/Take-Away)',
        amount: directAmount,
        count: directCnt
      });
    }

    res.json({ channels, from, to });
  });

  // ============================================================
  // (Optional) GET /api/finance/dashboard fallback
  // Pastiin endpoint dasar ada — kalau Wave 2 udah ada, ini gak akan override karena Express ambil yang pertama match
  // ============================================================
  app.get('/api/finance/dashboard-fallback', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const from = Number(req.query.from) || (now - 86400);
    const to = Number(req.query.to) || now;

    let revenue = { gross: 0, net: 0 };
    let orderCount = 0;
    let topItems = [];
    let byTender = [];

    try {
      const rev = db.prepare(`
        SELECT COALESCE(SUM(amount_applied), 0) AS gross, COUNT(DISTINCT order_ref) AS orders
        FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ?
      `).get(from, to);
      revenue.gross = rev.gross || 0;
      revenue.net = rev.gross || 0;
      orderCount = rev.orders || 0;
    } catch {}

    try {
      byTender = db.prepare(`
        SELECT tender_type, COALESCE(SUM(amount_applied), 0) AS amount, COUNT(*) AS count
        FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ?
        GROUP BY tender_type ORDER BY amount DESC
      `).all(from, to);
    } catch {}

    res.json({
      revenue, order_count: orderCount,
      cogs: 0, cash_position: { total: 0 }, ap_outstanding: 0,
      top_items: topItems, by_tender: byTender
    });
  });

  console.log('[finance-dashboard-endpoints] mounted /api/finance/revenue-trend + /by-channel');
  return { db };
}

module.exports = { setupFinanceDashboard };
