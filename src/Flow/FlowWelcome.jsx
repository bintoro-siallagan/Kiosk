import React, { useState, useMemo } from "react";
import API_HOST from "../apiBase.js";
import { useT } from "../i18n";

const API = API_HOST;

// Normalize any Indonesian phone input to canonical 08xxxxxx format
function normalize(p) {
  let n = String(p || "").replace(/[^0-9]/g, "");
  // Strip leading zeros that aren't part of "08" (e.g. "00000017..." → "17...")
  while (n.length > 1 && n.startsWith("00")) n = n.substring(1);
  // Handle country code variants
  if (n.startsWith("62")) n = "0" + n.substring(2);
  else if (n.startsWith("8")) n = "0" + n;
  return n;
}

// Validate: must be 08xxxx, 10-13 digits total
function validatePhone(p) {
  const n = normalize(p);
  if (!n) return "Phone number is required";
  if (!n.startsWith("08")) return "Phone must start with 08 or +62";
  if (n.length < 10) return `Phone too short (${n.length} digits, min 10)`;
  if (n.length > 13) return `Phone too long (${n.length} digits, max 13)`;
  // Indonesian mobile prefixes: 0811-0819, 0821-0823, 0851-0853, 0858, 0859, 0877-0878, 0881-0889
  // Simpler check: digit 3 should be 1, 2, 3, 5, 7, or 8
  const d3 = n[2];
  if (!"1235678".includes(d3)) return "Invalid phone prefix";
  return null;
}

// Pretty-format for display: +62 812-9488-1634
function pretty(p) {
  const n = normalize(p);
  if (!n.startsWith("08") || n.length < 5) return n;
  const intl = "62" + n.substring(1);
  // Group: 62 XXX-XXXX-XXXX (variable)
  const code = intl.substring(0, 2);
  const rest = intl.substring(2);
  if (rest.length <= 3) return `+${code} ${rest}`;
  if (rest.length <= 7) return `+${code} ${rest.substring(0, 3)}-${rest.substring(3)}`;
  return `+${code} ${rest.substring(0, 3)}-${rest.substring(3, 7)}-${rest.substring(7)}`;
}

// STRICT match: only exact normalized equality (no endsWith loose match)
function strictMatch(storedPhone, inputPhone) {
  const a = normalize(storedPhone);
  const b = normalize(inputPhone);
  if (!a || !b) return false;
  return a === b;
}

