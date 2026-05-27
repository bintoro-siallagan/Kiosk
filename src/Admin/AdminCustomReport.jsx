// AdminCustomReport — Custom Report Builder (super-admin)
// Pilih metric, tenant scope, periode, group-by → generate + export CSV

import { useEffect, useState } from "react";

const METRIC_LIST = [
  { key: "revenue",          label: "💰 Total Revenue",     desc: "F&B + Cinema revenue total (Rp)" },
  { key: "tickets_sold",     label: "🎟️ Tickets Sold",      desc: "Cinema tickets count (paid status)" },
  { key: "orders_count",     label: "🍔 Orders Count",       desc: "F&B orders count" },
  { key: "avg_ticket_price", label: "📊 Avg Ticket Price",  desc: "Average cinema ticket price" },
  { key: "fnb_attach_rate",  label: "🍿 F&B Attach Rate",   desc: "% cinema purchase yg ada F&B bundle" },
  { key: "loyalty_points",   label: "⭐ Loyalty Points",    desc: "Points earned total (F&B + Cinema)" },
];

const PRESET_RANGES = [
  { key: "7d",  label: "7 Hari Terakhir" },
  { key: "30d", label: "30 Hari Terakhir" },
  { key: "90d", label: "90 Hari Terakhir" },
  { key: "ytd", label: "Year to Date" },
  { key: "custom", label: "Custom Range" },
];

