const express = require("express");

const os = require('os');
function getLanIP() {
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();

// ═══════════════════════════════════════════════════════════════
// ⚠️  ROUTING ORDER RULE — READ BEFORE ADDING NEW ROUTES
// ═══════════════════════════════════════════════════════════════
// Express matches routes in declaration order. ALWAYS declare
// specific paths BEFORE wildcards on the same method:
//
//   ✅ GOOD:  app.get("/api/X/special")
//             app.get("/api/X/:id")
//
//   ❌ BAD:   app.get("/api/X/:id")
//             app.get("/api/X/special")   // never reached!
//
// Active :id wildcards in this file (place specifics ABOVE these):
//   - GET    /api/orders/:id           (line ~148)
//   - GET    /api/promo/:id            (line ~571)
//   - PATCH  /api/menu/:id             (line ~353)
//   - PATCH  /api/customers/:id        (line ~682)
//   - PATCH  /api/tables/:id           (line ~1379)
//   - PATCH  /api/auth/users/:id       (line ~1342)
//   - GET    /api/payment/status/:orderId   (line ~1143)
//   - GET    /api/payment/check/:internalOrderId  (line ~1047)
//   - GET    /api/receipt/:orderId     (line ~1513)
//   - PATCH  /api/staff-call/:id/resolve  (line ~1556)
//
// Past conflicts fixed:
//   - 2026-05: GET /api/promo/stats was swallowed by /api/promo/:id;
//     moved /stats above /:id. (Symptom: Promo Manager list empty.)
// ═══════════════════════════════════════════════════════════════
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// CORS — restrict ke karyaos.tech subdomains (production) + localhost dev.
// Pre-migration kiosk.karys.tech masih boleh sampai cutover selesai.
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);  // same-origin / curl / native app
    const allowed = [
      /\.karyaos\.tech$/i,                     // app/admin/api.karyaos.tech + any future subdomain
      /^https?:\/\/karyaos\.tech$/i,           // root
      /\.karys\.tech$/i,                       // TEMP: kiosk.karys.tech selama transition, hapus setelah cutover
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,  // dev
      /^https?:\/\/(192|10|172)\.\d+\.\d+\.\d+(:\d+)?$/i,  // LAN dev (POS terminal, dll)
    ];
    if (allowed.some(re => re.test(origin))) return cb(null, true);
    console.warn('[CORS] blocked origin:', origin);
    cb(new Error(`Origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use("/audio", express.static(require("path").join(__dirname, "audio")));
app.use("/screensaver", express.static(require("path").join(__dirname, "screensaver")));

// ─── UPLOADS — poster film, trailer file, dll ────────────────────────
const uploadDir = require("path").join(__dirname, "uploads");
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
app.use("/uploads", express.static(uploadDir, { maxAge: "7d" }));
const multer = require("multer");
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = require("path").extname(file.originalname).toLowerCase().slice(0, 8);
    const safe = file.fieldname.replace(/[^a-z0-9_-]/gi, "").slice(0, 16);
    cb(null, `${safe}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`);
  },
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (poster jpg/png biasanya <5MB, video <50MB)
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|gif|mp4|mov|webm|m4v|csv|xlsx|xls)$/i.test(file.originalname);
    if (!ok) return cb(new Error("File type not allowed (only image/video/CSV/XLSX)"));
    cb(null, true);
  },
});

// CDS Cinema state — moved BELOW body parser (line ~162) supaya req.body parsed.
// Lihat block setelah `app.use(express.json(...))` untuk endpoint actual.
let cinemaCdsState = { stage: "idle", outlet: null, ts: Date.now() };

// POST /api/upload — multipart form-data, field name "file"
// Response: { ok:true, url:"/uploads/filename.ext", filename, size, mimetype }
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded (field name: file)" });
  res.json({
    ok: true,
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});


// ─── ADMIN: Email/SMTP config ────────────────────────────────────────
// IMPORTANT: PATCH endpoint butuh JSON body parser. Body parser global
// di-load di line ~154, jadi pakai local express.json() middleware untuk
// endpoint ini biar req.body terparsed walau urutan registrasi sebelum
// global body parser. [[express-middleware-order]] gotcha.
app.get("/api/admin/email-config", (_, res) => res.json(emailModule.getMaskedConfig()));
app.patch("/api/admin/email-config", requireAdmin, express.json({ limit: "5mb" }), (req, res) => {
  try {
    const cur = emailModule.getConfig();
    const patch = req.body || {};
    // Don't overwrite password if request contains bullets (masked)
    if (patch.smtpPass && patch.smtpPass.includes("•")) delete patch.smtpPass;
    const saved = emailModule.saveConfig({ ...cur, ...patch });
    console.log(`📧 Email config updated (enabled=${saved.enabled}, host=${saved.smtpHost})`);
    res.json({ ok: true, config: emailModule.getMaskedConfig() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/email-test", requireAdmin, express.json({ limit: "5mb" }), async (req, res) => {
  try {
    await emailModule.testConnection();
    // Also send a test email if recipient provided
    if (req.body?.testTo) {
      await emailModule.sendEmail({
        to: req.body.testTo,
        subject: "KaryaOS — Test Email",
        html: `<h2>📧 Test Email Berhasil</h2><p>Konfigurasi SMTP KaryaOS Kiosk OK. Dikirim pada ${new Date().toLocaleString("id-ID")}.</p>`,
      });
    }
    res.json({ ok: true, message: "SMTP OK" + (req.body?.testTo ? " · test email terkirim" : "") });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Z-Report email (frontend POSTs xlsx as base64) ──────────────────
app.post("/api/reports/z/email", requireAdmin, async (req, res) => {
  try {
    const { recipients, subject, attachmentBase64, attachmentFilename, periodLabel } = req.body || {};
    if (!recipients || (Array.isArray(recipients) && !recipients.length)) {
      return res.status(400).json({ error: "Recipients required" });
    }
    const attachments = attachmentBase64 ? [{
      filename: attachmentFilename || `Z-Report-${new Date().toISOString().slice(0,10)}.xlsx`,
      content:  Buffer.from(attachmentBase64.replace(/^data:[^;]+;base64,/, ""), "base64"),
    }] : [];
    const result = await emailModule.sendEmail({
      to: recipients,
      subject: subject || `Z-Report KaryaOS — ${periodLabel || new Date().toLocaleDateString("id-ID")}`,
      html: `<div style="font-family:Arial,sans-serif">
        <h2 style="color:#F59E0B">📊 KaryaOS Z-Report</h2>
        <p>Halo,<br/>Terlampir laporan Z-Report dari kiosk KaryaOS untuk periode <strong>${periodLabel || "—"}</strong>.</p>
        <p>File Excel berisi: Ringkasan, Breakdown Pembayaran, Jenis Order, Top Items, Promo, dan Rekonsiliasi Kas.</p>
        <hr/><p style="font-size:11px;color:#888">Email otomatis dari KaryaOS Kiosk · ${new Date().toLocaleString("id-ID")}</p>
      </div>`,
      attachments,
    });
    res.json(result);
  } catch (e) {
    console.error("Email Z-Report fail:", e);
    res.status(500).json({ error: e.message });
  }
});

app.use(express.json({ limit: "5mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ─── MULTI-TENANT MIDDLEWARE ─────────────────────────────────────────────
// Resolve company scope dengan priority:
//   1. x-super-admin: true header → akses semua (karys platform admin)
//   2. x-company-id header → filter by company (authenticated admin/kasir)
//   3. ?outlet=CODE param → derive company dari outlet_master (customer kiosk)
//   4. Fallback → no-filter (public assets)
const _scopeCache = new Map(); // outlet_code → company_id cache (refresh 60s)
function _resolveOutletCompany(outletCode) {
  if (!outletCode) return null;
  const code = String(outletCode).toUpperCase();
  const cached = _scopeCache.get(code);
  if (cached && cached.expires > Date.now()) return cached.cid;
  try {
    const row = db.rawDb.prepare(`SELECT company_id FROM outlet_master WHERE UPPER(code) = ? OR UPPER(name) = ?`).get(code, code);
    const cid = row?.company_id || null;
    _scopeCache.set(code, { cid, expires: Date.now() + 60000 });
    return cid;
  } catch { return null; }
}
app.use((req, _res, next) => {
  // Priority 1: super-admin
  if (String(req.headers['x-super-admin'] || '') === 'true') {
    req.companyScope = { company_id: null, is_super_admin: true, filter_sql: '1=1', filter_params: [] };
    return next();
  }
  // Priority 2: explicit company header
  const cid = parseInt(req.headers['x-company-id'], 10);
  if (cid) {
    req.companyScope = { company_id: cid, is_super_admin: false, filter_sql: 'company_id = ?', filter_params: [cid] };
    return next();
  }
  // Priority 3: outlet param → derive company
  const outletCode = req.query.outlet || (req.body && req.body.outlet) || null;
  if (outletCode) {
    const derivedCid = _resolveOutletCompany(outletCode);
    if (derivedCid) {
      req.companyScope = { company_id: derivedCid, is_super_admin: false, filter_sql: 'company_id = ?', filter_params: [derivedCid], from: 'outlet' };
      return next();
    }
  }
  // Priority 4: no scope (public/no-filter mode — backwards compat)
  req.companyScope = { company_id: null, is_super_admin: true, filter_sql: '1=1', filter_params: [], from: 'fallback' };
  return next();
});

// ─── DYNAMIC PWA MANIFEST (per-tenant) — must be AFTER companyScope middleware
app.get("/manifest.webmanifest", (req, res) => {
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  try {
    const sc = req.companyScope || {};
    let companyId = sc.company_id;
    if (!companyId) {
      const row = db.rawDb.prepare(`SELECT id FROM companies WHERE status='active' ORDER BY id LIMIT 1`).get();
      companyId = row?.id || 1;
    }
    const c = db.rawDb.prepare(`SELECT id, code, name, brand_color, logo_url FROM companies WHERE id = ?`).get(companyId);
    const PLATFORM_CODES = ["BTS", "CMX", "KARYAOS"];
    const isPlatform = !c?.code || PLATFORM_CODES.includes(c.code);
    const displayName = isPlatform ? "karyaos" : (c?.name || "karyaos");
    const brand = c?.brand_color || "#FF6B35";
    const logoUrl = c?.logo_url || "/logo.png";
    // Use X-Forwarded-Host (nginx) so manifest URLs are public, not localhost
    const proto = req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http");
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const absoluteLogo = logoUrl.startsWith("http") ? logoUrl : `${proto}://${host}${logoUrl}`;
    return res.json({
      name: displayName + " — Self-order Kiosk",
      short_name: displayName,
      description: `${displayName} self-order kiosk on karyaos`,
      start_url: "/?kiosk=1",
      display: "standalone",
      orientation: "landscape",
      background_color: "#12141c",
      theme_color: brand,
      icons: [
        { src: absoluteLogo, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: absoluteLogo, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
      categories: ["food", "business"],
      lang: "en",
    });
  } catch (e) {
    return res.json({
      name: "karyaos", short_name: "karyaos",
      start_url: "/?kiosk=1", display: "standalone",
      background_color: "#12141c", theme_color: "#FF6B35",
      icons: [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
    });
  }
});

// Generic response filter — strip out items dengan company_id != tenant
// Registered HERE supaya berjalan sebelum semua route handler downstream.
try {
  const { scopeFilterMiddleware } = require('./multi-tenant-mass-migrate');
  app.use(scopeFilterMiddleware);
  console.log('[multi-tenant] scope filter middleware armed (defense-in-depth for list endpoints)');
} catch (e) { console.warn('[multi-tenant] filter middleware skipped:', e.message); }

// Feature entitlement enforcement — 402 untuk endpoint yang feature-nya gak di-cover plan
// MUST register before route handlers but use lazy DB path lookup (DB_PATH defined later in file).
try {
  const { setupFeatureEnforcement } = require('./feature-enforcement');
  const _path = require('path');
  global.featureEnforcement = setupFeatureEnforcement(app, { dbPath: _path.join(__dirname, 'data.db') });
} catch (e) { console.warn('[feature-enforcement] skipped:', e.message); }

// ─── AUTH HELPERS — reusable session + role guards utk admin endpoints ───
// requireSession  → 401 kalau bearer token gak valid, attach req.session
// requireAdmin    → requireSession + role check (admin/super-admin/owner/manager)
function requireSession(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized — login required' });
  req.session = session;
  next();
}
function requireAdmin(req, res, next) {
  return requireSession(req, res, () => {
    const role = (req.session.role || '').toLowerCase();
    const isAdminTier = role === 'super-admin' || role === 'admin' || role === 'owner' || role === 'manager' || role.endsWith('-manager');
    if (!isAdminTier) return res.status(403).json({ error: `Role "${role}" tidak punya akses admin config` });
    next();
  });
}

// Helper: derive outlet scope dari session user.
// Returns:
//   { outletCode: null, all: true }   — user lihat semua outlet (super-admin/admin/owner/no binding)
//   { outletCode: 'CMX-BDG01', all: false } — user terikat outlet, hanya lihat outlet itu
// Pakai di GET endpoints buat filter list/report data per outlet.
function getOutletScope(req) {
  const session = req.session;
  if (!session) return { outletCode: null, all: true };
  const role = (session.role || '').toLowerCase();
  // Super-admin tier: selalu lihat semua (cross-outlet visibility)
  if (role === 'super-admin' || role === 'superadmin' || role === 'admin' || role === 'owner') {
    return { outletCode: null, all: true };
  }
  // Manager/cashier: lookup user record, kalau outlet_code di-set → scope ke situ
  try {
    const userRow = db.rawDb.prepare(`SELECT outlet_code FROM admin_users WHERE id = ?`).get(session.userId);
    const outletCode = userRow?.outlet_code || null;
    return { outletCode, all: !outletCode };
  } catch {
    return { outletCode: null, all: true };
  }
}

// ─── CDS Cinema — second display state (NOW receives parsed body) ───
// POS Cinema POST current sale state → backend broadcast via WS ke semua CDS terminal.
app.post("/api/cinema/cds/state", (req, res) => {
  const state = req.body || {};
  cinemaCdsState = { ...state, ts: Date.now() };
  broadcast("cinema_cds:state", cinemaCdsState);
  res.json({ ok: true });
});
app.get("/api/cinema/cds/state", (_req, res) => res.json(cinemaCdsState));

const db = require('./db');
const rbacAcl = require('./rbac');  // RBAC ACL helper (canDo, requireLevel) — beda dgn setupRBAC backend
const wa = require('./whatsapp');
const loyalty = require('./loyalty');
const midtrans = require("./midtrans");
const audioConfig = require("./audio");
const screensaver = require("./screensaver");
const emailModule = require("./email");
// Customers helpers from db: loadAllCustomers, insertCustomer, deleteCustomer
const { buildKitchenTicket, buildCustomerReceipt } = require('./escpos');
const fs = require('fs');
const path = require('path');

// ─── IN-MEMORY DATABASE ────────────────────────────────────────────────────
let orders = db.loadAllOrders();

let menu = [
  // ─── FROZEN YOGURT (11) ───────────────────────────────────────────
  { id: 101, cat: 'froyo', emoji: '🖤', name: 'Black Sakura Regular',        desc: 'Charcoal froyo · 2 toppings',                 price: 54000,  freeToppings: 2, popular: true, avail: true, tag: 'BESTSELLER' },
  { id: 102, cat: 'froyo', emoji: '🖤', name: 'Black Sakura Large',          desc: 'Charcoal froyo · 3 toppings',                 price: 69000,  freeToppings: 3, avail: true },
  { id: 103, cat: 'froyo', emoji: '🤍', name: 'White Skim Regular',          desc: 'Classic skim milk · 2 toppings',              price: 47000,  freeToppings: 2, popular: true, avail: true, tag: 'BESTSELLER' },
  { id: 104, cat: 'froyo', emoji: '🤍', name: 'White Skim Large',            desc: 'Classic skim milk · 3 toppings',              price: 64000,  freeToppings: 3, avail: true },
  { id: 105, cat: 'froyo', emoji: '🤍', name: 'Lykone White Skim',           desc: 'Lykone cone · 2 toppings',                    price: 49000,  freeToppings: 2, avail: true },
  { id: 106, cat: 'froyo', emoji: '🍓', name: 'Strawberry Bliss',            desc: 'Real strawberry swirl · 2 toppings',          price: 52000,  freeToppings: 2, avail: true, tag: 'NEW' },
  { id: 107, cat: 'froyo', emoji: '🥭', name: 'Mango Sunrise',               desc: 'Tropical mango pulp · 2 toppings',            price: 52000,  freeToppings: 2, avail: true },
  { id: 108, cat: 'froyo', emoji: '🍵', name: 'Matcha Garden',               desc: 'Ceremonial matcha · 2 toppings',              price: 56000,  freeToppings: 2, avail: true, tag: 'SIGNATURE' },
  { id: 109, cat: 'froyo', emoji: '☕', name: 'Coffee Caramel',              desc: 'Espresso swirl + caramel · 2 toppings',       price: 54000,  freeToppings: 2, avail: true },
  { id: 110, cat: 'froyo', emoji: '💜', name: 'Taro Cloud',                  desc: 'Bandung taro · 2 toppings',                   price: 52000,  freeToppings: 2, avail: true },
  { id: 111, cat: 'froyo', emoji: '🍯', name: 'Honey Lavender',              desc: 'House-signature floral · 2 toppings',         price: 62000,  freeToppings: 2, avail: true, tag: 'PREMIUM' },

  // ─── SMOOTHIES (9) ───────────────────────────────────────────────
  { id: 201, cat: 'smoothies', emoji: '🍓', name: 'Yogurt Strawberry',       desc: 'Strawberry · aloe vera · chia seed',           price: 50000,  freeToppings: 0, popular: true, avail: true, tag: 'BESTSELLER' },
  { id: 202, cat: 'smoothies', emoji: '🍑', name: 'Yogurt Peach',            desc: 'White skim + fresh peach',                     price: 50000,  freeToppings: 0, avail: true },
  { id: 203, cat: 'smoothies', emoji: '🥭', name: 'Collagen Mango',          desc: 'Collagen yogurt + fresh mango',                price: 50000,  freeToppings: 0, avail: true },
  { id: 204, cat: 'smoothies', emoji: '🥥', name: 'Sally x Hydrococo',       desc: 'Coconut water + yogurt + banana sauce',        price: 37000,  freeToppings: 0, avail: true },
  { id: 205, cat: 'smoothies', emoji: '🥑', name: 'Avocado Cream',           desc: 'Avocado + palm sugar swirl',                   price: 52000,  freeToppings: 0, avail: true, tag: 'PREMIUM' },
  { id: 206, cat: 'smoothies', emoji: '🍌', name: 'Banana Peanut',           desc: 'Banana + peanut butter blend',                 price: 48000,  freeToppings: 0, avail: true },
  { id: 207, cat: 'smoothies', emoji: '🍍', name: 'Pineapple Mint',          desc: 'Refreshing tropical mint',                     price: 45000,  freeToppings: 0, avail: true, tag: 'NEW' },
  { id: 208, cat: 'smoothies', emoji: '🥬', name: 'Green Detox',             desc: 'Spinach · apple · lime · ginger',              price: 48000,  freeToppings: 0, avail: true },
  { id: 209, cat: 'smoothies', emoji: '🍇', name: 'Acai Berry Bowl',         desc: 'Brazilian superfruit + granola',               price: 65000,  freeToppings: 0, avail: true, tag: 'PREMIUM' },

  // ─── YOGULATO (10) ───────────────────────────────────────────────
  { id: 301, cat: 'yogulato', emoji: '🍓', name: 'Ichi-Go-Mochi Strawberry', desc: 'Yogurt gelato · 100ml',                        price: 49000,  freeToppings: 0, avail: true },
  { id: 302, cat: 'yogulato', emoji: '🍪', name: 'Cookie Dough & Raisin',    desc: 'Yogurt gelato · 100ml',                        price: 49000,  freeToppings: 0, avail: true },
  { id: 303, cat: 'yogulato', emoji: '🍵', name: "Bean Missin' U Matcha",    desc: 'Yogurt gelato · 100ml',                        price: 49000,  freeToppings: 0, avail: true, tag: 'BESTSELLER' },
  { id: 304, cat: 'yogulato', emoji: '🍫', name: 'Ciao Cioccolato',          desc: 'Yogurt gelato · 100ml',                        price: 49000,  freeToppings: 0, avail: true },
  { id: 305, cat: 'yogulato', emoji: '⚪', name: 'Plain Sally',              desc: 'Yogurt gelato · original',                     price: 49000,  freeToppings: 0, avail: true },
  { id: 306, cat: 'yogulato', emoji: '🍮', name: 'Salted Caramel',           desc: 'Sweet meets salty · gourmet',                  price: 54000,  freeToppings: 0, avail: true, tag: 'BESTSELLER' },
  { id: 307, cat: 'yogulato', emoji: '🍰', name: 'Tiramisu',                 desc: 'Mascarpone · espresso · cocoa',                price: 58000,  freeToppings: 0, avail: true, tag: 'PREMIUM' },
  { id: 308, cat: 'yogulato', emoji: '🥜', name: 'Pistachio',                desc: 'Real Sicilian pistachios',                     price: 65000,  freeToppings: 0, avail: true, tag: 'PREMIUM' },
  { id: 309, cat: 'yogulato', emoji: '☕', name: 'Mocha Affogato',           desc: 'Espresso poured over vanilla',                 price: 56000,  freeToppings: 0, avail: true, tag: 'NEW' },
  { id: 310, cat: 'yogulato', emoji: '🌹', name: 'Rose Lychee',              desc: 'Persian rose + lychee pearls',                 price: 58000,  freeToppings: 0, avail: true },

  // ─── TAKE HOME PACK (6) ──────────────────────────────────────────
  { id: 401, cat: 'takehome', emoji: '🖤', name: 'Take Home Black Sakura 250g', desc: '3 toppings — crunchy/sauce/fruit',         price: 95000,  freeToppings: 3, avail: true },
  { id: 402, cat: 'takehome', emoji: '🤍', name: 'Take Home White Skim 250g',   desc: '3 toppings — crunchy/sauce/fruit',         price: 85000,  freeToppings: 3, avail: true },
  { id: 403, cat: 'takehome', emoji: '🖤', name: 'Take Home Black Sakura 500g', desc: '6 toppings (2 crunchy · 2 sauce · 2 fruit)', price: 165000, freeToppings: 6, avail: true },
  { id: 404, cat: 'takehome', emoji: '🤍', name: 'Take Home White Skim 500g',   desc: '6 toppings (2 crunchy · 2 sauce · 2 fruit)', price: 145000, freeToppings: 6, avail: true },
  { id: 405, cat: 'takehome', emoji: '🍓', name: 'Take Home Strawberry 250g',   desc: '3 toppings · premium strawberry',           price: 98000,  freeToppings: 3, avail: true, tag: 'NEW' },
  { id: 406, cat: 'takehome', emoji: '🍵', name: 'Take Home Matcha 500g',       desc: '6 toppings · ceremonial matcha',            price: 175000, freeToppings: 6, avail: true, tag: 'PREMIUM' },

  // ─── SPECIAL / COLLAB (6) ────────────────────────────────────────
  { id: 501, cat: 'collab', emoji: '🎮', name: 'Sour Sally x MLBB',         desc: 'Limited edition collab pack',                   price: 85000,  freeToppings: 2, avail: true },
  { id: 502, cat: 'collab', emoji: '🎬', name: 'Movie Night Combo',         desc: 'Froyo + popcorn + drink',                       price: 95000,  freeToppings: 2, avail: true, tag: 'NEW' },
  { id: 503, cat: 'collab', emoji: '✨', name: 'Boba Yogulato Twist',       desc: 'Brown sugar boba meets froyo',                  price: 62000,  freeToppings: 1, avail: true },
  { id: 504, cat: 'collab', emoji: '🌸', name: 'Sakura Spring Limited',     desc: 'Seasonal · while supplies last',                price: 78000,  freeToppings: 2, avail: true, tag: 'LIMITED' },
  { id: 505, cat: 'collab', emoji: '🎂', name: 'Birthday Cake Yogulato',    desc: 'Funfetti + rainbow sprinkles',                  price: 68000,  freeToppings: 0, avail: true },
  { id: 506, cat: 'collab', emoji: '🍡', name: 'Mochi Crunch Premium',      desc: 'Mochi pieces in matcha froyo',                  price: 72000,  freeToppings: 1, avail: true, tag: 'PREMIUM' },

  // ─── DRINKS (6) — NEW CATEGORY ───────────────────────────────────
  { id: 601, cat: 'drinks', emoji: '☕', name: 'Iced Latte',               desc: 'Smooth espresso & milk over ice',                price: 32000,  freeToppings: 0, avail: true, popular: true, tag: 'BESTSELLER' },
  { id: 602, cat: 'drinks', emoji: '🍵', name: 'Matcha Latte',             desc: 'Ceremonial-grade matcha · oat milk',             price: 38000,  freeToppings: 0, avail: true },
  { id: 603, cat: 'drinks', emoji: '🍑', name: 'Peach Fruit Tea',          desc: 'Cold-brewed black tea + fresh peach',            price: 28000,  freeToppings: 0, avail: true },
  { id: 604, cat: 'drinks', emoji: '🍹', name: 'Berry Mocktail',           desc: 'Mixed berry sparkler · non-alcoholic',           price: 34000,  freeToppings: 0, avail: true, tag: 'NEW' },
  { id: 605, cat: 'drinks', emoji: '🥛', name: 'Strawberry Milk',          desc: 'Fresh strawberry · cold milk',                   price: 30000,  freeToppings: 0, avail: true },
  { id: 606, cat: 'drinks', emoji: '💧', name: 'Sparkling Water 330ml',    desc: 'Chilled · refreshing',                           price: 18000,  freeToppings: 0, avail: true },

  // ─── BITES (6) — NEW CATEGORY ────────────────────────────────────
  { id: 701, cat: 'bites', emoji: '🧇', name: 'Crispy Waffle',             desc: 'Belgian-style · maple syrup',                    price: 42000,  freeToppings: 0, avail: true, popular: true, tag: 'BESTSELLER' },
  { id: 702, cat: 'bites', emoji: '🍪', name: 'Soft Choco Cookie',         desc: 'Warm · chocolate chip · gooey',                  price: 18000,  freeToppings: 0, avail: true },
  { id: 703, cat: 'bites', emoji: '🍫', name: 'Fudge Brownie',             desc: 'Dense · rich · served warm',                     price: 25000,  freeToppings: 0, avail: true },
  { id: 704, cat: 'bites', emoji: '🥨', name: 'Mini Churros',              desc: 'Cinnamon sugar · chocolate dip',                 price: 32000,  freeToppings: 0, avail: true },
  { id: 705, cat: 'bites', emoji: '🌸', name: 'French Macarons (3pcs)',    desc: 'Assorted flavors · box of 3',                    price: 45000,  freeToppings: 0, avail: true, tag: 'PREMIUM' },
  { id: 706, cat: 'bites', emoji: '🍩', name: 'Donut Glazed',              desc: 'Classic glaze · fresh-baked',                    price: 22000,  freeToppings: 0, avail: true },
];

// Multi-tenant: tag all legacy hardcoded menu items as BTS (company_id=1).
// New tenants get empty menu — mereka upload sendiri via Admin → Menu.
menu = menu.map(m => ({ ...m, company_id: m.company_id ?? 1 }));

// ─── Apply persisted menu avail overrides ───
const _menuOverrides = db.getMenuOverrides();
menu.forEach(item => {
  if (_menuOverrides.has(item.id)) item.avail = _menuOverrides.get(item.id);
});
if (_menuOverrides.size > 0) console.log(`📋 Applied ${_menuOverrides.size} menu avail overrides`);

const toppings = [
  // Fruits
  { id: 'f01', name: 'Strawberry',    group: 'Fruits',    price: 0 },
  { id: 'f02', name: 'Kiwi',          group: 'Fruits',    price: 0 },
  { id: 'f03', name: 'Peach',         group: 'Fruits',    price: 0 },
  { id: 'f04', name: 'Mangga',        group: 'Fruits',    price: 0 },
  { id: 'f05', name: 'Longan',        group: 'Fruits',    price: 0 },
  { id: 'f06', name: 'Nanas',         group: 'Fruits',    price: 0 },
  { id: 'f07', name: 'Aloe Vera',     group: 'Fruits',    price: 0 },
  // Crunchies
  { id: 'c01', name: 'Mochi Mix',     group: 'Crunchies', price: 0 },
  { id: 'c02', name: 'Oreo Crumble',  group: 'Crunchies', price: 0 },
  { id: 'c03', name: 'Granola',       group: 'Crunchies', price: 0 },
  { id: 'c04', name: 'Rainbow Cubes', group: 'Crunchies', price: 0 },
  { id: 'c05', name: 'Roasted Almond',group: 'Crunchies', price: 0 },
  { id: 'c06', name: 'Honey Granola', group: 'Crunchies', price: 0 },
  { id: 'c07', name: 'Chia Seed',     group: 'Crunchies', price: 0 },
  // Sauces
  { id: 's01', name: 'Blueberry Sauce', group: 'Sauces', price: 0 },
  { id: 's02', name: 'Mango Sauce',     group: 'Sauces', price: 0 },
  { id: 's03', name: 'Taro Latte',      group: 'Sauces', price: 0 },
  { id: 's04', name: 'Chocolate Sauce', group: 'Sauces', price: 0 },
  // Premium
  { id: 'p01', name: 'Cookie Dough',   group: 'Premium', price: 4000 },
  { id: 'p02', name: 'Choco Waferino', group: 'Premium', price: 4000 },
  { id: 'p03', name: 'Goji Berry',     group: 'Premium', price: 4000 },
  { id: 'p04', name: 'Caviar Jelly',   group: 'Premium', price: 4000 },
];

const categories = [
  { id: 'froyo',     name: 'Frozen Yogurt', emoji: '🍦', color: '#8B5CF6' },
  { id: 'smoothies', name: 'Smoothies',     emoji: '🥤', color: '#EC4899' },
  { id: 'yogulato',  name: 'Yogulato',      emoji: '🍨', color: '#06B6D4' },
  { id: 'drinks',    name: 'Drinks',        emoji: '☕', color: '#A78BFA' },
  { id: 'bites',     name: 'Bites',         emoji: '🍰', color: '#F472B6' },
  { id: 'takehome',  name: 'Take Home',     emoji: '📦', color: '#F59E0B' },
  { id: 'collab',    name: 'Special',       emoji: '✨', color: '#EF4444' },
];

const EXTRA_TOPPING_PRICE = 8000;

let orderCounter = orders.length
  ? Math.max(0, ...orders.map(o => {
      const m = /^A(\d+)$/.exec(o.id || "");
      return m ? parseInt(m[1]) : 0;
    }))
  : 0;
console.log(`📊 Order counter resumed at ${orderCounter} — next ID: A${String(orderCounter+1).padStart(2,"0")}`);

// ─── WEBSOCKET BROADCAST ───────────────────────────────────────────────────
function broadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
  // Audit engine — detect anomalies from WS events
  try { if (typeof auditEngine !== 'undefined') auditEngine.check(event, data, db, broadcast); } catch(e) {}
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  console.log("🔌 Client connected via WebSocket");
  // Send current state on connect
  ws.send(JSON.stringify({ event: "init", data: { orders, menu }, ts: Date.now() }));
  ws.on("pong",  () => { ws.isAlive = true; });
  // App-level ping/pong (client kirim JSON ping → server reply pong).
  // Berguna untuk keep-alive lewat nginx + tracking client liveness.
  ws.on("message", (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m && m.event === "ping") {
        ws.isAlive = true;
        ws.send(JSON.stringify({ event: "pong", ts: Date.now() }));
      }
    } catch {}
  });
  ws.on("error", (e) => console.warn("⚠️  WS client error:", e.message));
  ws.on("close", () => console.log("🔌 Client disconnected"));
});

// Heartbeat: ping every 30s, terminate non-responsive clients
const wsHeartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);
wss.on("close", () => clearInterval(wsHeartbeat));

// ─── ROUTES ────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), time: new Date().toISOString() });
});

// ── ORDERS ──────────────────────────────────────────────────────────────────

// GET all orders
app.get("/api/orders", (req, res) => {
  const { status } = req.query;
  let result = status ? orders.filter(o => o.status === status) : orders;
  // Multi-tenant: filter by company_id (super-admin sees all)
  const scope = req.companyScope || { is_super_admin: true };
  if (!scope.is_super_admin) {
    result = result.filter(o => o.companyId == null || o.companyId === scope.company_id);
  }
  // Outlet-scope: manager bound ke outlet hanya lihat order outlet itu.
  // Admin/owner/HQ-access (no binding) → lihat semua.
  const outletScope = global.getSessionOutlet?.(req) || { isHQ: true };
  if (!outletScope.isHQ && outletScope.outletCode) {
    result = result.filter(o => !o.outlet_code || o.outlet_code === outletScope.outletCode);
  }
  res.json(result);
});

// GET single order
// SECURITY: Order GET dgn scope filter — prevent IDOR (insecure direct object ref)
// Tanpa scope check, user A bisa GET order user B di tenant lain dgn guess ID.
app.get("/api/orders/:id", (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  // Authenticated tenant: blokir akses cross-company. Return 404 (jangan leak existence)
  const sc = req.companyScope || {};
  if (sc.company_id != null && !sc.is_super_admin) {
    if (order.company_id != null && order.company_id !== sc.company_id) {
      return res.status(404).json({ error: "Order not found" });
    }
  }
  res.json(order);
});


// ─── PRINTER HELPERS ────────────────────────────────────────────────────
const PRINTER_DEBUG = process.env.PRINTER_DEBUG !== "false"; // default ON

async function _print(kind, order, bytes, envIpKey, envPortKey, dirName, emoji) {
  try {
    const ip   = process.env[envIpKey];
    const port = parseInt(process.env[envPortKey] || "9100");

    if (PRINTER_DEBUG || !ip) {
      const dir = path.join(__dirname, dirName);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `order-${order.id}-${Date.now()}.bin`);
      fs.writeFileSync(file, bytes);
      console.log(`${emoji} [DEBUG] ${kind} saved: ${file} (${bytes.length} bytes)`);
      return;
    }

    await tcpPrint(ip, port, bytes);
    console.log(`${emoji} ${kind} printed: order #${order.id} → ${ip}:${port}`);
  } catch (e) {
    console.error(`${emoji} ${kind} print FAILED for #${order.id}:`, e.message);
  }
}

async function printKitchenTicket(order) {
  return _print("Kitchen ticket", order, buildKitchenTicket(order, printerConfig.template),
                "KITCHEN_PRINTER_IP", "KITCHEN_PRINTER_PORT",
                "kitchen-tickets", "🍳");
}

async function printCustomerReceipt(order) {
  return _print("Customer receipt", order, buildCustomerReceipt(order, printerConfig.template),
                "CUSTOMER_PRINTER_IP", "CUSTOMER_PRINTER_PORT",
                "customer-receipts", "🧾");
}

