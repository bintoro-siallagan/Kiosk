#!/usr/bin/env python3
"""
BITES-KIOSK BACKEND HARDENING
==============================
1. Auth gate Command Center (frontend)
2. Auth middleware for /api/audit/* (backend)
3. Restock + stock opname endpoints
4. Config management endpoints

Run: python3 ~/bites-kiosk/backend-hardening.py
"""
import os
HOME = os.path.expanduser("~")
APP = os.path.join(HOME, "bites-kiosk/src/App.jsx")
BACKEND = os.path.join(HOME, "bites-kiosk/server/command-center-backend.js")
INDEX = os.path.join(HOME, "bites-kiosk/server/index.js")

def read(p):
    with open(p) as f: return f.read()
def write(p, c):
    with open(p, "w") as f: f.write(c)

ok = 0
fail = 0

# ═══════════════════════════════════════════════════════════════════════════
# 1. AUTH GATE COMMAND CENTER (Frontend — require admin login)
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 1. Auth Gate Command Center ═══")

app = read(APP)

old_routes = 'const adminRoutes = ["admin","report","esb-sync","esb-notif","members","promo","shift"];'
new_routes = 'const adminRoutes = ["admin","report","esb-sync","esb-notif","members","promo","shift","command"];'

if old_routes in app:
    app = app.replace(old_routes, new_routes)
    write(APP, app)
    print('  ✓ "command" added to adminRoutes — login required')
    ok += 1
elif '"command"' in app and 'adminRoutes' in app:
    print("  ⚠ command already in adminRoutes")
else:
    print("  ⚠ adminRoutes anchor not found")
    fail += 1


# ═══════════════════════════════════════════════════════════════════════════
# 2. AUTH MIDDLEWARE for /api/audit/* (Backend)
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 2. Auth Middleware for Audit API ═══")

ix = read(INDEX)

# Add auth middleware function before the command center module load
old_audit_module = "// ─── COMMAND CENTER AUDIT MODULE ───────────────────────"
new_audit_module = """// ─── AUDIT AUTH MIDDLEWARE ───────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized — admin login required" });
  }
  req.adminUser = adminSessions.get(token);
  next();
}

function requireManager(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Unauthorized — admin login required" });
  }
  const session = adminSessions.get(token);
  if (session.role !== "manager") {
    return res.status(403).json({ error: "Forbidden — manager role required" });
  }
  req.adminUser = session;
  next();
}

// Apply auth to all /api/audit/* routes
app.use("/api/audit", requireAdmin);

// ─── COMMAND CENTER AUDIT MODULE ───────────────────────"""

if old_audit_module in ix:
    ix = ix.replace(old_audit_module, new_audit_module)
    print("  ✓ requireAdmin + requireManager middleware added")
    print("  ✓ app.use('/api/audit', requireAdmin) applied")
    ok += 1
else:
    print("  ⚠ Audit module anchor not found")
    fail += 1

write(INDEX, ix)


# ═══════════════════════════════════════════════════════════════════════════
# 3. RESTOCK + STOCK OPNAME ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 3. Restock + Stock Opname ═══")

cb = read(BACKEND)

# Add restock endpoints after the existing warehouse PATCH endpoint
old_wh_patch = """  // ── Update stock (for barista/manager) ──
  app.patch("/api/audit/warehouse/:id", (req, res) => {
    const { id } = req.params;
    const { stock, notes } = req.body;

    if (stock !== undefined) {
      db.prepare(`
        UPDATE audit_warehouse SET stock = ?, updated_at = datetime('now') WHERE id = ?
      `).run(stock, id);
    }

    res.json({ ok: true, id });
  });"""

