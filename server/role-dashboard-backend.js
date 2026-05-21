// server/role-dashboard-backend.js
// Role Dashboards — tiap role punya dashboard berbeda (widget KPI
// sesuai fokus role: Owner finance, Warehouse inventory, dst).
//
//   GET /api/role-dashboard

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

// Dashboard config per role — w: [metricKey, icon, label, fmt]
const DASH = {
  'super-admin':    { icon: '👑', title: 'HQ Control Overview', focus: 'Kontrol penuh seluruh sistem', accent: '#a855f7',
    w: [['revenue', '💰', 'Total Revenue', 'rp'], ['outlets', '🏢', 'Outlet', 'num'], ['crew', '👥', 'Total Crew', 'num'], ['security', '🛡️', 'Security Threat', 'num'], ['approvals', '⚖️', 'Approval Pending', 'num'], ['campaigns', '📡', 'Campaign Live', 'num']] },
  'owner':          { icon: '💼', title: 'Executive Dashboard', focus: 'Business & finance health', accent: '#3b82f6',
    w: [['revenue', '💰', 'Revenue', 'rp'], ['network_revenue', '🏢', 'Network Revenue', 'rp'], ['ar', '📥', 'Piutang AR', 'rp'], ['ap', '📤', 'Hutang AP', 'rp'], ['feedback', '⭐', 'Satisfaction', 'rating']] },
  'area-manager':   { icon: '🗺️', title: 'Regional Dashboard', focus: 'Performa & isu regional', accent: '#06b6d4',
    w: [['outlets', '🏢', 'Outlet Regional', 'num'], ['network_revenue', '💰', 'Revenue Area', 'rp'], ['approvals', '⚖️', 'Approval Regional', 'num'], ['stock_low', '📦', 'Stock Alert', 'num'], ['feedback', '⭐', 'Avg Rating', 'rating']] },
  'outlet-manager': { icon: '🏪', title: 'Outlet Operations', focus: 'Operasional & staff harian', accent: '#10b981',
    w: [['orders', '🛒', 'Total Order', 'num'], ['crew', '👥', 'Crew', 'num'], ['stock_low', '📦', 'Stock Alert', 'num'], ['feedback', '⭐', 'Rating', 'rating'], ['approvals', '⚖️', 'Approval', 'num']] },
  'supervisor':     { icon: '🧭', title: 'Shift Monitor', focus: 'Operasional shift', accent: '#f59e0b',
    w: [['orders', '🛒', 'Order', 'num'], ['approvals', '⚖️', 'Approval Pending', 'num'], ['security', '🚨', 'Incident', 'num'], ['feedback', '⭐', 'Rating', 'rating']] },
  'cashier':        { icon: '🧑‍💼', title: 'POS Dashboard', focus: 'Transaksi & customer service', accent: '#22d3ee',
    w: [['orders', '🛒', 'Total Order', 'num'], ['members', '💳', 'Member', 'num'], ['redemptions', '🎁', 'Reward Redeem', 'num']] },
  'kitchen':        { icon: '👨‍🍳', title: 'Kitchen Display', focus: 'Antrian & prep', accent: '#f97316',
    w: [['orders', '🍳', 'Order Diproses', 'num']] },
  'warehouse':      { icon: '📦', title: 'Inventory Dashboard', focus: 'Stok & transfer', accent: '#84cc16',
    w: [['stock_items', '📦', 'Item Gudang', 'num'], ['stock_low', '⚠️', 'Stock Menipis', 'num']] },
  'procurement':    { icon: '🛒', title: 'Procurement Dashboard', focus: 'PR/PO & supplier', accent: '#eab308',
    w: [['ap', '📤', 'Hutang Vendor', 'rp'], ['approvals', '⚖️', 'Approval PO', 'num']] },
  'finance':        { icon: '💰', title: 'Finance Dashboard', focus: 'Settlement & AP/AR', accent: '#10b981',
    w: [['revenue', '💰', 'Revenue', 'rp'], ['ar', '📥', 'Piutang AR', 'rp'], ['ap', '📤', 'Hutang AP', 'rp'], ['payroll', '👥', 'Payroll Cost', 'rp']] },
  'hr':             { icon: '👥', title: 'HR Dashboard', focus: 'Attendance, payroll & reward', accent: '#14b8a6',
    w: [['crew', '👥', 'Total Crew', 'num'], ['payroll', '💰', 'Payroll Cost', 'rp'], ['redemptions', '🎁', 'Reward Redeem', 'num']] },
  'marketing':      { icon: '🎯', title: 'Marketing Dashboard', focus: 'Campaign & customer analytics', accent: '#d946ef',
    w: [['campaigns', '📡', 'Campaign Live', 'num'], ['members', '💳', 'Member', 'num'], ['feedback', '⭐', 'Satisfaction', 'rating'], ['feedback_count', '💬', 'Total Feedback', 'num']] },
  'auditor':        { icon: '🔍', title: 'Audit Dashboard', focus: 'Audit trail & compliance — read-only', accent: '#9ca3af',
    w: [['security', '🛡️', 'Security Threat', 'num'], ['approvals', '⚖️', 'Approval Log', 'num'], ['orders', '📜', 'Transaksi', 'num']] },
  'franchise':      { icon: '🏛️', title: 'Franchise Dashboard', focus: 'Outlet franchise sendiri', accent: '#fbbf24',
    w: [['network_revenue', '💰', 'Revenue', 'rp'], ['outlets', '🏢', 'Outlet', 'num'], ['feedback', '⭐', 'Satisfaction', 'rating']] },
  'customer':       { icon: '🙋', title: 'Customer Portal', focus: 'QR order, loyalty, booking, feedback, leaderboard', accent: '#ec4899', w: [] },
};
const ROLE_ORDER = Object.keys(DASH);

