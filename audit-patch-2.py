#!/usr/bin/env python3
"""
BITES-KIOSK AUDIT MEGA-PATCH #2
================================
1. POINT_VALUE configurable (admin bisa ubah, frontend fetch)
2. Waste tracking (table + endpoints)
3. Auto-report on shift close (WA via fonnte)

Run: python3 ~/bites-kiosk/audit-patch-2.py
"""
import os
HOME = os.path.expanduser("~")
BACKEND = os.path.join(HOME, "bites-kiosk/server/command-center-backend.js")
INDEX = os.path.join(HOME, "bites-kiosk/server/index.js")
POS = os.path.join(HOME, "bites-kiosk/src/POSConfirm.jsx")

def read(p):
    with open(p) as f: return f.read()
def write(p, c):
    with open(p, "w") as f: f.write(c)

ok = 0
fail = 0

# ═══════════════════════════════════════════════════════════════════════════
# PATCH 1: POINT_VALUE CONFIGURABLE
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ PATCH 1: POINT_VALUE Configurable ═══")

# 1A. Add config table + /api/config/public endpoint to command-center-backend.js
cb = read(BACKEND)

old_wh_table = """  CREATE TABLE IF NOT EXISTS audit_warehouse ("""
new_config_table = """  CREATE TABLE IF NOT EXISTS audit_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_waste (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    item_id TEXT,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'pcs',
    reason TEXT,
    shift_id TEXT,
    cashier_id TEXT,
    cashier_name TEXT,
    outlet_id TEXT DEFAULT 'default',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_waste_created ON audit_waste(created_at);
  CREATE INDEX IF NOT EXISTS idx_waste_shift ON audit_waste(shift_id);

  CREATE TABLE IF NOT EXISTS audit_warehouse ("""

if old_wh_table in cb:
    cb = cb.replace(old_wh_table, new_config_table)
    print("  ✓ audit_config + audit_waste tables added to schema")
    ok += 1
else:
    print("  ⚠ Schema anchor not found")
    fail += 1

# 1B. Seed default POINT_VALUE config
old_seed_check = """  const whCount = raw.prepare("SELECT COUNT(*) as c FROM audit_warehouse").get().c;"""
new_seed_config = """  // Seed config defaults
  try {
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("POINT_VALUE", "100");
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("MANAGER_WA", "");
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("OWNER_WA", "");
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("AUTO_REPORT_ENABLED", "true");
    console.log("[Audit] Config defaults seeded");
  } catch(e) {}

  const whCount = raw.prepare("SELECT COUNT(*) as c FROM audit_warehouse").get().c;"""

if old_seed_check in cb:
    cb = cb.replace(old_seed_check, new_seed_config)
    print("  ✓ Config defaults seeded (POINT_VALUE, MANAGER_WA, etc)")
    ok += 1
else:
    print("  ⚠ Seed anchor not found")
    fail += 1

# 1C. Add /api/config/public + waste + config endpoints
old_events_section = """  // ── Event Log (forensic audit trail) ──"""
new_config_endpoints = """  // ── Public Config (POINT_VALUE etc) ──
  app.get("/api/config/public", (req, res) => {
    const rows = db.prepare("SELECT key, value FROM audit_config").all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    // Parse numbers
    if (config.POINT_VALUE) config.POINT_VALUE = parseInt(config.POINT_VALUE) || 100;
    res.json(config);
  });

  app.patch("/api/config/:key", (req, res) => {
    const { key } = req.params;
    const { value } = req.body || {};
    if (!value && value !== 0) return res.status(400).json({ error: "Value required" });
    db.prepare("INSERT OR REPLACE INTO audit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, String(value));
    console.log("[Audit] Config updated:", key, "=", value);
    res.json({ ok: true, key, value });
  });

  // ── Waste Tracking ──
  app.post("/api/audit/waste", (req, res) => {
    const { itemName, itemId, quantity, unit, reason, shiftId, cashierId, cashierName } = req.body || {};
    if (!itemName || !quantity) return res.status(400).json({ error: "itemName + quantity required" });
    db.prepare(\`
      INSERT INTO audit_waste (item_name, item_id, quantity, unit, reason, shift_id, cashier_id, cashier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    \`).run(itemName, itemId || null, quantity, unit || "pcs", reason || null, shiftId || null, cashierId || null, cashierName || null);
    console.log("[Audit] Waste logged:", itemName, quantity, unit);
    res.json({ ok: true });
  });

  app.get("/api/audit/waste", (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const shiftId = req.query.shift || null;
    let sql = "SELECT * FROM audit_waste";
    const params = [];
    if (shiftId) { sql += " WHERE shift_id = ?"; params.push(shiftId); }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    res.json({ items: db.prepare(sql).all(...params) });
  });

  // ── Shift Summary (for auto-report) ──
  app.get("/api/audit/shift-summary", (req, res) => {
    const shiftId = req.query.shift || null;
    // Get anomalies count for this session
    const anomCount = db.prepare("SELECT COUNT(*) as c FROM audit_anomalies WHERE resolved = 0").get().c;
    // Get waste for today
    const wasteItems = db.prepare("SELECT * FROM audit_waste WHERE created_at >= date('now') ORDER BY created_at DESC").all();
    const wasteCost = wasteItems.reduce((s, w) => s + (w.quantity * 1000), 0); // rough estimate
    // Stock alerts
    const stockAlerts = db.prepare("SELECT name, stock, min_stock, unit FROM audit_warehouse WHERE stock <= min_stock").all();
    res.json({ anomCount, wasteItems, wasteCost, stockAlerts });
  });

  // ── Event Log (forensic audit trail) ──"""

