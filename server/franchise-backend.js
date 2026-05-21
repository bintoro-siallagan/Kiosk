// server/franchise-backend.js
// Franchise Finance Layer — buat HQ: royalty fee, franchise fee,
// consolidated reporting, perbandingan outlet.
// Outlet flagship = HQ-owned (gak bayar royalty). Sisanya = franchise.
//
//   GET /api/franchise

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const ROYALTY_RATE = 0.05;          // 5% dari revenue outlet franchise
const FRANCHISE_FEE = 30000000;     // nilai kontrak franchise per outlet

function setupFranchise(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const outlets = many(`SELECT id, name, area, revenue_today, health_score, is_flagship
      FROM outlets ORDER BY revenue_today DESC`);

    const rows = outlets.map(o => {
      const isFranchise = !o.is_flagship;
      const revenue = Math.round(o.revenue_today || 0);
      const royalty = isFranchise ? Math.round(revenue * ROYALTY_RATE) : 0;
      return {
        name: o.name, area: o.area, health: o.health_score,
        type: isFranchise ? 'Franchise' : 'HQ-Owned',
        revenue, royalty,
        franchise_fee: isFranchise ? FRANCHISE_FEE : 0,
        hq_income: royalty,                       // pemasukan rutin HQ dari outlet ini
      };
    });

    const franchise = rows.filter(r => r.type === 'Franchise');
    res.json({
      royalty_rate: ROYALTY_RATE,
      outlets: rows,
      summary: {
        total_outlet: rows.length,
        hq_owned: rows.length - franchise.length,
        franchise_count: franchise.length,
        network_revenue: rows.reduce((s, r) => s + r.revenue, 0),
        royalty_income: rows.reduce((s, r) => s + r.royalty, 0),
        franchise_fee_value: franchise.length * FRANCHISE_FEE,
        hq_owned_revenue: rows.filter(r => r.type === 'HQ-Owned').reduce((s, r) => s + r.revenue, 0),
      },
    });
  });

  const mountPath = opts.mountPath || '/api/franchise';
  app.use(mountPath, router);
  console.log(`[franchise] mounted at ${mountPath} — franchise finance layer`);

  return { router, db };
}

module.exports = { setupFranchise };
