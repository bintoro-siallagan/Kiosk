// src/Admin/AdminAutoReorder.jsx
// Auto-Reorder Engine — integrasi Inventory → Procurement.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#3730a3";
const ST = { reorder: { c: "#ef4444", l: "PERLU REORDER" }, watch: { c: "#f59e0b", l: "PANTAU" }, ok: { c: "#10b981", l: "AMAN" } };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminAutoReorder({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/auto-reorder`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const generate = () => {
    setBusy(true); setMsg("");
    fetch(`${apiBase}/api/auto-reorder/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => {
        if (j.ok) setMsg(`✓ ${j.pr_number} dibuat — ${j.items} item · ${fmtRp(j.total_estimated)}. Masuk ke chain Procurement.`);
        else setMsg(j.error || "gagal");
        load();
      }).catch(e => setMsg(String(e))).finally(() => setBusy(false));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Auto-Reorder Engine…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔁 <b style={{ color: "#a5b4fc" }}>AUTO-REORDER ENGINE</b> — integrasi <b>Inventory → Procurement</b>.
        Stok yang mencapai reorder point otomatis dibikinin Purchase Request → masuk chain PR → PO → GD → GR.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Item Gudang" v={String(s.total_items)} c="#a5b4fc" />
        <Kpi label="Perlu Reorder" v={String(s.needs_reorder)} c={s.needs_reorder > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Estimasi Biaya Reorder" v={fmtRp(s.est_reorder_cost)} c="#f59e0b" />
        <Kpi label="PR Ter-generate" v={String(s.prs_generated)} c="#10b981" />
      </div>

      {s.needs_reorder > 0 && (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#ef444444", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#9da7b3" }}>
            ⚠️ <b style={{ color: "#f87171" }}>{s.needs_reorder} item</b> mencapai reorder point — estimasi {fmtRp(s.est_reorder_cost)}.
          </span>
          <button onClick={generate} disabled={busy} style={S.btn}>{busy ? "Memproses…" : "⚡ Generate Purchase Request"}</button>
        </div>
      )}
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📦 ANALISA STOK — urut paling kritis</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["SKU", "ITEM", "STOK", "REORDER POINT", "QTY REORDER", "SUPPLIER", "EST. BIAYA", "STATUS"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.items.map(it => {
              const st = ST[it.status];
              return (
                <tr key={it.sku} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                  <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{it.sku}</td>
                  <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{it.name}</td>
                  <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: st.c }}>{it.stock} {it.unit}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{it.reorder_point}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{it.reorder_qty} {it.unit}</td>
                  <td style={{ ...S.td, color: "#9da7b3" }}>{it.supplier}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{it.status === "reorder" ? fmtRp(it.est_total) : "—"}</td>
                  <td style={S.td}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 7px", fontFamily: "'Space Mono',monospace" }}>{st.l}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🧾 PR TER-GENERATE OTOMATIS — {d.generated_prs.length}</div>
        {d.generated_prs.length === 0 ? (
          <div style={{ fontSize: 12, color: "#5b6470", padding: "10px 0" }}>Belum ada PR auto-generated. Klik "Generate" di atas.</div>
        ) : d.generated_prs.map(pr => (
          <div key={pr.pr_number} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
            <span style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, color: "#a5b4fc" }}>{pr.pr_number}</span>
            <span style={{ flex: 1, color: "#9da7b3" }}>{pr.items} item · {fmtDate(pr.created_at)}</span>
            <span style={{ fontFamily: "'Space Mono',monospace", color: "#cdd5df" }}>{fmtRp(pr.total_estimated)}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#10b981", fontFamily: "'Space Mono',monospace" }}>→ {pr.status.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  mono: { fontFamily: "'Space Mono',monospace" },
  btn: { background: "#3730a3", color: "#fff", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