// POST create new order (from kiosk checkout)
app.post("/api/orders", (req, res) => {
  const _splitPayments = Array.isArray(req.body && req.body.payments) ? req.body.payments : null;
  const isSplit = _splitPayments && _splitPayments.length > 0;
  if (isSplit) {
    const sumPay = _splitPayments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
    const reqTotal = parseInt(req.body.total) || 0;
    if (sumPay < reqTotal) {
      return res.status(400).json({ error: `Split payments sum (${sumPay}) below total (${reqTotal})` });
    }
    const methods = [...new Set(_splitPayments.map(p => p.method))];
    req.body.pay = methods.length === 1 ? methods[0] : "SPLIT";
    req.body.status = "completed";
    req.body.payments = _splitPayments;
  }

  const { type, table, items, pay, addons, customerId, customerName, customerPhone, cashReceived, cashChange, status: reqStatus, kasir, source } = req.body;
  if (!type || !items || !items.length) {
    return res.status(400).json({ error: "type and items are required" });
  }

  // Inclusive pricing: menu prices are gross (already include 11% PPN)
  const subtotal = items.reduce((s, i) => s + (i.p * i.q) + (i.addonTotal || 0), 0);
  // SECURITY: cap promoDiscount — gak boleh negative atau > subtotal
  // (sebelumnya trust frontend → bug hunter pass discount 9999999)
  let promoDisc = Math.max(0, parseInt(req.body.promoDiscount, 10) || 0);
  promoDisc = Math.min(promoDisc, subtotal);  // discount tidak boleh > subtotal

  // Loyalty redeem: strict trust frontend (customer's explicit choice), backend caps defensively
  // NOTE: actual customer.points mutation + DB writes happen inside transaction below (rollback-safe)
  let pointsRedeemed = 0, pointsDiscount = 0;
  let _redeemCust = null;
  if (customerId && loyalty.getConfig().enabled) {
    _redeemCust = customers.find(c => c.id === customerId);
    const frontPts = parseInt(req.body.pointsRedeemed) || 0;
    if (_redeemCust && frontPts > 0) {
      const cfg = loyalty.getConfig();
      const maxFromBal = Math.floor((_redeemCust.points || 0) / cfg.redeemRate) * cfg.redeemRate;
      const maxFromPct = Math.floor(Math.max(0, subtotal - promoDisc) * cfg.maxRedeemPercent / 100 / cfg.redeemRate) * cfg.redeemRate;
      pointsRedeemed  = Math.min(maxFromBal, maxFromPct, frontPts);
      pointsDiscount  = Math.floor(pointsRedeemed / cfg.redeemRate) * 1000;
    }
  }

  const subtotalAfterPromo = Math.max(0, subtotal - promoDisc - pointsDiscount);
  const tax = Math.round(subtotalAfterPromo * 11 / 111);  // extract tax portion (inclusive)
  // biaya layanan transaksi digital (QRIS dll) — nutup MDR; tunai & POS kasir bebas
  const convenienceFee = (typeof global.getConvenienceFee === 'function')
    ? global.getConvenienceFee(pay, source) : 0;
  // Service charge — auto 5% dine-in (config via pos_config.SERVICE_CHARGE_DINEIN_*)
  let serviceCharge = 0;
  try {
    const isDineIn = type === "dine" || type === "dine-in" || type === "dinein";
    if (isDineIn) {
      const enRow = db.rawDb.prepare(`SELECT value FROM pos_config WHERE key='SERVICE_CHARGE_DINEIN_ENABLED'`).get();
      const pctRow = db.rawDb.prepare(`SELECT value FROM pos_config WHERE key='SERVICE_CHARGE_DINEIN_PCT'`).get();
      const enabled = enRow ? JSON.parse(enRow.value) : true;
      const pct = pctRow ? Number(JSON.parse(pctRow.value)) || 0 : 5;
      if (enabled && pct > 0) {
        serviceCharge = Math.round(subtotalAfterPromo * pct / 100);
      }
    }
  } catch (e) { /* config missing → no charge */ }
  const total = subtotalAfterPromo + convenienceFee + serviceCharge;

  // Multi-tenant: tag order dengan company_id dari scope (default 1 = Karya Bites F&B)
  const _orderScope = req.companyScope || { is_super_admin: true, company_id: null };
  const _orderCompanyId = _orderScope.is_super_admin
    ? (parseInt(req.body.company_id, 10) || 1)
    : _orderScope.company_id;
  // Queue number — resets daily at midnight, plus configurable START_OFFSET
  // (marketing trick: start at e.g. #050 so first customer feels the place is busy).
  // Config via pos_config keys:
  //   QUEUE_START_OFFSET — int, default 0 (e.g. 50 = start at #051)
  //   QUEUE_PADDING      — int, default 3 (digit count)
  //   QUEUE_PREFIX       — string, default '' (e.g. 'A-' → 'A-051')
  let _queueStartOffset = 0, _queuePadding = 3, _queuePrefix = '';
  try {
    const cfgRows = db.rawDb.prepare(`SELECT key, value FROM pos_config WHERE key IN ('QUEUE_START_OFFSET','QUEUE_PADDING','QUEUE_PREFIX')`).all();
    for (const r of cfgRows) {
      if (r.key === 'QUEUE_START_OFFSET') _queueStartOffset = parseInt(r.value, 10) || 0;
      if (r.key === 'QUEUE_PADDING')      _queuePadding      = parseInt(r.value, 10) || 3;
      if (r.key === 'QUEUE_PREFIX')       _queuePrefix       = String(r.value || '');
    }
  } catch {}
  const _startOfDay = new Date(); _startOfDay.setHours(0,0,0,0);
  const _todayCount = orders.filter(o => o.time >= _startOfDay.getTime()).length;
  const _queueRaw = _todayCount + 1 + _queueStartOffset;
  const _queueNumber = _queuePrefix + String(_queueRaw).padStart(_queuePadding, "0");

  const order = {
    id:       `A${String(++orderCounter).padStart(2, "0")}`,
    queueNumber: _queueNumber,
    time:     Date.now(),
    type:     type || "dine",
    table:    table || "-",
    status:   reqStatus || "waiting",
    pay:      pay || "QRIS",
    kasir:    kasir || null,
    source:   source || "kiosk",
    companyId: _orderCompanyId,
    items,
    addons:   addons || {},
    subtotal,
    tax,
    convenienceFee,
    serviceCharge,
    total,
    customerId,
    customerName,
    customerPhone,
    promoCode:    req.body.promoCode    || null,
    promoDiscount:req.body.promoDiscount|| 0,
    promoFreeItems: req.body.promoFreeItems || null,
    pointsRedeemed,
    pointsDiscount,
    cashReceived: cashReceived ?? null,
    cashChange:   cashChange ?? null,
    // Outlet tag — important untuk audit + fraud prevention.
    outlet_code: req.body.outlet_code || req.body.outletCode || null,
  };

  // SECURITY: kalau order datang dari POS dgn kasir yg outlet_code di admin_users,
  // outlet_code di body HARUS match. Mencegah kasir di outlet A jual untuk outlet B.
  // Kalau user.outlet_code = null (gak bound), skip check (multi-outlet manager).
  if (order.source === "pos" || order.source === "cinema_pos" || order.source === "pos_cinema") {
    try {
      const kasirName = order.kasir;
      if (kasirName) {
        adminUsers = adminUsers.length > 0 ? adminUsers : db.loadAllAdminUsers();
        const u = adminUsers.find(x => x.name === kasirName);
        if (u && u.outlet_code && order.outlet_code && u.outlet_code !== order.outlet_code) {
          console.warn(`🚨 OUTLET MISMATCH: kasir ${kasirName} (bound to ${u.outlet_code}) submit order from ${order.outlet_code}`);
          return res.status(403).json({
            error: `Kasir ${kasirName} terikat ke outlet ${u.outlet_code}, tapi order dari ${order.outlet_code}. Hubungi Manager.`,
            kasir_outlet: u.outlet_code, order_outlet: order.outlet_code,
          });
        }
      }
    } catch (e) { console.warn("[outlet-check]", e.message); }
  }

  // Update customer visit count & spend
  if (customerId) {
    const cIdx = customers.findIndex(c => c.id === customerId);
    if (cIdx >= 0) {
      customers[cIdx].visits     += 1;
      customers[cIdx].totalSpend += order.total;
      customers[cIdx].lastVisit   = Date.now();
      // Promote to member after 3 visits
      if (customers[cIdx].visits >= 3 && !customers[cIdx].tags?.includes("member")) {
        customers[cIdx].tags = [...(customers[cIdx].tags||[]).filter(t=>t!=="new"), "member"];
      }
      // Promote to VIP after 10 visits
      if (customers[cIdx].visits >= 10 && !customers[cIdx].tags?.includes("vip")) {
        customers[cIdx].tags = [...(customers[cIdx].tags||[]), "vip"];
      }
      db.insertCustomer(customers[cIdx]);
    }
  }

  // Record promo usage
  if (req.body.promoCode) {
    const pi = promoCodes.findIndex(p => p.code === req.body.promoCode);
    if (pi >= 0) promoCodes[pi].usedCount++;
  }

  // Mark table as occupied
  if (order.type === "dine" && order.table) {
    const ti = tables.findIndex(t => t.id === order.table || t.name === order.table);
    if (ti >= 0) { tables[ti].status = "occupied"; broadcast("table:updated", tables[ti]); }
  }

  // Add to active shift (vertical-aware — order source decides slot)
  const _orderVertical = _vertFromSource(order.source || source);
  const _activeShift = activeShifts[_orderVertical];
  if (_activeShift) {
    _activeShift.totalOrders++;
    _activeShift.totalRevenue += order.total;
  }

  // ── ATOMIC: persist order + customer (with redeem) + point tx in one transaction ──
  // If any DB write fails, ALL rollback. In-memory state mutated only on success.
  try {
    db.runInTransaction(() => {
      db.insertOrder(order);
    // Persist split payments
    if (isSplit && db && typeof db.updateOrderPayments === 'function') {
      try {
        db.updateOrderPayments(req.body.id || (newOrder && newOrder.id) || null, "completed", req.body.pay, _splitPayments);
      } catch(e) { console.warn("split persist:", e.message); }
    }

      if (_redeemCust && pointsRedeemed > 0) {
        const newBalance = (_redeemCust.points || 0) - pointsRedeemed;
        db.insertCustomer({ ..._redeemCust, points: newBalance });
        db.insertPointTx({ customerId, orderId: order.id, type: "redeem", amount: -pointsRedeemed, balanceAfter: newBalance });
      }
    });
    // Transaction succeeded → safe to mutate in-memory state
    if (_redeemCust && pointsRedeemed > 0) {
      _redeemCust.points = (_redeemCust.points || 0) - pointsRedeemed;
      console.log(`🎁 Redeem: ${pointsRedeemed}pt → Rp ${pointsDiscount} (customer ${customerId})`);
    }
    orders.push(order);
  } catch (e) {
    console.error(`❌ Order tx failed (${order.id}):`, e.message);
    orderCounter--; // rewind counter since order not persisted
    return res.status(500).json({ error: "Failed to create order", details: e.message });
  }
  printKitchenTicket(order).catch(() => {});   // fire-and-forget kitchen print
  printCustomerReceipt(order).catch(() => {}); // fire-and-forget customer struk
  broadcast("order:new", order);
  // P4A — outbound webhook
  if (typeof global.emitWebhook === 'function' && order.company_id) {
    global.emitWebhook(order.company_id, 'order.created', {
      id: order.id, type: order.type, total: order.total, table: order.table,
      customer_name: order.customerName, items: order.items, created_at: order.createdAt,
    });
    if (order.status === 'waiting' || order.pay) {
      global.emitWebhook(order.company_id, 'order.paid', {
        id: order.id, total: order.total, pay: order.pay, paid_at: Date.now(),
      });
    }
  }

  // Kitchen Display System — auto-create kitchen tickets from this order
  if (typeof global.createKitchenTickets === 'function') {
    try {
      global.createKitchenTickets({
        order_ref: order.id,
        items: (order.items || []).map(it => ({
          ...it,
          menu_id: it.menu_id || it.id,
          display_name: it.display_name || it.name || it.n,
          qty: it.qty || it.q || 1,
        })),
        customer_name: order.customerName,
        table_no: order.table && order.table !== '-' ? order.table : null,
        cashier: order.kasir,
      });
    } catch (e) { console.error('[kds] createKitchenTickets:', e.message); }
  }

  // Sales → Stock — konsumsi bahan baku resep dari gudang (live integration hook)
  if (typeof global.consumeRecipeStock === 'function') {
    try { global.consumeRecipeStock(order); } catch (e) { console.error('[sales-stock]', e.message); }
  }

  console.log(`✅ New order #${order.id} — ${order.type} — Rp ${order.total.toLocaleString()}`);

  // Push notif ke ESB POS (non-blocking)
  pushOrderToESB(order).then(result => {
    if (result.ok) {
      broadcast("esb:pushed", { orderId: order.id, ok: true });
    } else if (!result.skipped) {
      retryQueue.push(order); // queue for retry
      broadcast("esb:pushed", { orderId: order.id, ok: false, error: result.error });
    }
  }).catch(e => {
    console.error("ESB push error:", e.message);
    retryQueue.push(order);
  });

  res.status(201).json(order);
});

// PATCH update order status
app.patch("/api/orders/:id/settle", (req, res) => {
  const { pay, cashReceived, cashChange } = req.body;
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "order not found" });
  if (order.status !== "tab_open") {
    return res.status(400).json({ error: "order is not an open tab" });
  }

  order.pay = pay || "CASH";
  order.status = "waiting";
  if (cashReceived != null) order.cashReceived = cashReceived;
  if (cashChange != null) order.cashChange = cashChange;
  order.settledAt = Date.now();

  try {
    db.updateOrderStatus(order.id, order.status);
    if (db.updateOrderPay) db.updateOrderPay(order.id, order.pay, cashReceived, cashChange);
    else if (db.insertOrder) db.insertOrder(order); // fallback: re-insert (works if INSERT OR REPLACE)
    broadcast?.("order:settled", order);
    res.json(order);
  } catch (e) {
    console.error("settle failed:", e);
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/orders/:id/status", (req, res) => {
  const { status } = req.body;
  const valid = ["waiting", "preparing", "ready", "completed", "cancelled"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${valid.join(", ")}` });
  }

  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });

  const prevStatus = orders[idx].status;
  orders[idx] = { ...orders[idx], status, updatedAt: Date.now() };
  db.insertOrder(orders[idx]);
  broadcast("order:updated", orders[idx]);
  console.log(`📦 Order #${orders[idx].id} → ${status}`);

  // ── Sync ke kds_tickets — kalau order completed/cancelled, auto-tutup
  // tickets terkait biar KDS gak tampil order yang sudah closed di backend.
  try {
    const now = Math.floor(Date.now() / 1000);
    if (status === "completed") {
      // Mark all open tickets for this order as 'served'
      const tx = db.rawDb.prepare(`UPDATE kds_tickets SET status='served', served_at=? WHERE order_ref=? AND status IN ('queued','preparing','ready')`).run(now, String(orders[idx].id));
      if (tx.changes > 0) {
        console.log(`🍳 KDS sync: ${tx.changes} ticket(s) for order #${orders[idx].id} → served`);
        broadcast("kds:ticket-updated", { order_ref: String(orders[idx].id), status: "served" });
      }
    } else if (status === "cancelled") {
      const tx = db.rawDb.prepare(`UPDATE kds_tickets SET status='cancelled', served_at=? WHERE order_ref=? AND status IN ('queued','preparing','ready')`).run(now, String(orders[idx].id));
      if (tx.changes > 0) {
        console.log(`🍳 KDS sync: ${tx.changes} ticket(s) for order #${orders[idx].id} → cancelled`);
        broadcast("kds:ticket-updated", { order_ref: String(orders[idx].id), status: "cancelled" });
      }
    } else if (status === "preparing" || status === "ready") {
      const tx = db.rawDb.prepare(`UPDATE kds_tickets SET status=?, started_at=COALESCE(started_at, ?), ready_at=CASE WHEN ?='ready' THEN ? ELSE ready_at END WHERE order_ref=? AND status IN ('queued','preparing','ready')`).run(status, now, status, status === 'ready' ? now : null, String(orders[idx].id));
      if (tx.changes > 0) {
        broadcast("kds:ticket-updated", { order_ref: String(orders[idx].id), status });
      }
    }
  } catch (e) {
    // db.raw might not be available — log + continue. Order status itself OK.
    console.warn(`KDS sync skipped (raw db not exposed): ${e.message}`);
  }

  // Auto-earn points on completed
  if (status === "completed" && orders[idx].customerId && loyalty.getConfig().enabled) {
    const cust = customers.find(c => c.id === orders[idx].customerId);
    if (cust) {
      const earned = loyalty.calculateEarned(orders[idx].total);
      if (earned > 0) {
        cust.points = (cust.points || 0) + earned;
        db.insertCustomer(cust);
        db.insertPointTx({ customerId: cust.id, orderId: orders[idx].id, type: "earn", amount: earned, balanceAfter: cust.points });
        orders[idx].pointsEarned = earned;
        db.insertOrder(orders[idx]);  // re-save so points_earned persists
        console.log(`🎁 Earned: ${earned}pt for ${cust.id} (order ${orders[idx].id}, total Rp ${orders[idx].total.toLocaleString()})`);
      }
    }
  }

  // WhatsApp notification (fire-and-forget)
  wa.notifyOrderStatus(orders[idx], status).catch(e => console.error("WA error:", e.message));

  // P-Polish — Web Push notification when order is ready
  if (status === "ready" && prevStatus !== "ready" && typeof global.sendPushToOrder === "function") {
    const o = orders[idx];
    const tableNote = o.table && o.table !== "-" ? ` · Meja ${o.table}` : "";
    global.sendPushToOrder(o.id, {
      title: "Pesanan Anda siap! 🔔",
      body: `Order #${o.id}${tableNote} sudah bisa diambil.`,
      tag: `order-${o.id}`,
      icon: "/logo.png",
      data: { orderId: o.id, url: `/?customer-track&orderId=${o.id}` },
    }).catch(e => console.warn("push.ready:", e.message));
  }

  // P4A — outbound webhook for status transitions
  if (typeof global.emitWebhook === "function" && orders[idx].company_id) {
    const events = { ready: "order.ready", completed: "order.completed", cancelled: "order.cancelled" };
    if (events[status] && prevStatus !== status) {
      global.emitWebhook(orders[idx].company_id, events[status], {
        id: orders[idx].id, prev_status: prevStatus, new_status: status,
        total: orders[idx].total, customer_name: orders[idx].customerName,
        timestamp: Date.now(),
      });
    }
  }

  // Free table when order completed/cancelled
  if (["completed","cancelled"].includes(status) && orders[idx].type === "dine") {
    const ti = tables.findIndex(t => t.id === orders[idx].table || t.name === orders[idx].table);
    if (ti >= 0) {
      const stillOccupied = orders.some(o =>
        o.id !== orders[idx].id &&
        o.type === "dine" &&
        (o.table === tables[ti].id || o.table === tables[ti].name) &&
        !["completed","cancelled"].includes(o.status)
      );
      if (!stillOccupied) {
        tables[ti].status = "available";
        broadcast("table:updated", tables[ti]);
      }
    }
  }

  res.json(orders[idx]);
});

// DELETE cancel order
app.delete("/api/orders/:id", requireAdmin, (req, res) => {
  // RBAC: cuma Manager+ atau Finance Manager bisa cancel/delete order
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!rbacAcl.canDo(session.role, 'orders', 'delete') && !rbacAcl.canDo(session.role, 'finance', 'approve')) {
    return res.status(403).json({ error: `Role "${session.role}" tidak boleh batalkan order (butuh Manager / Finance Manager)` });
  }
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });
  orders[idx] = { ...orders[idx], status: "cancelled", updatedAt: Date.now() };
  db.insertOrder(orders[idx]);
  broadcast("order:updated", orders[idx]);
  res.json({ success: true, id: req.params.id });
});

// ── MENU ────────────────────────────────────────────────────────────────────

// GET all menu
app.get("/api/menu/config", (req, res) => {
  res.json({
    items:              menu,
    toppings:           toppings,
    categories:         categories,
    extraToppingPrice:  EXTRA_TOPPING_PRICE,
  });
});

// Enrich legacy in-memory menu with image_url from pos_menus table (admin-uploaded)
// Match by id first, fallback to name (case-insensitive) — covers hardcoded numeric vs string SKU mismatch.
function _enrichMenu(items, opts = {}) {
  try {
    const companyId = opts.companyId || 1;
    // 1) Pull ALL pos_menus rows for this tenant (not just ones with image)
    const allRows = db.rawDb.prepare(`SELECT id, category_id, emoji, name, description, price, free_extras, is_popular, is_available, image_url, badge_text, is_upsell FROM pos_menus WHERE company_id = ?`).all(companyId);
    if (!allRows.length) return items;

    // 2) Enrich existing legacy items with image/desc from matching pos_menus rows
    const byIdStr = new Map(allRows.map(r => [String(r.id), r]));
    const byName = new Map(allRows.map(r => [String(r.name || '').toLowerCase().trim(), r]));
    const enriched = items.map(m => {
      const match = byIdStr.get(String(m.id)) || byName.get(String(m.name || '').toLowerCase().trim());
      if (!match) return m;
      return {
        ...m,
        image_url: match.image_url || m.image_url || null,
        description: match.description || m.description || m.desc || "",
        desc: match.description || m.desc || m.description || "",
        is_upsell: match.is_upsell === 1 || match.is_upsell === true || !!m.is_upsell,
      };
    });

    // 3) Add pos_menus items that DON'T exist in legacy by name (so bulk-uploaded menus appear)
    const legacyNames = new Set(items.map(m => String(m.name || '').toLowerCase().trim()));
    const newOnes = allRows
      .filter(r => !legacyNames.has(String(r.name || '').toLowerCase().trim()))
      .map(r => ({
        id: r.id,                         // string id from pos_menus
        cat: r.category_id,
        emoji: r.emoji || '',
        name: r.name,
        desc: r.description || '',
        description: r.description || '',
        price: r.price,
        freeToppings: r.free_extras || 0,
        popular: r.is_popular === 1 || r.is_popular === true,
        avail: r.is_available === 1 || r.is_available === true,
        image_url: r.image_url || null,
        tag: r.badge_text || undefined,
        is_upsell: r.is_upsell === 1 || r.is_upsell === true,
        company_id: companyId,
      }));
    return enriched.concat(newOnes);
  } catch (e) { console.error('[enrichMenu]', e.message); return items; }
}

app.get("/api/menu", (req, res) => {
  res.json(_enrichMenu(menu));
});


app.get('/api/toppings', (req, res) => {
  res.json({ toppings, extraPrice: EXTRA_TOPPING_PRICE });
});

// GET available menu only
app.get("/api/menu/available", (req, res) => {
  res.json(_enrichMenu(menu.filter(m => m.avail)));
});

// PATCH update menu item (price / availability)
app.patch("/api/menu/:id", requireAdmin, (req, res) => {
  const id  = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Menu item not found" });

  const { price, avail } = req.body;
  if (price !== undefined) {
    if (typeof price !== "number" || price <= 0) {
      return res.status(400).json({ error: "price must be a positive number" });
    }
    menu[idx].price = price;
  }
  if (avail !== undefined) menu[idx].avail = Boolean(avail);
      db.setMenuOverride(menu[idx].id, menu[idx].avail);

  broadcast("menu:updated", menu[idx]);
  if (typeof autoSyncMenuToESB === "function") autoSyncMenuToESB(menu[idx]);
  console.log(`🍔 Menu #${id} "${menu[idx].name}" updated — price:${menu[idx].price} avail:${menu[idx].avail}`);
  res.json(menu[idx]);
});

// ── MASTER ITEM: Create new menu item ──
app.post("/api/menu", requireAdmin, (req, res) => {
  const { cat, emoji, name, desc, price, freeToppings, popular } = req.body;
  if (!name || !price || !cat) return res.status(400).json({ error: "name, price, cat required" });

  // Auto-generate next ID based on category
  const catPrefix = { froyo: 100, smoothies: 200, yogulato: 300, takehome: 400, collab: 500 };
  const base = catPrefix[cat] || 600;
  const catItems = menu.filter(m => m.id >= base && m.id < base + 100);
  const nextId = catItems.length > 0 ? Math.max(...catItems.map(m => m.id)) + 1 : base + 1;

  const newItem = {
    id: nextId,
    cat: cat,
    emoji: emoji || "🍽️",
    name: name,
    desc: desc || "",
    price: Number(price),
    freeToppings: Number(freeToppings) || 0,
    popular: Boolean(popular),
    avail: true,
  };

  menu.push(newItem);
  db.setMenuOverride(newItem.id, true);
  broadcast("menu:updated", newItem);
  if (typeof autoSyncMenuToESB === "function") autoSyncMenuToESB(newItem);
  console.log("[Master] New item:", newItem.name, "id:", newItem.id, "cat:", newItem.cat);
  res.json(newItem);
});

// ── MASTER ITEM: Delete menu item ──
app.delete("/api/menu/:id", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Item not found" });

  const removed = menu.splice(idx, 1)[0];
  broadcast("menu:updated", { id, deleted: true });
  console.log("[Master] Deleted:", removed.name, "id:", id);
  res.json({ ok: true, deleted: removed });
});

