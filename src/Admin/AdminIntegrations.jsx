// src/Admin/AdminIntegrations.jsx
// White-label P2B — per-tenant API keys UI.
// Encrypted at rest, masked on display, plain only when user types new value.

import { useEffect, useState, useCallback } from "react";

const PROVIDERS = [
  {
    id: "midtrans", label: "Midtrans", icon: "💳",
    desc: "Payment gateway — QRIS, GoPay, OVO, Dana via Snap API.",
    fields: [
      { key: "server_key",   label: "Server Key",   placeholder: "SB-Mid-server-..." },
      { key: "client_key",   label: "Client Key",   placeholder: "SB-Mid-client-..." },
      { key: "merchant_id",  label: "Merchant ID",  placeholder: "M0001" },
      { key: "is_production", label: "Production",   placeholder: "true | false (default sandbox)" },
    ],
    docs: "https://docs.midtrans.com",
  },
  {
    id: "xendit", label: "Xendit", icon: "🟦",
    desc: "Alternative payment gateway. QRIS + e-wallet + bank transfer.",
    fields: [
      { key: "secret_key",     label: "Secret Key",     placeholder: "xnd_development_..." },
      { key: "webhook_token",  label: "Webhook Token",  placeholder: "wt_..." },
    ],
    docs: "https://docs.xendit.co",
  },
  {
    id: "esb", label: "ESB Order QS", icon: "🔗",
    desc: "Restaurant ERP sync — push/pull menu, orders, sales reports.",
    fields: [
      { key: "api_key",    label: "API Key",    placeholder: "Bearer xxxx" },
      { key: "outlet_id",  label: "Outlet ID",  placeholder: "Your ESB outlet ID" },
      { key: "client_id",  label: "Client ID",  placeholder: "Optional" },
      { key: "base_url",   label: "Base URL",   placeholder: "https://api.esb.co.id/eso-qs/v1" },
    ],
    docs: "https://developers.esb.co.id/eso-qs",
  },
  {
    id: "fonnte", label: "Fonnte WhatsApp", icon: "💬",
    desc: "WhatsApp notification — order updates, marketing broadcasts.",
    fields: [
      { key: "token", label: "API Token", placeholder: "Fonnte token from dashboard" },
    ],
    docs: "https://fonnte.com",
  },
  {
    id: "twilio", label: "Twilio WhatsApp", icon: "📱",
    desc: "Alternative WhatsApp + SMS provider.",
    fields: [
      { key: "account_sid", label: "Account SID",  placeholder: "AC..." },
      { key: "auth_token",  label: "Auth Token",   placeholder: "Your Twilio auth token" },
      { key: "from_number", label: "From Number",  placeholder: "+62812..." },
    ],
    docs: "https://www.twilio.com/whatsapp",
  },
  {
    id: "tmdb", label: "TMDB (Cinema)", icon: "🎬",
    desc: "The Movie Database — auto-fill poster, trailer, synopsis for cinema schedule.",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "Your TMDB v3 API key" },
    ],
    docs: "https://www.themoviedb.org/settings/api",
  },
];

