// server/owner-dashboard-extras.js
// Owner Dashboard — extras aggregator endpoint. 1-call to fetch:
//   • cinema_performance — tickets/F&B/event today + period
//   • reservation_today  — count + status breakdown
//   • delivery_status    — drivers online/on-delivery + deliveries pending
//   • active_promotions  — happy hour + cinema campaigns + recent birthday
//   • outlet_health      — per-outlet snapshot
//   • today_comparison   — revenue today vs yesterday / last-week
//   • alerts_feed        — combined alert sources (anomaly, incident, low-stock)
//
// Mount: const { setupOwnerDashboardExtras } = require('./owner-dashboard-extras');
//        setupOwnerDashboardExtras(app, { dbPath });

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

function setupOwnerDashboardExtras(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
  const one  = (s, ...p) => { try { return db.prepare(s).get(...p); } catch { return null; } };

  const router = express.Router();

  router.get('/extras', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const dayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const yesterdayStart = dayStart - 86400;
    const lastWeekStart = dayStart - 7 * 86400;

    // ── 1. CINEMA PERFORMANCE (today) ──
    const cinema = {
      tickets_today:    (one(`SELECT COUNT(*) c, COALESCE(SUM(price),0) g FROM cinema_tickets WHERE sold_at BETWEEN ? AND ?`, dayStart, now) || { c: 0, g: 0 }),
      bundles_today:    (one(`SELECT COUNT(*) c, COALESCE(SUM(qty*price),0) g FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`, dayStart, now) || { c: 0, g: 0 }),
      in_studio_today:  (one(`SELECT COUNT(*) c, COALESCE(SUM(total),0) g FROM cinema_in_studio_orders WHERE created_at BETWEEN ? AND ?`, dayStart, now) || { c: 0, g: 0 }),
      events_today:     (one(`SELECT COUNT(*) c, COALESCE(SUM(total_price),0) g FROM cinema_studio_bookings WHERE status IN ('confirmed','completed','seated') AND (date(created_at,'unixepoch','localtime') = date('now','localtime') OR date(event_date) = date('now','localtime'))`) || { c: 0, g: 0 }),
      top_film: one(`
        SELECT f.title, COUNT(t.id) c, COALESCE(SUM(t.price),0) g
        FROM cinema_tickets t
        JOIN cinema_showtimes s ON s.id = t.showtime_id
        JOIN cinema_films f ON f.id = s.film_id
        WHERE t.sold_at BETWEEN ? AND ?
        GROUP BY f.id ORDER BY g DESC LIMIT 1`, dayStart, now),
      occupancy: one(`
        SELECT
          COALESCE(SUM((SELECT COUNT(*) FROM cinema_tickets WHERE showtime_id = s.id)),0) sold,
          COALESCE(SUM(st.rows * st.cols),0) capacity
        FROM cinema_showtimes s JOIN cinema_studios st ON st.id = s.studio_id
        WHERE s.show_date = date('now','localtime')`),
      attach_rate_today: (() => {
        const total = one(`SELECT COUNT(DISTINCT t.purchase_id) c FROM cinema_tickets t WHERE t.sold_at BETWEEN ? AND ? AND t.purchase_id IS NOT NULL`, dayStart, now)?.c || 0;
        const withB = one(`SELECT COUNT(DISTINCT purchase_id) c FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`, dayStart, now)?.c || 0;
        return total ? Math.round((withB / total) * 1000) / 10 : 0;
      })(),
    };
    cinema.total_revenue_today = (cinema.tickets_today.g || 0) + (cinema.bundles_today.g || 0) + (cinema.in_studio_today.g || 0) + (cinema.events_today.g || 0);
    cinema.occupancy_pct = cinema.occupancy?.capacity ? Math.round((cinema.occupancy.sold || 0) / cinema.occupancy.capacity * 100) : 0;

    // ── 2. RESERVATION TODAY ──
    const today = new Date().toISOString().slice(0, 10);
    const reservation = {
      today: many(`SELECT * FROM fnb_reservations WHERE reservation_date = ? ORDER BY reservation_time`, today),
    };
    reservation.summary = reservation.today.reduce((a, r) => {
      a.total++;
      a[r.status] = (a[r.status] || 0) + 1;
      a.party_size += (r.party_size || 0);
      return a;
    }, { total: 0, party_size: 0 });

    // ── 3. DELIVERY STATUS ──
    const delivery = {
      drivers: many(`SELECT id, name, status, last_ping_at, last_lat, last_lng FROM fnb_drivers WHERE is_active = 1`),
      deliveries_today: many(`SELECT status, COUNT(*) c FROM fnb_deliveries WHERE date(created_at,'unixepoch','localtime') = date('now','localtime') GROUP BY status`),
      avg_time_minutes: one(`
        SELECT ROUND(AVG((delivered_at - created_at) / 60.0), 1) avg
        FROM fnb_deliveries
        WHERE status='delivered' AND delivered_at IS NOT NULL
          AND date(created_at,'unixepoch','localtime') = date('now','localtime')`)?.avg || 0,
    };
    delivery.online = delivery.drivers.filter(d => d.last_ping_at && (now - d.last_ping_at) < 120).length;
    delivery.on_delivery = delivery.drivers.filter(d => d.status === 'on_delivery').length;
    delivery.available = delivery.drivers.filter(d => d.status === 'available').length;
    delivery.by_status = delivery.deliveries_today.reduce((a, r) => ({ ...a, [r.status]: r.c }), {});

    // ── 4. ACTIVE PROMOTIONS ──
    const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
    const hhmm = `${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`;
    const promotions = {
      happy_hours: many(`SELECT * FROM fnb_happy_hour_prices WHERE is_active = 1 AND start_time <= ? AND ? <= end_time`, hhmm, hhmm)
        .filter(r => !r.applicable_days || r.applicable_days.toLowerCase().split(',').map(s => s.trim()).includes(dayName)),
      birthday_campaigns: many(`SELECT * FROM fnb_birthday_campaigns WHERE is_active = 1 ORDER BY id DESC LIMIT 5`),
      birthday_redemptions_today: one(`SELECT COUNT(*) c FROM fnb_birthday_redemptions WHERE date(redeemed_at,'unixepoch','localtime') = date('now','localtime')`)?.c || 0,
      cinema_campaigns: many(`SELECT * FROM cinema_campaigns WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5`),
      referrals_pending: one(`SELECT COUNT(*) c FROM fnb_referrals WHERE status IN ('pending','registered','first_order')`)?.c || 0,
    };

    // ── 5. OUTLET HEALTH ──
    let outlet_health = [];
    try {
      const outlets = many(`SELECT * FROM cinema_studios`).reduce((a, s) => {
        if (s.outlet && !a.find(x => x === s.outlet)) a.push(s.outlet);
        return a;
      }, []);
      // F&B side — fall back from existing outlet_master if available
      try {
        const fnbOutlets = many(`SELECT name FROM outlet_master WHERE is_active = 1`);
        for (const o of fnbOutlets) if (!outlets.includes(o.name)) outlets.push(o.name);
      } catch {}
      for (const o of outlets) {
        const cinemaRev = one(`
          SELECT COALESCE(SUM(t.price),0) g, COUNT(*) c
          FROM cinema_tickets t
          JOIN cinema_showtimes s ON s.id = t.showtime_id
          JOIN cinema_studios st ON st.id = s.studio_id
          WHERE st.outlet = ? AND t.sold_at BETWEEN ? AND ?`, o, dayStart, now);
        const issues = one(`SELECT COUNT(*) c FROM cinema_studios WHERE outlet = ? AND maintenance_status NOT IN ('operational','')`, o)?.c || 0;
        outlet_health.push({
          outlet: o, cinema_rev: cinemaRev?.g || 0, cinema_tickets: cinemaRev?.c || 0,
          studio_issues: issues,
        });
      }
    } catch {}
    outlet_health.sort((a, b) => b.cinema_rev - a.cinema_rev);

    // ── 6. TODAY'S COMPARISON ──
    const calcRev = (from, to) => {
      const pos = one(`SELECT COALESCE(SUM(amount_applied),0) g FROM pos_payments WHERE status='completed' AND created_at BETWEEN ? AND ?`, from, to)?.g || 0;
      const tk  = one(`SELECT COALESCE(SUM(price),0) g FROM cinema_tickets WHERE sold_at BETWEEN ? AND ?`, from, to)?.g || 0;
      const bd  = one(`SELECT COALESCE(SUM(qty*price),0) g FROM cinema_purchase_bundles WHERE created_at BETWEEN ? AND ?`, from, to)?.g || 0;
      const isq = one(`SELECT COALESCE(SUM(total),0) g FROM cinema_in_studio_orders WHERE status='delivered' AND created_at BETWEEN ? AND ?`, from, to)?.g || 0;
      return pos + tk + bd + isq;
    };
    const comparison = {
      today: calcRev(dayStart, now),
      yesterday_same_time: calcRev(yesterdayStart, yesterdayStart + (now - dayStart)),
      last_week_same_time: calcRev(lastWeekStart, lastWeekStart + (now - dayStart)),
      yesterday_full: calcRev(yesterdayStart, dayStart - 1),
      target_today: 5000000, // placeholder — bisa di-config
    };
    comparison.vs_yesterday_pct = comparison.yesterday_same_time > 0 ? Math.round((comparison.today / comparison.yesterday_same_time - 1) * 100) : 0;
    comparison.vs_last_week_pct = comparison.last_week_same_time > 0 ? Math.round((comparison.today / comparison.last_week_same_time - 1) * 100) : 0;
    comparison.target_pct = Math.round(comparison.today / comparison.target_today * 100);

    // ── 7. ALERTS FEED ──
    const alerts = [];
    // Cash variance recent
    try {
      const cv = many(`SELECT staff_name, cash_variance, created_at FROM pos_shifts WHERE cash_variance IS NOT NULL AND ABS(cash_variance) >= 20000 AND created_at >= ? ORDER BY created_at DESC LIMIT 5`, now - 7 * 86400);
      for (const v of cv) alerts.push({ ts: v.created_at, severity: Math.abs(v.cash_variance) >= 100000 ? 'critical' : 'warning', category: 'cash_variance', icon: '💵', title: `Cash variance — ${v.staff_name || '-'}`, detail: `Rp ${Math.abs(v.cash_variance).toLocaleString('id-ID')} ${v.cash_variance < 0 ? 'kurang' : 'lebih'}` });
    } catch {}
    // Cinema refund/void today
    try {
      const cv = one(`SELECT COUNT(*) c, COALESCE(SUM(price),0) g FROM cinema_ticket_voids WHERE voided_at >= ?`, dayStart);
      if (cv?.c > 0) alerts.push({ ts: now, severity: 'warning', category: 'refund', icon: '🔁', title: `${cv.c} tiket cinema di-void hari ini`, detail: `Rp ${(cv.g || 0).toLocaleString('id-ID')} refund` });
    } catch {}
    // Studio maintenance issues
    try {
      const issues = many(`SELECT name, maintenance_status FROM cinema_studios WHERE maintenance_status NOT IN ('operational','')`);
      for (const i of issues) alerts.push({ ts: now, severity: 'warning', category: 'studio', icon: '🏛️', title: `Studio ${i.name} — ${i.maintenance_status}`, detail: 'Perlu maintenance / cleaning' });
    } catch {}
    // Recent incidents
    try {
      const inc = many(`SELECT * FROM incidents WHERE created_at >= ? ORDER BY created_at DESC LIMIT 5`, now - 86400);
      for (const i of inc) alerts.push({ ts: i.created_at, severity: i.severity === 'high' ? 'critical' : 'warning', category: 'incident', icon: '🚨', title: i.title || 'Incident', detail: i.description || '' });
    } catch {}
    // Pending in-studio orders too old (>15 min)
    try {
      const stuck = one(`SELECT COUNT(*) c FROM cinema_in_studio_orders WHERE status IN ('pending','preparing') AND created_at < ?`, now - 15 * 60)?.c || 0;
      if (stuck > 0) alerts.push({ ts: now, severity: 'warning', category: 'queue', icon: '🍿', title: `${stuck} order F&B in-studio > 15 menit`, detail: 'Check queue' });
    } catch {}
    alerts.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    res.json({
      cinema, reservation, delivery, promotions,
      outlet_health, comparison, alerts: alerts.slice(0, 12),
      generated_at: now,
    });
  });

  const mountPath = opts.mountPath || '/api/owner-dashboard';
  app.use(mountPath, router);
  console.log(`[owner-dashboard-extras] mounted at ${mountPath}/extras`);

  return { router, db };
}

module.exports = { setupOwnerDashboardExtras };
