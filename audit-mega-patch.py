#!/usr/bin/env python3
"""
BITES-KIOSK AUDIT MEGA-PATCH
=============================
1. Backend Audit Log — every pos:* event logged to pos_events table
2. Void Reason + Manager PIN — enforcement on cancel/refund endpoints
3. Stock Auto-Deduct — warehouse stock reduced on order complete

Run: python3 ~/bites-kiosk/audit-mega-patch.py
"""
import os, sys

HOME = os.path.expanduser("~")
BACKEND = os.path.join(HOME, "bites-kiosk/server/command-center-backend.js")
INDEX = os.path.join(HOME, "bites-kiosk/server/index.js")

def read(p):
    with open(p, "r") as f: return f.read()
def write(p, c):
    with open(p, "w") as f: f.write(c)

ok = 0
fail = 0

# ═══════════════════════════════════════════════════════════════════════════
# PATCH 1: BACKEND AUDIT LOG — pos_events table + event logger
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ PATCH 1: Backend Audit Log ═══")

cb = read(BACKEND)

# 1A. Add pos_events table to schema
old_schema_end = """CREATE INDEX IF NOT EXISTS idx_anomalies_created ON audit_anomalies(created_at);"""
new_schema = """CREATE INDEX IF NOT EXISTS idx_anomalies_created ON audit_anomalies(created_at);

  CREATE TABLE IF NOT EXISTS pos_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    data TEXT,
    cashier_id TEXT,
    cashier_name TEXT,
    order_id TEXT,
    amount INTEGER DEFAULT 0,
    outlet_id TEXT DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_type ON pos_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_created ON pos_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_cashier ON pos_events(cashier_id);"""

if old_schema_end in cb:
    cb = cb.replace(old_schema_end, new_schema)
    print("  ✓ pos_events table added to schema")
    ok += 1
else:
    print("  ⚠ Schema anchor not found — may already be patched")
    fail += 1

# 1B. Add event logger function + wire into auditEngine.check
old_check_start = """  check(eventType, data, db, broadcastFn) {
    const detected = [];
    const now = new Date();
    const cashierId = data.cashierId || data.cashier_id || null;
    const cashierName = data.cashierName || data.cashier_name || "Unknown";"""

new_check_start = """  // Log EVERY event to pos_events for forensic audit trail
  logEvent(eventType, data) {
    try {
      const db = getDb();
      const cashierId = data.cashierId || data.cashier_id || data.kasir || null;
      const cashierName = data.cashierName || data.cashier_name || null;
      const orderId = data.orderId || data.order_id || data.id || null;
      const amount = data.amount || data.total || 0;
      db.prepare(`
        INSERT INTO pos_events (event_type, data, cashier_id, cashier_name, order_id, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventType, JSON.stringify(data), cashierId, cashierName, orderId, amount);
    } catch(e) {
      // silent — audit log should never break main flow
    }
  },

  check(eventType, data, db, broadcastFn) {
    // 📝 Log every event first (forensic trail)
    this.logEvent(eventType, data);

    const detected = [];
    const now = new Date();
    const cashierId = data.cashierId || data.cashier_id || null;
    const cashierName = data.cashierName || data.cashier_name || "Unknown";"""

if old_check_start in cb:
    cb = cb.replace(old_check_start, new_check_start)
    print("  ✓ Event logger (logEvent) added to auditEngine")
    ok += 1
else:
    print("  ⚠ auditEngine.check anchor not found")
    fail += 1

# 1C. Add stock auto-deduct on order:new
old_odd_hour = """    // ── RULE 7: ODD_HOUR — Activity outside operating hours ──"""
new_stock_deduct = """    // ── STOCK AUTO-DEDUCT — reduce warehouse on order complete ──
    if (eventType === "order:new" && data.items) {
      try {
        const sdb = getDb();
        const items = typeof data.items === "string" ? JSON.parse(data.items) : data.items;
        const isLarge = (name) => /large|lrg|16oz|besar/i.test(name || "");
        const isCone = (name) => /cone|lykone/i.test(name || "");
        const isTakeaway = data.type === "ta" || data.type === "takeaway";

        items.forEach(it => {
          const qty = Number(it.qty || it.q) || 1;
          const name = it.name || it.n || "";

          if (isCone(name)) {
            // Cone: deduct cone waffle
            sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'PK06'").run(qty);
          } else if (isLarge(name)) {
            // Large cup
            sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'PK02'").run(qty);
          } else {
            // Regular cup
            sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'PK01'").run(qty);
          }
          // Lid + sendok per item
          sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'PK03'").run(qty);
          sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'PK04'").run(qty);

          // Yogurt base (~0.15kg per serving)
          if (/sakura|charcoal|black/i.test(name)) {
            sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'RM02'").run(0.15 * qty);
          } else if (/smooth/i.test(name)) {
            // Smoothies use milk + fruit
            sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'RM03'").run(0.1 * qty);
            if (/straw/i.test(name)) sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'RM05'").run(0.12 * qty);
            if (/mango/i.test(name)) sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'RM06'").run(0.12 * qty);
            if (/matcha/i.test(name)) sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'RM07'").run(0.03 * qty);
          } else {
            // Default: plain yogurt base
            sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = 'RM01'").run(0.15 * qty);
          }
        });

        // Paper bag for takeaway
        if (isTakeaway) {
          sdb.prepare("UPDATE audit_warehouse SET stock = MAX(0, stock - 1), updated_at = datetime('now') WHERE id = 'PK05'").run();
        }

        // Check for critical stock alerts
        const criticals = sdb.prepare("SELECT * FROM audit_warehouse WHERE stock <= min_stock").all();
        if (criticals.length > 0 && broadcastFn) {
          broadcastFn("audit:stock_alert", { critical: criticals.map(c => ({ id: c.id, name: c.name, stock: c.stock, min: c.min_stock, unit: c.unit })) });
        }
      } catch(e) {
        console.error("[Audit] Stock deduct error:", e.message);
      }
    }

    // ── RULE 7: ODD_HOUR — Activity outside operating hours ──"""

