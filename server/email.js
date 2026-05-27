// ─── EMAIL MODULE (SMTP via nodemailer) ──────────────────────────────
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const CONFIG_FILE = path.join(__dirname, "email-config.json");

const DEFAULTS = {
  enabled:     false,
  smtpHost:    "smtp.gmail.com",
  smtpPort:    587,
  smtpSecure:  false,        // false = STARTTLS (port 587), true = SSL (port 465)
  smtpUser:    "",
  smtpPass:    "",
  fromEmail:   "",
  fromName:    "KaryaOS Kiosk",
  recipients:  [],           // default recipient list (admin can override per-send)
  updatedAt:   null,
};

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      _cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
    } else {
      _cache = { ...DEFAULTS };
      saveConfig(_cache);
    }
  } catch (e) { _cache = { ...DEFAULTS }; }
  return _cache;
}

function saveConfig(cfg) {
  const merged = { ...DEFAULTS, ...cfg, updatedAt: Date.now() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  _cache = merged;
  return merged;
}

// Mask password in API responses
function getMaskedConfig() {
  const c = loadConfig();
  return { ...c, smtpPass: c.smtpPass ? "•".repeat(8) + c.smtpPass.slice(-2) : "" };
}

function createTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  });
}

async function testConnection() {
  const cfg = loadConfig();
  if (!cfg.smtpHost || !cfg.smtpUser) throw new Error("SMTP host atau user belum di-set");
  const t = createTransporter(cfg);
  await t.verify();
  return { ok: true, message: "SMTP connection OK" };
}

// Per-tenant sender name + signature lookup (white-label P2A)
function _getTenantEmailBrand(companyId) {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(__dirname, 'data.db'), { readonly: true });
    const PLATFORM = ['BTS', 'CMX', 'KARYAOS'];
    const c = db.prepare(`SELECT code, name, brand_short, contact_email, email_signature FROM companies WHERE id = ?`).get(companyId || 1);
    db.close();
    if (!c) return null;
    const isPlatform = !c.code || PLATFORM.includes(c.code);
    return {
      fromName: isPlatform ? 'karyaos' : (c.brand_short || c.name),
      fromEmail: c.contact_email || null,
      signature: c.email_signature || null,
    };
  } catch { return null; }
}

async function sendEmail({ to, subject, html, text, attachments, companyId }) {
  const cfg = loadConfig();
  if (!cfg.enabled) throw new Error("Email belum di-enable di admin settings");
  if (!cfg.smtpHost || !cfg.smtpUser) throw new Error("SMTP config tidak lengkap");
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) throw new Error("Recipient kosong");
  // Per-tenant from name override
  const brand = _getTenantEmailBrand(companyId);
  const fromName = brand?.fromName || cfg.fromName || 'karyaos';
  // Append signature to text if available
  let finalText = text;
  let finalHtml = html;
  if (brand?.signature) {
    if (finalText) finalText += `\n\n${brand.signature}`;
    if (finalHtml) finalHtml += `<br><br><div style="color:#666;font-size:12px;border-top:1px solid #eee;padding-top:10px;margin-top:20px">${brand.signature.replace(/\n/g, '<br>')}</div>`;
  }
  const t = createTransporter(cfg);
  const info = await t.sendMail({
    from: `"${fromName}" <${cfg.fromEmail || cfg.smtpUser}>`,
    to: recipients.join(", "),
    subject: subject || `${fromName} — Notification`,
    html: finalHtml, text: finalText,
    attachments,
  });
  console.log(`📧 Email sent → ${recipients.length} recipient(s) · from="${fromName}" · msgId=${info.messageId}`);
  return { ok: true, messageId: info.messageId, recipients, from: fromName };
}

module.exports = { getConfig: loadConfig, getMaskedConfig, saveConfig, testConnection, sendEmail };
