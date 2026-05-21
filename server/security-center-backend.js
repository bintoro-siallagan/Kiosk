// server/security-center-backend.js
// Audit Trail + Smart Security Layer — log aktivitas (login, approval,
// refund, void, payroll) + deteksi anomali keamanan.
//
//   GET /api/security-center

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const normSec = (t) => (t > 1e12 ? Math.floor(t / 1000) : (t || 0));
const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const nowSec = () => Math.floor(Date.now() / 1000);

function setupSecurityCenter(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const now = nowSec();
    const events = [];
    const E = (time, type, icon, actor, detail) => events.push({ time: normSec(time), type, icon, actor: actor || '—', detail });

    // ── Audit trail — merge dari berbagai sumber ──
    for (const s of many(`SELECT user_name, user_role, device_name, location, login_at FROM login_sessions ORDER BY login_at DESC LIMIT 10`))
      E(s.login_at, 'login', '🔑', s.user_name, `Login ${s.user_role} — ${s.device_name} · ${s.location}`);
    for (const a of many(`SELECT category, amount, status, decided_by, decided_at FROM approval_requests WHERE decided_at IS NOT NULL`))
      E(a.decided_at, 'approval', '⚖️', a.decided_by, `${a.status === 'approved' ? 'Approve' : 'Reject'} ${a.category} ${fmtRp(a.amount)}`);
    for (const o of many(`SELECT id, refunded_amount, refunded_by, refunded_at FROM orders WHERE refunded_at IS NOT NULL ORDER BY refunded_at DESC LIMIT 8`))
      E(o.refunded_at, 'refund', '↩️', o.refunded_by, `Refund order ${o.id} — ${fmtRp(o.refunded_amount)}`);
    for (const o of many(`SELECT id, cancelled_by, cancelled_at FROM orders WHERE cancelled_at IS NOT NULL ORDER BY cancelled_at DESC LIMIT 8`))
      E(o.cancelled_at, 'void', '🚫', o.cancelled_by, `Void / cancel order ${o.id}`);
    for (const p of many(`SELECT period, total_cost, processed_by, processed_at FROM payroll_runs`))
      E(p.processed_at, 'payroll', '💰', p.processed_by, `Payroll ${p.period} diproses — ${fmtRp(p.total_cost)}`);

    const audit_trail = events.sort((a, b) => b.time - a.time).slice(0, 20);

    // ── Smart Security Layer — deteksi anomali ──
    const threats = [];
    const T = (severity, icon, category, title, detail) => threats.push({ severity, icon, category, title, detail });

    const suspLogins = many(`SELECT user_name, location, suspicious_reason FROM login_sessions WHERE status = 'active' AND suspicious = 1`);
    for (const s of suspLogins)
      T('critical', '🔓', 'Suspicious Login', `Login mencurigakan — ${s.user_name}`, `${s.suspicious_reason} (${s.location}).`);

    const unauthActive = many(`SELECT DISTINCT s.device_name FROM login_sessions s
      JOIN device_registry d ON d.name = s.device_name
      WHERE s.status = 'active' AND d.authorized = 0`);
    if (unauthActive.length)
      T('warning', '📟', 'Unauthorized Device', `${unauthActive.length} device tak terotorisasi aktif`,
        `Device ${unauthActive.map(x => x.device_name).join(', ')} dipakai tanpa otorisasi.`);

    const orders = many(`SELECT id, time, cancelled_at, refunded_amount, refunded_at FROM orders`);
    let fastVoid = 0, bigRefund = 0;
    for (const o of orders) {
      if (o.cancelled_at) { const g = normSec(o.cancelled_at) - normSec(o.time); if (g >= 0 && g <= 180) fastVoid++; }
      if (o.refunded_at && normSec(o.refunded_at) > now - 7 * 86400 && (o.refunded_amount || 0) >= 100000) bigRefund++;
    }
    if (fastVoid >= 3)
      T('warning', '⚡', 'Transaction Anomaly', `${fastVoid} transaksi di-void <3 menit`, 'Pola void cepat — indikasi transaksi tidak wajar.');
    if (bigRefund >= 3)
      T('warning', '↩️', 'Unusual Refund', `${bigRefund} refund nominal besar (7 hari)`, 'Refund nilai tinggi berulang — verifikasi keabsahan.');

    const sev = (x) => threats.filter(t => t.severity === x).length;
    res.json({
      audit_trail,
      threats,
      summary: {
        audit_events: audit_trail.length,
        threats: threats.length,
        critical: sev('critical'),
        warning: sev('warning'),
        secure: threats.length === 0,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/security-center';
  app.use(mountPath, router);
  console.log(`[security-center] mounted at ${mountPath} — audit trail & security layer`);

  return { router, db };
}

module.exports = { setupSecurityCenter };
