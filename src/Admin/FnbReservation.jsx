// karyaOS — F&B Reservation (booking table di muka)
import { useState, useEffect, useCallback } from "react";
import { useUiKit, TooltipButton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const STATUS = { pending: { label: "Pending", color: "#f59e0b" }, confirmed: { label: "Confirmed", color: "#10b981" }, seated: { label: "Seated", color: "#22d3ee" }, completed: { label: "Done", color: "#6b7280" }, cancelled: { label: "Cancelled", color: "#ef4444" }, no_show: { label: "No-show", color: "#7f1d1d" } };
const empty = { customer_name: "", customer_phone: "", customer_email: "", reservation_date: "", reservation_time: "", party_size: 2, table_number: "", occasion: "", special_requests: "", deposit_amount: 0, deposit_paid: 0, status: "pending", outlet: "", notes: "" };

export default function FnbReservation({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("upcoming");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, k = "ok") => { setToast({ m, k }); setTimeout(() => setToast(null), 2200); };
  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const p = filter === "upcoming" ? `?from=${today}` : filter === "today" ? `?date=${today}` : filter === "all" ? "" : `?status=${filter}`;
    const d = await fetch(`${base}/reservations${p}`).then(r => r.json()); setRows(d.reservations || []);
  }, [base, filter]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.customer_name || !form.reservation_date || !form.reservation_time) { showToast("Nama + tgl + jam wajib", "err"); return; }
    const url = editing === "new" ? `${base}/reservations` : `${base}/reservations/${editing}`;
    const r = await fetch(url, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json(); if (!d.ok) { showToast(d.error, "err"); return; }
    showToast(editing === "new" ? `Booking dibuat (${d.reservation_code})` : "Diperbarui"); setEditing(null); setForm(empty); load();
  };
  const setStatus = async (r, status) => { await fetch(`${base}/reservations/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); showToast(`Status: ${STATUS[status]?.label}`); load(); };
  const { confirm } = useUiKit();
  const remove = async (r) => { if (!(await confirm({ title: `Hapus booking ${r.reservation_code}?`, message: `${r.customer_name} · ${r.reservation_date} ${r.reservation_time}`, danger: true, okLabel: "Delete" }))) return; await fetch(`${base}/reservations/${r.id}`, { method: "DELETE" }); load(); };
  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📅 Reservation</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Booking meja di muka — pending → confirmed → seated → completed.</div>
        </div>
        {!editing && <button onClick={() => { setEditing("new"); setForm(empty); }} style={B.add}>＋ Booking baru</button>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {[["today", "Hari ini"], ["upcoming", "Mendatang"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["all", "Semua"]].map(([id, l]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ background: filter === id ? "#a855f72a" : "transparent", border: `1px solid ${filter === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === id ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
        ))}
      </div>
      {editing && (
        <div style={{ background: C.card, border: "1px solid #a855f766", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d8b4fe", marginBottom: 10 }}>{editing === "new" ? "Booking baru" : `Edit ${form.reservation_code || `#${editing}`}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama tamu"><input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} style={inp} /></Field>
            <Field label="Phone"><input value={form.customer_phone} onChange={e => setForm({ ...form, customer_phone: e.target.value })} style={inp} /></Field>
            <Field label="Email"><input value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} style={inp} /></Field>
            <Field label="Tanggal"><input type="date" value={form.reservation_date} onChange={e => setForm({ ...form, reservation_date: e.target.value })} style={inp} /></Field>
            <Field label="Jam"><input type="time" value={form.reservation_time} onChange={e => setForm({ ...form, reservation_time: e.target.value })} style={inp} /></Field>
            <Field label="Jumlah tamu"><input type="number" min="1" value={form.party_size} onChange={e => setForm({ ...form, party_size: parseInt(e.target.value, 10) || 1 })} style={inp} /></Field>
            <Field label="Nomor meja (preferensi)"><input value={form.table_number} onChange={e => setForm({ ...form, table_number: e.target.value })} style={inp} /></Field>
            <Field label="Occasion"><input value={form.occasion} onChange={e => setForm({ ...form, occasion: e.target.value })} placeholder="Ulang tahun / Anniversary" style={inp} /></Field>
            <Field label="Outlet"><input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} style={inp} /></Field>
            <Field label="Deposit (Rp)"><input type="number" value={form.deposit_amount} onChange={e => setForm({ ...form, deposit_amount: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="DP terbayar (Rp)"><input type="number" value={form.deposit_paid} onChange={e => setForm({ ...form, deposit_paid: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Status"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>{Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</select></Field>
            <Field label="Special request" wide><textarea value={form.special_requests} onChange={e => setForm({ ...form, special_requests: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="High chair, alergi, dll" /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat" : "Save"}</button>
            <button onClick={() => { setEditing(null); setForm(empty); }} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}
      {rows.length === 0 ? <Empty>None booking di filter ini.</Empty> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 12 }}>
          {rows.map(r => {
            const st = STATUS[r.status] || STATUS.pending;
            return (
              <div key={r.id} style={{ background: C.card, border: `2px solid ${st.color}55`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#fbbf24", letterSpacing: 1.5 }}>{r.reservation_code}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{r.customer_name}</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>{r.customer_phone}{r.customer_email ? " · " + r.customer_email : ""}</div>
                  </div>
                  <span style={{ background: st.color + "22", color: st.color, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{st.label}</span>
                </div>
                <div style={{ background: "#0a0e16", borderRadius: 10, padding: "8px 12px", margin: "8px 0", fontSize: 12.5, lineHeight: 1.6 }}>
                  <div>📅 <b>{r.reservation_date}</b> · {r.reservation_time}</div>
                  <div>👥 {r.party_size} orang {r.table_number ? `· meja ${r.table_number}` : ""}</div>
                  {r.occasion && <div>🎉 {r.occasion}</div>}
                  {r.outlet && <div>🏪 {r.outlet}</div>}
                  {r.deposit_amount > 0 && <div>💰 DP <b>{rp(r.deposit_paid)}</b> / {rp(r.deposit_amount)}</div>}
                </div>
                {r.special_requests && <div style={{ fontSize: 11.5, color: "#fbbf24", background: "#f59e0b15", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>📝 {r.special_requests}</div>}
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {r.status === "pending"   && <button onClick={() => setStatus(r, "confirmed")} style={Ba("#10b981")}>✓ Confirm</button>}
                  {r.status === "confirmed" && <button onClick={() => setStatus(r, "seated")} style={Ba("#22d3ee")}>👥 Seated</button>}
                  {r.status === "seated"    && <button onClick={() => setStatus(r, "completed")} style={Ba("#6b7280")}>✓ Done</button>}
                  <button onClick={() => { setEditing(r.id); setForm({ ...empty, ...r }); }} style={Ba("#a855f7")}>Edit</button>
                  {!["cancelled", "completed", "no_show"].includes(r.status) && <button onClick={() => setStatus(r, "no_show")} style={Ba("#ef4444")}>No-show</button>}
                  <button onClick={() => remove(r)} style={Ba("#ef4444")}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: toast.k === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${toast.k === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast.m}</div>}
    </div>
  );
}
function Field({ label, children, wide }) { return <div style={{ gridColumn: wide ? "span 2" : "auto" }}><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>{children}</div>; }
function Empty({ children }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{children}</div>; }
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = { add: { background: "#a855f72a", border: "1px solid #a855f766", color: "#d8b4fe", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, save: { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }, cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } };
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
