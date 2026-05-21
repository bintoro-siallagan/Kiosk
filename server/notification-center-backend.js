// server/notification-center-backend.js
// Notification Center — hub alert terpusat, agregasi notifikasi dari
// seluruh modul operasi (stok, batch, insiden, aset, pembayaran, dll).
//
//   GET  /api/notification-center            — feed alert ter-prioritas
//   POST /api/notification-center/:key/dismiss — tandai selesai

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notif_dismissed (
  notif_key TEXT PRIMARY KEY, dismissed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`;
const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);
const PRANK = { high: 0, medium: 1, low: 2 };

function setupNotificationCenter(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const many = (s) => { try { return db.prepare(s).all(); } catch { return []; } };

  const collect = () => {
    const n = [];
    const N = nowSec();
    // Stok menipis
    for (const w of many(`SELECT id, name, unit, stock, min_stock FROM audit_warehouse WHERE stock < min_stock`))
      n.push({ key: `stock-${w.id}`, category: 'Inventory', priority: 'high', icon: '📦',
        title: `Stok menipis — ${w.name}`, detail: `${w.stock} ${w.unit} · di bawah minimum ${w.min_stock}`, source: 'Gudang' });
    // Batch kedaluwarsa / mendekati
    for (const b of many(`SELECT batch_no, item_name, expiry_at FROM stock_batches WHERE discarded = 0`)) {
      const days = Math.floor((b.expiry_at - N) / DAY);
      if (days < 0) n.push({ key: `batch-${b.batch_no}`, category: 'Inventory', priority: 'high', icon: '📅',
        title: `Batch kedaluwarsa — ${b.item_name}`, detail: `${b.batch_no} · lewat ${-days} hari`, source: 'Batch Tracking' });
      else if (days <= 7) n.push({ key: `batch-${b.batch_no}`, category: 'Inventory', priority: 'medium', icon: '📅',
        title: `Batch mendekati expired — ${b.item_name}`, detail: `${b.batch_no} · ${days} hari lagi`, source: 'Batch Tracking' });
    }
    // Insiden aktif
    for (const i of many(`SELECT incident_no, title, severity, outlet FROM incidents WHERE status != 'resolved'`))
      n.push({ key: `inc-${i.incident_no}`, category: 'Operations', priority: i.severity === 'critical' || i.severity === 'high' ? 'high' : 'medium',
        icon: '🚨', title: `Insiden — ${i.title}`, detail: `${i.outlet} · ${i.severity}`, source: 'Incident' });
    // Maintenance telat
    for (const a of many(`SELECT name, outlet, next_service, status FROM assets WHERE status = 'broken' OR next_service < ${N}`))
      n.push({ key: `asset-${a.name}-${a.outlet}`, category: 'Operations', priority: a.status === 'broken' ? 'high' : 'medium',
        icon: '🔧', title: `${a.status === 'broken' ? 'Aset rusak' : 'Service telat'} — ${a.name}`, detail: a.outlet, source: 'Asset & Maintenance' });
    // Pembayaran jatuh tempo
    for (const p of many(`SELECT payee, amount FROM payment_releases WHERE status = 'pending' AND due_date < ${N}`))
      n.push({ key: `pay-${p.payee}`, category: 'Finance', priority: 'high', icon: '💸',
        title: `Pembayaran telat — ${p.payee}`, detail: `Rp ${Math.round(p.amount).toLocaleString('id-ID')}`, source: 'Release Payment' });
    // GR belum dikonfirmasi — outlet suka lupa konfirmasi GR
    for (const gr of many(`SELECT gr_number, outlet, created_at FROM goods_received WHERE status = 'pending'`)) {
      const days = Math.floor((N - gr.created_at) / DAY);
      if (days >= 3) n.push({ key: `gr-${gr.gr_number}`, category: 'Inventory', priority: 'high', icon: '📥',
        title: `Outlet lupa konfirmasi GR — ${gr.outlet}`, detail: `${gr.gr_number} · pending ${days} hari, stok belum masuk`, source: 'Good Received' });
      else if (days >= 1) n.push({ key: `gr-${gr.gr_number}`, category: 'Inventory', priority: 'medium', icon: '📥',
        title: `GR belum dikonfirmasi — ${gr.outlet}`, detail: `${gr.gr_number} · pending ${days} hari`, source: 'Good Received' });
    }
    // Periode belum ditutup
    for (const pc of many(`SELECT period_name, closing_type FROM period_closings WHERE status = 'open'`))
      n.push({ key: `period-${pc.closing_type}-${pc.period_name}`, category: 'Finance', priority: 'low', icon: '🔒',
        title: `Periode ${pc.closing_type} belum ditutup`, detail: pc.period_name, source: 'Period Closing' });
    // Pajak belum disetor — jangan lupa bayar pajak (PPN & PPh)
    const taxRows = many(`SELECT label, amount, status, due_date, tax_type, flow FROM tax_records`);
    if (taxRows.length) {
      const fmt = (v) => 'Rp ' + Math.round(v).toLocaleString('id-ID');
      const ppnOut = taxRows.filter(t => t.tax_type === 'PPN' && t.flow === 'output');
      const ppnIn = taxRows.filter(t => t.tax_type === 'PPN' && t.flow === 'input').reduce((s, t) => s + t.amount, 0);
      const ppnPayable = ppnOut.reduce((s, t) => s + t.amount, 0) - ppnIn;
      const ppnDue = (ppnOut[0] || {}).due_date || N;
      if (ppnPayable > 0 && ppnOut.some(t => t.status !== 'paid')) {
        const days = Math.floor((ppnDue - N) / DAY);
        n.push({ key: 'tax-ppn', category: 'Finance', priority: days <= 7 ? 'high' : 'medium', icon: '🧾',
          title: 'PPN kurang bayar belum disetor', detail: `${fmt(ppnPayable)} · ${days < 0 ? `TELAT ${-days} hari` : `jatuh tempo ${days} hari lagi`}`, source: 'Core Tax' });
      }
      for (const t of taxRows.filter(x => x.flow === 'pph' && x.status !== 'paid')) {
        const days = Math.floor((t.due_date - N) / DAY);
        n.push({ key: `tax-${t.label}`, category: 'Finance', priority: days <= 7 ? 'high' : 'medium', icon: '🧾',
          title: `${t.tax_type} belum disetor`, detail: `${t.label} · ${fmt(t.amount)} · ${days < 0 ? `TELAT ${-days} hari` : `${days} hari lagi`}`, source: 'Core Tax' });
      }
    }
    // Izin & sertifikat — alert masa berlaku
    for (const lc of many(`SELECT type, name, outlet, expiry_date FROM compliance_licenses WHERE is_active = 1`)) {
      const days = Math.floor((lc.expiry_date - N) / DAY);
      if (days < 0) n.push({ key: `lic-${lc.name}-${lc.outlet}`, category: 'Operasi', priority: 'high', icon: '📋',
        title: `Izin kedaluwarsa — ${lc.type}`, detail: `${lc.name} · ${lc.outlet} · lewat ${-days} hari`, source: 'Compliance' });
      else if (days <= 60) n.push({ key: `lic-${lc.name}-${lc.outlet}`, category: 'Operasi', priority: 'medium', icon: '📋',
        title: `Izin segera habis — ${lc.type}`, detail: `${lc.name} · ${lc.outlet} · ${days} hari lagi`, source: 'Compliance' });
    }
    return n;
  };

  const router = express.Router();
  router.use(express.json());

  router.get('/', (req, res) => {
    const dismissed = new Set(many(`SELECT notif_key FROM notif_dismissed`).map(r => r.notif_key));
    const notifs = collect().filter(x => !dismissed.has(x.key))
      .sort((a, b) => PRANK[a.priority] - PRANK[b.priority]);
    const byCat = {};
    for (const x of notifs) byCat[x.category] = (byCat[x.category] || 0) + 1;
    res.json({
      notifications: notifs,
      summary: {
        total: notifs.length,
        high: notifs.filter(x => x.priority === 'high').length,
        medium: notifs.filter(x => x.priority === 'medium').length,
        by_category: Object.entries(byCat).map(([category, count]) => ({ category, count })),
      },
    });
  });

  router.post('/:key/dismiss', (req, res) => {
    db.prepare(`INSERT OR IGNORE INTO notif_dismissed (notif_key) VALUES (?)`).run(req.params.key);
    res.json({ ok: true });
  });

  const mountPath = opts.mountPath || '/api/notification-center';
  app.use(mountPath, router);
  console.log(`[notification-center] mounted at ${mountPath} — unified alert hub`);

  return { router, db };
}

module.exports = { setupNotificationCenter };
