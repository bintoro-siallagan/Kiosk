// server/campaign-impact-backend.js
// Realtime Campaign Engine + Event/Weather Impact Analytics.
// - Event impact: weekend vs weekday & payday-window dari data order.
// - Campaign: compose & launch campaign ke channel (signage/CDS/QR/kiosk/loyalty).
//
//   GET  /api/campaign-impact         — impact + channels + campaigns
//   POST /api/campaign-impact/launch  — luncurkan campaign

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, message TEXT, channels TEXT,
  status TEXT DEFAULT 'live', launched_at INTEGER
);
`;
const CHANNELS = [
  { id: 'signage',  icon: '📺', name: 'Signage / TV',   desc: 'Layar besar in-store' },
  { id: 'cds',      icon: '🖥️', name: 'Second Display', desc: 'Layar kedua kasir/kiosk' },
  { id: 'qr',       icon: '📱', name: 'QR Order',        desc: 'Halaman QR customer' },
  { id: 'kiosk',    icon: '🛎️', name: 'Kiosk',           desc: 'Layar self-order kiosk' },
  { id: 'loyalty',  icon: '⭐', name: 'Loyalty / POS',   desc: 'Notif member di POS' },
];
const CH_IDS = new Set(CHANNELS.map(c => c.id));
const normMs = (t) => (t > 1e12 ? t : (t || 0) * 1000);
const nowSec = () => Math.floor(Date.now() / 1000);

function setupCampaignImpact(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  if (db.prepare(`SELECT COUNT(*) c FROM campaigns`).get().c === 0) {
    const ins = db.prepare(`INSERT INTO campaigns (name, message, channels, status, launched_at) VALUES (?,?,?,?,?)`);
    ins.run('Weekend Froyo Fest', 'Diskon 20% tiap weekend — ajak keluarga!', JSON.stringify(['signage', 'qr', 'kiosk']), 'live', nowSec() - 2 * 86400);
    ins.run('Payday Treat', 'Gajian? Saatnya self-reward 🍦', JSON.stringify(['cds', 'loyalty', 'kiosk']), 'ended', nowSec() - 12 * 86400);
  }

  const router = express.Router();
  router.use(express.json());

  const eventImpact = () => {
    const orders = many(`SELECT time, total FROM orders`);
    const bucket = { weekend: { o: 0, r: 0, d: new Set() }, weekday: { o: 0, r: 0, d: new Set() },
      payday: { o: 0, r: 0, d: new Set() }, normal: { o: 0, r: 0, d: new Set() } };
    for (const o of orders) {
      const dt = new Date(normMs(o.time));
      const key = dt.toISOString().slice(0, 10);
      const dow = dt.getDay(), dom = dt.getDate();
      const wk = (dow === 0 || dow === 6) ? 'weekend' : 'weekday';
      const pd = (dom >= 25 || dom <= 2) ? 'payday' : 'normal';
      bucket[wk].o++; bucket[wk].r += o.total || 0; bucket[wk].d.add(key);
      bucket[pd].o++; bucket[pd].r += o.total || 0; bucket[pd].d.add(key);
    }
    const avg = (b) => (b.d.size ? Math.round(b.o / b.d.size) : 0);
    const uplift = (a, b) => (b ? Math.round((a - b) / b * 100) : 0);
    const weAvg = avg(bucket.weekend), wdAvg = avg(bucket.weekday);
    const pdAvg = avg(bucket.payday), nmAvg = avg(bucket.normal);
    return {
      weekend: { orders_per_day: weAvg, total_orders: bucket.weekend.o },
      weekday: { orders_per_day: wdAvg, total_orders: bucket.weekday.o },
      weekend_uplift: uplift(weAvg, wdAvg),
      payday: { orders_per_day: pdAvg, total_orders: bucket.payday.o },
      normal: { orders_per_day: nmAvg, total_orders: bucket.normal.o },
      payday_uplift: bucket.payday.o > 0 ? uplift(pdAvg, nmAvg) : null,
      weather_note: 'Impact cuaca (hujan/cerah) butuh integrasi weather API. Analisis payday & holiday makin akurat seiring data bertambah panjang.',
    };
  };

  router.get('/', (req, res) => {
    const campaigns = many(`SELECT * FROM campaigns ORDER BY launched_at DESC`).map(c => ({
      ...c, channels: (() => { try { return JSON.parse(c.channels || '[]'); } catch { return []; } })(),
    }));
    res.json({
      impact: eventImpact(),
      channels: CHANNELS,
      campaigns,
      summary: {
        live_campaigns: campaigns.filter(c => c.status === 'live').length,
        total_campaigns: campaigns.length,
        channels: CHANNELS.length,
      },
    });
  });

  router.post('/launch', (req, res) => {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'nama campaign wajib' });
    const channels = Array.isArray(b.channels) ? b.channels.filter(c => CH_IDS.has(c)) : [];
    if (!channels.length) return res.status(400).json({ error: 'pilih minimal 1 channel' });
    const r = db.prepare(`INSERT INTO campaigns (name, message, channels, status, launched_at) VALUES (?,?,?, 'live', ?)`)
      .run(String(b.name).trim(), (b.message || '').toString().trim(), JSON.stringify(channels), nowSec());
    res.json({ ok: true, id: r.lastInsertRowid, channels });
  });

  const mountPath = opts.mountPath || '/api/campaign-impact';
  app.use(mountPath, router);
  console.log(`[campaign-impact] mounted at ${mountPath} — campaign engine & event impact`);

  return { router, db };
}

module.exports = { setupCampaignImpact };
