// server/user-kpi-backend.js
// karyaOS — Unified User KPI
// Setiap admin_user (kasir, kru, manager, dept staff) di-track KPI dari
// semua aktivitas mereka di sistem:
// - Service Visit ticket completion (Karya Field Service)
// - Daily Audit submissions (KROC)
// - KOLR Launch task completion + signoff
// - Cashier customer ratings (existing cinema_cashier_ratings)
// - Order/sales (POS orders)
//
// Output: per-user score card + ranking + heatmap.
//
// Endpoints at /api/user-kpi:
//   GET    /users               — list all users dengan total KPI score
//   GET    /users/:id           — detail KPI per user (breakdown)
//   GET    /leaderboard         — ranked top performer + bottom alert
//   GET    /by-role             — aggregate per role (kasir/manager/dept)
//   GET    /by-outlet           — aggregate per outlet

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const nowSec = () => Math.floor(Date.now() / 1000);

function safe(fn, fallback = 0) { try { return fn(); } catch { return fallback; } }

function setupUserKpi(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');

  function loadUsers() {
    try {
      return db.prepare(`SELECT id, name, role, active, last_login_at FROM admin_users WHERE active=1`).all();
    } catch { return []; }
  }

  function userKpi(user, sinceSec) {
    const k = { user_id: user.id, name: user.name, role: user.role, last_login_at: user.last_login_at };

    // 1. Cashier ratings (cinema_cashier_ratings — sudah ada)
    k.cashier = safe(() => {
      const r = db.prepare(`SELECT AVG(rating) avg, COUNT(*) cnt, SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) five, SUM(CASE WHEN rating<=2 THEN 1 ELSE 0 END) low FROM cinema_cashier_ratings WHERE LOWER(cashier_name)=LOWER(?) AND created_at>=?`).get(user.name, sinceSec);
      return { avg_rating: r?.avg || null, total_ratings: r?.cnt || 0, five_star: r?.five || 0, low_star: r?.low || 0 };
    }, {});

    // 2. Service Visit tickets (assigned_to_name)
    k.service = safe(() => {
      const totalCreated = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE LOWER(assigned_to_name)=LOWER(?) AND created_at>=?`).get(user.name, sinceSec).c;
      const completed = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE LOWER(assigned_to_name)=LOWER(?) AND status='completed' AND created_at>=?`).get(user.name, sinceSec).c;
      const inProgress = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE LOWER(assigned_to_name)=LOWER(?) AND status='in_progress' AND created_at>=?`).get(user.name, sinceSec).c;
      const onTime = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE LOWER(assigned_to_name)=LOWER(?) AND on_time=1 AND created_at>=?`).get(user.name, sinceSec).c;
      const late = db.prepare(`SELECT COUNT(*) c FROM service_tickets WHERE LOWER(assigned_to_name)=LOWER(?) AND on_time=0 AND created_at>=?`).get(user.name, sinceSec).c;
      const avgDur = db.prepare(`SELECT AVG(finished_at - started_at) v FROM service_tickets WHERE LOWER(assigned_to_name)=LOWER(?) AND finished_at IS NOT NULL AND started_at IS NOT NULL AND created_at>=?`).get(user.name, sinceSec)?.v;
      return {
        total: totalCreated, completed, in_progress: inProgress, on_time: onTime, late,
        completion_pct: totalCreated > 0 ? Math.round(completed / totalCreated * 100) : 0,
        on_time_pct: (onTime + late) > 0 ? Math.round(onTime / (onTime + late) * 100) : null,
        avg_duration_min: avgDur ? Math.round(avgDur / 60) : null,
      };
    }, {});

    // 3. Daily Audit submissions (manager_name)
    k.audit = safe(() => {
      const subs = db.prepare(`SELECT COUNT(*) c, AVG(overall_score) avg FROM outlet_audits WHERE LOWER(manager_name)=LOWER(?) AND submitted_at>=?`).get(user.name, sinceSec);
      const violations = db.prepare(`SELECT COUNT(*) c FROM outlet_anomalies WHERE anomaly_type IN ('geofence_violation','pin_new_device') AND message LIKE ? AND detected_at>=?`).get(`%${user.name}%`, sinceSec).c;
      return { submissions: subs?.c || 0, avg_score: subs?.avg || null, violations };
    }, {});

    // 4. KOLR launch signoffs (signed_by_name)
    k.launch = safe(() => {
      const signoffs = db.prepare(`SELECT COUNT(*) c FROM launch_signoffs WHERE LOWER(signed_by_name)=LOWER(?) AND signed_at>=?`).get(user.name, sinceSec).c;
      return { signoffs };
    }, {});

    // 5. POS orders (kasir field di orders table)
    k.pos = safe(() => {
      const orders = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) sum FROM orders WHERE LOWER(kasir)=LOWER(?) AND created_at>=?`).get(user.name, sinceSec);
      return { orders: orders?.c || 0, total_revenue: orders?.sum || 0 };
    }, {});

    // Composite score (weighted)
    let score = 50; // baseline
    if (k.cashier.total_ratings > 0) score += Math.round((k.cashier.avg_rating - 3) * 10);
    if (k.service.completion_pct > 0) score += Math.round((k.service.completion_pct - 50) * 0.2);
    if (k.service.on_time_pct != null) score += Math.round((k.service.on_time_pct - 50) * 0.2);
    if (k.audit.submissions > 0) score += Math.min(10, k.audit.submissions * 2);
    if (k.audit.violations > 0) score -= k.audit.violations * 5;
    if (k.launch.signoffs > 0) score += Math.min(15, k.launch.signoffs * 3);
    if (k.pos.orders > 0) score += Math.min(10, Math.floor(k.pos.orders / 50));
    k.score = Math.max(0, Math.min(100, score));
    k.grade = k.score >= 90 ? 'A' : k.score >= 75 ? 'B' : k.score >= 60 ? 'C' : 'D';

    // Activity (any data point)
    k.active = k.cashier.total_ratings + k.service.total + k.audit.submissions + k.launch.signoffs + k.pos.orders > 0;

    return k;
  }

  const router = express.Router();

  router.get('/users', (req, res) => {
    const days = parseInt(req.query.days || '30', 10);
    const sinceSec = nowSec() - days * 86400;
    const users = loadUsers();
    const result = users.map(u => userKpi(u, sinceSec)).sort((a, b) => b.score - a.score);
    res.json({ data: result, period_days: days });
  });

  router.get('/users/:id', (req, res) => {
    const days = parseInt(req.query.days || '30', 10);
    const sinceSec = nowSec() - days * 86400;
    const u = db.prepare(`SELECT id, name, role, active, last_login_at FROM admin_users WHERE id=?`).get(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(userKpi(u, sinceSec));
  });

  router.get('/leaderboard', (req, res) => {
    const days = parseInt(req.query.days || '30', 10);
    const sinceSec = nowSec() - days * 86400;
    const users = loadUsers().map(u => userKpi(u, sinceSec));
    const active = users.filter(u => u.active);
    const sorted = active.sort((a, b) => b.score - a.score);
    res.json({
      top: sorted.slice(0, 10),
      bottom: sorted.filter(u => u.score < 60).slice(-5),
      stats: {
        total_users: users.length,
        active_users: active.length,
        avg_score: active.length ? Math.round(active.reduce((s, u) => s + u.score, 0) / active.length) : 0,
        low_performers: active.filter(u => u.score < 60).length,
      },
    });
  });

  router.get('/by-role', (req, res) => {
    const days = parseInt(req.query.days || '30', 10);
    const sinceSec = nowSec() - days * 86400;
    const users = loadUsers().map(u => userKpi(u, sinceSec));
    const byRole = {};
    for (const u of users) {
      if (!byRole[u.role]) byRole[u.role] = { role: u.role, count: 0, score_sum: 0, active: 0 };
      byRole[u.role].count++;
      byRole[u.role].score_sum += u.score;
      if (u.active) byRole[u.role].active++;
    }
    res.json({
      data: Object.values(byRole).map(r => ({ ...r, avg_score: r.count ? Math.round(r.score_sum / r.count) : 0, score_sum: undefined })),
    });
  });

  app.use(opts.mountPath || '/api/user-kpi', router);
  console.log(`[user-kpi] mounted at ${opts.mountPath || '/api/user-kpi'} — unified KPI all users`);

  return { router, db };
}

module.exports = { setupUserKpi };
