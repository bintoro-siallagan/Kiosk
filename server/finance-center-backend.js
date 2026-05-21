// server/finance-center-backend.js
// Finance Command Center — agregat semua angka finance jadi 1 layar
// hero: revenue, laba, cashflow, AP/AR, settlement, invoice, outlet.
//
//   GET /api/finance-center?days=30

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const MDR = { qris: 0.007, gateway: 0.02, gopay: 0.02 };

function setupFinanceCenter(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const to = Math.floor(Date.now() / 1000);
    const from = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000) - days * 86400;

    // ── POS ──
    let posGross = 0, posCash = 0, mdr = 0, posNonCashNet = 0;
    for (const r of many(`SELECT tender_type t, COALESCE(SUM(amount_applied),0) g
      FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ? GROUP BY tender_type`, from, to)) {
      const g = Math.round(r.g);
      posGross += g;
      if (r.t === 'cash') posCash += g;
      else { const f = Math.round(g * (MDR[r.t] || 0.015)); mdr += f; posNonCashNet += g - f; }
    }
    // ── Aggregator ──
    const agg = one(`SELECT COALESCE(SUM(gross_amount),0) g, COALESCE(SUM(commission_amount),0) k, COALESCE(SUM(net_amount),0) n
      FROM aggregator_orders WHERE status!='rejected' AND received_at BETWEEN ? AND ?`, from, to) || { g: 0, k: 0, n: 0 };
    const aggGross = Math.round(agg.g), komisi = Math.round(agg.k), aggNet = Math.round(agg.n) || (aggGross - komisi);

    const revenue = posGross + aggGross;
    const hpp = Math.round(revenue * 0.35);
    const opexRows = many(`SELECT amount, payment_method FROM finance_expenses
      WHERE voided_at IS NULL AND expense_date BETWEEN ? AND ?`, from, to);
    const opex = opexRows.reduce((s, r) => s + Math.round(r.amount || 0), 0);
    const cashOut = opexRows.filter(r => !/transfer|bank/i.test(r.payment_method || ''))
      .reduce((s, r) => s + Math.round(r.amount || 0), 0);
    const beban = hpp + mdr + komisi + opex;
    const laba = revenue - beban;

    // ── AP — invoice belum lunas ──
    const apRow = one(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM vendor_invoices WHERE status != 'paid'`) || { c: 0, t: 0 };
    const invByStatus = {};
    for (const r of many(`SELECT status, COUNT(*) c FROM vendor_invoices GROUP BY status`)) invByStatus[r.status] = r.c;

    // ── Outlet snapshot ──
    const outlets = many(`SELECT name, area, revenue_today, health_score FROM outlets ORDER BY revenue_today DESC`);

    res.json({
      period: { days, from, to },
      kpi: {
        revenue, expense: beban, laba_bersih: laba,
        margin_pct: revenue ? Math.round(laba / revenue * 100) : 0,
        cash_in: posCash, cash_out: cashOut, cash_net: posCash - cashOut,
        ap_total: Math.round(apRow.t), ap_count: apRow.c,
        ar_total: Math.round((one(`SELECT COALESCE(SUM(amount - paid_amount),0) t
          FROM ar_invoices WHERE status != 'paid'`) || { t: 0 }).t),
      },
      settlement: {
        total_gross: revenue,
        cash_in_hand: posCash,
        pending_settlement: posNonCashNet + aggNet,
      },
      invoices: {
        pending: invByStatus.pending || 0,
        approved: invByStatus.approved || 0,
        authorized: invByStatus.authorized || 0,
        paid: invByStatus.paid || 0,
      },
      outlets,
    });
  });

  const mountPath = opts.mountPath || '/api/finance-center';
  app.use(mountPath, router);
  console.log(`[finance-center] mounted at ${mountPath} — finance hero dashboard`);

  return { router, db };
}

module.exports = { setupFinanceCenter };
