// src/Admin/AdminReconciliation.jsx
// Reconciliation Center — Bank, Cash Count & GL Reconciliation.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0d9488";

export default function AdminReconciliation({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [sec, setSec] = useState("bank");
  const [cc, setCc] = useState({ outlet: "Paskal", system_cash: "", counted_cash: "" });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); // { kind: 'cash'|'bank', ...row }

  const load = useCallback(() => {
    fetch(`${apiBase}/api/reconciliation`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (path, body, okMsg, method = "POST") => {
    fetch(`${apiBase}/api/reconciliation/${path}`, {
      method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const addCount = () => {
    if (!(Number(cc.system_cash) > 0)) { setMsg("⚠ Kas sistem wajib"); return; }
    post("cash-count", { ...cc, system_cash: Number(cc.system_cash), counted_cash: Number(cc.counted_cash), counted_by: "Supervisor" }, "✓ Cash count dicatat");
    setCc({ outlet: "Paskal", system_cash: "", counted_cash: "" });
  };

  const saveEdit = async () => {
    const path = editing.kind === "cash" ? `cash-count/${editing.id}` : `bank-item/${editing.id}`;
    const body = editing.kind === "cash"
      ? { outlet: editing.outlet, system_cash: Number(editing.system_cash) || 0, counted_cash: Number(editing.counted_cash) || 0, counted_by: editing.counted_by || "Supervisor" }
      : { txn_date: editing.txn_date, description: editing.description, amount: Number(editing.amount) || 0, side: editing.side, matched: Number(editing.matched) || 0 };
    const r = await fetch(`${apiBase}/api/reconciliation/${path}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (kind, item) => {
    const label = kind === "cash" ? `cash count ${item.outlet}` : `${item.description}`;
    const ok = await confirm({
      title: `Hapus "${label}"?`,
      message: "Akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const path = kind === "cash" ? `cash-count/${item.id}` : `bank-item/${item.id}`;
    const r = await fetch(`${apiBase}/api/reconciliation/${path}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Reconciliation Center…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        ⚖️ <b style={{ color: "#2dd4bf" }}>RECONCILIATION CENTER</b> — Bank Reconciliation, Cash Count &amp;
        GL Reconciliation dalam satu modul. Pastikan semua saldo cocok &amp; valid.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Bank Unmatched" v={String(s.bank_unmatched)} c={s.bank_unmatched > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Selisih Kas" v={fmtRp(s.cash_variance)} c={s.cash_variance === 0 ? "#10b981" : "#ef4444"} />
        <Kpi label="GL Belum Recon" v={String(s.gl_pending)} c={s.gl_pending > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Selisih Bank" v={fmtRp(d.bank.difference)} c={d.bank.difference === 0 ? "#10b981" : "#f59e0b"} />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ display: "flex", gap: 7, margin: "14px 0 0" }}>
        {[["bank", "🏦 Bank Reconcile"], ["cash", "💵 Cash Count"], ["gl", "📒 GL Reconcile"]].map(([k, l]) => (
          <button key={k} onClick={() => setSec(k)} style={{ ...S.tab, ...(sec === k ? { background: AC, border: `1px solid ${AC}`, color: "#fff" } : {}) }}>{l}</button>
        ))}
      </div>

      {sec === "bank" && (
        <div style={{ ...S.card, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={S.kicker}>🏦 BANK RECONCILIATION</span>
            <span style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace" }}>
              Buku <b style={{ color: "#cdd5df" }}>{fmtRp(d.bank.book_balance)}</b> · Bank <b style={{ color: "#cdd5df" }}>{fmtRp(d.bank.bank_balance)}</b> · Selisih <b style={{ color: d.bank.difference === 0 ? "#10b981" : "#f59e0b" }}>{fmtRp(d.bank.difference)}</b>
            </span>
          </div>
          {d.bank.items.map(it => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ fontSize: 9, width: 50, color: it.side === "book" ? "#3b82f6" : "#a855f7", fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>{it.side.toUpperCase()}</span>
              <span style={{ width: 60, color: "#5b6470" }}>{it.txn_date}</span>
              <span style={{ flex: 1, color: "#9da7b3" }}>{it.description}</span>
              <span style={{ width: 110, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: it.amount < 0 ? "#f87171" : "#34d399" }}>{fmtRp(it.amount)}</span>
              <button onClick={() => post(`bank-match/${it.id}`, null, it.matched ? "✓ Unmatch" : "✓ Matched")} style={S.btn(it.matched ? "#10b981" : "#5b6470")}>
                {it.matched ? "✓ matched" : "○ match"}
              </button>
              <button onClick={() => setEditing({ kind: "bank", ...it })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
              <button onClick={() => remove("bank", it)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      {sec === "cash" && (
        <div style={{ ...S.card, marginTop: 12 }}>
          <div style={S.kicker}>💵 CASH COUNT — fisik vs sistem</div>
          <div style={{ display: "flex", gap: 8, margin: "10px 0 14px" }}>
            <input value={cc.outlet} onChange={e => setCc({ ...cc, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
            <input value={cc.system_cash} onChange={e => setCc({ ...cc, system_cash: e.target.value })} placeholder="Kas sistem" type="number" style={S.input} />
            <input value={cc.counted_cash} onChange={e => setCc({ ...cc, counted_cash: e.target.value })} placeholder="Kas fisik" type="number" style={S.input} />
            <button onClick={addCount} style={S.btnPrimary}>+ Catat Count</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>{["OUTLET", "KAS SISTEM", "KAS FISIK", "SELISIH", "OLEH", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px" }}>{h}</th>)}</tr></thead>
            <tbody>
              {d.cash.counts.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                  <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{c.outlet}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(c.system_cash)}</td>
                  <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(c.counted_cash)}</td>
                  <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: c.variance === 0 ? "#10b981" : "#ef4444" }}>{c.variance === 0 ? "✓ pas" : fmtRp(c.variance)}</td>
                  <td style={{ ...S.td, color: "#5b6470" }}>{c.counted_by}</td>
                  <td style={S.td}>
                    <button onClick={() => setEditing({ kind: "cash", ...c })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove("cash", c)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginLeft: 4 }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 22, width: 460, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>
              {editing.kind === "cash" ? "Edit Cash Count" : "Edit Bank Item"} — #{editing.id}
            </div>
            {editing.kind === "cash" ? (
              <div style={{ display: "grid", gap: 9 }}>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>OUTLET
                  <input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>KAS SISTEM (Rp)
                  <input value={editing.system_cash || ""} onChange={e => setEditing({ ...editing, system_cash: e.target.value })} type="number" style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>KAS FISIK (Rp)
                  <input value={editing.counted_cash || ""} onChange={e => setEditing({ ...editing, counted_cash: e.target.value })} type="number" style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>DIHITUNG OLEH
                  <input value={editing.counted_by || ""} onChange={e => setEditing({ ...editing, counted_by: e.target.value })} style={modalInp} />
                </label>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>TANGGAL TXN
                  <input value={editing.txn_date || ""} onChange={e => setEditing({ ...editing, txn_date: e.target.value })} style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>DESKRIPSI
                  <input value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>NOMINAL (Rp, − = keluar)
                  <input value={editing.amount || ""} onChange={e => setEditing({ ...editing, amount: e.target.value })} type="number" style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>SISI
                  <select value={editing.side || ""} onChange={e => setEditing({ ...editing, side: e.target.value })} style={modalInp}>
                    {["book", "bank"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>STATUS MATCH
                  <select value={editing.matched || 0} onChange={e => setEditing({ ...editing, matched: e.target.value })} style={modalInp}>
                    <option value={0}>0 — unmatched</option>
                    <option value={1}>1 — matched</option>
                  </select>
                </label>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #21262d", color: "#9da7b3", padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: AC, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}

      {sec === "gl" && (
        <div style={{ ...S.card, marginTop: 12 }}>
          <div style={S.kicker}>📒 GL RECONCILIATION — {d.gl.reconciled}/{d.gl.total} ter-rekonsiliasi</div>
          {d.gl.accounts.map(a => (
            <div key={a.account_code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ width: 56, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{a.account_code}</span>
              <span style={{ flex: 1, color: "#e6edf3" }}>{a.account_name}</span>
              <span style={{ width: 130, textAlign: "right", fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{fmtRp(a.balance)}</span>
              <button onClick={() => post(`gl-reconcile/${a.account_code}`, null, a.reconciled ? "✓ Dibatalkan" : "✓ Ter-rekonsiliasi")} style={S.btn(a.reconciled ? "#10b981" : "#f59e0b")}>
                {a.reconciled ? "✓ reconciled" : "○ pending"}
              </button>
            </div>
          ))}
        </div>
      )}
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

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  tab: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#9da7b3", cursor: "pointer", fontFamily: "inherit" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", flex: 1 },
  btn: (c) => ({ background: c + "1f", border: `1px solid ${c}55`, color: c, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace", whiteSpace: "nowrap" }),
  btnPrimary: { background: "#0d9488", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
