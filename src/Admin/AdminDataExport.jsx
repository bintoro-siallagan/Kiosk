// src/Admin/AdminDataExport.jsx
// White-label P2C UI — GDPR-ready data export download.

import { useEffect, useState } from "react";

export default function AdminDataExport({ onBack }) {
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    fetch("/api/companies/export/manifest.json")
      .then(r => r.json())
      .then(setManifest)
      .catch(() => setManifest({ error: "failed to load manifest" }));
  }, []);

  return (
    <div style={S.root}>
      <header style={S.header}>
        {onBack && <button onClick={onBack} style={S.backBtn}>← Back</button>}
        <h2 style={S.title}>Data Export</h2>
      </header>

      <div style={S.intro}>
        📦 <b style={{ color: "#fff" }}>GDPR-ready exports</b> — download semua data tenant lo dalam format CSV. Scoped to current tenant, no cross-company leak. Bisa lo import ke Excel, Google Sheets, atau system lain.
      </div>

      {!manifest && <div style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</div>}
      {manifest?.error && <div style={S.error}>⚠ {manifest.error}</div>}

      {manifest?.exports && (
        <div style={{ display: "grid", gap: 12 }}>
          {manifest.exports.map(e => (
            <div key={e.kind} style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardIcon}>{kindIcon(e.kind)}</span>
                <div style={{ flex: 1 }}>
                  <div style={S.cardTitle}>{kindLabel(e.kind)}</div>
                  <div style={S.cardDesc}>
                    {typeof e.count === "number" ? `${e.count.toLocaleString()} records` : e.count}
                  </div>
                </div>
                <a href={e.url} download style={S.dlBtn}>📥 Download CSV</a>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={S.footer}>
        Generated: {manifest?.generated_at ? new Date(manifest.generated_at).toLocaleString() : "—"}
        {manifest?.company_id && <span> · Company ID: {manifest.company_id}</span>}
      </div>
    </div>
  );
}

const kindIcon = (k) => ({
  orders: "🧾", customers: "👥", menu: "🍔", sales_summary: "📊",
})[k] || "📄";

const kindLabel = (k) => ({
  orders: "Orders", customers: "Customers", menu: "Menu items", sales_summary: "Sales summary (last 90 days)",
})[k] || k;

const S = {
  root: { padding: "20px 24px", maxWidth: 720, margin: "0 auto", color: "#fff", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  backBtn: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px", color: "rgba(255,255,255,0.95)" },
  intro: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 18px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 20 },
  error: { background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.22)", color: "rgba(248,113,113,0.9)", padding: "12px 16px", borderRadius: 12, fontSize: 13 },
  card: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16, padding: "14px 18px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 14px rgba(0,0,0,0.22)",
  },
  cardHead: { display: "flex", alignItems: "center", gap: 14 },
  cardIcon: { fontSize: 28, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.3))" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.95)", letterSpacing: "-0.3px" },
  cardDesc: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3, fontVariantNumeric: "tabular-nums" },
  dlBtn: {
    padding: "9px 18px", border: "1px solid rgba(255,255,255,0.16)",
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px", textDecoration: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
  footer: { marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.1px" },
};
