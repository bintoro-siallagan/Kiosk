// src/Admin/AdminCustomDomain.jsx
// White-label P4C — custom domain (CNAME) setup with DNS-TXT verification.

import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";

function headers() {
  const tok = localStorage.getItem("adminToken");
  return { "Content-Type": "application/json", ...(tok && { Authorization: "Bearer " + tok }) };
}

export default function AdminCustomDomain() {
  const [state, setState] = useState({ loading: true });
  const [draftDomain, setDraftDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", kind: "" });

  async function refresh() {
    try {
      const r = await fetch(`${API_HOST}/api/companies/custom-domain`, { headers: headers() }).then(r => r.json());
      setState({ ...r, loading: false });
      setDraftDomain(r.domain || "");
    } catch (e) {
      setState({ loading: false });
      setMsg({ text: e.message, kind: "error" });
    }
  }
  useEffect(() => { refresh(); }, []);

  async function saveDomain() {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const r = await fetch(`${API_HOST}/api/companies/custom-domain`, {
        method: "PUT", headers: headers(), body: JSON.stringify({ domain: draftDomain }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      await refresh();
      setMsg({ text: r.cleared ? "Custom domain dihapus." : "Domain disimpan. Setup DNS lalu klik Verify.", kind: "ok" });
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    } finally { setBusy(false); }
  }

  async function verifyDomain() {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const r = await fetch(`${API_HOST}/api/companies/custom-domain/verify`, {
        method: "POST", headers: headers(),
      }).then(r => r.json());
      if (r.verified) {
        setMsg({ text: `✓ Verified! ${r.domain} sekarang aktif.`, kind: "ok" });
      } else {
        setMsg({ text: r.error || "Verification gagal", kind: "error" });
      }
      await refresh();
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    } finally { setBusy(false); }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
    setMsg({ text: "Disalin ke clipboard.", kind: "ok" });
  }

  if (state.loading) return <div style={S.page}><div style={S.muted}>Memuat…</div></div>;

  const dnsHost = state.domain || "your-domain.com";
  const cnameTarget = state.dns_target || "karyaos-app.com";

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.h1}>Custom Domain</div>
          <div style={S.muted}>Pakai domain Anda sendiri (mis. <code>order.brand.com</code>) untuk kiosk, pelanggan, dan admin. Tetap aman pakai HTTPS managed.</div>
        </div>
        <div style={state.verified ? S.badgeOk : (state.domain ? S.badgePending : S.badgeOff)}>
          {state.verified ? "● VERIFIED" : (state.domain ? "○ PENDING DNS" : "○ NOT SET")}
        </div>
      </div>

      {msg.text && <div style={msg.kind === "error" ? S.alertErr : S.alertOk}>{msg.text}</div>}

      <section style={S.card}>
        <div style={S.cardTitle}>Step 1 — Daftarkan domain</div>
        <div style={S.muted}>Masukkan domain (tanpa http://). Contoh: <code>order.namabrand.com</code></div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <input value={draftDomain} onChange={e => setDraftDomain(e.target.value)}
            placeholder="order.namabrand.com" style={{ ...S.input, flex: 1 }} />
          <button onClick={saveDomain} disabled={busy} style={{ ...S.btnPrimary, opacity: busy ? 0.5 : 1 }}>
            {busy ? "Menyimpan…" : (state.domain ? "Update" : "Simpan")}
          </button>
          {state.domain && (
            <button onClick={() => { setDraftDomain(""); saveDomain(); }} disabled={busy}
              style={{ ...S.btnSecondary, color: "#fca5a5" }}>Hapus</button>
          )}
        </div>
      </section>

      {state.domain && (
        <>
          <section style={S.card}>
            <div style={S.cardTitle}>Step 2 — Setup DNS records</div>
            <div style={S.muted}>Di panel DNS provider Anda (Cloudflare, Route53, Niagahoster, dll), buat 2 record di bawah:</div>

            <div style={S.dnsBlock}>
              <div style={S.dnsLabel}>CNAME (untuk routing)</div>
              <div style={S.dnsRow}>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={S.dnsField}>Name / Host</div>
                  <div style={S.dnsValue}>{state.domain.split(".").slice(0, -2).join(".") || "@"}</div>
                </div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={S.dnsField}>Type</div>
                  <div style={S.dnsValue}>CNAME</div>
                </div>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <div style={S.dnsField}>Value / Target</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={S.dnsValue}>{cnameTarget}</div>
                    <button onClick={() => copy(cnameTarget)} style={S.btnTinyMono}>copy</button>
                  </div>
                </div>
              </div>
            </div>

            <div style={S.dnsBlock}>
              <div style={S.dnsLabel}>TXT (untuk verifikasi kepemilikan)</div>
              <div style={S.dnsRow}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={S.dnsField}>Name / Host</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={S.dnsValue}>{state.txt_record_name}</div>
                    <button onClick={() => copy(state.txt_record_name)} style={S.btnTinyMono}>copy</button>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <div style={S.dnsField}>Type</div>
                  <div style={S.dnsValue}>TXT</div>
                </div>
                <div style={{ flex: 2, minWidth: 250 }}>
                  <div style={S.dnsField}>Value</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={S.dnsValue}>{state.txt_record_value}</div>
                    <button onClick={() => copy(state.txt_record_value)} style={S.btnTinyMono}>copy</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section style={S.card}>
            <div style={S.cardTitle}>Step 3 — Verify</div>
            <div style={S.muted}>Tunggu propagasi DNS (1-30 menit umumnya, hingga 24 jam). Lalu klik tombol di bawah untuk verifikasi.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
              <button onClick={verifyDomain} disabled={busy || state.verified}
                style={{ ...S.btnPrimary, opacity: (busy || state.verified) ? 0.5 : 1 }}>
                {state.verified ? "✓ Sudah Verified" : (busy ? "Memeriksa DNS…" : "🔍 Verify DNS")}
              </button>
              {state.verified && (
                <a href={`https://${state.domain}`} target="_blank" rel="noreferrer"
                  style={{ ...S.btnSecondary, textDecoration: "none", display: "inline-block" }}>
                  Open {state.domain} →
                </a>
              )}
            </div>
          </section>

          {!state.verified && (
            <section style={{ ...S.card, background: "rgba(251,191,36,0.04)", borderColor: "rgba(251,191,36,0.2)" }}>
              <div style={S.cardTitle}>Cek DNS dari command line</div>
              <pre style={S.code}>{`dig TXT ${state.txt_record_name}
# atau
nslookup -type=TXT ${state.txt_record_name}

# Output yang diharapkan:
# "${state.txt_record_value}"`}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const S = {
  page: { padding: 28, maxWidth: 980, margin: "0 auto", color: "#cdd5df", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" },
  muted: { color: "rgba(205,213,223,0.55)", fontSize: 13, lineHeight: 1.6 },
  card: { padding: 22, borderRadius: 14, marginBottom: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    border: "1px solid rgba(255,255,255,0.07)" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 },
  badgeOk: { padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
    background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" },
  badgePending: { padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
    background: "rgba(251,191,36,0.15)", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.3)" },
  badgeOff: { padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
    background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  input: { padding: "11px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" },
  dnsBlock: { marginTop: 16, padding: 16, background: "rgba(0,0,0,0.25)", borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)" },
  dnsLabel: { fontSize: 11, fontWeight: 700, color: "#fbbf24", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" },
  dnsRow: { display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" },
  dnsField: { fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" },
  dnsValue: { padding: "8px 12px", background: "rgba(0,0,0,0.4)", borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.08)", fontFamily: "monospace", fontSize: 12,
    color: "#fff", letterSpacing: 0.5, wordBreak: "break-all", flex: 1 },
  code: { marginTop: 12, padding: "14px 16px", background: "rgba(0,0,0,0.45)", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontFamily: "'Geist Mono',monospace",
    color: "#cdd5df", overflow: "auto", whiteSpace: "pre" },
  btnPrimary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" },
  btnSecondary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#cdd5df", fontWeight: 600, cursor: "pointer",
    fontSize: 13, fontFamily: "inherit" },
  btnTinyMono: { padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "rgba(205,213,223,0.7)", fontWeight: 600, cursor: "pointer",
    fontSize: 10, fontFamily: "'Geist Mono',monospace" },
  alertOk: { padding: "12px 16px", borderRadius: 10, background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)", color: "#86efac", fontSize: 13, marginBottom: 14 },
  alertErr: { padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", fontSize: 13, marginBottom: 14 },
};
