// src/Admin/AdminRewardBenefit.jsx
// Reward Benefit — crew tukar point jadi benefit nyata.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const ST = {
  pending: { c: "#f59e0b", t: "PENDING", next: "approved", action: "Approve" },
  approved: { c: "#3b82f6", t: "APPROVED", next: "delivered", action: "Tandai Delivered" },
  delivered: { c: "#10b981", t: "DELIVERED", next: null, action: null },
};

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

export default function AdminRewardBenefit({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [crewId, setCrewId] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/reward-benefits`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    if (!editing) return;
    const body = {
      staff_name: editing.staff_name,
      reward_name: editing.reward_name,
      reward_icon: editing.reward_icon,
      point_cost: Number(editing.point_cost) || 0,
      status: editing.status,
    };
    const r = await fetch(`${apiBase}/api/reward-benefits/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus redemption "${item.reward_name}"?`,
      message: `Crew: ${item.staff_name} · ${item.point_cost} poin. Akan dihapus permanen.`,
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/reward-benefits/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  const redeem = (rewardId) => {
    if (!crewId) { setMsg("⚠ Pilih crew dulu"); return; }
    fetch(`${apiBase}/api/reward-benefits/redeem`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: Number(crewId), rewardId }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ Ditukar — sisa point ${j.points_left}`); load(); } else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const setStatus = (id, status) => {
    fetch(`${apiBase}/api/reward-benefits/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Reward Benefit…</div>;
  const s = d.summary;
  const sel = d.crew.find(c => String(c.id) === String(crewId));

  return (
    <div>
      <div style={S.intro}>
        🎁 <b style={{ color: "#ec4899" }}>REWARD BENEFIT</b> — crew tukar point hasil kerja jadi benefit nyata:
        meal voucher, cashback, merchandise, cinema voucher, bonus incentive, shift priority. Apresiasi yang kerasa. 🔥
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Redeemed" v={String(s.total_redeemed)} c="#ec4899" />
        <Kpi label="Point Terpakai" v={s.points_spent.toLocaleString("id-ID")} c="#fbbf24" />
        <Kpi label="Pending Approval" v={String(s.pending)} c={s.pending > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Sudah Delivered" v={String(s.delivered)} c="#10b981" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={S.kicker}>🎟️ TUKAR BENEFIT — pilih crew:</span>
          <select value={crewId} onChange={e => { setCrewId(e.target.value); setMsg(""); }} style={S.select}>
            <option value="">— pilih crew —</option>
            {d.crew.map(c => <option key={c.id} value={c.id}>{c.staff_name} · {c.points} poin ({c.outlet})</option>)}
          </select>
          {sel ? <span style={{ fontSize: 12, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>⭐ {sel.points} poin tersedia</span> : null}
          {msg ? <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</span> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 10, marginTop: 12 }}>
          {d.catalog.map(r => {
            const afford = sel && sel.points >= r.cost;
            return (
              <div key={r.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 10, padding: "12px 13px" }}>
                <div style={{ fontSize: 26 }}>{r.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3", margin: "4px 0 2px" }}>{r.name}</div>
                <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{r.category.toUpperCase()}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>⭐ {r.cost}</span>
                  <button onClick={() => redeem(r.id)} disabled={!afford}
                    style={{ ...S.btn, opacity: afford ? 1 : 0.4, cursor: afford ? "pointer" : "not-allowed" }}>Tukar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 RIWAYAT REDEEM — {d.redemptions.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["CREW", "BENEFIT", "POINT", "TANGGAL", "STATUS", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.redemptions.map(r => {
              const st = ST[r.status] || ST.pending;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                  <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{r.staff_name}</td>
                  <td style={S.td}>{r.reward_icon} {r.reward_name}</td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#fbbf24" }}>⭐ {r.point_cost}</td>
                  <td style={{ ...S.td, color: "#9da7b3" }}>{fmtDate(r.redeemed_at)}</td>
                  <td style={S.td}><span style={{ fontSize: 11, fontWeight: 700, color: st.c }}>{st.t}</span></td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {st.next
                        ? <button onClick={() => setStatus(r.id, st.next)} style={S.btnSm}>{st.action}</button>
                        : <span style={{ color: "#10b981", fontSize: 11 }}>✓ selesai</span>}
                      <button onClick={() => setEditing({ ...r })} style={S.btnEdit} title="Edit">✎</button>
                      <button onClick={() => remove(r)} style={S.btnDel} title="Delete">🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, width: 440, maxWidth: "92vw" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#ec4899", marginBottom: 14, fontFamily: "'Geist Mono',monospace" }}>EDIT REDEMPTION #{editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Nama Crew">
                <input style={modalInp} value={editing.staff_name || ""} onChange={e => setEditing({ ...editing, staff_name: e.target.value })} />
              </Field>
              <Field label="Nama Benefit">
                <input style={modalInp} value={editing.reward_name || ""} onChange={e => setEditing({ ...editing, reward_name: e.target.value })} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
                <Field label="Icon">
                  <input style={modalInp} value={editing.reward_icon || ""} onChange={e => setEditing({ ...editing, reward_icon: e.target.value })} />
                </Field>
                <Field label="Poin">
                  <input type="number" style={modalInp} value={editing.point_cost || 0} onChange={e => setEditing({ ...editing, point_cost: e.target.value })} />
                </Field>
              </div>
              <Field label="Status">
                <select style={modalInp} value={editing.status || "pending"} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  <option value="pending">pending</option>
                  <option value="approved">approved</option>
                  <option value="delivered">delivered</option>
                </select>
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #30363d", color: "#9da7b3", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#ec4899", border: "none", color: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

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
  td: { padding: "9px 8px" },
  select: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "7px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btn: { background: "#ec4899", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  btnSm: { background: "#3b82f61f", border: "1px solid #3b82f655", color: "#7cc4ff", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
  btnEdit: { background: "transparent", border: "1px solid #30363d", color: "#9da7b3", fontSize: 11, padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "transparent", border: "1px solid #ef444444", color: "#ef4444", fontSize: 11, padding: "4px 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" },
};
