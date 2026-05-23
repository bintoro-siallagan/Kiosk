// server/journal-backend.js
// Jurnal Akuntansi — entri double-entry (debit/kredit) yang DI-GENERATE
// otomatis dari transaksi: penjualan (settlement POS + platform online)
// & beban (finance expenses). Tiap entri balance. Plus buku besar ringkas.
//
//   GET /api/journal?from=<unix>&to=<unix>

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const POS_CH = {
  cash:    { label: 'Tunai',            mdr: 0,     dr: 'Kas' },
  qris:    { label: 'QRIS',             mdr: 0.007, dr: 'Piutang Payment Gateway' },
  gateway: { label: 'Payment Gateway',  mdr: 0.02,  dr: 'Piutang Payment Gateway' },
  gopay:   { label: 'GoPay / e-Wallet', mdr: 0.02,  dr: 'Piutang Payment Gateway' },
};
const AGG = { gofood: 'GoFood', grabfood: 'GrabFood', shopeefood: 'ShopeeFood', traveloka: 'Traveloka' };

// pemetaan nama akun jurnal → kode Chart of Accounts (coa_accounts)
const COA_MAP = {
  'Kas': '1-1100', 'Bank': '1-1200',
  'Piutang Payment Gateway': '1-1300', 'Piutang Aggregator': '1-1300',
  'Pendapatan Penjualan': '4-1100', 'Beban MDR': '6-1700', 'Beban Komisi Platform': '6-1700',
  // Cinema vertical
  'Penjualan Tiket Cinema':           '4-1500',
  'Penjualan F&B Cinema — Bundle':    '4-1510',
  'Penjualan F&B Cinema — In-Studio': '4-1520',
  'Penjualan Event Booking Cinema':   '4-1530',
  'HPP — Royalti Distributor Film':   '5-2100',
  'HPP — Bahan F&B Cinema':           '5-2200',
  'Hutang Royalti Distributor Film':  '2-1500',
  'Beban Operasional Cinema':         '6-2100',
};
const coaCodeOf = (name) => {
  if (COA_MAP[name]) return COA_MAP[name];
  if (/sewa/i.test(name)) return '6-1200';
  if (/gaji|payroll/i.test(name)) return '6-1100';
  if (/listrik|air|utilit/i.test(name)) return '6-1300';
  if (/marketing|promo/i.test(name)) return '6-1400';
  if (/maintenance|repair/i.test(name)) return '6-1500';
  if (/^beban/i.test(name)) return '6-1900';
  return '';
};

