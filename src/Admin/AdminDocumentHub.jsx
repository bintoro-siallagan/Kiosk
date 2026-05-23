// src/Admin/AdminDocumentHub.jsx
// Document / SOP Hub — repositori SOP, kebijakan & work instruction.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#0891b2";
const CAT_C = { SOP: "#22d3ee", Kebijakan: "#f59e0b", "Work Instruction": "#a855f7", Formulir: "#10b981" };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function AdminDocumentHub({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", category: "SOP", version: "v1.0", owner: "", audience: "52" });
  const [editing, setEditing] = useState(null);

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
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/document-hub/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.title || item.code || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/document-hub/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
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
                    {doc.title} <span style={{ fontSize: 10, color: cc, fontFamily: "'Geist Mono',monospace" }}>· {doc.category} · {doc.version}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{doc.code} · {doc.owner} · update {fmtDate(doc.updated_at)}</div>
                </div>
                {pub ? (
                  <div style={{ width: 130 }}>
                    <div style={{ fontSize: 10, color: "#5b6470", textAlign: "right" }}>{doc.acknowledged}/{doc.audience} baca · {doc.ack_pct}%</div>
                    <div style={{ height: 4, background: "#161b22", borderRadius: 2, marginTop: 3 }}>
                      <div style={{ height: "100%", width: doc.ack_pct + "%", background: doc.ack_pct >= 80 ? "#10b981" : "#f59e0b", borderRadius: 2 }} />
                    </div>
                  </div>
                ) : <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b", background: "#f59e0b1f", border: "1px solid #f59e0b55", borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace" }}>DRAFT</span>}
                {pub
                  ? <button onClick={() => act(doc, "ack")} style={S.btnGhost}>✓ Acknowledge</button>
                  : <button onClick={() => act(doc, "publish")} style={S.btn}>Publish</button>}
                <button onClick={() => setEditing({ ...doc })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(doc)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || editing.code || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KODE</div><input value={editing.code || ""} onChange={e => setEditing({ ...editing, code: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JUDUL</div><input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KATEGORI</div>
                  <select value={editing.category || "SOP"} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp}>
                    {(d.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>VERSI</div><input value={editing.version || ""} onChange={e => setEditing({ ...editing, version: e.target.value })} style={modalInp} /></div>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>OWNER</div><input value={editing.owner || ""} onChange={e => setEditing({ ...editing, owner: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>STATUS</div>
                  <select value={editing.status || "draft"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>ACK</div><input type="number" value={editing.acknowledged || 0} onChange={e => setEditing({ ...editing, acknowledged: Number(e.target.value) })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>AUDIENS</div><input type="number" value={editing.audience || 0} onChange={e => setEditing({ ...editing, audience: Number(e.target.value) })} style={modalInp} /></div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 7, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
