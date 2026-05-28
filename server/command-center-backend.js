/**
 * command-center-backend.js
 * ─────────────────────────────────────────────────────────────
 * Backend module untuk Command Center.
 * 
 * CARA PAKAI:
 *   1. Copy isi file ini
 *   2. Paste di server/index.js SEBELUM baris terakhir (app.listen)
 *   3. Restart server
 * 
 * ENDPOINTS yang ditambahkan:
 *   GET /api/audit/dashboard     → KPI summary
 *   GET /api/audit/top-menu      → top items + categories
 *   GET /api/audit/anomalies     → detected anomalies
 *   POST /api/audit/anomalies/:id/resolve → resolve anomaly
 *   GET /api/audit/warehouse     → stock levels + PPIC forecast
 *   GET /api/audit/promo         → promo performance
 *   GET /api/audit/outlets       → per-outlet stats (multi-outlet ready)
 * 
 * ANOMALY ENGINE:
 *   - Runs on every pos:* WebSocket event
 *   - Stores detected anomalies in SQLite table `audit_anomalies`
 *   - 12 detection rules from audit module Phase 4B
 * 
 * REQUIRES:
 *   - `db` object (better-sqlite3 instance, existing)
 *   - `broadcast()` function (existing WebSocket broadcaster)
 *   - `orders` array or db query (existing)
 * ─────────────────────────────────────────────────────────────
 */

// ═══ SCHEMA — Run once to create audit tables ═══════════════════════════════

