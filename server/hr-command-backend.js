// server/hr-command-backend.js
// Command Center HR — workforce health, top performer, burnout risk,
// low engagement, outlet morale, attendance health, reward distribution.
// Tujuan: dukung tim — bukan monitoring/punishment.
//
//   GET /api/hr-command

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const TIER_BONUS = { bronze: 10, silver: 25, gold: 40, elite: 55 };
const tierOf = (xp) => (xp >= 6000 ? 'elite' : xp >= 3500 ? 'gold' : xp >= 1500 ? 'silver' : 'bronze');
const parseAch = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function engagementOf(c) {
  return Math.min(100, c.streak_days * 4 + parseAch(c.achievements).length * 9 + TIER_BONUS[tierOf(c.xp)]);
}

function setupHRCommand(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };
  const one = (s) => { try { return db.prepare(s).get(); } catch { return null; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const crew = many(`SELECT * FROM staff_rewards`);
    const att = many(`SELECT late_minutes, overtime_minutes, productivity_score FROM hris_attendance`);

    // ── Attendance health ──
    const totalShift = att.length;
    const lateCount = att.filter(a => (a.late_minutes || 0) > 0).length;
    const ontimeRate = totalShift ? Math.round((totalShift - lateCount) / totalShift * 100) : 100;
    const avgProd = totalShift ? Math.round(att.reduce((s, a) => s + (a.productivity_score || 0), 0) / totalShift) : 0;
    const otHours = Math.round(att.reduce((s, a) => s + (a.overtime_minutes || 0), 0) / 60);

    // ── Engagement per crew ──
    const withEng = crew.map(c => ({ ...c, engagement: engagementOf(c), tier: tierOf(c.xp), ach: parseAch(c.achievements).length }));
    const avgEng = withEng.length ? Math.round(withEng.reduce((s, c) => s + c.engagement, 0) / withEng.length) : 0;

    // ── Workforce health score (0-100) ──
    const workforceHealth = Math.round(avgEng * 0.65 + ontimeRate * 0.35);
    const healthLabel = workforceHealth >= 80 ? 'Sehat' : workforceHealth >= 60 ? 'Cukup Sehat' : 'Perlu Perhatian';

    // ── Top performers ──
    const topPerformers = withEng.slice().sort((a, b) => b.xp - a.xp).slice(0, 5).map(c => ({
      staff_name: c.staff_name, outlet: c.outlet, role: c.role, xp: c.xp, tier: c.tier, achievements: c.ach,
    }));

    // ── Burnout risk — kerja panjang tanpa libur (supportive) ──
    const burnoutRisk = withEng.filter(c => c.streak_days >= 12).map(c => ({
      staff_name: c.staff_name, outlet: c.outlet, streak_days: c.streak_days,
      note: `${c.streak_days} hari berturut tanpa libur — saran: jadwalkan istirahat biar tetap fit.`,
    })).sort((a, b) => b.streak_days - a.streak_days);

    // ── Low engagement — perlu dukungan ──
    const lowEngagement = withEng.filter(c => c.engagement < 35 && c.ach === 0).map(c => ({
      staff_name: c.staff_name, outlet: c.outlet, engagement: c.engagement,
      note: 'Belum ada achievement & streak rendah — saran: encouragement & mentoring 1-on-1.',
    }));

    // ── Outlet morale ──
    const byOutlet = {};
    for (const c of withEng) {
      (byOutlet[c.outlet] = byOutlet[c.outlet] || []).push(c.engagement);
    }
    const outletMorale = Object.entries(byOutlet).map(([outlet, vals]) => {
      const m = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
      return { outlet, crew: vals.length, morale: m, label: m >= 70 ? 'Tinggi' : m >= 45 ? 'Sedang' : 'Perlu Perhatian' };
    }).sort((a, b) => b.morale - a.morale);

    // ── Reward distribution ──
    const redemptions = (one(`SELECT COUNT(*) c FROM reward_redemptions`) || { c: 0 }).c;
    const tierCount = { bronze: 0, silver: 0, gold: 0, elite: 0 };
    for (const c of withEng) tierCount[c.tier]++;

    res.json({
      workforce_health: { score: workforceHealth, label: healthLabel, engagement_avg: avgEng },
      top_performers: topPerformers,
      burnout_risk: burnoutRisk,
      low_engagement: lowEngagement,
      outlet_morale: outletMorale,
      attendance: { total_shift: totalShift, ontime_rate: ontimeRate, late_count: lateCount, avg_productivity: avgProd, overtime_hours: otHours },
      reward_distribution: {
        total_xp: withEng.reduce((s, c) => s + c.xp, 0),
        total_points: withEng.reduce((s, c) => s + c.points, 0),
        redemptions, tier: tierCount,
      },
      crew_count: crew.length,
    });
  });

  const mountPath = opts.mountPath || '/api/hr-command';
  app.use(mountPath, router);
  console.log(`[hr-command] mounted at ${mountPath} — HR command center`);

  return { router, db };
}

module.exports = { setupHRCommand };
