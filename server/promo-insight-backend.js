// server/promo-insight-backend.js
// Promotion Effectiveness — Command Center.
// Promo mana yang efektif vs idle (gak kepake). Read-only dari tabel promos.
//
//   GET /api/promo-insight  →  { summary, promos }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const AVG_ORDER = 75000;   // estimasi nilai order rata-rata (buat hitung diskon %)
const BOGO_VALUE = 40000;  // estimasi nilai item gratis per redemption BOGO

function setupPromoInsight(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const router = express.Router();

  router.get('/', (req, res) => {
    let promos = [];
    try { promos = db.prepare('SELECT * FROM promos').all(); } catch (e) { /* tabel belum ada */ }

    const items = promos.map(p => {
      const used = p.used_count || 0;
      const limit = p.usage_limit || 0;
      let estDiscount = 0;
      if (p.type === 'fixed') estDiscount = used * (p.value || 0);
      else if (p.type === 'percent') estDiscount = Math.round(used * ((p.value || 0) / 100) * AVG_ORDER);
      else estDiscount = used * BOGO_VALUE; // bogo
      const status = used === 0 ? 'idle' : used >= 10 ? 'effective' : 'low';
      return {
        code: p.code, desc: p.desc || '', type: p.type, value: p.value,
        used_count: used, usage_limit: limit, active: !!p.active,
        for_member: !!p.for_member,
        usage_rate: limit ? Math.min(100, Math.round(used / limit * 100)) : 0,
        est_discount: estDiscount, status,
      };
    }).sort((a, b) => b.used_count - a.used_count);

    res.json({
      summary: {
        total: items.length,
        active: items.filter(i => i.active).length,
        total_redemptions: items.reduce((s, i) => s + i.used_count, 0),
        est_discount: items.reduce((s, i) => s + i.est_discount, 0),
        idle: items.filter(i => i.status === 'idle').length,
        effective: items.filter(i => i.status === 'effective').length,
        top: items[0] && items[0].used_count > 0 ? items[0] : null,
      },
      promos: items,
    });
  });

  const mountPath = opts.mountPath || '/api/promo-insight';
  app.use(mountPath, router);
  console.log(`[promo-insight] mounted at ${mountPath} — promotion effectiveness`);
  return { router, db };
}

module.exports = { setupPromoInsight };
