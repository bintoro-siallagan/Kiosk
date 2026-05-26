// karyaOS — F&B Tip Pool Distribution
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";

export default function FnbTipPool({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tips, setTips] = useState([]);
  const [poolData, setPoolData] = useState({ pool_total: 0, distributions: [] });
  const [entries, setEntries] = useState([]);
  const [newTip, setNewTip] = useState({ amount: "", staff_name: "", tip_type: "individual", notes: "" });
  const [editingTip, setEditingTip] = useState(null);
  const [toast, setToast] = useState(null);
  const { confirm } = useUiKit();
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const saveTipEdit = async () => {
    const r = await fetch(`${base}/tips/${editingTip.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingTip) });
    const d = await r.json(); if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast("Tip diupdate"); setEditingTip(null); loadTips(); loadPool();
  };
  const removeTip = async (t) => {
    const ok = await confirm({ title: "Hapus tip log?", message: `Tip ${rp(t.amount)} ${t.staff_name ? `untuk ${t.staff_name}` : ""} akan dihapus permanen.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    await fetch(`${base}/tips/${t.id}`, { method: "DELETE" });
    showToast("Tip dihapus"); loadTips(); loadPool();
  };
  const loadTips = useCallback(async () => {
    const d = await fetch(`${base}/tips?from=${date}&to=${date}`).then(r => r.json()); setTips(d.tips || []);
  }, [base, date]);
  const loadPool = useCallback(async () => {
    const d = await fetch(`${base}/tip-pool/${date}`).then(r => r.json()); setPoolData(d);
    setEntries(d.distributions?.length ? d.distributions : []);
  }, [base, date]);
  useEffect(() => { loadTips(); loadPool(); }, [loadTips, loadPool]);
  const addTip = async () => {
    if (!newTip.amount) { showToast("Amount wajib", "err"); return; }
    await fetch(`${base}/tips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newTip, amount: parseInt(newTip.amount, 10) }) });
    setNewTip({ amount: "", staff_name: "", tip_type: "individual", notes: "" });
    showToast("Tip dicatat"); loadTips(); loadPool();
  };
  const addEntry = () => setEntries([...entries, { staff_name: "", shift: "", hours_worked: 0, share_pct: 0, payout: 0 }]);
  const updateEntry = (i, k, v) => setEntries(entries.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  const removeEntry = (i) => setEntries(entries.filter((_, idx) => idx !== i));
  const autoCalc = () => {
    const totalHours = entries.reduce((a, e) => a + (parseFloat(e.hours_worked) || 0), 0);
    if (totalHours <= 0) return;
    const next = entries.map(e => {
      const pct = (parseFloat(e.hours_worked) || 0) / totalHours * 100;
      const payout = Math.floor(poolData.pool_total * pct / 100);
      return { ...e, share_pct: +pct.toFixed(2), payout };
    });
    setEntries(next);
    showToast("Distribusi proporsional dihitung");
  };
  const saveDist = async () => {
    const r = await fetch(`${base}/tip-pool/${date}/distribute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(`${d.count} distribusi tersimpan`); loadPool();
  };
  const markPaid = async (id) => { await fetch(`${base}/tip-pool/${id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid_by: "manager" }) }); loadPool(); };

  const individualTotal = tips.filter(t => t.tip_type === "individual").reduce((a, t) => a + t.amount, 0);
  const poolTipsAmount = tips.filter(t => t.tip_type === "pool").reduce((a, t) => a + t.amount, 0);
  const totalDistributed = entries.reduce((a, e) => a + (parseInt(e.payout, 10) || 0), 0);

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>💵 Tip Pool Distribution</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Pool tips → distribusi proporsional ke staff berdasarkan jam kerja.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: C.dim, letterSpacing: 1 }}>TANGGAL</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: 160 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
        <Stat label="Pool tips" value={rp(poolData.pool_total)} color="#fbbf24" />
        <Stat label="Individual tips" value={rp(individualTotal)} color="#22d3ee" />
        <Stat label="Total tips hari ini" value={rp(individualTotal + poolTipsAmount)} color="#10b981" />
        <Stat label="Sudah didistribusi" value={rp(totalDistributed)} color="#a855f7" />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>+ CATAT TIP BARU</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 6 }}>
          <input type="number" value={newTip.amount} onChange={e => setNewTip({ ...newTip, amount: e.target.value })} placeholder="Jumlah" style={inp} />
          <input value={newTip.staff_name} onChange={e => setNewTip({ ...newTip, staff_name: e.target.value })} placeholder="Staff (kalau individual)" style={inp} />
          <select value={newTip.tip_type} onChange={e => setNewTip({ ...newTip, tip_type: e.target.value })} style={inp}>
            <option value="individual">Individual</option><option value="pool">Pool</option>
          </select>
          <input value={newTip.notes} onChange={e => setNewTip({ ...newTip, notes: e.target.value })} placeholder="Catatan" style={inp} />
          <button onClick={addTip} style={B.save}>+ Tip</button>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace" }}>DISTRIBUSI KE STAFF</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addEntry} style={Ba("#a855f7")}>+ Staff</button>
            <button onClick={autoCalc} style={Ba("#22d3ee")}>🧮 Auto-calc</button>
            <button onClick={saveDist} style={B.save}>💾 Simpan</button>
          </div>
        </div>
        <div style={{ display: "flex", color: C.dim, fontSize: 10, letterSpacing: 1, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ flex: 1.4 }}>STAFF</span><span style={{ width: 100 }}>SHIFT</span><span style={{ width: 100 }}>JAM</span><span style={{ width: 90 }}>SHARE%</span><span style={{ width: 130 }}>PAYOUT</span><span style={{ width: 130 }}>STATUS</span><span style={{ width: 90, textAlign: "right" }}>ACTIONS</span>
        </div>
        {entries.length === 0 ? <Empty>No distribusi.</Empty> : entries.map((e, i) => (
          <div key={i} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid #1f2937`, gap: 6, alignItems: "center" }}>
            <input value={e.staff_name} onChange={ev => updateEntry(i, "staff_name", ev.target.value)} placeholder="Nama" style={{ ...inp, flex: 1.4 }} />
            <input value={e.shift || ""} onChange={ev => updateEntry(i, "shift", ev.target.value)} placeholder="A/B/C" style={{ ...inp, width: 100 }} />
            <input type="number" step="0.5" value={e.hours_worked || 0} onChange={ev => updateEntry(i, "hours_worked", parseFloat(ev.target.value) || 0)} style={{ ...inp, width: 100 }} />
            <input type="number" step="0.01" value={e.share_pct || 0} onChange={ev => updateEntry(i, "share_pct", parseFloat(ev.target.value) || 0)} style={{ ...inp, width: 90 }} />
            <input type="number" value={e.payout || 0} onChange={ev => updateEntry(i, "payout", parseInt(ev.target.value, 10) || 0)} style={{ ...inp, width: 130, color: "#10b981", fontWeight: 700 }} />
            <span style={{ width: 130, fontSize: 11, color: e.paid_at ? "#10b981" : C.dim }}>{e.paid_at ? `✓ ${fmtTs(e.paid_at)}` : "Belum bayar"}</span>
            <span style={{ width: 90, display: "flex", gap: 4, justifyContent: "flex-end" }}>
              {e.id && !e.paid_at && <button onClick={() => markPaid(e.id)} style={Ba("#10b981")}>✓ Pay</button>}
              <button onClick={() => removeEntry(i)} style={Ba("#ef4444")}>×</button>
            </span>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>RIWAYAT TIP {date}</div>
        {tips.length === 0 ? <Empty>No tip.</Empty> : tips.map(t => (
          <div key={t.id} style={{ display: "flex", padding: "5px 0", borderBottom: `1px solid #1f2937`, alignItems: "center", fontSize: 12.5, gap: 10 }}>
            <span style={{ width: 130, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(t.created_at)}</span>
            <span style={{ flex: 1, fontWeight: 700 }}>{t.staff_name || "—"}</span>
            <span style={{ width: 110, fontSize: 11.5, color: C.sub }}>{t.tip_type === "pool" ? "🔄 Pool" : "👤 Individual"}</span>
            <span style={{ width: 110, fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontWeight: 700 }}>{rp(t.amount)}</span>
            <span style={{ flex: 1, fontSize: 11, color: C.dim }}>{t.notes || ""}</span>
            <span style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setEditingTip({ ...t })} style={Ba("#f59e0b")} title="Edit">✏️</button>
              <button onClick={() => removeTip(t)} style={Ba("#ef4444")} title="Delete">🗑️</button>
            </span>
          </div>
        ))}
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}

      {editingTip && (
        <div onClick={() => setEditingTip(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9998, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 460, width: "100%" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit Tip</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>JUMLAH</div><input type="number" value={editingTip.amount || ""} onChange={e => setEditingTip({ ...editingTip, amount: e.target.value })} style={inp} /></div>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>STAFF</div><input value={editingTip.staff_name || ""} onChange={e => setEditingTip({ ...editingTip, staff_name: e.target.value })} style={inp} /></div>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>TIPE</div>
                <select value={editingTip.tip_type || "individual"} onChange={e => setEditingTip({ ...editingTip, tip_type: e.target.value })} style={inp}>
                  <option value="individual">Individual</option><option value="pool">Pool</option>
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>PAYMENT</div><input value={editingTip.payment_method || ""} onChange={e => setEditingTip({ ...editingTip, payment_method: e.target.value })} style={inp} /></div>
            </div>
            <div style={{ marginTop: 8 }}><div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, marginBottom: 4 }}>CATATAN</div><input value={editingTip.notes || ""} onChange={e => setEditingTip({ ...editingTip, notes: e.target.value })} style={inp} /></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditingTip(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveTipEdit} style={B.save}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Stat({ label, value, color }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", textAlign: "center" }}><div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 17, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, marginTop: 2 }}>{label}</div></div>; }
function Empty({ children }) { return <div style={{ padding: "16px 14px", textAlign: "center", color: C.sub, fontSize: 12 }}>{children}</div>; }
const inp = { padding: "7px 9px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 7, color: "#fff", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
const B = { save: { background: "#10b981", border: "none", color: "#04130c", padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
