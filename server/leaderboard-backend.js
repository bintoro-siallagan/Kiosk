// server/leaderboard-backend.js
// Customer spend gamification — "Sultan Leaderboard".
// Setelah transaksi: customer dapet gelar (Sultan/Crazy Rich/dll) +
// lihat peringkat belanja JAM INI. Reset tiap 1 jam → tiap jam ada
// Sultan baru. Layar celebration didesain biar enak di-screenshot &
// dishare ke WA Story / Instagram (apresiasi customer).
//
//   POST /api/leaderboard/record  — { name, amount } → gelar + rank + top + stats
//   GET  /api/leaderboard         — leaderboard belanja jam ini

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS spend_leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  amount REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_lb_created ON spend_leaderboard(created_at);
`;

// Gelar berdasarkan nominal transaksi
const TITLES = [
  { min: 300000, title: 'SULTAN',         emoji: '👑', color: '#fbbf24' },
  { min: 150000, title: 'Crazy Rich',     emoji: '💎', color: '#22d3ee' },
  { min: 80000,  title: 'Big Spender',    emoji: '🔥', color: '#f97316' },
  { min: 40000,  title: 'Foodie Sejati',  emoji: '😋', color: '#34d399' },
  { min: 0,      title: 'Hemat Pejuang',  emoji: '🌱', color: '#a3e635' },
];
const titleFor = (amt) => TITLES.find(t => amt >= t.min) || TITLES[TITLES.length - 1];

// Reset tiap 1 jam — window = jam berjalan (mis. 14:00–14:59)
const hourStart = () => { const d = new Date(); d.setMinutes(0, 0, 0); return Math.floor(d.getTime() / 1000); };
const hourLabel = () => {
  const h = new Date().getHours();
  return `${String(h).padStart(2, '0')}.00–${String(h).padStart(2, '0')}.59`;
};

function setupLeaderboard(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const router = express.Router();
  router.use(express.json());

  // Multi-tenant: company filter helper (per-company isolated leaderboard)
  const _scopeWhere = (req) => {
    const scope = req?.companyScope || { is_super_admin: true };
    if (scope.is_super_admin) return { sql: '', val: null };
    return { sql: ' AND company_id = ?', val: scope.company_id };
  };

  const topNow = (limit, req) => {
    const sc = _scopeWhere(req);
    const params = [hourStart()]; if (sc.val != null) params.push(sc.val); params.push(limit);
    return db.prepare(
      `SELECT name, amount FROM spend_leaderboard WHERE created_at >= ?${sc.sql} ORDER BY amount DESC, id ASC LIMIT ?`
    ).all(...params)
      .map((r, i) => ({ rank: i + 1, name: r.name || 'Tamu', amount: r.amount, ...titleFor(r.amount) }));
  };

  const statsNow = (req) => {
    const sc = _scopeWhere(req);
    const params = [hourStart()]; if (sc.val != null) params.push(sc.val);
    const s = db.prepare(
      `SELECT COALESCE(MAX(amount),0) top_transaction, COALESCE(AVG(amount),0) avg_bill, COUNT(*) count
       FROM spend_leaderboard WHERE created_at >= ?${sc.sql}`
    ).get(...params);
    return { top_transaction: Math.round(s.top_transaction), avg_bill: Math.round(s.avg_bill), count: s.count };
  };

  // GET — leaderboard belanja jam ini (per-company)
  router.get('/', (req, res) => {
    res.json({
      window: hourLabel(),
      top: topNow(Math.min(Number(req.query.limit) || 10, 50), req),
      stats: statsNow(req),
    });
  });

  // POST — catat transaksi, balikin gelar + rank + leaderboard + stats jam ini (per-company)
  router.post('/record', (req, res) => {
    const { name, amount } = req.body || {};
    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'amount tidak valid' });
    // Multi-tenant: auto-tag company_id dari scope (fallback ke 1 = F&B kalau no scope)
    const scope = req.companyScope || { company_id: 1, is_super_admin: false };
    const companyId = scope.is_super_admin ? (parseInt(req.body?.company_id, 10) || 1) : scope.company_id;
    db.prepare(`INSERT INTO spend_leaderboard (name, amount, company_id) VALUES (?,?,?)`)
      .run((name || '').trim() || 'Tamu', amt, companyId);
    const sc = _scopeWhere(req);
    const params = [hourStart()]; if (sc.val != null) params.push(sc.val);
    const all = db.prepare(`SELECT amount FROM spend_leaderboard WHERE created_at >= ?${sc.sql}`).all(...params);
    const rank = all.filter(r => r.amount > amt).length + 1;
    res.json({
      window: hourLabel(),
      title: titleFor(amt),
      amount: amt,
      rank,
      total_hour: all.length,
      top: topNow(8, req),
      stats: statsNow(req),
    });
  });

  const mountPath = opts.mountPath || '/api/leaderboard';
  app.use(mountPath, router);
  console.log(`[leaderboard] mounted at ${mountPath} — hourly Sultan leaderboard`);

  // ── DAILY SULTAN WINNER NOTIF ────────────────────────────────────────
  // Tiap jam 22:00 (10 PM) — kirim ringkasan Sultan hari ini ke admin email
  // per-company. Pakai existing email module (opts.sendEmail).
  // Schedule cek tiap 30 menit; fire kalau jam 22:00-22:30 dan belum kirim hari ini.
  const SENT_TODAY = new Map(); // company_id → date string yang sudah dikirim
  async function maybeSendDailyWinner() {
    try {
      const now = new Date();
      if (now.getHours() !== 22) return; // hanya jam 22:00-22:59
      const today = now.toISOString().slice(0, 10);
      const dayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000); })();

      const companies = db.prepare(`SELECT id, code, name, contact_email FROM companies WHERE status='active'`).all();
      for (const c of companies) {
        if (SENT_TODAY.get(c.id) === today) continue; // sudah dikirim hari ini
        if (!c.contact_email) continue;

        // Sultan winner today per-company
        const top = db.prepare(`
          SELECT name, amount FROM spend_leaderboard
          WHERE created_at >= ? AND company_id = ?
          ORDER BY amount DESC, id ASC LIMIT 1
        `).get(dayStart, c.id);
        const stats = db.prepare(`
          SELECT COUNT(*) total, COALESCE(SUM(amount),0) revenue, COALESCE(AVG(amount),0) avg_bill
          FROM spend_leaderboard WHERE created_at >= ? AND company_id = ?
        `).get(dayStart, c.id);
        if (!top || !stats || stats.total === 0) continue; // no data

        const fmtRp = n => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
        const titleObj = titleFor(top.amount);
        const html = `
          <div style="font-family:'Inter',sans-serif;background:#0a0e16;color:#e6edf3;padding:20px;border-radius:12px">
            <div style="text-align:center;margin-bottom:14px">
              <div style="font-size:14px;color:#fbbf24;letter-spacing:2px;font-weight:700;text-transform:uppercase">${c.name} · DAILY SULTAN</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:2px">${today}</div>
            </div>
            <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.35);border-radius:14px;padding:18px;text-align:center;margin-bottom:14px">
              <div style="font-size:48px">${titleObj.emoji}</div>
              <div style="font-size:11px;color:#9ca3af;letter-spacing:1px;margin-top:8px">SULTAN HARI INI</div>
              <div style="font-size:24px;font-weight:800;color:${titleObj.color};margin-top:2px">${titleObj.title}</div>
              <div style="font-size:14px;color:#fff;margin-top:6px"><b>${top.name || 'Tamu'}</b> · ${fmtRp(top.amount)}</div>
            </div>
            <div style="display:flex;gap:10px;font-size:11px;color:#9ca3af">
              <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px">
                <div style="letter-spacing:1px">TRANSAKSI</div>
                <div style="font-size:18px;color:#fff;font-weight:700;font-family:monospace">${stats.total}</div>
              </div>
              <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px">
                <div style="letter-spacing:1px">TOTAL OMZET</div>
                <div style="font-size:18px;color:#10b981;font-weight:700;font-family:monospace">${fmtRp(stats.revenue)}</div>
              </div>
              <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px">
                <div style="letter-spacing:1px">AVG BILL</div>
                <div style="font-size:18px;color:#22d3ee;font-weight:700;font-family:monospace">${fmtRp(stats.avg_bill)}</div>
              </div>
            </div>
            <div style="margin-top:14px;font-size:10px;color:#5b6470;text-align:center">Powered by karyaOS · Sultan Leaderboard auto-notif</div>
          </div>
        `;
        try {
          if (typeof opts.sendEmail === 'function') {
            await opts.sendEmail({
              to: c.contact_email,
              subject: `🏆 ${c.name} — Sultan Hari Ini (${today})`,
              html,
            });
            SENT_TODAY.set(c.id, today);
            console.log(`[sultan-notif] sent to ${c.contact_email} (company ${c.code})`);
          }
        } catch (e) { console.error(`[sultan-notif] send fail company ${c.code}:`, e.message); }
      }
    } catch (e) { console.error('[sultan-notif] error:', e.message); }
  }
  // Cek tiap 30 menit
  setTimeout(maybeSendDailyWinner, 60 * 1000);
  setInterval(maybeSendDailyWinner, 30 * 60 * 1000);

  return { router, db };
}

module.exports = { setupLeaderboard };