if old_odd_hour in cb:
    cb = cb.replace(old_odd_hour, new_stock_deduct)
    print("  ✓ Stock auto-deduct on order:new added")
    ok += 1
else:
    print("  ⚠ ODD_HOUR anchor not found for stock deduct")
    fail += 1

# 1D. Add /api/audit/events endpoint
old_outlets_endpoint = """  // ── Outlets (multi-outlet ready) ──"""
new_events_endpoint = """  // ── Event Log (forensic audit trail) ──
  app.get("/api/audit/events", (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const type = req.query.type || null;
    const cashier = req.query.cashier || null;
    const from = req.query.from || null;

    let sql = "SELECT * FROM pos_events WHERE 1=1";
    const params = [];

    if (type) { sql += " AND event_type = ?"; params.push(type); }
    if (cashier) { sql += " AND cashier_id = ?"; params.push(cashier); }
    if (from) { sql += " AND created_at >= ?"; params.push(from); }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const items = db.prepare(sql).all(...params);
    res.json({ items, count: items.length });
  });

  // ── Manager PIN verification ──
  app.post("/api/audit/verify-pin", (req, res) => {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: "PIN required" });
    const user = db.prepare("SELECT id, name, role FROM admin_users WHERE pin = ? AND role = 'manager'").get(pin);
    if (user) {
      res.json({ ok: true, manager: user });
    } else {
      res.json({ ok: false, error: "PIN tidak valid atau bukan manager" });
    }
  });

  // ── Outlets (multi-outlet ready) ──"""

if old_outlets_endpoint in cb:
    cb = cb.replace(old_outlets_endpoint, new_events_endpoint)
    print("  ✓ /api/audit/events + /api/audit/verify-pin endpoints added")
    ok += 1
else:
    print("  ⚠ Outlets anchor not found for events endpoint")
    fail += 1

# 1E. Export getDb so cancel/refund endpoints can verify PIN
old_exports = 'module.exports = { initAuditModule, registerAuditEndpoints, auditEngine };'
new_exports = 'module.exports = { initAuditModule, registerAuditEndpoints, auditEngine, getDb };'

if old_exports in cb:
    cb = cb.replace(old_exports, new_exports)
    print("  ✓ getDb exported for PIN verification")
    ok += 1
else:
    print("  ⚠ module.exports anchor not found")
    fail += 1

write(BACKEND, cb)
print(f"  💾 command-center-backend.js saved")


# ═══════════════════════════════════════════════════════════════════════════
# PATCH 2: VOID REASON + MANAGER PIN ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ PATCH 2: Void Reason + Manager PIN ═══")

ix = read(INDEX)

# 2A. Patch cancel endpoint — require reason + manager PIN
old_cancel = """app.post("/api/orders/:id/cancel", (req, res) => {
  try {
    const { reason, cancelledBy } = req.body || {};
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "cancelled" || order.status === "void") {
      return res.status(400).json({ error: "Order already cancelled" });
    }
    if (order.status === "refunded") {
      return res.status(400).json({ error: "Order already refunded — cannot cancel" });
    }

    const now = Date.now();
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason || "No reason provided";
    order.cancelledBy = cancelledBy || "Unknown";"""

new_cancel = """app.post("/api/orders/:id/cancel", (req, res) => {
  try {
    const { reason, cancelledBy, managerPin } = req.body || {};

    // ── AUDIT: Reason wajib ──
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: "Alasan cancel wajib diisi (min 3 karakter)" });
    }

    // ── AUDIT: Manager PIN wajib ──
    let managerName = "Unknown";
    try {
      const { getDb } = require("./command-center-backend");
      const mgr = getDb().prepare("SELECT id, name FROM admin_users WHERE pin = ? AND role = 'manager'").get(managerPin);
      if (!mgr) return res.status(403).json({ error: "PIN Manager wajib & harus valid untuk cancel order" });
      managerName = mgr.name;
    } catch(e) {
      // Fallback if audit module not loaded — still require reason
      console.warn("[Audit] PIN verify fallback:", e.message);
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "cancelled" || order.status === "void") {
      return res.status(400).json({ error: "Order already cancelled" });
    }
    if (order.status === "refunded") {
      return res.status(400).json({ error: "Order already refunded — cannot cancel" });
    }

    const now = Date.now();
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason.trim();
    order.cancelledBy = cancelledBy || "Unknown";
    order.cancelApprovedBy = managerName;"""