// ── MASTER ITEM: Full edit (all fields) ──
app.put("/api/menu/:id", (req, res) => {
  // Allow both numeric (legacy hardcoded) and string ids (pos_menus / ESB).
  const id = isNaN(req.params.id) ? req.params.id : parseInt(req.params.id);
  let idx = menu.findIndex(m => m.id === id);

  // If not found in legacy in-memory list, upsert to pos_menus (canonical store for new items).
  if (idx === -1) {
    const b = req.body || {};
    if (!b.name || b.price === undefined) {
      return res.status(404).json({ error: "Item not found and insufficient data to create" });
    }
    try {
      const idStr = String(req.params.id);
      const cat = b.cat || b.category_id || b.category || 'froyo';
      db.rawDb.prepare(`INSERT OR REPLACE INTO pos_menus
        (id, category_id, emoji, name, description, price, free_extras, is_popular, is_available, image_url, badge_text, display_order, created_at, updated_at, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM pos_menus WHERE id = ?), strftime('%s','now')), strftime('%s','now'), ?)`)
        .run(
          idStr, cat, b.emoji || b.e || '',
          b.name, b.desc || b.description || '',
          Number(b.price), Number(b.freeToppings || b.free_extras || 0),
          b.popular ? 1 : 0, b.avail !== false ? 1 : 0,
          b.image_url || b.image || null,
          b.tag || (Array.isArray(b.tags) ? b.tags[0] : null),
          0, idStr, 1
        );
      return res.json({ ok: true, upserted: idStr, store: 'pos_menus' });
    } catch (e) {
      return res.status(500).json({ error: 'failed to upsert: ' + e.message });
    }
  }

  // Existing legacy item — patch in place. Accept canonical + alias fields.
  const b = req.body || {};
  if (b.cat !== undefined || b.category !== undefined) menu[idx].cat = b.cat || b.category;
  if (b.emoji !== undefined) menu[idx].emoji = b.emoji;
  if (b.e !== undefined) menu[idx].emoji = b.e;
  if (b.name !== undefined) menu[idx].name = b.name;
  if (b.desc !== undefined) menu[idx].desc = b.desc;
  if (b.description !== undefined) menu[idx].desc = b.description;
  if (b.price !== undefined) menu[idx].price = Number(b.price);
  if (b.freeToppings !== undefined) menu[idx].freeToppings = Number(b.freeToppings);
  if (b.free_extras !== undefined) menu[idx].freeToppings = Number(b.free_extras);
  if (b.popular !== undefined) menu[idx].popular = Boolean(b.popular);
  if (b.tag !== undefined) menu[idx].tag = b.tag;
  if (b.image_url !== undefined) menu[idx].image_url = b.image_url;
  if (b.image !== undefined) menu[idx].image_url = b.image; // alias
  if (b.avail !== undefined) {
    menu[idx].avail = Boolean(b.avail);
    db.setMenuOverride(menu[idx].id, menu[idx].avail);
  }
  // Persist image/desc to pos_menus (by id or name) so /api/menu enrichment + Item Master sync see it.
  if (b.image_url !== undefined || b.image !== undefined || b.description !== undefined || b.desc !== undefined) {
    try {
      const img = b.image_url || b.image || null;
      const desc = b.description || b.desc || '';
      const r = db.rawDb.prepare(`UPDATE pos_menus SET image_url = COALESCE(?, image_url), description = ?, updated_at = strftime('%s','now') WHERE LOWER(TRIM(name)) = ?`)
        .run(img, desc, String(menu[idx].name || '').toLowerCase().trim());
      // If no row matched by name, insert it (so future enrichment finds it)
      if (r.changes === 0 && img !== null) {
        const idStr = `legacy-${menu[idx].id}`;
        db.rawDb.prepare(`INSERT OR IGNORE INTO pos_menus
          (id, category_id, emoji, name, description, price, free_extras, is_popular, is_available, image_url, display_order, company_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(idStr, menu[idx].cat || 'froyo', menu[idx].emoji || '', menu[idx].name, desc,
            menu[idx].price, menu[idx].freeToppings || 0, menu[idx].popular ? 1 : 0, menu[idx].avail ? 1 : 0,
            img, 0, 1);
      }
    } catch (e) { console.warn('[menu PUT] pos_menus mirror failed:', e.message); }
  }

  broadcast("menu:updated", menu[idx]);
  console.log("[Master] Updated:", menu[idx].name, "id:", id);
  res.json(menu[idx]);
});

// ── KPI Foundation: Toggle is_upsell per item ──
// Dipisah dari PUT umum supaya admin UI cukup tombol kecil (badge toggle),
// dan side-effect terbatas ke kolom is_upsell saja.
app.patch("/api/menu/:id/upsell", requireAdmin, (req, res) => {
  const rawId = req.params.id;
  const id = isNaN(rawId) ? rawId : parseInt(rawId);
  const flag = req.body?.is_upsell ? 1 : 0;
  try {
    // Coba update di pos_menus dulu (kanonik). Match by id (string) OR by name (legacy).
    const r1 = db.rawDb.prepare(`UPDATE pos_menus SET is_upsell = ?, updated_at = strftime('%s','now') WHERE id = ?`).run(flag, String(rawId));
    let updated = r1.changes;

    // Legacy in-memory item — sinkron + mirror ke pos_menus by name
    const legacy = menu.find(m => m.id === id);
    if (legacy) {
      legacy.is_upsell = !!flag;
      if (updated === 0) {
        const nameKey = String(legacy.name || '').toLowerCase().trim();
        const r2 = db.rawDb.prepare(`UPDATE pos_menus SET is_upsell = ?, updated_at = strftime('%s','now') WHERE LOWER(TRIM(name)) = ?`).run(flag, nameKey);
        updated = r2.changes;
        if (updated === 0) {
          // Stub row supaya enrichment + KPI compute bisa find item ini
          const idStr = `legacy-${legacy.id}`;
          db.rawDb.prepare(`INSERT OR IGNORE INTO pos_menus
            (id, category_id, emoji, name, description, price, free_extras, is_popular, is_available, image_url, is_upsell, display_order, company_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(idStr, legacy.cat || 'froyo', legacy.emoji || '', legacy.name, legacy.desc || '',
              legacy.price, legacy.freeToppings || 0, legacy.popular ? 1 : 0, legacy.avail ? 1 : 0,
              legacy.image_url || null, flag, 0, 1);
          updated = 1;
        }
      }
    }

    if (!updated) return res.status(404).json({ error: 'item not found' });
    broadcast("menu:updated", { id, is_upsell: !!flag });
    res.json({ ok: true, id, is_upsell: !!flag });
  } catch (e) {
    console.error('[menu upsell toggle]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── MASTER TOPPINGS: CRUD ──
app.get("/api/toppings", (req, res) => res.json({ items: toppings, extraPrice: EXTRA_TOPPING_PRICE }));

app.post("/api/toppings", requireAdmin, (req, res) => {
  const { id, name, group, price } = req.body;
  if (!name || !group) return res.status(400).json({ error: "name, group required" });
  const newId = id || (group[0].toLowerCase() + String(toppings.filter(t => t.group === group).length + 1).padStart(2, "0"));
  const topping = { id: newId, name, group, price: Number(price) || 0 };
  toppings.push(topping);
  res.json(topping);
});

app.delete("/api/toppings/:id", requireAdmin, (req, res) => {
  const idx = toppings.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Topping not found" });
  const removed = toppings.splice(idx, 1)[0];
  res.json({ ok: true, deleted: removed });
});

// ── MASTER CATEGORIES ──
app.get("/api/categories", (req, res) => res.json(categories));

app.post("/api/categories", requireAdmin, (req, res) => {
  const { id, name, emoji, color } = req.body;
  if (!id || !name) return res.status(400).json({ error: "id, name required" });
  if (categories.find(c => c.id === id)) return res.status(409).json({ error: "Category already exists" });
  const cat = { id, name, emoji: emoji || "📋", color: color || "#888" };
  categories.push(cat);
  res.json(cat);
});

// ── FINANCE: Expense tracking ──
const expenses = [];
let expenseCounter = 0;

app.post("/api/finance/expenses", requireAdmin, (req, res) => {
  const { category, description, amount, date, notes } = req.body;
  if (!category || !amount) return res.status(400).json({ error: "category, amount required" });
  expenseCounter++;
  const expense = {
    id: "EXP" + String(expenseCounter).padStart(4, "0"),
    category,
    description: description || "",
    amount: Number(amount),
    date: date || new Date().toISOString().split("T")[0],
    notes: notes || "",
    createdAt: Date.now(),
    createdBy: req.headers["x-admin-name"] || "admin",
  };
  expenses.push(expense);
  console.log("[Finance] Expense:", expense.category, fIDR(expense.amount));
  res.json(expense);
});

app.get("/api/finance/expenses", (req, res) => {
  const { from, to } = req.query;
  let filtered = expenses;
  if (from) filtered = filtered.filter(e => e.date >= from);
  if (to) filtered = filtered.filter(e => e.date <= to);
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  res.json({ items: filtered, total, count: filtered.length });
});

// ── FINANCE: P&L Summary ──
app.get("/api/finance/pnl", (req, res) => {
  // Revenue from orders
  const today = new Date().toISOString().split("T")[0];
  const todayStart = new Date(today).getTime();
  const todayOrders = orders.filter(o => o.time >= todayStart && o.status !== "cancelled");
  const grossRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const taxRate = 0.11;
  const netRevenue = Math.round(grossRevenue / (1 + taxRate));
  const tax = grossRevenue - netRevenue;

  // Expenses today
  const todayExpenses = expenses.filter(e => e.date === today);
  const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0);

  // Expense breakdown by category
  const expByCategory = {};
  todayExpenses.forEach(e => {
    if (!expByCategory[e.category]) expByCategory[e.category] = 0;
    expByCategory[e.category] += e.amount;
  });

  const netProfit = netRevenue - totalExpenses;

  res.json({
    date: today,
    revenue: { gross: grossRevenue, net: netRevenue, tax, orders: todayOrders.length },
    expenses: { total: totalExpenses, count: todayExpenses.length, byCategory: expByCategory },
    profit: { net: netProfit, margin: netRevenue > 0 ? Math.round(netProfit / netRevenue * 100) : 0 },
  });
});

const fIDR = n => "Rp " + Math.round(n).toLocaleString("id-ID");

// ── STATS ────────────────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  const completed  = orders.filter(o => o.status === "completed");
  const active     = orders.filter(o => !["completed","cancelled"].includes(o.status));
  const revenue    = orders.filter(o => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const cancelled  = orders.filter(o => o.status === "cancelled").length;

  const byStatus = {};
  ["waiting","preparing","ready","completed","cancelled"].forEach(s => {
    byStatus[s] = orders.filter(o => o.status === s).length;
  });

  const topItems = {};
  orders.filter(o => o.status !== "cancelled").forEach(o => {
    o.items.forEach(i => {
      topItems[i.n] = (topItems[i.n] || 0) + i.q;
    });
  });
  const topSorted = Object.entries(topItems)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  res.json({
    totalOrders:   orders.length,
    activeOrders:  active.length,
    completedOrders: completed.length,
    cancelledOrders: cancelled,
    revenue,
    tax: Math.round(revenue * 0.11 / 1.11),
    netRevenue: Math.round(revenue / 1.11),
    avgOrder: completed.length ? Math.round(revenue / completed.length) : 0,
    byStatus,
    topItems: topSorted,
    menuAvailable: menu.filter(m => m.avail).length,
    menuTotal: menu.length,
  });
});



// ═══════════════════════════════════════════════════════════════
// PRINTER CONFIG (runtime-configurable, persisted to JSON)
// ═══════════════════════════════════════════════════════════════
const PRINTER_CONFIG_FILE = path.join(__dirname, "printer-config.json");

function loadPrinterConfig() {
  const defaults = {
    debug: process.env.PRINTER_DEBUG !== "false",
    kitchen:  { ip: process.env.KITCHEN_PRINTER_IP  || "", port: parseInt(process.env.KITCHEN_PRINTER_PORT)  || 9100 },
    customer: { ip: process.env.CUSTOMER_PRINTER_IP || "", port: parseInt(process.env.CUSTOMER_PRINTER_PORT) || 9100 },
    // Template — editable dari admin panel, di-read oleh escpos.js buildCustomerReceipt + buildKitchenTicket
    template: {
      outlet_name: "KaryaOS",
      outlet_subtitle: "Self Order Kiosk",
      outlet_address: "Jakarta, Indonesia",
      paper_width: 48,                  // 48 = 80mm thermal, 32 = 58mm thermal
      footer_thanks: "Terima kasih atas kunjungan Anda!",
      footer_note: "Simpan struk sebagai bukti pembayaran",
      show_qr: true,
      show_logo: false,
    },
  };
  try {
    if (fs.existsSync(PRINTER_CONFIG_FILE)) {
      const p = JSON.parse(fs.readFileSync(PRINTER_CONFIG_FILE, "utf-8"));
      return {
        ...defaults, ...p,
        kitchen:  { ...defaults.kitchen, ...(p.kitchen||{}) },
        customer: { ...defaults.customer, ...(p.customer||{}) },
        template: { ...defaults.template, ...(p.template||{}) },
      };
    }
  } catch (e) { console.warn("printer-config.json corrupt:", e.message); }
  return defaults;
}

let printerConfig = loadPrinterConfig();
// Expose untuk modules lain (cinema-backend) — bisa baca printer IP/port aktif
global.getPrinterConfig = () => printerConfig;

function savePrinterConfig() {
  fs.writeFileSync(PRINTER_CONFIG_FILE, JSON.stringify(printerConfig, null, 2));
}

console.log(`🖨  Printer mode: ${printerConfig.debug ? "DEBUG (file)" : "LIVE TCP"} · Kitchen: ${printerConfig.kitchen.ip||"unset"} · Customer: ${printerConfig.customer.ip||"unset"}`);

app.get("/api/printer/config", (req, res) => res.json(printerConfig));

// GET /api/bridge/latest-version — print bridge update channel.
// Bridge agent + admin panel poll ini untuk detect new bridge version.
// Bump BRIDGE_LATEST_VERSION saat ada changes di tools/print-bridge/.
const BRIDGE_LATEST_VERSION = "1.1.0";
const BRIDGE_DOWNLOAD_URL = "https://app.karyaos.tech/downloads/print-bridge.zip";
const BRIDGE_CHANGELOG = [
  { version: "1.1.0", date: "2026-05-29", notes: "Added GET /version endpoint for update detection. Per-IP print queue. PNA CORS header for Chrome multi-monitor." },
  { version: "1.0.0", date: "2026-05-27", notes: "Initial release. POST /print + scan LAN + test page." },
];
app.get("/api/bridge/latest-version", (req, res) => {
  res.json({
    version: BRIDGE_LATEST_VERSION,
    download_url: BRIDGE_DOWNLOAD_URL,
    changelog: BRIDGE_CHANGELOG,
  });
});

app.patch("/api/printer/config", requireAdmin, (req, res) => {
  const { debug, kitchen, customer, template } = req.body || {};
  if (debug !== undefined) printerConfig.debug = Boolean(debug);
  if (kitchen) {
    if (kitchen.ip   !== undefined) printerConfig.kitchen.ip   = String(kitchen.ip || "").trim();
    if (kitchen.port !== undefined) printerConfig.kitchen.port = parseInt(kitchen.port) || 9100;
  }
  if (customer) {
    if (customer.ip   !== undefined) printerConfig.customer.ip   = String(customer.ip || "").trim();
    if (customer.port !== undefined) printerConfig.customer.port = parseInt(customer.port) || 9100;
  }
  if (template && typeof template === "object") {
    const allowed = ["outlet_name", "outlet_subtitle", "outlet_address", "paper_width",
                     "footer_thanks", "footer_note", "show_qr", "show_logo"];
    if (!printerConfig.template) printerConfig.template = {};
    for (const k of allowed) {
      if (k in template) {
        if (k === "paper_width") {
          const w = parseInt(template[k], 10);
          if (w === 32 || w === 48) printerConfig.template[k] = w;
        } else if (k === "show_qr" || k === "show_logo") {
          printerConfig.template[k] = Boolean(template[k]);
        } else {
          printerConfig.template[k] = String(template[k] || "").slice(0, 80);
        }
      }
    }
  }
  savePrinterConfig();
  broadcast("printer:config", printerConfig);
  console.log(`🖨  Printer config updated → debug:${printerConfig.debug} k:${printerConfig.kitchen.ip}:${printerConfig.kitchen.port} c:${printerConfig.customer.ip}:${printerConfig.customer.port} pw:${printerConfig.template?.paper_width}`);
  res.json({ ok: true, config: printerConfig });
});




// ─── LOYALTY POINTS ─────────────────────────────────────
// Customer-facing loyalty info (balance + recent history)
app.get("/api/customers/:id/loyalty", (req, res) => {
  const cust = customers.find(c => c.id === req.params.id);
  if (!cust) return res.status(404).json({ error: "Customer not found" });
  const cfg = loyalty.getConfig();
  res.json({
    id: cust.id,
    name: cust.name,
    points: cust.points || 0,
    history: db.getPointHistory(cust.id, 10),
    earnRate: cfg.earnRate,
    redeemRate: cfg.redeemRate,
    minRedeemPoints: cfg.minRedeemPoints,
  });
});

app.get("/api/loyalty/config", (req, res) => res.json(loyalty.getConfig()));

app.patch("/api/loyalty/config", requireAdmin, (req, res) => {
  const updated = loyalty.setConfig(req.body || {});
  broadcast("loyalty:config", updated);
  console.log(`🎁 Loyalty config updated: ${JSON.stringify(updated)}`);
  res.json({ ok: true, config: updated });
});

app.get("/api/loyalty/history/:customerId", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.getPointHistory(req.params.customerId, limit));
});

// Manual adjust (admin) — add/subtract points
app.post("/api/loyalty/adjust", requireAdmin, (req, res) => {
  const { customerId, amount, reason } = req.body || {};
  if (!customerId || typeof amount !== "number") return res.status(400).json({ error: "customerId & amount required" });
  const cust = customers.find(c => c.id === customerId);
  if (!cust) return res.status(404).json({ error: "Customer not found" });
  cust.points = Math.max(0, (cust.points || 0) + amount);
  db.insertCustomer(cust);
  db.insertPointTx({ customerId, type: "adjust", amount, balanceAfter: cust.points });
  console.log(`🎁 Adjust ${customerId}: ${amount > 0 ? "+" : ""}${amount}pt → balance ${cust.points}`);
  res.json({ ok: true, customer: cust });
});

// ─── WhatsApp Notification ──────────────────────────────────────
app.get("/api/wa/config", (req, res) => {
  const cfg = wa.loadConfig();
  // Mask sensitive tokens in response
  const safe = JSON.parse(JSON.stringify(cfg));
  if (safe.fonnte.token) safe.fonnte.tokenMasked = safe.fonnte.token.slice(0,4) + "•".repeat(8);
  if (safe.twilio.token) safe.twilio.tokenMasked = safe.twilio.token.slice(0,4) + "•".repeat(8);
  res.json({ ...safe, provider: wa.detectProvider() });
});

app.patch("/api/wa/config", requireAdmin, (req, res) => {
  const updated = wa.setConfig(req.body || {});
  console.log(`📱 WA config updated → provider=${wa.detectProvider()||"none"} enabled=${JSON.stringify(updated.enabled)}`);
  res.json({ ok: true, config: updated, provider: wa.detectProvider() });
});

app.post("/api/wa/test", requireAdmin, async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ error: "phone required" });
  const result = await wa.sendMessage(phone, message || "Test message from KaryaOS Kiosk 🍦");
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════
// DATABASE BACKUP — Auto-backup data.db every hour
// ═══════════════════════════════════════════════════════════════
const BACKUP_DIR        = path.join(__dirname, "backups");
const BACKUP_INTERVAL_MS = parseInt(process.env.BACKUP_INTERVAL_MS) || 3600000; // 1 hour default
const BACKUP_RETENTION   = parseInt(process.env.BACKUP_RETENTION)   || 24;       // keep last 24

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function backupNow(reason = "scheduled") {
  ensureBackupDir();
  const dbFile = path.join(__dirname, "data.db");
  if (!fs.existsSync(dbFile)) return { ok: false, error: "data.db not found" };
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}`;
  const target = path.join(BACKUP_DIR, `data-${stamp}.db`);
  try {
    // Use SQLite Online Backup API for consistency (avoids partial writes during WAL)
    db.db.backup(target).then(() => {
      const sizeKB = Math.round(fs.statSync(target).size / 1024);
      console.log(`💾 Backup ${reason}: ${path.basename(target)} (${sizeKB} KB)`);
      pruneOldBackups();
    }).catch(err => console.error("Backup failed:", err.message));
    return { ok: true, file: path.basename(target) };
  } catch (e) {
    // Fallback: simple file copy (less safe but works)
    fs.copyFileSync(dbFile, target);
    pruneOldBackups();
    return { ok: true, file: path.basename(target), method: "copy" };
  }
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("data-") && f.endsWith(".db"))
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const toDelete = files.slice(BACKUP_RETENTION);
    toDelete.forEach(f => {
      fs.unlinkSync(f.path);
      console.log(`🗑️  Pruned old backup: ${f.name}`);
    });
  } catch (e) {
    console.warn("Backup prune failed:", e.message);
  }
}

function listBackups() {
  ensureBackupDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("data-") && f.endsWith(".db"))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, sizeKB: Math.round(stat.size/1024), createdAt: stat.mtimeMs };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Schedule auto-backup
setInterval(() => backupNow("hourly"), BACKUP_INTERVAL_MS);
// Initial backup 30s after boot (gives time for any startup writes)
setTimeout(() => backupNow("startup"), 30000);
console.log(`🎁 Loyalty: ${loyalty.getConfig().enabled ? 'ON (1pt/Rp'+loyalty.getConfig().earnRate+', redeem '+loyalty.getConfig().redeemRate+'pt=Rp1k)' : 'OFF'}`); console.log(`📱 WhatsApp: ${wa.detectProvider() || 'none (log-only)'}`); console.log(`💾 Auto-backup scheduled every ${Math.round(BACKUP_INTERVAL_MS/60000)} min, retention ${BACKUP_RETENTION}`);

// API endpoints
app.get("/api/backup", (req, res) => res.json({ backups: listBackups(), retention: BACKUP_RETENTION, intervalMin: Math.round(BACKUP_INTERVAL_MS/60000) }));
app.post("/api/backup", requireAdmin, (req, res) => res.json(backupNow("manual")));


// ═══════════════════════════════════════════════════════════════
// REPORTS — Z-report (end-of-day summary)
// ═══════════════════════════════════════════════════════════════

function generateZReport(startMs, endMs, label) {
  // Fetch orders within range (exclude cancelled)
  const allOrders = db.loadAllOrders();
  const orders = allOrders.filter(o =>
    o.time >= startMs && o.time <= endMs && o.status !== "cancelled"
  );

  // Summary
  const grossRevenue   = orders.reduce((s, o) => s + (o.total || 0), 0);
  const taxExtracted   = orders.reduce((s, o) => s + (o.tax || 0), 0);
  const netRevenue     = grossRevenue - taxExtracted;
  const promoDiscount  = orders.reduce((s, o) => s + (o.promoDiscount || 0), 0);
  const summary = {
    transactionCount: orders.length,
    grossRevenue, taxExtracted, netRevenue, promoDiscount,
    avgTicket: orders.length ? Math.round(grossRevenue / orders.length) : 0,
  };

  // Payment breakdown
  const payments = {};
  orders.forEach(o => {
    const m = (o.pay || "UNKNOWN").toUpperCase();
    if (!payments[m]) payments[m] = { count: 0, total: 0 };
    payments[m].count++;
    payments[m].total += o.total || 0;
  });

  // Order type breakdown
  const orderTypes = {};
  orders.forEach(o => {
    const t = o.type || "unknown";
    if (!orderTypes[t]) orderTypes[t] = { count: 0, total: 0 };
    orderTypes[t].count++;
    orderTypes[t].total += o.total || 0;
  });

  // Top items (parse JSON if needed)
  const itemTally = {};
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : (o.items ? JSON.parse(o.items) : []);
    items.forEach(it => {
      // Support both shapes: {n,q,p} (compact) and {name,qty,price} (verbose)
      const name  = it.name  || it.n || `Item ${it.id || "?"}`;
      const qty   = Number(it.qty   ?? it.q) || 1;
      const price = Number(it.price ?? it.p) || 0;
      if (!itemTally[name]) itemTally[name] = { name, qty: 0, revenue: 0 };
      itemTally[name].qty     += qty;
      itemTally[name].revenue += price * qty;
    });
  });
  const topItems = Object.values(itemTally).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Promo usage
  const promoUsage = {};
  orders.forEach(o => {
    if (o.promoCode) {
      if (!promoUsage[o.promoCode]) promoUsage[o.promoCode] = { count: 0, totalDiscount: 0 };
      promoUsage[o.promoCode].count++;
      promoUsage[o.promoCode].totalDiscount += (o.promoDiscount || 0);
    }
  });

  // Cash reconciliation
  const cashOrders = orders.filter(o => (o.pay || "").toUpperCase() === "CASH");
  const cashReconciliation = {
    transactionCount: cashOrders.length,
    cashSales:        cashOrders.reduce((s, o) => s + (o.total || 0), 0),
    cashReceived:     cashOrders.reduce((s, o) => s + (o.cashReceived || 0), 0),
    cashChange:       cashOrders.reduce((s, o) => s + (o.cashChange || 0), 0),
  };

  // Active shift (if any)
  let shift = null;
  try { shift = db.loadActiveShift(); } catch(e) {}

  return {
    period: { start: startMs, end: endMs, label },
    summary, payments, orderTypes, topItems, promoUsage, cashReconciliation, shift,
    generatedAt: Date.now(),
  };
}

// Z-report endpoint — supports ?date=YYYY-MM-DD (single day) or ?from=&to= (date range)
app.get("/api/reports/z", (req, res) => {
  const parseISO = (s) => { const d = new Date(s + "T00:00:00"); return isNaN(d.getTime()) ? null : d; };
  let fromDate, toDate, label;
  if (req.query.from || req.query.to) {
    fromDate = req.query.from ? parseISO(req.query.from) : new Date();
    toDate   = req.query.to   ? parseISO(req.query.to)   : new Date();
    if (!fromDate || !toDate) return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    if (toDate < fromDate) [fromDate, toDate] = [toDate, fromDate]; // auto-swap
    const sameDay = fromDate.toDateString() === toDate.toDateString();
    label = sameDay
      ? fromDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : `${fromDate.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})} – ${toDate.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}`;
  } else if (req.query.date) {
    fromDate = parseISO(req.query.date);
    if (!fromDate) return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    toDate = fromDate;
    label = fromDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } else {
    fromDate = toDate = new Date();
    label = fromDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime();
  const end   = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime() + 86400000 - 1;
  const r = generateZReport(start, end, label);
  res.json({ ...r, period: { ...(r.period||{}), label, from: fromDate.toISOString().slice(0,10), to: toDate.toISOString().slice(0,10) } });
});





// ─── PROMO CODE SYSTEM ────────────────────────────────────────────────────────
let promoCodes = db.loadAllPromos();
if (promoCodes.length === 0) {
  const seed = [
  {
    id: "P001", code: "KaryaOS10", type: "percent", value: 10,
    desc: "Diskon 10% untuk semua menu",
    minOrder: 50000, maxDiscount: 50000,
    usageLimit: 100, usedCount: 12,
    validFrom: Date.now() - 86400000*7,
    validUntil: Date.now() + 86400000*30,
    active: true, forMember: false,
  },
  {
    id: "P002", code: "MEMBER20", type: "percent", value: 20,
    desc: "Diskon 20% khusus member",
    minOrder: 75000, maxDiscount: 75000,
    usageLimit: 500, usedCount: 44,
    validFrom: Date.now() - 86400000*30,
    validUntil: Date.now() + 86400000*60,
    active: true, forMember: true,
  },
  {
    id: "P003", code: "GRATISFRIES", type: "fixed", value: 38000,
    desc: "Gratis Truffle Fries",
    minOrder: 100000, maxDiscount: 38000,
    usageLimit: 50, usedCount: 8,
    validFrom: Date.now() - 86400000*3,
    validUntil: Date.now() + 86400000*7,
    active: true, forMember: false,
  },
  {
    id: "P004", code: "VIP25", type: "percent", value: 25,
    desc: "Diskon 25% khusus member VIP",
    minOrder: 100000, maxDiscount: 100000,
    usageLimit: 200, usedCount: 5,
    validFrom: Date.now() - 86400000*1,
    validUntil: Date.now() + 86400000*90,
    active: true, forMember: true,
  },
  {
    id: "P005", code: "NEWMEMBER", type: "fixed", value: 25000,
    desc: "Potongan Rp 25.000 untuk member baru",
    minOrder: 60000, maxDiscount: 25000,
    usageLimit: 1000, usedCount: 130,
    validFrom: Date.now() - 86400000*60,
    validUntil: Date.now() + 86400000*365,
    active: true, forMember: true,
  },
  // ─── BOGO PROMOS ───────────────────────────────────────────
  {
    id: "P006", code: "BUY1GET1", type: "bogo", value: 0,
    desc: "🎁 Beli 2 menu, gratis 1 termurah (max 3 free)",
    minOrder: 0, maxDiscount: 150000,
    usageLimit: 999, usedCount: 0,
    validFrom: Date.now() - 86400000*7,
    validUntil: Date.now() + 86400000*60,
    active: true, forMember: false,
    bogoConfig: { mode: "universal", buyQty: 1, getQty: 1, maxFreeQty: 3 },
  },
  {
    id: "P007", code: "B2G1", type: "bogo", value: 0,
    desc: "🎁 Beli 2 menu, gratis 1 termurah (Buy 2 Get 1)",
    minOrder: 0, maxDiscount: 100000,
    usageLimit: 500, usedCount: 0,
    validFrom: Date.now() - 86400000*3,
    validUntil: Date.now() + 86400000*30,
    active: true, forMember: false,
    bogoConfig: { mode: "universal", buyQty: 2, getQty: 1, maxFreeQty: 2 },
  },
];
  seed.forEach(p => db.insertPromo(p));
  promoCodes = seed;
  console.log(`🎟️  Seeded ${seed.length} demo promos`);
}
let promoCounter = promoCodes.length
  ? Math.max(0, ...promoCodes.map(o => {
      const m = /^P(\d+)$/.exec(o.id || "");
      return m ? parseInt(m[1]) : 0;
    }))
  : 0;
console.log(`📊 Promo counter: ${promoCounter}`);

// Calculate discount amount
function calcDiscount(promo, subtotal, cart) {
  if (promo.type === "percent") {
    const raw = subtotal * (promo.value / 100);
    return Math.min(raw, promo.maxDiscount || Infinity);
  }
  if (promo.type === "fixed") {
    return Math.min(promo.value, promo.maxDiscount || Infinity);
  }
  if (promo.type === "bogo") {
    return calcBogoDiscount(promo, cart || []);
  }
  return 0;
}

// BOGO logic — supports 4 modes: universal, same, cross, category
function calcBogoDiscount(promo, cart) {
  return calcBogoDetails(promo, cart).discount;
}

// Returns {discount, freeItems[{name, qty, unitPrice, totalPrice}]}
function calcBogoDetails(promo, cart) {
  const cfg = promo.bogoConfig || {};
  const mode = cfg.mode || "universal";
  const buyQty = cfg.buyQty || 1;
  const getQty = cfg.getQty || 1;
  const maxFree = cfg.maxFreeQty || Infinity;
  const groupSize = buyQty + getQty;
  const empty = { discount: 0, freeItems: [] };
  if (!Array.isArray(cart)) return empty;

  const flatUnits = (filterFn) => {
    const units = [];
    cart.forEach(line => {
      if (filterFn && !filterFn(line)) return;
      const basePrice = (line.item?.price ?? line.price ?? 0);
      const addons = line.addonTotal || 0;
      const unitPrice = basePrice + addons;
      const name = line.item?.name || line.name || "Item";
      for (let i = 0; i < (line.qty || 0); i++) units.push({ name, unitPrice });
    });
    return units;
  };

  const consolidate = (units) => {
    const map = new Map();
    units.forEach(u => {
      const key = u.name + "|" + u.unitPrice;
      if (!map.has(key)) map.set(key, { name: u.name, qty: 0, unitPrice: u.unitPrice, totalPrice: 0 });
      const entry = map.get(key);
      entry.qty += 1;
      entry.totalPrice += u.unitPrice;
    });
    return [...map.values()];
  };

  const cap = (raw) => Math.min(raw, promo.maxDiscount || Infinity);

  if (mode === "universal") {
    const units = flatUnits().sort((a,b) => a.unitPrice - b.unitPrice);
    if (units.length < groupSize) return empty;
    const freeCount = Math.min(Math.floor(units.length / groupSize) * getQty, maxFree);
    if (freeCount <= 0) return empty;
    const free = units.slice(0, freeCount);
    return { discount: cap(free.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(free) };
  }
  if (mode === "same") {
    const itemId = cfg.triggerItemId;
    if (!itemId) return empty;
    const units = flatUnits(line => line.item?.id === itemId).sort((a,b) => a.unitPrice - b.unitPrice);
    if (units.length < groupSize) return empty;
    const freeCount = Math.min(Math.floor(units.length / groupSize) * getQty, maxFree);
    const free = units.slice(0, freeCount);
    return { discount: cap(free.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(free) };
  }
  if (mode === "cross") {
    const triggerId = cfg.triggerItemId, freeId = cfg.freeItemId;
    if (!triggerId || !freeId) return empty;
    const triggerUnits = flatUnits(line => line.item?.id === triggerId);
    const freeUnits = flatUnits(line => line.item?.id === freeId).sort((a,b) => a.unitPrice - b.unitPrice);
    if (triggerUnits.length < buyQty || freeUnits.length < 1) return empty;
    const maxEligible = Math.floor(triggerUnits.length / buyQty) * getQty;
    const actualFree = Math.min(maxEligible, freeUnits.length, maxFree);
    if (actualFree <= 0) return empty;
    const sel = freeUnits.slice(0, actualFree);
    return { discount: cap(sel.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(sel) };
  }
  if (mode === "category") {
    const cat = cfg.categoryId;
    if (!cat) return empty;
    const units = flatUnits(line => (line.item?.cat ?? line.item?.category) === cat).sort((a,b) => a.unitPrice - b.unitPrice);
    if (units.length < groupSize) return empty;
    const freeCount = Math.min(Math.floor(units.length / groupSize) * getQty, maxFree);
    const sel = units.slice(0, freeCount);
    return { discount: cap(sel.reduce((s,u) => s + u.unitPrice, 0)), freeItems: consolidate(sel) };
  }
  return empty;
}

// POST /api/promo/validate — validate promo code
app.post("/api/promo/validate", (req, res) => {
  const { code, subtotal, customerId, customerTags, cart } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: "Kode promo harus diisi" });

  const promo = promoCodes.find(p => p.code.toUpperCase() === code.trim().toUpperCase());

  if (!promo)          return res.json({ ok: false, error: "Kode promo tidak ditemukan" });
  if (!promo.active)   return res.json({ ok: false, error: "Kode promo sudah tidak aktif" });
  if (Date.now() < promo.validFrom)  return res.json({ ok: false, error: "Kode promo belum berlaku" });
  if (Date.now() > promo.validUntil) return res.json({ ok: false, error: "Kode promo sudah kadaluarsa" });
  if (promo.usedCount >= promo.usageLimit) return res.json({ ok: false, error: "Kode promo sudah habis digunakan" });
  if (subtotal < promo.minOrder) {
    return res.json({ ok: false, error: `Minimum order ${new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(promo.minOrder)}` });
  }
  if (promo.forMember && !customerId) {
    return res.json({ ok: false, error: "Kode ini khusus untuk member. Daftar dulu yuk!" });
  }
  if (promo.code === "VIP25" && !customerTags?.includes("vip")) {
    return res.json({ ok: false, error: "Kode ini khusus untuk member VIP ⭐" });
  }

  let discount, freeItems = null;
  if (promo.type === "bogo") {
    const d = calcBogoDetails(promo, cart || []);
    discount = d.discount; freeItems = d.freeItems;
    if (discount === 0) {
      const cfg = promo.bogoConfig || {};
      const hint = ({
        same:      "Tambahkan minimal 2 item yang sama sesuai promo",
        cross:     "Tambahkan item trigger + item gratis ke cart",
        category:  "Tambahkan minimal 2 item dari kategori promo",
        universal: "Tambahkan minimal 2 item ke cart",
      })[cfg.mode || "universal"];
      return res.json({ ok: false, error: "Cart belum memenuhi syarat BOGO: " + hint });
    }
  } else {
    discount = calcDiscount(promo, subtotal, cart);
  }
  res.json({
    ok: true,
    promoId:   promo.id,
    code:      promo.code,
    desc:      promo.desc,
    type:      promo.type,
    value:     promo.value,
    discount,
    freeItems,
    forMember: promo.forMember,
    bogoConfig: promo.bogoConfig || null,
    paymentHint: promo.requiredPaymentHint || null,
  });
});

// GET /api/promo — list all promo (admin)
app.get("/api/promo", (req, res) => {
  res.json(promoCodes);
});

// GET /api/promos — alias plural untuk backward-compat
app.get("/api/promos", (req, res) => {
  // Multi-tenant: F&B promos belong to company 1 by default. Cinema owner shouldn't see them.
  // Filter: super-admin sees all, F&B company sees all (legacy promos belong to F&B),
  // Cinema company (or other) sees empty unless they have promo with matching company_id.
  const scope = req.companyScope || { is_super_admin: true };
  let list = [...promoCodes];
  if (!scope.is_super_admin) {
    list = list.filter(p => p.companyId == null || p.companyId === scope.company_id);
    // Default: jika companyId tidak ada di promo (legacy), assume company 1 (F&B). Cinema (2) gak liat.
    if (scope.company_id !== 1) list = list.filter(p => p.companyId === scope.company_id);
  }
  res.json(list.sort((a, b) => (b.active - a.active) || (b.usedCount - a.usedCount)));
});

// ─── MARQUEE AGGREGATOR ─────────────────────────────────────────────────
// Sumber data "text jalan" untuk Cinema kiosk, POSCDS, POSHome, FlowApp.
// Items disusun dari: custom msg (admin), Sultan jam ini, F&B promo aktif,
// Cinema auto-promo (unlocked + progress), film coming soon.
// Query: ?surface=kiosk|cds|home|flow (filter content per audience)
app.get("/api/marquee", (req, res) => {
  const surface = String(req.query.surface || "kiosk").toLowerCase();
  const items = [];
  // Multi-tenant: scope from middleware
  const scope = req.companyScope || { is_super_admin: true, company_id: null };
  const cidFilter = scope.is_super_admin ? '' : ` AND (company_id IS NULL OR company_id = ${parseInt(scope.company_id, 10)})`;
  const cidExact = scope.is_super_admin ? '' : ` AND company_id = ${parseInt(scope.company_id, 10)}`;

  // 1) Custom admin messages
  // Priority:
  //   a. Per-outlet: pos_config key 'KIOSK_MARQUEE_CUSTOM:<OUTLET_CODE>' (kalau ?outlet=X di URL)
  //   b. Per-company: 'KIOSK_MARQUEE_CUSTOM' dengan company_id = scope.company_id
  //   c. Global: 'KIOSK_MARQUEE_CUSTOM' dengan company_id IS NULL
  // Outlet-scoped messages OVERRIDE company/global biar outlet bisa custom (mis promo lokal)
  try {
    let row = null;
    // a. Outlet-specific (override)
    const outletCode = req.query.outlet ? String(req.query.outlet).trim().toUpperCase() : null;
    if (outletCode) {
      row = db.rawDb.prepare(`SELECT value FROM pos_config WHERE key = ?`).get(`KIOSK_MARQUEE_CUSTOM:${outletCode}`);
    }
    // b. Company-scoped
    if (!row && !scope.is_super_admin) {
      row = db.rawDb.prepare(`SELECT value FROM pos_config WHERE key='KIOSK_MARQUEE_CUSTOM' AND company_id = ?`).get(scope.company_id);
    }
    // c. Global default
    if (!row) {
      row = db.rawDb.prepare(`SELECT value FROM pos_config WHERE key='KIOSK_MARQUEE_CUSTOM' AND company_id IS NULL`).get();
    }
    if (!row && scope.is_super_admin) {
      row = db.rawDb.prepare(`SELECT value FROM pos_config WHERE key='KIOSK_MARQUEE_CUSTOM'`).get();
    }
    if (row?.value) {
      const arr = JSON.parse(row.value);
      if (Array.isArray(arr)) {
        for (const text of arr) {
          if (text && String(text).trim()) {
            items.push({ id: `custom-${items.length}`, icon: "📣", text: String(text).trim(), color: "#a78bfa", kind: "custom" });
          }
        }
      }
    }
  } catch {}

  // 2) Sultan jam ini (top 1 dari spend_leaderboard, current hour, per-company)
  try {
    const hourStart = (() => { const d = new Date(); d.setMinutes(0, 0, 0); return Math.floor(d.getTime() / 1000); })();
    const sultanQuery = scope.is_super_admin
      ? `SELECT name, amount FROM spend_leaderboard WHERE created_at >= ? ORDER BY amount DESC, id ASC LIMIT 1`
      : `SELECT name, amount FROM spend_leaderboard WHERE created_at >= ? AND company_id = ? ORDER BY amount DESC, id ASC LIMIT 1`;
    const top = scope.is_super_admin
      ? db.rawDb.prepare(sultanQuery).get(hourStart)
      : db.rawDb.prepare(sultanQuery).get(hourStart, scope.company_id);
    if (top && top.amount > 0) {
      const rp = "Rp " + Math.round(top.amount).toLocaleString("id-ID");
      items.push({
        id: "sultan-now", icon: "👑",
        text: `SULTAN jam ini: ${top.name || "Tamu"} (${rp}) — kalah pamor? buruan order!`,
        color: "#fbbf24", kind: "sultan",
      });
    }
  } catch {}

  // Gate cinema content per-surface — F&B surfaces (cds/home/flow/kiosk default)
  // shouldn't show cinema items. Cinema items only for explicit cinema-* surfaces.
  // Even di hybrid company, F&B CDS = F&B context, jangan campur film coming-soon.
  const isCinemaSurface = surface.startsWith('cinema');
  const allowCinemaContent = isCinemaSurface;

  // 3) Cinema auto-promo (unlocked = aktif, progress = belum, per-company)
  //    SKIP kalau bukan cinema-* surface (CDS/home/flow/kiosk = F&B).
  if (allowCinemaContent) try {
    const today = new Date().toISOString().slice(0, 10);
    const promos = db.rawDb.prepare(`
      SELECT * FROM cinema_promotions
      WHERE is_active = 1 AND trigger_type IN ('auto_daily_sales','auto_daily_tickets')
        ${cidExact}
        AND (valid_from IS NULL OR valid_from <= ?)
        AND (valid_to IS NULL OR valid_to >= ?)
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
    `).all(today, today);
    if (promos.length) {
      const todaySum = db.rawDb.prepare(`
        SELECT COALESCE(SUM(price),0) AS sales, COUNT(id) AS tickets
        FROM cinema_tickets
        WHERE date(sold_at,'unixepoch','localtime') = ?
          AND (payment_status IS NULL OR payment_status IN ('paid','settled','success'))
      `).get(today) || { sales: 0, tickets: 0 };
      for (const p of promos) {
        const current = p.trigger_type === "auto_daily_sales" ? todaySum.sales : todaySum.tickets;
        const target = p.trigger_threshold || 0;
        const label = p.discount_type === "percentage"
          ? `${p.discount_value}% OFF`
          : `Rp ${(p.discount_value || 0).toLocaleString("id-ID")} OFF`;
        if (current >= target) {
          items.push({
            id: `auto-promo-${p.id}`, icon: "🎉",
            text: `DISKON OTOMATIS AKTIF: ${p.name} — ${label} (semua tiket hari ini)`,
            color: "#fbbf24", kind: "auto_promo",
          });
        } else {
          const remaining = Math.max(0, target - current);
          const unit = p.trigger_type === "auto_daily_sales" ? `Rp ${remaining.toLocaleString("id-ID")} omzet` : `${remaining} tiket`;
          items.push({
            id: `progress-${p.id}`, icon: "🔓",
            text: `Tinggal ${unit} lagi → unlock ${label} (${p.name})`,
            color: "#c084fc", kind: "promo_progress",
          });
        }
      }
    }
  } catch {}

  // 4) Film coming soon — hanya tampil di cinema-* surface (bukan F&B CDS/kiosk).
  if (allowCinemaContent) {
    try {
      const films = db.rawDb.prepare(`
        SELECT title, license_start, genre
        FROM cinema_films
        WHERE status = 'coming_soon'
          ${cidExact}
          AND (license_start IS NULL OR license_start >= date('now'))
        ORDER BY license_start ASC LIMIT 3
      `).all();
      for (const f of films) {
        const when = f.license_start ? ` (mulai ${f.license_start})` : "";
        items.push({
          id: `coming-${f.title}`, icon: "🎬",
          text: `Coming soon: ${f.title}${when}`,
          color: "#22d3ee", kind: "coming_soon",
        });
      }
    } catch {}
  }

  // 5) F&B promo aktif — buat surface home/flow/cds (gak relevan di cinema kiosk)
  if (surface !== "kiosk") {
    try {
      const active = (typeof promoCodes !== "undefined" ? promoCodes : []).filter(p => p.active);
      for (const p of active.slice(0, 5)) {
        const valLabel = p.type === "percentage" ? `${p.value}% OFF`
                      : p.type === "fixed" ? `Rp ${(p.value || 0).toLocaleString("id-ID")} OFF`
                      : p.type === "bogo" ? "Beli 1 Gratis 1"
                      : `${p.value || ""}`;
        items.push({
          id: `fnb-promo-${p.id}`, icon: "🎁",
          text: `Promo ${p.code} — ${valLabel}${p.desc ? " · " + p.desc : ""}`,
          color: "#34d399", kind: "fnb_promo",
        });
      }
    } catch {}
  }

  // Fallback default kalau kosong (tidak ada data)
  if (!items.length) {
    items.push({
      id: "default-welcome", icon: "🍿",
      text: "Selamat datang di karyaOS — pesan tiket / makanan dengan mudah!",
      color: "#a78bfa", kind: "default",
    });
  }

  res.json({ items, surface, generated_at: Date.now() });
});


// POST /api/promo — create new promo (admin)
app.post("/api/promo", requireAdmin, (req, res) => {
  const { code, type, value, desc, minOrder, maxDiscount, usageLimit, validUntil, active, forMember, bogoConfig, requiredPaymentHint } = req.body;
  if (!code || !type) return res.status(400).json({ error: "code & type required" });
  if (type !== "bogo" && !value) return res.status(400).json({ error: "value required" });
  if (promoCodes.find(p => p.code.toUpperCase() === code.toUpperCase())) {
    return res.status(409).json({ error: "Kode sudah digunakan" });
  }
  const promo = {
    id:         `P${String(++promoCounter).padStart(3,"0")}`,
    code:       code.trim().toUpperCase(),
    type, value: Number(value), desc: desc||"",
    minOrder:   Number(minOrder)||0,
    maxDiscount:Number(maxDiscount)||value,
    usageLimit: Number(usageLimit)||999,
    usedCount:  0,
    validFrom:  Date.now(),
    validUntil: validUntil ? new Date(validUntil).getTime() : Date.now()+86400000*30,
    active:     active !== false,
    forMember:  Boolean(forMember),
    bogoConfig: bogoConfig || null,
    requiredPaymentHint: requiredPaymentHint || null,
  };
  promoCodes.push(promo);
  db.insertPromo(promo);
  broadcast("promo:created", promo);
  res.status(201).json(promo);
});

// GET /api/promo/stats — promo usage stats
app.get("/api/promo/stats", (req, res) => {
  const totalSaved = promoCodes.reduce((s,p) => s + p.usedCount * (p.type==="fixed" ? p.value : 0), 0);
  res.json({
    total:    promoCodes.length,
    active:   promoCodes.filter(p=>p.active).length,
    expired:  promoCodes.filter(p=>Date.now()>p.validUntil).length,
    totalUsage: promoCodes.reduce((s,p)=>s+p.usedCount,0),
    totalSaved,
  });
});

// GET /api/promo/:id — single promo
app.get("/api/promo/:id", (req, res) => {
  const promo = promoCodes.find(p => p.id === req.params.id);
  if (!promo) return res.status(404).json({ error: "Promo not found" });
  res.json(promo);
});

// PATCH /api/promo/:id — update promo (SECURITY: whitelist fields)
app.patch("/api/promo/:id", requireAdmin, (req, res) => {
  const idx = promoCodes.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Promo not found" });
  const ALLOWED = ['code', 'name', 'description', 'discount_type', 'discount_value', 'min_purchase', 'max_discount', 'valid_from', 'valid_to', 'usage_limit', 'is_active'];
  const updates = {};
  for (const k of ALLOWED) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (updates.code) {
    updates.code = String(updates.code).trim().toUpperCase();
    const conflict = promoCodes.find(p => p.id !== req.params.id && p.code.toUpperCase() === updates.code);
    if (conflict) return res.status(409).json({ error: `Kode "${updates.code}" sudah dipakai promo ${conflict.id}` });
  }
  // Defensive caps
  if (updates.discount_value != null) updates.discount_value = Math.max(0, Math.min(1_000_000, parseInt(updates.discount_value, 10) || 0));
  if (updates.discount_type && !['percentage', 'fixed'].includes(updates.discount_type)) delete updates.discount_type;
  if (updates.discount_type === 'percentage' && updates.discount_value > 100) updates.discount_value = 100;
  promoCodes[idx] = { ...promoCodes[idx], ...updates };
  db.insertPromo(promoCodes[idx]);
  res.json(promoCodes[idx]);
});

// DELETE /api/promo/:id — delete promo (RBAC: Marketing Manager / Manager+)
app.delete("/api/promo/:id", requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!rbacAcl.canDo(session.role, 'promo', 'delete')) {
    return res.status(403).json({ error: `Role "${session.role}" tidak boleh hapus promo (butuh Marketing Manager / Manager)` });
  }
  promoCodes = promoCodes.filter(p => p.id !== req.params.id);
  db.deletePromo(req.params.id);
  res.json({ ok: true });
});


// ─── CUSTOMER DATABASE ────────────────────────────────────────────────────
// In-memory store (replace with real DB like SQLite/PostgreSQL in production)
// Load customers from SQLite. Seed only on first boot (empty DB)
let customers = db.loadAllCustomers();
if (customers.length === 0) {
  const seed = [
  { id:"C001", name:"Budi Santoso",  phone:"08123456789", visits:5, totalSpend:485000, createdAt:Date.now()-86400000*30, lastVisit:Date.now()-3600000, tags:["member"] },
  { id:"C002", name:"Sari Dewi",     phone:"08234567890", visits:2, totalSpend:198000, createdAt:Date.now()-86400000*7,  lastVisit:Date.now()-7200000, tags:["new"] },
  { id:"C003", name:"Andi Pratama",  phone:"08345678901", visits:8, totalSpend:920000, createdAt:Date.now()-86400000*60, lastVisit:Date.now()-1800000, tags:["member","vip"] },
];
  seed.forEach(c => db.insertCustomer(c));
  customers = seed;
  console.log(`👤 Seeded ${seed.length} demo customers (first boot)`);
}
let customerCounter = customers.length
  ? Math.max(0, ...customers.map(o => {
      const m = /^C(\d+)$/.exec(o.id || "");
      return m ? parseInt(m[1]) : 0;
    }))
  : 0;
console.log(`📊 Customer counter: ${customerCounter}`);

// Whatsapp tracking base URL — set via env
const WA_TRACKING_BASE = process.env.WA_TRACKING_BASE || "http://localhost:5173";

// ── Customer CRUD ──────────────────────────────────────────────────────────

// GET all customers (with search + filter)
app.get("/api/customers", (req, res) => {
  const { q, tag, limit = 100, offset = 0 } = req.query;
  let result = [...customers];
  // Multi-tenant: tenant cuma lihat customer dari company-nya
  const sc = req.companyScope || {};
  if (!sc.is_super_admin) {
    result = result.filter(c => (c.company_id ?? null) === (sc.company_id ?? null));
  }
  if (q) {
    const ql = q.toLowerCase();
    result = result.filter(c => c.name.toLowerCase().includes(ql) || c.phone.includes(q));
  }
  if (tag) result = result.filter(c => c.tags?.includes(tag));
  res.json({
    total: result.length,
    data:  result.slice(Number(offset), Number(offset) + Number(limit)),
  });
});

// GET single customer by phone (for lookup at kiosk)
app.get("/api/customers/lookup", (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "phone required" });
  // Normalize to handle 08xx vs 628xx vs +628xx variants
  const norm = (p) => {
    const d = (p || "").replace(/\D/g, "");
    if (d.startsWith("62")) return d;
    if (d.startsWith("0"))  return "62" + d.slice(1);
    return d;
  };
  const target = norm(phone);
  const found  = customers.find(c => norm(c.phone) === target);
  // Always 200 — null body means "not found, but no error" (avoids console noise)
  res.json(found || null);
});

// POST create or update customer (upsert by phone)
app.post("/api/customers", (req, res) => {
  const { name, phone, tags } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "name and phone required" });
  const clean = phone.replace(/\D/g,"");
  const existing = customers.find(c => c.phone.replace(/\D/g,"") === clean);
  if (existing) {
    // Update name if changed
    if (name && name !== existing.name) existing.name = name;
    if (tags) existing.tags = [...new Set([...(existing.tags||[]), ...tags])];
    return res.json({ ...existing, isNew: false });
  }
  // Multi-tenant: auto-tag company_id from scope
  const sc = req.companyScope || {};
  const customer = {
    id:        `C${String(++customerCounter).padStart(3,"0")}`,
    name:      name.trim(),
    phone:     clean,
    visits:    0,
    totalSpend:0,
    createdAt: Date.now(),
    lastVisit: null,
    tags:      tags || ["new"],
    company_id: sc.company_id ?? null,
  };
  customers.push(customer);
  db.insertCustomer(customer);
  console.log(`👤 New customer: ${customer.name} (${customer.phone})`);
  res.status(201).json({ ...customer, isNew: true });
});

// PATCH update customer
// POST /api/customers/import — bulk migration from CSV (admin/super-admin)
// Body: {
//   rows: [{phone, name, points, tier, lifetime_spend, signup_date, external_id, tags}],
//   mode: "dry_run" | "commit",
//   dedup_strategy: "skip" | "merge" | "overwrite",   // kalau phone duplicate
// }
app.post("/api/customers/import", requireAdmin, (req, res) => {
  const b = req.body || {};
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const mode = b.mode === "commit" ? "commit" : "dry_run";
  const dedup = ["skip", "merge", "overwrite"].includes(b.dedup_strategy) ? b.dedup_strategy : "skip";
  // Multi-tenant scope: pakai header x-company-id atau body.company_id (super-admin)
  const scopeCid = parseInt(req.headers["x-company-id"], 10);
  const isSuperAdmin = String(req.headers["x-super-admin"] || "") === "true";
  let companyId = scopeCid || (isSuperAdmin ? parseInt(b.company_id, 10) : null);
  if (!companyId) {
    try {
      const row = db.rawDb.prepare(`SELECT id FROM companies WHERE status='active' ORDER BY id LIMIT 1`).get();
      companyId = row?.id;
    } catch {}
  }
  if (!companyId) return res.status(400).json({ error: "no company scope" });

  if (rows.length === 0) return res.status(400).json({ error: "rows kosong" });
  if (rows.length > 10000) return res.status(400).json({ error: "max 10,000 rows per import" });

  const summary = { total: rows.length, new: 0, update: 0, skip: 0, error: [] };
  const newCustomers = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const phone = String(r.phone || "").replace(/\D/g, "").trim();  // strip non-digit
    const name = String(r.name || "").trim();
    if (!phone) { summary.error.push({ row: i + 1, phone: r.phone, error: "phone kosong/invalid" }); continue; }
    if (phone.length < 8 || phone.length > 16) { summary.error.push({ row: i + 1, phone, error: "phone length invalid (8-16 digit)" }); continue; }

    // Cek existing by phone + company
    let existing = null;
    try {
      existing = db.rawDb.prepare(`SELECT id, name, phone, visits, total_spend, points, tags, created_at FROM customers WHERE phone = ? AND company_id = ?`).get(phone, companyId);
    } catch {}

    const points = Math.max(0, parseInt(r.points, 10) || 0);
    const lifetimeSpend = Math.max(0, parseInt(r.lifetime_spend, 10) || 0);
    const visits = Math.max(0, parseInt(r.visits, 10) || 0);
    const tier = r.tier ? String(r.tier).toLowerCase().trim() : null;
    const tagsArr = [];
    if (r.tags) String(r.tags).split(/[,;]/).forEach(t => { const tag = t.trim().toLowerCase(); if (tag) tagsArr.push(tag); });
    if (tier && !tagsArr.includes(tier)) tagsArr.push(tier);
    if (!tagsArr.includes("member")) tagsArr.push("member");  // default mark as member
    const tags = JSON.stringify(tagsArr);
    const signupTs = r.signup_date ? Math.floor(new Date(r.signup_date).getTime()) : Date.now();

    if (existing) {
      // Duplicate handling
      if (dedup === "skip") { summary.skip++; continue; }
      if (mode === "commit") {
        try {
          if (dedup === "overwrite") {
            db.rawDb.prepare(`UPDATE customers SET name = ?, points = ?, total_spend = ?, visits = ?, tags = ? WHERE id = ?`)
              .run(name || existing.name, points, lifetimeSpend, visits, tags, existing.id);
          } else {  // merge — preserve max value, append tags
            const mergedPoints = Math.max(existing.points || 0, points);
            const mergedSpend = Math.max(existing.total_spend || 0, lifetimeSpend);
            const mergedVisits = Math.max(existing.visits || 0, visits);
            db.rawDb.prepare(`UPDATE customers SET name = COALESCE(NULLIF(?, ''), name), points = ?, total_spend = ?, visits = ?, tags = ? WHERE id = ?`)
              .run(name, mergedPoints, mergedSpend, mergedVisits, tags, existing.id);
          }
        } catch (e) { summary.error.push({ row: i + 1, phone, error: e.message }); continue; }
      }
      summary.update++;
    } else {
      // NEW customer
      const id = `cust_${companyId}_${Date.now()}_${i}`;
      if (mode === "commit") {
        try {
          db.rawDb.prepare(`INSERT INTO customers (id, name, phone, visits, total_spend, created_at, last_visit, tags, points, company_id) VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(id, name || "Anonymous", phone, visits, lifetimeSpend, signupTs, signupTs, tags, points, companyId);
          newCustomers.push({ id, phone, name });
        } catch (e) { summary.error.push({ row: i + 1, phone, error: e.message }); continue; }
      }
      summary.new++;
    }
  }

  // Audit log
  if (mode === "commit" && typeof global.logAudit === "function") {
    try { global.logAudit(req, { action: "customer.bulk_import", entity: "customer", payload: { company_id: companyId, summary } }); } catch {}
  }

  res.json({ ok: true, mode, dedup_strategy: dedup, company_id: companyId, summary });
});

