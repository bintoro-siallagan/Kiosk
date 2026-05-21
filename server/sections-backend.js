// server/sections-backend.js
// Command Center Core Indicator sections:
//   GET /api/section/customer   — Customer Experience (HERO feature)
//   GET /api/section/operation  — Operation Health (pembeda karyaOS)

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function dayStartTs(offsetDays = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000) + offsetDays * 86400;
}

function setupSections(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const one = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  // ═══ CUSTOMER EXPERIENCE ═══
  router.get('/customer', (req, res) => {
    const fb = one(`SELECT COALESCE(AVG(rating),0) avg, COUNT(*) c,
      SUM(CASE WHEN rating<=2 THEN 1 ELSE 0 END) bad,
      SUM(CASE WHEN rating>=4 THEN 1 ELSE 0 END) good FROM customer_feedback`) || { avg: 0, c: 0, bad: 0, good: 0 };

    const bySource = many(`SELECT source, COUNT(*) count, COALESCE(AVG(rating),0) avg,
      SUM(CASE WHEN rating<=2 THEN 1 ELSE 0 END) bad FROM customer_feedback GROUP BY source`)
      .map(r => ({ ...r, avg: Math.round(r.avg * 100) / 100 }));

    const cust = one(`SELECT COUNT(*) total, SUM(CASE WHEN total_visits>=2 THEN 1 ELSE 0 END) repeat,
      COALESCE(SUM(current_points),0) points FROM loyalty_customers WHERE is_active=1`) || { total: 0, repeat: 0, points: 0 };
    const redemptions = (one(`SELECT COUNT(*) c FROM loyalty_transactions WHERE type='redeem'`) || { c: 0 }).c;

    // 7-hari feedback trend
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const s = dayStartTs(-i), e = dayStartTs(-i + 1);
      const r = one(`SELECT COALESCE(AVG(rating),0) avg, COUNT(*) c FROM customer_feedback WHERE created_at>=? AND created_at<?`, s, e) || { avg: 0, c: 0 };
      trend.push({ day: new Date(s * 1000).toLocaleDateString('id-ID', { weekday: 'short' }), avg: Math.round(r.avg * 100) / 100, count: r.c });
    }

    const leaderboard = many(`SELECT cashier, COUNT(*) count, COALESCE(AVG(rating),0) avg,
      SUM(CASE WHEN rating<=2 THEN 1 ELSE 0 END) bad FROM customer_feedback
      WHERE cashier IS NOT NULL AND cashier!='' GROUP BY cashier ORDER BY avg DESC LIMIT 6`)
      .map(r => ({ ...r, avg: Math.round(r.avg * 100) / 100 }));

    res.json({
      satisfaction: { avg: Math.round(fb.avg * 100) / 100, total: fb.c, good: fb.good },
      complaints: fb.bad,
      by_source: bySource,
      repeat_customer: { count: cust.repeat || 0, total: cust.total || 0,
        pct: cust.total ? Math.round((cust.repeat || 0) / cust.total * 100) : 0 },
      loyalty: { members: cust.total || 0, points_outstanding: cust.points || 0, redemptions },
      feedback_trend: trend,
      leaderboard,
    });
  });

  // ═══ OPERATION HEALTH ═══
  router.get('/operation', (req, res) => {
    const today = dayStartTs(0);
    const opening = one(`SELECT staff_name, created_at, target, mood FROM checklist_submissions
      WHERE type='opening' AND created_at>=? ORDER BY id DESC LIMIT 1`, today);
    const closing = one(`SELECT staff_name, created_at FROM checklist_submissions
      WHERE type='closing' AND created_at>=? ORDER BY id DESC LIMIT 1`, today);

    const items = one(`SELECT
      SUM(CASE WHEN type='opening' THEN 1 ELSE 0 END) opening,
      SUM(CASE WHEN type='closing' THEN 1 ELSE 0 END) closing
      FROM checklist_items WHERE is_active=1`) || { opening: 0, closing: 0 };

    const anom = one(`SELECT COUNT(*) total,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) crit FROM audit_anomalies WHERE resolved=0`) || { total: 0, crit: 0 };

    // SOP compliance — opening + closing checklist
    const sop = (opening ? 50 : 0) + (closing ? 50 : 0);

    const recent = many(`SELECT type, staff_name, created_at FROM checklist_submissions ORDER BY created_at DESC LIMIT 6`);

    // POS behavior — kasir main-main tombol
    const flagged = (one(`SELECT COUNT(*) c FROM (
      SELECT cashier FROM pos_behavior_events WHERE created_at>=? AND cashier IS NOT NULL
      GROUP BY cashier HAVING COUNT(*)>=15)`, today) || { c: 0 }).c;

    res.json({
      opening: { done: !!opening, by: opening?.staff_name || null, at: opening?.created_at || null,
        target: opening?.target || null, mood: opening?.mood || null },
      closing: { done: !!closing, by: closing?.staff_name || null, at: closing?.created_at || null },
      sop_compliance: sop,
      checklist_items: { opening: items.opening || 0, closing: items.closing || 0 },
      outlet_issues: { open: anom.total || 0, critical: anom.crit || 0 },
      cashier_focus: { flagged },
      recent,
      // Device monitoring — modul belum ada (printer/POS device offline detection)
      device_monitoring: { active: false },
    });
  });

  const mountPath = opts.mountPath || '/api/section';
  app.use(mountPath, router);
  console.log(`[sections] mounted at ${mountPath} — customer + operation`);

  return { router, db };
}

module.exports = { setupSections };
