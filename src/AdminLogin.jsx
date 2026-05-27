// karyaOS — Enterprise Admin Login
// Two modes:
//   1. Username + password (default; bcrypt-equivalent via scrypt at backend)
//   2. PIN 6-digit (legacy POS quick-access, toggle via link)
//
// Features: remember username, show/hide password, caps-lock warn,
// must-change-password forced modal, lockout countdown, login audit.
import { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

const LS_USERNAME = "karyaos_remember_username";

export default function AdminLogin({ onLogin }) {
  const [mode, setMode] = useState("password");          // 'password' | 'pin'
  const [username, setUsername] = useState(localStorage.getItem(LS_USERNAME) || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(!!localStorage.getItem(LS_USERNAME));
  const [showPwd, setShowPwd] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [mustChange, setMustChange] = useState(null);     // { token, user } when need to change pwd
  const [showForgot, setShowForgot] = useState(false);
  const [twoFA, setTwoFA] = useState(null);                // P3D — { otpToken, username } when 2FA required
  const usernameRef = useRef(null);

  useEffect(() => {
    document.documentElement.style.zoom = "1";
    usernameRef.current?.focus();
    return () => { document.documentElement.style.zoom = ""; };
  }, []);

  // Auto-submit PIN when 6 digits
  useEffect(() => {
    if (mode === "pin" && pin.length === 6 && !busy) handlePinLogin();
    // eslint-disable-next-line
  }, [pin, mode]);

  async function handlePasswordLogin() {
    if (!username.trim() || !password) { setError("Username & password are required"); return; }
    setBusy(true); setError("");
    try {
      const res = await api.loginPassword(username.trim(), password);
      if (remember) localStorage.setItem(LS_USERNAME, username.trim());
      else          localStorage.removeItem(LS_USERNAME);
      // P3D — 2FA gate: backend asks for TOTP code before issuing session token
      if (res.requires_2fa && res.otp_token) {
        setTwoFA({ otpToken: res.otp_token, username: username.trim() });
        return;
      }
      localStorage.setItem("adminToken", res.token);
      localStorage.setItem("adminRole",  res.user.role);
      localStorage.setItem("adminName",  res.user.name);
      localStorage.setItem("adminUsername", res.user.username || "");
      // Multi-tenant: save company context (company_id, is_super_admin, company info)
      try {
        const { setCompanyCtx } = await import("./companyAuth.js");
        setCompanyCtx({
          token: res.token,
          company_id: res.user.company_id ?? null,
          is_super_admin: !!res.user.is_super_admin,
          company: res.company || null,
          user: { id: res.user.id, name: res.user.name, role: res.user.role },
        });
      } catch {}
      // Force Change Password modal DISABLED — user bisa ganti via User Management.
      onLogin({ token: res.token, name: res.user.name, role: res.user.role, company: res.company });
    } catch (e) {
      setError(parseError(e));
      setShake(true); setTimeout(() => setShake(false), 500);
      setPassword("");
    } finally { setBusy(false); }
  }

  async function handlePinLogin() {
    setBusy(true); setError("");
    try {
      const res = await api.login(pin);
      localStorage.setItem("adminToken", res.token);
      localStorage.setItem("adminRole",  res.role);
      localStorage.setItem("adminName",  res.name);
      // Multi-tenant: save company context
      try {
        const { setCompanyCtx } = await import("./companyAuth.js");
        setCompanyCtx({
          token: res.token,
          company_id: res.user?.company_id ?? null,
          is_super_admin: !!res.user?.is_super_admin,
          company: res.company || null,
          user: res.user || { name: res.name, role: res.role },
        });
      } catch {}
      // Force Change Password modal DISABLED (sama dengan password path)
      onLogin(res);
    } catch (e) {
      setError("Incorrect PIN");
      setPin(""); setShake(true); setTimeout(() => setShake(false), 500);
    } finally { setBusy(false); }
  }

  const onKeyEvent = (e) => setCapsLock(e.getModifierState && e.getModifierState("CapsLock"));
  const handlePinKey = (k) => {
    if (busy) return;
    if (k === "⌫") { setPin(p => p.slice(0, -1)); setError(""); return; }
    if (pin.length < 6) setPin(p => p + k);
  };

  // P3D — 2FA prompt
  if (twoFA) {
    return <TwoFAPrompt
      session={twoFA}
      onCancel={() => { setTwoFA(null); setError(""); }}
      onSuccess={onLogin}
    />;
  }
  // Forced password change modal
  if (mustChange) {
    return <ForceChangePassword session={mustChange} onDone={onLogin} />;
  }
  if (showForgot) {
    return <ForgotPasswordModal onClose={() => setShowForgot(false)} />;
  }

  return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={{ ...L.wrap, animation: shake ? "shake 0.4s ease" : "fadeUp 0.3s ease" }}>
        <img src="/logo.png" alt="KaryaOS" style={L.logoImg} />
        <div style={L.title}>{mode === "password" ? "ADMIN LOGIN" : "PIN QUICK-ACCESS"}</div>
        <div style={L.sub}>{mode === "password" ? "Enterprise authentication · username & password" : "For POS cashier · 6-digit PIN"}</div>

        {error && <div style={L.error} role="alert">⚠ {error}</div>}

        {mode === "password" ? (
          <form onSubmit={(e) => { e.preventDefault(); handlePasswordLogin(); }} style={L.form}>
            <label style={L.label}>👤 USERNAME</label>
            <input ref={usernameRef} type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="username" autoCapitalize="off" autoComplete="username"
              onKeyUp={onKeyEvent}
              style={L.input} disabled={busy} />

            <label style={{ ...L.label, marginTop: 14 }}>🔒 PASSWORD</label>
            <div style={{ position: "relative" }}>
              <input type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                onKeyUp={onKeyEvent}
                style={{ ...L.input, paddingRight: 90 }} disabled={busy} />
              <button type="button" onClick={() => setShowPwd(s => !s)} tabIndex={-1}
                style={{ position: "absolute", right: 8, top: 8, background: "transparent", border: "none", color: "#9ca3af", fontSize: 11, fontWeight: 700, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>
                {showPwd ? "🙈 HIDE" : "👁 SHOW"}
              </button>
            </div>
            {capsLock && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>⚠ Caps Lock aktif</div>}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#9ca3af", cursor: "pointer" }}>
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                Remember username
              </label>
              <a href="#" onClick={(e) => { e.preventDefault(); setShowForgot(true); }} style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }}>Forgot password?</a>
            </div>

            <button type="submit" disabled={busy} style={{ ...L.primaryBtn, marginTop: 18, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? <><span style={L.spinner} /> Memverifikasi…</> : "🔓 Login"}
            </button>
          </form>
        ) : (
          <>
            <div style={{ ...L.dots, animation: shake ? "shake 0.4s ease" : "none" }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} style={{
                  ...L.dot,
                  background: i < pin.length ? "#F59E0B" : "transparent",
                  borderColor: i < pin.length ? "#F59E0B" : "#21262d",
                  boxShadow: i < pin.length ? "0 0 8px rgba(245,158,11,0.5)" : "none",
                }} />
              ))}
            </div>
            {busy && <div style={L.checking}><span style={L.spinner} />Memverifikasi…</div>}
            <div style={L.pad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, ""].map((k, i) => (
                k === "" ? <div key={i} /> :
                <button key={i} onPointerDown={e => { e.preventDefault(); handlePinKey(k); }}
                  style={k === "⌫" ? L.delKey : L.key}>
                  {k}
                </button>
              ))}
            </div>
          </>
        )}

        <button onClick={() => { setMode(m => m === "password" ? "pin" : "password"); setError(""); }}
          style={L.modeToggle}>
          {mode === "password" ? "↺ Switch ke PIN mode (kasir POS)" : "↺ Switch ke username/password (admin)"}
        </button>

        {/* Signup CTA — disabled. Re-enable saat public launch.
        <div style={{ marginTop: 18, padding: 14, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 10, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 8 }}>Don't have a karyaOS account?</div>
          <a href="/?signup" style={{
            display: "inline-block", padding: "10px 22px",
            background: "linear-gradient(135deg, #a855f7, #7c3aed)",
            color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 800,
            textDecoration: "none", letterSpacing: 0.3,
          }}>🚀 Daftar Tenant Baru — Trial 14 Hari Gratis</a>
        </div>
        */}

        <div style={L.footer}>
          🛡️ Enterprise auth · scrypt password hash · lockout 5× fail · session 12h
        </div>
      </div>
    </div>
  );
}

