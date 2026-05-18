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
  fromName:    "BINTORO Kiosk",
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

async function sendEmail({ to, subject, html, text, attachments }) {
  const cfg = loadConfig();
  if (!cfg.enabled) throw new Error("Email belum di-enable di admin settings");
  if (!cfg.smtpHost || !cfg.smtpUser) throw new Error("SMTP config tidak lengkap");
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) throw new Error("Recipient kosong");
  const t = createTransporter(cfg);
  const info = await t.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail || cfg.smtpUser}>`,
    to: recipients.join(", "),
    subject: subject || "BINTORO Report",
    html, text,
    attachments,
  });
  console.log(`📧 Email sent → ${recipients.length} recipient(s) · msgId=${info.messageId}`);
  return { ok: true, messageId: info.messageId, recipients };
}

module.exports = { getConfig: loadConfig, getMaskedConfig, saveConfig, testConnection, sendEmail };
