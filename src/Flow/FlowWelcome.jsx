import React, { useState, useMemo } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3011";

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
  if (!n) return "Nomor belum diisi";
  if (!n.startsWith("08")) return "Nomor HP harus mulai dengan 08 atau +62";
  if (n.length < 10) return `Nomor terlalu pendek (${n.length} digit, min 10)`;
  if (n.length > 13) return `Nomor terlalu panjang (${n.length} digit, max 13)`;
  // Indonesian mobile prefixes: 0811-0819, 0821-0823, 0851-0853, 0858, 0859, 0877-0878, 0881-0889
  // Simpler check: digit 3 should be 1, 2, 3, 5, 7, or 8
  const d3 = n[2];
  if (!"1235678".includes(d3)) return "Nomor HP tidak valid (cek prefix)";
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

export default function FlowWelcome({ onAuth, tableContext }) {
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
      setError("Gagal terhubung: " + e.message);
    }
    setLoading(false);
  }

  async function handleRegister() {
    setError("");
    if (!name.trim()) {
      setError("Nama belum diisi");
      return;
    }
    if (name.trim().length < 2) {
      setError("Nama terlalu pendek");
      return;
    }
    // Re-validate phone (paranoia, in case state got weird)
    const verr = validatePhone(phone);
    if (verr) {
      setError("Nomor tidak valid: " + verr);
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
        setError("Gagal daftar: " + txt.substring(0, 100));
      }
    } catch (e) {
      setError("Server error: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div style={S.container}>
      <div style={S.hero}>
        <img src="/logo.png" alt="KaryaOS" style={{ width: 132, height: 132, objectFit: "contain", marginBottom: 6 }} />
        <div style={S.tagline}>Order Langsung dari HP-mu</div>
        {tableContext && (
          <div style={S.tableBadge}>📍 Meja {tableContext}</div>
        )}
      </div>

      <div style={S.card}>
        {step === "phone" && (
          <>
            <div style={S.cardTitle}>Selamat Datang ☕</div>
            <div style={S.cardSub}>Masukin nomor WhatsApp kamu</div>

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
              {loading ? "Mengecek..." : "Lanjut →"}
            </button>

            <div style={S.hint}>
              💡 Belum pernah order? Tenang, nanti tinggal isi nama sekali aja.
            </div>
          </>
        )}

        {step === "register" && (
          <>
            <div style={S.cardTitle}>Halo! 👋</div>
            <div style={S.cardSub}>Sekali aja isi nama, biar order berikutnya lebih cepet.</div>

            <div style={S.fieldLabel}>Nama Kamu</div>
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setError("");
              }}
              style={{ ...S.input, ...S.inputFull, marginBottom: 16 }}
              placeholder="Nama panggilan"
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
              {loading ? "Mendaftar..." : "Daftar & Lanjut →"}
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

const S = {
  container: { width: "min(440px, 100%)", minHeight: "100vh", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 24 },
  hero: { textAlign: "center", padding: "20px 0", animation: "fadeUp 0.5s ease" },
  logo: { fontFamily: "'Inter', sans-serif", fontSize: 48, color: "#FF6B35", letterSpacing: 3 },
  tagline: { fontSize: 13, color: "#9CA3AF", marginTop: 4, letterSpacing: 0.5 },
  tableBadge: { display: "inline-block", marginTop: 12, padding: "6px 14px", borderRadius: 20, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.3)", color: "#FF6B35", fontSize: 12, fontWeight: 600 },
  card: { background: "linear-gradient(180deg, #161616 0%, #0d0d0d 100%)", border: "1px solid #2a2a2a", borderRadius: 20, padding: "28px 24px", animation: "fadeUp 0.6s ease" },
  cardTitle: { fontSize: 22, fontWeight: 800, marginBottom: 6 },
  cardSub: { fontSize: 13, color: "#9CA3AF", marginBottom: 24 },
  fieldLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 6, letterSpacing: 1, fontWeight: 600 },
  inputGroup: { display: "flex", gap: 0, marginBottom: 12 },
  inputPrefix: { padding: "14px 16px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRight: "none", borderRadius: "12px 0 0 12px", color: "#9CA3AF", fontSize: 15, fontWeight: 600 },
  input: { flex: 1, padding: "14px 16px", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "0 12px 12px 0", color: "white", fontSize: 16, fontFamily: "inherit", outline: "none" },
  inputFull: { borderRadius: 12 },
  phonePreview: { padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", fontSize: 13, marginBottom: 12, fontWeight: 600, transition: "all 0.2s" },
  error: { padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.10)", color: "#F87171", fontSize: 12, marginBottom: 12 },
  errorSoft: { padding: "8px 12px", borderRadius: 8, background: "rgba(245,158,11,0.08)", color: "#FF6B35", fontSize: 12, marginBottom: 12 },
  btnPrimary: { width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg, #FF6B35, #D97706)", border: "none", color: "#111", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", letterSpacing: 0.5 },
  btnGhost: { width: "100%", marginTop: 10, padding: "10px", background: "transparent", border: "none", color: "#9CA3AF", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  btnDisabled: { background: "#374151", cursor: "not-allowed", color: "#9CA3AF" },
  hint: { marginTop: 16, fontSize: 11, color: "#6B7280", lineHeight: 1.5, textAlign: "center" },
  footer: { marginTop: "auto", textAlign: "center", fontSize: 10, color: "#4B5563", letterSpacing: 1, padding: "20px 0" },
};
