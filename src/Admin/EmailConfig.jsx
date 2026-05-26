// karyaOS — Email / SMTP Configuration
// Setup SMTP credentials untuk kirim email (Forgot Password, notifikasi,
// invoice, order confirmation). Multi-company ready: per-tenant config
// nanti tinggal extend table dengan company_id column.
import { useCallback, useEffect, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

const PRESETS = [
  { name: "Gmail", host: "smtp.gmail.com", port: 587, secure: false, note: "Pakai App Password (16 digit) — bukan password Gmail biasa." },
  { name: "Outlook / Office 365", host: "smtp.office365.com", port: 587, secure: false, note: "Pakai App Password kalau 2FA aktif." },
  { name: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, note: "User = 'apikey', Password = SendGrid API key." },
  { name: "Mailgun", host: "smtp.mailgun.org", port: 587, secure: false, note: "User from dashboard Mailgun." },
  { name: "Amazon SES", host: "email-smtp.ap-southeast-1.amazonaws.com", port: 587, secure: false, note: "Region adjust sesuai SES Anda." },
];

export default function EmailConfig({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    fetch(`${API}/api/admin/email-config`, { headers: { Authorization: token ? `Bearer ${token}` : undefined } })
      .then(r => r.ok ? r.json() : r.json().then(j => { throw new Error(j?.error); }))
      .then(setForm)
      .catch(setErr)
      .finally(() => setLoading(false));
  }, [API, token]);

  useEffect(() => { load(); }, [load]);

  const apply = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setInfo(""); setErr(null);
    // Validation guard — anti-overwrite dengan empty values
    if (!form.smtpHost?.trim()) { alert("SMTP Host required"); return; }
    if (!form.smtpUser?.trim()) { alert("USERNAME / EMAIL required"); return; }
    // Cek apakah password masked (artinya user belum re-type, jadi backend skip)
    const passIsMasked = form.smtpPass && form.smtpPass.includes("•");
    if (!form.smtpPass?.trim() && !passIsMasked) {
      alert("PASSWORD / API KEY required.\n\nUntuk Gmail: generate App Password 16-char from myaccount.google.com/apppasswords (BUKAN password Gmail biasa).");
      return;
    }
    setBusy(true);
    try {
      // Normalize email lowercase (Gmail accepts both, tapi safer lowercase)
      const payload = { ...form, smtpUser: form.smtpUser.trim().toLowerCase(), fromEmail: (form.fromEmail || "").trim().toLowerCase() };
      const r = await fetch(`${API}/api/admin/email-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      setInfo(`✓ Configuration tersimpan — ${form.enabled ? "email aktif, bisa kirim test sekarang" : "tap toggle for aktifkan"}`);
      setTimeout(() => setInfo(""), 6000);
      load();
    } catch (e) { setErr(e); }
    setBusy(false);
  };

  const test = async () => {
    if (!testTo) { setErr(new Error("Isi email tujuan test dulu")); return; }
    setBusy(true); setInfo(""); setErr(null);
    try {
      const r = await fetch(`${API}/api/admin/email-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
        body: JSON.stringify({ testTo, to: testTo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error);
      setInfo(`✓ Test email dikirim to ${testTo}. Cek inbox dalam 1-2 min.`);
    } catch (e) { setErr(e); }
    setBusy(false);
  };

  const applyPreset = (p) => {
    setForm(f => ({ ...f, smtpHost: p.host, smtpPort: p.port, smtpSecure: p.secure }));
    setInfo(`💡 Preset ${p.name} applied. ${p.note}`);
    setTimeout(() => setInfo(""), 6000);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>⏳ Loading…</div>;
  if (err && !form) return <div style={{ padding: 20 }}><ErrorInline error={err} onRetry={load} /></div>;
  if (!form) return null;

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / SETTINGS / EMAIL</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>📧 Email / SMTP Config</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>SMTP for Forgot Password, invoice, notifikasi. Multi-company ready (per-tenant config bisa di-extend nanti).</div>
      </header>

      {/* Status banner with proper toggle switch */}
      <div style={{ padding: 16, background: form.enabled ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${form.enabled ? GREEN : AMBER}`, borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: form.enabled ? GREEN : AMBER, fontWeight: 800, letterSpacing: 1 }}>{form.enabled ? "✓ EMAIL AKTIF" : "⚠ EMAIL BELUM AKTIF"}</div>
          <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>
            {form.enabled
              ? `Sending via ${form.smtpHost}:${form.smtpPort} (user: ${form.smtpUser})`
              : "Tap tombol kanan for aktifkan setelah isi credentials di bawah."}
          </div>
        </div>
        {/* Big toggle switch */}
        <button onClick={async () => {
          const newEnabled = !form.enabled;
          // Validate kalau mau enable
          if (newEnabled && (!form.smtpUser || !form.smtpPass)) {
            alert("Isi USERNAME and PASSWORD dulu sebelum enable, lalu Save.");
            return;
          }
          const next = { ...form, enabled: newEnabled };
          setForm(next);
          // Auto-save toggle change
          setBusy(true);
          try {
            const r = await fetch(`${API}/api/admin/email-config`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : undefined },
              body: JSON.stringify(next),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error);
            setInfo(newEnabled ? "✓ Email AKTIF — sekarang bisa kirim test." : "⏸ Email di-pause.");
            setTimeout(() => setInfo(""), 4000);
          } catch (e) {
            setForm(f => ({ ...f, enabled: !newEnabled })); // rollback
            setErr(e);
          }
          setBusy(false);
        }} style={{
          position: "relative", width: 86, height: 40,
          background: form.enabled ? `linear-gradient(135deg,${GREEN},#059669)` : "rgba(0,0,0,0.4)",
          border: `2px solid ${form.enabled ? GREEN : "rgba(255,255,255,0.2)"}`,
          borderRadius: 22, cursor: busy ? "wait" : "pointer", padding: 0,
          transition: "all 0.2s ease",
          boxShadow: form.enabled ? "0 4px 14px rgba(16,185,129,0.35)" : "none",
        }}>
          <div style={{
            position: "absolute", top: 3, left: form.enabled ? 50 : 3,
            width: 28, height: 28, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s ease",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: form.enabled ? GREEN : "#64748b", fontWeight: 800,
          }}>{form.enabled ? "✓" : "✕"}</div>
        </button>
      </div>

      {info && <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: `1px solid ${GREEN}55`, borderRadius: 10, color: "#86efac", fontSize: 13, marginBottom: 12 }}>{info}</div>}
      {/* RAW error display — tampilin SMTP error langsung agar user bisa debug */}
      {err && (
        <div style={{ padding: 14, background: "rgba(239,68,68,0.08)", border: `1px solid ${RED}55`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: RED, fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>⚠ ERROR</div>
              <div style={{ fontSize: 13, color: "#fca5a5", lineHeight: 1.5, wordBreak: "break-word" }}>{err?.message || String(err)}</div>
              {/* Hint based on error pattern */}
              {/535|auth|invalid.*login|password.*not.*accepted/i.test(err?.message || "") && (
                <div style={{ marginTop: 8, padding: 10, background: "rgba(245,158,11,0.08)", border: `1px solid ${AMBER}55`, borderRadius: 6, fontSize: 11, color: "#fde68a", lineHeight: 1.55 }}>
                  💡 <b>Hint:</b> Gmail authentication gagal. Pastikan password yang dipakai adalah <b>App Password 16-char</b> dari myaccount.google.com/apppasswords, BUKAN password Gmail biasa. 2FA juga harus aktif.
                </div>
              )}
              {/timeout|ETIMEDOUT|ECONN/i.test(err?.message || "") && (
                <div style={{ marginTop: 8, padding: 10, background: "rgba(245,158,11,0.08)", border: `1px solid ${AMBER}55`, borderRadius: 6, fontSize: 11, color: "#fde68a", lineHeight: 1.55 }}>
                  💡 <b>Hint:</b> Connection timeout ke SMTP. Cek firewall / network outlet yang block port 587.
                </div>
              )}
            </div>
            <button onClick={() => setErr(null)} style={{ background: "transparent", border: "none", color: "#fca5a5", fontSize: 18, cursor: "pointer", padding: "0 8px" }}>×</button>
          </div>
        </div>
      )}

      {/* Preset chips */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 8 }}>⚡ QUICK PRESET</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map(p => (
            <button key={p.name} onClick={() => applyPreset(p)} style={{
              padding: "8px 14px", background: form.smtpHost === p.host ? PURPLE + "33" : "rgba(255,255,255,0.04)",
              border: `1px solid ${form.smtpHost === p.host ? PURPLE : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8, color: form.smtpHost === p.host ? "#fff" : "#cbd5e1",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>{p.name}</button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 120px", gap: 10 }}>
          <Field label="📡 SMTP HOST"><input value={form.smtpHost || ""} onChange={e => apply("smtpHost", e.target.value)} placeholder="smtp.gmail.com" style={inp} /></Field>
          <Field label="🔌 PORT">
            <input type="number" value={form.smtpPort || 587} onChange={e => {
              const port = parseInt(e.target.value, 10) || 587;
              // Auto-pair: 465 = SSL, 587 = STARTTLS, lainnya = preserve
              const next = { ...form, smtpPort: port };
              if (port === 465) next.smtpSecure = true;
              else if (port === 587) next.smtpSecure = false;
              setForm(next);
            }} style={inp} />
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>587=STARTTLS, 465=SSL</div>
          </Field>
          <Field label="ENCRYPTION">
            <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.35)", border: `1px solid ${form.smtpSecure ? "rgba(168,85,247,0.4)" : "rgba(34,211,238,0.4)"}`, borderRadius: 8, fontSize: 12, color: form.smtpSecure ? "#c084fc" : "#22d3ee", textAlign: "center", fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>
              {form.smtpSecure ? "🔒 SSL/TLS" : "🔓 STARTTLS"}
            </div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Auto from port</div>
          </Field>
        </div>

        <Field label="👤 USERNAME / EMAIL"><input value={form.smtpUser || ""} onChange={e => apply("smtpUser", e.target.value)} placeholder="bintorosiallagan@gmail.com or 'apikey' for SendGrid" style={inp} /></Field>
        <Field label="🔒 PASSWORD / API KEY">
          <input type="password" value={form.smtpPass || ""} onChange={e => apply("smtpPass", e.target.value)} placeholder="App Password (Gmail: 16 chars, no spaces)" style={inp} />
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, lineHeight: 1.5 }}>
            <b>Gmail tip:</b> Generate App Password di <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{ color: CYAN }}>myaccount.google.com/apppasswords</a> — 16-char code (pakai itu, BUKAN password Gmail asli). Aktifkan 2FA dulu kalau belum.
          </div>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="📤 FROM EMAIL"><input value={form.fromEmail || ""} onChange={e => apply("fromEmail", e.target.value)} placeholder="noreply@yourbrand.com" style={inp} /></Field>
          <Field label="🏷️ FROM NAME"><input value={form.fromName || ""} onChange={e => apply("fromName", e.target.value)} placeholder="karyaOS" style={inp} /></Field>
        </div>

        <button onClick={save} disabled={busy} style={{
          marginTop: 14, padding: "12px 24px",
          background: `linear-gradient(135deg,${PURPLE},#7c3aed)`,
          border: "none", borderRadius: 10, color: "#fff",
          fontSize: 13, fontWeight: 800, fontFamily: "inherit",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}>{busy ? "⏳ Menyimpan…" : "💾 Simpan Configuration"}</button>
      </div>

      {/* Test send */}
      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: CYAN, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10 }}>🧪 TEST KIRIM EMAIL</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Email tujuan test (mis: bintorosiallagan@gmail.com)" style={{ ...inp, flex: 1 }} />
          <button onClick={test} disabled={busy || !testTo || !form.enabled} style={{
            padding: "10px 18px", background: form.enabled && testTo ? CYAN : "rgba(255,255,255,0.06)",
            border: "none", borderRadius: 8, color: form.enabled && testTo ? "#001620" : "rgba(255,255,255,0.3)",
            fontSize: 13, fontWeight: 800, fontFamily: "inherit",
            cursor: form.enabled && testTo && !busy ? "pointer" : "not-allowed",
          }}>📤 Send Test</button>
        </div>
        {!form.enabled && <div style={{ fontSize: 11, color: AMBER, marginTop: 6 }}>⚠ Enable email dulu (toggle di atas) sebelum test.</div>}
      </div>

      {/* Setup guide */}
      <div style={{ padding: 14, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: PURPLE, marginBottom: 6 }}>💡 Setup Gmail (paling umum)</div>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Open <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" style={{ color: CYAN }}>myaccount.google.com/security</a> → aktifkan <b>2-Step Verification</b> kalau belum.</li>
          <li>Open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{ color: CYAN }}>myaccount.google.com/apppasswords</a> → buat app password baru (App: "Mail", Device: "Other → karyaOS").</li>
          <li>Copy 16-digit kode yang muncul (tanpa spasi).</li>
          <li>Di form atas: <b>Quick Preset → Gmail</b>, isi USERNAME = email Gmail Anda, PASSWORD = paste 16-digit tadi.</li>
          <li>From Email = email Gmail Anda, From Name = brand outlet/PT Anda.</li>
          <li>Toggle <b>Enabled</b> to ON di banner atas → Save → Test kirim email.</li>
        </ol>
      </div>

      <div style={{ marginTop: 14, padding: 12, background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.55 }}>
        <b style={{ color: CYAN }}>🏢 Multi-Company Roadmap:</b> Saat ini single config global. Saat upgrade to multi-tenant, table <code>email_configs</code> akan extend with <code>company_id</code> column — setiap tenant manage SMTP sendiri tanpa override yang lain.
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 12px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