// ─── P3D — 2FA TOTP prompt (after password verified) ─────────────────
function TwoFAPrompt({ session, onCancel, onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit() {
    const clean = code.replace(/\s/g, "");
    if (clean.length < 6) { setError("Masukkan kode 6 digit"); return; }
    setBusy(true); setError("");
    try {
      const res = await api.verify2FA(session.otpToken, clean);
      localStorage.setItem("adminToken", res.token);
      localStorage.setItem("adminRole", res.user.role);
      localStorage.setItem("adminName", res.user.name);
      localStorage.setItem("adminUsername", res.user.username || "");
      try {
        const { setCompanyCtx } = await import("./companyAuth.js");
        setCompanyCtx({
          token: res.token,
          company_id: res.user.company_id ?? null,
          is_super_admin: !!res.user.is_super_admin,
          company: res.company || null,
          user: { id: res.user.id, name: res.user.name, role: res.user.role },
        });
      } catch {}
      onSuccess({ token: res.token, name: res.user.name, role: res.user.role, company: res.company });
    } catch (e) {
      setError(parseError(e));
      setCode("");
    } finally { setBusy(false); }
  }

  return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={{ ...L.wrap, animation: "fadeUp 0.3s ease" }}>
        <img src="/logo.png" alt="KaryaOS" style={L.logoImg} />
        <div style={L.title}>VERIFIKASI 2 LANGKAH</div>
        <div style={L.sub}>Masukkan 6 digit kode dari aplikasi authenticator Anda</div>

        {error && <div style={L.error} role="alert">⚠ {error}</div>}

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={L.form}>
          <label style={L.label}>🔐 KODE 2FA</label>
          <input ref={inputRef} type="text" inputMode="numeric" pattern="[0-9]*"
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="000000" autoComplete="one-time-code"
            style={{ ...L.input, fontSize: 28, letterSpacing: 12, textAlign: "center", fontFamily: "'Geist Mono',monospace" }}
            disabled={busy}
          />
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, textAlign: "center" }}>
            Atau gunakan salah satu <b>backup code</b> yang Anda simpan (format XXXX-XXXX-XX)
          </div>

          <button type="submit" disabled={busy || code.length < 6} style={{ ...L.primaryBtn, marginTop: 18, opacity: (busy || code.length < 6) ? 0.6 : 1 }}>
            {busy ? <><span style={L.spinner} /> Memverifikasi…</> : "✓ Verifikasi"}
          </button>
          <button type="button" onClick={onCancel} style={{ ...L.modeToggle, marginTop: 12 }}>
            ← Login dengan akun lain
          </button>
        </form>

        <div style={L.footer}>
          🛡️ TOTP RFC 6238 · SHA-1 · 30s · 6 digit
        </div>
      </div>
    </div>
  );
}

