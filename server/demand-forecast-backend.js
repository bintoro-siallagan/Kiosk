// server/demand-forecast-backend.js
// Demand Forecast — proyeksi permintaan penjualan untuk nyetir
// procurement & production planning.
//
//   GET  /api/demand-forecast            — forecast per produk + summary
//   POST /api/demand-forecast/regenerate — regenerate forecast

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS demand_forecast (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_name TEXT, category TEXT,
  avg_daily REAL, trend_pct REAL, forecast_7d INTEGER, confidence INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const nowSec = () => Math.floor(Date.now() / 1000);
const SEED = [
  ['Original Froyo', 'Frozen Yogurt', 42, 8, 88], ['Chocolate Froyo', 'Frozen Yogurt', 38, 12, 85],
  ['Mango Smoothie', 'Beverage', 28, -5, 82], ['Matcha Froyo', 'Frozen Yogurt', 22, 18, 79],
  ['Strawberry Smoothie', 'Beverage', 25, 3, 84], ['Cinema Combo', 'Signature', 15, 25, 76],
  ['Granola Topping', 'Topping', 55, 6, 90], ['Mixed Berry', 'Frozen Yogurt', 18, -8, 80],
];
const actionOf = (trend) => trend > 15 ? 'Tingkatkan produksi' : trend < -5 ? 'Kurangi stok / promo' : 'Pertahankan level';

function setupDemandForecast(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const buildRow = ([name, cat, avg, trend, conf], jitter = 0) => {
    const a = Math.round((avg * (1 + jitter)) * 10) / 10;
    const t = Math.round((trend + jitter * 40) * 10) / 10;
    return [name, cat, a, t, Math.round(a * 7 * (1 + t / 100)), conf];
  };
  if (db.prepare(`SELECT COUNT(*) c FROM demand_forecast`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO demand_forecast (product_name, category, avg_daily, trend_pct, forecast_7d, confidence) VALUES (?,?,?,?,?,?)`);
    SEED.forEach(s => ins.run(...buildRow(s)));
  }

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const rows = db.prepare(`SELECT * FROM demand_forecast ORDER BY forecast_7d DESC`).all()
      .map(r => ({ ...r, recommended_action: actionOf(r.trend_pct) }));
    res.json({
      forecasts: rows,
      summary: {
        total_demand_7d: rows.reduce((s, r) => s + r.forecast_7d, 0),
        growing: rows.filter(r => r.trend_pct > 0).length,
        declining: rows.filter(r => r.trend_pct < 0).length,
        avg_confidence: rows.length ? Math.round(rows.reduce((s, r) => s + r.confidence, 0) / rows.length) : 0,
        top_growth: rows.slice().sort((a, b) => b.trend_pct - a.trend_pct)[0] || null,
      },
    });
  });

  router.post('/regenerate', (req, res) => {
    db.prepare(`DELETE FROM demand_forecast`).run();
    const ins = db.prepare(`INSERT INTO demand_forecast (product_name, category, avg_daily, trend_pct, forecast_7d, confidence) VALUES (?,?,?,?,?,?)`);
    SEED.forEach(s => ins.run(...buildRow(s, (Math.random() - 0.5) * 0.2)));
    res.json({ ok: true });
  });

  router.patch('/:id', (req, res) => {
    const row = db.prepare(`SELECT * FROM demand_forecast WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'tidak ditemukan' });
    const b = req.body || {};
    const fields = [], args = [];
    for (const k of ['product_name', 'category', 'avg_daily', 'trend_pct', 'forecast_7d', 'confidence']) {
      if (b[k] !== undefined) { fields.push(`${k} = ?`); args.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, noop: true });
    fields.push(`updated_at = ?`); args.push(nowSec());
    args.push(req.params.id);
    db.prepare(`UPDATE demand_forecast SET ${fields.join(', ')} WHERE id = ?`).run(...args);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare(`DELETE FROM demand_forecast WHERE id = ?`).run(req.params.id);
    if (!info.changes) return res.status(404).json({ error: 'tidak ditemukan' });
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/demand-forecast';
  app.use(mountPath, router);
  console.log(`[demand-forecast] mounted at ${mountPath} — sales demand forecasting`);

  return { router, db };
}

module.exports = { setupDemandForecast };