new_wh_endpoints = """  // ── Update stock (for barista/manager) ──
  app.patch("/api/audit/warehouse/:id", (req, res) => {
    const { id } = req.params;
    const { stock, notes } = req.body;

    if (stock !== undefined) {
      db.prepare(`
        UPDATE audit_warehouse SET stock = ?, updated_at = datetime('now') WHERE id = ?
      `).run(stock, id);
    }

    res.json({ ok: true, id });
  });

  // ── Restock (PO masuk / tambah stok) ──
  app.post("/api/audit/warehouse/:id/restock", (req, res) => {
    const { id } = req.params;
    const { quantity, note, supplier } = req.body || {};
    if (!quantity || quantity <= 0) return res.status(400).json({ error: "quantity required (> 0)" });

    const item = db.prepare("SELECT * FROM audit_warehouse WHERE id = ?").get(id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const newStock = item.stock + quantity;
    db.prepare("UPDATE audit_warehouse SET stock = ?, last_restock = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(newStock, id);

    // Log to pos_events for audit trail
    try {
      db.prepare("INSERT INTO pos_events (event_type, data, order_id, amount) VALUES (?, ?, ?, ?)").run(
        "warehouse:restock",
        JSON.stringify({ itemId: id, itemName: item.name, quantity, previousStock: item.stock, newStock, note, supplier }),
        null, quantity
      );
    } catch(e) {}

    console.log("[Audit] Restock:", item.name, "+", quantity, item.unit, "→", newStock);
    res.json({ ok: true, item: { ...item, stock: newStock } });
  });

  // ── Stock Opname (stock take — set exact stock) ──
  app.post("/api/audit/warehouse/stock-take", (req, res) => {
    const { items } = req.body || {};
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: "items array required [{id, actualStock}]" });

    const results = [];
    const stmt = db.prepare("UPDATE audit_warehouse SET stock = ?, updated_at = datetime('now') WHERE id = ?");
    const logStmt = db.prepare("INSERT INTO pos_events (event_type, data, amount) VALUES (?, ?, ?)");

    items.forEach(({ id, actualStock }) => {
      const item = db.prepare("SELECT * FROM audit_warehouse WHERE id = ?").get(id);
      if (!item) return;

      const diff = actualStock - item.stock;
      stmt.run(actualStock, id);

      try {
        logStmt.run("warehouse:stock_take", JSON.stringify({
          itemId: id, itemName: item.name,
          systemStock: item.stock, actualStock, difference: diff
        }), diff);
      } catch(e) {}

      results.push({
        id, name: item.name,
        systemStock: item.stock, actualStock, difference: diff,
        status: diff === 0 ? "match" : diff > 0 ? "surplus" : "shortage"
      });
    });

    const mismatches = results.filter(r => r.difference !== 0);
    if (mismatches.length > 0) {
      console.log("[Audit] Stock take:", mismatches.length, "mismatches found");
    }

    res.json({ ok: true, results, mismatches: mismatches.length });
  });

  // ── Warehouse Summary (for dashboard) ──
  app.get("/api/audit/warehouse/summary", (req, res) => {
    const items = db.prepare("SELECT * FROM audit_warehouse ORDER BY category, name").all();
    const critical = items.filter(i => i.stock <= i.min_stock);
    const totalValue = items.reduce((s, i) => s + (i.stock * i.cost_per_unit), 0);
    const totalItems = items.length;

    // PPIC forecast — items running low within 7 days
    const forecast = items.filter(i => {
      if (i.daily_use <= 0) return false;
      const daysLeft = Math.floor(i.stock / i.daily_use);
      return daysLeft <= 7;
    }).map(i => ({
      ...i,
      daysLeft: Math.floor(i.stock / i.daily_use),
      orderQty: Math.max(i.max_stock - i.stock, 0),
      orderCost: Math.max(i.max_stock - i.stock, 0) * i.cost_per_unit,
    })).sort((a, b) => a.daysLeft - b.daysLeft);

    res.json({ totalItems, critical: critical.length, totalValue, forecast, items });
  });"""

if old_wh_patch in cb:
    cb = cb.replace(old_wh_patch, new_wh_endpoints)
    print("  ✓ POST /api/audit/warehouse/:id/restock added")
    print("  ✓ POST /api/audit/warehouse/stock-take added")
    print("  ✓ GET /api/audit/warehouse/summary added")
    ok += 1
else:
    print("  ⚠ Warehouse patch anchor not found")
    fail += 1


# ═══════════════════════════════════════════════════════════════════════════
# 4. CONFIG MANAGEMENT (better endpoints)
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 4. Config Management ═══")

# Add GET /api/audit/config (all configs) + batch update
old_config_patch = """  app.patch("/api/config/:key", (req, res) => {
    const { key } = req.params;
    const { value } = req.body || {};
    if (!value && value !== 0) return res.status(400).json({ error: "Value required" });
    db.prepare("INSERT OR REPLACE INTO audit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, String(value));
    console.log("[Audit] Config updated:", key, "=", value);
    res.json({ ok: true, key, value });
  });"""

