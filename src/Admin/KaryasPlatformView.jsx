// karyaOS — Karys Super-Admin Platform View
// Dashboard agregat semua company (tenant) side-by-side. Cuma accessible
// untuk user dengan company_id=NULL (super-admin level).
//
// Use case: karys.tech owner (kapten) pantau semua company yang pakai karyaOS,
// MRR billing-ready, intervention kalau ada anomaly.

import { useEffect, useState } from "react";

import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
const PALETTE = {
  card: "rgba(255,255,255,0.025)", border: "rgba(255,255,255,0.06)",
  amber: "#fbbf24", purple: "#a855f7", cyan: "#22d3ee", green: "#10b981",
  text: "#e6edf3", sub: "rgba(255,255,255,0.55)", dim: "rgba(255,255,255,0.35)",
};

export default function KaryasPlatformView({ apiBase = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", primary_vertical: "fnb", brand_color: "#3b82f6" });
  const [toast, setToast] = useState(null);

  // Verify super-admin saat mount
  const ctx = (() => { try { return JSON.parse(localStorage.getItem("karya_company_ctx") || "null"); } catch { return null; } })();
  const isSuperAdmin = !!(ctx?.is_super_admin || ctx?.company_id == null);

  const reload = () => {
    setLoading(true); setErr(null);
    fetch(`${apiBase}/api/companies/platform/summary`, { headers: { "x-super-admin": "true" } })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(d => setData(d))
      .catch(e => setErr(e.error || "Failed to load platform summary"))
      .finally(() => setLoading(false));
  };
  useEffect(reload, [apiBase]);

  const switchToCompany = async (c) => {
    // Impersonate: swap localStorage ctx → reload page → AdminHome akan render
    // dashboard yang sesuai target company (cinema/fnb/hybrid)
    try {
      const { startImpersonate } = await import("../companyAuth.js");
      const ok = startImpersonate({
        id: c.id, code: c.code, name: c.name,
        primary_vertical: c.primary_vertical, brand_color: c.brand_color, logo_url: c.logo_url,
      });
      if (!ok) { showToast("Gagal impersonate (mungkin sudah jalan?)", "err"); return; }
      showToast(`Impersonating ${c.name}…`);
      setTimeout(() => window.location.reload(), 400);
    } catch (e) { showToast("Error: " + e.message, "err"); }
  };

  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2200); };

  const createCompany = async () => {
    if (!form.code || !form.name) { showToast("Code & name wajib", "err"); return; }
    try {
      const r = await fetch(`${apiBase}/api/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-super-admin": "true" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { showToast(d.error || "Gagal", "err"); return; }
      showToast(`Company "${form.name}" dibuat`);
      setCreating(false); setForm({ code: "", name: "", primary_vertical: "fnb", brand_color: "#3b82f6" });
      reload();
    } catch (e) { showToast("Network error", "err"); }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#fca5a5", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 14, margin: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Akses Rejected</div>
        <div style={{ fontSize: 13, marginTop: 6, color: PALETTE.sub }}>Halaman ini cuma for karys super-admin (platform-wide). Login with user role super-admin.</div>
      </div>
    );
  }

  return (
    <div style={{ color: PALETTE.text, fontFamily: "'Inter',sans-serif", padding: "8px 4px 24px", minHeight: 600 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>🛰️ Karys Platform View</div>
            <span style={{ padding: "3px 10px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 999, fontSize: 11, color: PALETTE.amber, fontWeight: 800, letterSpacing: 1 }}>SUPER-ADMIN</span>
          </div>
          <div style={{ fontSize: 12, color: PALETTE.sub, marginTop: 4 }}>Cross-company aggregate · MRR-ready · billing & ops monitoring</div>
        </div>
        <button onClick={() => setCreating(true)} style={B.add}>＋ New Company</button>
      </div>

      {loading && <LoadingState label="Memuat platform metrics…" />}
      {err && !loading && <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, color: "#fca5a5", fontSize: 13 }}>{err}</div>}

      {data && !loading && (
        <>
          {/* Platform totals */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 20 }}>
            <KPI label="🏢 Total Companies" value={data.platform?.company_count || 0} color={PALETTE.amber} />
            <KPI label="💰 Revenue Today" value={rp(data.platform?.revenue_today)} color={PALETTE.green} />
            <KPI label="📈 Revenue 30 Days" value={rp(data.platform?.revenue_month)} color={PALETTE.cyan} />
            <KPI label="🛒 Tx Today" value={data.platform?.tx_today || 0} color={PALETTE.purple} sub="cross-company" />
          </div>

          {/* Per-company breakdown */}
          <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "12px 16px", borderBottom: `1px solid ${PALETTE.border}`, fontSize: 10, letterSpacing: 1.5, color: PALETTE.dim, fontWeight: 800, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>
              <span style={{ width: 70 }}>CODE</span>
              <span style={{ flex: 1.4 }}>NAME</span>
              <span style={{ width: 80 }}>VERTICAL</span>
              <span style={{ width: 60, textAlign: "right" }}>OUTLET</span>
              <span style={{ width: 60, textAlign: "right" }}>USER</span>
              <span style={{ width: 130, textAlign: "right" }}>OMZET HARI INI</span>
              <span style={{ width: 130, textAlign: "right" }}>OMZET BULAN INI</span>
              <span style={{ width: 60, textAlign: "right" }}>TX</span>
              <span style={{ width: 100, textAlign: "right" }}>ACTIONS</span>
            </div>
            {(data.companies || []).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${PALETTE.border}` }}>
                <span style={{ width: 70, fontFamily: "'Geist Mono',monospace", fontWeight: 800, color: c.brand_color || PALETTE.amber, letterSpacing: 1.5 }}>{c.code}</span>
                <span style={{ flex: 1.4, fontSize: 13, fontWeight: 700 }}>
                  {c.name}
                  {c.status !== "active" && <span style={{ marginLeft: 8, fontSize: 10, color: "#fca5a5", padding: "2px 8px", background: "rgba(239,68,68,0.1)", borderRadius: 6, letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>{c.status?.toUpperCase()}</span>}
                </span>
                <span style={{ width: 80, fontSize: 11.5, color: PALETTE.sub }}>
                  {c.primary_vertical === "cinema" ? "🎬 Cinema" : c.primary_vertical === "hybrid" ? "🔀 Hybrid" : "🍔 F&B"}
                </span>
                <span style={{ width: 60, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 13 }}>{c.outlets}</span>
                <span style={{ width: 60, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 13 }}>{c.users}</span>
                <span style={{ width: 130, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 13, color: PALETTE.green }}>{rp(c.revenue?.today)}</span>
                <span style={{ width: 130, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 13, color: PALETTE.cyan }}>{rp(c.revenue?.month)}</span>
                <span style={{ width: 60, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontSize: 13 }}>{c.transactions?.today}</span>
                <span style={{ width: 100, textAlign: "right" }}>
                  <button onClick={() => switchToCompany(c)} style={B.switch}>🎯 Drill</button>
                </span>
              </div>
            ))}
          </div>

          {/* Vertical breakdown per company (F&B vs Cinema split) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 18 }}>
            {(data.companies || []).map(c => (
              <div key={c.id} style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{c.code} · {c.name}</div>
                  <span style={{ fontSize: 9, color: PALETTE.dim, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>30D BREAKDOWN</span>
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 11.5 }}>
                  <div style={{ flex: 1, background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9.5, color: "#fb923c", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>🍔 F&B</div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#fdba74" }}>{rp(c.fnb?.month?.r)}</div>
                    <div style={{ fontSize: 10, color: PALETTE.dim }}>{c.fnb?.month?.c || 0} orders</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                    <div style={{ fontSize: 9.5, color: "#c084fc", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace" }}>🎬 CINEMA</div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#c084fc" }}>{rp(c.cinema?.month?.r)}</div>
                    <div style={{ fontSize: 10, color: PALETTE.dim }}>{c.cinema?.month?.c || 0} tickets</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create company modal */}
      {creating && (
        <div onClick={() => setCreating(false)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,16,0.7)", backdropFilter: "blur(12px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: `1px solid ${PALETTE.border}`, borderRadius: 16, padding: 22, width: 420, maxWidth: "100%" }}>
            <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 16, fontWeight: 800, marginBottom: 14 }}>＋ New Company</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <FieldRow label="Code (3-5 huruf)">
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="ABC" maxLength={5} style={inp} />
              </FieldRow>
              <FieldRow label="Nama lengkap">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="PT Cinema XYZ" style={inp} />
              </FieldRow>
              <FieldRow label="Primary Vertical">
                <select value={form.primary_vertical} onChange={e => setForm({ ...form, primary_vertical: e.target.value })} style={inp}>
                  <option value="fnb">🍔 F&B</option>
                  <option value="cinema">🎬 Cinema</option>
                  <option value="hybrid">🔀 Hybrid (F&B + Cinema)</option>
                </select>
              </FieldRow>
              <FieldRow label="Brand color">
                <input type="color" value={form.brand_color} onChange={e => setForm({ ...form, brand_color: e.target.value })} style={{ ...inp, height: 36, padding: 4 }} />
              </FieldRow>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={createCompany} style={B.save}>Buat Company</button>
              <button onClick={() => setCreating(false)} style={B.cancel}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>
      )}
    </div>
  );
}

function KPI({ label, value, color, sub }) {
  return (
    <div style={{ background: PALETTE.card, border: `1px solid ${PALETTE.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: PALETTE.sub, letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: PALETTE.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: PALETTE.sub, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = { width: "100%", padding: "9px 12px", background: "#0a0e16", border: `1px solid ${PALETTE.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
const B = {
  add:    { background: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.5)", color: "#fbbf24", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3 },
  switch: { background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.35)", color: "#c084fc", padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.4 },
  save:   { flex: 1, background: "#10b981", border: "none", color: "#04130c", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  cancel: { flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${PALETTE.border}`, color: PALETTE.sub, padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