// SECURITY: WHITELIST fields — sebelumnya {...req.body} → mass assignment risk.
// Bug hunter bisa set company_id, role, premium_until, dll via PATCH.
app.patch("/api/customers/:id", requireAdmin, (req, res) => {
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Customer not found" });
  // Scope check: tenant cuma boleh edit customer own company
  const sc = req.companyScope || {};
  const existing = customers[idx];
  if (sc.company_id != null && !sc.is_super_admin && existing.company_id != null && existing.company_id !== sc.company_id) {
    return res.status(404).json({ error: "Customer not found" });
  }
  // Whitelist fields editable
  const ALLOWED = ['name', 'phone', 'tags', 'visits', 'totalSpend', 'points', 'lastVisit', 'notes'];
  const updates = {};
  for (const k of ALLOWED) if (req.body[k] !== undefined) updates[k] = req.body[k];
  // Defensive caps
  if (updates.points != null) updates.points = Math.max(0, Math.min(10_000_000, parseInt(updates.points, 10) || 0));
  if (updates.totalSpend != null) updates.totalSpend = Math.max(0, parseInt(updates.totalSpend, 10) || 0);
  if (updates.visits != null) updates.visits = Math.max(0, parseInt(updates.visits, 10) || 0);
  if (updates.tags != null && !Array.isArray(updates.tags)) delete updates.tags;
  const merged = { ...existing, ...updates };
  customers[idx] = merged;
  try { db.insertCustomer(merged); } catch (e) { console.error('[customer patch] db persist:', e.message); }
  res.json(merged);
});

// DELETE customer — REQUIRE Manager+ level (canDo: customers.delete)
app.delete("/api/customers/:id", requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (!rbacAcl.canDo(session.role, 'customers', 'delete')) {
    return res.status(403).json({ error: `Role "${session.role}" tidak boleh hapus customer (butuh Manager+)` });
  }
  const id = req.params.id;
  customers = customers.filter(c => c.id !== id);
  try { db.deleteCustomer(id); } catch (e) { console.error('[customer delete] db:', e.message); }
  res.json({ ok: true });
});

// GET customer stats (for marketing)
app.get("/api/customers/stats", (req, res) => {
  const total     = customers.length;
  const members   = customers.filter(c => c.tags?.includes("member")).length;
  const vip       = customers.filter(c => c.tags?.includes("vip")).length;
  const newToday  = customers.filter(c => Date.now()-c.createdAt < 86400000).length;
  const totalRev  = customers.reduce((s,c) => s+c.totalSpend, 0);
  const avgVisits = total ? (customers.reduce((s,c)=>s+c.visits,0)/total).toFixed(1) : 0;
  res.json({ total, members, vip, newToday, totalRev, avgVisits });
});

// POST send WhatsApp tracking link
app.post("/api/customers/send-wa", requireAdmin, async (req, res) => {
  const { phone, orderId, customerName } = req.body;
  if (!phone || !orderId) return res.status(400).json({ error: "phone and orderId required" });

  // Auto-resolve base URL — fallback chain:
  // 1. WA_TRACKING_BASE env var (manual override)
  // 2. TRACKING_BASE_URL env var
  // 3. Auto-detect dari request (production HTTPS) — TIDAK lagi hardcode localhost
  let trackingBase = process.env.WA_TRACKING_BASE || process.env.TRACKING_BASE_URL;
  if (!trackingBase) {
    const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "app.karyaos.tech").split(",")[0].trim();
    trackingBase = `${proto}://${host}`;
  }
  const trackUrl = `${trackingBase}/track?order=${orderId}`;

  // Sanitize name — kalau "x", placeholder, single char, atau cuma simbol → "Kak"
  const cleanName = (customerName || "").trim();
  const safeName = (cleanName.length >= 2 && !/^[xX_\-\.]+$/.test(cleanName) && cleanName.toLowerCase() !== "anonymous")
    ? cleanName : "Kak";

  // Resolve brand name from companies table for the current scope (or default)
  let brandName = "KaryaOS";
  try {
    const cid = parseInt(req.headers["x-company-id"], 10);
    if (cid) {
      const c = db.rawDb.prepare(`SELECT name, brand_short FROM companies WHERE id = ?`).get(cid);
      if (c) brandName = c.brand_short || c.name || brandName;
    }
  } catch {}

  const message = encodeURIComponent(
    `Halo ${safeName}! 👋\n\nTerima kasih sudah memesan di *${brandName}* 🍽️\n\nPesanan *#${orderId}* Anda sedang kami proses.\n\nCek status pesanan real-time di sini:\n👉 ${trackUrl}\n\nEstimasi siap: *12–18 menit*\n\nTerima kasih! 🙏`
  );

  // WhatsApp API (wa.me deep link — works without Business API)
  const cleanPhone = phone.replace(/\D/g,"");
  const waPhone    = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  const waUrl      = `https://wa.me/${waPhone}?text=${message}`;

  console.log(`📱 WA link generated for ${waPhone} — Order #${orderId} (brand: ${brandName}, name: ${safeName}, track: ${trackingBase})`);
  res.json({ ok: true, waUrl, trackUrl });
});

// ─── PRINTER (Epson TM-T82 via TCP/LAN) ──────────────────────────────────
const net = require("net");

function tcpPrint(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => { client.destroy(); reject(new Error("Timeout")); }, 5000);
    client.connect(port, ip, () => {
      client.write(Buffer.from(data));
      clearTimeout(timeout);
      client.end();
      resolve(true);
    });
    client.on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

// POST /api/print — send ESC/POS bytes to printer
app.post("/api/print", async (req, res) => {
  const { ip, port, data } = req.body;
  if (!ip || !port || !data) return res.status(400).json({ error: "ip, port, data required" });
  try {
    await tcpPrint(ip, parseInt(port), data);
    console.log(`🖨️  Printed to ${ip}:${port} (${data.length} bytes)`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`🖨️  Print failed: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/orders/:id/escpos?type=kitchen|customer
// Build ESC/POS bytes untuk order tertentu. Frontend forward ke local print bridge.
// Pakai ini supaya printer LAN bisa dicetak meski backend di VPS (gak bisa reach LAN langsung).
app.get("/api/orders/:id/escpos", (req, res) => {
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "order not found" });
  const type = req.query.type === "kitchen" ? "kitchen" : "customer";
  try {
    const raw = type === "kitchen" ? buildKitchenTicket(order, printerConfig.template) : buildCustomerReceipt(order, printerConfig.template);
    // raw could be Buffer (current builder returns Buffer.from(this.bytes)) OR array.
    // JSON.stringify Buffer → {type:"Buffer",data:[...]}, which frontend can't use.
    // Always serialize to plain int[] for bridge compat.
    const bytes = Buffer.isBuffer(raw) ? Array.from(raw) : (Array.isArray(raw) ? raw : Array.from(raw || []));
    res.json({
      ok: true,
      order_id: order.id,
      type,
      bytes,
      target_ip:   type === "kitchen" ? (printerConfig.kitchen?.ip   || "") : (printerConfig.customer?.ip   || ""),
      target_port: type === "kitchen" ? (printerConfig.kitchen?.port || 9100) : (printerConfig.customer?.port || 9100),
    });
  } catch (e) {
    res.status(500).json({ error: "build failed: " + e.message });
  }
});

// POST /api/print/test — test printer connection
app.post("/api/print/test", async (req, res) => {
  const { ip, port } = req.body;
  if (!ip || !port) return res.status(400).json({ error: "ip and port required" });
  try {
    // Send init + beep + cut
    const testBytes = [0x1B,0x40, 0x1B,0x42,0x02,0x01, 0x0A,0x0A, 0x1D,0x56,0x41,0x03];
    await tcpPrint(ip, parseInt(port), testBytes);
    res.json({ ok: true, message: `Printer ${ip}:${port} connected` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ─── ESB POS PUSH NOTIFICATION ───────────────────────────────────────────
// Config diambil dari environment variables atau di-set via /api/esb/config
let esbConfig = {
  baseUrl:  process.env.ESB_BASE_URL  || "https://api.esb.co.id/eso-qs/v1",
  apiKey:   process.env.ESB_API_KEY   || "",
  outletId: process.env.ESB_OUTLET_ID || "",
  enabled:  process.env.ESB_ENABLED   === "true" || false,
};

// Format order ke payload ESB Order QS
function buildESBOrderPayload(order) {
  return {
    outlet_id:    esbConfig.outletId,
    order_id:     order.id,
    order_source: "KIOSK",
    order_type:   order.type === "dine" ? "DINE_IN" : "TAKEAWAY",
    table_number: order.table || null,
    payment_method: order.pay || "QRIS",
    status:       "NEW",
    items: (order.items || []).map(i => ({
      item_code:  String(i.id || i.n),
      item_name:  i.n,
      quantity:   i.q,
      unit_price: i.p,
      subtotal:   i.p * i.q,
      notes:      i.note || "",
    })),
    subtotal:     order.subtotal || order.total,
    tax:          order.tax || 0,
    total:        order.total,
    created_at:   new Date(order.time || Date.now()).toISOString(),
  };
}

// Push order ke ESB POS
async function pushOrderToESB(order) {
  if (!esbConfig.enabled || !esbConfig.apiKey || !esbConfig.outletId) {
    console.log("⚡ ESB push skipped (disabled or no config)");
    return { ok: false, skipped: true };
  }

  const payload = buildESBOrderPayload(order);
  const endpoints = [
    `/outlets/${esbConfig.outletId}/orders`,
    `/order`,
    `/orders`,
  ];

  for (const ep of endpoints) {
    try {
      const fetch = (await import("node-fetch")).default;
      const res = await fetch(`${esbConfig.baseUrl}${ep}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Accept":        "application/json",
          "Authorization": `Bearer ${esbConfig.apiKey}`,
          "X-Outlet-Id":   esbConfig.outletId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`🔔 ESB POS notif OK — Order #${order.id} → ${esbConfig.baseUrl}${ep}`);
        return { ok: true, endpoint: ep, response: data };
      }
    } catch (e) {
      console.warn(`⚠️  ESB push attempt ${ep} failed: ${e.message}`);
    }
  }

  console.error(`❌ ESB POS push failed — Order #${order.id}`);
  return { ok: false, error: "All endpoints failed" };
}

// Retry queue untuk order yang gagal push
const retryQueue = [];
setInterval(async () => {
  if (!esbConfig.enabled || retryQueue.length === 0) return;
  const order = retryQueue.shift();
  console.log(`🔁 Retry ESB push Order #${order.id}...`);
  const result = await pushOrderToESB(order);
  if (!result.ok && !result.skipped) retryQueue.push(order); // put back if still fails
}, 30000); // retry every 30s

// ─── ESB MENU PUSH ──────────────────────────────────────────────
// Format menu item → ESB Menu payload (mirror src/esbApi.js mapMenuToESB)
function buildESBMenuPayload(item) {
  let imageUrl = item.image_url || item.image || "";
  if (imageUrl && imageUrl.startsWith("/")) {
    imageUrl = (process.env.WA_TRACKING_BASE || "https://app.karyaos.tech") + imageUrl;
  }
  return {
    item_code:    String(item.id),
    item_name:    item.name || item.n,
    category:     item.cat || item.category || "Uncategorized",
    price:        Number(item.price) || 0,
    is_available: item.avail !== false && item.is_available !== false,
    description:  item.desc || item.description || "",
    image_url:    imageUrl,
    emoji:        item.emoji || item.e || "",
    tags:         item.tag ? [item.tag] : (Array.isArray(item.tags) ? item.tags : []),
    free_extras:  item.freeToppings || item.free_extras || 0,
    is_popular:   !!item.popular,
    is_bestseller: ["BESTSELLER","BEST SELLER","HOT TODAY","CHEF'S PICK"].includes((item.tag || "").toUpperCase()),
  };
}

