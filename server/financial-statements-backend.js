// server/financial-statements-backend.js
// Laporan Keuangan — Laba Rugi & Neraca, di-derive dari transaksi
// (lanjutan dari Jurnal → Buku Besar).
//
//   Laba Rugi : Pendapatan − Beban (MDR + komisi platform + operasional)
//   Neraca    : Aset = Kewajiban + Ekuitas  (snapshot ringkas)
//
//   GET /api/financial-statements?from=<unix>&to=<unix>

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const MDR = { qris: 0.007, gateway: 0.02, gopay: 0.02 };

function setupFinancialStatements(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const from = Number(req.query.from) || (today - 30 * 86400);
    const to = Number(req.query.to) || Math.floor(Date.now() / 1000);

    // ── transaksi periode ──
    const pos = many(`SELECT tender_type t, COALESCE(SUM(amount_applied),0) g
      FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ? GROUP BY tender_type`, from, to);
    const agg = one(`SELECT COALESCE(SUM(gross_amount),0) g, COALESCE(SUM(commission_amount),0) k, COALESCE(SUM(net_amount),0) n
      FROM aggregator_orders WHERE status != 'rejected' AND received_at BETWEEN ? AND ?`, from, to) || { g: 0, k: 0, n: 0 };

    let posGross = 0, posCash = 0, mdr = 0, posNonCashNet = 0;
    for (const r of pos) {
      const g = Math.round(r.g);
      posGross += g;
      if (r.t === 'cash') { posCash += g; }
      else { const fee = Math.round(g * (MDR[r.t] || 0.015)); mdr += fee; posNonCashNet += g - fee; }
    }
    const aggGross = Math.round(agg.g), komisi = Math.round(agg.k), aggNet = Math.round(agg.n) || (aggGross - komisi);
    const pendapatan = posGross + aggGross;
    const opex = Math.round((one(`SELECT COALESCE(SUM(amount),0) v FROM finance_expenses
      WHERE voided_at IS NULL AND expense_date BETWEEN ? AND ?`, from, to) || { v: 0 }).v);
    // HPP estimasi (food cost ~35%) — food cost real-time = modul tersendiri
    const hpp = Math.round(pendapatan * 0.35);
    const totalBeban = hpp + mdr + komisi + opex;
    const labaBersih = pendapatan - totalBeban;

    // ── Neraca (snapshot ringkas) ──
    const persediaan = Math.round((one(`SELECT COALESCE(SUM(stock * cost_per_unit),0) v FROM audit_warehouse`) || { v: 0 }).v);
    const piutang = posNonCashNet + aggNet;          // belum cair dari processor/platform
    const kas = posCash;                              // tunai masuk laci periode ini
    const totalAset = kas + piutang + persediaan;
    const hutangUsaha = Math.round((one(`SELECT COALESCE(SUM(total),0) v FROM vendor_invoices WHERE status != 'paid'`) || { v: 0 }).v);
    const modal = totalAset - hutangUsaha - labaBersih;   // saldo awal/akumulasi — plug biar balance
    const totalPasiva = hutangUsaha + modal + labaBersih;

    res.json({
      period: { from, to },
      laba_rugi: {
        rows: [
          { label: 'Pendapatan Penjualan', amount: pendapatan, type: 'revenue' },
          { label: 'HPP — Harga Pokok Penjualan (estimasi 35%)', amount: -hpp, type: 'cogs' },
          { label: 'Beban MDR (payment processor)', amount: -mdr, type: 'expense' },
          { label: 'Beban Komisi Platform', amount: -komisi, type: 'expense' },
          { label: 'Beban Operasional', amount: -opex, type: 'expense' },
        ],
        total_pendapatan: pendapatan,
        total_beban: totalBeban,
        laba_bersih: labaBersih,
        margin_pct: pendapatan ? Math.round(labaBersih / pendapatan * 100) : 0,
      },
      neraca: {
        aset: [
          { label: 'Kas', amount: kas },
          { label: 'Piutang (belum cair)', amount: piutang },
          { label: 'Persediaan (nilai stok)', amount: persediaan },
        ],
        kewajiban: [{ label: 'Hutang Usaha (invoice belum lunas)', amount: hutangUsaha }],
        ekuitas: [
          { label: 'Modal / Saldo Akumulasi', amount: modal },
          { label: 'Laba Berjalan', amount: labaBersih },
        ],
        total_aset: totalAset,
        total_pasiva: totalPasiva,
        balanced: Math.abs(totalAset - totalPasiva) < 1,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/financial-statements';
  app.use(mountPath, router);
  console.log(`[financial-statements] mounted at ${mountPath} — laba rugi + neraca`);

  return { router, db };
}

module.exports = { setupFinancialStatements };