export default function FlowWelcome({ onAuth, onGuest, tableContext }) {
  const t = useT();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Live preview + validation
  const normalized = useMemo(() => normalize(phone), [phone]);
  const validationErr = useMemo(() => validatePhone(phone), [phone]);
  const prettyPhone = useMemo(() => pretty(phone), [phone]);
  const canSubmit = !validationErr && !loading;

  async function handlePhoneSubmit() {
    setError("");
    const verr = validatePhone(phone);
    if (verr) {
      setError(verr);
      return;
    }
    setLoading(true);

    try {
      const r = await fetch(`${API}/api/customers`);
      if (!r.ok) throw new Error("Server error");
      const data = await r.json();
      const list = data.data || data.customers || (Array.isArray(data) ? data : []);

      // STRICT match — exact normalized phone only
      const customer = list.find(c => strictMatch(c.phone, phone));

      if (customer && customer.name) {
        onAuth({ ...customer, _phoneLocal: normalized });
      } else {
        setStep("register");
      }
    } catch (e) {
      setError("Failed to connect: " + e.message);
    }
    setLoading(false);
  }

  async function handleRegister() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (name.trim().length < 2) {
      setError("Name too short");
      return;
    }
    // Re-validate phone (paranoia, in case state got weird)
    const verr = validatePhone(phone);
    if (verr) {
      setError("Invalid phone: " + verr);
      setStep("phone");
      return;
    }
    setLoading(true);

    try {
      const r = await fetch(`${API}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, name: name.trim() }),
      });

      if (r.ok) {
        const data = await r.json();
        const customer = data.customer || data;
        onAuth({ ...customer, _phoneLocal: normalized });
      } else {
        const txt = await r.text();
        setError("Registration failed: " + txt.substring(0, 100));
      }
    } catch (e) {
      setError("Server error: " + e.message);
    }
    setLoading(false);
  }

  // Sambutan waktu — sapaan hangat ke customer yg baru duduk di meja.
  // Filosofi karyaOS: customer juga "pulang" ke karyaOS, bukan masuk
  // formulir. Pertama yg dia baca harus terasa seperti tuan rumah
  // yang menyapa, bukan sistem yg menanya.
  const warmHello = (() => {
    const h = new Date().getHours();
    const main = h >= 5 && h < 11 ? 'Selamat pagi'
               : h >= 11 && h < 15 ? 'Selamat siang'
               : h >= 15 && h < 18 ? 'Selamat sore'
               : 'Selamat malam';
    if (tableContext) return `${main}. Senang Anda di Meja ${tableContext}.`;
    return `${main}. Senang Anda di sini.`;
  })();

  return (
    <div style={S.container}>
      <div style={S.hero}>
        <img src="/logo.png" alt="KaryaOS" style={{ width: 132, height: 132, objectFit: "contain", marginBottom: 6 }} />
        <div style={S.tagline}>{warmHello}</div>
        {tableContext && (
          <div style={S.tableBadge}>📍 {t("flow.table_no")} {tableContext}</div>
        )}
      </div>

      <div style={S.card}>
        {step === "phone" && (
          <>
            {/* Guest mode CTA — biar customer gak kena friction login wajib */}
            {onGuest && (
              <>
                <button onClick={onGuest} style={S.guestBtn}>
                  👀 Lihat menu dulu
                </button>
                <div style={S.guestHint}>
                  Pesan sekarang tanpa daftar. Mau dapet poin? Daftar nanti setelah pesan beres.
                </div>
                <div style={S.divider}>
                  <span style={S.dividerLine} />
                  <span style={S.dividerText}>atau daftar dulu</span>
                  <span style={S.dividerLine} />
                </div>
              </>
            )}

            <div style={S.cardTitle}>{t("kiosk.welcome")} ☕</div>
            <div style={S.cardSub}>Enter your WhatsApp number</div>

            <div style={S.inputGroup}>
              <span style={S.inputPrefix}>+62</span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => {
                  setPhone(e.target.value);
                  setError("");
                }}
                style={S.input}
                placeholder="81234567890"
                autoFocus
                maxLength={15}
                onKeyDown={e => e.key === "Enter" && canSubmit && handlePhoneSubmit()}
              />
            </div>

            {/* Live preview */}
            {phone && normalized.length >= 3 && (
              <div style={{
                ...S.phonePreview,
                color: validationErr ? "#F87171" : "#10B981",
                borderColor: validationErr ? "rgba(248,113,113,0.3)" : "rgba(16,185,129,0.3)",
              }}>
                {validationErr ? "✕" : "✓"} {prettyPhone}
              </div>
            )}

            {error && <div style={S.error}>{error}</div>}
            {!error && validationErr && phone.length >= 3 && (
              <div style={S.errorSoft}>{validationErr}</div>
            )}

            <button
              onClick={handlePhoneSubmit}
              disabled={!canSubmit}
              style={{
                ...S.btnPrimary,
                ...(!canSubmit ? S.btnDisabled : {}),
              }}
            >
              {loading ? t("common.loading") : t("common.next") + " →"}
            </button>

            <div style={S.hint}>
              💡 First time? No problem — just enter your name once.
            </div>
          </>
        )}

        {step === "register" && (
          <>
            <div style={S.cardTitle}>Hi! 👋</div>
            <div style={S.cardSub}>Enter your name once for faster future orders.</div>

            <div style={S.fieldLabel}>Your Name</div>
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setError("");
              }}
              style={{ ...S.input, ...S.inputFull, marginBottom: 16 }}
              placeholder="Nickname"
              autoFocus
              maxLength={40}
              onKeyDown={e => e.key === "Enter" && name.trim().length >= 2 && handleRegister()}
            />

            <div style={{ ...S.phonePreview, color: "#10B981", borderColor: "rgba(16,185,129,0.3)" }}>
              📱 Akan didaftarkan ke: {prettyPhone}
            </div>

            {error && <div style={S.error}>{error}</div>}

            <button
              onClick={handleRegister}
              disabled={loading || name.trim().length < 2}
              style={{
                ...S.btnPrimary,
                ...(loading || name.trim().length < 2 ? S.btnDisabled : {}),
              }}
            >
              {loading ? t("common.loading") : t("common.continue") + " →"}
            </button>

            <button onClick={() => { setStep("phone"); setName(""); setError(""); }} style={S.btnGhost}>
              ← Ganti nomor
            </button>
          </>
        )}
      </div>

      <div style={S.footer}>
        Powered by KaryaOS Flow
      </div>
    </div>
  );
}

// Liquid-glass + brand-aware styling — same recipe as kiosk POS surfaces.
const S = {
  container: { width: "min(440px, 100%)", margin: "0 auto", minHeight: "100vh",
    padding: "32px 20px", display: "flex", flexDirection: "column", gap: 24,
    fontFamily: "'Inter', sans-serif" },
  hero: { textAlign: "center", padding: "20px 0", animation: "fadeUp 0.5s ease" },
  logo: { fontFamily: "'Inter', sans-serif", fontSize: 48, color: "var(--brand-primary,#FF6B35)",
    letterSpacing: 3, filter: "drop-shadow(0 0 16px var(--brand-primary,#FF6B35))" },
  tagline: { fontSize: 13, color: "rgba(205,213,223,0.55)", marginTop: 6, letterSpacing: 0.5 },
  tableBadge: { display: "inline-block", marginTop: 14, padding: "6px 14px", borderRadius: 999,
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)",
    color: "var(--brand-primary,#FF6B35)", fontSize: 12, fontWeight: 600 },
  // Liquid glass card
  card: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.025) 60%,rgba(255,255,255,0.012) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 22, padding: "28px 24px", animation: "fadeUp 0.6s ease",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 12px 32px rgba(0,0,0,0.45)",
  },
  cardTitle: { fontSize: 22, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.4px", color: "#fff" },
  cardSub: { fontSize: 13, color: "rgba(205,213,223,0.6)", marginBottom: 24 },
  fieldLabel: { fontSize: 11, color: "rgba(205,213,223,0.55)", marginBottom: 6,
    letterSpacing: 1, fontWeight: 600, textTransform: "uppercase" },
  inputGroup: { display: "flex", gap: 0, marginBottom: 12 },
  inputPrefix: { padding: "14px 16px", background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)", borderRight: "none",
    borderRadius: "12px 0 0 12px", color: "rgba(205,213,223,0.6)", fontSize: 15, fontWeight: 600 },
  input: { flex: 1, padding: "14px 16px", background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: "0 12px 12px 0",
    color: "#fff", fontSize: 16, fontFamily: "inherit", outline: "none" },
  inputFull: { borderRadius: 12 },
  phonePreview: { padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)", fontSize: 13, marginBottom: 12,
    fontWeight: 600, transition: "all 0.2s", color: "rgba(205,213,223,0.85)" },
  error: { padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", fontSize: 12, marginBottom: 12 },
  errorSoft: { padding: "8px 12px", borderRadius: 10,
    background: "color-mix(in srgb, var(--brand-primary,#FF6B35) 10%, transparent)",
    border: "1px solid color-mix(in srgb, var(--brand-primary,#FF6B35) 25%, transparent)",
    color: "var(--brand-primary,#FF6B35)", fontSize: 12, marginBottom: 12 },
  // Tinted-glass brand button (radial spotlight + linear brand 38% + dark 62%)
  // ensures white text legible on any brand color (incl. lime DPC)
  btnPrimary: {
    width: "100%", padding: "14px", borderRadius: 12,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.3,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 30%, transparent)",
  },
  btnGhost: { width: "100%", marginTop: 10, padding: "10px", background: "transparent",
    border: "none", color: "rgba(205,213,223,0.5)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnDisabled: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
    cursor: "not-allowed", color: "rgba(205,213,223,0.4)", textShadow: "none", boxShadow: "none" },
  hint: { marginTop: 16, fontSize: 11, color: "rgba(205,213,223,0.4)", lineHeight: 1.5, textAlign: "center" },
  // Anonymous mode — guest CTA biar customer langsung pesan tanpa daftar
  guestBtn: {
    width: "100%", padding: "14px", borderRadius: 12,
    background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)",
    color: "#10b981", fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
    letterSpacing: 0.3, marginBottom: 8,
  },
  guestHint: { fontSize: 11, color: "rgba(205,213,223,0.5)", textAlign: "center", lineHeight: 1.5, marginBottom: 18 },
  divider: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" },
  dividerText: { fontSize: 10, color: "rgba(205,213,223,0.4)", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" },
  footer: { marginTop: "auto", textAlign: "center", fontSize: 10,
    color: "rgba(205,213,223,0.3)", letterSpacing: 1, padding: "20px 0" },
};