function setupJournal(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const from = Number(req.query.from) || today;
    const to = Number(req.query.to) || Math.floor(Date.now() / 1000);

    const entries = [];
    const ledger = {};
    const post = (acc, dr, cr, code) => {
      ledger[acc] = ledger[acc] || { debit: 0, credit: 0, coa_code: code || '' };
      ledger[acc].debit += dr; ledger[acc].credit += cr;
    };
    const addEntry = (ref, desc, lines) => {
      const tagged = lines.map(l => ({ account: l.account, coa_code: coaCodeOf(l.account), debit: l.debit || 0, credit: l.credit || 0 }));
      entries.push({ ref, description: desc, lines: tagged });
      tagged.forEach(l => post(l.account, l.debit, l.credit, l.coa_code));
    };

    // ── PENJUALAN — POS ──
    for (const r of many(`SELECT tender_type t, COUNT(*) c, COALESCE(SUM(amount_applied),0) g
      FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ?
      GROUP BY tender_type`, from, to)) {
      const m = POS_CH[r.t] || { label: r.t || 'Lainnya', mdr: 0.015, dr: 'Piutang Payment Gateway' };
      const gross = Math.round(r.g), fee = Math.round(gross * m.mdr), net = gross - fee;
      const lines = m.mdr === 0
        ? [{ account: 'Kas', debit: gross, credit: 0 }]
        : [{ account: m.dr, debit: net, credit: 0 }, { account: 'Beban MDR', debit: fee, credit: 0 }];
      lines.push({ account: 'Pendapatan Penjualan', debit: 0, credit: gross });
      addEntry('JV-' + String(r.t || 'POS').toUpperCase(), `Penjualan ${m.label} — ${r.c} transaksi`, lines);
    }

    // ── PENJUALAN — Platform online / delivery ──
    for (const r of many(`SELECT provider_code p, COUNT(*) c, COALESCE(SUM(gross_amount),0) g,
      COALESCE(SUM(commission_amount),0) k, COALESCE(SUM(net_amount),0) n
      FROM aggregator_orders WHERE status != 'rejected' AND received_at BETWEEN ? AND ?
      GROUP BY provider_code`, from, to)) {
      const gross = Math.round(r.g), fee = Math.round(r.k), net = Math.round(r.n) || (gross - fee);
      addEntry('JV-' + String(r.p || 'AGG').toUpperCase(), `Penjualan ${AGG[r.p] || r.p} — ${r.c} transaksi`, [
        { account: 'Piutang Aggregator', debit: net, credit: 0 },
        { account: 'Beban Komisi Platform', debit: fee, credit: 0 },
        { account: 'Pendapatan Penjualan', debit: 0, credit: gross },
      ]);
    }

    // ── PENJUALAN — CINEMA (tickets) ──
    // Cinema POST /tickets gak track payment method per ticket, treat = Kas.
    // Refund (cinema_ticket_voids) di-reverse dari pendapatan tiket.
    for (const r of many(`SELECT
      COUNT(*) c, COALESCE(SUM(price),0) g
      FROM cinema_tickets WHERE sold_at BETWEEN ? AND ?`, from, to)) {
      if (!r.c) continue;
      const gross = Math.round(r.g);
      addEntry('JV-CINEMA-TKT', `Penjualan Tiket Cinema — ${r.c} tiket`, [
        { account: 'Kas',                      debit: gross, credit: 0 },
        { account: 'Penjualan Tiket Cinema',   debit: 0,     credit: gross },
      ]);
    }
    // Refund tiket cinema — reverse entry
    for (const r of many(`SELECT
      COUNT(*) c, COALESCE(SUM(price),0) g
      FROM cinema_ticket_voids WHERE voided_at BETWEEN ? AND ?`, from, to)) {
      if (!r.c) continue;
      const gross = Math.round(r.g);
      addEntry('JV-CINEMA-VOID', `Refund / Void Tiket Cinema — ${r.c} tiket`, [
        { account: 'Penjualan Tiket Cinema',   debit: gross, credit: 0 },
        { account: 'Kas',                      debit: 0,     credit: gross },
      ]);
    }
    // Royalti distributor (tier-aware, persis logic /distribution/settlement)
    const royaltyRows = many(`
      SELECT t.price, t.sold_at, f.id AS film_id, f.license_start, f.revenue_share_pct legacy_pct,
             COALESCE(d.vat_pct, 11) AS vat_pct
      FROM cinema_tickets t
      LEFT JOIN cinema_showtimes s ON s.id = t.showtime_id
      LEFT JOIN cinema_films    f ON f.id = s.film_id
      LEFT JOIN cinema_distributors d ON d.id = f.distributor_id
      WHERE t.sold_at BETWEEN ? AND ?`, from, to);
    if (royaltyRows.length) {
      const tiersByFilm = {};
      const getTiers = (fid) => {
        if (fid == null) return [];
        if (tiersByFilm[fid] !== undefined) return tiersByFilm[fid];
        tiersByFilm[fid] = many(`SELECT * FROM cinema_share_tiers WHERE film_id = ? ORDER BY week_from`, fid);
        return tiersByFilm[fid];
      };
      const weekIndex = (soldAt, licenseStart) => {
        if (!licenseStart) return 1;
        const [Y, M, D] = String(licenseStart).split('-').map(Number);
        if (!Y || !M || !D) return 1;
        const startMs = new Date(Y, M - 1, D, 0, 0, 0).getTime();
        return Math.max(1, Math.floor((soldAt * 1000 - startMs) / 86400000 / 7) + 1);
      };
      let totalRoyalty = 0, totalCinemaShare = 0;
      for (const r of royaltyRows) {
        const net = (r.price || 0) * (1 - (r.vat_pct || 0) / 100);
        const week = weekIndex(r.sold_at, r.license_start);
        const tiers = getTiers(r.film_id);
        const tier = tiers.find(t => week >= (t.week_from || 1) && (t.week_to == null || week <= t.week_to));
        const distPct = tier ? tier.distributor_pct : (r.legacy_pct || 0);
        totalRoyalty     += Math.round(net * distPct / 100);
        totalCinemaShare += Math.round(net * (100 - distPct) / 100);
      }
      if (totalRoyalty > 0) {
        addEntry('JV-CINEMA-ROYALTY', `Royalti distributor cinema (tier-aware, ${royaltyRows.length} tiket)`, [
          { account: 'HPP — Royalti Distributor Film',    debit: totalRoyalty, credit: 0 },
          { account: 'Hutang Royalti Distributor Film',   debit: 0,            credit: totalRoyalty },
        ]);
      }
    }

    // ── PENJUALAN — CINEMA F&B (bundle saat beli tiket) ──
    for (const r of many(`SELECT
      COUNT(*) c, COALESCE(SUM(qty * price),0) g
      FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`, from, to)) {
      if (!r.c) continue;
      const gross = Math.round(r.g);
      addEntry('JV-CINEMA-FNB', `Penjualan F&B Cinema (bundle) — ${r.c} item`, [
        { account: 'Kas',                                 debit: gross, credit: 0 },
        { account: 'Penjualan F&B Cinema — Bundle',       debit: 0,     credit: gross },
      ]);
    }

    // ── PENJUALAN — CINEMA In-Studio Order ──
    for (const r of many(`SELECT
      COUNT(*) c, COALESCE(SUM(total),0) g
      FROM cinema_in_studio_orders
      WHERE status = 'delivered' AND created_at BETWEEN ? AND ?`, from, to)) {
      if (!r.c) continue;
      const gross = Math.round(r.g);
      addEntry('JV-CINEMA-INSTUDIO', `Penjualan F&B Cinema (in-studio) — ${r.c} order`, [
        { account: 'Kas',                                 debit: gross, credit: 0 },
        { account: 'Penjualan F&B Cinema — In-Studio',    debit: 0,     credit: gross },
      ]);
    }

    // ── PENJUALAN — CINEMA Event Booking ──
    // Hanya yang sudah completed/confirmed yang di-recognize sebagai revenue.
    // Deposit dianggap pendapatan diterima dimuka (sudah handle terpisah).
    for (const r of many(`SELECT
      COUNT(*) c, COALESCE(SUM(total_price),0) g, COALESCE(SUM(deposit_paid),0) dp
      FROM cinema_studio_bookings
      WHERE status IN ('confirmed','completed')
        AND (
          (status = 'confirmed' AND date(created_at,'unixepoch','localtime') BETWEEN date(?, 'unixepoch','localtime') AND date(?, 'unixepoch','localtime'))
          OR (status = 'completed' AND completed_at BETWEEN ? AND ?)
        )`, from, to, from, to)) {
      if (!r.c) continue;
      const gross = Math.round(r.g);
      addEntry('JV-CINEMA-EVENT', `Event Booking Studio — ${r.c} event`, [
        { account: 'Kas',                                 debit: gross, credit: 0 },
        { account: 'Penjualan Event Booking Cinema',      debit: 0,     credit: gross },
      ]);
    }

    // ── BEBAN — finance expenses ──
    for (const r of many(`SELECT e.amount a, e.payment_method pm, e.vendor v, c.name cat
      FROM finance_expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE e.voided_at IS NULL AND e.expense_date BETWEEN ? AND ?`, from, to)) {
      const amt = Math.round(r.a || 0);
      if (amt <= 0) continue;
      const credAcc = /transfer|bank/i.test(r.pm || '') ? 'Bank' : 'Kas';
      addEntry('JV-EXP', `Beban ${r.cat || 'Operasional'}${r.v ? ' — ' + r.v : ''}`, [
        { account: `Beban ${r.cat || 'Operasional'}`, debit: amt, credit: 0 },
        { account: credAcc, debit: 0, credit: amt },
      ]);
    }

    const ledgerArr = Object.entries(ledger)
      .map(([account, v]) => ({ account, coa_code: v.coa_code, debit: v.debit, credit: v.credit, balance: v.debit - v.credit }))
      .sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit));
    const totalDebit = ledgerArr.reduce((s, l) => s + l.debit, 0);
    const totalCredit = ledgerArr.reduce((s, l) => s + l.credit, 0);

    res.json({
      period: { from, to },
      entries,
      ledger: ledgerArr,
      totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 },
    });
  });

  const mountPath = opts.mountPath || '/api/journal';
  app.use(mountPath, router);
  console.log(`[journal] mounted at ${mountPath} — accounting journal (double-entry)`);

  return { router, db };
}

module.exports = { setupJournal };
