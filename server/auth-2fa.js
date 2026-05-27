// server/auth-2fa.js
// White-label P3D — TOTP 2FA for super-admin / owner.
// RFC 6238 implementation, dependency-free (Node crypto only).
// Compatible with Google Authenticator, Authy, 1Password, etc.

const crypto = require('crypto');

// ─── Base32 (RFC 4648) ────────────────────────────────────────────────
const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]; bits += 8;
    while (bits >= 5) {
      out += B32_ALPHA[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHA[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const cleaned = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = B32_ALPHA.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

// ─── TOTP core (RFC 6238) ─────────────────────────────────────────────
function generateSecret(len = 20) {
  return base32Encode(crypto.randomBytes(len));
}

function totpCode(secretBase32, time = Date.now(), step = 30, digits = 6) {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(time / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = bin % Math.pow(10, digits);
  return String(code).padStart(digits, '0');
}

// Allow ±1 step drift for clock skew tolerance
function verifyTotp(secretBase32, code, window = 1) {
  if (!secretBase32 || !code) return false;
  const clean = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  for (let i = -window; i <= window; i++) {
    if (totpCode(secretBase32, Date.now() + i * 30000) === clean) return true;
  }
  return false;
}

function otpauthUri({ secret, account, issuer = 'karyaos' }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret, issuer, algorithm: 'SHA1', digits: '6', period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ─── Backup codes ─────────────────────────────────────────────────────
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const buf = crypto.randomBytes(5);
    codes.push(buf.toString('hex').toUpperCase().match(/.{1,4}/g).join('-'));
  }
  return codes;
}
function hashBackupCode(code) {
  return crypto.createHash('sha256').update(String(code).toUpperCase().replace(/\s/g, '')).digest('hex');
}

// ─── Express setup ────────────────────────────────────────────────────
function setup2FA(app, { db, adminSessions, dbPath }) {
  let _db;
  try {
    const Database = require('better-sqlite3');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS admin_2fa (
        user_id TEXT PRIMARY KEY,
        secret TEXT NOT NULL,
        enabled INTEGER DEFAULT 0,
        backup_codes_json TEXT,
        created_at INTEGER,
        enabled_at INTEGER,
        last_used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS admin_2fa_pending (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER
      );
    `);
  } catch (e) {
    console.warn('[2fa] could not init db:', e.message);
    return { logAudit: () => {} };
  }

  function getSession(req) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    return token && adminSessions.get(token);
  }

  // GET status — does current user have 2FA on?
  app.get('/api/auth/2fa/status', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const row = _db.prepare('SELECT enabled, enabled_at, last_used_at FROM admin_2fa WHERE user_id = ?').get(String(session.userId));
    res.json({
      enabled: !!(row && row.enabled),
      enabled_at: row?.enabled_at || null,
      last_used_at: row?.last_used_at || null,
    });
  });

  // POST /setup — generate new secret + return otpauth URI (not yet enabled)
  app.post('/api/auth/2fa/setup', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    // Only super-admin / owner / admin roles can self-enroll
    if (!['super-admin', 'owner', 'admin'].includes(session.role)) {
      return res.status(403).json({ error: '2FA only available for admin-tier accounts' });
    }
    const secret = generateSecret();
    const now = Math.floor(Date.now() / 1000);
    _db.prepare(`INSERT INTO admin_2fa (user_id, secret, enabled, created_at)
                 VALUES (?, ?, 0, ?)
                 ON CONFLICT(user_id) DO UPDATE SET
                   secret = excluded.secret, enabled = 0, created_at = excluded.created_at,
                   enabled_at = NULL, backup_codes_json = NULL`)
       .run(String(session.userId), secret, now);
    const uri = otpauthUri({ secret, account: session.name || session.userId, issuer: 'karyaos' });
    res.json({ secret, otpauth_uri: uri });
  });

  // POST /enable — verify a code against pending secret, flip enabled + issue backup codes
  app.post('/api/auth/2fa/enable', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const { code } = req.body || {};
    const row = _db.prepare('SELECT * FROM admin_2fa WHERE user_id = ?').get(String(session.userId));
    if (!row || !row.secret) return res.status(400).json({ error: 'Run /setup first' });
    if (!verifyTotp(row.secret, code)) return res.status(400).json({ error: 'Kode salah atau kedaluwarsa' });
    const backupPlain = generateBackupCodes(8);
    const backupHashed = backupPlain.map(hashBackupCode);
    const now = Math.floor(Date.now() / 1000);
    _db.prepare('UPDATE admin_2fa SET enabled = 1, enabled_at = ?, backup_codes_json = ? WHERE user_id = ?')
       .run(now, JSON.stringify(backupHashed), String(session.userId));
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: '2fa.enabled', entity: 'admin_user', entity_id: session.userId }); } catch {}
    }
    res.json({ ok: true, backup_codes: backupPlain });
  });

  // POST /disable — verify code (or backup code), clear secret
  app.post('/api/auth/2fa/disable', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    const { code } = req.body || {};
    const row = _db.prepare('SELECT * FROM admin_2fa WHERE user_id = ?').get(String(session.userId));
    if (!row || !row.enabled) return res.json({ ok: true, already_disabled: true });
    const ok = verifyTotp(row.secret, code) || _consumeBackupCode(row, code);
    if (!ok) return res.status(400).json({ error: 'Kode salah' });
    _db.prepare('DELETE FROM admin_2fa WHERE user_id = ?').run(String(session.userId));
    if (typeof global.logAudit === 'function') {
      try { global.logAudit(req, { action: '2fa.disabled', entity: 'admin_user', entity_id: session.userId }); } catch {}
    }
    res.json({ ok: true });
  });

  function _consumeBackupCode(row, code) {
    if (!row.backup_codes_json) return false;
    let arr;
    try { arr = JSON.parse(row.backup_codes_json); } catch { return false; }
    const hash = hashBackupCode(code);
    const idx = arr.indexOf(hash);
    if (idx < 0) return false;
    arr.splice(idx, 1); // consume — single-use
    _db.prepare('UPDATE admin_2fa SET backup_codes_json = ? WHERE user_id = ?')
       .run(JSON.stringify(arr), row.user_id);
    return true;
  }

  // Helpers exported back to caller for login integration
  function userHas2FA(userId) {
    const row = _db.prepare('SELECT enabled FROM admin_2fa WHERE user_id = ?').get(String(userId));
    return !!(row && row.enabled);
  }
  function verifyForUser(userId, code) {
    const row = _db.prepare('SELECT * FROM admin_2fa WHERE user_id = ?').get(String(userId));
    if (!row || !row.enabled) return false;
    if (verifyTotp(row.secret, code)) {
      _db.prepare('UPDATE admin_2fa SET last_used_at = ? WHERE user_id = ?')
         .run(Math.floor(Date.now() / 1000), String(userId));
      return true;
    }
    return _consumeBackupCode(row, code);
  }

  // Pending token store: created when login succeeds + 2FA required, exchanged via /verify-2fa
  function createPendingToken(userId, ttlMs = 5 * 60 * 1000) {
    const token = crypto.randomBytes(24).toString('hex');
    _db.prepare('INSERT INTO admin_2fa_pending (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
       .run(token, String(userId), Date.now() + ttlMs, Date.now());
    return token;
  }
  function consumePendingToken(token) {
    const row = _db.prepare('SELECT * FROM admin_2fa_pending WHERE token = ?').get(String(token || ''));
    _db.prepare('DELETE FROM admin_2fa_pending WHERE token = ?').run(String(token || ''));
    if (!row) return null;
    if (row.expires_at < Date.now()) return null;
    return row.user_id;
  }

  return { userHas2FA, verifyForUser, createPendingToken, consumePendingToken };
}

module.exports = { setup2FA, generateSecret, totpCode, verifyTotp, otpauthUri };