// ─── Force change password modal ──
function ForceChangePassword({ session, onDone }) {
  const [pwd, setPwd] = useState("");
  const [conf, setConf] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setError("");
    if (pwd.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) { setError("Harus mengandung huruf besar, kecil, dan angka"); return; }
    if (pwd !== conf) { setError("Password confirmation does not match"); return; }
    setBusy(true);
    try {
      await api.changePassword("", pwd);
      onDone({ token: session.token, name: session.user.name, role: session.user.role });
    } catch (e) { setError(parseError(e)); }
    setBusy(false);
  };
  // Escape route — kalau user yakin gak perlu ganti, skip ke dashboard
  const skip = () => {
    if (!confirm("Skip password change? The old password remains. You can change it later via Users.")) return;
    onDone({ token: session.token, name: session.user.name, role: session.user.role });
  };
  return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={L.wrap}>
        <img src="/logo.png" alt="KaryaOS" style={L.logoImg} />
        <div style={L.title}>FORCE CHANGE PASSWORD</div>
        <div style={L.sub}>Hi <b style={{ color: "#fff" }}>{session.user.name}</b> — the system recommends changing your password. Or skip if you're confident the password is safe.</div>

        {error && <div style={L.error}>⚠ {error}</div>}

        <form onSubmit={submit} style={L.form}>
          <label style={L.label}>🔒 PASSWORD BARU</label>
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
            placeholder="min 8 characters" autoFocus autoComplete="new-password"
            style={L.input} disabled={busy} />

          <label style={{ ...L.label, marginTop: 12 }}>🔒 KONFIRMASI</label>
          <input type="password" value={conf} onChange={e => setConf(e.target.value)}
            placeholder="confirm password" autoComplete="new-password"
            style={L.input} disabled={busy} />

          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, lineHeight: 1.5 }}>
            Syarat:<br />
            • Min 8 karakter<br />
            • Mengandung huruf besar (A-Z)<br />
            • Mengandung huruf kecil (a-z)<br />
            • Mengandung angka (0-9)
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button type="button" onClick={skip} style={{
              flex: 1, padding: "14px 18px", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10,
              color: "#cbd5e1", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>Skip / Nanti</button>
            <button type="submit" disabled={busy} style={{ ...L.primaryBtn, flex: 2, marginTop: 0 }}>
              {busy ? "Saving…" : "💾 Simpan & Lanjut"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Forgot Password Modal — request email reset ──
function ForgotPasswordModal({ onClose }) {
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setErr("");
    if (!usernameOrEmail.trim()) { setErr("Username or email is required"); return; }
    setBusy(true);
    try {
      const isEmail = usernameOrEmail.includes("@");
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEmail ? { email: usernameOrEmail.trim() } : { username: usernameOrEmail.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to send reset");
      setSent(true);
      setMsg(j.message || "Reset link sent to your email.");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (sent) {
    return (
      <div style={L.root}>
        <style>{CSS}</style>
        <div style={L.wrap}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>📧</div>
          <div style={L.title}>EMAIL TERKIRIM</div>
          <div style={{ ...L.sub, lineHeight: 1.6 }}>{msg}<br/><br/>Check inbox <b style={{ color: "#fff" }}>{usernameOrEmail}</b> within 1-2 minutes.<br/>Link valid for <b>30 menit</b>.</div>
          <button onClick={onClose} style={{ ...L.primaryBtn, marginTop: 18 }}>← Kembali ke Login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={L.wrap}>
        <img src="/logo.png" alt="KaryaOS" style={L.logoImg} />
        <div style={L.title}>RESET PASSWORD</div>
        <div style={L.sub}>Enter your account username or email. A password reset link will be sent to your registered email.</div>
        {err && <div style={L.error}>⚠ {err}</div>}
        <form onSubmit={submit} style={L.form}>
          <label style={L.label}>👤 USERNAME / EMAIL</label>
          <input type="text" value={usernameOrEmail} onChange={e => setUsernameOrEmail(e.target.value)}
            placeholder="admin atau email@anda.com" autoFocus required style={L.input} />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "14px 18px", background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10,
              color: "#cbd5e1", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>← Batal</button>
            <button type="submit" disabled={busy || !usernameOrEmail.trim()} style={{ ...L.primaryBtn, flex: 2, marginTop: 0, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Sending…" : "📧 Send Reset Link"}
            </button>
          </div>
        </form>
        <div style={L.footer}>If you don't have email access → contact admin for manual reset.</div>
      </div>
    </div>
  );
}

// ─── Reset Password Page — invoked via /?reset=TOKEN ──
export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("reset");
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(null);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [pwd, setPwd] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setValid(false); setValidating(false); return; }
    fetch(`/api/auth/reset-password/${token}`)
      .then(r => r.json())
      .then(j => { setValid(j.valid); setTokenInfo(j); if (!j.valid) setErr(j.error); })
      .catch(() => setValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  const submit = async (e) => {
    e?.preventDefault();
    setErr("");
    if (pwd.length < 8) { setErr("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd)) { setErr("Harus mengandung huruf besar, kecil, dan angka"); return; }
    if (pwd !== conf) { setErr("Password confirmation does not match"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: pwd }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      setDone(true);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (validating) return <div style={L.root}><div style={L.wrap}><div style={{ fontSize: 14, color: "#94a3b8" }}>⏳ Memverifikasi token…</div></div></div>;

  if (!valid) return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={L.wrap}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>⚠️</div>
        <div style={L.title}>LINK TIDAK VALID</div>
        <div style={L.sub}>{err || "Token reset tidak valid, sudah dipakai, atau expired."}<br/><br/>Link reset berlaku <b>30 menit</b> dan hanya bisa dipakai 1×.</div>
        <a href="/?admin" style={{ ...L.primaryBtn, marginTop: 18, textDecoration: "none", display: "inline-block" }}>← Ke Login</a>
      </div>
    </div>
  );

  if (done) return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={L.wrap}>
        <div style={{ fontSize: 60, marginBottom: 10 }}>✅</div>
        <div style={L.title}>PASSWORD BERHASIL DIUPDATE</div>
        <div style={L.sub}>Anda bisa login sekarang dengan password baru.</div>
        <a href="/?admin" style={{ ...L.primaryBtn, marginTop: 18, textDecoration: "none", display: "inline-block" }}>🔐 Login Sekarang</a>
      </div>
    </div>
  );

  return (
    <div style={L.root}>
      <style>{CSS}</style>
      <div style={L.wrap}>
        <img src="/logo.png" alt="KaryaOS" style={L.logoImg} />
        <div style={L.title}>RESET PASSWORD</div>
        <div style={L.sub}>Hai <b style={{ color: "#fff" }}>{tokenInfo?.name || "—"}</b><br/>Email: {tokenInfo?.email_masked || "—"}</div>
        {err && <div style={L.error}>⚠ {err}</div>}
        <form onSubmit={submit} style={L.form}>
          <label style={L.label}>🔒 PASSWORD BARU</label>
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} placeholder="min 8 characters" autoFocus autoComplete="new-password" required style={L.input} />
          <label style={{ ...L.label, marginTop: 12 }}>🔒 KONFIRMASI PASSWORD</label>
          <input type="password" value={conf} onChange={e => setConf(e.target.value)} placeholder="repeat new password" autoComplete="new-password" required style={L.input} />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 12, lineHeight: 1.55 }}>
            Persyaratan password:<br/>
            • Min 8 karakter<br/>
            • Huruf besar, kecil, dan angka
          </div>
          <button type="submit" disabled={busy} style={{ ...L.primaryBtn, marginTop: 18, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "💾 Save New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function parseError(e) {
  if (e?.response) try { return e.response.error || e.message; } catch { return e.message; }
  return e?.message || "Login failed";
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;700&family=Inter:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shake  { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
  @keyframes spin   { to { transform: rotate(360deg); } }
  button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  input:focus { outline: 2px solid #3b82f6; outline-offset: 1px; }
`;

const L = {
  root:    { fontFamily: "'Inter',sans-serif", background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", color: "#fff", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative" },
  wrap:    { position: "relative", zIndex: 1, textAlign: "center", padding: "40px 28px", maxWidth: 400, width: "100%", background: "rgba(12,14,22,0.78)", backdropFilter: "blur(24px) saturate(140%)", WebkitBackdropFilter: "blur(24px) saturate(140%)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)" },
  logoImg: { width: 84, height: 84, objectFit: "cover", marginBottom: 14, borderRadius: 22, boxShadow: "0 12px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06) inset" },
  brand:   { fontFamily: "'Geist Mono',monospace", fontSize: 26, fontWeight: 800, color: "#F59E0B", letterSpacing: 4, marginBottom: 4 },
  title:   { fontFamily: "'Geist Mono',monospace", fontSize: 11, letterSpacing: 4, color: "#cbd5e1", marginBottom: 4 },
  sub:     { fontSize: 12.5, color: "#94a3b8", marginBottom: 22, lineHeight: 1.5 },
  form:    { textAlign: "left", marginTop: 6 },
  label:   { display: "block", fontSize: 10, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4, fontWeight: 700 },
  input:   { width: "100%", padding: "12px 14px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  primaryBtn: { width: "100%", padding: "14px 18px", background: "linear-gradient(135deg, #F59E0B 0%, #f97316 100%)", border: "none", color: "#111", borderRadius: 10, fontSize: 14, fontWeight: 800, fontFamily: "inherit", letterSpacing: 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 8px 22px rgba(245,158,11,0.3)" },
  modeToggle: { background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "#cbd5e1", padding: "8px 14px", borderRadius: 8, fontSize: 11.5, marginTop: 20, fontFamily: "inherit", width: "100%" },
  footer:  { fontSize: 10, color: "#64748b", marginTop: 18, lineHeight: 1.5 },
  error:   { fontSize: 13, color: "#F87171", marginBottom: 14, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "10px 14px", textAlign: "left" },
  // PIN mode
  dots:    { display: "flex", gap: 14, justifyContent: "center", marginTop: 8, marginBottom: 20 },
  dot:     { width: 18, height: 18, borderRadius: "50%", border: "2px solid", transition: "all 0.2s" },
  checking:{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, color: "#F59E0B", marginBottom: 12 },
  spinner: { width: 14, height: 14, border: "2px solid rgba(0,0,0,0.2)", borderTop: "2px solid currentColor", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" },
  pad:     { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 },
  key:     { height: 62, fontSize: 22, fontFamily: "'Geist Mono',monospace", fontWeight: 700, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff" },
  delKey:  { height: 62, fontSize: 20, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#F87171", fontWeight: 700 },
};