if old_events_section in cb:
    cb = cb.replace(old_events_section, new_config_endpoints)
    print("  ✓ /api/config/public + /api/audit/waste + /api/audit/shift-summary added")
    ok += 1
else:
    print("  ⚠ Events section anchor not found")
    fail += 1

write(BACKEND, cb)
print("  💾 command-center-backend.js saved")

# 1D. POSConfirm.jsx — fetch POINT_VALUE from API instead of hardcode
print("\n  Patching POSConfirm.jsx...")
pos = read(POS)

old_pv = """const POINT_VALUE = 100; // 1 poin = Rp 100"""
new_pv = """// POINT_VALUE — fetched from /api/config/public (configurable via admin)
let _cachedPointValue = 100;
fetch((import.meta.env.VITE_API_URL || "http://localhost:3001") + "/api/config/public")
  .then(r => r.json())
  .then(c => { if (c.POINT_VALUE) _cachedPointValue = c.POINT_VALUE; })
  .catch(() => {});
const getPointValue = () => _cachedPointValue;"""

if old_pv in pos:
    pos = pos.replace(old_pv, new_pv)
    # Replace all POINT_VALUE references with getPointValue()
    pos = pos.replace("pointsUsed * POINT_VALUE", "pointsUsed * getPointValue()")
    pos = pos.replace("Math.floor(Math.max(0, subtotal - promoDiscount) / POINT_VALUE)", "Math.floor(Math.max(0, subtotal - promoDiscount) / getPointValue())")
    pos = pos.replace("Math.floor((subtotal - discount) / POINT_VALUE)", "Math.floor((subtotal - discount) / getPointValue())")
    pos = pos.replace("newMax * POINT_VALUE", "newMax * getPointValue()")
    pos = pos.replace("capped * POINT_VALUE", "capped * getPointValue()")
    pos = pos.replace("1 poin = Rp {POINT_VALUE}", "1 poin = Rp {getPointValue()}")
    write(POS, pos)
    print("  ✓ POSConfirm.jsx: POINT_VALUE now fetched from /api/config/public")
    ok += 1
else:
    print("  ⚠ POINT_VALUE anchor not found in POSConfirm")
    fail += 1


# ═══════════════════════════════════════════════════════════════════════════
# PATCH 3: AUTO-REPORT ON SHIFT CLOSE (WhatsApp via fonnte)
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ PATCH 3: Auto-Report on Shift Close ═══")

ix = read(INDEX)

old_shift_close_end = """  const closed = { ...activeShift };
  if (activeShift) db.insertShift(activeShift);
  activeShift = null;
  console.log(`🔴 Shift ditutup: ${closed.kasirName} — ${shiftOrders.length} order, Rp ${totalRevenue.toLocaleString()}`);
  res.json(closed);
});"""