export default function AdminCustomReport({ onBack }) {
  const [companies, setCompanies] = useState([]);
  const [selectedMetrics, setSelectedMetrics] = useState(new Set(["revenue", "tickets_sold", "orders_count"]));
  const [tenantScope, setTenantScope] = useState("all");  // "all" | Set of company_ids
  const [selectedTenants, setSelectedTenants] = useState(new Set());
  const [presetRange, setPresetRange] = useState("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupBy, setGroupBy] = useState("tenant");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cek super-admin
  const ctx = (() => { try { return JSON.parse(localStorage.getItem("karya_company_ctx") || "null"); } catch { return null; } })();
  const isSuperAdmin = !!(ctx?.is_super_admin || ctx?.company_id == null);

  // Load companies for tenant picker
  useEffect(() => {
    fetch("/api/companies/", { headers: { "x-super-admin": "true" } })
      .then(r => r.json())
      .then(d => setCompanies(Array.isArray(d) ? d : (d.companies || [])))
      .catch(() => {});
  }, []);

  // Compute date range from preset
  function getDateRange() {
    const now = new Date();
    if (presetRange === "custom" && dateFrom && dateTo) {
      return { from: dateFrom, to: dateTo };
    }
    let from;
    if (presetRange === "7d")  from = new Date(now.getTime() - 7 * 86400000);
    else if (presetRange === "30d") from = new Date(now.getTime() - 30 * 86400000);
    else if (presetRange === "90d") from = new Date(now.getTime() - 90 * 86400000);
    else if (presetRange === "ytd") from = new Date(now.getFullYear(), 0, 1);
    else from = new Date(now.getTime() - 30 * 86400000);
    return { from: from.toISOString(), to: now.toISOString() };
  }

  const generate = async () => {
    if (selectedMetrics.size === 0) { setError("Pilih minimal 1 metric"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const { from, to } = getDateRange();
      const r = await fetch("/api/companies/platform/custom-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-super-admin": "true" },
        body: JSON.stringify({
          metrics: Array.from(selectedMetrics),
          tenants: tenantScope === "all" ? "all" : Array.from(selectedTenants),
          date_from: from,
          date_to: to,
          group_by: groupBy,
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const exportCsv = () => {
    if (!result) return;
    const headers = ["Tenant ID", "Code", "Name", "Vertical"];
    const metrics = result.meta.metrics;
    if (metrics.includes("revenue")) headers.push("Revenue F&B", "Revenue Cinema", "Revenue Total");
    if (metrics.includes("tickets_sold")) headers.push("Tickets Sold");
    if (metrics.includes("orders_count")) headers.push("Orders Count");
    if (metrics.includes("avg_ticket_price")) headers.push("Avg Ticket Price");
    if (metrics.includes("fnb_attach_rate")) headers.push("F&B Attach %", "F&B w/ Bundle", "Total Purchases");
    if (metrics.includes("loyalty_points")) headers.push("Loyalty Points Earned");

    const rows = result.rows.map(r => {
      const cells = [r.tenant_id, r.tenant_code, r.tenant_name, r.vertical];
      if (metrics.includes("revenue")) cells.push(r.revenue_fnb || 0, r.revenue_cinema || 0, r.revenue_total || 0);
      if (metrics.includes("tickets_sold")) cells.push(r.tickets_sold || 0);
      if (metrics.includes("orders_count")) cells.push(r.orders_count || 0);
      if (metrics.includes("avg_ticket_price")) cells.push(r.avg_ticket_price || 0);
      if (metrics.includes("fnb_attach_rate")) cells.push(r.fnb_attach_pct || 0, r.fnb_attach_count || 0, r.total_purchases || 0);
      if (metrics.includes("loyalty_points")) cells.push(r.loyalty_points_earned || 0);
      return cells;
    });

    // Totals row
    const totalsRow = ["TOTAL", "—", "—", "—"];
    const t = result.totals;
    if (metrics.includes("revenue")) totalsRow.push(t.revenue_fnb, t.revenue_cinema, t.revenue_total);
    if (metrics.includes("tickets_sold")) totalsRow.push(t.tickets_sold);
    if (metrics.includes("orders_count")) totalsRow.push(t.orders_count);
    if (metrics.includes("avg_ticket_price")) totalsRow.push(t.avg_ticket_price);
    if (metrics.includes("fnb_attach_rate")) totalsRow.push(t.fnb_attach_pct, t.fnb_attach_count, t.total_purchases);
    if (metrics.includes("loyalty_points")) totalsRow.push(t.loyalty_points_earned);
    rows.push(totalsRow);

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `custom-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 40, color: "#fca5a5", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Super-admin Only</div>
        <div style={{ fontSize: 13, color: "#9ca3af" }}>Custom Report cross-tenant hanya untuk super-admin platform.</div>
        {onBack && <button onClick={onBack} style={btn("ghost")}>← Kembali</button>}
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", color: "#e5e7eb", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        {onBack && <button onClick={onBack} style={btn("ghost")}>← Kembali</button>}
        <h1 style={{ display: "inline-block", marginLeft: 16, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>
          📊 Custom Report Builder
        </h1>
      </div>
      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20 }}>
        Bikin laporan custom across-tenant. Pilih metric, scope, periode → generate → export CSV.
      </p>

      {/* BUILDER PANEL */}
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        {/* 1. METRICS */}
        <Section title="1. Pilih Metrics">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
            {METRIC_LIST.map(m => {
              const checked = selectedMetrics.has(m.key);
              return (
                <label key={m.key} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: 12,
                  background: checked ? "rgba(251,146,60,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${checked ? "#fb923c66" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 8, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <input type="checkbox" checked={checked} onChange={e => {
                    setSelectedMetrics(prev => {
                      const s = new Set(prev);
                      if (e.target.checked) s.add(m.key); else s.delete(m.key);
                      return s;
                    });
                  }} style={{ marginTop: 3, cursor: "pointer", width: 16, height: 16 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{m.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </Section>

        {/* 2. TENANT SCOPE */}
        <Section title="2. Tenant Scope">
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" checked={tenantScope === "all"} onChange={() => setTenantScope("all")} />
              <span style={{ fontSize: 13 }}>Semua tenant ({companies.length})</span>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" checked={tenantScope === "select"} onChange={() => setTenantScope("select")} />
              <span style={{ fontSize: 13 }}>Pilih tenant tertentu</span>
            </label>
          </div>
          {tenantScope === "select" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              {companies.map(c => {
                const sel = selectedTenants.has(c.id);
                return (
                  <button key={c.id} onClick={() => {
                    setSelectedTenants(prev => {
                      const s = new Set(prev);
                      if (s.has(c.id)) s.delete(c.id); else s.add(c.id);
                      return s;
                    });
                  }} style={{
                    padding: "5px 10px", fontSize: 11, fontWeight: 700,
                    background: sel ? "#fb923c" : "rgba(255,255,255,0.05)",
                    color: sel ? "#fff" : "#e5e7eb",
                    border: `1px solid ${sel ? "#fb923c" : "rgba(255,255,255,0.1)"}`,
                    borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                  }}>{sel ? "✓ " : ""}{c.code} · {c.name}</button>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3. DATE RANGE */}
        <Section title="3. Periode">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {PRESET_RANGES.map(p => (
              <button key={p.key} onClick={() => setPresetRange(p.key)} style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 700,
                background: presetRange === p.key ? "#fb923c" : "rgba(255,255,255,0.04)",
                color: presetRange === p.key ? "#fff" : "#e5e7eb",
                border: `1px solid ${presetRange === p.key ? "#fb923c" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
              }}>{p.label}</button>
            ))}
          </div>
          {presetRange === "custom" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
              <span style={{ color: "#6b7280" }}>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
            </div>
          )}
        </Section>

        {/* 4. GROUP BY */}
        <Section title="4. Group By">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { k: "tenant", l: "🏢 Tenant" },
              { k: "outlet", l: "📍 Outlet", disabled: true },
              { k: "day",    l: "📅 Day", disabled: true },
              { k: "week",   l: "📅 Week", disabled: true },
              { k: "month",  l: "📅 Month", disabled: true },
            ].map(g => (
              <button key={g.k} onClick={() => !g.disabled && setGroupBy(g.k)} disabled={g.disabled}
                title={g.disabled ? "Coming soon" : ""}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: 700,
                  background: groupBy === g.k ? "#fb923c" : g.disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                  color: groupBy === g.k ? "#fff" : g.disabled ? "#4b5563" : "#e5e7eb",
                  border: `1px solid ${groupBy === g.k ? "#fb923c" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 6, cursor: g.disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
                  opacity: g.disabled ? 0.5 : 1,
                }}>{g.l}{g.disabled ? " 🔒" : ""}</button>
            ))}
          </div>
        </Section>

        {/* GENERATE */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
          {error && <span style={{ marginRight: "auto", fontSize: 12, color: "#fca5a5" }}>⚠️ {error}</span>}
          <button onClick={generate} disabled={loading || selectedMetrics.size === 0} style={btn("primary", loading)}>
            {loading ? "Generating…" : "📊 Generate Report"}
          </button>
        </div>
      </div>

      {/* RESULT */}
      {result && (
        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#fff" }}>📈 Report Result</h2>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                {result.rows.length} tenants · {result.meta.metrics.length} metric ·
                {new Date(result.meta.date_from).toLocaleDateString("id-ID")} → {new Date(result.meta.date_to).toLocaleDateString("id-ID")}
              </div>
            </div>
            <button onClick={exportCsv} style={btn("ghost")}>📥 Export CSV</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 800 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>
                  <th style={th()}>Tenant</th>
                  <th style={th()}>Vertical</th>
                  {result.meta.metrics.includes("revenue") && <>
                    <th style={{ ...th(), textAlign: "right" }}>Revenue F&B</th>
                    <th style={{ ...th(), textAlign: "right" }}>Revenue Cinema</th>
                    <th style={{ ...th(), textAlign: "right" }}>Total</th>
                  </>}
                  {result.meta.metrics.includes("tickets_sold") && <th style={{ ...th(), textAlign: "right" }}>Tickets</th>}
                  {result.meta.metrics.includes("orders_count") && <th style={{ ...th(), textAlign: "right" }}>Orders</th>}
                  {result.meta.metrics.includes("avg_ticket_price") && <th style={{ ...th(), textAlign: "right" }}>Avg Ticket</th>}
                  {result.meta.metrics.includes("fnb_attach_rate") && <th style={{ ...th(), textAlign: "right" }}>F&B Attach</th>}
                  {result.meta.metrics.includes("loyalty_points") && <th style={{ ...th(), textAlign: "right" }}>Loyalty Pts</th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map(r => (
                  <tr key={r.tenant_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={td()}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{r.tenant_name}</div>
                      <div style={{ fontSize: 10, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>#{r.tenant_id} · {r.tenant_code}</div>
                    </td>
                    <td style={td()}>{r.vertical || "—"}</td>
                    {result.meta.metrics.includes("revenue") && <>
                      <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(r.revenue_fnb)}</td>
                      <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(r.revenue_cinema)}</td>
                      <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, color: "#10b981" }}>{fmt(r.revenue_total)}</td>
                    </>}
                    {result.meta.metrics.includes("tickets_sold") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{r.tickets_sold || 0}</td>}
                    {result.meta.metrics.includes("orders_count") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{r.orders_count || 0}</td>}
                    {result.meta.metrics.includes("avg_ticket_price") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{fmt(r.avg_ticket_price)}</td>}
                    {result.meta.metrics.includes("fnb_attach_rate") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{r.fnb_attach_pct || 0}%</td>}
                    {result.meta.metrics.includes("loyalty_points") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }}>{r.loyalty_points_earned || 0}</td>}
                  </tr>
                ))}
                {/* TOTALS row */}
                <tr style={{ background: "rgba(251,146,60,0.06)", borderTop: "2px solid rgba(251,146,60,0.3)" }}>
                  <td style={{ ...td(), fontWeight: 800, color: "#fb923c" }}>TOTAL</td>
                  <td style={td()}>—</td>
                  {result.meta.metrics.includes("revenue") && <>
                    <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{fmt(result.totals.revenue_fnb)}</td>
                    <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{fmt(result.totals.revenue_cinema)}</td>
                    <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, color: "#10b981" }}>{fmt(result.totals.revenue_total)}</td>
                  </>}
                  {result.meta.metrics.includes("tickets_sold") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{result.totals.tickets_sold}</td>}
                  {result.meta.metrics.includes("orders_count") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{result.totals.orders_count}</td>}
                  {result.meta.metrics.includes("avg_ticket_price") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{fmt(result.totals.avg_ticket_price)}</td>}
                  {result.meta.metrics.includes("fnb_attach_rate") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{result.totals.fnb_attach_pct}%</td>}
                  {result.meta.metrics.includes("loyalty_points") && <td style={{ ...td(), textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontWeight: 800 }}>{result.totals.loyalty_points_earned}</td>}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(n) {
  return n != null ? "Rp " + Number(n).toLocaleString("id-ID") : "—";
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ margin: 0, marginBottom: 10, fontSize: 12.5, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'JetBrains Mono',monospace" }}>{title}</h3>
      {children}
    </div>
  );
}
const inputStyle = {
  padding: "8px 12px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
};
function btn(variant, disabled) {
  const base = {
    padding: "8px 16px", borderRadius: 8, border: "none",
    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.6 : 1,
    transition: "all 0.15s",
  };
  if (variant === "primary") return { ...base, background: "#fb923c", color: "#fff" };
  if (variant === "ghost") return { ...base, background: "transparent", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.12)" };
  return base;
}
function th() { return { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700 }; }
function td() { return { padding: "10px 12px", verticalAlign: "middle" }; }
