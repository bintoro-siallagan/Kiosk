// server/self-audit-backend.js
// Self-Audit Center — sistem mengaudit dirinya sendiri. Menjalankan
// rangkaian health check otomatis lintas domain → health score,
// KPI per domain & daftar isu (alert).
//
//   GET /api/self-audit   — health score + cek per domain + isu

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const nowSec = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function setupSelfAudit(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const cnt = (s, ...p) => { try { return db.prepare(s).get(...p).c; } catch { return 0; } };
  const N = () => nowSec();

  // check: status ok | warning | critical
  const C = (name, status, detail) => ({ name, status, detail });

  const runAudit = () => {
    const now = N();
    const domains = [];

    // ── FINANCE ──
    domains.push({
      domain: 'Finance & Akuntansi', icon: '💰', checks: [
        (() => { const c = cnt(`SELECT COUNT(*) c FROM coa_accounts WHERE is_active=1`);
          return C('Chart of Accounts aktif', c > 0 ? 'ok' : 'critical', `${c} akun aktif`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM sales_invoices WHERE status!='paid' AND due_date<${now}`);
          return C('Invoice jatuh tempo', c === 0 ? 'ok' : 'critical', c === 0 ? 'Tidak ada invoice telat' : `${c} invoice lewat jatuh tempo`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM payment_releases WHERE status='pending' AND due_date<${now}`);
          return C('Pembayaran vendor telat', c === 0 ? 'ok' : 'warning', c === 0 ? 'Semua pembayaran on-track' : `${c} pembayaran lewat tempo`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM tax_records WHERE flow IN ('output','pph') AND status!='paid'`);
          return C('Pajak belum disetor', c === 0 ? 'ok' : 'warning', c === 0 ? 'Semua kewajiban pajak lunas' : `${c} pajak belum disetor — jangan lupa bayar`); })(),
      ],
    });

    // ── INVENTORY ──
    domains.push({
      domain: 'Inventory & Gudang', icon: '📦', checks: [
        (() => { const c = cnt(`SELECT COUNT(*) c FROM audit_warehouse WHERE stock<=reorder_point`);
          return C('Stok di bawah reorder point', c === 0 ? 'ok' : 'warning', c === 0 ? 'Semua stok aman' : `${c} item perlu reorder`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM stock_batches WHERE discarded=0 AND expiry_at<${now}`);
          return C('Batch kedaluwarsa', c === 0 ? 'ok' : 'critical', c === 0 ? 'Tidak ada batch expired' : `${c} batch sudah kedaluwarsa`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM stock_opname WHERE status='in_progress'`);
          return C('Stock opname berjalan', 'ok', `${c} sesi opname aktif`); })(),
      ],
    });

    // ── PROCUREMENT ──
    domains.push({
      domain: 'Procurement & Receiving', icon: '🚚', checks: [
        (() => { const c = cnt(`SELECT COUNT(*) c FROM goods_received WHERE status='pending' AND created_at<${now - 3 * DAY}`);
          return C('Outlet lupa konfirmasi GR', c === 0 ? 'ok' : 'critical', c === 0 ? 'Semua GR ter-konfirmasi tepat waktu' : `${c} GR pending ≥3 hari`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM goods_received WHERE status='pending'`);
          return C('Good Received menunggu', c === 0 ? 'ok' : 'warning', `${c} GR menunggu konfirmasi`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM purchase_return_docs WHERE status='draft'`);
          return C('Purchase Return draft', c === 0 ? 'ok' : 'warning', `${c} retur supplier belum diproses`); })(),
      ],
    });

    // ── SALES B2B ──
    domains.push({
      domain: 'Sales & B2B', icon: '📑', checks: [
        (() => { const c = cnt(`SELECT COUNT(*) c FROM quotations WHERE status IN ('draft','sent') AND valid_until<${now}`);
          return C('Quotation kedaluwarsa', c === 0 ? 'ok' : 'warning', c === 0 ? 'Semua quotation valid' : `${c} quotation lewat masa berlaku`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM sales_orders WHERE status!='invoiced'`);
          return C('Sales Order belum tuntas', 'ok', `${c} SO masih berjalan`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM sales_returns WHERE status='draft'`);
          return C('Sales Return draft', c === 0 ? 'ok' : 'warning', `${c} retur penjualan belum diproses`); })(),
      ],
    });

    // ── OPERATIONS ──
    domains.push({
      domain: 'Operations & Outlet', icon: '🛰️', checks: [
        (() => { const c = cnt(`SELECT COUNT(*) c FROM incidents WHERE severity='critical' AND status!='resolved'`);
          return C('Insiden kritis aktif', c === 0 ? 'ok' : 'critical', c === 0 ? 'Tidak ada insiden kritis' : `${c} insiden kritis belum selesai`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM assets WHERE status='broken' OR next_service<${now}`);
          return C('Aset rusak / telat service', c === 0 ? 'ok' : 'warning', c === 0 ? 'Semua aset terawat' : `${c} aset perlu perhatian`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM period_closings WHERE status='open'`);
          return C('Periode belum ditutup', 'ok', `${c} periode masih terbuka`); })(),
      ],
    });

    // ── DATA INTEGRITY ──
    domains.push({
      domain: 'Data Integrity', icon: '🧬', checks: [
        (() => { const c = cnt(`SELECT COUNT(*) c FROM orders WHERE kasir='HookTest' OR items LIKE '%Test %'`);
          return C('Test order di data produksi', c === 0 ? 'ok' : 'critical', c === 0 ? 'Data order bersih' : `${c} test order ditemukan`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM goods_deliveries WHERE status='received'`);
          return C('Good Delivery belum ditutup', 'ok', `${c} GD diterima belum di-close`); })(),
        (() => { const c = cnt(`SELECT COUNT(*) c FROM internal_returns`);
          return C('Internal Return tercatat', 'ok', `${c} retur internal terdata`); })(),
      ],
    });

    // skor per domain + global
    let warn = 0, crit = 0, total = 0;
    for (const d of domains) {
      let dw = 0, dc = 0;
      for (const ch of d.checks) { total++; if (ch.status === 'warning') { warn++; dw++; } else if (ch.status === 'critical') { crit++; dc++; } }
      d.status = dc > 0 ? 'critical' : dw > 0 ? 'warning' : 'ok';
      d.score = Math.max(0, 100 - dw * 18 - dc * 40);
    }
    const score = Math.max(0, 100 - warn * 4 - crit * 11);
    const issues = domains.flatMap(d => d.checks.filter(c => c.status !== 'ok').map(c => ({ domain: d.domain, ...c })))
      .sort((a, b) => (a.status === 'critical' ? 0 : 1) - (b.status === 'critical' ? 0 : 1));
    return {
      health_score: score,
      grade: score >= 90 ? 'A — Sehat' : score >= 75 ? 'B — Baik' : score >= 60 ? 'C — Perlu Perhatian' : 'D — Kritis',
      domains, issues,
      summary: { total_checks: total, passed: total - warn - crit, warning: warn, critical: crit, audited_at: now },
    };
  };

  const router = express.Router();
  router.get('/', (req, res) => res.json(runAudit()));

  const mountPath = opts.mountPath || '/api/self-audit';
  app.use(mountPath, router);
  console.log(`[self-audit] mounted at ${mountPath} — system self-audit`);

  return { router, db };
}

module.exports = { setupSelfAudit };
