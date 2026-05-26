// src/Admin/AdminApproval.jsx
// Approval Engine — approval bertingkat by nominal.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#f59e0b";
const CAT_ICON = { refund: "↩️", void: "🚫", expense: "💸", purchase: "🛒" };

export default function AdminApproval({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ category: "refund", amount: "", description: "" });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/approval`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const submit = () => {
    if (!(Number(form.amount) > 0)) { setMsg("⚠ Nominal wajib > 0"); return; }
    fetch(`${apiBase}/api/approval/request`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount), requested_by: "Admin" }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ Diajukan — butuh approval ${j.required_role}`); setForm({ category: "refund", amount: "", description: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/approval/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus request "#${item.id}"?`, message: `${item.description || item.category} — ${fmtRp(item.amount)}. Akan dihapus permanen.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/approval/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };
  const decide = (id, decision) => {
    fetch(`${apiBase}/api/approval/${id}/decide`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Approval Engine…</div>;
  const s = d.summary;
  const tierRange = (tiers, i) => {
    const t = tiers[i], prev = i > 0 ? tiers[i - 1].max : 0;
    if (t.max == null) return `> ${fmtRp(prev)}`;
    return i === 0 ? `≤ ${fmtRp(t.max)}` : `${fmtRp(prev)} – ${fmtRp(t.max)}`;
  };

  return (
    <div>
      <div style={S.intro}>
        ⚖️ <b style={{ color: AC }}>APPROVAL ENGINE</b> — approval bertingkat by nominal. Refund kecil →
        supervisor, besar → direksi. Engine routing otomatis ke approver yang tepat.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Pending" v={String(s.pending)} c={s.pending > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Nilai Pending" v={fmtRp(s.pending_value)} c="#3b82f6" />
        <Kpi label="Approved" v={String(s.approved)} c="#10b981" />
        <Kpi label="Rejected" v={String(s.rejected)} c={s.rejected > 0 ? "#ef4444" : "#5b6470"} />
      </div>

      {/* Rules */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📐 APPROVAL TIER — routing by nominal</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 10, marginTop: 10 }}>
          {d.rules.map(r => (
            <div key={r.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3", marginBottom: 6 }}>{r.icon} {r.label}</div>
              {r.tiers.map((t, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0" }}>
                  <span style={{ color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{tierRange(r.tiers, i)}</span>
                  <span style={{ color: AC, fontWeight: 600 }}>{t.role}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ AJUKAN APPROVAL</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.rules.map(r => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
          </select>
          <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Nominal (Rp)" type="number" style={{ ...S.input, width: 150 }} />
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" style={{ ...S.input, flex: 1, minWidth: 180 }} />
          <button onClick={submit} style={S.btn}>Ajukan</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {/* Pending */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>⏳ MENUNGGU APPROVAL — {d.pending.length}</div>
        {d.pending.length === 0 ? (
          <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>✓ Gak ada approval pending.</div>
        ) : d.pending.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #161b22" }}>
            <span style={{ fontSize: 20 }}>{CAT_ICON[r.category] || "📄"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                {fmtRp(r.amount)} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {r.description || r.category}</span>
              </div>
              <div style={{ fontSize: 11, color: "#5b6470" }}>diajukan {r.requested_by} · butuh <b style={{ color: AC }}>{r.required_role}</b></div>
            </div>
            <button onClick={() => decide(r.id, "approved")} style={S.btnOk}>✓ Approve</button>
            <button onClick={() => decide(r.id, "rejected")} style={S.btnNo}>✕ Reject</button>
            <button onClick={() => setEditing({ ...r })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(r)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
      </div>

      {/* History */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 RIWAYAT — {d.history.length}</div>
        {d.history.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
            <span>{CAT_ICON[r.category] || "📄"}</span>
            <span style={{ color: "#e6edf3", fontWeight: 600 }}>{fmtRp(r.amount)}</span>
            <span style={{ color: "#5b6470", flex: 1 }}>{r.description || r.category}</span>
            <span style={{ color: "#5b6470" }}>{r.decided_by}</span>
            <span style={{ fontWeight: 700, color: r.status === "approved" ? "#10b981" : "#ef4444" }}>
              {r.status === "approved" ? "✓ APPROVED" : "✕ REJECTED"}
            </span>
            <button onClick={() => setEditing({ ...r })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(r)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Request — #{editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KATEGORI</div>
                <select value={editing.category || "refund"} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp}>
                  {d.rules.map(r => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NOMINAL</div><input type="number" value={editing.amount || 0} onChange={e => setEditing({ ...editing, amount: Number(e.target.value) })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>DESKRIPSI</div><input value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>DIAJUKAN OLEH</div><input value={editing.requested_by || ""} onChange={e => setEditing({ ...editing, requested_by: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>REQUIRED ROLE</div><input value={editing.required_role || ""} onChange={e => setEditing({ ...editing, required_role: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>STATUS</div>
                <select value={editing.status || "pending"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#f59e0b", color: "#1a1202", border: "none", borderRadius: 7, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnOk: { background: "#10b9811f", border: "1px solid #10b98155", color: "#34d399", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
  btnNo: { background: "#ef44441f", border: "1px solid #ef444455", color: "#f87171", fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
};