// Push menu (single or bulk) ke ESB POS
async function pushMenuToESB(items) {
  if (!esbConfig.enabled || !esbConfig.apiKey || !esbConfig.outletId) {
    console.log("⚡ ESB menu push skipped (disabled or no config)");
    return { ok: false, skipped: true };
  }
  if (!items || items.length === 0) {
    return { ok: false, error: "no items to push" };
  }
  const payload = { outlet_id: esbConfig.outletId, items: items.map(buildESBMenuPayload) };
  const endpoints = [
    `/outlets/${esbConfig.outletId}/menus/bulk`,
    `/outlets/${esbConfig.outletId}/menus`,
    `/menus/bulk`,
  ];
  const fetch = (await import("node-fetch")).default;
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${esbConfig.baseUrl}${ep}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${esbConfig.apiKey}`,
          "X-Outlet-Id": esbConfig.outletId,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`🔔 ESB menu push OK — ${items.length} items → ${ep}`);
        return { ok: true, endpoint: ep, count: items.length, response: data };
      }
    } catch (e) {
      console.warn(`⚠️  ESB menu push attempt ${ep} failed: ${e.message}`);
    }
  }
  console.error(`❌ ESB menu push failed — all endpoints failed`);
  return { ok: false, error: "All endpoints failed" };
}

// Auto-sync helper — fire-and-forget single item update ke ESB (used by menu PATCH/POST hooks)
function autoSyncMenuToESB(item) {
  if (!esbConfig.enabled) return;
  Promise.resolve(pushMenuToESB([item])).catch(e => console.warn(`ESB auto-sync fail: ${e.message}`));
}

// POST /api/esb/menu/push — manual trigger menu sync (bulk or specific items)
// Body: { items?: [...] } — kalau kosong, push semua menu items
app.post("/api/esb/menu/push", requireAdmin, async (req, res) => {
  let items = req.body?.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    // Fetch all menu items from DB
    try {
      const rows = db.rawDb.prepare(`SELECT * FROM pos_menus WHERE company_id = ? OR ? IS NULL`)
        .all(req.session?.companyId || null, req.session?.companyId || null);
      items = rows;
    } catch (e) {
      // Fallback: ambil dari MENU_ITEMS in-memory kalau ada
      items = typeof menuItems !== "undefined" ? menuItems : [];
    }
  }
  if (items.length === 0) return res.status(400).json({ error: "no menu items to push" });
  const result = await pushMenuToESB(items);
  res.json(result);
});

// GET /api/esb/config — get current ESB config (mask api key)
app.get("/api/esb/config", (req, res) => {
  res.json({
    baseUrl:  esbConfig.baseUrl,
    outletId: esbConfig.outletId,
    enabled:  esbConfig.enabled,
    hasApiKey: !!esbConfig.apiKey,
    apiKeyHint: esbConfig.apiKey ? esbConfig.apiKey.slice(0,8) + "..." : "",
  });
});

// POST /api/esb/config — update ESB config at runtime
app.post("/api/esb/config", requireAdmin, (req, res) => {
  const { baseUrl, apiKey, outletId, enabled } = req.body;
  if (baseUrl)  esbConfig.baseUrl  = baseUrl;
  if (apiKey)   esbConfig.apiKey   = apiKey;
  if (outletId) esbConfig.outletId = outletId;
  if (enabled !== undefined) esbConfig.enabled = Boolean(enabled);
  console.log(`⚙️  ESB config updated — enabled:${esbConfig.enabled} outlet:${esbConfig.outletId}`);
  res.json({ ok: true, enabled: esbConfig.enabled, outletId: esbConfig.outletId });
});

// POST /api/esb/test — test push a dummy order
app.post("/api/esb/test", requireAdmin, async (req, res) => {
  const dummy = {
    id: "TEST-01", time: Date.now(), type: "dine", table: "T1",
    pay: "QRIS", total: 55000, subtotal: 49550, tax: 5450,
    items: [{ n: "Test Item", q: 1, p: 55000 }],
  };
  const result = await pushOrderToESB(dummy);
  res.json(result);
});

// POST /api/esb/retry — manual retry semua failed orders
app.post("/api/esb/retry", requireAdmin, (req, res) => {
  const count = retryQueue.length;
  res.json({ ok: true, queued: count });
});



// ─── ADMIN: Audio upload (TTS replacement files) ────────────────────────
const AUDIO_DIR = require("path").join(__dirname, "audio");
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

app.get("/api/admin/audio", (_, res) => {
  try {
    const files = fs.readdirSync(AUDIO_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f));
    const items = files.map(f => {
      const stat = fs.statSync(require("path").join(AUDIO_DIR, f));
      return { name: f, size: stat.size, modified: stat.mtimeMs };
    });
    res.json({ files: items });
  } catch (e) {
    res.json({ files: [], error: e.message });
  }
});

app.post("/api/admin/audio/:name", requireAdmin, (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { dataBase64, mimeType } = req.body || {};
    if (!dataBase64) return res.status(400).json({ error: "dataBase64 required" });
    // Decode base64 → buffer (strip data URL prefix if present)
    const b64 = dataBase64.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: "File too large (max 5MB)" });
    fs.writeFileSync(require("path").join(AUDIO_DIR, name), buf);
    console.log(`🔊 Audio uploaded: ${name} (${(buf.length/1024).toFixed(1)}KB)`);
    res.json({ ok: true, name, size: buf.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/audio-config", (_, res) => {
  res.json(audioConfig.getConfig());
});

app.patch("/api/admin/audio-config", requireAdmin, (req, res) => {
  try {
    const cur = audioConfig.getConfig();
    const patch = req.body || {};
    // Allow nested profile updates: { profiles: { newOrder: false } } merges
    const next = { ...cur, ...patch };
    if (patch.profiles) next.profiles = { ...cur.profiles, ...patch.profiles };
    const saved = audioConfig.saveConfig(next);
    console.log(`🔊 Audio config updated (enabled=${saved.enabled}, vol=${saved.volume})`);
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/audio/:name", requireAdmin, (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fp = require("path").join(AUDIO_DIR, name);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      console.log(`🔊 Audio deleted: ${name}`);
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MIDTRANS QRIS PAYMENT ────────────────────────────────────────────────
// Midtrans config now loaded from midtrans.js module (persisted to midtrans-config.json)
// Backward compat: getter that reads from module each time (no stale cache)
const midtransConfig = new Proxy({}, {
  get: (_, prop) => midtrans.getConfig()[prop]
});

// Midtrans Core API base URL
const mtBaseUrl = () => midtransConfig.isProduction
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";

// Auth header: Base64(serverKey:)
const mtAuth = () => "Basic " + Buffer.from(midtransConfig.serverKey + ":").toString("base64");

async function midtransRequest(method, path, body) {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch(`${mtBaseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      "Accept":        "application/json",
      "Authorization": mtAuth(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_messages?.[0] || data?.status_message || `HTTP ${res.status}`);
  return data;
}



// ─── ADMIN: Screensaver config + images CRUD ────────────────────────
app.get("/api/admin/screensaver-config", (_, res) => {
  res.json({ config: screensaver.getConfig(), images: screensaver.listImages() });
});

app.patch("/api/admin/screensaver-config", requireAdmin, (req, res) => {
  try {
    const saved = screensaver.saveConfig({ ...screensaver.getConfig(), ...req.body });
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/screensaver-image/:name", requireAdmin, (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { dataBase64 } = req.body || {};
    if (!dataBase64) return res.status(400).json({ error: "dataBase64 required" });
    const b64 = dataBase64.replace(/^data:[^;]+;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 5MB)" });
    require("fs").writeFileSync(require("path").join(screensaver.IMAGES_DIR, name), buf);
    console.log(`🖼 Screensaver image uploaded: ${name}`);
    res.json({ ok: true, name, size: buf.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/screensaver-image/:name", requireAdmin, (req, res) => {
  try {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fp = require("path").join(screensaver.IMAGES_DIR, name);
    if (require("fs").existsSync(fp)) {
      require("fs").unlinkSync(fp);
      res.json({ ok: true });
    } else res.status(404).json({ error: "Not found" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ADMIN: Midtrans config CRUD ───────────────────────────────────────
app.get("/api/admin/midtrans-config", (_, res) => {
  const cfg = midtrans.getConfig();
  // Hide sensitive parts of server key in response (show last 4 chars only)
  const masked = {
    ...cfg,
    serverKey: cfg.serverKey ? "•••••" + cfg.serverKey.slice(-4) : "",
    serverKeyFull: cfg.serverKey,  // separate field — frontend can choose to reveal
  };
  res.json(masked);
});

app.patch("/api/admin/midtrans-config", requireAdmin, (req, res) => {
  try {
    const allowed = ["serverKey","clientKey","isProduction","enabledMethods","merchantId","notificationUrl"];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const cfg = midtrans.getConfig();
    const updated = midtrans.saveConfig({ ...cfg, ...patch });
    console.log(`💳 Midtrans config updated (${updated.isProduction ? "production" : "sandbox"})`);
    res.json({ ok: true, config: { ...updated, serverKey: "•••••" + (updated.serverKey||"").slice(-4) } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/midtrans-test", requireAdmin, async (_, res) => {
  const result = await midtrans.testConnection();
  res.json(result);
});

// ─── CINEMA WEB BOOKING — MIDTRANS SNAP ────────────────────────────────────
// POST /api/payment/cinema-snap — create Snap token for a cinema purchase.
// Frontend (CinemaWeb) calls this AFTER /api/cinema/tickets returns purchase_id.
// Then opens Snap popup with the returned snap_token.
//
// Defense layers (per user-reported issues):
//   1. Refuse if purchase already paid (anti double-charge)
//   2. order_id encodes purchase_id so webhook can route back unambiguously
//   3. Persist payment_ref so we can match webhook → ticket
//   4. Snap response includes redirect_url as fallback if Snap.js fails
app.post("/api/payment/cinema-snap", async (req, res) => {
  const { purchase_id } = req.body || {};
  if (!purchase_id) return res.status(400).json({ error: "purchase_id required" });
  if (!midtransConfig.serverKey) return res.status(503).json({ error: "Midtrans server key not configured" });

  try {
    const tickets = db.rawDb.prepare(`SELECT * FROM cinema_tickets WHERE purchase_id = ?`).all(purchase_id);
    if (tickets.length === 0) return res.status(404).json({ error: "purchase tidak ditemukan" });
    if (tickets[0].payment_status === "paid") return res.status(409).json({ error: "purchase sudah dibayar", paid: true });

    const bundles = db.rawDb.prepare(`SELECT * FROM cinema_purchase_bundles WHERE purchase_id = ?`).all(purchase_id);
    const t0 = tickets[0];
    const seatsTotal = tickets.reduce((s, t) => s + (t.price || 0), 0);
    const bundlesTotal = bundles.reduce((s, b) => s + (b.price * b.qty), 0);
    const grossAmount = Math.round(seatsTotal + bundlesTotal);

    const itemDetails = [
      ...tickets.map(t => ({
        id: `seat-${t.seat}`.slice(0, 50),
        name: `Tiket Kursi ${t.seat}`.slice(0, 50),
        price: Math.round(t.price || 0),
        quantity: 1,
      })),
      ...bundles.map(b => ({
        id: `bundle-${b.bundle_id}`.slice(0, 50),
        name: String(b.bundle_name || `Bundle ${b.bundle_id}`).replace(/[^\w\s.,()\-]/g, "").slice(0, 50),
        price: Math.round(b.price),
        quantity: b.qty,
      })),
    ].filter(i => i.price > 0);

    // Unique order_id per Snap attempt — encode purchase_id for webhook routing
    const orderId = `CINEMA-${purchase_id}-${Date.now()}`;

    const snapUrl = midtransConfig.isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    const fetch = (await import("node-fetch")).default;
    const snapRes = await fetch(snapUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": mtAuth(),
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        item_details: itemDetails,
        customer_details: {
          first_name: t0.buyer || "Customer",
          email: t0.buyer_email || undefined,
          phone: t0.buyer_phone || undefined,
        },
        callbacks: {
          finish: `${process.env.TRACKING_BASE_URL || ""}/?ticket=${tickets[0].code}`,
        },
      }),
    });
    const snapData = await snapRes.json();
    if (!snapRes.ok || !snapData.token) {
      console.error("❌ Snap create failed:", snapData);
      return res.status(502).json({ error: "Snap creation failed", details: snapData });
    }

    // Persist payment_ref so webhook can match back
    db.rawDb.prepare(`UPDATE cinema_tickets SET payment_ref = ?, payment_method = 'snap', payment_status = COALESCE(payment_status, 'pending_payment') WHERE purchase_id = ?`)
      .run(orderId, purchase_id);

    console.log(`🎬 Snap created for ${purchase_id} → ${orderId} (Rp ${grossAmount.toLocaleString("id-ID")})`);
    res.json({
      snap_token: snapData.token,
      redirect_url: snapData.redirect_url,
      order_id: orderId,
      purchase_id,
      gross_amount: grossAmount,
    });
  } catch (e) {
    console.error("❌ /cinema-snap error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cinema/purchase/:purchase_id/status — frontend polling fallback.
// Used when Snap popup closes / webhook delayed — confirm payment status
// independently via DB. Cheap query, safe to call repeatedly.
app.get("/api/cinema/purchase/:purchase_id/status", (req, res) => {
  const rows = db.rawDb.prepare(`SELECT code, payment_status, paid_at, payment_ref FROM cinema_tickets WHERE purchase_id = ?`).all(req.params.purchase_id);
  if (rows.length === 0) return res.status(404).json({ error: "purchase not found" });
  const allPaid = rows.every(r => r.payment_status === "paid");
  const anyFailed = rows.some(r => r.payment_status === "failed");
  res.json({
    purchase_id: req.params.purchase_id,
    payment_status: allPaid ? "paid" : anyFailed ? "failed" : (rows[0].payment_status || "pending_payment"),
    paid: allPaid,
    paid_at: rows[0].paid_at,
    ticket_count: rows.length,
    ticket_codes: rows.map(r => r.code),
  });
});

// POST /api/payment/qris — create QRIS transaction
app.post("/api/payment/qris", async (req, res) => {
  const { orderId, amount, items, customerName } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required" });
  if (!midtransConfig.serverKey) return res.status(503).json({ error: "Midtrans server key not configured" });

  try {
    // Build item details — strip emoji/special chars, ensure valid for Midtrans
    const mappedItems = (items || []).map((i, idx) => {
      const rawName = String(i.n || i.name || "Item");
      // Remove emoji and non-ASCII, keep alphanumeric + basic punctuation
      const cleanName = rawName
        .replace(/[\u{1F600}-\u{1F9FF}]/gu, "")
        .replace(/[^\w\s.,()\-]/g, "")
        .trim()
        .slice(0, 50) || `Item ${idx + 1}`;
      const rawId = String(i.id || i.n || `item-${idx}`);
      const cleanId = rawId.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 50) || `item-${idx}`;
      const price = Math.max(1, Math.round((Number(i.p) || 0) + (Number(i.addonTotal) || 0)));
      const qty   = Math.max(1, Math.round(Number(i.q) || 1));
      return { id: cleanId, price, quantity: qty, name: cleanName };
    });

    // Remove items with zero price
    const validItems = mappedItems.filter(i => i.price > 0);
    if (validItems.length === 0) {
      validItems.push({ id: "order", price: Math.round(amount), quantity: 1, name: "Order" });
    }

    // Recalculate gross_amount from items to ensure match
    const itemsTotal = validItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const grossAmount = Math.round(amount) || itemsTotal;

    // If mismatch, add adjustment item
    if (itemsTotal !== grossAmount && mappedItems.length > 0) {
      const diff = grossAmount - itemsTotal;
      if (diff !== 0) {
        // Keep diff's sign — Midtrans needs sum(item_details) === gross_amount,
        // so a discount must be a negative-price line (not Math.abs).
        validItems.push({
          id: diff > 0 ? "tax-fee" : "discount",
          price: diff,
          quantity: 1,
          name: diff > 0 ? "Pajak & Biaya" : "Diskon",
        });
      }
    }

    // Use GoPay in sandbox (QRIS requires production merchant setup)
    // In production, change payment_type to "qris" and add qris: { acquirer: "gopay" }
    const isProduction = midtransConfig.isProduction;
    const payload = {
      payment_type: isProduction ? "qris" : "gopay",
      transaction_details: {
        order_id:     `KaryaOS-${orderId}-${Date.now()}`,
        gross_amount: grossAmount,
      },
      ...(isProduction
        ? { qris: { acquirer: "gopay" } }
        : { gopay: { enable_callback: false } }
      ),
      item_details: validItems,
      customer_details: {
        first_name: (customerName || "Customer").slice(0, 50),
        email:      "customer@example.com",
      },
    };

    const result = await midtransRequest("POST", "/v2/charge", payload);
    console.log(`💳 QRIS created — Order: ${payload.transaction_details.order_id} — Rp ${amount.toLocaleString()}`);
    console.log(`💳 Midtrans response:`, JSON.stringify(result).slice(0, 300));

    // Get QR string — GoPay uses deeplink actions, QRIS uses qr_string
    let finalQrString = result.qr_string || "";

    // For GoPay sandbox: get QR from actions
    if (!finalQrString && result.actions) {
      const qrAction = result.actions.find(a =>
        a.name === "generate-qr-code" || a.name === "deeplink-redirect"
      );
      if (qrAction?.url) {
        finalQrString = qrAction.url;
      }
    }

    // For GoPay: also get deeplink URL for mobile
    const deeplinkUrl = result.actions?.find(a => a.name === "deeplink-redirect")?.url || "";
    const qrImageUrl  = result.actions?.find(a => a.name === "generate-qr-code")?.url || "";

    console.log("💳 QR actions:", JSON.stringify(result.actions));

    const txEntry = {
      internalOrderId: orderId,
      midtransOrderId: payload.transaction_details.order_id,
      transactionId:   result.transaction_id,
      status:          result.transaction_status,
      qrString:        finalQrString,
      qrUrl:           result.actions?.find(a => a.name === "generate-qr-code")?.url || "",
      amount,
      createdAt:       Date.now(),
    };
    transactions.set(txEntry.midtransOrderId, txEntry);

    res.json({
      ok:              true,
      midtransOrderId: txEntry.midtransOrderId,
      transactionId:   result.transaction_id,
      qrString:        finalQrString,
      qrUrl:           qrImageUrl || txEntry.qrUrl,
      deeplinkUrl:     deeplinkUrl,
      status:          result.transaction_status,
      expiryTime:      result.expiry_time,
      paymentType:     isProduction ? "qris" : "gopay",
    });
  } catch (e) {
    console.error("Midtrans QRIS error:", e.message);
    res.status(500).json({ error: e.message });
  }
});


// GET /api/payment/check/:internalOrderId — check by internal order ID (for kiosk polling)
app.get("/api/payment/check/:internalOrderId", async (req, res) => {
  const { internalOrderId } = req.params;

  // Search transactions map by internalOrderId
  for (const [mtId, tx] of transactions.entries()) {
    if (tx.internalOrderId === internalOrderId) {
      const paid = tx.paid || ["capture","settlement"].includes(tx.status);
      if (paid) return res.json({ ok: true, paid: true, status: tx.status, midtransOrderId: mtId });

      // Not paid yet — check Midtrans directly
      try {
        const mtStatus = await midtransRequest("GET", `/v2/${mtId}/status`);
        const isPaid = ["capture","settlement"].includes(mtStatus.transaction_status);
        if (isPaid) {
          // Auto-update local state
          tx.paid = true;
          tx.status = mtStatus.transaction_status;
          transactions.set(mtId, tx);
          const orderIdx = orders.findIndex(o => o.id === internalOrderId);
          if (orderIdx >= 0) {
            orders[orderIdx].paymentStatus = "paid";
            orders[orderIdx].paymentMethod = mtStatus.payment_type || "gopay";
          }
          broadcast("payment:confirmed", { orderId: internalOrderId, paid: true });
          // P4A — webhook
          const _o = orders.find(o => o.id === internalOrderId);
          if (typeof global.emitWebhook === 'function' && _o?.company_id) {
            global.emitWebhook(_o.company_id, 'payment.completed', {
              order_id: internalOrderId, amount: _o.total, method: mtStatus.payment_type || 'gopay',
              gateway: 'midtrans', paid_at: Date.now(),
            });
          }
          console.log(`✅ Auto-confirmed payment for order ${internalOrderId}`);
          return res.json({ ok: true, paid: true, status: mtStatus.transaction_status, midtransOrderId: mtId });
        }
      } catch(e) { /* Midtrans check failed - use local state */ }

      return res.json({ ok: true, paid: false, status: tx.status, midtransOrderId: mtId });
    }
  }

  // Not found in transactions yet — check orders for paymentStatus
  const order = orders.find(o => o.id === internalOrderId);
  if (order?.paymentStatus === "paid") {
    return res.json({ ok: true, paid: true, status: "settlement" });
  }
  res.json({ ok: true, paid: false, status: "pending" });
});
// POST /api/payment/gopay — create GoPay transaction (returns QR + deeplink)
app.post("/api/payment/gopay", async (req, res) => {
  const { orderId, amount, items, customerName } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required" });
  if (!midtransConfig.serverKey) return res.status(503).json({ error: "Midtrans server key not configured" });

  try {
    const midtransOrderId = `KaryaOS-${orderId}-${Date.now()}`;
    const payload = {
      payment_type: "gopay",
      transaction_details: {
        order_id:     midtransOrderId,
        gross_amount: Math.round(amount),
      },
      gopay: {
        enable_callback: false,
      },
      customer_details: {
        first_name: customerName || "Customer",
        email:      "customer@example.com",
      },
    };

    const result = await midtransRequest("POST", "/v2/charge", payload);
    console.log(`💳 GoPay charge — ${midtransOrderId} — Rp ${amount.toLocaleString()}`);

    const qrUrl       = result.actions?.find(a => a.name === "generate-qr-code")?.url || "";
    const deeplinkUrl = result.actions?.find(a => a.name === "deeplink-redirect")?.url || "";

    const txEntry = {
      internalOrderId: orderId,
      midtransOrderId,
      transactionId:   result.transaction_id,
      status:          result.transaction_status,
      qrUrl,
      deeplinkUrl,
      amount,
      createdAt:       Date.now(),
    };
    transactions.set(midtransOrderId, txEntry);

    res.json({
      ok:              true,
      midtransOrderId,
      transactionId:   result.transaction_id,
      qrUrl,
      deeplinkUrl,
      status:          result.transaction_status,
      expiryTime:      result.expiry_time,
    });
  } catch (e) {
    console.error("GoPay charge error:", e.message);
    res.status(500).json({ error: e.message });
  }
});
// GET /api/payment/status/:orderId — poll transaction status
app.get("/api/payment/status/:orderId", async (req, res) => {
  const { orderId } = req.params;
  // Find midtrans order id from our mapping
  let mtOrderId = orderId;
  for (const [k, v] of transactions.entries()) {
    if (v.internalOrderId === orderId) { mtOrderId = k; break; }
  }
  try {
    const result = await midtransRequest("GET", `/v2/${mtOrderId}/status`);
    const tx = transactions.get(mtOrderId);
    if (tx) {
      tx.status = result.transaction_status;
      transactions.set(mtOrderId, tx);
    }
    const paid = ["capture","settlement"].includes(result.transaction_status);
    res.json({
      ok:     true,
      status: result.transaction_status,
      paid,
      paymentType: result.payment_type,
      transactionTime: result.transaction_time,
      grossAmount: result.gross_amount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/payment/webhook — Midtrans notification handler
app.post("/api/payment/webhook", async (req, res) => {
  const notif = req.body;
  console.log(`🔔 Midtrans webhook: ${notif.order_id} → ${notif.transaction_status}`);

  const tx = transactions.get(notif.order_id);
  const paid = ["capture","settlement"].includes(notif.transaction_status);
  const failed = ["deny","cancel","expire","failure"].includes(notif.transaction_status);

  if (tx) {
    tx.status = notif.transaction_status;
    tx.paid = paid;
    transactions.set(notif.order_id, tx);

    // Update order status
    const orderIdx = orders.findIndex(o => o.id === tx.internalOrderId);
    if (orderIdx >= 0 && paid) {
      orders[orderIdx].paymentStatus = "paid";
      orders[orderIdx].paymentMethod = notif.payment_type || "qris";
      broadcast("payment:confirmed", {
        orderId:    tx.internalOrderId,
        midtransId: notif.order_id,
        status:     notif.transaction_status,
        paid,
      });
    }
  }

  // ── CINEMA WEB BOOKING webhook routing ────────────────────────────────
  // order_id format: CINEMA-{purchase_id}-{timestamp} (created in cinema-snap endpoint)
  // Match payment_ref column (set when Snap created) to update tickets.
  if (notif.order_id && notif.order_id.startsWith("CINEMA-")) {
    try {
      const newStatus = paid ? "paid" : failed ? "failed" : "pending_payment";
      const paidAt = paid ? Math.floor(Date.now() / 1000) : null;
      const result = db.rawDb.prepare(`
        UPDATE cinema_tickets
        SET payment_status = ?, paid_at = COALESCE(?, paid_at), payment_method = ?
        WHERE payment_ref = ?
      `).run(newStatus, paidAt, notif.payment_type || "snap", notif.order_id);
      if (result.changes > 0) {
        console.log(`🎬 Cinema payment update: ${notif.order_id} → ${newStatus} (${result.changes} tickets)`);
        broadcast("cinema:payment", {
          order_id: notif.order_id,
          status: newStatus,
          paid,
          payment_type: notif.payment_type,
        });
      } else {
        console.warn(`⚠ Cinema webhook ${notif.order_id} matched no tickets`);
      }
    } catch (e) {
      console.error("❌ Cinema webhook update failed:", e.message);
      // Important: still return 200 so Midtrans doesn't retry indefinitely.
      // Defense: GET /api/cinema/purchase/:id/status lets frontend poll as fallback.
    }
  }

  res.json({ status: "ok" });
});

// GET /api/payment/config — get Midtrans client key (safe to expose)

// ─── PAYMENT METHODS CONFIG ────────────────────────────────────────────────
// Defaults from ENV, persisted to disk so admin can toggle without restart
const PAYMENT_METHODS_FILE = path.join(__dirname, 'payment-methods.json');

function loadPaymentMethods() {
  // Default from env (or both true)
  const defaults = {
    cash: process.env.PAYMENT_CASH_ENABLED !== "false",
    qris: process.env.PAYMENT_QRIS_ENABLED !== "false",
  };
  try {
    if (fs.existsSync(PAYMENT_METHODS_FILE)) {
      const persisted = JSON.parse(fs.readFileSync(PAYMENT_METHODS_FILE, 'utf-8'));
      return { ...defaults, ...persisted };
    }
  } catch (e) {
    console.warn("⚠️  payment-methods.json corrupt, using env defaults:", e.message);
  }
  return defaults;
}

function savePaymentMethods(methods) {
  fs.writeFileSync(PAYMENT_METHODS_FILE, JSON.stringify(methods, null, 2));
}

let paymentMethods = loadPaymentMethods();
console.log(`💳 Payment methods enabled:`, Object.entries(paymentMethods).filter(([,v])=>v).map(([k])=>k).join(", ") || "NONE");

// GET current state
app.get("/api/payment/methods", (req, res) => {
  res.json(paymentMethods);
});

// PATCH toggle (admin only - requireAdmin should be applied but for now open)
app.patch("/api/payment/methods", requireAdmin, (req, res) => {
  const updates = req.body || {};
  const validKeys = ["cash", "qris"];
  for (const key of Object.keys(updates)) {
    if (!validKeys.includes(key)) {
      return res.status(400).json({ error: `Invalid payment method: ${key}` });
    }
    paymentMethods[key] = Boolean(updates[key]);
  }
  savePaymentMethods(paymentMethods);
  broadcast("payment:methods", paymentMethods);
  console.log(`💳 Payment methods updated:`, paymentMethods);
  res.json({ ok: true, methods: paymentMethods });
});


app.get("/api/payment/config", (req, res) => {
  res.json({
    clientKey:    midtransConfig.clientKey,
    isProduction: midtransConfig.isProduction,
    configured:   !!midtransConfig.serverKey,
    snapUrl:      midtransConfig.isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js",
  });
});

// POST /api/payment/midtrans-config — update keys at runtime
app.post("/api/payment/midtrans-config", requireAdmin, (req, res) => {
  const { serverKey, clientKey, isProduction } = req.body;
  if (serverKey)    midtransConfig.serverKey    = serverKey;
  if (clientKey)    midtransConfig.clientKey    = clientKey;
  if (isProduction !== undefined) midtransConfig.isProduction = Boolean(isProduction);
  console.log(`⚙️  Midtrans config updated — production:${midtransConfig.isProduction}`);
  res.json({ ok: true, isProduction: midtransConfig.isProduction, configured: !!midtransConfig.serverKey });
});

// In-memory transaction store
const transactions = new Map();



// ─── ADMIN AUTH MIDDLEWARE ────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const session = adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Invalid or expired session" });
  req.admin = session;
  next();
}

// Optional: apply to sensitive admin routes only
// app.use("/api/menu", requireAdmin);
// app.use("/api/promo", requireAdmin);
// app.use("/api/customers", requireAdmin);
// (Uncomment above when ready for production auth enforcement)

// ─── ADMIN AUTH (Enterprise: username+password + legacy PIN fallback) ───
// Password: scrypt(password, salt, 64). Lockout 15 min after 5 fails.
// Session token: 32-byte random hex, valid 12 jam.
const crypto = require("crypto");
const SCRYPT_KEYLEN = 64, SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const LOCKOUT_THRESHOLD = 5, LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(password, s, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  return { hash: h, salt: s };
}
function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  try {
    const test = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(test, "hex"), Buffer.from(hash, "hex"));
  } catch { return false; }
}

let adminUsers = db.loadAllAdminUsers();
// Seed default super-admin with username/password kalau belum ada
if (!adminUsers.find(u => u.username === "admin")) {
  const pwd = hashPassword("admin123");
  const seedAdmin = {
    id: adminUsers.length ? `U${String(adminUsers.length + 1).padStart(3, "0")}` : "U001",
    name: "Super Admin", username: "admin", email: "admin@karys.tech",
    pin: "999999", role: "super-admin", active: true,
    password_hash: pwd.hash, password_salt: pwd.salt,
    password_changed_at: Math.floor(Date.now() / 1000),
    must_change_password: 1,   // ⚠️ force change on first login
    createdAt: Date.now(),
  };
  db.insertAdminUser(seedAdmin);
  adminUsers = db.loadAllAdminUsers();
  console.log(`🔐 Seeded enterprise admin → username='admin' password='admin123' (MUST CHANGE on first login)`);
}

// SECURITY WARNING: cek super-admin user yg masih pakai PIN/password default
try {
  const weakDefaults = adminUsers.filter(u =>
    (u.role === 'super-admin' || u.username === 'admin') &&
    (u.pin === '999999' || u.pin === '000000' || u.pin === '123456')
  );
  if (weakDefaults.length > 0) {
    console.warn(`⚠️  SECURITY WARNING: ${weakDefaults.length} super-admin user(s) masih pakai PIN default. Wajib ganti via Admin > User Management:`);
    weakDefaults.forEach(u => console.warn(`   - ${u.name} (${u.username || u.id}) PIN: ${u.pin}`));
  }
} catch {}
// Legacy PIN seeds for backward compatibility (POS kasir quick-login)
if (adminUsers.filter(u => u.pin && !u.username).length === 0 && adminUsers.length <= 1) {
  const legacy = [
    { id: "U002", name: "Kasir 1", pin: "111111", role: "kasir", active: true, createdAt: Date.now() },
    { id: "U003", name: "Kasir 2", pin: "222222", role: "kasir", active: true, createdAt: Date.now() },
  ];
  legacy.forEach(u => db.insertAdminUser(u));
  adminUsers = db.loadAllAdminUsers();
  console.log(`🔐 Seeded legacy PIN users (kasir quick-login: 111111 / 222222)`);
}

// Persist sessions to DB so survives backend restart (PM2 restart, deploy)
// Hybrid: Map cache + SQLite write-through
try {
  db.rawDb.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions_persist (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT, role TEXT,
      company_id INTEGER, is_super_admin INTEGER DEFAULT 0,
      login_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      ip TEXT, last_seen_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sess_exp ON admin_sessions_persist(expires_at);
  `);
} catch (e) { console.error('[sessions] create table:', e.message); }

const _sessionDb = {
  upsert: (token, s) => {
    try {
      db.rawDb.prepare(`INSERT OR REPLACE INTO admin_sessions_persist
        (token, user_id, name, role, company_id, is_super_admin, login_at, expires_at, ip, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now')*1000)`).run(
          token, s.userId, s.name || null, s.role || null,
          s.company_id ?? null, s.is_super_admin ? 1 : 0,
          s.loginAt, s.expiresAt, s.ip || null);
    } catch (e) { /* silent — Map still works as cache */ }
  },
  delete: (token) => { try { db.rawDb.prepare(`DELETE FROM admin_sessions_persist WHERE token = ?`).run(token); } catch {} },
  loadValid: () => {
    try {
      return db.rawDb.prepare(`SELECT * FROM admin_sessions_persist WHERE expires_at > ?`).all(Date.now());
    } catch { return []; }
  },
  purgeExpiredDb: () => { try { db.rawDb.prepare(`DELETE FROM admin_sessions_persist WHERE expires_at < ?`).run(Date.now()); } catch {} },
};

const adminSessions = new Map(); // token → { userId, role, loginAt, expiresAt }
// Expose untuk modules lain (cinema-backend dll) bisa cek session manually
// untuk per-outlet scope filtering tanpa harus requireSession middleware
global.adminSessions = adminSessions;
// Helper untuk modules — derive outlet_code dari session token di Authorization header.
// Returns null kalau no session, atau outlet_code dari user record kalau bound.
global.getSessionOutlet = (req) => {
  try {
    const token = req.headers?.authorization?.replace(/^Bearer\s+/i, '');
    const session = token && adminSessions.get(token);
    if (!session) return { outletCode: null, role: null, isHQ: true };
    const role = String(session.role || '').toLowerCase();
    if (['super-admin','superadmin','admin','owner'].includes(role)) return { outletCode: null, role, isHQ: true };
    const u = db.rawDb.prepare(`SELECT outlet_code FROM admin_users WHERE id = ?`).get(session.userId);
    const outletCode = u?.outlet_code || null;
    return { outletCode, role, isHQ: !outletCode };
  } catch { return { outletCode: null, role: null, isHQ: true }; }
};

// Resolve display name dari session token — dipakai utk attribution (closed_by, dll).
// Return: string nama atau null kalau gak ada session valid.
global.getSessionUserName = (req) => {
  try {
    const token = req.headers?.authorization?.replace(/^Bearer\s+/i, '');
    const s = token && adminSessions.get(token);
    return s?.name || s?.username || null;
  } catch { return null; }
};
// Load valid sessions from DB at startup (survive restart)
try {
  const rows = _sessionDb.loadValid();
  rows.forEach(r => {
    adminSessions.set(r.token, {
      userId: r.user_id, name: r.name, role: r.role,
      company_id: r.company_id ?? null, is_super_admin: !!r.is_super_admin,
      loginAt: r.login_at, expiresAt: r.expires_at, ip: r.ip,
    });
  });
  if (rows.length > 0) console.log(`🔐 Restored ${rows.length} active session(s) from DB`);
} catch (e) { console.error('[sessions] restore:', e.message); }

// Wrap original Map methods utk write-through ke DB
const _origSet = adminSessions.set.bind(adminSessions);
const _origDelete = adminSessions.delete.bind(adminSessions);
adminSessions.set = (token, value) => { _sessionDb.upsert(token, value); return _origSet(token, value); };
adminSessions.delete = (token) => { _sessionDb.delete(token); return _origDelete(token); };

let twoFA = null;                 // P3D — set later by setup2FA(); login handler reads at request-time
function genToken() { return crypto.randomBytes(32).toString("hex"); }
function purgeExpired() {
  const now = Date.now();
  for (const [t, s] of adminSessions) if (s.expiresAt < now) adminSessions.delete(t);
  _sessionDb.purgeExpiredDb();
}
function clientIp(req) { return (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().split(",")[0].trim(); }

// ── Enterprise login: username + password ─────────────────────────────
app.post("/api/auth/login-password", (req, res) => {
  const { username, password } = req.body || {};
  const ip = clientIp(req); const ua = req.headers["user-agent"] || "";
  if (!username || !password) {
    db.logLoginAttempt({ username, ip, user_agent: ua, method: "password", success: 0, error: "missing fields" });
    return res.status(400).json({ error: "Username dan password wajib diisi" });
  }
  adminUsers = db.loadAllAdminUsers();
  const user = adminUsers.find(u => u.username && u.username.toLowerCase() === String(username).toLowerCase() && u.active);
  if (!user) {
    db.logLoginAttempt({ username, ip, user_agent: ua, method: "password", success: 0, error: "user not found" });
    return res.status(401).json({ error: "Username atau password salah" });
  }
  // Lockout check
  if (user.locked_until && user.locked_until > Date.now()) {
    const mins = Math.ceil((user.locked_until - Date.now()) / 60000);
    db.logLoginAttempt({ user_id: user.id, username, ip, user_agent: ua, method: "password", success: 0, error: `locked: ${mins}m` });
    return res.status(423).json({ error: `Akun terkunci. Coba lagi dalam ${mins} menit.` });
  }
  if (!verifyPassword(password, user.password_hash, user.password_salt)) {
    const failed = (user.failed_login_count || 0) + 1;
    const locked = failed >= LOCKOUT_THRESHOLD ? Date.now() + LOCKOUT_DURATION_MS : null;
    db.insertAdminUser({ ...user, failed_login_count: failed, locked_until: locked });
    db.logLoginAttempt({ user_id: user.id, username, ip, user_agent: ua, method: "password", success: 0, error: "wrong password" });
    if (locked) return res.status(423).json({ error: `Akun dikunci 15 menit setelah ${LOCKOUT_THRESHOLD} gagal login.` });
    return res.status(401).json({ error: `Username atau password salah (sisa ${LOCKOUT_THRESHOLD - failed}× sebelum dikunci)` });
  }
  // Password OK — check 2FA gate (P3D)
  if (twoFA && twoFA.userHas2FA(user.id)) {
    const otpToken = twoFA.createPendingToken(user.id);
    db.logLoginAttempt({ user_id: user.id, username, ip, user_agent: ua, method: "password", success: 1, error: "awaiting_2fa" });
    return res.json({ ok: true, requires_2fa: true, otp_token: otpToken });
  }
  // Success — no 2FA, issue session directly
  const token = genToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  // Multi-tenant: resolve company info dari user.company_id
  const companyInfo = resolveCompanyForUser(user);
  adminSessions.set(token, {
    userId: user.id, name: user.name, role: user.role,
    company_id: user.company_id ?? null, is_super_admin: user.company_id == null,
    loginAt: Date.now(), expiresAt, ip,
  });
  db.insertAdminUser({ ...user, failed_login_count: 0, locked_until: null, last_login_at: Math.floor(Date.now() / 1000), last_login_ip: ip });
  db.logLoginAttempt({ user_id: user.id, username, ip, user_agent: ua, method: "password", success: 1 });
  console.log(`🔐 Enterprise login: ${user.name} (@${user.username}, ${user.role}, company=${companyInfo?.code || 'KARYS'}) from ${ip}`);
  res.json({
    ok: true, token,
    force_pin_change: isWeakPin(user.pin),  // SECURITY: force ganti kalau PIN weak
    user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role,
            must_change_password: !!user.must_change_password, last_login_at: user.last_login_at,
            company_id: user.company_id ?? null, is_super_admin: user.company_id == null,
            vertical: user.vertical || null },
    company: companyInfo,  // {id, code, name, primary_vertical, brand_color} atau null untuk super-admin
    expiresAt,
  });
});

// ── 2FA verification — exchange otp_token + code for real session ─────
app.post("/api/auth/verify-2fa", (req, res) => {
  const { otp_token, code } = req.body || {};
  const ip = clientIp(req); const ua = req.headers["user-agent"] || "";
  if (!otp_token || !code) return res.status(400).json({ error: "otp_token dan code wajib diisi" });
  if (!twoFA) return res.status(500).json({ error: "2FA module not initialized" });
  const userId = twoFA.consumePendingToken(otp_token);
  if (!userId) return res.status(401).json({ error: "Sesi 2FA kedaluwarsa, login ulang" });
  if (!twoFA.verifyForUser(userId, code)) {
    db.logLoginAttempt({ user_id: userId, ip, user_agent: ua, method: "2fa", success: 0, error: "wrong code" });
    return res.status(401).json({ error: "Kode 2FA salah" });
  }
  adminUsers = db.loadAllAdminUsers();
  const user = adminUsers.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
  const token = genToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const companyInfo = resolveCompanyForUser(user);
  adminSessions.set(token, {
    userId: user.id, name: user.name, role: user.role,
    company_id: user.company_id ?? null, is_super_admin: user.company_id == null,
    loginAt: Date.now(), expiresAt, ip,
  });
  db.insertAdminUser({ ...user, failed_login_count: 0, locked_until: null, last_login_at: Math.floor(Date.now() / 1000), last_login_ip: ip });
  db.logLoginAttempt({ user_id: user.id, username: user.username, ip, user_agent: ua, method: "2fa", success: 1 });
  console.log(`🔐 2FA login: ${user.name} (@${user.username}, ${user.role}) from ${ip}`);
  res.json({
    ok: true, token,
    user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role,
            must_change_password: !!user.must_change_password, last_login_at: user.last_login_at,
            company_id: user.company_id ?? null, is_super_admin: user.company_id == null },
    company: companyInfo,
    expiresAt,
  });
});

// Helper untuk resolve company info (dipakai semua login endpoint)
function resolveCompanyForUser(user) {
  if (!user || user.company_id == null) return null; // super-admin
  try {
    const row = db.rawDb.prepare(`SELECT id, code, name, primary_vertical, brand_color, logo_url FROM companies WHERE id = ?`).get(user.company_id);
    return row || null;
  } catch { return null; }
}

// ── Change password (require existing session + current password) ─────
app.post("/api/auth/change-password", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const { current_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: "Password baru minimum 8 karakter" });
  if (!/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/[0-9]/.test(new_password)) {
    return res.status(400).json({ error: "Password harus mengandung huruf besar, huruf kecil, dan angka" });
  }
  adminUsers = db.loadAllAdminUsers();
  const user = adminUsers.find(u => u.id === session.userId);
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
  // If user has existing password, verify current; if first-time set (must_change), allow without
  if (user.password_hash && !user.must_change_password) {
    if (!verifyPassword(current_password || "", user.password_hash, user.password_salt)) {
      return res.status(401).json({ error: "Password lama salah" });
    }
  }
  const { hash, salt } = hashPassword(new_password);
  db.insertAdminUser({ ...user, password_hash: hash, password_salt: salt,
    password_changed_at: Math.floor(Date.now() / 1000), must_change_password: 0 });
  console.log(`🔐 Password changed: ${user.name} (@${user.username || user.id})`);
  res.json({ ok: true });
});

// ── Set password (admin sets for another user) ────────────────────────
app.post("/api/auth/users/:id/set-password", requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session || !["super-admin", "owner"].includes(session.role)) return res.status(403).json({ error: "Hanya super-admin/owner yang boleh reset password" });
  const { password, force_change = true } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: "Password minimum 8 karakter" });
  adminUsers = db.loadAllAdminUsers();
  const user = adminUsers.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
  const { hash, salt } = hashPassword(password);
  db.insertAdminUser({ ...user, password_hash: hash, password_salt: salt,
    password_changed_at: Math.floor(Date.now() / 1000),
    must_change_password: force_change ? 1 : 0,
    failed_login_count: 0, locked_until: null });
  console.log(`🔐 Password reset by ${session.name} for ${user.name}`);
  res.json({ ok: true });
});

// ── Login audit (for super-admin) ─────────────────────────────────────
app.get("/api/auth/audit", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session || !["super-admin", "owner"].includes(session.role)) return res.status(403).json({ error: "Forbidden" });
  res.json({ audit: db.recentLoginAudit(parseInt(req.query.limit, 10) || 100) });
});

// ── Legacy PIN login (POS kasir quick-access) — kept for backward compat
app.post("/api/auth/login", (req, res) => {
  purgeExpired();
  const { pin } = req.body;
  const ip = clientIp(req); const ua = req.headers["user-agent"] || "";
  if (!pin) return res.status(400).json({ error: "PIN required" });
  adminUsers = db.loadAllAdminUsers();
  const user = adminUsers.find(u => u.pin === pin && u.active);
  if (!user) {
    db.logLoginAttempt({ ip, user_agent: ua, method: "pin", success: 0, error: "pin not found" });
    return res.status(401).json({ error: "PIN salah" });
  }
  const token = genToken();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  // Multi-tenant: company info for kasir/manager PIN login
  const companyInfo = resolveCompanyForUser(user);
  adminSessions.set(token, {
    userId: user.id, name: user.name, role: user.role,
    company_id: user.company_id ?? null, is_super_admin: user.company_id == null,
    loginAt: Date.now(), expiresAt, ip,
  });

  // Fase 5 — "Membangun dari 0". Catat kapan kasir pertama login.
  // Setelah ini, sistem tahu "hari ke berapa dia bekerja" dan bisa
  // menyesuaikan ritual + KPI utk yg masih awal perjalanannya.
  const isFirstLogin = !user.first_login_at;
  const nowSec = Math.floor(Date.now() / 1000);
  if (isFirstLogin) {
    user.first_login_at = nowSec;
    try { db.insertAdminUser({ ...user, last_login_at: nowSec, last_login_ip: ip }); } catch {}
    console.log(`🌱 HARI PERTAMA: ${user.name} (${user.role}) — selamat datang.`);
  } else {
    try { db.insertAdminUser({ ...user, last_login_at: nowSec, last_login_ip: ip }); } catch {}
  }

  db.logLoginAttempt({ user_id: user.id, username: user.username, ip, user_agent: ua, method: "pin", success: 1 });
  console.log(`🔐 PIN Login: ${user.name} (${user.role}, company=${companyInfo?.code || 'KARYS'})`);
  res.json({
    ok: true, token, name: user.name, role: user.role,
    must_change_password: !!user.must_change_password,
    force_pin_change: isWeakPin(user.pin),  // SECURITY: force ganti kalau PIN weak
    is_first_login: isFirstLogin,
    needs_welcome: !user.onboarded_at,
    user: { id: user.id, name: user.name, role: user.role,
            company_id: user.company_id ?? null, is_super_admin: user.company_id == null,
            vertical: user.vertical || null,
            outlet_code: user.outlet_code || null,
            first_login_at: user.first_login_at,
            onboarded_at:   user.onboarded_at },
    company: companyInfo,
  });
});

// Fase 5 — onboarded marker. Frontend POST setelah selesai WelcomeRitual.
app.post("/api/auth/onboarded", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const u = adminUsers.find(x => x.id === session.userId);
  if (!u) return res.status(404).json({ error: "User not found" });
  u.onboarded_at = Math.floor(Date.now() / 1000);
  try { db.insertAdminUser(u); } catch {}
  res.json({ ok: true, onboarded_at: u.onboarded_at });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ","");
  if (token) adminSessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ","");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const user = adminUsers.find(u => u.id === session.userId);
  // Refresh company info (kalau company berubah primary_vertical/brand)
  const companyInfo = user ? resolveCompanyForUser(user) : null;

  // Fase 5 continuity — tambah journey context utk admin/owner.
  // Filosofi karyaOS: setiap pengguna pulang ke rumah karyaOS, sistem
  // ingat kapan terakhir mereka di sini dan hari ke berapa di perjalanan.
  let journey = null;
  if (user) {
    const sessStartSec = Math.floor((session.loginAt || Date.now()) / 1000);
    let prevLoginAt = null;
    try {
      // Cari last successful login SEBELUM session ini di-create.
      // Filter created_at < session start supaya gak return login session sekarang.
      const r = db.rawDb.prepare(`
        SELECT created_at FROM admin_login_audit
        WHERE user_id = ? AND success = 1 AND created_at < ?
        ORDER BY created_at DESC LIMIT 1
      `).get(user.id, sessStartSec);
      prevLoginAt = r?.created_at || null;
    } catch {}

    const firstLoginAt = user.first_login_at || null;
    const nowSec = Math.floor(Date.now() / 1000);
    const day = firstLoginAt ? (Math.floor((nowSec - firstLoginAt) / 86400) + 1) : null;

    journey = {
      first_login_at: firstLoginAt,
      previous_login_at: prevLoginAt,
      day,
      is_first_session: !prevLoginAt,
    };
  }

  res.json({ ...session, pin: undefined, company: companyInfo, journey });
});

// Helper: resolve scope (super-admin atau tenant) untuk auth endpoints
function _authScope(req) {
  // companyScope dipasang oleh setupCompanies middleware
  const sc = req.companyScope || {};
  return { isSuperAdmin: !!sc.is_super_admin, companyId: sc.company_id ?? null };
}

app.get("/api/auth/users", (req, res) => {
  const { isSuperAdmin, companyId } = _authScope(req);
  adminUsers = db.loadAllAdminUsers();
  const now = Date.now();
  // Multi-tenant: tenant only sees own company users. Super-admin sees all.
  const visible = isSuperAdmin
    ? adminUsers
    : adminUsers.filter(u => u.company_id === companyId);
  res.json(visible.map(u => ({
    ...u, pin: "••••••",
    password_hash: undefined, password_salt: undefined,
    is_locked: !!(u.locked_until && u.locked_until > now),
    locked_until_ms: u.locked_until || null,
    lock_remaining_min: u.locked_until && u.locked_until > now ? Math.ceil((u.locked_until - now) / 60000) : 0,
  })));
});

app.post("/api/auth/users", requireAdmin, (req, res) => {
  const { isSuperAdmin, companyId } = _authScope(req);
  const { name, pin, role, vertical, outlet_code } = req.body;
  if (!name || !pin || !role) return res.status(400).json({ error: "name, pin, role required" });
  if (pin.length !== 6) return res.status(400).json({ error: "PIN harus 6 digit" });
  // Multi-tenant guard: tenant gak boleh bikin role super-admin
  if (!isSuperAdmin && (role === "super-admin" || role === "superadmin")) {
    return res.status(403).json({ error: "Tidak boleh assign role super-admin" });
  }
  // Multi-tenant: auto-tag company_id
  const targetCompanyId = isSuperAdmin
    ? (req.body.company_id != null ? Number(req.body.company_id) : null)
    : companyId;
  // Validate vertical
  let v = vertical || null;
  if (v && !['fnb', 'cinema', 'hybrid'].includes(v)) v = null;
  const user = {
    id: `U${String(adminUsers.length+1).padStart(3,"0")}`,
    name, pin, role, active: true, company_id: targetCompanyId,
    vertical: v, outlet_code: outlet_code || null,
  };
  adminUsers.push(user);
  db.insertAdminUser(user);
  res.status(201).json({ ...user, pin: "••••••" });
});

app.patch("/api/auth/users/:id", requireAdmin, (req, res) => {
  const { isSuperAdmin, companyId } = _authScope(req);
  const idx = adminUsers.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  // Multi-tenant guard: tenant cuma boleh edit user dari company sama
  if (!isSuperAdmin && adminUsers[idx].company_id !== companyId) {
    return res.status(403).json({ error: "Tidak punya akses user ini" });
  }
  const { name, pin, role, active, vertical, outlet_code, birth_date } = req.body;
  // Guard: tenant gak boleh ubah ke super-admin
  if (!isSuperAdmin && (role === "super-admin" || role === "superadmin")) {
    return res.status(403).json({ error: "Tidak boleh assign role super-admin" });
  }
  if (name) adminUsers[idx].name = name;
  if (pin) {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "PIN harus 6 digit angka" });
    }
    if (isWeakPin(pin)) {
      return res.status(400).json({ error: "PIN terlalu lemah (hindari 999999, 123456, sequential, atau pengulangan)" });
    }
    adminUsers[idx].pin = pin;
  }
  if (role) adminUsers[idx].role = role;
  if (active !== undefined) adminUsers[idx].active = Boolean(active);
  // Vertical filter — fnb|cinema|hybrid|null
  if (vertical !== undefined) {
    if (vertical === null || vertical === "") {
      adminUsers[idx].vertical = null;  // inherit company
    } else if (['fnb', 'cinema', 'hybrid'].includes(vertical)) {
      adminUsers[idx].vertical = vertical;
    } else {
      return res.status(400).json({ error: "Vertical harus salah satu: fnb, cinema, hybrid, atau kosong (inherit company)" });
    }
  }
  // Outlet binding — set/clear outlet_code per user
  if (outlet_code !== undefined) {
    adminUsers[idx].outlet_code = outlet_code || null;
  }
  // Birth date — utk birthday recognition. Format YYYY-MM-DD.
  if (birth_date !== undefined) {
    // Validate format kalau ada nilai
    if (birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(birth_date)) {
      return res.status(400).json({ error: "Tanggal lahir harus format YYYY-MM-DD" });
    }
    adminUsers[idx].birth_date = birth_date || null;
  }
  db.insertAdminUser(adminUsers[idx]); // persist
  res.json({ ...adminUsers[idx], pin: "••••••" });
});

