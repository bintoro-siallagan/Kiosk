// src/Admin/AdminDocumentHub.jsx
// Document / SOP Hub — repositori SOP, kebijakan & work instruction.

import { useState, useEffect, useCallback } from "react";

const AC = "#0891b2";
const CAT_C = { SOP: "#22d3ee", Kebijakan: "#f59e0b", "Work Instruction": "#a855f7", Formulir: "#10b981" };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function AdminDocumentHub({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", category: "SOP", version: "v1.0", owner: "", audience: "52" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/document-hub`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.title.trim()) { setMsg("⚠ Judul dokumen wajib"); return; }
    fetch(`${apiBase}/api/document-hub`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, audience: Number(form.audience) || 52 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Dokumen ditambah (draft)"); setForm({ ...form, title: "", owner: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const act = (doc, action) => {
    fetch(`${apiBase}/api/document-hub/${doc.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) load(); else setMsg(j.error || "gagal"); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Document Hub…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📚 <b style={{ color: "#22d3ee" }}>DOCUMENT / SOP HUB</b> — repositori SOP, kebijakan &amp; work
        instruction. Versioning + tracking siapa sudah baca &amp; acknowledge.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Dokumen" v={String(s.total)} c={AC} />
        <Kpi label="Published" v={String(s.published)} c="#10b981" />
        <Kpi label="Draft" v={String(s.draft)} c={s.draft > 0 ? "#f59e0b" : "#5b6470"} />
        <Kpi label="Avg Acknowledge" v={s.avg_ack + "%"} c={s.avg_ack >= 80 ? "#10b981" : "#f59e0b"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH DOKUMEN</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.1fr 0.8fr 1fr 0.8fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul dokumen" style={S.input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} placeholder="Versi" style={S.input} />
          <input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="Owner" style={S.input} />
          <input value={form.audience} onChange={e => setForm({ ...form, audience: e.target.value })} placeholder="Audiens" type="number" style={S.input} />
          <button onClick={add} style={S.btn}>+ Dokumen</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📚 DAFTAR DOKUMEN — {d.documents.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.documents.map(doc => {
            const cc = CAT_C[doc.category] || "#5b6470";
            const pub = doc.status === "published";
            return (
              <div key={doc.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${cc}`, borderRadius: 9, padding: "10px 13px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                    {doc.title} <span style={{ fontSize: 10, color: cc, fontFamily: "'Space Mono',monospace" }}>· {doc.category} · {doc.version}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{doc.code} · {doc.owner} · update {fmtDate(doc.updated_at)}</div>
                </div>
                {pub ? (
                  <div style={{ width: 130 }}>
                    <div style={{ fontSize: 10, color: "#5b6470", textAlign: "right" }}>{doc.acknowledged}/{doc.audience} baca · {doc.ack_pct}%</div>
                    <div style={{ height: 4, background: "#161b22", borderRadius: 2, marginTop: 3 }}>
                      <div style={{ height: "100%", width: doc.ack_pct + "%", background: doc.ack_pct >= 80 ? "#10b981" : "#f59e0b", borderRadius: 2 }} />
                    </div>
                  </div>
                ) : <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", background: "#f59e0b1f", border: "1px solid #f59e0b55", borderRadius: 5, padding: "3px 8px", fontFamily: "'Space Mono',monospace" }}>DRAFT</span>}
                {pub
                  ? <button onClick={() => act(doc, "ack")} style={S.btnGhost}>✓ Acknowledge</button>
                  : <button onClick={() => act(doc, "publish")} style={S.btn}>Publish</button>}
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
  btn: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 7, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
