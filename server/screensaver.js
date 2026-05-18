// ─── SCREENSAVER CONFIG MODULE ──────────────────────────────────────
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "screensaver-config.json");
const IMAGES_DIR  = path.join(__dirname, "screensaver");
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

const DEFAULTS = {
  enabled:     true,
  intervalSec: 5,
  fadeMs:      800,
  idleSec:     30,   // trigger after this many seconds of idle on welcome
  tagline:     "SENTUH UNTUK MEMESAN",
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
  } catch (e) {
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

function saveConfig(cfg) {
  const merged = { ...DEFAULTS, ...cfg, updatedAt: Date.now() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  _cache = merged;
  return merged;
}

function listImages() {
  try {
    return fs.readdirSync(IMAGES_DIR)
      .filter(f => /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(f))
      .map(f => {
        const stat = fs.statSync(path.join(IMAGES_DIR, f));
        return { name: f, size: stat.size, modified: stat.mtimeMs };
      })
      .sort((a, b) => a.modified - b.modified);
  } catch { return []; }
}

module.exports = { getConfig: loadConfig, saveConfig, listImages, IMAGES_DIR };
