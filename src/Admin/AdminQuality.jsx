// src/Admin/AdminQuality.jsx
// Quality & Food Safety — inspeksi mutu, food safety audit & HACCP.

import { useState, useEffect, useCallback } from "react";

const AC = "#16a34a";
const RES = { passed: { c: "#10b981", l: "LULUS" }, conditional: { c: "#f59e0b", l: "BERSYARAT" }, failed: { c: "#ef4444", l: "GAGAL" } };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminQuality({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ type: "Inspeksi Mutu", outlet: "", inspector: "", score: "", findings: "" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/quality`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.outlet.trim() || !form.score) { setMsg("⚠ Outlet & skor wajib"); return; }
    fetch(`${apiBase}/api/quality`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ Inspeksi dicatat — ${j.result}`); setForm({ ...form, outlet: "", inspector: "", score: "", findings: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Quality & Food Safety…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🛡️ <b style={{ color: "#4ade80" }}>QUALITY & FOOD SAFETY</b> — inspeksi mutu, food safety audit &amp;
        HACCP check. Skor &amp; temuan per outlet untuk jaga standar pangan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Inspeksi" v={String(s.total)} c={AC} />
        <Kpi label="Rata-rata Skor" v={String(s.avg_score)} c={s.avg_score >= 85 ? "#10b981" : s.avg_score >= 70 ? "#f59e0b" : "#ef4444"} />
        <Kpi label="Lulus" v={String(s.passed)} c="#10b981" />
        <Kpi label="Gagal" v={String(s.failed)} c={s.failed > 0 ? "#ef4444" : "#10b981"} />
      </div>

      {s.failed > 0 && (
        <div style={{ ...S.card, marginTop: 10, borderColor: "#ef444455", background: "#1a0d0f" }}>
          <div style={{ fontSize: 13, color: "#fca5a5" }}>🚨 <b>{s.failed} inspeksi gagal</b> · {s.open_findings} temuan terbuka — risiko keamanan pangan, segera tindak lanjut.</div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ CATAT INSPEKSI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 0.7fr auto", gap: 8, marginTop: 10 }}>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={S.input}>
            {d.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <input value={form.inspector} onChange={e => setForm({ ...form, inspector: e.target.value })} placeholder="Inspektor" style={S.input} />
          <input value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} placeholder="Skor 0-100" type="number" style={S.input} />
          <button onClick={add} style={S.btn}>+ Inspeksi</button>
        </div>
        <input value={form.findings} onChange={e => setForm({ ...form, findings: e.target.value })} placeholder="Temuan (pisah dengan enter / koma — opsional)" style={{ ...S.input, width: "100%", marginTop: 8 }} />
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🛡️ RIWAYAT INSPEKSI — {d.inspections.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.inspections.map(ins => {
            const r = RES[ins.result];
            return (
              <div key={ins.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${r.c}`, borderRadius: 9, padding: "10px 13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{ins.type} <span style={{ fontSize: 11, color: "#5b6470", fontWeight: 400 }}>· {ins.outlet}</span></div>
                    <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{ins.code} · {ins.inspector} · {fmtDate(ins.created_at)}</div>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: r.c, fontFamily: "'Space Mono',monospace" }}>{ins.score}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: r.c, background: r.c + "1f", border: `1px solid ${r.c}55`, borderRadius: 5, padding: "3px 8px", width: 78, textAlign: "center", fontFamily: "'Space Mono',monospace" }}>{r.l}</span>
                </div>
                {ins.findings.length > 0 && (
                  <div style={{ marginTop: 7, display: "grid", gap: 3 }}>
                    {ins.findings.map((f, i) => <div key={i} style={{ fontSize: 11, color: "#f87171" }}>⚠ {f}</div>)}
                  </div>
                )}
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
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
