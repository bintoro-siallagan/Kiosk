// src/Admin/AdminInternalReturn.jsx
// Internal Return — Transfer Return & Delivery Return + partial complete.

import { useState, useEffect, useCallback } from "react";

const AC = "#9f1239";
const TYPE = { transfer: { c: "#2563eb", l: "TRANSFER RETURN" }, delivery: { c: "#0e7490", l: "DELIVERY RETURN" } };
const STAT = { draft: { c: "#f59e0b", l: "DRAFT" }, partial: { c: "#3b82f6", l: "PARTIAL" }, completed: { c: "#10b981", l: "SELESAI" } };
const REASON_C = { Rusak: "#ef4444", Kedaluwarsa: "#f59e0b", "Salah Kirim": "#3b82f6", "Kualitas Buruk": "#a855f7", "Kelebihan Kirim": "#0d9488" };

export default function AdminInternalReturn({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/internal-return`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const process = (r, skus) => {
    fetch(`${apiBase}/api/internal-return/${r.id}/process`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skus: skus || [] }),
    }).then(x => x.json()).then(j => {
      if (j.ok) { setMsg(`✓ ${r.return_no} — ${j.status} · ${j.stock_posted} item ke-posting`); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Internal Return…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🔁 <b style={{ color: "#fb7185" }}>INTERNAL RETURN</b> — Transfer Return (antar-outlet) &amp;
        Delivery Return (ke gudang pusat). Dukung <b>partial complete</b> — proses sebagian item dulu, sisanya menyusul.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Retur" v={String(s.total)} c={AC} />
        <Kpi label="Draft" v={String(s.draft)} c={s.draft > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Partial" v={String(s.partial)} c={s.partial > 0 ? "#3b82f6" : "#5b6470"} />
        <Kpi label="Selesai" v={String(s.completed)} c="#10b981" />
      </div>
      <div style={{ fontSize: 11, color: "#5b6470", margin: "8px 2px", fontFamily: "'Geist Mono',monospace" }}>
        {s.transfer} transfer return · {s.delivery} delivery return
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "4px 2px 8px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 6 }}>
        <div style={S.kicker}>🔁 DAFTAR RETUR — {d.returns.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.returns.map(r => {
            const ty = TYPE[r.return_type] || TYPE.transfer, st = STAT[r.status] || STAT.draft;
            const pending = r.items.filter(i => !i.processed);
            return (
              <div key={r.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "11px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                      {r.return_no} <span style={{ color: "#60a5fa" }}>· {r.from_loc} → {r.to_loc}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>ref {r.ref_no} · {r.processed_count}/{r.total_items} item diproses</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: ty.c, fontFamily: "'Geist Mono',monospace" }}>{ty.l}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  {pending.length > 0 && (
                    <button onClick={() => process(r, pending.map(i => i.sku))} style={S.act}>Proses Semua</button>
                  )}
                </div>
                <div style={{ marginTop: 7, display: "grid", gap: 4 }}>
                  {r.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                      <span style={{ color: it.processed ? "#10b981" : "#5b6470" }}>{it.processed ? "☑" : "☐"}</span>
                      <span style={{ flex: 1, color: it.processed ? "#5b6470" : "#cdd5df", textDecoration: it.processed ? "line-through" : "none" }}>
                        {it.name} <b style={{ fontFamily: "'Geist Mono',monospace" }}>{it.qty} {it.unit}</b>
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: REASON_C[it.reason] || "#9ca3af", fontFamily: "'Geist Mono',monospace" }}>{it.reason}</span>
                      {!it.processed && <button onClick={() => process(r, [it.sku])} style={S.itemBtn}>proses</button>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  act: { background: "#9f1239", color: "#fff", border: "none", borderRadius: 6, padding: "5px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  itemBtn: { background: "transparent", border: "1px solid #21262d", color: "#9da7b3", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
};
