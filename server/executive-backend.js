// server/executive-backend.js
// Executive Dashboard (Level 1) — Command Center landing page.
// "Owner buka 10 detik langsung ngerti."
//
//   GET /api/executive  →  { health, summary, timeline }
//
// health   — Outlet Health Score (composite 0-100 → 🟢/🟡/🔴) + 6 komponen
// summary  — angka bisnis inti (revenue, growth, target, issues, ...)
// timeline — realtime incident feed (anomali + checklist), terbaru di atas

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function dayStartTs(offsetDays = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000) + offsetDays * 86400;
}
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const statusOf = (s) => (s >= 80 ? 'good' : s >= 60 ? 'warn' : 'bad');

// Bobot komponen health score (total = 1.0)
const WEIGHT = { sop: 0.15, sales: 0.25, feedback: 0.20, stock: 0.15, issue: 0.15, staff: 0.10 };

function setupExecutive(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  const one = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch { return null; } };
  const many = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const today = dayStartTs(0);
    const yStart = dayStartTs(-1);

    // ═══ SUMMARY ═══
    const rev = one(`SELECT COALESCE(SUM(amount_applied),0) v, COUNT(*) c FROM pos_payments WHERE status='completed' AND created_at>=?`, today) || { v: 0, c: 0 };
    const revY = one(`SELECT COALESCE(SUM(amount_applied),0) v FROM pos_payments WHERE status='completed' AND created_at>=? AND created_at<?`, yStart, today) || { v: 0 };
    const revenue = rev.v, transactions = rev.c;
    const growthPct = revY.v > 0 ? Math.round((revenue - revY.v) / revY.v * 100) : null;
    const target = (one(`SELECT target FROM checklist_submissions WHERE type='opening' AND target IS NOT NULL AND created_at>=? ORDER BY id DESC LIMIT 1`, today) || {}).target || null;
    const targetPct = target ? Math.round(revenue / target * 100) : null;
    const openIssues = (one(`SELECT COUNT(*) c FROM audit_anomalies WHERE resolved=0`) || { c: 0 }).c;
    const critIssues = (one(`SELECT COUNT(*) c FROM audit_anomalies WHERE resolved=0 AND severity='critical'`) || { c: 0 }).c;
    const aggToday = (one(`SELECT COUNT(*) c FROM aggregator_orders WHERE received_at>=?`, today) || { c: 0 }).c;
    const totalCh = transactions + aggToday;

    const summary = {
      revenue, growth_pct: growthPct,
      target, target_pct: targetPct,
      transactions, avg_trx: transactions ? Math.round(revenue / transactions) : 0,
      open_issues: openIssues, critical_issues: critIssues,
      online_pct: totalCh ? Math.round(aggToday / totalCh * 100) : 0,
      offline_pct: totalCh ? Math.round(transactions / totalCh * 100) : 100,
    };

    // ═══ HEALTH SCORE ═══
    const openingDone = !!one(`SELECT id FROM checklist_submissions WHERE type='opening' AND created_at>=?`, today);
    const sop = openingDone ? 100 : 40;

    const sales = targetPct != null ? clamp(targetPct) : (revenue > 0 ? 70 : 40);

    let fb = one(`SELECT COALESCE(AVG(rating),0) a, COUNT(*) c FROM customer_feedback WHERE created_at>=?`, today);
    if (!fb || fb.c === 0) fb = one(`SELECT COALESCE(AVG(rating),0) a, COUNT(*) c FROM customer_feedback`) || { a: 0, c: 0 };
    const feedback = fb.c > 0 ? clamp(fb.a / 5 * 100) : 75;

    const wh = one(`SELECT
      SUM(CASE WHEN stock<=0 OR stock<=min_stock*0.4 THEN 1 ELSE 0 END) crit,
      SUM(CASE WHEN stock<=min_stock THEN 1 ELSE 0 END) low,
      COUNT(*) total FROM audit_warehouse`) || { crit: 0, low: 0, total: 0 };
    const stock = wh.total ? clamp(100 - (wh.crit || 0) * 12 - (wh.low || 0) * 4) : 80;

    const sev = {};
    many(`SELECT severity, COUNT(*) c FROM audit_anomalies WHERE resolved=0 GROUP BY severity`).forEach(r => { sev[r.severity] = r.c; });
    const issue = clamp(100 - (sev.critical || 0) * 7 - (sev.high || 0) * 4 - (sev.medium || 0) * 2 - (sev.low || 0) * 1);

    const flagged = (one(`SELECT COUNT(*) c FROM (
      SELECT cashier FROM pos_behavior_events WHERE created_at>=? AND cashier IS NOT NULL
      GROUP BY cashier HAVING COUNT(*)>=15)`, today) || { c: 0 }).c;
    const staff = clamp(100 - flagged * 20);

    const components = [
      { key: 'sop', label: 'SOP', score: sop },
      { key: 'sales', label: 'Sales', score: sales },
      { key: 'feedback', label: 'Feedback', score: feedback },
      { key: 'stock', label: 'Stock', score: stock },
      { key: 'issue', label: 'Issue', score: issue },
      { key: 'staff', label: 'Staff', score: staff },
    ].map(c => ({ ...c, status: statusOf(c.score) }));

    const total = clamp(components.reduce((s, c) => s + c.score * WEIGHT[c.key], 0));
    const health = {
      score: total,
      status: total >= 80 ? 'healthy' : total >= 60 ? 'attention' : 'critical',
      components,
    };

    // ═══ INCIDENT TIMELINE ═══
    const tl = [];
    many(`SELECT type, severity, detail, created_at FROM audit_anomalies WHERE resolved=0 ORDER BY created_at DESC LIMIT 20`).forEach(a => {
      const ts = Math.floor(new Date(String(a.created_at).replace(' ', 'T')).getTime() / 1000) || today;
      tl.push({ ts, kind: 'anomaly', anomaly_type: a.type, severity: a.severity, text: a.detail });
    });
    many(`SELECT type, staff_name, created_at FROM checklist_submissions WHERE created_at>=? ORDER BY created_at DESC`, today).forEach(c => {
      tl.push({
        ts: c.created_at, kind: 'checklist', severity: 'info',
        text: (c.type === 'opening' ? 'Opening checklist selesai' : 'Closing checklist selesai') + (c.staff_name ? ` — ${c.staff_name}` : ''),
      });
    });
    tl.sort((a, b) => b.ts - a.ts);
    const timeline = tl.slice(0, 14).map(e => ({
      ...e,
      time: new Date(e.ts * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    }));

    res.json({ health, summary, timeline, generated_at: Date.now() });
  });

  const mountPath = opts.mountPath || '/api/executive';
  app.use(mountPath, router);
  console.log(`[executive] mounted at ${mountPath} — health score + incident timeline`);

  return { router, db };
}

module.exports = { setupExecutive };