function setupRoleDashboard(app, opts = {}) {
  const db = new Database(opts.dbPath || path.join(__dirname, 'data.db'));
  db.pragma('journal_mode = WAL');
  const v = (sql, def = 0) => { try { const r = db.prepare(sql).get(); const k = Object.keys(r)[0]; return r[k] == null ? def : r[k]; } catch { return def; } };

  const router = express.Router();

  router.get('/', (req, res) => {
    const M = {
      revenue: v(`SELECT COALESCE(SUM(total),0) x FROM orders`),
      orders: v(`SELECT COUNT(*) x FROM orders`),
      outlets: v(`SELECT COUNT(*) x FROM outlets`),
      network_revenue: v(`SELECT COALESCE(SUM(revenue_today),0) x FROM outlets`),
      crew: v(`SELECT COUNT(*) x FROM staff_rewards`),
      stock_items: v(`SELECT COUNT(*) x FROM audit_warehouse`),
      stock_low: v(`SELECT COUNT(*) x FROM audit_warehouse WHERE stock < 20`),
      feedback: Math.round(v(`SELECT AVG(rating) x FROM customer_feedback`) * 10) / 10,
      feedback_count: v(`SELECT COUNT(*) x FROM customer_feedback`),
      approvals: v(`SELECT COUNT(*) x FROM approval_requests WHERE status='pending'`),
      ap: v(`SELECT COALESCE(SUM(amount),0) x FROM vendor_invoices WHERE status!='paid'`),
      ar: v(`SELECT COALESCE(SUM(amount-paid_amount),0) x FROM ar_invoices WHERE status!='paid'`),
      campaigns: v(`SELECT COUNT(*) x FROM campaigns WHERE status='live'`),
      members: v(`SELECT COUNT(*) x FROM customers WHERE tags LIKE '%member%' OR tags LIKE '%vip%'`),
      security: v(`SELECT COUNT(*) x FROM login_sessions WHERE status='active' AND suspicious=1`),
      payroll: v(`SELECT COALESCE(SUM(total_cost),0) x FROM payroll_runs`),
      redemptions: v(`SELECT COUNT(*) x FROM reward_redemptions`),
    };
    const dashboards = ROLE_ORDER.map(id => {
      const c = DASH[id];
      return {
        id, icon: c.icon, title: c.title, focus: c.focus, accent: c.accent,
        widgets: c.w.map(([key, icon, label, fmt]) => ({ icon, label, fmt, value: M[key] != null ? M[key] : 0 })),
      };
    });
    res.json({ dashboards, metrics: M });
  });

  const mountPath = opts.mountPath || '/api/role-dashboard';
  app.use(mountPath, router);
  console.log(`[role-dashboard] mounted at ${mountPath} — per-role dashboards`);

  return { router, db };
}

module.exports = { setupRoleDashboard };
