// TenantSignup.jsx — Public self-service onboarding wizard
// URL: /?signup
// 3 steps: Company info → Owner account → Done (with PIN + next steps)
// Calls POST /api/companies/signup → creates company + admin_user + TRIAL billing
import { useState, useEffect, useMemo } from "react";
import API_HOST from "./apiBase.js";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee", PINK = "#ec4899";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

export default function TenantSignup() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    company_name: "",
    vertical: "fnb",
    owner_name: "",
    owner_phone: "",
    owner_email: "",
    owner_pin: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateStep1 = () => {
    if (!form.company_name.trim()) return "Business name is required";
    if (!form.vertical) return "Please select a business type";
    return null;
  };
  const validateStep2 = () => {
    if (!form.owner_name.trim()) return "Owner name is required";
    if (!/^0\d{8,12}$/.test(form.owner_phone.replace(/[^0-9]/g, ""))) return "Phone must be 08xxx format, 9–13 digits";
    if (form.owner_pin && !/^\d{6}$/.test(form.owner_pin)) return "PIN must be 6 digits";
    if (form.owner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.owner_email)) return "Invalid email format";
    return null;
  };

  const submit = async () => {
    const v = validateStep2();
    if (v) { setErr(v); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch(`${API_HOST}/api/companies/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          owner_phone: form.owner_phone.replace(/[^0-9]/g, ""),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Registration failed");
      setResult(j);
      setStep(3);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div style={S.shell}>
      <style>{`
        @keyframes slideIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes confetti { 0% { transform:scale(0) rotate(0); opacity:0; } 50% { opacity:1; } 100% { transform: scale(1) rotate(360deg); opacity:0; } }
      `}</style>

      <div style={S.card}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 3, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS · ONBOARDING</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginTop: 6, letterSpacing: -0.6 }}>
            {step === 3 ? "🎉 Welcome Aboard!" : "🚀 Register New Tenant"}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
            {step === 3 ? "Your account is now active. Continue to admin." : "14-day free trial, all features unlocked."}
          </div>
        </div>

        {/* Progress */}
        {step < 3 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
            {[1, 2, 3].map(n => (
              <div key={n} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: n <= step ? `linear-gradient(90deg,${PURPLE},${PINK})` : "rgba(255,255,255,0.08)",
              }} />
            ))}
          </div>
        )}

        {err && <div style={S.error}>⚠ {err}</div>}

        {/* Step 1: Company */}
        {step === 1 && (
          <div style={{ animation: "slideIn 0.3s" }}>
            <Field label="🏢 BUSINESS NAME *">
              <input value={form.company_name} onChange={e => setField("company_name", e.target.value)}
                placeholder="e.g.: Kopi Bandung Jaya" style={S.inp} autoFocus />
            </Field>

            <Field label="🎯 BUSINESS TYPE *">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { v: "fnb", emoji: "🍽️", title: "F&B", desc: "Cafe, restaurant, kiosk" },
                  { v: "cinema", emoji: "🎬", title: "Cinema", desc: "Movie theater, screens" },
                  { v: "hybrid", emoji: "🎯", title: "Hybrid", desc: "F&B + Cinema" },
                ].map(opt => (
                  <button key={opt.v} onClick={() => setField("vertical", opt.v)} style={{
                    padding: "14px 10px",
                    background: form.vertical === opt.v ? `linear-gradient(135deg, ${PURPLE}22, ${PINK}11)` : "rgba(0,0,0,0.25)",
                    border: form.vertical === opt.v ? `1px solid ${PURPLE}` : BORDER,
                    borderRadius: 10, color: "#fff", cursor: "pointer", textAlign: "center",
                    transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 26 }}>{opt.emoji}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{opt.title}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            <div style={{ marginTop: 18 }}>
              <button onClick={() => {
                const v = validateStep1();
                if (v) { setErr(v); return; }
                setErr(""); setStep(2);
              }} style={S.btnPrimary}>Continue →</button>
            </div>

            <div style={{ marginTop: 14, padding: 12, background: "rgba(34,211,238,0.06)", border: `1px solid ${CYAN}33`, borderRadius: 10, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
              ℹ️ <b style={{ color: CYAN }}>14-day Trial</b>, no credit card needed. All features unlocked — POS, KDS, Loyalty, Multi-outlet, Reporting.
            </div>
          </div>
        )}

        {/* Step 2: Owner */}
        {step === 2 && (
          <div style={{ animation: "slideIn 0.3s" }}>
            <Field label="👤 FULL NAME *">
              <input value={form.owner_name} onChange={e => setField("owner_name", e.target.value)}
                placeholder="e.g.: Bintoro Siallagan" style={S.inp} autoFocus />
            </Field>
            <Field label="📱 PHONE NUMBER *">
              <input value={form.owner_phone} onChange={e => setField("owner_phone", e.target.value)}
                placeholder="08xxxxxxxxxx" inputMode="numeric" style={S.inp} />
            </Field>
            <Field label="📧 EMAIL (optional)">
              <input value={form.owner_email} onChange={e => setField("owner_email", e.target.value)}
                placeholder="owner@email.com" type="email" style={S.inp} />
            </Field>
            <Field label="🔑 ADMIN PIN (6 digits, optional)">
              <input value={form.owner_pin} onChange={e => setField("owner_pin", e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="Leave empty for auto-generated PIN" inputMode="numeric" maxLength={6} style={S.inp} />
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>6 digit numeric. Use this PIN to log in at /?admin</div>
            </Field>

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={() => { setErr(""); setStep(1); }} style={S.btnGhost}>← Back</button>
              <button onClick={submit} disabled={busy} style={{ ...S.btnPrimary, flex: 2 }}>
                {busy ? "⏳ Processing…" : "🚀 Register Now"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && result && (
          <div style={{ animation: "slideIn 0.3s" }}>
            <div style={{ textAlign: "center", marginBottom: 22, position: "relative" }}>
              <div style={{ fontSize: 64, marginBottom: 4 }}>🎊</div>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{
                  position: "absolute", top: 20, left: `${20 + i * 12}%`,
                  fontSize: 18, animation: `confetti 1.5s ease-out ${i * 0.1}s infinite`,
                }}>{["🎉", "✨", "💫", "🎊", "⭐", "🌟"][i]}</div>
              ))}
            </div>

            <div style={{ padding: 16, background: `linear-gradient(135deg, ${PURPLE}22, ${PINK}11)`, border: `1px solid ${PURPLE}55`, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>TENANT ACTIVE</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 4 }}>{result.company_name}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Code: <b style={{ color: "#fff", fontFamily: "'Geist Mono',monospace" }}>{result.company_code}</b> · {result.vertical.toUpperCase()}</div>
            </div>

            {/* PIN box */}
            <div style={{ padding: 18, background: "rgba(0,0,0,0.4)", border: `2px dashed ${AMBER}77`, borderRadius: 12, marginBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: AMBER, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📌 ADMIN LOGIN PIN — KEEP SAFE</div>
              <div style={{ fontSize: 38, fontWeight: 900, color: "#fff", marginTop: 8, fontFamily: "'Geist Mono',monospace", letterSpacing: 8 }}>{result.login_pin}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
                <CopyButton text={result.login_pin} label="Copy PIN" />
                <CopyButton text={`Log in to karyaOS:\nPIN: ${result.login_pin}\nURL: ${typeof window !== "undefined" ? window.location.origin : ""}/?admin`} label="Copy login info" />
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Login di <span style={{ color: CYAN, fontFamily: "'Geist Mono',monospace" }}>/?admin</span> pakai PIN ini</div>
            </div>

            <div style={{ padding: 14, background: "rgba(245,158,11,0.06)", border: `1px solid ${AMBER}33`, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: AMBER, fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>⏰ TRIAL {result.trial_days} HARI</div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>Ends {new Date(result.trial_until * 1000).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}. Upgrade anytime in Admin → Billing.</div>
            </div>

            <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>🧭 NEXT STEPS</div>
            <ol style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>
              {result.next_steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>

            <button onClick={() => window.location.href = "/?admin"} style={{ ...S.btnPrimary, marginTop: 20 }}>
              🚪 Log In to Admin Now
            </button>
            <button onClick={() => { setResult(null); setForm({ company_name: "", vertical: "fnb", owner_name: "", owner_phone: "", owner_email: "", owner_pin: "" }); setStep(1); }} style={{ ...S.btnGhost, marginTop: 8, width: "100%" }}>
              + Register Another Tenant
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, fontSize: 11, color: "#64748b", textAlign: "center" }}>
        Already have an account? <a href="/?admin" style={{ color: CYAN, textDecoration: "none" }}>Log in here →</a>
      </div>
    </div>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button onClick={copy} style={{
      padding: "6px 12px", background: copied ? GREEN : "rgba(255,255,255,0.06)",
      border: `1px solid ${copied ? GREEN : "rgba(255,255,255,0.15)"}`,
      borderRadius: 6, color: copied ? "#001" : "#cbd5e1",
      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      transition: "all 0.15s",
    }}>
      {copied ? "✓ Copied" : "📋 " + label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const S = {
  shell: {
    minHeight: "100vh", padding: "40px 16px",
    background: `
      radial-gradient(800px 600px at 30% 10%, rgba(168,85,247,0.08), transparent),
      radial-gradient(600px 400px at 80% 70%, rgba(236,72,153,0.05), transparent),
      linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)
    `,
    backgroundAttachment: "fixed",
    fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    color: "#e6edf3",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
  },
  card: {
    width: "100%", maxWidth: 460,
    background: "rgba(10,15,28,0.92)",
    border: BORDER, borderRadius: 18,
    padding: 26, backdropFilter: "blur(20px)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(168,85,247,0.1)",
  },
  inp: {
    width: "100%", boxSizing: "border-box",
    background: "rgba(0,0,0,0.4)", border: BORDER, borderRadius: 10,
    padding: "12px 14px", color: "#fff", fontSize: 14,
    fontFamily: "inherit", outline: "none",
  },
  btnPrimary: {
    width: "100%", padding: 14,
    background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`,
    border: "none", borderRadius: 10, color: "#fff",
    fontSize: 14, fontWeight: 800, cursor: "pointer",
    fontFamily: "inherit", letterSpacing: 0.3,
  },
  btnGhost: {
    flex: 1, padding: 14, background: "rgba(255,255,255,0.05)",
    border: BORDER, borderRadius: 10, color: "#fff",
    fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  },
  error: {
    padding: "10px 12px", background: "rgba(239,68,68,0.1)",
    border: `1px solid ${RED}55`, borderRadius: 8,
    color: "#fca5a5", fontSize: 12, marginBottom: 12,
  },
};
