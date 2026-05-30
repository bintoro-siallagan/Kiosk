// ═══════════════════════════════════════════════════════════════
// WhatsApp sender — auto-detects Fonnte or Twilio from env
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const WA_CONFIG_FILE = path.join(__dirname, "wa-config.json");

const DEFAULT_TEMPLATES = {
  // Saat order baru ke-place (status: waiting) — sambutan hangat
  waiting: "💛 Halo {customerName}!\n\nPesanan kamu *#{orderId}* sudah kami terima dengan hati. Tim dapur akan segera menyiapkan.\n\nTotal: *Rp {totalIDR}*\n\nKami kabari lagi saat siap diambil ya 🙏\n\n— {brandName}",
  // Saat ready — siap diambil
  ready: "🛎️ {customerName}, pesanan *#{orderId}* sudah siap!\n\nSilakan ambil di counter — tunjukkan struk atau sebut nomor pesanan.\n\nSelamat menikmati 🌱\n\n— {brandName}",
  // Saat completed — sambutan pulang + rating
  completed: "✅ Terima kasih, {customerName} 💛\n\nPesanan #{orderId} sudah selesai. Kami senang Anda menyempatkan datang.\n\nKalau berkenan, ceritakan pengalaman Anda ya:\n{trackingUrl}\n\nSampai bertemu lagi.\n— {brandName}",
};

function loadConfig() {
  const defaults = {
    enabled: { waiting: true, ready: true, completed: false },
    provider: null,  // "fonnte" | "twilio" | null (auto-detected)
    templates: { ...DEFAULT_TEMPLATES },
    fonnte:  { token: process.env.FONNTE_TOKEN  || "" },
    twilio:  { sid: process.env.TWILIO_SID || "", token: process.env.TWILIO_TOKEN || "", from: process.env.TWILIO_FROM || "" },
  };
  try {
    if (fs.existsSync(WA_CONFIG_FILE)) {
      const p = JSON.parse(fs.readFileSync(WA_CONFIG_FILE, "utf-8"));
      return {
        ...defaults, ...p,
        enabled:   { ...defaults.enabled, ...(p.enabled||{}) },
        templates: { ...defaults.templates, ...(p.templates||{}) },
        fonnte:    { ...defaults.fonnte, ...(p.fonnte||{}) },
        twilio:    { ...defaults.twilio, ...(p.twilio||{}) },
      };
    }
  } catch (e) { console.warn("wa-config.json corrupt:", e.message); }
  return defaults;
}

let config = loadConfig();

function saveConfig() {
  fs.writeFileSync(WA_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function detectProvider() {
  if (config.provider) return config.provider;
  if (config.fonnte.token) return "fonnte";
  if (config.twilio.sid && config.twilio.token && config.twilio.from) return "twilio";
  return null;
}

function normalizePhone(phone, provider) {
  let p = String(phone || "").replace(/\D/g, "");
  if (!p) return "";
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (p.startsWith("8")) p = "62" + p;
  else if (p.startsWith("620")) p = "62" + p.slice(3);  // catch "620812..."
  return provider === "twilio" ? "+" + p : p;
}

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] !== undefined ? vars[key] : `{${key}}`);
}

async function sendFonnte(phone, message) {
  const body = new URLSearchParams({ target: phone, message });
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: config.fonnte.token },
    body,
  });
  const data = await res.json();
  if (!data.status) throw new Error(data.reason || JSON.stringify(data));
  return data;
}

async function sendTwilio(phone, message) {
  const { sid, token, from } = config.twilio;
  const creds = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${phone}`, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${creds}` },
    body,
  });
  const data = await res.json();
  if (data.error_code) throw new Error(data.message || `Twilio error ${data.error_code}`);
  return data;
}

async function sendMessage(phone, message) {
  const provider = detectProvider();
  if (!provider) {
    console.log(`📱 [LOG-ONLY] WA to ${phone}: ${message.slice(0,60)}…`);
    return { ok: true, provider: "log-only" };
  }
  const normalized = normalizePhone(phone, provider);
  if (!normalized) return { ok: false, error: "invalid phone" };
  try {
    const result = provider === "fonnte" ? await sendFonnte(normalized, message) : await sendTwilio(normalized, message);
    console.log(`📱 WA via ${provider} → ${normalized}: ${message.slice(0,40)}…`);
    return { ok: true, provider, raw: result };
  } catch (e) {
    console.error(`📱 WA send FAILED (${provider} → ${normalized}):`, e.message);
    return { ok: false, provider, error: e.message };
  }
}

// Lookup per-tenant branding for notification footer (white-label P2A)
function _getTenantBrand(companyId) {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(__dirname, 'data.db'), { readonly: true });
    const PLATFORM = ['BTS', 'CMX', 'KARYAOS'];
    const c = db.prepare(`SELECT code, name, brand_short, contact_phone, address, wa_signature FROM companies WHERE id = ?`).get(companyId || 1);
    db.close();
    if (!c) return null;
    const isPlatform = !c.code || PLATFORM.includes(c.code);
    return {
      name: isPlatform ? 'karyaos' : (c.brand_short || c.name),
      phone: c.contact_phone || '',
      address: c.address || '',
      signature: c.wa_signature || '',
    };
  } catch { return null; }
}

async function notifyOrderStatus(order, newStatus) {
  if (!config.enabled[newStatus]) return { ok: false, skipped: "status not enabled" };
  if (!order.customerPhone) return { ok: false, skipped: "no customer phone" };
  const template = config.templates[newStatus];
  if (!template) return { ok: false, skipped: "no template" };
  const trackingBase = process.env.TRACKING_BASE_URL || "";
  const brand = _getTenantBrand(order.companyId) || { name: 'karyaos', phone: '', address: '', signature: '' };
  const vars = {
    customerName: order.customerName || "Customer",
    orderId:      order.id,
    total:        order.total || 0,
    totalIDR:     (order.total || 0).toLocaleString("id-ID"),
    trackingUrl:  trackingBase ? `${trackingBase}/?trackorder=${order.id}` : "",
    date:         new Date(order.time || Date.now()).toLocaleDateString("id-ID"),
    time:         new Date(order.time || Date.now()).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" }),
    // White-label vars
    brandName:    brand.name,
    brandPhone:   brand.phone,
    brandAddress: brand.address,
    signature:    brand.signature,
  };
  let message = fillTemplate(template, vars);
  // Append signature if defined + not already in template
  if (brand.signature && !template.includes('{signature}')) {
    message += `\n\n${brand.signature}`;
  } else if (!brand.signature && !template.includes('{brandName}')) {
    // Default footer with brand name
    message += `\n\n— ${brand.name}`;
  }
  return sendMessage(order.customerPhone, message);
}

module.exports = {
  loadConfig: () => config,
  setConfig:  (patch) => {
    if (patch.provider !== undefined) config.provider = patch.provider;
    if (patch.enabled)   config.enabled   = { ...config.enabled, ...patch.enabled };
    if (patch.templates) config.templates = { ...config.templates, ...patch.templates };
    if (patch.fonnte)    config.fonnte    = { ...config.fonnte, ...patch.fonnte };
    if (patch.twilio)    config.twilio    = { ...config.twilio, ...patch.twilio };
    saveConfig();
    return config;
  },
  detectProvider,
  sendMessage,
  notifyOrderStatus,
};
