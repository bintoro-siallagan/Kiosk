// server/finance-alert-backend.js
// Finance Alert Engine — scan data finance, lempar alert otomatis:
// cash variance, invoice overdue, expense spike, margin drop, refund/
// void abnormal. Rule-based — command center finance.
//
//   GET /api/finance-alerts

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const MDR = { qris: 0.007, gateway: 0.02, gopay: 0.02 };
const DAY = 86400;
const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

function setupFinanceAlerts(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };

  const periodPnL = (from, to) => {
    let gross = 0, fee = 0;
    for (const r of many(`SELECT tender_type t, COALESCE(SUM(amount_applied),0) g
      FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ? GROUP BY tender_type`, from, to)) {
      const g = Math.round(r.g); gross += g;
      if (r.t !== 'cash') fee += Math.round(g * (MDR[r.t] || 0.015));
    }
    const agg = one(`SELECT COALESCE(SUM(gross_amount),0) g, COALESCE(SUM(commission_amount),0) k
      FROM aggregator_orders WHERE status!='rejected' AND received_at BETWEEN ? AND ?`, from, to) || { g: 0, k: 0 };
    gross += Math.round(agg.g); fee += Math.round(agg.k);
    // Cinema revenue (tickets + bundle + in-studio + event)
    const cinemaT  = one(`SELECT COALESCE(SUM(price),0) g FROM cinema_tickets WHERE sold_at BETWEEN ? AND ?`, from, to) || { g: 0 };
    const cinemaB  = one(`SELECT COALESCE(SUM(qty*price),0) g FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`, from, to) || { g: 0 };
    const cinemaIs = one(`SELECT COALESCE(SUM(total),0) g FROM cinema_in_studio_orders WHERE status='delivered' AND created_at BETWEEN ? AND ?`, from, to) || { g: 0 };
    const cinemaEv = one(`SELECT COALESCE(SUM(total_price),0) g FROM cinema_studio_bookings WHERE status IN ('confirmed','completed') AND ((completed_at BETWEEN ? AND ?) OR (status='confirmed' AND created_at BETWEEN ? AND ?))`, from, to, from, to) || { g: 0 };
    gross += Math.round((cinemaT.g || 0) + (cinemaB.g || 0) + (cinemaIs.g || 0) + (cinemaEv.g || 0));
    const opex = Math.round((one(`SELECT COALESCE(SUM(amount),0) v FROM finance_expenses
      WHERE voided_at IS NULL AND expense_date BETWEEN ? AND ?`, from, to) || { v: 0 }).v);
    const laba = gross - Math.round(gross * 0.35) - fee - opex;
    return { revenue: gross, laba, margin: gross ? Math.round(laba / gross * 100) : 0 };
  };

  const router = express.Router();

  router.get('/', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const alerts = [];
    const A = (severity, icon, category, title, detail) => alerts.push({ severity, icon, category, title, detail });

    // 1. Cash variance — selisih kas shift
    for (const s of many(`SELECT staff_name, cash_variance FROM pos_shifts
      WHERE cash_variance IS NOT NULL AND ABS(cash_variance) >= 20000 AND created_at >= ?
      ORDER BY created_at DESC LIMIT 8`, now - 30 * DAY)) {
      const v = Math.round(s.cash_variance);
      A(Math.abs(v) >= 100000 ? 'critical' : 'warning', '💵', 'Cash Variance',
        `Selisih kas — shift ${s.staff_name || '-'}`,
        `${rp(Math.abs(v))} ${v < 0 ? 'KURANG dari expected' : 'LEBIH dari expected'}`);
    }

    // 2. Invoice overdue
    for (const inv of many(`SELECT invoice_number, supplier, total, due_date FROM vendor_invoices
      WHERE status != 'paid' AND due_date < ? ORDER BY due_date`, now)) {
      const late = Math.floor((now - inv.due_date) / DAY);
      A(late > 7 ? 'critical' : 'warning', '🧾', 'Invoice Overdue',
        `${inv.invoice_number} — ${inv.supplier}`,
        `Telat ${late} hari · ${rp(inv.total)} belum dibayar`);
    }

    // 3. Expense spike — beban 7 hari vs rata-rata mingguan
    const exp7 = Math.round((one(`SELECT COALESCE(SUM(amount),0) v FROM finance_expenses
      WHERE voided_at IS NULL AND expense_date >= ?`, now - 7 * DAY) || { v: 0 }).v);
    const exp28 = Math.round((one(`SELECT COALESCE(SUM(amount),0) v FROM finance_expenses
      WHERE voided_at IS NULL AND expense_date BETWEEN ? AND ?`, now - 28 * DAY, now - 7 * DAY) || { v: 0 }).v);
    const avgWeek = exp28 / 3;
    if (avgWeek > 0 && exp7 > avgWeek * 1.4) {
      A('warning', '📈', 'Expense Spike', 'Beban 7 hari terakhir melonjak',
        `${rp(exp7)} vs rata-rata mingguan ${rp(avgWeek)} (+${Math.round((exp7 / avgWeek - 1) * 100)}%)`);
    }

    // 4. Margin drop — 30 hari vs periode sebelumnya
    const cur = periodPnL(now - 30 * DAY, now), prev = periodPnL(now - 60 * DAY, now - 30 * DAY);
    if (prev.revenue > 0 && cur.margin < prev.margin - 5) {
      A('warning', '📉', 'Margin Drop', 'Net margin turun signifikan',
        `Margin ${cur.margin}% (30 hari) vs ${prev.margin}% sebelumnya — turun ${prev.margin - cur.margin} poin`);
    }

    // 5. Refund / cancel abnormal — 7 hari
    const rc = (one(`SELECT COUNT(*) c FROM orders
      WHERE (cancelled_at >= ? OR refunded_at >= ?)`, now - 7 * DAY, now - 7 * DAY) || { c: 0 }).c;
    if (rc >= 5) {
      A(rc >= 12 ? 'critical' : 'warning', '↩️', 'Refund / Cancel Tinggi',
        `${rc} order refund/cancel dalam 7 hari`,
        `Cek pola refund — bisa indikasi fraud / masalah operasional`);
    }

    const sev = (s) => alerts.filter(a => a.severity === s).length;
    res.json({
      generated_at: now,
      alerts,
      summary: { total: alerts.length, critical: sev('critical'), warning: sev('warning'), info: sev('info') },
      healthy: alerts.length === 0,
    });
  });

  const mountPath = opts.mountPath || '/api/finance-alerts';
  app.use(mountPath, router);
  console.log(`[finance-alerts] mounted at ${mountPath} — finance alert engine`);

  return { router, db };
}

module.exports = { setupFinanceAlerts };