// POST /api/auth/change-pin — user ganti PIN sendiri (force-change flow)
// Body: { current_pin, new_pin } — verify current sebelum set new
app.post("/api/auth/change-pin", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  const { current_pin, new_pin } = req.body || {};
  if (!current_pin || !new_pin) return res.status(400).json({ error: "current_pin & new_pin wajib" });
  if (!/^\d{6}$/.test(new_pin)) return res.status(400).json({ error: "PIN baru harus 6 digit angka" });
  if (isWeakPin(new_pin)) return res.status(400).json({ error: "PIN terlalu lemah — hindari pengulangan, sequential, atau pattern umum" });

  adminUsers = db.loadAllAdminUsers();
  const idx = adminUsers.findIndex(u => u.id === session.userId);
  if (idx === -1) return res.status(404).json({ error: "User not found" });
  // Verify current PIN
  if (adminUsers[idx].pin !== current_pin) {
    return res.status(403).json({ error: "PIN lama salah" });
  }
  if (current_pin === new_pin) return res.status(400).json({ error: "PIN baru harus beda dari yg lama" });
  adminUsers[idx].pin = new_pin;
  db.insertAdminUser(adminUsers[idx]);
  console.log(`🔐 PIN changed for ${adminUsers[idx].name} (${adminUsers[idx].id})`);
  res.json({ ok: true });
});

// PIN weakness check — block common bad PINs
function isWeakPin(pin) {
  if (!pin || pin.length !== 6) return true;
  const WEAK_LIST = ['000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
                     '123456','234567','345678','456789','567890','654321','987654','012345','098765',
                     '121212','123123','456456','789789','111222','222333'];
  if (WEAK_LIST.includes(pin)) return true;
  // All same digit
  if (/^(.)\1+$/.test(pin)) return true;
  // Sequential ascending/descending
  let asc = true, desc = true;
  for (let i = 1; i < pin.length; i++) {
    if (parseInt(pin[i]) !== parseInt(pin[i-1]) + 1) asc = false;
    if (parseInt(pin[i]) !== parseInt(pin[i-1]) - 1) desc = false;
  }
  if (asc || desc) return true;
  return false;
}

app.delete("/api/auth/users/:id", requireAdmin, (req, res) => {
  const { isSuperAdmin, companyId } = _authScope(req);
  const user = adminUsers.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!isSuperAdmin && user.company_id !== companyId) {
    return res.status(403).json({ error: "Tidak punya akses user ini" });
  }
  // Guard: jangan delete diri sendiri (yang lagi login)
  const sc = req.companyScope || {};
  if (sc.user_id === req.params.id) return res.status(400).json({ error: "Tidak boleh delete akun sendiri" });
  db.deleteAdminUser(req.params.id);
  adminUsers = adminUsers.filter(u => u.id !== req.params.id);
  res.json({ ok: true });
});

// Unlock a locked account — clears failed_login_count + locked_until.
// Multi-tenant: tenant scope hanya bisa unlock user-nya sendiri.
app.post("/api/auth/users/:id/unlock", requireAdmin, (req, res) => {
  const { isSuperAdmin, companyId } = _authScope(req);
  adminUsers = db.loadAllAdminUsers();
  const user = adminUsers.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!isSuperAdmin && user.company_id !== companyId) {
    return res.status(403).json({ error: "Tidak punya akses user ini" });
  }
  db.insertAdminUser({ ...user, failed_login_count: 0, locked_until: null });
  adminUsers = db.loadAllAdminUsers();
  db.logLoginAttempt({ user_id: user.id, username: user.username || user.name, method: "unlock", success: 1, error: "admin unlock" });
  res.json({ ok: true, unlocked: user.id, name: user.name });
});

// Unlock ALL locked accounts — super-admin emergency button (cross-tenant).
// Tenant scope: scoped to own company.
app.post("/api/auth/users/unlock-all", requireAdmin, (req, res) => {
  const { isSuperAdmin, companyId } = _authScope(req);
  adminUsers = db.loadAllAdminUsers();
  let locked = adminUsers.filter(u => u.locked_until || u.failed_login_count > 0);
  if (!isSuperAdmin) locked = locked.filter(u => u.company_id === companyId);
  for (const u of locked) {
    db.insertAdminUser({ ...u, failed_login_count: 0, locked_until: null });
  }
  adminUsers = db.loadAllAdminUsers();
  res.json({ ok: true, unlocked_count: locked.length, unlocked: locked.map(u => u.name) });
});

