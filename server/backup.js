// server/backup.js
//
// Database snapshot automation. Daily backup ke folder backups/,
// retention 7 hari (auto-delete older). Idempotent — gak duplicate
// kalau sudah ada untuk hari yg sama.
//
// Use cases:
// - Recovery dari corruption
// - Restore ke state sebelum perubahan besar
// - Offsite copy untuk disaster scenario

const fs = require("fs");
const path = require("path");

const BACKUP_DIR = path.join(__dirname, "backups");
const RETENTION_DAYS = 7;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function snapshotDb(dbPath) {
  ensureDir();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5).replace(":", ""); // HHMM
  const filename = `data-${dateStr}-${timeStr}.db`;
  const destPath = path.join(BACKUP_DIR, filename);

  // Skip kalau sudah ada backup untuk hari ini (avoid duplicate auto-runs)
  const todayPattern = new RegExp(`^data-${dateStr}-\\d{4}\\.db$`);
  const existing = fs.readdirSync(BACKUP_DIR).filter(f => todayPattern.test(f));
  if (existing.length > 0) {
    return { skipped: true, reason: "already backed up today", existing: existing[0] };
  }

  // Copy DB (SQLite handles concurrent reads fine — but for production
  // SQLite VACUUM INTO is safer. For now use simple copy.)
  try {
    fs.copyFileSync(dbPath, destPath);
    const size = fs.statSync(destPath).size;
    return { ok: true, filename, size, path: destPath };
  } catch (e) {
    return { error: e.message };
  }
}

function pruneOld() {
  ensureDir();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => /^data-\d{4}-\d{2}-\d{2}-\d{4}\.db$/.test(f));
  const deleted = [];
  for (const f of files) {
    try {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
        deleted.push(f);
      }
    } catch {}
  }
  return { deleted, kept: files.length - deleted.length };
}

function listBackups() {
  ensureDir();
  const files = fs.readdirSync(BACKUP_DIR).filter(f => /^data-\d{4}-\d{2}-\d{2}-\d{4}\.db$/.test(f));
  return files
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

// Daily scheduler — check every 1 hour, run if last backup > 23 hours ago
function startScheduler(dbPath, opts = {}) {
  const intervalMs = opts.checkIntervalMs || 60 * 60 * 1000; // 1 hour
  const targetHour = opts.targetHour ?? 3; // 03:00

  let lastRunDate = null;

  const tick = () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (lastRunDate === today) return;
    if (now.getHours() !== targetHour) return;

    const result = snapshotDb(dbPath);
    if (result.ok) {
      console.log(`[backup] daily snapshot ✓ ${result.filename} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);
      const prune = pruneOld();
      if (prune.deleted.length > 0) {
        console.log(`[backup] pruned ${prune.deleted.length} old backups, kept ${prune.kept}`);
      }
      lastRunDate = today;
    } else if (result.skipped) {
      lastRunDate = today; // already backed up
    } else {
      console.error("[backup] daily failed:", result.error);
    }
  };

  tick(); // immediate check
  const timer = setInterval(tick, intervalMs);
  console.log(`[backup] scheduler started — daily at ${String(targetHour).padStart(2,'0')}:00, retention ${RETENTION_DAYS} days, dir: ${BACKUP_DIR}`);
  return { stop: () => clearInterval(timer) };
}

module.exports = { snapshotDb, pruneOld, listBackups, startScheduler, BACKUP_DIR };