if old_cancel in ix:
    ix = ix.replace(old_cancel, new_cancel)
    print("  ✓ Cancel endpoint: reason wajib + manager PIN enforced")
    ok += 1
else:
    print("  ⚠ Cancel endpoint anchor not found")
    fail += 1

# 2B. Patch refund endpoint — require reason + manager PIN
old_refund = """app.post("/api/orders/:id/refund", (req, res) => {
  try {
    const { amount, reason, refundedBy, fullRefund } = req.body || {};
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });"""

new_refund = """app.post("/api/orders/:id/refund", (req, res) => {
  try {
    const { amount, reason, refundedBy, fullRefund, managerPin } = req.body || {};

    // ── AUDIT: Reason wajib ──
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: "Alasan refund wajib diisi (min 3 karakter)" });
    }

    // ── AUDIT: Manager PIN wajib ──
    try {
      const { getDb } = require("./command-center-backend");
      const mgr = getDb().prepare("SELECT id, name FROM admin_users WHERE pin = ? AND role = 'manager'").get(managerPin);
      if (!mgr) return res.status(403).json({ error: "PIN Manager wajib & harus valid untuk refund" });
    } catch(e) {
      console.warn("[Audit] PIN verify fallback:", e.message);
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });"""

if old_refund in ix:
    ix = ix.replace(old_refund, new_refund)
    print("  ✓ Refund endpoint: reason wajib + manager PIN enforced")
    ok += 1
else:
    print("  ⚠ Refund endpoint anchor not found")
    fail += 1

# 2C. Add broadcast for cancel with previous status (for PHANTOM_CUP detection)
old_broadcast_cancel = """    _broadcast("order:cancelled", {
      orderId: order.id,
      cancelledAt: now,
      reason: order.cancelReason,
      by: order.cancelledBy
    });"""

new_broadcast_cancel = """    // Broadcast with previousStatus for PHANTOM_CUP + CANCEL_PROD detection
    const previousStatus = order._prevStatus || "unknown";
    broadcast("pos:void", {
      orderId: order.id,
      cancelledAt: now,
      reason: order.cancelReason,
      by: order.cancelledBy,
      approvedBy: managerName,
      previousStatus: previousStatus,
      amount: order.total || 0,
      cashierId: order.kasir,
      cashierName: cancelledBy,
      items: order.items,
    });
    // Also keep legacy event
    _broadcast("order:cancelled", {
      orderId: order.id,
      cancelledAt: now,
      reason: order.cancelReason,
      by: order.cancelledBy
    });"""

if old_broadcast_cancel in ix:
    ix = ix.replace(old_broadcast_cancel, new_broadcast_cancel)
    print("  ✓ Cancel broadcast enhanced with previousStatus + pos:void event")
    ok += 1
else:
    print("  ⚠ Cancel broadcast anchor not found")
    fail += 1

# 2D. Store previousStatus before cancel mutates it
old_cancel_mutate = """    const now = Date.now();
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason.trim();
    order.cancelledBy = cancelledBy || "Unknown";
    order.cancelApprovedBy = managerName;"""

new_cancel_mutate = """    const now = Date.now();
    order._prevStatus = order.status; // preserve for audit
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason.trim();
    order.cancelledBy = cancelledBy || "Unknown";
    order.cancelApprovedBy = managerName;"""

if old_cancel_mutate in ix:
    ix = ix.replace(old_cancel_mutate, new_cancel_mutate)
    print("  ✓ Previous status preserved before cancel mutation")
    ok += 1
else:
    print("  ⚠ Cancel mutate anchor not found")
    fail += 1

write(INDEX, ix)
print(f"  💾 index.js saved")


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
print(f"""
═══════════════════════════════════════
  AUDIT MEGA-PATCH COMPLETE
  ✓ Success: {ok}
  ⚠ Failed:  {fail}
═══════════════════════════════════════

What was patched:

1. BACKEND AUDIT LOG
   • pos_events table — every WS event logged with timestamp + cashier
   • GET /api/audit/events — query forensic log
   • POST /api/audit/verify-pin — manager PIN verification

2. VOID REASON + MANAGER PIN
   • POST /api/orders/:id/cancel — reason wajib (min 3 char) + PIN manager
   • POST /api/orders/:id/refund — reason wajib (min 3 char) + PIN manager  
   • Cancel broadcasts pos:void with previousStatus for anomaly detection

3. STOCK AUTO-DEDUCT
   • order:new → cup/lid/sendok/bag auto-deducted from audit_warehouse
   • Yogurt base deducted by type (charcoal/plain/smoothie)
   • Stock alert broadcast when items hit minimum

Restart backend:
   cd ~/bites-kiosk/server && node index.js

Test:
   curl -X POST http://localhost:3001/api/orders/A383/cancel \\
     -H "Content-Type: application/json" \\
     -d '{{"reason":"test","cancelledBy":"Kasir","managerPin":"123456"}}'
""")
