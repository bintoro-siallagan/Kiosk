// server/analytics-backend.js
// Analytics + AI Insight — Level 4 dashboard.
// Tren penjualan 14 hari, pola hari, pola jam, + insight otomatis
// (rule-based pattern detection) ala AI.
//
//   GET /api/analytics → { series, dow, hourly, insights, summary }

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DOW = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

function setupAnalytics(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const many = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const W = `WHERE status='completed'`;

    // ── Daily (14 hari) ──
    const daily = many(`SELECT date(created_at,'unixepoch','localtime') d,
      COALESCE(SUM(amount_applied),0) revenue, COUNT(*) orders
      FROM pos_payments ${W} AND created_at >= ?
      GROUP BY d`, Math.floor(Date.now() / 1000) - 14 * 86400);
    const dayMap = {};
    daily.forEach(r => { dayMap[r.d] = r; });
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i); dt.setHours(0, 0, 0, 0);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const r = dayMap[key];
      series.push({
        date: key, label: `${dt.getDate()}/${dt.getMonth() + 1}`, dow: dt.getDay(),
        revenue: r ? r.revenue : 0, orders: r ? r.orders : 0,
      });
    }

    // ── Pola hari (rata-rata per weekday) ──
    const dowRaw = many(`SELECT strftime('%w',created_at,'unixepoch','localtime') w,
      COALESCE(SUM(amount_applied),0) rev,
      COUNT(DISTINCT date(created_at,'unixepoch','localtime')) days
      FROM pos_payments ${W} GROUP BY w`);
    const dow = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const r = dowRaw.find(x => Number(x.w) === i);
      return { dow: i, label: DOW[i], avg_revenue: r && r.days ? Math.round(r.rev / r.days) : 0 };
    });

    // ── Pola jam ──
    const hourlyRaw = many(`SELECT CAST(strftime('%H',created_at,'unixepoch','localtime') AS INTEGER) h,
      COALESCE(SUM(amount_applied),0) revenue, COUNT(*) orders
      FROM pos_payments ${W} GROUP BY h`);
    const hourly = [];
    for (let h = 8; h <= 22; h++) {
      const r = hourlyRaw.find(x => x.h === h);
      hourly.push({ hour: h, revenue: r ? r.revenue : 0, orders: r ? r.orders : 0 });
    }

    // ── Hitungan untuk insight ──
    const thisWeek = series.slice(7).reduce((s, r) => s + r.revenue, 0);
    const lastWeek = series.slice(0, 7).reduce((s, r) => s + r.revenue, 0);
    const wow = lastWeek > 0 ? Math.round((thisWeek - lastWeek) / lastWeek * 100) : null;
    const activeDays = series.filter(r => r.revenue > 0);
    const avgDaily = activeDays.length ? Math.round(activeDays.reduce((s, r) => s + r.revenue, 0) / activeDays.length) : 0;
    const today = series[series.length - 1];
    const todayVsAvg = avgDaily > 0 ? Math.round((today.revenue - avgDaily) / avgDaily * 100) : null;

    const dowRanked = [...dow].filter(d => d.avg_revenue > 0).sort((a, b) => b.avg_revenue - a.avg_revenue);
    const bestDow = dowRanked[0], worstDow = dowRanked[dowRanked.length - 1];
    const hourRanked = [...hourly].filter(h => h.orders > 0).sort((a, b) => b.revenue - a.revenue);
    const peakHour = hourRanked[0], quietHour = hourRanked[hourRanked.length - 1];

    const tomorrowDow = (new Date().getDay() + 1) % 7;
    const forecast = dow.find(d => d.dow === tomorrowDow);

    // ── AI Insight (rule-based) ──
    const insights = [];
    if (wow != null) insights.push({
      icon: wow >= 0 ? '📈' : '📉', tone: wow >= 0 ? 'good' : 'bad',
      title: wow >= 0 ? 'Tren naik' : 'Tren turun',
      text: `Penjualan 7 hari terakhir ${fmtRp(thisWeek)} — ${wow >= 0 ? 'naik' : 'turun'} ${Math.abs(wow)}% vs minggu sebelumnya.`,
    });
    if (bestDow) insights.push({
      icon: '🔥', tone: 'info', title: `${bestDow.label} hari terkuat`,
      text: `Rata-rata ${fmtRp(bestDow.avg_revenue)} tiap ${bestDow.label} — jadwalkan stok & staf lebih.`,
    });
    if (worstDow && worstDow !== bestDow) insights.push({
      icon: '💡', tone: 'info', title: `${worstDow.label} paling sepi`,
      text: `Cuma ${fmtRp(worstDow.avg_revenue)} rata-rata — dorong promo / bundling di hari ${worstDow.label}.`,
    });
    if (peakHour) insights.push({
      icon: '⏰', tone: 'info', title: `Jam sibuk ${peakHour.hour}.00`,
      text: `Penjualan puncak jam ${peakHour.hour}.00–${peakHour.hour + 1}.00 — pastikan antrian & dapur siap.`,
    });
    if (quietHour && quietHour !== peakHour) insights.push({
      icon: '🌙', tone: 'info', title: `Jam sepi ${quietHour.hour}.00`,
      text: `Jam ${quietHour.hour}.00 paling lengang — waktu ideal push flash promo (broadcast).`,
    });
    if (forecast && forecast.avg_revenue > 0) insights.push({
      icon: '🔮', tone: 'info', title: `Proyeksi besok (${forecast.label})`,
      text: `Perkiraan penjualan besok ~${fmtRp(forecast.avg_revenue)}, dari rata-rata historis hari ${forecast.label}.`,
    });
    if (todayVsAvg != null) insights.push({
      icon: todayVsAvg >= 0 ? '✅' : '⚠️', tone: todayVsAvg >= 0 ? 'good' : 'bad',
      title: todayVsAvg >= 0 ? 'Hari ini di atas rata-rata' : 'Hari ini di bawah rata-rata',
      text: `Penjualan hari ini ${fmtRp(today.revenue)} — ${Math.abs(todayVsAvg)}% ${todayVsAvg >= 0 ? 'di atas' : 'di bawah'} rata-rata harian (${fmtRp(avgDaily)}).`,
    });

    res.json({
      series, dow, hourly, insights,
      summary: {
        this_week: thisWeek, last_week: lastWeek, wow_pct: wow,
        avg_daily: avgDaily, today: today.revenue, today_vs_avg: todayVsAvg,
        forecast_tomorrow: forecast ? forecast.avg_revenue : 0,
      },
    });
  });

  const mountPath = opts.mountPath || '/api/analytics';
  app.use(mountPath, router);
  console.log(`[analytics] mounted at ${mountPath} — trends + AI insight`);

  return { router, db };
}

module.exports = { setupAnalytics };