new_config_endpoints = """  app.patch("/api/config/:key", (req, res) => {
    const { key } = req.params;
    const { value } = req.body || {};
    if (!value && value !== 0) return res.status(400).json({ error: "Value required" });
    db.prepare("INSERT OR REPLACE INTO audit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, String(value));
    console.log("[Audit] Config updated:", key, "=", value);
    res.json({ ok: true, key, value });
  });

  // ── All configs (admin view) ──
  app.get("/api/audit/config", (req, res) => {
    const rows = db.prepare("SELECT key, value, updated_at FROM audit_config ORDER BY key").all();
    res.json({ items: rows });
  });

  // ── Batch config update ──
  app.post("/api/audit/config/batch", (req, res) => {
    const { configs } = req.body || {};
    if (!configs || typeof configs !== "object") return res.status(400).json({ error: "configs object required" });
    const stmt = db.prepare("INSERT OR REPLACE INTO audit_config (key, value, updated_at) VALUES (?, ?, datetime('now'))");
    Object.entries(configs).forEach(([key, value]) => {
      stmt.run(key, String(value));
    });
    console.log("[Audit] Config batch updated:", Object.keys(configs).join(", "));
    res.json({ ok: true, updated: Object.keys(configs) });
  });"""

if old_config_patch in cb:
    cb = cb.replace(old_config_patch, new_config_endpoints)
    print("  ✓ GET /api/audit/config added")
    print("  ✓ POST /api/audit/config/batch added")
    ok += 1
else:
    print("  ⚠ Config patch anchor not found")
    fail += 1

write(BACKEND, cb)
print("  💾 command-center-backend.js saved")


# ═══════════════════════════════════════════════════════════════════════════
# 5. FRONTEND — CommandCenter sends auth token with API calls
# ═══════════════════════════════════════════════════════════════════════════
print("\n═══ 5. CommandCenter Auth Header ═══")

cc = os.path.join(HOME, "bites-kiosk/src/CommandCenter.jsx")
ccc = read(cc)

old_fetch = """async function fetchApi(path){
  try{const r=await fetch(`${API_BASE}${path}`);if(!r.ok)throw new Error(r.status);return await r.json();}
  catch(e){return null;}
}"""

new_fetch = """async function fetchApi(path){
  try{
    const token = localStorage.getItem("adminToken") || "";
    const r = await fetch(`${API_BASE}${path}`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    });
    if(!r.ok) throw new Error(r.status);
    return await r.json();
  } catch(e){return null;}
}"""

if old_fetch in ccc:
    ccc = ccc.replace(old_fetch, new_fetch)
    write(cc, ccc)
    print("  ✓ CommandCenter: auth token sent with all API calls")
    ok += 1
else:
    print("  ⚠ fetchApi anchor not found")
    fail += 1


# ═══════════════════════════════════════════════════════════════════════════
print(f"""
═══════════════════════════════════════
  BACKEND HARDENING COMPLETE
  ✓ Success: {ok}
  ⚠ Failed:  {fail}
═══════════════════════════════════════

1. AUTH GATE
   • Command Center requires admin login (via adminRoutes)
   • /api/audit/* requires Bearer token (401 if missing)
   • CommandCenter.jsx sends adminToken with all requests

2. AUTH MIDDLEWARE
   • requireAdmin — any admin role
   • requireManager — manager role only

3. RESTOCK + STOCK OPNAME
   • POST /api/audit/warehouse/:id/restock — tambah stok (PO masuk)
   • POST /api/audit/warehouse/stock-take — stock opname batch
   • GET /api/audit/warehouse/summary — dashboard summary + PPIC forecast

4. CONFIG MANAGEMENT
   • GET /api/audit/config — list all configs
   • POST /api/audit/config/batch — update multiple configs at once

Restart: kill -9 $(lsof -ti:3001); sleep 1; cd ~/bites-kiosk/server && node index.js

Test auth:
  # Without token (should fail)
  curl -s http://localhost:3001/api/audit/events | python3 -m json.tool

  # With token (login first, then use token)
  TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \\
    -H "Content-Type: application/json" \\
    -d '{{"pin":"123456"}}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/audit/events | python3 -m json.tool
""")
