// server/refund-cancel-backend.js
// Refund & Cancel tracking — alert real-time + reporting + anomaly detection.
//
// Tujuan: refund/cancel itu fraud vector #1 di POS. Modul ini ngasih:
//   1. Real-time alert ke manager (via notifications: WhatsApp/Telegram/Email)
//   2. Full reporting dengan filter + summary + CSV export
//   3. 5 anomaly rules buat detect pola mencurigakan
//
// Endpoints (di /api/refund-cancel/*):
//   POST   /log-cancel          — log cancel event (call from cancel handler) → trigger alert + anomaly check
//   POST   /log-refund          — log refund event → trigger alert + anomaly check
//   GET    /transactions        — list dengan filter (date/kasir/type/amount)
//   GET    /summary             — KPI cards: total today, by kasir, by reason
//   GET    /by-kasir            — breakdown per kasir
//   GET    /by-reason           — frequency reason analysis
//   GET    /export-csv          — export CSV buat audit/owner review
//   GET    /audit/:order_ref    — full audit trail untuk single order

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB = path.join(__dirname, '..', 'data', 'kiosk.db');

// Anomaly thresholds — bisa override via opts atau pos_config
const DEFAULT_CONFIG = {
  large_amount_threshold: 200000,         // single refund/cancel > 200rb → alert
  high_rate_count_per_hour: 5,            // > 5 refund/cancel per kasir per jam
  late_refund_hours: 24,                  // refund > 24 jam setelah sale → suspicious
  always_alert_above: 100000,             // selalu alert kalau > 100rb regardless of rule
  alert_severity_threshold: 'warning',    // dispatch hanya jika severity >= ini
};

function nowSec() { return Math.floor(Date.now() / 1000); }
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function fmtIDR(n) {
  return new Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0}).format(Math.round(n||0));
}

// ============================================================
// ANOMALY DETECTION RULES (RC = Refund/Cancel)
// ============================================================
function checkAnomalies(db, event, config) {
  const findings = [];
  const { type, amount, kasir, order_ref, manager_id, reason, original_sale_at } = event;

  // RULE RC-1: Large single amount
  if (amount > config.large_amount_threshold) {
    findings.push({
      rule: 'RC-1',
      subtype: 'large_amount',
      severity: amount > config.large_amount_threshold * 2 ? 'critical' : 'warning',
      message: `${type === 'refund' ? 'Refund' : 'Cancel'} besar ${fmtIDR(amount)} (threshold ${fmtIDR(config.large_amount_threshold)})`
    });
  }

  // RULE RC-2: High rate — N events/hour by same kasir
  try {
    const oneHourAgo = nowSec() - 3600;
    const r = db.prepare(`
      SELECT COUNT(*) c FROM pos_events
      WHERE actor = ? AND event_type IN ('order_cancelled','order_refunded') AND created_at >= ?
    `).get(kasir, oneHourAgo);
    if (r.c >= config.high_rate_count_per_hour) {
      findings.push({
        rule: 'RC-2',
        subtype: 'high_rate',
        severity: 'critical',
        message: `${kasir} udah ${r.c} refund/cancel dalam 1 jam terakhir (threshold ${config.high_rate_count_per_hour})`
      });
    }
  } catch {}

  // RULE RC-3: Late refund — refund > N hours after original sale
  if (type === 'refund' && original_sale_at) {
    const hoursElapsed = (nowSec() - original_sale_at) / 3600;
    if (hoursElapsed > config.late_refund_hours) {
      findings.push({
        rule: 'RC-3',
        subtype: 'late_refund',
        severity: 'warning',
        message: `Refund ${hoursElapsed.toFixed(1)} jam setelah sale (threshold ${config.late_refund_hours}h)`
      });
    }
  }

  // RULE RC-4: Self-approval atau no manager — manager PIN tidak digunakan
  if (!manager_id) {
    findings.push({
      rule: 'RC-4',
      subtype: 'no_manager_pin',
      severity: 'critical',
      message: `${type === 'refund' ? 'Refund' : 'Cancel'} dilakukan TANPA manager PIN — bypass otorisasi!`
    });
  } else if (manager_id === kasir) {
    findings.push({
      rule: 'RC-4',
      subtype: 'self_approval',
      severity: 'critical',
      message: `Kasir ${kasir} approve sendiri pakai manager PIN — possible PIN sharing/leak`
    });
  }

  // RULE RC-5: No reason or reason too short
  if (!reason || reason.trim().length < 5) {
    findings.push({
      rule: 'RC-5',
      subtype: 'weak_reason',
      severity: 'warning',
      message: `Alasan terlalu pendek/kosong: "${reason || '(empty)'}"`
    });
  }

  return findings;
}