new_shift_close_end = """  const closed = { ...activeShift };
  if (activeShift) db.insertShift(activeShift);
  activeShift = null;
  console.log(`🔴 Shift ditutup: ${closed.kasirName} — ${shiftOrders.length} order, Rp ${totalRevenue.toLocaleString()}`);

  // ── AUTO-REPORT: Send shift summary via WhatsApp ──
  (async () => {
    try {
      const { getDb } = require("./command-center-backend");
      const auditDb = getDb();

      // Get config
      const configRows = auditDb.prepare("SELECT key, value FROM audit_config").all();
      const cfg = {};
      configRows.forEach(r => { cfg[r.key] = r.value; });

      if (cfg.AUTO_REPORT_ENABLED !== "true") return;

      const managerWA = cfg.MANAGER_WA || cfg.OWNER_WA;
      if (!managerWA) {
        console.log("[Auto-Report] No MANAGER_WA configured — skipped");
        return;
      }

      // Get anomalies
      const anomCount = auditDb.prepare("SELECT COUNT(*) as c FROM audit_anomalies WHERE resolved = 0").get().c;

      // Get waste today
      const wasteItems = auditDb.prepare("SELECT item_name, SUM(quantity) as total_qty, unit FROM audit_waste WHERE created_at >= date('now') GROUP BY item_name").all();

      // Get stock alerts
      const stockAlerts = auditDb.prepare("SELECT name, stock, unit FROM audit_warehouse WHERE stock <= min_stock").all();

      // Build message
      const fR = n => "Rp " + Math.round(n).toLocaleString("id-ID");
      const openTime = new Date(closed.openAt || closed.openedAt || 0).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
      const closeTime = new Date(closed.closeAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

      let msg = "📊 *SHIFT REPORT — BINTORO*\\n";
      msg += "━━━━━━━━━━━━━━━━━━━━\\n";
      msg += "👤 Kasir: " + (closed.kasirName || "?") + "\\n";
      msg += "⏰ " + openTime + " — " + closeTime + "\\n\\n";
      msg += "💰 Revenue: " + fR(totalRevenue) + "\\n";
      msg += "🧾 Orders: " + shiftOrders.length + "\\n";
      msg += "💵 Cash Closing: " + fR(Number(closingCash) || 0) + "\\n";
      if (note) msg += "📝 Note: " + note + "\\n";
      msg += "\\n";

      // Payment breakdown
      const cashOrders = shiftOrders.filter(o => (o.pay || "").toUpperCase() === "CASH");
      const qrisOrders = shiftOrders.filter(o => (o.pay || "").toUpperCase() === "QRIS");
      msg += "📱 QRIS: " + qrisOrders.length + "× (" + fR(qrisOrders.reduce((s,o) => s + o.total, 0)) + ")\\n";
      msg += "💵 Cash: " + cashOrders.length + "× (" + fR(cashOrders.reduce((s,o) => s + o.total, 0)) + ")\\n";
      msg += "\\n";

      // Anomalies
      if (anomCount > 0) {
        msg += "🚨 *ANOMALI OPEN: " + anomCount + "*\\n";
        msg += "Cek Command Center untuk detail.\\n\\n";
      }

      // Stock alerts
      if (stockAlerts.length > 0) {
        msg += "⚠ *STOK KRITIS:*\\n";
        stockAlerts.forEach(s => {
          msg += "  • " + s.name + ": " + s.stock + " " + s.unit + "\\n";
        });
        msg += "\\n";
      }

      // Waste
      if (wasteItems.length > 0) {
        msg += "🗑️ *WASTE HARI INI:*\\n";
        wasteItems.forEach(w => {
          msg += "  • " + w.item_name + ": " + w.total_qty + " " + w.unit + "\\n";
        });
        msg += "\\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━\\n";
      msg += "Bites & Co. Command Center";

      await wa.sendMessage(managerWA, msg);
      console.log("📱 Auto-report sent to " + managerWA);
    } catch (e) {
      console.warn("[Auto-Report] Failed:", e.message);
    }
  })();

  res.json(closed);
});"""

if old_shift_close_end in ix:
    ix = ix.replace(old_shift_close_end, new_shift_close_end)
    print("  ✓ Shift close → auto WA report wired")
    ok += 1
else:
    print("  ⚠ Shift close anchor not found")
    fail += 1

write(INDEX, ix)
print("  💾 index.js saved")


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
print(f"""
═══════════════════════════════════════
  AUDIT MEGA-PATCH #2 COMPLETE
  ✓ Success: {ok}
  ⚠ Failed:  {fail}
═══════════════════════════════════════

1. POINT_VALUE CONFIGURABLE
   • /api/config/public — returns POINT_VALUE (default 100)
   • PATCH /api/config/POINT_VALUE — admin ubah value
   • POSConfirm.jsx fetches on load, no more hardcode
   
2. WASTE TRACKING
   • audit_waste table — log bahan terbuang
   • POST /api/audit/waste — barista log waste
   • GET /api/audit/waste — query waste history
   
3. AUTO-REPORT ON SHIFT CLOSE
   • Shift close → generate summary → send via WhatsApp (fontte)
   • Includes: revenue, orders, payment breakdown, anomalies, stock alerts, waste
   • Config: set MANAGER_WA via PATCH /api/config/MANAGER_WA

Setup WA number:
   curl -X PATCH http://localhost:3001/api/config/MANAGER_WA \\
     -H "Content-Type: application/json" \\
     -d '{{"value":"628xxxxxxxxxx"}}'

Restart: cd ~/bites-kiosk/server && node index.js
""")