const AUDIT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS audit_anomalies (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    cashier_id TEXT,
    cashier_name TEXT,
    outlet_id TEXT,
    amount INTEGER DEFAULT 0,
    detail TEXT,
    related_order_ids TEXT,
    related_sku TEXT,
    ws_event TEXT,
    resolved INTEGER DEFAULT 0,
    resolved_at TEXT,
    resolved_by TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_config (
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

  CREATE TABLE IF NOT EXISTS audit_warehouse (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'pcs',
    stock REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0,
    max_stock REAL NOT NULL DEFAULT 0,
    daily_use REAL NOT NULL DEFAULT 0,
    cost_per_unit INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'raw',
    last_restock TEXT,
    outlet_id TEXT DEFAULT 'default',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_anomalies_type ON audit_anomalies(type);
  CREATE INDEX IF NOT EXISTS idx_anomalies_resolved ON audit_anomalies(resolved);
  CREATE INDEX IF NOT EXISTS idx_anomalies_created ON audit_anomalies(created_at);

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
  CREATE INDEX IF NOT EXISTS idx_events_cashier ON pos_events(cashier_id);
`;

// ═══ INIT — Call this at server startup ══════════════════════════════════════

// ═══ RAW SQLITE CONNECTION (separate from db.js wrapper) ═════════════════════
const path = require("path");
const Database = require("better-sqlite3");
const DB_PATH = path.join(__dirname, "data.db");
let _auditDb = null;

function getDb() {
  if (!_auditDb) {
    _auditDb = new Database(DB_PATH);
    _auditDb.pragma("journal_mode = WAL");
    _auditDb.pragma("synchronous = NORMAL");
    _auditDb.pragma("busy_timeout = 8000");
    _auditDb.pragma("cache_size = -16384");  // 16MB cache for audit reads
  }
  return _auditDb;
}

function initAuditModule(/* db wrapper — unused, we use our own connection */) {
  const raw = getDb();
  raw.exec(AUDIT_SCHEMA);
  console.log("[Audit] Tables initialized");

  // Auto-prune pos_events older than 60 days — table balloons from every broadcast event.
  // Was hanging POS checkouts (2.3k+ rows after 1 week, write amplification).
  try {
    const res = raw.prepare("DELETE FROM pos_events WHERE created_at < datetime('now','-60 days')").run();
    if (res.changes > 0) console.log(`[Audit] Pruned ${res.changes} old pos_events rows (>60 days)`);
  } catch (e) { console.warn("[Audit] pos_events prune failed:", e.message); }

  // Daily prune job — runs every 24h to keep table lean
  setInterval(() => {
    try {
      const res = raw.prepare("DELETE FROM pos_events WHERE created_at < datetime('now','-60 days')").run();
      if (res.changes > 0) console.log(`[Audit] Daily prune: ${res.changes} pos_events rows removed`);
    } catch {}
  }, 24 * 60 * 60 * 1000).unref();

  // Seed config defaults
  try {
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("POINT_VALUE", "100");
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("MANAGER_WA", "");
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("OWNER_WA", "");
    raw.prepare("INSERT OR IGNORE INTO audit_config (key, value) VALUES (?, ?)").run("AUTO_REPORT_ENABLED", "true");
    console.log("[Audit] Config defaults seeded");
  } catch(e) {}

  const whCount = raw.prepare("SELECT COUNT(*) as c FROM audit_warehouse").get().c;
  if (whCount === 0) {
    seedWarehouse(raw);
    console.log("[Audit] Warehouse seeded with default inventory");
  }
}

function seedWarehouse(db) {
  const items = [
    // Bahan Baku
    { id:"RM01", name:"Yogurt Base Plain", unit:"kg", stock:45, min_stock:20, max_stock:100, daily_use:8, cost_per_unit:65000, category:"bahan" },
    { id:"RM02", name:"Yogurt Base Charcoal", unit:"kg", stock:12, min_stock:15, max_stock:60, daily_use:5, cost_per_unit:85000, category:"bahan" },
    { id:"RM03", name:"Susu Skim UHT", unit:"liter", stock:80, min_stock:30, max_stock:150, daily_use:12, cost_per_unit:18000, category:"bahan" },
    { id:"RM04", name:"Gula Cair", unit:"liter", stock:25, min_stock:10, max_stock:50, daily_use:3, cost_per_unit:22000, category:"bahan" },
    { id:"RM05", name:"Buah Strawberry", unit:"kg", stock:7, min_stock:10, max_stock:30, daily_use:4, cost_per_unit:45000, category:"bahan" },
    { id:"RM06", name:"Buah Mango", unit:"kg", stock:14, min_stock:10, max_stock:30, daily_use:3, cost_per_unit:35000, category:"bahan" },
    { id:"RM07", name:"Matcha Powder", unit:"kg", stock:3, min_stock:3, max_stock:12, daily_use:0.8, cost_per_unit:120000, category:"bahan" },
    // Packaging
    { id:"PK01", name:"Cup 12oz", unit:"pcs", stock:450, min_stock:200, max_stock:1000, daily_use:65, cost_per_unit:1200, category:"packaging" },
    { id:"PK02", name:"Cup 16oz", unit:"pcs", stock:160, min_stock:200, max_stock:800, daily_use:40, cost_per_unit:1500, category:"packaging" },
    { id:"PK03", name:"Lid Dome", unit:"pcs", stock:620, min_stock:300, max_stock:1200, daily_use:90, cost_per_unit:800, category:"packaging" },
    { id:"PK04", name:"Sendok Froyo", unit:"pcs", stock:900, min_stock:400, max_stock:2000, daily_use:100, cost_per_unit:350, category:"packaging" },
    { id:"PK05", name:"Paper Bag", unit:"pcs", stock:320, min_stock:150, max_stock:600, daily_use:45, cost_per_unit:1800, category:"packaging" },
    { id:"PK06", name:"Cone Waffle", unit:"pcs", stock:85, min_stock:50, max_stock:200, daily_use:15, cost_per_unit:2500, category:"packaging" },
    // Topping
    { id:"TP01", name:"Granola", unit:"kg", stock:6, min_stock:5, max_stock:20, daily_use:1.5, cost_per_unit:55000, category:"topping" },
    { id:"TP02", name:"Oreo Crush", unit:"kg", stock:4, min_stock:3, max_stock:15, daily_use:1, cost_per_unit:48000, category:"topping" },
    { id:"TP03", name:"Choco Chips", unit:"kg", stock:7, min_stock:5, max_stock:20, daily_use:1.2, cost_per_unit:62000, category:"topping" },
    { id:"TP04", name:"Mochi Balls", unit:"kg", stock:2, min_stock:3, max_stock:10, daily_use:0.8, cost_per_unit:72000, category:"topping" },
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO audit_warehouse 
    (id, name, unit, stock, min_stock, max_stock, daily_use, cost_per_unit, category) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const it of items) {
      stmt.run(it.id, it.name, it.unit, it.stock, it.min_stock, it.max_stock, it.daily_use, it.cost_per_unit, it.category);
    }
  });
  insertMany(items);
}


// ═══ ANOMALY DETECTION ENGINE ════════════════════════════════════════════════

/**
 * Call this from your WebSocket broadcast handler.
 * 
 * Example integration in server/index.js:
 * 
 *   function broadcast(type, data) {
 *     // existing broadcast code...
 *     wss.clients.forEach(client => { ... });
 *     
 *     // ADD THIS LINE:
 *     auditEngine.check(type, data, db, broadcast);
 *   }
 */
const auditEngine = {
  // In-memory counters (reset per shift)
  voidCounts: {},       // { cashierId: { count, lastHour, hourCount } }
  promoCounts: {},      // { promoCode: { count, cashierCounts: {} } }
  refundLog: {},        // { sku: [{ ts, cashierId }] }
  empDiscCounts: {},    // { cashierId: count }
  
  resetCounters() {
    this.voidCounts = {};
    this.promoCounts = {};
    this.refundLog = {};
    this.empDiscCounts = {};
  },

  // Log EVERY event to pos_events — buffered + flushed every 1s.
  // Was sync per-broadcast write → blocking POS response path. Now: enqueue in memory,
  // batch insert in background. Forensic data still captured, just delayed up to ~1s.
  _eventBuffer: [],
  _flushScheduled: false,
  logEvent(eventType, data) {
    try {
      const cashierId = data.cashierId || data.cashier_id || data.kasir || null;
      const cashierName = data.cashierName || data.cashier_name || null;
      const orderId = data.orderId || data.order_id || data.id || null;
      const amount = data.amount || data.total || 0;
      this._eventBuffer.push([eventType, JSON.stringify(data), cashierId, cashierName, orderId, amount]);
      if (!this._flushScheduled) {
        this._flushScheduled = true;
        setTimeout(() => this._flushEvents(), 1000);
      }
    } catch(e) { /* silent — audit log must never break main flow */ }
  },
  _flushEvents() {
    this._flushScheduled = false;
    if (this._eventBuffer.length === 0) return;
    const batch = this._eventBuffer.splice(0, this._eventBuffer.length);
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO pos_events (event_type, data, cashier_id, cashier_name, order_id, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => { for (const row of batch) stmt.run(...row); })();
    } catch(e) { console.warn("[Audit] flush events failed:", e.message); }
  },

  check(eventType, data, db, broadcastFn) {
    // 📝 Log every event first (forensic trail)
    this.logEvent(eventType, data);

    const detected = [];
    const now = new Date();
    const cashierId = data.cashierId || data.cashier_id || null;
    const cashierName = data.cashierName || data.cashier_name || "Unknown";

    // ── RULE 1: VOID_BOM — Excessive voids ──
    if (eventType === "pos:void" || (eventType === "order:updated" && data.status === "void")) {
      if (cashierId) {
        if (!this.voidCounts[cashierId]) {
          this.voidCounts[cashierId] = { count: 0, hourStart: now, hourCount: 0 };
        }
        const vc = this.voidCounts[cashierId];
        vc.count++;
        
        // Reset hourly counter if new hour
        if (now - vc.hourStart > 3600000) {
          vc.hourStart = now;
          vc.hourCount = 0;
        }
        vc.hourCount++;

        if (vc.count >= 4 || vc.hourCount >= 3) {
          detected.push({
            type: "VOID_BOM",
            severity: vc.count >= 6 ? "critical" : "high",
            amount: data.amount || data.total || 0,
            detail: `${vc.count} void shift ini (${vc.hourCount}/jam terakhir) oleh ${cashierName}. Order: ${data.orderId || "?"}. Threshold: ≥4/shift atau ≥3/jam.`,
            relatedOrderIds: data.orderId,
            wsEvent: eventType,
          });
        }
      }
    }

    // ── RULE 2: PHANTOM_CUP — Cup without product ──
    if (eventType === "pos:void" && data.previousStatus && 
        ["preparing", "ready"].includes(data.previousStatus)) {
      detected.push({
        type: "PHANTOM_CUP",
        severity: "high",
        amount: data.amount || data.total || 0,
        detail: `Order ${data.orderId || "?"} void setelah status "${data.previousStatus}". Produk sudah dibuat, cup+bahan terbuang. Kasir: ${cashierName}.`,
        relatedOrderIds: data.orderId,
        relatedSku: data.items?.[0]?.name || data.itemName,
        wsEvent: eventType,
      });
    }

    // ── RULE 3: PROMO_ABUSE — Promo stacking/overuse ──
    if (eventType === "pos:promo_applied" && data.promoCode) {
      const code = data.promoCode;
      if (!this.promoCounts[code]) {
        this.promoCounts[code] = { count: 0, cashierCounts: {} };
      }
      const pc = this.promoCounts[code];
      pc.count++;
      pc.cashierCounts[cashierId] = (pc.cashierCounts[cashierId] || 0) + 1;

      if (pc.count > 5 || (pc.cashierCounts[cashierId] || 0) > 3) {
        detected.push({
          type: "PROMO_ABUSE",
          severity: "medium",
          amount: data.discount || data.promoDiscount || 0,
          detail: `Kode "${code}" dipakai ${pc.count}x hari ini. Kasir ${cashierName}: ${pc.cashierCounts[cashierId]}x. Limit normal: 3x/kasir/hari.`,
          wsEvent: eventType,
        });
      }

      // Stacking check
      if (data.stackCount && data.stackCount > 1) {
        detected.push({
          type: "PROMO_ABUSE",
          severity: "high",
          amount: data.discount || 0,
          detail: `Promo stacking: ${data.stackCount} promo diterapkan bersamaan. Seharusnya mutex. Kasir: ${cashierName}.`,
          wsEvent: eventType,
        });
      }
    }

    // ── RULE 4: POIN_DRAIN — Suspicious point redemption ──
    if (eventType === "pos:points_redeemed") {
      const points = data.points || data.pointsRedeemed || 0;
      const memberAge = data.memberAgeDays || null;

      if (points > 2000) {
        detected.push({
          type: "POIN_DRAIN",
          severity: points > 5000 ? "critical" : "high",
          amount: points * 100,
          detail: `Redeem ${points} poin (Rp ${(points * 100).toLocaleString("id-ID")}).${memberAge !== null && memberAge < 7 ? ` Member baru (${memberAge} hari).` : ""} Kasir: ${cashierName}.`,
          wsEvent: eventType,
        });
      }

      if (memberAge !== null && memberAge < 7 && points > 500) {
        detected.push({
          type: "POIN_DRAIN",
          severity: "critical",
          amount: points * 100,
          detail: `Member baru (${memberAge} hari, 0 riwayat purchase) redeem ${points} poin. Kemungkinan transfer poin dari akun karyawan. Kasir: ${cashierName}.`,
          wsEvent: eventType,
        });
      }
    }

    // ── RULE 5: CASH_GAP — Cash mismatch ──
    if (eventType === "shift:close" && data.cashVariance) {
      const gap = Math.abs(data.cashVariance);
      if (gap > 50000) {
        detected.push({
          type: "CASH_GAP",
          severity: gap > 150000 ? "critical" : gap > 100000 ? "high" : "medium",
          amount: -gap,
          detail: `Selisih kas −Rp ${gap.toLocaleString("id-ID")} akhir shift. Expected: Rp ${(data.expectedCash || 0).toLocaleString("id-ID")}, actual: Rp ${(data.actualCash || 0).toLocaleString("id-ID")}. Kasir: ${cashierName}.`,
          wsEvent: eventType,
        });
      }
    }

    // ── RULE 6: DISC_NOAUTH — Discount without manager PIN ──
    if (eventType === "pos:promo_applied" && data.manualDiscount && !data.managerPin) {
      detected.push({
        type: "DISC_NOAUTH",
        severity: "high",
        amount: data.discount || data.manualDiscount || 0,
        detail: `Manual discount ${data.discountPercent || "?"}% tanpa PIN manager. Log manager_pin=null. Kasir: ${cashierName}.`,
        wsEvent: eventType,
      });
    }

    // ── STOCK AUTO-DEDUCT — DISABLED 2026-05-20 (Wave 1-3 install) ──
    // Superseded by Wave 2 menu-builder consumeStockForOrderV2 (BOM-based).
    // `false &&` keeps the legacy block for reference while preventing double-deduct.
    if (false && eventType === "order:new" && data.items) {
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

    // ── RULE 7: ODD_HOUR — Activity outside operating hours ──
    const hour = now.getHours();
    if ((hour >= 22 || hour < 7) && ["pos:order_complete", "pos:void", "auth:login"].includes(eventType)) {
      detected.push({
        type: "ODD_HOUR",
        severity: "high",
        amount: 0,
        detail: `Aktivitas "${eventType}" jam ${String(hour).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} WIB. Toko seharusnya tutup. Kasir: ${cashierName}.`,
        wsEvent: eventType,
      });
    }

    // ── RULE 10: EMP_DISC — Employee discount abuse ──
    if (eventType === "pos:promo_applied" && 
        (data.promoType === "employee" || data.promoCode === "STAFF25")) {
      if (cashierId) {
        this.empDiscCounts[cashierId] = (this.empDiscCounts[cashierId] || 0) + 1;
        if (this.empDiscCounts[cashierId] > 2) {
          detected.push({
            type: "EMP_DISC",
            severity: "high",
            amount: data.discount || 0,
            detail: `Diskon karyawan dipakai ${this.empDiscCounts[cashierId]}x hari ini oleh ${cashierName}. Threshold: ≤2x/shift. Cek apakah ke HP non-karyawan.`,
            wsEvent: eventType,
          });
        }
      }
    }

    // ── PERSIST & BROADCAST DETECTED ANOMALIES ──
    if (detected.length > 0) {
      const db = getDb();
      const insertStmt = db.prepare(`
        INSERT INTO audit_anomalies (id, type, severity, cashier_id, cashier_name, amount, detail, related_order_ids, related_sku, ws_event)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const d of detected) {
        const id = `AN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        try {
          insertStmt.run(
            id, d.type, d.severity, cashierId, cashierName,
            d.amount || 0, d.detail || "",
            d.relatedOrderIds || null, d.relatedSku || null, d.wsEvent || ""
          );
        } catch (e) {
          console.error("[Audit] Insert failed:", e.message);
        }

        // Broadcast anomaly to all connected dashboards
        if (broadcastFn) {
          broadcastFn("audit:anomaly", {
            id, ...d, cashierId, cashierName,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    return detected;
  },
};


// ═══ API ENDPOINTS ═══════════════════════════════════════════════════════════

function registerAuditEndpoints(app, _dbWrapper) {
  const db = getDb();
  // ── Dashboard KPIs ──
  app.get("/api/audit/dashboard", (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const orders = db.prepare(`
      SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC
    `).all(todayMs);

    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const orderCount = orders.length;
    const avgTicket = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

    const unresolvedAnomalies = db.prepare(`
      SELECT COUNT(*) as c FROM audit_anomalies WHERE resolved = 0
    `).get().c;

    res.json({
      revenue,
      orderCount,
      avgTicket,
      unresolvedAnomalies,
      generatedAt: Date.now(),
    });
  });

  // ── Top Menu ──
  app.get("/api/audit/top-menu", (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const orders = db.prepare(`
      SELECT * FROM orders WHERE created_at >= ?
    `).all(todayMs);

    const itemTally = {};
    orders.forEach(o => {
      const items = typeof o.items === "string" ? JSON.parse(o.items) : (o.items || []);
      items.forEach(it => {
        const key = it.name || it.n || `Item ${it.id || "?"}`;
        if (!itemTally[key]) itemTally[key] = { name: key, qty: 0, revenue: 0 };
        const qty = Number(it.qty || it.q) || 1;
        const price = Number(it.price || it.p) || 0;
        itemTally[key].qty += qty;
        itemTally[key].revenue += price * qty;
      });
    });

    const topItems = Object.values(itemTally)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 15);

    res.json({ items: topItems, generatedAt: Date.now() });
  });

  // ── Anomalies ──
  app.get("/api/audit/anomalies", (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const resolved = req.query.resolved === "true" ? 1 : 0;
    const type = req.query.type || null;

    let sql = "SELECT * FROM audit_anomalies WHERE resolved = ?";
    const params = [resolved];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const items = db.prepare(sql).all(...params);
    res.json({ items, generatedAt: Date.now() });
  });

  // ── Resolve anomaly ──
  app.post("/api/audit/anomalies/:id/resolve", (req, res) => {
    const { id } = req.params;
    const resolvedBy = req.body?.resolvedBy || "manager";
    const notes = req.body?.notes || "";

    db.prepare(`
      UPDATE audit_anomalies 
      SET resolved = 1, resolved_at = datetime('now'), resolved_by = ?, notes = ?
      WHERE id = ?
    `).run(resolvedBy, notes, id);

    res.json({ ok: true, id });
  });

  // ── Warehouse ──
  app.get("/api/audit/warehouse", (req, res) => {
    const items = db.prepare(`
      SELECT id, name, unit, stock, min_stock as minStock, max_stock as maxStock,
             daily_use as dailyUse, cost_per_unit as costPerUnit, category,
             last_restock as lastRestock, updated_at as updatedAt
      FROM audit_warehouse ORDER BY category, name
    `).all();

    res.json({ items, generatedAt: Date.now() });
  });

  // ── Update stock (for barista/manager) ──
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
  });

  // ── Promo performance ──
  app.get("/api/audit/promo", (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const orders = db.prepare(`
      SELECT * FROM orders WHERE created_at >= ? AND promoCode IS NOT NULL
    `).all(todayMs);

    const promoStats = {};
    orders.forEach(o => {
      const code = o.promoCode;
      if (!promoStats[code]) promoStats[code] = { code, count: 0, totalDiscount: 0, totalRevenue: 0 };
      promoStats[code].count++;
      promoStats[code].totalDiscount += (o.promoDiscount || 0);
      promoStats[code].totalRevenue += (o.total || 0);
    });

    // Employee discount orders
    const empOrders = db.prepare(`
      SELECT * FROM orders WHERE created_at >= ? AND empDiscount > 0
    `).all(todayMs).catch?.(() => []) || [];

    res.json({
      promos: Object.values(promoStats),
      employeeDiscountOrders: empOrders.length,
      employeeDiscountTotal: empOrders.reduce((s, o) => s + (o.empDiscount || 0), 0),
      generatedAt: Date.now(),
    });
  });

  // ── Public Config (POINT_VALUE etc) ──
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
  });

  // ── Waste Tracking ──
  app.post("/api/audit/waste", (req, res) => {
    const { itemName, itemId, quantity, unit, reason, shiftId, cashierId, cashierName } = req.body || {};
    if (!itemName || !quantity) return res.status(400).json({ error: "itemName + quantity required" });
    db.prepare(`
      INSERT INTO audit_waste (item_name, item_id, quantity, unit, reason, shift_id, cashier_id, cashier_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(itemName, itemId || null, quantity, unit || "pcs", reason || null, shiftId || null, cashierId || null, cashierName || null);
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

  // ── Event Log (forensic audit trail) ──
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

  // ── Outlets (multi-outlet ready) ──
  app.get("/api/audit/outlets", (req, res) => {
    // Single-outlet for now — returns current outlet stats
    // When multi-outlet ready, query from cloud/HQ database
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const orders = db.prepare(`
      SELECT * FROM orders WHERE created_at >= ?
    `).all(todayMs);

    const anomalies = db.prepare(`
      SELECT COUNT(*) as c FROM audit_anomalies WHERE resolved = 0
    `).get().c;

    res.json({
      items: [{
        id: "current",
        name: "Outlet Ini",
        revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
        orderCount: orders.length,
        anomalies,
      }],
      generatedAt: Date.now(),
    });
  });

  console.log("[Audit] API endpoints registered");
}


// ═══ EXPORT ══════════════════════════════════════════════════════════════════
// 
// Di server/index.js, tambahkan:
//
//   const { initAuditModule, registerAuditEndpoints, auditEngine } = require('./command-center-backend');
//   
//   // Setelah db initialized:
//   initAuditModule(db);
//   registerAuditEndpoints(app, db);
//   
//   // Di broadcast function:
//   function broadcast(type, data) {
//     wss.clients.forEach(client => { ... });  // existing
//     auditEngine.check(type, data, db, broadcast);  // ADD THIS
//   }
//

module.exports = { initAuditModule, registerAuditEndpoints, auditEngine, getDb };