// ─── FORGOT PASSWORD FLOW (proper, email-verified) ────────────────────
// Schema: password_reset_tokens (lazy-create on first use)
try {
  db.rawDb.exec(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    requested_ip TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
} catch {}

// POST /api/auth/forgot-password — { username|email } → kirim email reset
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { username, email } = req.body || {};
    if (!username && !email) return res.status(400).json({ error: "Username atau email wajib" });
    adminUsers = db.loadAllAdminUsers();
    // Lookup by username OR email (case-insensitive)
    const id = String(username || email || "").toLowerCase();
    const user = adminUsers.find(u =>
      (u.username && u.username.toLowerCase() === id) ||
      (u.email && u.email.toLowerCase() === id)
    );
    // ALWAYS return success (anti enumeration) — kalau user gak ada, just log + return
    if (!user || !user.email) {
      console.log(`[forgot-pwd] no user/email for '${id}' (anti-enumeration, returning ok)`);
      return res.json({ ok: true, message: "Kalau email terdaftar, link reset sudah dikirim." });
    }
    // Generate token (32 bytes hex) + expire 30 min
    const token = require("crypto").randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 30 * 60 * 1000;
    db.rawDb.prepare(`INSERT INTO password_reset_tokens (token, user_id, email, expires_at, requested_ip) VALUES (?,?,?,?,?)`)
      .run(token, user.id, user.email, expiresAt, req.ip || req.headers["x-forwarded-for"] || "");
    const baseUrl = req.headers.origin || `https://${req.headers.host}`;
    const resetLink = `${baseUrl}/?reset=${token}`;
    // Send email
    try {
      const cfg = emailModule.getConfig();
      if (!cfg.enabled || !cfg.smtpUser) {
        console.warn(`[forgot-pwd] SMTP not configured — token: ${token.slice(0,12)}... reset_link: ${resetLink}`);
        return res.json({ ok: true, message: "Link reset dikirim ke email Anda. Cek inbox (tunggu 1-2 menit).", smtp_disabled: true });
      }
      await emailModule.sendEmail({
        to: user.email,
        subject: "[karyaOS] Reset Password Anda",
        text: `Halo ${user.name},\n\nKami menerima permintaan reset password untuk akun karyaOS Anda.\n\nKlik link berikut untuk reset (berlaku 30 menit):\n${resetLink}\n\nKalau bukan Anda yang minta, abaikan email ini.\n\nkaryaOS`,
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,'Inter',sans-serif;background:#08090f;color:#e6edf3;padding:32px 20px;margin:0">
<div style="max-width:480px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:28px">
<div style="font-size:11px;color:#a855f7;letter-spacing:3px;font-weight:800;font-family:'Geist Mono',monospace">karyaOS · ACCOUNT RECOVERY</div>
<h1 style="margin:8px 0 14px;font-size:22px;color:#fff">Reset Password Anda</h1>
<p style="color:#cbd5e1;line-height:1.6">Halo <b style="color:#fff">${user.name}</b>,</p>
<p style="color:#cbd5e1;line-height:1.6">Kami menerima permintaan reset password untuk akun karyaOS Anda. Klik tombol di bawah untuk lanjut (berlaku <b>30 menit</b>).</p>
<a href="${resetLink}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#f59e0b,#f97316);color:#111;border-radius:10px;text-decoration:none;font-weight:800;letter-spacing:0.5px;margin:18px 0">🔑 Reset Password Sekarang</a>
<p style="color:#94a3b8;font-size:12px;line-height:1.55">Atau copy link: <br/><code style="color:#22d3ee;word-break:break-all">${resetLink}</code></p>
<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:20px 0"/>
<p style="color:#64748b;font-size:11px;line-height:1.55">Kalau bukan Anda yang minta reset, abaikan email ini — password Anda tidak akan berubah. Link akan expired otomatis dalam 30 menit.</p>
<p style="color:#64748b;font-size:10px;margin-top:14px">karyaOS · Operations Platform</p>
</div></body></html>`,
      });
      res.json({ ok: true, message: "Link reset dikirim ke email Anda. Cek inbox." });
    } catch (e) {
      console.error("[forgot-pwd] email send error:", e.message);
      res.json({ ok: true, message: "Permintaan dicatat. (Email service belum dikonfigurasi, hubungi admin)", smtp_error: true });
    }
  } catch (e) {
    console.error("[forgot-pwd] error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/reset-password — { token, new_password } → set password baru
app.post("/api/auth/reset-password", (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) return res.status(400).json({ error: "Token + password baru wajib" });
    if (String(new_password).length < 8) return res.status(400).json({ error: "Password minimum 8 karakter" });
    const row = db.rawDb.prepare(`SELECT * FROM password_reset_tokens WHERE token=?`).get(token);
    if (!row) return res.status(400).json({ error: "Token tidak valid atau sudah dipakai" });
    if (row.used_at) return res.status(400).json({ error: "Token sudah pernah dipakai" });
    if (row.expires_at < Date.now()) return res.status(400).json({ error: "Token sudah expired (lewat 30 menit). Mohon request reset lagi." });
    adminUsers = db.loadAllAdminUsers();
    const user = adminUsers.find(u => u.id === row.user_id);
    if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
    const { hash, salt } = hashPassword(new_password);
    db.insertAdminUser({ ...user, password_hash: hash, password_salt: salt,
      password_changed_at: Math.floor(Date.now() / 1000),
      failed_login_count: 0, locked_until: null, must_change_password: 0 });
    db.rawDb.prepare(`UPDATE password_reset_tokens SET used_at=? WHERE token=?`).run(Date.now(), token);
    adminUsers = db.loadAllAdminUsers();
    console.log(`[forgot-pwd] ✓ password reset for ${user.username || user.name}`);
    res.json({ ok: true, message: "Password berhasil di-update. Silakan login dengan password baru." });
  } catch (e) {
    console.error("[reset-pwd] error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/reset-password/:token — validate token sebelum show form
app.get("/api/auth/reset-password/:token", (req, res) => {
  const row = db.rawDb.prepare(`SELECT t.expires_at, t.used_at, u.name, u.username, u.email FROM password_reset_tokens t LEFT JOIN admin_users u ON u.id=t.user_id WHERE t.token=?`).get(req.params.token);
  if (!row) return res.status(404).json({ valid: false, error: "Token tidak valid" });
  if (row.used_at) return res.status(400).json({ valid: false, error: "Token sudah dipakai" });
  if (row.expires_at < Date.now()) return res.status(400).json({ valid: false, error: "Token expired" });
  res.json({ valid: true, name: row.name, username: row.username, email_masked: row.email ? row.email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : null });
});

// ─── TABLE / MEJA MANAGEMENT ─────────────────────────────────────────────────
let tables = db.loadAllTables();
if (tables.length === 0) {
  const seed = [
  { id:"T01", name:"Meja A1", zone:"A", capacity:4, status:"available", qrCode:"T01" },
  { id:"T02", name:"Meja A2", zone:"A", capacity:4, status:"available", qrCode:"T02" },
  { id:"T03", name:"Meja A3", zone:"A", capacity:2, status:"occupied",  qrCode:"T03" },
  { id:"T04", name:"Meja B1", zone:"B", capacity:6, status:"available", qrCode:"T04" },
  { id:"T05", name:"Meja B2", zone:"B", capacity:6, status:"available", qrCode:"T05" },
  { id:"T06", name:"Meja C1", zone:"C", capacity:2, status:"available", qrCode:"T06" },
  { id:"T07", name:"Meja C2", zone:"C", capacity:2, status:"occupied",  qrCode:"T07" },
  { id:"T08", name:"Meja D1", zone:"D", capacity:8, status:"available", qrCode:"T08" },
];
  seed.forEach(t => db.insertTable(t));
  tables = seed;
  console.log(`🪑 Seeded ${seed.length} demo tables`);
}

app.get("/api/tables", (req, res) => res.json(tables));

app.get("/api/tables/:id", (req, res) => {
  const table = tables.find(t => t.id === req.params.id || t.qrCode === req.params.id);
  if (!table) return res.status(404).json({ error: "Table not found" });
  res.json(table);
});

app.patch("/api/tables/:id", requireAdmin, (req, res) => {
  const idx = tables.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Table not found" });
  // SECURITY: whitelist fields
  const ALLOWED = ['name', 'zone', 'capacity', 'status', 'qrCode'];
  const updates = {};
  for (const k of ALLOWED) if (req.body[k] !== undefined) updates[k] = req.body[k];
  if (updates.capacity != null) updates.capacity = Math.max(1, Math.min(50, parseInt(updates.capacity, 10) || 1));
  if (updates.status && !['available', 'occupied', 'reserved', 'cleaning'].includes(updates.status)) delete updates.status;
  tables[idx] = { ...tables[idx], ...updates };
  db.insertTable(tables[idx]);
  broadcast("table:updated", tables[idx]);
  res.json(tables[idx]);
});

app.post("/api/tables", requireAdmin, (req, res) => {
  const { name, zone, capacity } = req.body;
  const id = `T${String(tables.length+1).padStart(2,"0")}`;
  const table = { id, name: name||id, zone: zone||"A", capacity: Number(capacity)||4, status:"available", qrCode:id };
  tables.push(table);
  res.status(201).json(table);
});

app.delete("/api/tables/:id", requireAdmin, (req, res) => {
  tables = tables.filter(t => t.id !== req.params.id);
  db.deleteTable(req.params.id);
  res.json({ ok: true });
});

// ─── SHIFT / KASIR MANAGEMENT ─────────────────────────────────────────────────
let shifts = db.loadAllShifts();
// Per-vertical active shift map. Sebelumnya singleton activeShift → bug:
// F&B close shift juga close Cinema (shared state). Sekarang fnb + cinema independen.
const activeShifts = { fnb: null, cinema: null };
// Migrate existing single shift dari DB ke fnb slot (default), preserve backward compat.
{
  const _legacyActive = db.loadActiveShift();
  if (_legacyActive) {
    const v = _legacyActive.vertical || 'fnb';
    activeShifts[v] = _legacyActive;
    console.log(`🕐 Resumed active shift: ${_legacyActive.id} (vertical: ${v}, opened by ${_legacyActive.openedBy})`);
  }
}
// Helper — derive vertical dari request (query, body, atau header).
function _vertOf(req) {
  const v = (req?.query?.vertical || req?.body?.vertical || req?.headers?.['x-vertical'] || 'fnb');
  return String(v).toLowerCase() === 'cinema' ? 'cinema' : 'fnb';
}
// Helper — derive vertical dari order source. Pos cinema source = "cinema_pos" / "pos_cinema".
function _vertFromSource(source) {
  const s = String(source || '').toLowerCase();
  return (s.includes('cinema') || s === 'cinema_pos' || s === 'pos_cinema') ? 'cinema' : 'fnb';
}

// Normalize SQLite field names (openedAt/closedAt) to API names (openAt/closeAt)
function normalizeShift(s) {
  if (!s) return s;
  return {
    ...s,
    openAt:       s.openAt       ?? s.openedAt    ?? null,
    closeAt:      s.closeAt      ?? s.closedAt    ?? null,
    openingCash:  s.openingCash  ?? 0,
    closingCash:  s.closingCash  ?? null,
    kasirName:    s.kasirName    ?? s.openedBy    ?? "Kasir",
    totalOrders:  s.totalOrders  ?? 0,
    totalRevenue: s.totalRevenue ?? (typeof s.sales === 'number' ? s.sales : 0),
    byPayment:    s.byPayment    ?? {},
    active:       !s.closeAt && !s.closedAt,
  };
}

// ── BUSINESS DAY (End Day) — per-vertical. F&B + Cinema independent.
// Sebelumnya singleton dayState bikin tutup F&B juga tutup Cinema.
const DAY_STATE_FILE = require("path").join(__dirname, "day-state.json");
const dayStates = {
  fnb:    { closed: false, closedAt: null, closedBy: null },
  cinema: { closed: false, closedAt: null, closedBy: null },
};
try {
  const loaded = JSON.parse(require("fs").readFileSync(DAY_STATE_FILE, "utf8"));
  // Migrate legacy single-object to fnb slot (backward compat)
  if (loaded && (loaded.fnb || loaded.cinema)) {
    if (loaded.fnb)    dayStates.fnb    = { ...dayStates.fnb,    ...loaded.fnb    };
    if (loaded.cinema) dayStates.cinema = { ...dayStates.cinema, ...loaded.cinema };
  } else if (loaded) {
    dayStates.fnb = { ...dayStates.fnb, ...loaded };
  }
} catch {}
function saveDayState() {
  try { require("fs").writeFileSync(DAY_STATE_FILE, JSON.stringify(dayStates)); }
  catch (e) { console.warn("[day] save failed:", e.message); }
}
console.log(`📅 Business day F&B: ${dayStates.fnb.closed ? "CLOSED" : "open"} · Cinema: ${dayStates.cinema.closed ? "CLOSED" : "open"}`);

app.get("/api/day/status", (req, res) => res.json(dayStates[_vertOf(req)]));
app.get("/api/day/status/all", (_, res) => res.json(dayStates));

function dayReportHtml(r) {
  const f = n => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
  const s = r.summary || {};
  const payRows = Object.entries(r.payments || {})
    .map(([k, v]) => `<tr><td style="padding:4px 0">${k}</td><td style="text-align:center">${v.count}</td><td style="text-align:right">${f(v.total)}</td></tr>`).join("");
  const itemRows = (r.topItems || []).slice(0, 8)
    .map(it => `<tr><td style="padding:4px 0">${it.name}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${f(it.revenue)}</td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#111">
    <h2 style="color:#F59E0B;margin:0">🌙 KaryaOS — Tutup Hari</h2>
    <p style="color:#888;margin:2px 0 16px;font-size:13px">${(r.period && r.period.label) || ""} · dicetak ${new Date().toLocaleString("id-ID")}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 0">Total Transaksi</td><td style="text-align:right"><b>${s.transactionCount || 0}</b></td></tr>
      <tr><td style="padding:4px 0">Omzet Kotor</td><td style="text-align:right"><b>${f(s.grossRevenue)}</b></td></tr>
      <tr><td style="padding:4px 0">PPN</td><td style="text-align:right">${f(s.taxExtracted)}</td></tr>
      <tr><td style="padding:4px 0">Omzet Bersih</td><td style="text-align:right">${f(s.netRevenue)}</td></tr>
      <tr><td style="padding:4px 0">Diskon Promo</td><td style="text-align:right">${f(s.promoDiscount)}</td></tr>
      <tr><td style="padding:4px 0">Rata-rata Struk</td><td style="text-align:right">${f(s.avgTicket)}</td></tr>
    </table>
    <h3 style="margin:18px 0 4px;border-bottom:1px solid #ddd;padding-bottom:4px">Pembayaran</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">${payRows || '<tr><td style="color:#999">— belum ada —</td></tr>'}</table>
    <h3 style="margin:18px 0 4px;border-bottom:1px solid #ddd;padding-bottom:4px">Item Terlaris</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">${itemRows || '<tr><td style="color:#999">— belum ada —</td></tr>'}</table>
    <hr style="margin-top:20px"/><p style="font-size:11px;color:#888">Laporan otomatis KaryaOS · Tutup Hari oleh ${r._closedBy || "Manager"}</p>
  </div>`;
}

app.post("/api/day/close", requireAdmin, async (req, res) => {
  const vertical = _vertOf(req);
  dayStates[vertical] = { closed: true, closedAt: Date.now(), closedBy: (req.body && req.body.by) || "Manager" };
  saveDayState();
  // Closing the day for this vertical also ends its active shift — vertical lain TIDAK terganggu.
  const active = activeShifts[vertical];
  if (active) {
    const closing = { ...active, closeAt: Date.now(), active: false, note: "auto-closed (tutup hari)", vertical };
    shifts.push({ ...closing });
    try { db.insertShift(closing); } catch {}
    activeShifts[vertical] = null;
  }
  // End-of-day summary report (today's transactions) — masih global (all orders).
  // Future: filter by vertical kalau report dipisah.
  let report = null, reportHtml = "", emailed = false;
  try {
    const ds = new Date(); ds.setHours(0, 0, 0, 0);
    report = generateZReport(ds.getTime(), Date.now(), `Tutup Hari ${vertical.toUpperCase()} ${new Date().toLocaleDateString("id-ID")}`);
    report._closedBy = dayStates[vertical].closedBy;
    reportHtml = dayReportHtml(report);
  } catch (e) { console.warn("[day] report failed:", e.message); }
  try {
    const cfg = emailModule.getConfig();
    const recipients = (req.body && Array.isArray(req.body.recipients) && req.body.recipients.length)
      ? req.body.recipients : (cfg.recipients || []);
    if (cfg.enabled && recipients.length && reportHtml) {
      await emailModule.sendEmail({
        to: recipients,
        subject: `Tutup Hari ${vertical.toUpperCase()} — KaryaOS — ${new Date().toLocaleDateString("id-ID")}`,
        html: reportHtml,
      });
      emailed = true;
    }
  } catch (e) { console.warn("[day] email failed:", e.message); }
  console.log(`🌙 Hari ${vertical} ditutup oleh ${dayStates[vertical].closedBy} — emailed: ${emailed}`);
  res.json({ ...dayStates[vertical], vertical, report, reportHtml, emailed });
});

app.post("/api/day/open", requireAdmin, (req, res) => {
  const vertical = _vertOf(req);
  dayStates[vertical] = { closed: false, closedAt: null, closedBy: null, openedAt: Date.now(), openedBy: (req.body && req.body.by) || "Manager" };
  saveDayState();
  console.log(`☀️ Hari ${vertical} dibuka oleh ${dayStates[vertical].openedBy}`);
  res.json({ ...dayStates[vertical], vertical });
});

app.get("/api/shifts", (req, res) => res.json(shifts.map(normalizeShift)));
app.get("/api/shifts/active", (req, res) => {
  const vertical = _vertOf(req);
  const active = activeShifts[vertical];
  if (!active) return res.json({ active: false, vertical });
  // Live aggregate stats from orders in shift window — filtered per-vertical via source
  const openTs = active.openAt || active.openedAt || active.opened_at || 0;
  const shiftOrders = orders.filter(o => o.time >= openTs && o.status !== "cancelled" && _vertFromSource(o.source) === vertical);
  const totalRevenue = shiftOrders.reduce((s,o) => s + (o.total||0), 0);
  const byPayment = shiftOrders.reduce((acc,o) => {
    const k = o.pay || "UNKNOWN";
    acc[k] = (acc[k]||0) + (o.total||0);
    return acc;
  }, {});
  const expectedCash = (active.openingCash||0) + (byPayment.CASH||0);
  res.json({
    ...normalizeShift(active),
    active: true,
    vertical,
    totalOrders: shiftOrders.length,
    totalRevenue,
    byPayment,
    expectedCash,
  });
});

// 🔧 Emergency force-close (clears active shift state without strict validation)
app.post("/api/shifts/force-close", requireAdmin, (req, res) => {
  const vertical = _vertOf(req);
  const active = activeShifts[vertical];
  if (!active) return res.status(404).json({ error: `Tidak ada shift ${vertical} aktif` });
  const adminName = global.getSessionUserName?.(req) || 'admin';
  const closedBy = `${adminName} (force)`;
  const closed = {
    ...normalizeShift(active),
    closeAt: Date.now(),
    closingCash: 0,
    closedBy,
    note: "FORCE CLOSE — " + (req.body?.reason || "Manual reset by admin"),
    active: false,
    vertical,
  };
  try { db.updateShift?.(closed.id, { closedAt: closed.closeAt, closingCash: 0, closedBy, sales: 0 }); } catch {}
  shifts = shifts.map(s => s.id === closed.id ? closed : s);
  if (!shifts.find(s => s.id === closed.id)) shifts.push(closed);
  activeShifts[vertical] = null;
  console.log(`⚠️  Shift ${closed.id} (${vertical}) force-closed oleh ${closedBy}`);
  res.json({ ok: true, shift: closed });
});

app.post("/api/shifts/open", (req, res) => {
  const vertical = _vertOf(req);
  if (dayStates[vertical].closed) return res.status(403).json({ error: `Hari ${vertical} sudah ditutup. Manager harus Buka Hari dulu.` });
  if (activeShifts[vertical]) return res.status(409).json({ error: `Shift ${vertical} sudah terbuka` });
  const { kasirName, openingCash } = req.body;
  const openedAtTs = Date.now();
  const shift = {
    id:          `SH${String(shifts.length+1).padStart(3,"0")}`,
    kasirName:   kasirName || "Kasir",
    openedBy:    kasirName || "Kasir",
    openAt:      openedAtTs,
    openedAt:    openedAtTs,
    closeAt:     null,
    openingCash: Number(openingCash)||0,
    closingCash: null,
    orders:      [],
    totalOrders: 0,
    totalRevenue:0,
    active:      true,
    vertical,
  };
  activeShifts[vertical] = shift;
  db.insertShift(shift);
  console.log(`🟢 Shift dibuka: ${shift.kasirName} (vertical: ${vertical})`);
  res.json(shift);
});

app.post("/api/shifts/close", (req, res) => {
  const vertical = _vertOf(req);
  const active = activeShifts[vertical];
  if (!active) return res.status(404).json({ error: `Tidak ada shift ${vertical} aktif` });
  const { closingCash, note, closedBy: bodyClosedBy } = req.body;
  // Identitas siapa yang nutup — body > session > fallback kasir pembuka.
  // Penting utk akuntabilitas: KPI + cermin operasional.
  const closedBy = bodyClosedBy || global.getSessionUserName?.(req) || active.kasirName || null;
  // Collect orders in this shift — filter by vertical via source
  const openTs = active.openAt || active.openedAt || active.opened_at || 0;
  const shiftOrders = orders.filter(o => o.time >= openTs && o.status !== "cancelled" && _vertFromSource(o.source) === vertical);
  const totalRevenue = shiftOrders.reduce((s,o) => s+o.total, 0);
  const closingShift = {
    ...active,
    closeAt:      Date.now(),
    closingCash:  Number(closingCash)||0,
    closedBy,
    note:         note||"",
    orders:       shiftOrders.map(o => o.id),
    totalOrders:  shiftOrders.length,
    totalRevenue,
    active:       false,
    vertical,
  };
  shifts.push({ ...closingShift });
  const closed = { ...closingShift };
  db.insertShift(closingShift);
  activeShifts[vertical] = null;
  console.log(`🔴 Shift ditutup oleh ${closedBy || '-'}: ${closed.kasirName} (${vertical}) — ${shiftOrders.length} order, Rp ${totalRevenue.toLocaleString()}`);

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

      let msg = "📊 *SHIFT REPORT — KaryaOS*\n";
      msg += "━━━━━━━━━━━━━━━━━━━━\n";
      msg += "👤 Kasir: " + (closed.kasirName || "?") + "\n";
      msg += "⏰ " + openTime + " — " + closeTime + "\n\n";
      msg += "💰 Revenue: " + fR(totalRevenue) + "\n";
      msg += "🧾 Orders: " + shiftOrders.length + "\n";
      msg += "💵 Cash Closing: " + fR(Number(closingCash) || 0) + "\n";
      if (note) msg += "📝 Note: " + note + "\n";
      msg += "\n";

      // Payment breakdown
      const cashOrders = shiftOrders.filter(o => (o.pay || "").toUpperCase() === "CASH");
      const qrisOrders = shiftOrders.filter(o => (o.pay || "").toUpperCase() === "QRIS");
      msg += "📱 QRIS: " + qrisOrders.length + "× (" + fR(qrisOrders.reduce((s,o) => s + o.total, 0)) + ")\n";
      msg += "💵 Cash: " + cashOrders.length + "× (" + fR(cashOrders.reduce((s,o) => s + o.total, 0)) + ")\n";
      msg += "\n";

      // Anomalies
      if (anomCount > 0) {
        msg += "🚨 *ANOMALI OPEN: " + anomCount + "*\n";
        msg += "Cek Command Center untuk detail.\n\n";
      }

      // Stock alerts
      if (stockAlerts.length > 0) {
        msg += "⚠ *STOK KRITIS:*\n";
        stockAlerts.forEach(s => {
          msg += "  • " + s.name + ": " + s.stock + " " + s.unit + "\n";
        });
        msg += "\n";
      }

      // Waste
      if (wasteItems.length > 0) {
        msg += "🗑️ *WASTE HARI INI:*\n";
        wasteItems.forEach(w => {
          msg += "  • " + w.item_name + ": " + w.total_qty + " " + w.unit + "\n";
        });
        msg += "\n";
      }

      msg += "━━━━━━━━━━━━━━━━━━━━\n";
      msg += "Bites & Co. Command Center";

      await wa.sendMessage(managerWA, msg);
      console.log("📱 Auto-report sent to " + managerWA);
    } catch (e) {
      console.warn("[Auto-Report] Failed:", e.message);
    }
  })();

  res.json(closed);
});

// ─── STOCK / AVAILABILITY REAL-TIME ──────────────────────────────────────────
// Broadcast menu update to all kiosks
app.post("/api/menu/:id/stock", requireSession, (req, res) => {
  const id  = parseInt(req.params.id);
  const idx = menu.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ error: "Item not found" });
  const { avail, reason } = req.body;
  menu[idx].avail = Boolean(avail);
      db.setMenuOverride(menu[idx].id, menu[idx].avail);
  menu[idx].stockNote = reason || "";
  // Broadcast to ALL connected clients (kiosk + admin)
  broadcast("menu:stockUpdate", { id, avail: menu[idx].avail, name: menu[idx].name, reason });
  console.log(`📦 Stock update: ${menu[idx].name} → ${avail?"available":"sold out"}`);
  res.json(menu[idx]);
});

// Bulk stock update
app.post("/api/menu/stock/bulk", requireAdmin, (req, res) => {
  const { updates } = req.body; // [{ id, avail }]
  const changed = [];
  (updates||[]).forEach(u => {
    const idx = menu.findIndex(m => m.id === u.id);
    if (idx >= 0) { menu[idx].avail = Boolean(u.avail);
      db.setMenuOverride(menu[idx].id, menu[idx].avail); changed.push(menu[idx]); }
  });
  broadcast("menu:bulkStockUpdate", { items: changed });
  res.json({ ok: true, updated: changed.length });
});

// ─── WA NOTIFICATION "PESANAN SIAP" ──────────────────────────────────────────
app.post("/api/notify/ready", async (req, res) => {
  const { orderId } = req.body;
  const order = orders.find(o => o.id === orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.customerPhone) return res.json({ ok: false, reason: "No phone" });

  const trackUrl = `${process.env.WA_TRACKING_BASE || "http://localhost:5173"}/?track&order=${orderId}`;
  const message = encodeURIComponent(
    `Halo ${order.customerName||"Kak"}! 🎉

Pesanan *#${orderId}* Anda sudah *SIAP DIAMBIL!* ✅

` +
    `${order.type==="dine"?`Silakan ke meja *${order.table}* ya 🪑`:"Silakan ambil di konter kami 🛍️"}

` +
    `Cek detail pesanan: ${trackUrl}

Terima kasih sudah memesan di *KaryaOS* 🍽️`
  );
  const cleanPhone = order.customerPhone.replace(/\D/g,"");
  const waPhone    = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
  const waUrl      = `https://wa.me/${waPhone}?text=${message}`;

  console.log(`📱 WA Ready notification → ${waPhone} (Order #${orderId})`);
  res.json({ ok: true, waUrl, phone: waPhone });
});

// ─── DIGITAL RECEIPT ─────────────────────────────────────────────────────────
app.get("/api/receipt/:orderId", (req, res) => {
  const order = orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const convenienceFee = order.convenienceFee || 0;
  const serviceCharge = order.serviceCharge || 0;
  // PPN dihitung dari total dikurangi biaya non-taxable (conv fee + service charge)
  const taxableBase = Math.max(0, order.total - convenienceFee - serviceCharge);
  const tax = Math.round(taxableBase * 11 / 111);
  res.json({
    receiptNo:    `RCP-${order.id}-${Date.now().toString(36).toUpperCase()}`,
    orderId:      order.id,
    timestamp:    new Date(order.time).toLocaleString("id-ID"),
    kasir:        order.kasirName || "Kiosk Self Order",
    type:         order.type,
    table:        order.table,
    items:        order.items,
    subtotal:     order.subtotal || order.total,
    promoCode:    order.promoCode || null,
    promoDiscount:order.promoDiscount || 0,
    promoFreeItems: order.promoFreeItems || null,
    tax,
    convenienceFee,
    serviceCharge,
    total:        order.total,
    payment: order.pay === "CASH" ? "TUNAI" : "QRIS",
    midtransId:   order.midtransId || null,
    customer:     { name: order.customerName, phone: order.customerPhone },
    status:       order.status,
    pointsRedeemed: order.pointsRedeemed || 0,
    pointsDiscount: order.pointsDiscount || 0,
    pointsEarned:   order.pointsEarned   || 0,
  });
});

// ─── STAFF CALL ───────────────────────────────────────────────────────────────
const staffCalls = [];
app.post("/api/staff-call", (req, res) => {
  const { tableId, reason, orderId } = req.body;
  const call = {
    id:      Date.now(),
    tableId: tableId || "-",
    reason:  reason || "Butuh bantuan",
    orderId: orderId || null,
    time:    Date.now(),
    resolved:false,
  };
  staffCalls.push(call);
  broadcast("staffCall", call);
  console.log(`🔔 Staff call: Meja ${tableId} — ${reason}`);
  res.json({ ok: true, callId: call.id });
});

app.get("/api/staff-call", (req, res) => res.json(staffCalls.filter(c=>!c.resolved)));
app.patch("/api/staff-call/:id/resolve", (req, res) => {
  const call = staffCalls.find(c=>c.id===Number(req.params.id));
  if (call) { call.resolved = true; broadcast("staffCallResolved", { id: call.id }); }
  res.json({ ok: true });
});

// ─── START SERVER ─────────────────────────────────────────────────────────

// ─── OUTLET CAPABILITIES — auto-detect vertical dari data nyata ────
// Filosofi karyaOS: sistem TIDAK boleh menebak salah. Cek data sebenarnya.
//
// Logic:
//   has_cinema = outlet punya studios + showtimes scheduled
//   has_fnb    = outlet punya kasir bound + orders dlm 90 hari
//   derived    = capability sebenernya
//
// Kalau declared vertical != derived → mismatch (kasih warning ke admin)
app.get("/api/admin/outlet-capabilities", (req, res) => {
  try {
    const scope = req.companyScope || { is_super_admin: true };
    const tenantFilter = scope.is_super_admin ? '' : 'AND company_id = ?';
    const tenantParam = scope.is_super_admin ? [] : [scope.company_id];

    let outlets = [];
    try {
      const sql = `SELECT code, name, area, vertical, company_id FROM outlet_master WHERE status != 'closed' ${tenantFilter} ORDER BY code`;
      outlets = db.rawDb.prepare(sql).all(...tenantParam);
    } catch {}

    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - 90 * 86400;
    const result = [];

    for (const o of outlets) {
      // Cinema capability — punya studios?
      let cinemaStudios = 0, cinemaShowtimes = 0;
      try {
        const r = db.rawDb.prepare(`SELECT COUNT(*) c FROM cinema_studios WHERE (outlet = ? OR outlet = ?) ${tenantFilter ? 'AND (company_id IS NULL OR company_id = ?)' : ''}`)
          .get(o.code, o.name, ...(tenantFilter ? [o.company_id] : []));
        cinemaStudios = r?.c || 0;
      } catch {}
      try {
        const r = db.rawDb.prepare(`
          SELECT COUNT(*) c FROM cinema_showtimes s
          LEFT JOIN cinema_studios st ON st.id = s.studio_id
          WHERE (st.outlet = ? OR st.outlet = ?) AND s.show_date >= date('now', '-30 days')
          ${tenantFilter ? 'AND (s.company_id IS NULL OR s.company_id = ?)' : ''}
        `).get(o.code, o.name, ...(tenantFilter ? [o.company_id] : []));
        cinemaShowtimes = r?.c || 0;
      } catch {}
      const hasCinema = cinemaStudios > 0;

      // F&B capability — punya kasir bound + orders recent?
      let kasirCount = 0, recentOrders = 0;
      try {
        const r = db.rawDb.prepare(`SELECT COUNT(*) c FROM admin_users WHERE outlet_code = ? AND active = 1`).get(o.code);
        kasirCount = r?.c || 0;
      } catch {}
      try {
        const r = db.rawDb.prepare(`
          SELECT COUNT(*) c FROM orders
          WHERE time >= ? AND status != 'cancelled'
            AND kasir IN (SELECT name FROM admin_users WHERE outlet_code = ?)
        `).get(ninetyDaysAgo * 1000, o.code);
        recentOrders = r?.c || 0;
      } catch {}
      const hasFnb = kasirCount > 0 && recentOrders > 0;

      // Derive
      let derived;
      if (hasCinema && hasFnb) derived = 'hybrid';
      else if (hasCinema) derived = 'cinema';
      else if (hasFnb) derived = 'fnb';
      else derived = null; // belum ada aktivitas

      const declared = o.vertical || 'fnb';
      const mismatch = derived && declared !== derived;

      result.push({
        code: o.code, name: o.name, area: o.area,
        declared_vertical: declared,
        derived_vertical: derived,
        mismatch,
        evidence: {
          cinema_studios: cinemaStudios,
          cinema_showtimes_30d: cinemaShowtimes,
          kasir_bound: kasirCount,
          orders_90d: recentOrders,
        },
        suggestion: mismatch ? `Vertical declared "${declared}" — tapi outlet ini punya ${hasCinema ? 'cinema content' : ''}${hasCinema && hasFnb ? ' + ' : ''}${hasFnb ? 'F&B activity' : ''}. Pertimbangkan ganti ke "${derived}".` : null,
      });
    }

    res.json({
      outlets: result,
      summary: {
        total: result.length,
        mismatched: result.filter(o => o.mismatch).length,
        no_activity: result.filter(o => !o.derived_vertical).length,
      },
    });
  } catch (e) {
    console.error('[outlet-capabilities]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── OUTLET OVERVIEW — sales + KPI per outlet (filterable) ─────────
// Aggregate metrics per outlet untuk dashboard owner/manager. Filosofi:
// owner perlu tahu "outlet mana yg paling sungguh-sungguh" — dan kalau
// ada yg drop, bisa drill-down dgn empati.
//
// Query params:
//   ?from=<epoch_sec>  (default: today 00:00)
//   ?to=<epoch_sec>    (default: now)
//   ?outlet=<code>     (optional — filter ke 1 outlet specific)
//
// Returns: { range, outlets[], totals }
app.get("/api/admin/outlet-overview", (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor(new Date().setHours(0,0,0,0) / 1000);
    const from = Number(req.query.from) || todayStart;
    const to = Number(req.query.to) || now;
    const filterOutlet = String(req.query.outlet || '').trim() || null;
    const periodDays = Math.max(1, Math.floor((to - from) / 86400));

    // Multi-tenant scope — owner cuma boleh lihat outlet company sendiri.
    // Super-admin lihat semua. Filosofi karyaOS: tenant boundary sakral —
    // data company lain bukan urusan owner ini.
    const scope = req.companyScope || { is_super_admin: true };
    const tenantFilter = scope.is_super_admin ? '' : 'AND company_id = ?';
    const tenantParam = scope.is_super_admin ? [] : [scope.company_id];

    // Outlet master list (filtered by tenant)
    let outletList = [];
    try {
      let sql = `SELECT code, name, area, vertical, status, company_id FROM outlet_master WHERE status != 'closed' ${tenantFilter}`;
      const params = [...tenantParam];
      if (filterOutlet) { sql += ` AND code = ?`; params.push(filterOutlet); }
      sql += ` ORDER BY code`;
      outletList = db.rawDb.prepare(sql).all(...params);
    } catch (e) { console.error('[outlet-overview] outlet_master', e); }

    // Per-outlet metrics
    const results = [];
    let totalRevenue = 0, totalOrders = 0, totalKpiSum = 0, totalKpiCount = 0;

    for (const o of outletList) {
      const ocid = o.company_id; // outlet's company — utk defense-in-depth filter

      // F&B orders — filter by kasir-outlet binding + tenant
      let revenue = 0, orderCount = 0;
      try {
        const r = db.rawDb.prepare(`
          SELECT COUNT(*) c, COALESCE(SUM(total),0) t
          FROM orders o
          WHERE o.time >= ? AND o.time < ? AND o.status != 'cancelled'
            AND (o.company_id IS NULL OR o.company_id = ?)
            AND o.kasir IN (SELECT name FROM admin_users WHERE outlet_code = ? AND (company_id IS NULL OR company_id = ?))
        `).get(from * 1000, to * 1000, ocid, o.code, ocid);
        orderCount = r?.c || 0; revenue = r?.t || 0;
      } catch {}

      // Cinema revenue (kalau outlet cinema/hybrid) — tenant-scoped
      let cinemaRevenue = 0, cinemaTickets = 0;
      if (o.vertical === 'cinema' || o.vertical === 'hybrid') {
        try {
          const r = db.rawDb.prepare(`
            SELECT COUNT(t.id) c, COALESCE(SUM(t.price),0) v
            FROM cinema_tickets t
            LEFT JOIN cinema_studios st ON st.id = t.studio_id
            WHERE t.sold_at >= ? AND t.sold_at < ?
              AND (t.company_id IS NULL OR t.company_id = ?)
              AND st.outlet IN (?, ?)
          `).get(from, to, ocid, o.name, o.code);
          cinemaTickets = r?.c || 0; cinemaRevenue = r?.v || 0;
        } catch {}
      }

      const combinedRevenue = revenue + cinemaRevenue;
      const combinedOrders = orderCount + cinemaTickets;
      const avgTicket = combinedOrders > 0 ? Math.round(combinedRevenue / combinedOrders) : 0;

      // Customer rating avg per outlet (via kasir attribution + tenant)
      let rating = null, reviewCount = 0;
      try {
        const r = db.rawDb.prepare(`
          SELECT COUNT(*) c, COALESCE(AVG(rating),0) r
          FROM customer_feedback
          WHERE created_at >= ? AND created_at < ?
            AND cashier IN (SELECT name FROM admin_users WHERE outlet_code = ? AND (company_id IS NULL OR company_id = ?))
        `).get(from, to, o.code, ocid);
        if (r?.c > 0) { rating = Math.round((r.r || 0) * 100) / 100; reviewCount = r.c; }
      } catch {}

      // Top kasir at this outlet (tenant-scoped)
      let topKasir = null;
      try {
        const r = db.rawDb.prepare(`
          SELECT actor, COUNT(DISTINCT order_ref) cnt, COALESCE(SUM(amount_applied),0) rev
          FROM pos_payments
          WHERE created_at >= ? AND created_at < ? AND status = 'completed'
            AND actor IN (SELECT name FROM admin_users WHERE outlet_code = ? AND (company_id IS NULL OR company_id = ?))
          GROUP BY actor ORDER BY rev DESC LIMIT 1
        `).get(from, to, o.code, ocid);
        if (r?.actor) topKasir = { name: r.actor, transactions: r.cnt, revenue: r.rev };
      } catch {}

      // Prev period for growth (tenant-scoped)
      const prevFrom = from - (to - from);
      let prevRevenue = 0;
      try {
        const r1 = db.rawDb.prepare(`
          SELECT COALESCE(SUM(total),0) t FROM orders
          WHERE time >= ? AND time < ? AND status != 'cancelled'
            AND (company_id IS NULL OR company_id = ?)
            AND kasir IN (SELECT name FROM admin_users WHERE outlet_code = ? AND (company_id IS NULL OR company_id = ?))
        `).get(prevFrom * 1000, from * 1000, ocid, o.code, ocid);
        prevRevenue = r1?.t || 0;
        if (o.vertical === 'cinema' || o.vertical === 'hybrid') {
          const r2 = db.rawDb.prepare(`
            SELECT COALESCE(SUM(t.price),0) v FROM cinema_tickets t
            LEFT JOIN cinema_studios st ON st.id = t.studio_id
            WHERE t.sold_at >= ? AND t.sold_at < ?
              AND (t.company_id IS NULL OR t.company_id = ?)
              AND st.outlet IN (?, ?)
          `).get(prevFrom, from, ocid, o.name, o.code);
          prevRevenue += r2?.v || 0;
        }
      } catch {}

      const growthPct = prevRevenue > 0
        ? Math.round((combinedRevenue - prevRevenue) / prevRevenue * 100)
        : (combinedRevenue > 0 ? 100 : 0);

      // Simple outlet KPI score — composite of revenue + rating + orders volume
      // Normalize: rating to 0-100, orders to threshold-based, revenue per-day
      const ratingScore = rating != null ? (rating / 5) * 100 : 0;
      const dailyRev = combinedRevenue / Math.max(1, periodDays);
      const volScore = Math.min(100, (dailyRev / 5000000) * 100); // 5jt/hari = 100
      const kpiScore = rating != null
        ? Math.round(ratingScore * 0.6 + volScore * 0.4)
        : Math.round(volScore);

      const result = {
        code: o.code, name: o.name, area: o.area, vertical: o.vertical, status: o.status,
        revenue: combinedRevenue,
        revenue_fb: revenue,
        revenue_cinema: cinemaRevenue,
        orders: combinedOrders,
        orders_fb: orderCount,
        tickets_cinema: cinemaTickets,
        avg_ticket: avgTicket,
        rating, review_count: reviewCount,
        top_kasir: topKasir,
        growth_pct: growthPct,
        kpi_score: kpiScore,
      };
      results.push(result);
      totalRevenue += combinedRevenue;
      totalOrders += combinedOrders;
      if (kpiScore > 0) { totalKpiSum += kpiScore; totalKpiCount++; }
    }

    // Sort by revenue DESC (top performer first)
    results.sort((a, b) => b.revenue - a.revenue);

    res.json({
      range: { from, to, period_days: periodDays },
      outlets: results,
      totals: {
        revenue: totalRevenue,
        orders: totalOrders,
        outlet_count: results.length,
        avg_kpi: totalKpiCount > 0 ? Math.round(totalKpiSum / totalKpiCount) : null,
      },
    });
  } catch (e) {
    console.error('[outlet-overview]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── KARYA HARI INI — daily summary utk owner/manager ──────────────
// Filosofi karyaOS: owner adalah orang yg paling jauh dari outlet
// secara harian. Dia perlu "kembali ke rumah karyaOS" tiap pagi —
// melihat apa yg terjadi kemarin sebagai surat dari tim.
//
// Output: ringkasan kemarin yg menggerakkan hati, bukan cuma angka.
//
// Auth: butuh session admin/owner.
app.get("/api/admin/karya-hari-ini", (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token && adminSessions.get(token);
  if (!session) return res.status(401).json({ error: 'session required' });

  try {
    // Range: kemarin 00:00 - 23:59
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const yEnd = Math.floor(d.getTime() / 1000);
    const yStart = yEnd - 86400;
    const yEndMs = yEnd * 1000;
    const yStartMs = yStart * 1000;

    // Orders kemarin
    let ordersCount = 0, revenue = 0, newCustomers = 0;
    try {
      const r1 = db.rawDb.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) t FROM orders WHERE time >= ? AND time < ? AND status != 'cancelled'`).get(yStartMs, yEndMs);
      ordersCount = r1?.c || 0; revenue = r1?.t || 0;
    } catch {}
    try {
      const r2 = db.rawDb.prepare(`SELECT COUNT(*) c FROM customers WHERE created_at >= ? AND created_at < ?`).get(yStart, yEnd);
      newCustomers = r2?.c || 0;
    } catch {}

    // Reviews kemarin
    let reviewsCount = 0, avgRating = 0, badCount = 0;
    try {
      const r3 = db.rawDb.prepare(`SELECT COUNT(*) c, COALESCE(AVG(rating),0) a, SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) b FROM customer_feedback WHERE created_at >= ? AND created_at < ?`).get(yStart, yEnd);
      reviewsCount = r3?.c || 0; avgRating = Math.round((r3?.a || 0) * 100) / 100;
      badCount = r3?.b || 0;
    } catch {}

    // Top story kemarin
    let topStory = null;
    try {
      topStory = db.rawDb.prepare(`
        SELECT comment, cashier, rating, source
        FROM customer_feedback
        WHERE rating >= 4 AND comment IS NOT NULL AND LENGTH(TRIM(comment)) >= 10
          AND created_at >= ? AND created_at < ?
        ORDER BY rating DESC, created_at DESC LIMIT 1
      `).get(yStart, yEnd);
    } catch {}

    // Milestones kemarin — kasir + outlet yg anniversary, ulang tahun, dll
    const milestones = [];
    try {
      // Kasir yg punya anniversary kemarin
      const ANNIV_DAYS = [100, 180, 365, 500, 730, 1000, 1825];
      const yesterdayDay = (firstAt) => Math.floor((yStart - firstAt) / 86400) + 1;
      const allUsers = db.rawDb.prepare(`SELECT name, first_login_at, birth_date FROM admin_users WHERE active = 1`).all();
      for (const u of allUsers) {
        if (u.first_login_at) {
          const d = yesterdayDay(u.first_login_at);
          if (ANNIV_DAYS.includes(d)) {
            const label = d === 100 ? "hari ke-100" : d === 180 ? "6 bulan" : d === 365 ? "1 tahun"
                       : d === 500 ? "hari ke-500" : d === 730 ? "2 tahun" : d === 1000 ? "hari ke-1000" : "5 tahun";
            milestones.push(`🌳 ${u.name} mencapai ${label} kerja`);
          }
        }
        // Ulang tahun kemarin
        if (u.birth_date && u.birth_date.length >= 5) {
          const dt = new Date(yStartMs);
          const ymd = `${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          if (u.birth_date.slice(5) === ymd) {
            milestones.push(`🎂 Kemarin ulang tahun ${u.name} — semoga sehat selalu`);
          }
        }
      }

      // Outlet anniversary — outlet yg punya milestone hari kemarin
      try {
        const outlets = db.rawDb.prepare(`SELECT name, opening_date, created_at FROM outlet_master WHERE status = 'active'`).all();
        for (const o of outlets) {
          const dateRef = o.opening_date || o.created_at;
          if (!dateRef) continue;
          const d = yesterdayDay(dateRef);
          if (ANNIV_DAYS.includes(d)) {
            const label = d === 100 ? "100 hari" : d === 180 ? "6 bulan" : d === 365 ? "1 tahun"
                       : d === 500 ? "500 hari" : d === 730 ? "2 tahun" : d === 1000 ? "1000 hari" : "5 tahun";
            milestones.push(`🏪 Outlet ${o.name} mencapai ${label} kemarin`);
          }
        }
      } catch {}
    } catch {}

    // Kasir top kemarin (omset tertinggi)
    let topCashier = null;
    try {
      const r = db.rawDb.prepare(`
        SELECT actor AS cashier, COUNT(DISTINCT order_ref) AS tx, COALESCE(SUM(amount_applied),0) AS revenue
        FROM pos_payments
        WHERE created_at >= ? AND created_at < ? AND status = 'completed' AND actor IS NOT NULL AND actor != ''
        GROUP BY actor ORDER BY revenue DESC LIMIT 1
      `).get(yStart, yEnd);
      if (r?.cashier) topCashier = { name: r.cashier, transactions: r.tx, revenue: r.revenue };
    } catch {}

    // Tagline adaptif berdasarkan performance kemarin
    let tagline;
    if (avgRating >= 4.5 && reviewsCount >= 3) {
      tagline = 'Hari kemarin sangat bercahaya. Tim Anda menyentuh banyak hati.';
    } else if (ordersCount >= 50) {
      tagline = 'Hari yang sibuk. Tim Anda berdiri tegak di tengah keramaian.';
    } else if (badCount > 0) {
      tagline = 'Hari yang menantang. Setiap kritik adalah hadiah untuk tumbuh.';
    } else if (newCustomers >= 1) {
      tagline = 'Ada wajah baru yang datang kemarin. Mari sambut mereka kembali.';
    } else {
      tagline = 'Hari yang tenang. Bukan tidak terjadi apa-apa — banyak yg dilakukan dgn sungguh-sungguh.';
    }

    const forDate = new Date(yStartMs).toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    res.json({
      for_date: forDate,
      metrics: {
        orders: ordersCount,
        revenue,
        new_customers: newCustomers,
        reviews: reviewsCount,
        avg_rating: avgRating,
      },
      top_story: topStory,
      top_cashier: topCashier,
      milestones,
      tagline,
    });
  } catch (e) {
    console.error('[karya-hari-ini]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUBLIC BERANDA — story wall ────────────────────────────────────
// Endpoint publik (no auth) — show wall yg bikin customer rindu menyapa.
// Filosofi karyaOS: customer datang BUKAN cuma karena makanan,
// tapi karena ingin menyapa karyaOS sebentar. Beranda jadi tempat
// menyapa itu.
//
// Output:
// - greeting (time-of-day)
// - milestone (total orders week-to-date, total customers served)
// - stories (5 customer reviews anonymized 4-5★ dgn comment)
// - today_tagline (adaptive)
// - most_loved (item paling banyak dipesan minggu ini)
app.get("/api/public/beranda", (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const weekStartMs = d.getTime() - (dow - 1) * 86400 * 1000;
    const weekStart = Math.floor(weekStartMs / 1000);

    // Sambutan waktu
    const h = new Date().getHours();
    const greeting = h >= 5 && h < 11 ? 'Selamat pagi'
                  : h >= 11 && h < 15 ? 'Selamat siang'
                  : h >= 15 && h < 18 ? 'Selamat sore'
                  : 'Selamat malam';
    const tagline = h >= 5 && h < 11 ? 'Pagi yang baru menunggu rasa baru.'
                 : h >= 11 && h < 15 ? 'Siang yang hangat, perut yang senang.'
                 : h >= 15 && h < 18 ? 'Sore yang manis menunggu cerita.'
                 : 'Malam yang tenang menunggu kunjunganmu.';

    // Milestone — total orders minggu ini
    let ordersWeek = 0;
    try {
      const r = db.rawDb.prepare(`SELECT COUNT(*) c FROM orders WHERE time >= ? AND status != 'cancelled'`).get(weekStart * 1000);
      ordersWeek = r?.c || 0;
    } catch {}

    // Total customer dilayani (all-time, distinct phone)
    let totalServed = 0;
    try {
      const r = db.rawDb.prepare(`SELECT COUNT(DISTINCT phone) c FROM customers WHERE phone IS NOT NULL AND phone != ''`).get();
      totalServed = r?.c || 0;
    } catch {}

    // Stories — anonymized highlights
    let stories = [];
    try {
      stories = db.rawDb.prepare(`
        SELECT comment, rating, source, created_at
        FROM customer_feedback
        WHERE rating >= 4 AND comment IS NOT NULL AND LENGTH(TRIM(comment)) >= 10
        ORDER BY rating DESC, created_at DESC LIMIT 5
      `).all();
    } catch {}

    // Most loved item minggu ini — parse orders.items JSON, count
    let mostLoved = null;
    try {
      const rows = db.rawDb.prepare(`SELECT items FROM orders WHERE time >= ? AND status != 'cancelled' LIMIT 500`).all(weekStart * 1000);
      const counts = new Map();
      for (const r of rows) {
        try {
          const items = JSON.parse(r.items || '[]');
          for (const it of items) {
            const name = it.n || it.name;
            if (!name) continue;
            counts.set(name, (counts.get(name) || 0) + (it.q || it.qty || 1));
          }
        } catch {}
      }
      if (counts.size > 0) {
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        mostLoved = { name: top[0], qty: top[1] };
      }
    } catch {}

    res.json({
      greeting,
      tagline,
      milestone: {
        orders_week: ordersWeek,
        total_served: totalServed,
      },
      stories,
      most_loved: mostLoved,
      generated_at: now,
    });
  } catch (e) {
    console.error('[beranda]', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Public config (CDS tracking URL etc) ──────────────────────────────
app.get("/api/config/public", (_, res) => {
  let auditConfig = {};
  try {
    const { getDb } = require("./command-center-backend");
    const rows = getDb().prepare("SELECT key, value FROM audit_config").all();
    rows.forEach(r => { auditConfig[r.key] = r.value; });
    if (auditConfig.POINT_VALUE) auditConfig.POINT_VALUE = parseInt(auditConfig.POINT_VALUE) || 100;
  } catch(e) {}
  res.json({
    trackingBaseUrl: process.env.TRACKING_BASE_URL || process.env.VITE_TRACKING_BASE_URL || null,
    lanHost: process.env.LAN_HOST || null,
    ...auditConfig,
  });
});


// ── POS → CDS broadcast (Step 7B) ─────────────────────────────────────
app.post("/api/pos/broadcast", (req, res) => {
  const { event, data } = req.body || {};
  if (!event || typeof event !== "string" || !event.startsWith("pos:")) {
    return res.status(400).json({ error: "Invalid event name (must start with 'pos:')" });
  }
  try {
    broadcast(event, data || {});
    res.json({ ok: true, event });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════════
// SHIFT REPORT ENDPOINTS (v2 — in-memory arrays)
// ═══════════════════════════════════════════════════════════

// Field accessor (handles snake_case OR camelCase)
function _get(obj, key) {
  if (!obj) return undefined;
  const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return obj[key] !== undefined ? obj[key] : obj[camel];
}

function buildShiftReportV2(shift) {
  const start = _get(shift, 'opened_at');
  const closedAt = _get(shift, 'closed_at');
  const end = closedAt || Date.now();
  const openingCash = _get(shift, 'opening_cash') || 0;
  const closingCash = _get(shift, 'closing_cash');

  const inRange = orders.filter(o => {
    const t = _get(o, 'time');
    return t >= start && t <= end;
  });

  const valid = inRange.filter(o => {
    const s = _get(o, 'status');
    return s !== 'cancelled' && s !== 'void';
  });
  const cancelled = inRange.filter(o => {
    const s = _get(o, 'status');
    return s === 'cancelled' || s === 'void';
  });

  const totalOrders = valid.length;
  const totalRevenue = valid.reduce((s, o) => s + (_get(o, 'total') || 0), 0);
  const totalDiscount = valid.reduce((s, o) => s + (_get(o, 'promo_discount') || 0), 0);
  const totalTax = valid.reduce((s, o) => s + (_get(o, 'tax') || 0), 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // By payment
  const byPayment = {};
  valid.forEach(o => {
    const pay = (_get(o, 'pay') || 'UNKNOWN').toUpperCase();
    if (!byPayment[pay]) byPayment[pay] = { count: 0, total: 0 };
    byPayment[pay].count += 1;
    byPayment[pay].total += (_get(o, 'total') || 0);
  });

  // By kasir
  const byKasir = {};
  valid.forEach(o => {
    const k = _get(o, 'kasir') || 'Unknown';
    if (!byKasir[k]) byKasir[k] = { count: 0, total: 0 };
    byKasir[k].count += 1;
    byKasir[k].total += (_get(o, 'total') || 0);
  });

  // By type
  const byType = {};
  valid.forEach(o => {
    const t = _get(o, 'type') || 'unknown';
    if (!byType[t]) byType[t] = { count: 0, total: 0 };
    byType[t].count += 1;
    byType[t].total += (_get(o, 'total') || 0);
  });

  // Top items (items may be array OR JSON string)
  const itemStats = {};
  valid.forEach(o => {
    let items = _get(o, 'items');
    try {
      if (typeof items === 'string') items = JSON.parse(items);
    } catch (e) { items = []; }
    if (!Array.isArray(items)) return;
    items.forEach(it => {
      const id = it.id || it.menuId;
      const name = it.n || it.name || 'Unknown';
      const qty = it.q || it.qty || 1;
      const price = it.p || it.price || 0;
      const key = `${id}_${name}`;
      if (!itemStats[key]) {
        itemStats[key] = { id, name, qty: 0, revenue: 0 };
      }
      itemStats[key].qty += qty;
      itemStats[key].revenue += price * qty;
    });
  });
  const topItems = Object.values(itemStats)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // Orders by hour
  const hourMap = {};
  valid.forEach(o => {
    const d = new Date(_get(o, 'time'));
    const hour = d.getHours();
    hourMap[hour] = (hourMap[hour] || 0) + 1;
  });
  const ordersByHour = Object.keys(hourMap)
    .map(h => ({ hour: parseInt(h), count: hourMap[h] }))
    .sort((a, b) => a.hour - b.hour);

  // Promos
  const promoMap = {};
  valid.forEach(o => {
    const code = _get(o, 'promo_code');
    if (!code) return;
    if (!promoMap[code]) promoMap[code] = { code, count: 0, totalDiscount: 0 };
    promoMap[code].count += 1;
    promoMap[code].totalDiscount += (_get(o, 'promo_discount') || 0);
  });
  const promosUsed = Object.values(promoMap).sort((a, b) => b.count - a.count);

  // Member vs guest
  const memberOrders = valid.filter(o => _get(o, 'customer_id')).length;
  const guestOrders = valid.filter(o => !_get(o, 'customer_id')).length;

  // Loyalty (1 pt per 1000)
  const loyaltyEarned = valid
    .filter(o => _get(o, 'customer_id'))
    .reduce((s, o) => s + Math.floor((_get(o, 'total') || 0) / 1000), 0);

  // Cash drawer
  const cashSales = (byPayment.CASH?.total || 0);
  const expectedCash = openingCash + cashSales;
  const variance = (closingCash !== null && closingCash !== undefined)
    ? closingCash - expectedCash : null;

  return {
    shift: {
      id: _get(shift, 'id'),
      openedAt: start,
      openedBy: _get(shift, 'opened_by'),
      closedAt,
      status: closedAt ? 'closed' : 'active',
      durationMinutes: Math.round((end - start) / 60000)
    },
    summary: {
      totalOrders,
      cancelledOrders: cancelled.length,
      totalRevenue,
      totalDiscount,
      totalTax,
      netRevenue: totalRevenue - totalDiscount,
      avgOrderValue
    },
    byPayment,
    byKasir,
    byType,
    topItems,
    ordersByHour,
    promosUsed,
    memberOrders,
    guestOrders,
    loyaltyEarned,
    cashDrawer: {
      startingCash: openingCash,
      cashSales,
      expectedCash,
      actualCash: closingCash || null,
      variance
    },
    generatedAt: Date.now()
  };
}

// GET active shift report
app.get("/api/shifts/active/report", (req, res) => {
  try {
    const shift = shifts.find(s => !_get(s, 'closed_at'));
    if (!shift) return res.status(404).json({ error: "No active shift" });
    res.json(buildShiftReportV2(shift));
  } catch (e) {
    console.error("Active shift report error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET specific shift report
app.get("/api/shifts/:id/report", (req, res) => {
  try {
    const shift = shifts.find(s => _get(s, 'id') === req.params.id);
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    res.json(buildShiftReportV2(shift));
  } catch (e) {
    console.error("Shift report error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET shift history with mini summary
app.get("/api/shifts/history", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sorted = [...shifts]
      .sort((a, b) => (_get(b, 'opened_at') || 0) - (_get(a, 'opened_at') || 0))
      .slice(0, limit);

    const list = sorted.map(s => {
      const start = _get(s, 'opened_at');
      const closedAt = _get(s, 'closed_at');
      const end = closedAt || Date.now();
      const inRange = orders.filter(o => {
        const t = _get(o, 'time');
        return t >= start && t <= end;
      });
      const valid = inRange.filter(o => {
        const st = _get(o, 'status');
        return st !== 'cancelled' && st !== 'void';
      });
      return {
        id: _get(s, 'id'),
        openedAt: start,
        openedBy: _get(s, 'opened_by'),
        closedAt,
        status: closedAt ? 'closed' : 'active',
        openingCash: _get(s, 'opening_cash') || 0,
        closingCash: _get(s, 'closing_cash'),
        totalOrders: valid.length,
        totalRevenue: valid.reduce((sum, o) => sum + (_get(o, 'total') || 0), 0),
        durationMinutes: Math.round((end - start) / 60000)
      };
    });

    res.json(list);
  } catch (e) {
    console.error("Shift history error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST close shift with closing cash
app.post("/api/shifts/:id/close-with-report", (req, res) => {
  try {
    const { closingCash, closedBy: bodyClosedBy } = req.body;
    if (closingCash === undefined || closingCash === null) {
      return res.status(400).json({ error: "closingCash required" });
    }

    const shift = shifts.find(s => _get(s, 'id') === req.params.id);
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    if (_get(shift, 'closed_at')) return res.status(400).json({ error: "Shift already closed" });

    const closedAt = Date.now();
    // Identitas penutup — body > session > pembuka shift sbg fallback.
    const closedBy = bodyClosedBy
      || global.getSessionUserName?.(req)
      || _get(shift, 'kasirName') || _get(shift, 'opened_by') || null;

    // Update in-memory
    shift.closed_at = closedAt;
    shift.closing_cash = closingCash;
    shift.closedBy = closedBy;
    shift.closed_by = closedBy;

    const report = buildShiftReportV2(shift);
    shift.sales = JSON.stringify(report.summary);

    // Persist via updateShift(id, updates) — sebelumnya dipanggil dgn signature
    // salah (shift sbg arg tunggal) sehingga no-op. Sekarang fixed + sertakan closedBy.
    try {
      if (db && typeof db.updateShift === 'function') {
        db.updateShift(shift.id, {
          closedAt,
          closingCash: Number(closingCash) || 0,
          closedBy,
          totalOrders:  report?.summary?.totalOrders  || 0,
          totalRevenue: report?.summary?.totalRevenue || 0,
          byPayment:    report?.summary?.byPayment    || {},
        });
      }
    } catch (saveErr) {
      console.warn("Persistence warning:", saveErr.message);
    }

    res.json({ ok: true, closedAt, closedBy, report });
  } catch (e) {
    console.error("Close shift error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// CANCEL/REFUND ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Broadcast helper (reuse existing WS infrastructure)
function _broadcast(event, data) {
  try {
    if (typeof wss !== 'undefined' && wss && wss.clients) {
      const msg = JSON.stringify({ event, data });
      wss.clients.forEach(c => {
        try { if (c.readyState === 1) c.send(msg); } catch (e) {}
      });
    }
  } catch (e) {
    console.warn("Broadcast warning:", e.message);
  }
}

// Persist using specific db.js methods
function _persistCancel(order) {
  try {
    if (db && typeof db.updateOrderCancel === 'function') {
      db.updateOrderCancel(order.id, order.cancelledAt, order.cancelReason, order.cancelledBy);
    } else {
      console.warn("db.updateOrderCancel not available");
    }
  } catch (e) {
    console.warn("Persist cancel warning:", e.message);
  }
}

function _persistRefund(order) {
  try {
    if (db && typeof db.updateOrderRefund === 'function') {
      db.updateOrderRefund(order.id, order.status, order.refundedAmount, order.refundedAt, order.refundedBy, order.refundReason);
    } else {
      console.warn("db.updateOrderRefund not available");
    }
  } catch (e) {
    console.warn("Persist refund warning:", e.message);
  }
}

// POST cancel order
// body: { reason, cancelledBy }
app.post("/api/orders/:id/cancel", requireSession, (req, res) => {
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
    order._prevStatus = order.status; // preserve for audit
    order.status = "cancelled";
    order.cancelledAt = now;
    order.cancelReason = reason.trim();
    order.cancelledBy = cancelledBy || "Unknown";
    order.cancelApprovedBy = managerName;

    _persistCancel(order);

    // Broadcast with previousStatus for PHANTOM_CUP + CANCEL_PROD detection
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
    });

    // Refund/Cancel anomaly tracking → pos_events + audit_anomalies
    Promise.resolve(global.processRefundCancel?.({
      type: 'cancel',
      order_ref: order.id,
      amount: order.total,
      kasir: order.cancelledBy,
      manager_id: order.cancelApprovedBy,
      reason: order.cancelReason,
      items: order.items,
      original_sale_at: order.time ? Math.floor(order.time / 1000) : null,
    })).catch(() => {});

    res.json({ ok: true, order });
  } catch (e) {
    console.error("Cancel error:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST refund order
// body: { amount, reason, refundedBy, fullRefund? }
app.post("/api/orders/:id/refund", requireAdmin, (req, res) => {
  try {
    const { amount, reason, refundedBy, fullRefund, managerPin } = req.body || {};

    // ── AUDIT: Reason wajib ──
    if (!reason || reason.trim().length < 3) {
      return res.status(400).json({ error: "Alasan refund wajib diisi (min 3 karakter)" });
    }

    // ── AUDIT: Manager PIN wajib ──
    let refundManagerName = "Unknown";
    try {
      const { getDb } = require("./command-center-backend");
      const mgr = getDb().prepare("SELECT id, name FROM admin_users WHERE pin = ? AND role = 'manager'").get(managerPin);
      if (!mgr) return res.status(403).json({ error: "PIN Manager wajib & harus valid untuk refund" });
      refundManagerName = mgr.name;
    } catch(e) {
      console.warn("[Audit] PIN verify fallback:", e.message);
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "cancelled" || order.status === "void") {
      return res.status(400).json({ error: "Order is cancelled — cannot refund" });
    }
    if (order.status === "refunded" && !fullRefund) {
      return res.status(400).json({ error: "Order already fully refunded" });
    }

    const orderTotal = order.total || 0;
    const alreadyRefunded = order.refundedAmount || 0;
    const maxRefundable = orderTotal - alreadyRefunded;

    let refundAmount;
    if (fullRefund) {
      refundAmount = maxRefundable;
    } else {
      refundAmount = parseInt(amount);
      if (isNaN(refundAmount) || refundAmount <= 0) {
        return res.status(400).json({ error: "Invalid refund amount" });
      }
      if (refundAmount > maxRefundable) {
        return res.status(400).json({
          error: `Refund amount exceeds refundable (max: ${maxRefundable})`,
          maxRefundable
        });
      }
    }

    const now = Date.now();
    order.refundedAmount = alreadyRefunded + refundAmount;
    order.refundedAt = now;
    order.refundedBy = refundedBy || "Unknown";
    order.refundReason = reason || "No reason provided";

    // Mark fully refunded
    if (order.refundedAmount >= orderTotal) {
      order.status = "refunded";
    } else {
      order.status = "partial_refund";
    }

    _persistRefund(order);

    _broadcast("order:refunded", {
      orderId: order.id,
      refundedAmount: refundAmount,
      totalRefunded: order.refundedAmount,
      status: order.status,
      reason: order.refundReason,
      by: order.refundedBy
    });

    // Refund/Cancel anomaly tracking → pos_events + audit_anomalies
    Promise.resolve(global.processRefundCancel?.({
      type: 'refund',
      order_ref: order.id,
      amount: refundAmount,
      kasir: order.refundedBy,
      manager_id: refundManagerName,
      reason: order.refundReason,
      items: order.items,
      original_sale_at: order.time ? Math.floor(order.time / 1000) : null,
    })).catch(() => {});

    res.json({
      ok: true,
      order,
      refundAmount,
      totalRefunded: order.refundedAmount,
      remaining: orderTotal - order.refundedAmount
    });
  } catch (e) {
    console.error("Refund error:", e);
    res.status(500).json({ error: e.message });
  }
});

// GET orders with refund/cancel filter
app.get("/api/order-audit", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const filtered = orders
      .filter(o => o.status === "cancelled" || o.status === "refunded" || o.status === "partial_refund")
      .sort((a, b) => (b.cancelledAt || b.refundedAt || 0) - (a.cancelledAt || a.refundedAt || 0))
      .slice(0, limit)
      .map(o => ({
        id: o.id,
        time: o.time,
        status: o.status,
        total: o.total,
        kasir: o.kasir,
        customer_name: o.customer_name,
        cancelledAt: o.cancelledAt,
        cancelledBy: o.cancelledBy,
        cancelReason: o.cancelReason,
        refundedAt: o.refundedAt,
        refundedBy: o.refundedBy,
        refundReason: o.refundReason,
        refundedAmount: o.refundedAmount || 0
      }));
    res.json(filtered);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// PATCH ORDER ITEMS (for adding/updating items in tab_open order)
// ═══════════════════════════════════════════════════════════
app.patch("/api/orders/:id/items", requireSession, (req, res) => {
  try {
    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "tab_open") {
      return res.status(400).json({ error: "Only tab_open orders can be updated (current: " + order.status + ")" });
    }

    const { items, subtotal, tax, total } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items array required" });
    }

    // Update in-memory
    order.items = items;
    if (subtotal !== undefined) order.subtotal = subtotal;
    if (tax !== undefined) order.tax = tax;
    if (total !== undefined) order.total = total;

    // Persist
    try {
      if (db && typeof db.updateOrderItems === 'function') {
        db.updateOrderItems(order.id, items, subtotal, tax, total);
      } else {
        console.warn("db.updateOrderItems not available");
      }
    } catch (e) {
      console.warn("Persist items warning:", e.message);
    }

    // Broadcast
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const msg = JSON.stringify({
          event: "order:items_updated",
          data: { orderId: order.id, items, subtotal, tax, total }
        });
        wss.clients.forEach(c => {
          try { if (c.readyState === 1) c.send(msg); } catch (e) {}
        });
      }
    } catch (e) {}

    res.json({ ok: true, order });
  } catch (e) {
    console.error("PATCH items error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// MERGE TABS ENDPOINT
// Combines multiple tab_open orders into one target tab
// ═══════════════════════════════════════════════════════════
app.post("/api/orders/merge", (req, res) => {
  try {
    const { sourceIds, targetId, mergedBy } = req.body || {};

    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      return res.status(400).json({ error: "sourceIds array required" });
    }
    if (!targetId) {
      return res.status(400).json({ error: "targetId required" });
    }
    if (sourceIds.includes(targetId)) {
      return res.status(400).json({ error: "Target cannot be in sources" });
    }

    // Find target
    const target = orders.find(o => o.id === targetId);
    if (!target) return res.status(404).json({ error: "Target order not found" });
    if (target.status !== "tab_open") {
      return res.status(400).json({ error: "Target must be tab_open (current: " + target.status + ")" });
    }

    // Find all sources
    const sources = [];
    for (const sid of sourceIds) {
      const s = orders.find(o => o.id === sid);
      if (!s) return res.status(404).json({ error: "Source not found: " + sid });
      if (s.status !== "tab_open") {
        return res.status(400).json({ error: `Source ${sid} must be tab_open (current: ${s.status})` });
      }
      sources.push(s);
    }

    // Merge: combine items, recompute totals
    const mergedItems = [...(target.items || [])];
    let mergedSubtotal = target.subtotal || 0;

    for (const s of sources) {
      mergedItems.push(...(s.items || []));
      mergedSubtotal += (s.subtotal || s.total || 0);
    }

    // Update target in memory
    target.items = mergedItems;
    target.subtotal = mergedSubtotal;
    target.total = mergedSubtotal;
    target.tax = Math.round(mergedSubtotal * 0.1 / 1.1);

    // Persist target
    try {
      if (db && typeof db.updateOrderItems === 'function') {
        db.updateOrderItems(target.id, target.items, target.subtotal, target.tax, target.total);
      }
    } catch (e) {
      console.warn("Persist merge target:", e.message);
    }

    // Cancel each source with audit
    const now = Date.now();
    const cancelledSources = [];
    for (const s of sources) {
      s.status = "cancelled";
      s.cancelledAt = now;
      s.cancelReason = `Merged into ${targetId}`;
      s.cancelledBy = mergedBy || "Unknown";

      try {
        if (db && typeof db.updateOrderCancel === 'function') {
          db.updateOrderCancel(s.id, now, s.cancelReason, s.cancelledBy);
        }
      } catch (e) {
        console.warn("Persist merge cancel:", e.message);
      }

      cancelledSources.push(s.id);
    }

    // Broadcast
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const msg = JSON.stringify({
          event: "tabs:merged",
          data: { sourceIds: cancelledSources, targetId, mergedItems: mergedItems.length, total: mergedSubtotal }
        });
        wss.clients.forEach(c => {
          try { if (c.readyState === 1) c.send(msg); } catch (e) {}
        });
      }
    } catch (e) {}

    res.json({
      ok: true,
      target: target,
      mergedSources: cancelledSources,
      itemCount: mergedItems.length,
      total: mergedSubtotal
    });
  } catch (e) {
    console.error("Merge error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ═══════════════════════════════════════════════════════════
// SPLIT SETTLE - close tab_open with multiple payments
// ═══════════════════════════════════════════════════════════
app.post("/api/orders/:id/split-settle", (req, res) => {
  try {
    const { payments } = req.body || {};

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ error: "payments array required" });
    }

    const order = orders.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "tab_open" && order.status !== "waiting") {
      return res.status(400).json({ error: "Order must be tab_open or waiting (current: " + order.status + ")" });
    }

    // Validate total
    const total = order.total || 0;
    const sumPayments = payments.reduce((s, p) => s + (parseInt(p.amount) || 0), 0);
    if (sumPayments < total) {
      return res.status(400).json({
        error: `Payments sum (${sumPayments}) below order total (${total})`,
        shortfall: total - sumPayments
      });
    }

    // Build pay string for backward compat (CASH or QRIS or SPLIT)
    const methods = [...new Set(payments.map(p => p.method))];
    const payField = methods.length === 1 ? methods[0] : "SPLIT";

    // Stamp time on each payment
    const now = Date.now();
    const stamped = payments.map(p => ({
      ...p,
      at: p.at || now,
    }));

    // Update in-memory
    order.status = "completed";
    order.pay = payField;
    order.payments = stamped;

    // Persist
    try {
      if (db && typeof db.updateOrderPayments === 'function') {
        db.updateOrderPayments(order.id, "completed", payField, stamped);
      }
    } catch (e) {
      console.warn("Persist split-settle:", e.message);
    }

    // Free up table if dine-in
    if (order.type === "dine" && order.table && order.table !== "-") {
      fetch(`http://localhost:${PORT || 3011}/api/tables/${order.table}`, {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({status: "available"})
      }).catch(() => {});
    }

    // Broadcast
    try {
      if (typeof wss !== 'undefined' && wss && wss.clients) {
        const msg = JSON.stringify({
          event: "order:split_settled",
          data: { orderId: order.id, payments: stamped, pay: payField }
        });
        wss.clients.forEach(c => {
          try { if (c.readyState === 1) c.send(msg); } catch (e) {}
        });
      }
    } catch (e) {}

    res.json({ ok: true, order, total, paid: sumPayments });
  } catch (e) {
    console.error("Split settle error:", e);
    res.status(500).json({ error: e.message });
  }
});


// ─── AUDIT AUTH MIDDLEWARE ───────────────────────────────
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

// ─── NAMESPACE-LEVEL ADMIN GATES (RBAC sweep round 2) ──────────────────
// Routes di bawah path-path ini SEMUA admin-only. Apply guard di mount level
// supaya gak perlu touch tiap router.post/put/patch/delete di setiap module file.
// Public routes seperti POS/kiosk/auth tetap unguarded (path-nya beda).
const ADMIN_NAMESPACES = [
  // Financial / accounting
  "/api/ap-aging", "/api/ar", "/api/budget", "/api/budget-plan",
  "/api/cash-flow", "/api/coa", "/api/consolidation", "/api/core-tax",
  "/api/finance-alerts", "/api/finance-center", "/api/financial-statements",
  "/api/food-cost", "/api/food-cost-calc", "/api/general-ledger",
  "/api/journal", "/api/billing",
  // Operations / procurement
  "/api/auto-reorder", "/api/batch-tracking", "/api/delivery-order",
  "/api/goods-delivery", "/api/goods-received", "/api/internal-return",
  // Compliance / audit / risk
  "/api/anti-fraud", "/api/approval", "/api/compliance",
  "/api/incidents", "/api/internal-audit",
  // HR / staff intelligence
  "/api/hr-command", "/api/hris", "/api/cashier-kpi", "/api/leaderboard",
  "/api/motivation", "/api/departments",
  // Master / catalog admin
  "/api/master-category", "/api/master-unit", "/api/item-config",
  "/api/item-intel", "/api/item-pricing", "/api/item-rules",
  // Business intelligence
  "/api/analytics", "/api/clv-churn", "/api/customer-intel",
  "/api/demand-forecast", "/api/executive", "/api/feedback-segment",
  "/api/geo-engagement", "/api/marketing-behavior", "/api/owner-dashboard",
  // Other admin
  "/api/asset-maintenance", "/api/campaign-impact", "/api/contract",
  "/api/document-hub", "/api/franchise", "/api/helpdesk",
  "/api/launch", "/api/notification-center", "/api/notifications",
  "/api/onboarding",
  // NOTE: /api/outlet-master + /api/outlets dikeluarkan dari namespace gate
  // karena Cinema Web public butuh GET listing outlet (pilih lokasi).
  // Mutation endpoints (POST/PUT/PATCH/DELETE) di outlet-master-backend.js
  // pakai requireAdmin per-route — lihat module file.
];
for (const ns of ADMIN_NAMESPACES) app.use(ns, requireAdmin);
console.log(`🔒 RBAC: ${ADMIN_NAMESPACES.length} namespaces now require admin`);

// ─── COMMAND CENTER AUDIT MODULE ───────────────────────
const { initAuditModule, registerAuditEndpoints, auditEngine } = require("./command-center-backend");
initAuditModule(db);
registerAuditEndpoints(app, db);
console.log("📊 Command Center audit module loaded");

// ════════════════════════════════════════════════════════════
// BITES-KIOSK WAVE 1+2+3 INTEGRATION  (installed 2026-05-20)
// `path`/`app`/`db` already declared above. DB_PATH points at the
// shared server/data.db so bridge + finance see existing data.
// ════════════════════════════════════════════════════════════
const { setupMasterItems }      = require('./master-items-backend');
const { setupPhase4B }          = require('./pos-phase4b-backend');
const { setupMenuBuilder }      = require('./master-menu-builder-backend');
const { setupProcurementGaps }  = require('./procurement-gaps-backend');
const { setupFinance }          = require('./finance-backend');
const { setupFinanceDashboard } = require('./finance-dashboard-endpoints');
const { setupBridge }           = require('./procurement-finance-bridge');
const { setupNotifications }    = require('./notifications-backend');
const { setupProcurement }      = require('./procurement-backend');
const { setupShiftStaff }       = require('./shift-staff-backend');
const { setupKDS }              = require('./kds-backend');
const { setupRefundCancel }     = require('./refund-cancel-backend');
const { setupAggregator }       = require('./aggregator-backend');
const { setupPaymentGateway }   = require('./payment-gateway-backend');
const { setupLoyalty }          = require('./loyalty-backend');
const { setupFeedback }         = require('./feedback-backend');
const { setupCashierKpi }       = require('./cashier-kpi-backend');
const { setupChecklist }        = require('./checklist-backend');
const { setupPosBehavior }      = require('./pos-behavior-backend');
const { setupExecutive }        = require('./executive-backend');
const { setupSections }         = require('./sections-backend');
const { setupHris }             = require('./hris-backend');
const { setupTalenta }          = require('./talenta-backend');
const { setupPromoInsight }     = require('./promo-insight-backend');
const { setupLeaderboard }      = require('./leaderboard-backend');
const { setupBroadcast }        = require('./broadcast-backend');
const { setupOutlets }          = require('./outlets-backend');
const { setupEngagement }       = require('./engagement-backend');
const { setupAnalytics }        = require('./analytics-backend');
const { setupPriceList }        = require('./price-list-backend');
const { setupGoodsDelivery }    = require('./goods-delivery-backend');
const { setupPurchaseInvoice }  = require('./purchase-invoice-backend');
const { setupSettlement }       = require('./settlement-backend');
const { setupJournal }          = require('./journal-backend');
const { setupFinancialStatements } = require('./financial-statements-backend');
const { setupFinanceCenter }    = require('./finance-center-backend');
const { setupFinanceAlerts }    = require('./finance-alert-backend');
const { setupAR }               = require('./ar-backend');
const { setupBudget }           = require('./budget-backend');
const { setupPayroll }          = require('./payroll-backend');
const { setupFranchise }        = require('./franchise-backend');
const { setupFoodCost }         = require('./food-cost-backend');
const { setupConvenienceFee }   = require('./convenience-fee-backend');
const { setupRewards }          = require('./reward-backend');
const { setupRewardBenefits }   = require('./reward-benefit-backend');
const { setupMotivation }       = require('./motivation-backend');
const { setupHRCommand }        = require('./hr-command-backend');
const { setupAntiFraud }        = require('./anti-fraud-backend');
const { setupCustomerIntel }    = require('./customer-intel-backend');
const { setupMarketingBehavior } = require('./marketing-behavior-backend');
const { setupLoyaltyPromo }     = require('./loyalty-promo-backend');
const { setupFeedbackSegment }  = require('./feedback-segment-backend');
const { setupClvChurn }         = require('./clv-churn-backend');
const { setupGeoEngagement }    = require('./geo-engagement-backend');
const { setupCampaignImpact }   = require('./campaign-impact-backend');
const { setupRBAC }             = require('./rbac-backend');
const { setupApprovalEngine }   = require('./approval-engine-backend');
const { setupDeviceSession }    = require('./device-session-backend');
const { setupSecurityCenter }   = require('./security-center-backend');
const { setupRoleDashboard }    = require('./role-dashboard-backend');
const { setupItemMaster }       = require('./item-master-backend');
const { setupItemPricing }      = require('./item-pricing-backend');
const { setupItemConfig }       = require('./item-config-backend');
const { setupItemRules }        = require('./item-rules-backend');
const { setupItemIntel }        = require('./item-intel-backend');
const { setupProductHub }       = require('./product-hub-backend');
const { setupProductVersioning } = require('./product-versioning-backend');
const { setupGoodsReceived }    = require('./goods-received-backend');
const { setupSimplePurchase }   = require('./simple-purchase-backend');
const { setupPettyCash }        = require('./petty-cash-backend');
const { setupBudgetPlan }       = require('./budget-plan-backend');
const { setupGeneralLedger }    = require('./general-ledger-backend');
const { setupReconciliation }   = require('./reconciliation-backend');
const { setupReleasePayment }   = require('./release-payment-backend');
const { setupPeriodClosing }    = require('./period-closing-backend');
const { setupStockOpname }      = require('./stock-opname-backend');
const { setupProduction }       = require('./production-backend');
const { setupStockTransfer }    = require('./stock-transfer-backend');
const { setupBatchTracking }    = require('./batch-tracking-backend');
const { setupOutletMaster }     = require('./outlet-master-backend');
const { setupIncidents }        = require('./incident-backend');
const { setupSignage }          = require('./signage-backend');
const { setupDemandForecast }   = require('./demand-forecast-backend');
const { setupAssetMaintenance } = require('./asset-maintenance-backend');
const { setupShiftRoster }      = require('./shift-roster-backend');
const { setupNotificationCenter } = require('./notification-center-backend');
const { setupAutoReorder }      = require('./auto-reorder-backend');
const { setupSalesStockSync }   = require('./sales-stock-sync-backend');
const { setupCoa }              = require('./coa-backend');
const { setupPurchaseReturn }   = require('./purchase-return-backend');
const { setupInternalReturn }   = require('./internal-return-backend');
const { setupStockList }        = require('./stock-list-backend');
const { setupSalesOrder }       = require('./sales-order-backend');
const { setupSalesReturn }      = require('./sales-return-backend');
const { setupB2bCustomer }      = require('./b2b-customer-backend');
const { setupSalesInvoice }     = require('./sales-invoice-backend');
const { setupQuotation }        = require('./quotation-backend');
const { setupDeliveryOrder }    = require('./delivery-order-backend');
const { setupSelfAudit }        = require('./self-audit-backend');
const { setupConsolidation }    = require('./consolidation-backend');
const { setupCoreTax }          = require('./core-tax-backend');
const { setupMasterUnit }       = require('./master-unit-backend');
const { setupMasterCategory }   = require('./master-category-backend');
const { setupFoodCostCalc }     = require('./food-cost-calc-backend');
const { setupCashFlow }         = require('./cash-flow-backend');
const { setupSupplierMaster }   = require('./supplier-master-backend');
const { setupApAging }          = require('./ap-aging-backend');
const { setupCompliance }       = require('./compliance-backend');
const { setupSalesPipeline }    = require('./sales-pipeline-backend');
const { setupContract }         = require('./contract-backend');
const { setupRfq }              = require('./rfq-backend');
const { setupRisk }             = require('./risk-backend');
const { setupQuality }          = require('./quality-backend');
const { setupInternalAudit }    = require('./internal-audit-backend');
const { setupDocumentHub }      = require('./document-hub-backend');
const { setupHelpdesk }         = require('./helpdesk-backend');

const DB_PATH = require('path').join(__dirname, 'data.db');   // shared with db.js

const procurement     = setupProcurement(app,     { dbPath: DB_PATH, mountPath: '/api/procurement' });
const masterItems     = setupMasterItems(app,     { dbPath: DB_PATH, mountPath: '/api/master', uploadMiddleware: upload });
const phase4b         = setupPhase4B(app,         { dbPath: DB_PATH, mountPath: '/api/pos' });
const menuBuilder     = setupMenuBuilder(app,     { dbPath: DB_PATH, mountPath: '/api/master' });
const procurementGaps = setupProcurementGaps(app, { dbPath: DB_PATH, mountPath: '/api/procurement' });
const finance         = setupFinance(app,         { dbPath: DB_PATH, mountPath: '/api/finance' });
setupFinanceDashboard(app, { dbPath: DB_PATH });
const { setupCinema } = require('./cinema-backend');
setupCinema(app, { dbPath: DB_PATH, broadcast, tcpPrint, midtransRequest });
const { setupFnbFeatures } = require('./fnb-features-backend');
setupFnbFeatures(app, { dbPath: DB_PATH, requireAdmin });
// MUST mount AFTER setupCinema/setupFnbFeatures — companies-backend ALTERs their tables
const { setupCompanies } = require('./companies-backend');
const companies = setupCompanies(app, { dbPath: DB_PATH, uploadMiddleware: upload, requireAdmin });

// White-label P2B — per-tenant encrypted API keys
const { setupTenantIntegrations } = require('./tenant-integrations');
const tenantIntegrations = setupTenantIntegrations(app, { dbPath: DB_PATH });

// White-label P2C — GDPR-ready data export per tenant
const { setupTenantDataExport } = require('./tenant-data-export');
setupTenantDataExport(app, { dbPath: DB_PATH });

// White-label P2D — per-tenant audit log
const { setupTenantAuditLog, logAudit } = require('./tenant-audit-log');
setupTenantAuditLog(app, { dbPath: DB_PATH });
global.logAudit = logAudit; // make available everywhere

// White-label P3D — TOTP 2FA for super-admin / owner / admin
// `twoFA` was forward-declared near adminSessions so login handler can reference it
const { setup2FA: _setup2FA } = require('./auth-2fa');
twoFA = _setup2FA(app, { db, adminSessions, dbPath: DB_PATH });

// White-label P4A — outbound webhooks per tenant
const { setupTenantWebhooks } = require('./tenant-webhooks');
const _wh = setupTenantWebhooks(app, { dbPath: DB_PATH });
global.emitWebhook = _wh.emit;  // call from anywhere: global.emitWebhook(companyId, 'order.created', {...})

// White-label P4B — tenant-facing public REST API + API keys
const { setupTenantApiKeys } = require('./tenant-api-keys');
setupTenantApiKeys(app, { dbPath: DB_PATH });

// White-label P4D — in-product announcements + changelog
const { setupAnnouncements } = require('./announcements');
setupAnnouncements(app, { dbPath: DB_PATH, adminSessions });

// Web Push notifications — VAPID + per-customer push subscription store
const { setupWebPush } = require('./web-push');
const _push = setupWebPush(app, { dbPath: DB_PATH });
global.sendPushToOrder = _push.sendToOrder;
global.sendPushToPhone = _push.sendToPhone;
global.sendPushToCompany = _push.sendToCompany;
// Expose resolveScope helper to global (semua endpoint lain bisa pakai untuk filter)
global.resolveCompanyScope = companies.resolveScope;

// Mass migration: ALTER all leaky tables ADD COLUMN company_id + backfill.
// MUST run after companies table exists (setupCompanies creates it).
const { massMigrate } = require('./multi-tenant-mass-migrate');
massMigrate({ dbPath: DB_PATH });
console.log('[multi-tenant] mass migration done');
const { setupOwnerDashboardExtras } = require('./owner-dashboard-extras');
setupOwnerDashboardExtras(app, { dbPath: DB_PATH });

// Billing Engine — SaaS subscription + MRR/ARR + invoice generation
// MUST mount AFTER setupCompanies (depends on companies table for seed orphan-trial assignment)
const { setupBillingEngine } = require('./billing-engine-backend');
setupBillingEngine(app, { dbPath: DB_PATH });

// Onboarding sample data starter pack — POST /api/onboarding/seed-sample
const { setupOnboarding } = require('./onboarding-backend');
setupOnboarding(app, { dbPath: DB_PATH });
const bridge          = setupBridge(app,          { dbPath: DB_PATH, mountPath: '/api/bridge' });
const notifications   = setupNotifications(app, {
  dbPath: DB_PATH,
  mountPath: '/api/notifications',
  scheduler: {
    low_stock_interval_ms: 5 * 60 * 1000,
    anomaly_interval_ms: 60 * 1000,
    aging_hour: 9,
    summary_hour: 21
  }
});

const shiftStaff = setupShiftStaff(app, { dbPath: DB_PATH });
const kds = setupKDS(app, { dbPath: DB_PATH });
const refundCancel = setupRefundCancel(app, { dbPath: DB_PATH });
const aggregator = setupAggregator(app, { dbPath: DB_PATH });
const paymentGateway = setupPaymentGateway(app, { dbPath: DB_PATH, requireAdmin });
const loyaltyMod = setupLoyalty(app, { dbPath: DB_PATH });
const feedback = setupFeedback(app, { dbPath: DB_PATH });
const cashierKpi = setupCashierKpi(app, { dbPath: DB_PATH });
const checklist = setupChecklist(app, { dbPath: DB_PATH });
const posBehavior = setupPosBehavior(app, { dbPath: DB_PATH });
const executive = setupExecutive(app, { dbPath: DB_PATH });
const sections = setupSections(app, { dbPath: DB_PATH });
const hris = setupHris(app, { dbPath: DB_PATH });
const talenta = setupTalenta(app, { dbPath: DB_PATH });
const promoInsight = setupPromoInsight(app, { dbPath: DB_PATH });
const leaderboard = setupLeaderboard(app, { dbPath: DB_PATH, sendEmail: emailModule.sendEmail });
const promoBroadcast = setupBroadcast(app, { dbPath: DB_PATH });
const outletsMod = setupOutlets(app, { dbPath: DB_PATH });
const engagement = setupEngagement(app, { dbPath: DB_PATH });
const analytics = setupAnalytics(app, { dbPath: DB_PATH });
const priceList = setupPriceList(app, { dbPath: DB_PATH });
const goodsDelivery = setupGoodsDelivery(app, { dbPath: DB_PATH });
const purchaseInvoice = setupPurchaseInvoice(app, { dbPath: DB_PATH });
const settlement = setupSettlement(app, { dbPath: DB_PATH });
const journal = setupJournal(app, { dbPath: DB_PATH });
const finStatements = setupFinancialStatements(app, { dbPath: DB_PATH });
const financeCenter = setupFinanceCenter(app, { dbPath: DB_PATH });
const financeAlerts = setupFinanceAlerts(app, { dbPath: DB_PATH });
const ar = setupAR(app, { dbPath: DB_PATH });
const budget = setupBudget(app, { dbPath: DB_PATH });
const payroll = setupPayroll(app, { dbPath: DB_PATH });
const franchise = setupFranchise(app, { dbPath: DB_PATH });
const foodCost = setupFoodCost(app, { dbPath: DB_PATH });
const convenienceFee = setupConvenienceFee(app, { dbPath: DB_PATH, requireAdmin });
const rewards = setupRewards(app, { dbPath: DB_PATH });
const rewardBenefits = setupRewardBenefits(app, { dbPath: DB_PATH });
const motivation = setupMotivation(app, { dbPath: DB_PATH });
const hrCommand = setupHRCommand(app, { dbPath: DB_PATH });
const antiFraud = setupAntiFraud(app, { dbPath: DB_PATH });
const customerIntel = setupCustomerIntel(app, { dbPath: DB_PATH });
const marketingBehavior = setupMarketingBehavior(app, { dbPath: DB_PATH });
const loyaltyPromo = setupLoyaltyPromo(app, { dbPath: DB_PATH });
const feedbackSegment = setupFeedbackSegment(app, { dbPath: DB_PATH });
const clvChurn = setupClvChurn(app, { dbPath: DB_PATH });
const geoEngagement = setupGeoEngagement(app, { dbPath: DB_PATH });
const campaignImpact = setupCampaignImpact(app, { dbPath: DB_PATH });
const rbac = setupRBAC(app, { dbPath: DB_PATH });
const approvalEngine = setupApprovalEngine(app, { dbPath: DB_PATH });
const deviceSession = setupDeviceSession(app, { dbPath: DB_PATH });
const securityCenter = setupSecurityCenter(app, { dbPath: DB_PATH });
const roleDashboard = setupRoleDashboard(app, { dbPath: DB_PATH });
const itemMaster = setupItemMaster(app, { dbPath: DB_PATH, uploadMiddleware: upload, requireAdmin });
const itemPricing = setupItemPricing(app, { dbPath: DB_PATH });
const itemConfig = setupItemConfig(app, { dbPath: DB_PATH });
const itemRules = setupItemRules(app, { dbPath: DB_PATH });
const itemIntel = setupItemIntel(app, { dbPath: DB_PATH });
const productHub = setupProductHub(app, { dbPath: DB_PATH });
const productVersioning = setupProductVersioning(app, { dbPath: DB_PATH });
const goodsReceived = setupGoodsReceived(app, { dbPath: DB_PATH });
const simplePurchase = setupSimplePurchase(app, { dbPath: DB_PATH });
const pettyCash = setupPettyCash(app, { dbPath: DB_PATH });
const budgetPlan = setupBudgetPlan(app, { dbPath: DB_PATH });
const generalLedger = setupGeneralLedger(app, { dbPath: DB_PATH });
const reconciliation = setupReconciliation(app, { dbPath: DB_PATH });
const releasePayment = setupReleasePayment(app, { dbPath: DB_PATH });
const periodClosing = setupPeriodClosing(app, { dbPath: DB_PATH });
const stockOpname = setupStockOpname(app, { dbPath: DB_PATH });
const production = setupProduction(app, { dbPath: DB_PATH });
const stockTransfer = setupStockTransfer(app, { dbPath: DB_PATH });
const batchTracking = setupBatchTracking(app, { dbPath: DB_PATH });
const outletMaster = setupOutletMaster(app, { dbPath: DB_PATH, requireAdmin });
const incidents = setupIncidents(app, { dbPath: DB_PATH });
const signage = setupSignage(app, { dbPath: DB_PATH });
const demandForecast = setupDemandForecast(app, { dbPath: DB_PATH });
const assetMaintenance = setupAssetMaintenance(app, { dbPath: DB_PATH });
const shiftRoster = setupShiftRoster(app, { dbPath: DB_PATH });
const notificationCenter = setupNotificationCenter(app, { dbPath: DB_PATH });
const autoReorder = setupAutoReorder(app, { dbPath: DB_PATH });
const salesStockSync = setupSalesStockSync(app, { dbPath: DB_PATH });
const coa = setupCoa(app, { dbPath: DB_PATH });
const purchaseReturn = setupPurchaseReturn(app, { dbPath: DB_PATH });
const internalReturn = setupInternalReturn(app, { dbPath: DB_PATH });
const stockList = setupStockList(app, { dbPath: DB_PATH });
const salesOrder = setupSalesOrder(app, { dbPath: DB_PATH });
const salesReturn = setupSalesReturn(app, { dbPath: DB_PATH });
const b2bCustomer = setupB2bCustomer(app, { dbPath: DB_PATH });
const salesInvoice = setupSalesInvoice(app, { dbPath: DB_PATH });
const quotation = setupQuotation(app, { dbPath: DB_PATH });
const deliveryOrder = setupDeliveryOrder(app, { dbPath: DB_PATH });
const selfAudit = setupSelfAudit(app, { dbPath: DB_PATH });
const { setupRemoteOps } = require('./remote-ops-backend');
const remoteOps = setupRemoteOps(app, { dbPath: DB_PATH });
const { setupOutletLaunch } = require('./outlet-launch-backend');
const outletLaunch = setupOutletLaunch(app, { dbPath: DB_PATH });
const { setupServiceVisit } = require('./service-visit-backend');
const serviceVisit = setupServiceVisit(app, { dbPath: DB_PATH });
const { setupDepartments } = require('./departments-backend');
const departmentsMod = setupDepartments(app, { dbPath: DB_PATH });
const { setupUserKpi } = require('./user-kpi-backend');
const userKpiMod = setupUserKpi(app, { dbPath: DB_PATH });
const { setupSeed } = require('./seed-backend');
const seedMod = setupSeed(app, { dbPath: DB_PATH });
const consolidation = setupConsolidation(app, { dbPath: DB_PATH });
const coreTax = setupCoreTax(app, { dbPath: DB_PATH });
const masterUnit = setupMasterUnit(app, { dbPath: DB_PATH });
const masterCategory = setupMasterCategory(app, { dbPath: DB_PATH });
const foodCostCalc = setupFoodCostCalc(app, { dbPath: DB_PATH });
const cashFlow = setupCashFlow(app, { dbPath: DB_PATH });
const supplierMaster = setupSupplierMaster(app, { dbPath: DB_PATH });
const apAging = setupApAging(app, { dbPath: DB_PATH });
const compliance = setupCompliance(app, { dbPath: DB_PATH });
const salesPipeline = setupSalesPipeline(app, { dbPath: DB_PATH });
const contract = setupContract(app, { dbPath: DB_PATH });
const rfq = setupRfq(app, { dbPath: DB_PATH });
const risk = setupRisk(app, { dbPath: DB_PATH });
const quality = setupQuality(app, { dbPath: DB_PATH });
const internalAudit = setupInternalAudit(app, { dbPath: DB_PATH });
const documentHub = setupDocumentHub(app, { dbPath: DB_PATH });
const helpdesk = setupHelpdesk(app, { dbPath: DB_PATH });

global.consumeStockForOrder  = menuBuilder.consumeStockForOrderV2;
global.logPosEvent           = phase4b.logPosEvent;
global.getConfig             = phase4b.getConfig;
global.onGoodsReceived       = bridge.onGoodsReceived;
global.onPaymentRecorded     = bridge.onPaymentRecorded;
global.dispatchNotification  = notifications.dispatch;
global.createExpense         = finance.createExpense;
global.createKitchenTickets  = kds.createTicketsForOrder;
// Sinkron status order pas KDS majuin ticket → customer tracking (kiosk/QR) live
global.updateOrderStatusFromKds = (orderRef, status) => {
  const idx = orders.findIndex(o => o.id === orderRef);
  if (idx === -1) return;
  orders[idx] = { ...orders[idx], status, updatedAt: Date.now() };
  try { db.updateOrderStatus(orderRef, status); } catch (e) {}
};
global.processRefundCancel   = refundCancel.processEvent;
global.persistAggregatorOrder = aggregator.persistOrder;
global.loyaltyEarn           = loyaltyMod.earn;
global.loyaltyRedeem         = loyaltyMod.redeem;

console.log('━━━ Bites-Kiosk Wave 1+2+3 — semua module loaded ━━━');
// ════════════════════════════════════════════════════════════

server.listen(PORT, () => {
  console.log("");
  console.log("🍽️  KaryaOS BACKEND");
  console.log("─────────────────────────────");
  console.log(`🚀 REST API  : http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket : ws://localhost:${PORT}`);
  console.log(`❤️  Health   : http://localhost:${PORT}/api/health`);
  console.log("─────────────────────────────");
  console.log("");
});
