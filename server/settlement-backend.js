// server/settlement-backend.js
// Settlement Report — tarik SEMUA transaksi (POS + Aggregator) buat
// rekonsiliasi finance. Per channel: bruto, fee/komisi, neto, status
// settlement (tunai langsung vs nunggu payout).
//
//   GET /api/settlement?from=<unix>&to=<unix>

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

// channel POS — MDR estimasi (fee payment processor)
const POS_CH = {
  cash:    { label: 'Tunai',             mdr: 0,     settle: 'Langsung — laci kasir' },
  qris:    { label: 'QRIS',              mdr: 0.007, settle: 'Cair ke bank · T+1' },
  gateway: { label: 'Payment Gateway',   mdr: 0.02,  settle: 'Cair ke bank · T+1' },
  gopay:   { label: 'GoPay / e-Wallet',  mdr: 0.02,  settle: 'Cair ke bank · T+1' },
};
const AGG = { gofood: 'GoFood', grabfood: 'GrabFood', shopeefood: 'ShopeeFood', traveloka: 'Traveloka' };

function setupSettlement(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const from = Number(req.query.from) || today;
    const to = Number(req.query.to) || Math.floor(Date.now() / 1000);
    const channels = [];

    // ── POS payments (cash / qris / gateway / e-wallet) ──
    for (const r of many(`SELECT tender_type t, COUNT(*) c, COALESCE(SUM(amount_applied),0) g
      FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ?
      GROUP BY tender_type`, from, to)) {
      const meta = POS_CH[r.t] || { label: r.t || 'Lainnya', mdr: 0.015, settle: 'Cair ke bank · T+1' };
      const gross = Math.round(r.g);
      const fee = Math.round(gross * meta.mdr);
      channels.push({
        channel: meta.label, group: 'POS', count: r.c, gross, fee, net: gross - fee,
        fee_pct: +(meta.mdr * 100).toFixed(2), settle: meta.settle, settled: meta.mdr === 0,
      });
    }

    // ── Aggregator (GoFood / GrabFood / dll) — komisi & neto dari data ──
    for (const r of many(`SELECT provider_code p, COUNT(*) c, COALESCE(SUM(gross_amount),0) g,
      COALESCE(SUM(commission_amount),0) k, COALESCE(SUM(net_amount),0) n
      FROM aggregator_orders WHERE status != 'rejected' AND received_at BETWEEN ? AND ?
      GROUP BY provider_code`, from, to)) {
      const gross = Math.round(r.g), fee = Math.round(r.k);
      channels.push({
        channel: AGG[r.p] || r.p, group: 'Aggregator', count: r.c, gross, fee,
        net: Math.round(r.n) || (gross - fee), fee_pct: gross ? +(fee / gross * 100).toFixed(1) : 0,
        settle: 'Payout per siklus aggregator', settled: false,
      });
    }

    channels.sort((a, b) => b.gross - a.gross);
    const sum = (f) => channels.reduce((s, c) => s + c[f], 0);

    res.json({
      period: { from, to },
      channels,
      summary: {
        txn_count: channels.reduce((s, c) => s + c.count, 0),
        total_gross: sum('gross'),
        total_fee: sum('fee'),
        total_net: sum('net'),
        cash_in_hand: channels.filter(c => c.settled).reduce((s, c) => s + c.net, 0),
        pending_settlement: channels.filter(c => !c.settled).reduce((s, c) => s + c.net, 0),
      },
    });
  });

  const mountPath = opts.mountPath || '/api/settlement';
  app.use(mountPath, router);
  console.log(`[settlement] mounted at ${mountPath} — transaction settlement report`);

  return { router, db };
}

module.exports = { setupSettlement };