export default function AdminIntegrations({ onBack }) {
  const [integrations, setIntegrations] = useState({});
  const [forms, setForms] = useState({}); // { providerId: { key1: newValue, ... } }
  const [busy, setBusy] = useState({});
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    fetch("/api/integrations")
      .then(r => r.json())
      .then(d => setIntegrations(d.integrations || {}));
  }, []);
  useEffect(load, [load]);

  async function save(provider) {
    setBusy(b => ({ ...b, [provider]: true }));
    const payload = forms[provider] || {};
    try {
      const r = await fetch(`/api/integrations/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      setForms(f => ({ ...f, [provider]: {} })); // clear form
      load();
      alert("✓ Saved (encrypted at rest)");
    } catch (e) { alert("✗ " + e.message); }
    finally { setBusy(b => ({ ...b, [provider]: false })); }
  }

  async function wipe(provider) {
    if (!confirm(`Hapus SEMUA keys untuk ${provider}? Integration berhenti jalan.`)) return;
    try {
      await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
      load();
    } catch (e) { alert("✗ " + e.message); }
  }

  async function test(provider) {
    try {
      const r = await fetch(`/api/integrations/${provider}/test`, { method: "POST" });
      const j = await r.json();
      alert(`Test ${provider}:\n${JSON.stringify(j, null, 2)}`);
    } catch (e) { alert("✗ " + e.message); }
  }

  return (
    <div style={S.root}>
      <header style={S.header}>
        {onBack && <button onClick={onBack} style={S.backBtn}>← Back</button>}
        <h2 style={S.title}>Integrations</h2>
      </header>

      <div style={S.intro}>
        🔑 <b style={{ color: "#fff" }}>Per-tenant API keys</b> — encrypted at rest with AES-256-CBC.
        Keys never sent back to frontend in plaintext; only masked previews. Each tenant's credentials isolated.
      </div>

      {PROVIDERS.map(p => {
        const current = integrations[p.id] || {};
        const isOpen = expanded === p.id;
        const hasAny = Object.keys(current).length > 0;
        return (
          <section key={p.id} style={S.card}>
            <div style={S.cardHead} onClick={() => setExpanded(isOpen ? null : p.id)}>
              <span style={S.cardIcon}>{p.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={S.cardTitle}>
                  {p.label}
                  {hasAny && <span style={S.activeBadge}>● ACTIVE</span>}
                </div>
                <div style={S.cardDesc}>{p.desc}</div>
              </div>
              <div style={S.expandIcon}>{isOpen ? "−" : "+"}</div>
            </div>

            {isOpen && (
              <div style={S.expandBody}>
                {p.fields.map(f => {
                  const stored = current[f.key];
                  const newValue = forms[p.id]?.[f.key] ?? "";
                  return (
                    <div key={f.key} style={S.fieldRow}>
                      <label style={S.fieldLabel}>{f.label}</label>
                      <div style={{ flex: 1 }}>
                        {stored && (
                          <div style={S.maskedRow}>
                            <code style={S.maskedCode}>{stored.masked}</code>
                            <span style={S.fieldHint}>stored · {stored.length} chars</span>
                          </div>
                        )}
                        <input
                          type="text"
                          value={newValue}
                          onChange={e => setForms(s => ({ ...s, [p.id]: { ...(s[p.id] || {}), [f.key]: e.target.value } }))}
                          placeholder={stored ? "(leave empty to keep existing)" : f.placeholder}
                          style={S.input}
                        />
                      </div>
                    </div>
                  );
                })}

                <div style={S.actionRow}>
                  <a href={p.docs} target="_blank" rel="noopener noreferrer" style={S.docsLink}>📖 Docs</a>
                  <div style={{ flex: 1 }}/>
                  {hasAny && <button onClick={() => test(p.id)} style={S.testBtn}>Test</button>}
                  {hasAny && <button onClick={() => wipe(p.id)} style={S.wipeBtn}>Wipe all</button>}
                  <button onClick={() => save(p.id)} disabled={busy[p.id]} style={S.saveBtn}>
                    {busy[p.id] ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const S = {
  root: { padding: "20px 24px", maxWidth: 760, margin: "0 auto", color: "#fff", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  backBtn: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px", color: "rgba(255,255,255,0.95)" },
  intro: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 18px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 20 },
  card: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16, marginBottom: 12,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 14px rgba(0,0,0,0.22)",
    overflow: "hidden",
  },
  cardHead: { display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer" },
  cardIcon: { fontSize: 24, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.3))" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px" },
  cardDesc: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, letterSpacing: "-0.1px" },
  activeBadge: { marginLeft: 8, fontSize: 9, fontWeight: 600, color: "#34D399", letterSpacing: 1 },
  expandIcon: { fontSize: 20, color: "rgba(255,255,255,0.4)", width: 20, textAlign: "center" },
  expandBody: { padding: "0 20px 18px", borderTop: "1px solid rgba(255,255,255,0.05)" },
  fieldRow: { display: "flex", gap: 12, marginTop: 14, alignItems: "flex-start" },
  fieldLabel: { width: 130, fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)", paddingTop: 11, letterSpacing: "-0.1px" },
  maskedRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  maskedCode: { background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.22)", padding: "4px 10px", borderRadius: 6, color: "#34D399", fontSize: 11, fontFamily: "ui-monospace, monospace", letterSpacing: 0.5 },
  fieldHint: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  input: { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: 10, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: "none", boxSizing: "border-box" },
  actionRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" },
  docsLink: { fontSize: 12, color: "rgba(255,255,255,0.5)", textDecoration: "none", letterSpacing: "-0.1px" },
  testBtn: { padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "'Inter',sans-serif" },
  wipeBtn: { padding: "8px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", color: "rgba(248,113,113,0.85)", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "'Inter',sans-serif" },
  saveBtn: {
    padding: "9px 20px", border: "1px solid rgba(255,255,255,0.16)",
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
};
