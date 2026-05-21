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

    // ── AI Finance Insight (rule-based) ──
    const fk = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'jt' : n >= 1e3 ? Math.round(n / 1e3) + 'rb' : String(Math.round(n || 0)));
    const insights = [];
    const I = (tone, icon, title, text) => insights.push({ tone, icon, title, text });
    const margin = revenue ? Math.round(laba / revenue * 100) : 0;
    I(margin >= 12 ? 'good' : margin >= 5 ? 'neutral' : 'attention', margin >= 12 ? '✅' : '⚠️',
      `Net margin ${margin}%`,
      margin >= 12 ? 'Margin sehat untuk F&B — pertahankan kontrol biaya.'
        : margin >= 5 ? 'Margin tipis — cek beban operasional & food cost.'
        : 'Margin kritis — bisnis nyaris break-even, evaluasi harga/biaya.');
    if (aggGross > 0 && revenue > 0) {
      I('neutral', '🛵', `Channel online ${Math.round(aggGross / revenue * 100)}% dari revenue`,
        `Penjualan platform Rp ${fk(aggGross)} — komisi ~20%, margin channel ini lebih tipis dari POS langsung.`);
    }
    const topExp = one(`SELECT c.name n, SUM(e.amount) v FROM finance_expenses e
      LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.voided_at IS NULL AND e.expense_date BETWEEN ? AND ?
      GROUP BY e.category_id ORDER BY v DESC LIMIT 1`, from, to);
    if (topExp && topExp.v > 0) {
      I('neutral', '💸', `Beban terbesar: ${topExp.n || 'Operasional'}`,
        `Rp ${fk(topExp.v)} — ${Math.round(topExp.v / (opex || 1) * 100)}% dari total beban operasional.`);
    }
    I(posCash - cashOut >= 0 ? 'good' : 'attention', '💵', `Cashflow bersih Rp ${fk(posCash - cashOut)}`,
      posCash - cashOut >= 0 ? 'Kas masuk > kas keluar — likuiditas aman.'
        : 'Kas keluar tunai melebihi kas masuk — pantau likuiditas.');
    const arOver = Math.round((one(`SELECT COALESCE(SUM(amount - paid_amount),0) v FROM ar_invoices
      WHERE status != 'paid' AND due_date < ?`, to) || { v: 0 }).v);
    if (arOver > 0) I('attention', '📥', `Piutang overdue Rp ${fk(arOver)}`,
      'Ada piutang lewat jatuh tempo — tagih ke customer biar cashflow gak nyangkut.');
    if (outlets.length >= 2) {
      const top = outlets[0], low = outlets[outlets.length - 1];
      I('neutral', '🏢', `Outlet ${top.name} revenue tertinggi`,
        `${top.name} Rp ${fk(top.revenue_today)} vs ${low.name} Rp ${fk(low.revenue_today)} — gap ${Math.round((top.revenue_today / (low.revenue_today || 1) - 1) * 100)}%.`);
    }

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
      insights,
    });
  });

  const mountPath = opts.mountPath || '/api/finance-center';
  app.use(mountPath, router);
  console.log(`[finance-center] mounted at ${mountPath} — finance hero dashboard`);

  return { router, db };
}

module.exports = { setupFinanceCenter };
