// server/notifications-backend.js
// Notifications module — alert delivery for kios operations:
//   - Low stock alerts (real-time, triggered by stock-consumption events)
//   - Invoice aging digest (scheduled daily/weekly)
//   - Anomaly alerts (real-time from anomaly_detected events)
//   - Manager daily summary (revenue, COGS, anomalies count)
//
// Delivery channels:
//   - Webhook (POST to any URL — wire to WhatsApp via Wablas/Fonnte API or Telegram bot)
//   - Email (via nodemailer if SMTP configured; gracefully skip if not)
//   - In-app queue (always — readable via /api/notifications/inbox)
//
// Design: keep simple. Real WhatsApp/email delivery is a webhook concern.
// Module focuses on event detection + payload formatting + delivery dispatch.

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK (channel IN ('webhook','email','telegram')),
  target TEXT NOT NULL,
  event_types TEXT,
  min_severity TEXT DEFAULT 'warning' CHECK (min_severity IN ('info','warning','error','critical')),
  is_active INTEGER DEFAULT 1,
  label TEXT,
  headers TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_sub_channel ON notification_subscriptions(channel);
CREATE INDEX IF NOT EXISTS idx_sub_active ON notification_subscriptions(is_active);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  payload TEXT,
  channels_attempted TEXT,
  channels_succeeded TEXT,
  read INTEGER DEFAULT 0,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notif_severity ON notifications(severity);
CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications(event_type);
`;

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

const SEVERITY_ORDER = { info: 0, warning: 1, error: 2, critical: 3 };

// ============================================================
// DELIVERY
// ============================================================
async function deliverWebhook(target, payload, headers = {}) {
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload)
    });
    return { ok: response.ok, status: response.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function deliverEmail(target, subject, body) {
  try {
    if (!global.nodemailerTransport) return { ok: false, error: 'SMTP not configured (global.nodemailerTransport not set)' };
    await global.nodemailerTransport.sendMail({
      from: process.env.SMTP_FROM || 'kios@bites.local',
      to: target, subject, text: body, html: body.replace(/\n/g, '<br>')
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function deliverTelegram(target, body) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return { ok: false, error: 'TELEGRAM_BOT_TOKEN env not set' };
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: target, text: body, parse_mode: 'Markdown' })
    });
    return { ok: res.ok };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ============================================================
// CORE: dispatch notification through matching subscriptions
// ============================================================
async function dispatch(db, notification) {
  const { event_type, severity, title, body, payload } = notification;

  // Save to inbox first
  const info = db.prepare(`INSERT INTO notifications (event_type, severity, title, body, payload) VALUES (?,?,?,?,?)`)
    .run(event_type, severity, title, body, payload ? JSON.stringify(payload) : null);
  const notifId = info.lastInsertRowid;

  // Find matching subscriptions
  const subs = db.prepare(`SELECT * FROM notification_subscriptions WHERE is_active = 1`).all();
  const matching = subs.filter(s => {
    if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[s.min_severity]) return false;
    if (s.event_types) {
      const types = s.event_types.split(',').map(t => t.trim());
      if (!types.includes(event_type) && !types.includes('*')) return false;
    }
    return true;
  });

  const attempted = [], succeeded = [];
  for (const sub of matching) {
    attempted.push(`${sub.channel}:${sub.label || sub.id}`);
    let result;
    if (sub.channel === 'webhook') {
      result = await deliverWebhook(sub.target, { event_type, severity, title, body, payload, ts: nowSec() }, sub.headers ? safeJson(sub.headers) : {});
    } else if (sub.channel === 'email') {
      result = await deliverEmail(sub.target, title, body);
    } else if (sub.channel === 'telegram') {
      result = await deliverTelegram(sub.target, `*${title}*\n\n${body}`);
    }
    if (result?.ok) succeeded.push(`${sub.channel}:${sub.label || sub.id}`);
  }

  db.prepare(`UPDATE notifications SET channels_attempted = ?, channels_succeeded = ? WHERE id = ?`)
    .run(attempted.join(','), succeeded.join(','), notifId);

  return { id: notifId, attempted: attempted.length, succeeded: succeeded.length };
}

// ============================================================
// EVENT POLLERS — scan pos_events + audit_warehouse + invoices
// ============================================================
function pollLowStock(db) {
  let threshold;
  try {
    const c = db.prepare(`SELECT value FROM pos_config WHERE key='LOW_STOCK_THRESHOLD'`).get();
    threshold = c ? Number(c.value) : 5;
  } catch { threshold = 5; }

  let rows;
  try {
    rows = db.prepare(`SELECT sku, name, current_stock, unit FROM audit_warehouse WHERE current_stock IS NOT NULL AND current_stock <= ?`).all(threshold);
  } catch { return []; }

  // Dedupe: skip if same alert sent in last hour
  const recentCutoff = nowSec() - 3600;
  const recent = db.prepare(`SELECT payload FROM notifications WHERE event_type='low_stock' AND created_at >= ?`).all(recentCutoff);
  const recentSKUs = new Set();
  for (const r of recent) {
    const p = safeJson(r.payload);
    if (p?.sku) recentSKUs.add(p.sku);
  }

  return rows.filter(r => !recentSKUs.has(r.sku)).map(r => ({
    event_type: 'low_stock',
    severity: r.current_stock <= 0 ? 'critical' : 'warning',
    title: r.current_stock <= 0 ? `🚨 STOK HABIS: ${r.name || r.sku}` : `⚠️ Stok rendah: ${r.name || r.sku}`,
    body: `SKU ${r.sku} sisa ${r.current_stock} ${r.unit || ''} (threshold: ${threshold})`,
    payload: { sku: r.sku, current_stock: r.current_stock, unit: r.unit, threshold }
  }));
}

function pollAnomalies(db, sinceTs) {
  try {
    const events = db.prepare(`
      SELECT * FROM pos_events
      WHERE event_type = 'anomaly_detected' AND created_at >= ? AND severity IN ('warning','critical')
      ORDER BY created_at DESC LIMIT 50
    `).all(sinceTs);

    const sentIds = new Set();
    const recentNotifs = db.prepare(`
      SELECT payload FROM notifications WHERE event_type='anomaly' AND created_at >= ?
    `).all(sinceTs);
    for (const n of recentNotifs) {
      const p = safeJson(n.payload);
      if (p?.event_id) sentIds.add(p.event_id);
    }

    return events.filter(e => !sentIds.has(e.id)).map(e => {
      const p = safeJson(e.payload) || {};
      return {
        event_type: 'anomaly',
        severity: e.severity,
        title: `${e.severity === 'critical' ? '🚨' : '⚠️'} Anomali ${e.event_subtype || ''}: ${p.message || ''}`,
        body: `Order: ${e.order_ref || '-'}\nKasir: ${e.actor || '-'}\nRule: ${e.event_subtype || '-'}\n\n${p.message || ''}`,
        payload: { event_id: e.id, rule: e.event_subtype, order_ref: e.order_ref, actor: e.actor, ...p }
      };
    });
  } catch { return []; }
}

function buildAgingDigest(db) {
  let outstanding, criticalSuppliers = [];
  try {
    const invoices = db.prepare(`
      SELECT i.id, i.doc_no, i.invoice_date, i.due_date, i.total, i.supplier_id,
        s.name AS supplier_name,
        COALESCE((SELECT SUM(amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
      FROM purchase_invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
      WHERE i.status != 'voided'
    `).all();
    const now = nowSec();
    const bucketTotals = { current:0, b1:0, b2:0, b3:0, b4:0, total:0 };
    const bySupplier = {};
    for (const inv of invoices) {
      const out = (inv.total || 0) - (inv.paid || 0);
      if (out <= 0.01) continue;
      const dueDate = inv.due_date || (inv.invoice_date ? (inv.invoice_date + 30*86400) : now);
      const days = Math.floor((now - dueDate) / 86400);
      const b = days <= 0 ? 'current' : days <= 30 ? 'b1' : days <= 60 ? 'b2' : days <= 90 ? 'b3' : 'b4';
      bucketTotals[b] += out;
      bucketTotals.total += out;
      if (b === 'b3' || b === 'b4') {
        if (!bySupplier[inv.supplier_id]) bySupplier[inv.supplier_id] = { name: inv.supplier_name, total: 0, count: 0, oldest_days: 0 };
        bySupplier[inv.supplier_id].total += out;
        bySupplier[inv.supplier_id].count += 1;
        if (days > bySupplier[inv.supplier_id].oldest_days) bySupplier[inv.supplier_id].oldest_days = days;
      }
    }
    outstanding = bucketTotals;
    criticalSuppliers = Object.values(bySupplier).sort((a,b)=>b.total-a.total).slice(0, 10);
  } catch { return null; }

  const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
  const body = `Total outstanding AP: ${fmtIDR(outstanding.total)}\n` +
    `- Belum jatuh tempo: ${fmtIDR(outstanding.current)}\n` +
    `- 0-30 hari overdue: ${fmtIDR(outstanding.b1)}\n` +
    `- 31-60 hari overdue: ${fmtIDR(outstanding.b2)}\n` +
    `- 61-90 hari overdue: ${fmtIDR(outstanding.b3)}\n` +
    `- 90+ hari KRITIS: ${fmtIDR(outstanding.b4)}\n\n` +
    (criticalSuppliers.length > 0
      ? `Supplier kritis (60+ hari):\n` + criticalSuppliers.map(s => `- ${s.name}: ${fmtIDR(s.total)} (${s.count} invoice, oldest ${s.oldest_days} hari)`).join('\n')
      : 'Tidak ada supplier kritis 60+ hari ✓');

  const severity = outstanding.b4 > 0 ? 'critical' : outstanding.b3 > 0 ? 'warning' : 'info';

  return {
    event_type: 'aging_digest',
    severity,
    title: `📊 Invoice Aging Digest — ${fmtIDR(outstanding.total)} outstanding`,
    body,
    payload: { outstanding, critical_suppliers: criticalSuppliers, generated_at: nowSec() }
  };
}

function buildDailySummary(db) {
  const dayStart = Math.floor(new Date().setHours(0,0,0,0)/1000);
  const dayEnd = dayStart + 86400;

  let revenue = 0, orders = 0, anomalies = 0;
  try {
    const r = db.prepare(`SELECT COUNT(DISTINCT order_ref) o, SUM(amount_applied) r FROM pos_payments WHERE status='completed' AND created_at >= ? AND created_at < ?`).get(dayStart, dayEnd);
    revenue = r.r || 0;
    orders = r.o || 0;
  } catch {}
  try {
    const a = db.prepare(`SELECT COUNT(*) c FROM pos_events WHERE event_type='anomaly_detected' AND created_at >= ? AND created_at < ?`).get(dayStart, dayEnd);
    anomalies = a.c || 0;
  } catch {}

  const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
  const body = `Tanggal: ${new Date().toLocaleDateString('id-ID', {dateStyle:'full'})}\n\n` +
    `💰 Revenue: ${fmtIDR(revenue)}\n` +
    `🛒 Orders: ${orders}\n` +
    `📊 Avg Order: ${fmtIDR(orders > 0 ? revenue/orders : 0)}\n` +
    `⚠️ Anomali: ${anomalies}\n\n` +
    (anomalies > 0 ? 'Review anomali di Admin → POS Phase4B → Anomalies tab' : 'No anomalies today ✓');

  return {
    event_type: 'daily_summary',
    severity: 'info',
    title: `📈 Daily Summary — ${fmtIDR(revenue)} (${orders} orders)`,
    body,
    payload: { revenue, orders, anomalies, date: dayStart }
  };
}

// ============================================================
// SCHEDULER — call once at server boot
// ============================================================
function startScheduler(db, opts = {}) {
  const lowStockIntervalMs = opts.low_stock_interval_ms || 5 * 60 * 1000; // 5 min
  const anomalyIntervalMs = opts.anomaly_interval_ms || 60 * 1000; // 1 min
  const agingHour = opts.aging_hour ?? 9; // 9am
  const summaryHour = opts.summary_hour ?? 21; // 9pm

  let lastAnomalyCheck = nowSec();

  // Real-time-ish pollers
  const lowStockTimer = setInterval(() => {
    const events = pollLowStock(db);
    for (const e of events) dispatch(db, e).catch(console.error);
  }, lowStockIntervalMs);

  const anomalyTimer = setInterval(() => {
    const events = pollAnomalies(db, lastAnomalyCheck);
    lastAnomalyCheck = nowSec();
    for (const e of events) dispatch(db, e).catch(console.error);
  }, anomalyIntervalMs);

  // Daily schedulers — check every 30 min if we hit target hour
  const dailyTimer = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const min = now.getMinutes();
    if (min >= 30) return; // run once per hour at top half

    const today = Math.floor(new Date().setHours(0,0,0,0)/1000);

    if (hour === agingHour) {
      const lastAging = db.prepare(`SELECT created_at FROM notifications WHERE event_type='aging_digest' AND created_at >= ? LIMIT 1`).get(today);
      if (!lastAging) {
        const e = buildAgingDigest(db);
        if (e) dispatch(db, e).catch(console.error);
      }
    }
    if (hour === summaryHour) {
      const lastSummary = db.prepare(`SELECT created_at FROM notifications WHERE event_type='daily_summary' AND created_at >= ? LIMIT 1`).get(today);
      if (!lastSummary) {
        const e = buildDailySummary(db);
        if (e) dispatch(db, e).catch(console.error);
      }
    }
  }, 30 * 60 * 1000); // every 30 min

  console.log(`[notifications] scheduler started — low-stock every ${lowStockIntervalMs/1000}s, anomalies every ${anomalyIntervalMs/1000}s, aging at ${agingHour}:00, summary at ${summaryHour}:00`);

  return () => { clearInterval(lowStockTimer); clearInterval(anomalyTimer); clearInterval(dailyTimer); };
}

// ============================================================
// MAIN SETUP
// ============================================================
function setupNotifications(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  const router = express.Router();
  router.use(express.json());

  // ========== SUBSCRIPTIONS CRUD ==========
  router.get('/subscriptions', (req, res) => {
    res.json(db.prepare(`SELECT * FROM notification_subscriptions ORDER BY channel, id`).all());
  });

  router.post('/subscriptions', (req, res) => {
    const b = req.body || {};
    if (!b.channel || !b.target) return res.status(400).json({ error: 'channel + target required' });
    try {
      const info = db.prepare(`INSERT INTO notification_subscriptions (channel, target, event_types, min_severity, label, headers, is_active) VALUES (?,?,?,?,?,?,?)`)
        .run(b.channel, b.target, b.event_types || '*', b.min_severity || 'warning', b.label || null,
          b.headers ? JSON.stringify(b.headers) : null, b.is_active !== false ? 1 : 0);
      res.json({ ok: true, id: info.lastInsertRowid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put('/subscriptions/:id', (req, res) => {
    const b = req.body || {};
    const allowed = ['channel','target','event_types','min_severity','label','is_active'];
    const sets = [], params = [];
    for (const k of allowed) if (b[k] !== undefined) {
      sets.push(`${k} = ?`);
      params.push(typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : b[k]);
    }
    if (b.headers !== undefined) { sets.push('headers = ?'); params.push(b.headers ? JSON.stringify(b.headers) : null); }
    if (!sets.length) return res.status(400).json({ error: 'no fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE notification_subscriptions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  router.delete('/subscriptions/:id', (req, res) => {
    db.prepare(`DELETE FROM notification_subscriptions WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  });

  // Test endpoint — dispatch a sample notification
  router.post('/subscriptions/:id/test', async (req, res) => {
    const sub = db.prepare(`SELECT * FROM notification_subscriptions WHERE id = ?`).get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'not found' });
    const testPayload = { test: true, sub_id: sub.id, ts: nowSec() };
    let result;
    if (sub.channel === 'webhook') result = await deliverWebhook(sub.target, { title: 'Test', body: 'Test from bites-kiosk', payload: testPayload });
    else if (sub.channel === 'email') result = await deliverEmail(sub.target, 'Test from bites-kiosk', 'Hello from notifications module test');
    else if (sub.channel === 'telegram') result = await deliverTelegram(sub.target, '*Test* from bites-kiosk notifications');
    res.json(result);
  });

  // ========== INBOX ==========
  router.get('/inbox', (req, res) => {
    const { unread, severity, event_type, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT * FROM notifications WHERE 1=1`;
    const params = [];
    if (unread === 'true') sql += ' AND read = 0';
    if (severity) { sql += ' AND severity = ?'; params.push(severity); }
    if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);
    const unreadCount = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE read = 0`).get().c;
    res.json({ notifications: rows.map(r => ({ ...r, payload: r.payload ? safeJson(r.payload) : null })), unread_count: unreadCount });
  });

  router.post('/inbox/:id/mark-read', (req, res) => {
    db.prepare(`UPDATE notifications SET read = 1, read_at = ? WHERE id = ?`).run(nowSec(), req.params.id);
    res.json({ ok: true });
  });

  router.post('/inbox/mark-all-read', (req, res) => {
    db.prepare(`UPDATE notifications SET read = 1, read_at = ? WHERE read = 0`).run(nowSec());
    res.json({ ok: true });
  });

  // ========== MANUAL TRIGGERS ==========
  router.post('/trigger/low-stock', async (req, res) => {
    const events = pollLowStock(db);
    const results = [];
    for (const e of events) results.push(await dispatch(db, e));
    res.json({ triggered: results.length, results });
  });

  router.post('/trigger/aging-digest', async (req, res) => {
    const e = buildAgingDigest(db);
    if (!e) return res.status(500).json({ error: 'could not build digest' });
    const r = await dispatch(db, e);
    res.json(r);
  });

  router.post('/trigger/daily-summary', async (req, res) => {
    const e = buildDailySummary(db);
    const r = await dispatch(db, e);
    res.json(r);
  });

  // Generic dispatch endpoint — for external callers
  router.post('/dispatch', async (req, res) => {
    const r = await dispatch(db, req.body || {});
    res.json(r);
  });

  // ========== START SCHEDULER ==========
  if (opts.startScheduler !== false) {
    startScheduler(db, opts.scheduler || {});
  }

  const mountPath = opts.mountPath || '/api/notifications';
  app.use(mountPath, router);

  console.log(`[notifications] mounted at ${mountPath}`);

  return {
    router, db,
    dispatch: (n) => dispatch(db, n),
    pollLowStock: () => pollLowStock(db),
    buildAgingDigest: () => buildAgingDigest(db),
    buildDailySummary: () => buildDailySummary(db),
  };
}

module.exports = { setupNotifications, SCHEMA_SQL };