// ============================================================
// SETUP
// ============================================================
function setupRefundCancel(app, opts = {}) {
  const db = new Database(opts.dbPath || DEFAULT_DB);
  db.pragma('journal_mode = WAL');

  // Load config from pos_config or use defaults
  function loadConfig() {
    const cfg = { ...DEFAULT_CONFIG };
    try {
      const rows = db.prepare(`SELECT key, value FROM pos_config WHERE key LIKE 'RC_%'`).all();
      for (const r of rows) {
        const k = r.key.replace(/^RC_/, '').toLowerCase();
        if (k in cfg) cfg[k] = isNaN(Number(r.value)) ? r.value : Number(r.value);
      }
    } catch {}
    return cfg;
  }

  const logEvent = (e) => {
    try {
      if (typeof global.logPosEvent === 'function') {
        global.logPosEvent(e);
      } else {
        db.prepare(`INSERT INTO pos_events (event_type, event_subtype, payload, actor, severity, order_ref, created_at) VALUES (?,?,?,?,?,?,?)`)
          .run(e.event_type, e.event_subtype || null,
            e.payload ? JSON.stringify(e.payload) : null,
            e.actor || 'system', e.severity || 'info',
            e.order_ref || null, nowSec());
      }
    } catch {}
  };

  // Mirror anomalies into audit_anomalies so they show in the existing Anomali tab
  // (the Command Center tab reads audit_anomalies; pos_events alone wouldn't surface here).
  const logAuditAnomaly = (a) => {
    try {
      // keep 'critical' as-is so CommandCenter's Critical KPI counts it; map the rest to SV vocab
      const sevMap = { error: 'high', warning: 'medium', info: 'low' };
      const id = `RC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(`INSERT INTO audit_anomalies (id, type, severity, cashier_id, cashier_name, amount, detail, related_order_ids, ws_event)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, a.type, sevMap[a.severity] || a.severity || 'medium',
        a.cashier || null, a.cashier || null, Math.round(a.amount || 0),
        a.detail || '', a.order_ref || null, 'refund-cancel');
    } catch {}
  };

  const dispatchNotif = async (notif) => {
    try {
      if (typeof global.dispatchNotification === 'function') {
        await global.dispatchNotification(notif);
      }
    } catch {}
  };

  // ============================================================
  // CORE: process refund/cancel event
  // ============================================================
  async function processEvent(eventData) {
    const config = loadConfig();
    const event = {
      type: eventData.type,
      order_ref: eventData.order_ref,
      amount: Number(eventData.amount) || 0,
      kasir: eventData.kasir || eventData.cancelled_by || eventData.refunded_by,
      manager_id: eventData.manager_id || eventData.approved_by,
      reason: eventData.reason || '',
      items: eventData.items || null,
      original_sale_at: eventData.original_sale_at || null,
    };

    // 1. Log transaction event itself to pos_events
    logEvent({
      event_type: event.type === 'refund' ? 'order_refunded' : 'order_cancelled',
      payload: {
        amount: event.amount, kasir: event.kasir,
        manager_id: event.manager_id, reason: event.reason,
        items_count: Array.isArray(event.items) ? event.items.length : 0,
        original_sale_at: event.original_sale_at
      },
      order_ref: event.order_ref,
      actor: event.kasir,
      severity: event.amount > config.always_alert_above ? 'warning' : 'info'
    });

    // 2. Run anomaly detection (RC-1 to RC-5)
    const anomalies = checkAnomalies(db, event, config);
    for (const a of anomalies) {
      logEvent({
        event_type: 'anomaly_detected',
        event_subtype: a.subtype,
        payload: {
          rule: a.rule, message: a.message,
          order_ref: event.order_ref, kasir: event.kasir,
          amount: event.amount, reason: event.reason
        },
        order_ref: event.order_ref,
        actor: event.kasir,
        severity: a.severity
      });
      logAuditAnomaly({ type: a.subtype, severity: a.severity, cashier: event.kasir,
        amount: event.amount, detail: a.message, order_ref: event.order_ref });
    }

    // 2b. ALWAYS emit baseline anomaly_detected for the transaction itself.
    //     Refund/cancel inherently sensitive → tetap masuk Anomali view buat review,
    //     bahkan kalau gak ada specific RC rule yang fire.
    //     Severity escalates kalau ada rule fire: ambil tertinggi dari anomalies (or warning if amount > threshold, else info).
    let baselineSeverity = event.amount > config.always_alert_above ? 'warning' : 'info';
    const sevRank = { info: 0, warning: 1, error: 2, critical: 3 };
    for (const a of anomalies) if (sevRank[a.severity] > sevRank[baselineSeverity]) baselineSeverity = a.severity;

    logEvent({
      event_type: 'anomaly_detected',
      event_subtype: event.type === 'refund' ? 'refund_event' : 'cancel_event',
      payload: {
        rule: event.type === 'refund' ? 'RC-0R' : 'RC-0C',
        message: `${event.type === 'refund' ? 'Refund' : 'Cancel'} ${fmtIDR(event.amount)} oleh ${event.kasir}${event.manager_id ? ` (approved by ${event.manager_id})` : ' (TANPA manager PIN — investigasi!)'}`,
        amount: event.amount, kasir: event.kasir, manager_id: event.manager_id,
        reason: event.reason, items_count: Array.isArray(event.items) ? event.items.length : 0,
        flag_count: anomalies.length,
        flags: anomalies.map(a => a.rule)
      },
      order_ref: event.order_ref,
      actor: event.kasir,
      severity: baselineSeverity
    });
    logAuditAnomaly({
      type: event.type === 'refund' ? 'refund_event' : 'cancel_event',
      severity: baselineSeverity,
      cashier: event.kasir,
      amount: event.amount,
      detail: `${event.type === 'refund' ? 'Refund' : 'Cancel'} ${fmtIDR(event.amount)} oleh ${event.kasir}` +
        `${event.manager_id ? ` (approved ${event.manager_id})` : ' (TANPA manager PIN — investigasi!)'}` +
        `${anomalies.length ? ` · ${anomalies.length} flag` : ''}`,
      order_ref: event.order_ref,
    });

    // 3. Determine highest severity
    let maxSeverity = 'info';
    const sevOrder = { info: 0, warning: 1, error: 2, critical: 3 };
    for (const a of anomalies) if (sevOrder[a.severity] > sevOrder[maxSeverity]) maxSeverity = a.severity;
    if (event.amount > config.always_alert_above && sevOrder['warning'] > sevOrder[maxSeverity]) maxSeverity = 'warning';

    // 4. Dispatch notification if severity high enough
    if (sevOrder[maxSeverity] >= sevOrder[config.alert_severity_threshold]) {
      const icon = event.type === 'refund' ? '↩️' : '❌';
      const verb = event.type === 'refund' ? 'REFUND' : 'CANCEL';
      const flagsText = anomalies.length > 0
        ? `\n\n🚩 Flag(s):\n${anomalies.map(a => `  • [${a.rule}] ${a.message}`).join('\n')}`
        : '';

      await dispatchNotif({
        event_type: event.type === 'refund' ? 'order_refunded' : 'order_cancelled',
        severity: maxSeverity,
        title: `${icon} ${verb} ${fmtIDR(event.amount)} — ${event.order_ref}`,
        body:
          `Order: ${event.order_ref}\n` +
          `Kasir: ${event.kasir}\n` +
          `Manager: ${event.manager_id || '(no PIN — wajib check!)'}\n` +
          `Alasan: ${event.reason || '(tidak ada alasan)'}\n` +
          `Amount: ${fmtIDR(event.amount)}` +
          flagsText,
        payload: { ...event, anomalies, max_severity: maxSeverity }
      });
    }

    return { ok: true, anomalies, severity: maxSeverity };
  }

  // ============================================================
  // ROUTER
  // ============================================================
  const router = express.Router();
  router.use(express.json());

  router.post('/log-cancel', async (req, res) => {
    const r = await processEvent({ ...req.body, type: 'cancel' });
    res.json(r);
  });

  router.post('/log-refund', async (req, res) => {
    const r = await processEvent({ ...req.body, type: 'refund' });
    res.json(r);
  });

  // List transactions with filters
  router.get('/transactions', (req, res) => {
    const { from, to, kasir, type, min_amount, max_amount, limit = 100, offset = 0 } = req.query;
    const types = [];
    if (!type || type === 'all') types.push('order_cancelled', 'order_refunded');
    else if (type === 'cancel') types.push('order_cancelled');
    else if (type === 'refund') types.push('order_refunded');

    let sql = `SELECT id, event_type, event_subtype, payload, actor, severity, order_ref, created_at FROM pos_events WHERE event_type IN (${types.map(() => '?').join(',')})`;
    const params = [...types];
    if (from) { sql += ' AND created_at >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND created_at <= ?'; params.push(Number(to)); }
    if (kasir) { sql += ' AND actor = ?'; params.push(kasir); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const rows = db.prepare(sql).all(...params);

    let result = rows.map(r => {
      const p = safeJson(r.payload) || {};
      return {
        id: r.id, type: r.event_type === 'order_cancelled' ? 'cancel' : 'refund',
        order_ref: r.order_ref, kasir: r.actor, severity: r.severity,
        amount: p.amount || 0, reason: p.reason || '', manager_id: p.manager_id || null,
        items_count: p.items_count || 0, created_at: r.created_at
      };
    });
    if (min_amount) result = result.filter(r => r.amount >= Number(min_amount));
    if (max_amount) result = result.filter(r => r.amount <= Number(max_amount));

    res.json(result);
  });

  // Summary KPIs
  router.get('/summary', (req, res) => {
    const { from } = req.query;
    const fromTs = from ? Number(from) : Math.floor(new Date().setHours(0,0,0,0)/1000);

    const rows = db.prepare(`
      SELECT event_type, payload, actor FROM pos_events
      WHERE event_type IN ('order_cancelled','order_refunded') AND created_at >= ?
    `).all(fromTs);

    let cancelCount = 0, cancelAmount = 0;
    let refundCount = 0, refundAmount = 0;
    const byKasir = {};
    for (const r of rows) {
      const p = safeJson(r.payload) || {};
      const amt = p.amount || 0;
      if (r.event_type === 'order_cancelled') { cancelCount++; cancelAmount += amt; }
      else { refundCount++; refundAmount += amt; }
      if (!byKasir[r.actor]) byKasir[r.actor] = { kasir: r.actor, count: 0, amount: 0 };
      byKasir[r.actor].count++;
      byKasir[r.actor].amount += amt;
    }

    // Anomaly count
    let anomalies = 0;
    try {
      anomalies = db.prepare(`
        SELECT COUNT(*) c FROM pos_events
        WHERE event_type = 'anomaly_detected' AND event_subtype IN ('large_amount','high_rate','late_refund','self_approval','weak_reason')
          AND created_at >= ?
      `).get(fromTs).c;
    } catch {}

    res.json({
      from: fromTs,
      cancel: { count: cancelCount, amount: cancelAmount },
      refund: { count: refundCount, amount: refundAmount },
      total: { count: cancelCount + refundCount, amount: cancelAmount + refundAmount },
      by_kasir: Object.values(byKasir).sort((a,b) => b.amount - a.amount),
      anomaly_count: anomalies
    });
  });

  // By reason analysis
  router.get('/by-reason', (req, res) => {
    const { from } = req.query;
    const fromTs = from ? Number(from) : Math.floor(Date.now()/1000) - 30*86400;
    const rows = db.prepare(`
      SELECT payload FROM pos_events
      WHERE event_type IN ('order_cancelled','order_refunded') AND created_at >= ?
    `).all(fromTs);
    const reasons = {};
    for (const r of rows) {
      const p = safeJson(r.payload) || {};
      const reason = (p.reason || '(no reason)').toLowerCase().trim().slice(0, 50);
      if (!reasons[reason]) reasons[reason] = { reason, count: 0, total_amount: 0 };
      reasons[reason].count++;
      reasons[reason].total_amount += (p.amount || 0);
    }
    res.json(Object.values(reasons).sort((a,b) => b.count - a.count));
  });

  // Audit trail for single order
  router.get('/audit/:order_ref', (req, res) => {
    const events = db.prepare(`
      SELECT * FROM pos_events WHERE order_ref = ? ORDER BY created_at ASC
    `).all(req.params.order_ref);
    res.json(events.map(e => ({ ...e, payload: safeJson(e.payload) })));
  });

  // CSV export
  router.get('/export-csv', (req, res) => {
    const { from, to } = req.query;
    let sql = `SELECT created_at, event_type, order_ref, actor, payload FROM pos_events
               WHERE event_type IN ('order_cancelled','order_refunded')`;
    const params = [];
    if (from) { sql += ' AND created_at >= ?'; params.push(Number(from)); }
    if (to) { sql += ' AND created_at <= ?'; params.push(Number(to)); }
    sql += ' ORDER BY created_at DESC';
    const rows = db.prepare(sql).all(...params);

    const csv = ['Tanggal,Tipe,Order Ref,Kasir,Manager,Amount,Alasan'];
    for (const r of rows) {
      const p = safeJson(r.payload) || {};
      const dt = new Date(r.created_at * 1000).toISOString().replace('T',' ').slice(0,19);
      const type = r.event_type === 'order_cancelled' ? 'Cancel' : 'Refund';
      const reason = (p.reason || '').replace(/"/g, '""').replace(/\n/g, ' ');
      csv.push(`${dt},${type},${r.order_ref || ''},${r.actor || ''},${p.manager_id || ''},${p.amount || 0},"${reason}"`);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=refund-cancel-${Date.now()}.csv`);
    res.send('\uFEFF' + csv.join('\n')); // BOM untuk Excel detect UTF-8
  });

  const mountPath = opts.mountPath || '/api/refund-cancel';
  app.use(mountPath, router);

  console.log(`[refund-cancel] mounted at ${mountPath}`);

  return { router, db, processEvent };
}

module.exports = { setupRefundCancel };
