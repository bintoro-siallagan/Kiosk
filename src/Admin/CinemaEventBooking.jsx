// karyaOS — Cinema Studio Event Booking
// Booking studio penuh untuk event privat: corporate / wedding / birthday /
// gala screening / private screening. Conflict-check otomatis di backend.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDT = (d, t) => `${d} · ${t}`;
const EVENT_TYPES = [
  ["private",   "🎬 Private Screening"],
  ["corporate", "🏢 Corporate Event"],
  ["birthday",  "🎂 Birthday Party"],
  ["wedding",   "💍 Wedding"],
  ["gala",      "🎟️ Gala Premiere"],
  ["other",     "✨ Lainnya"],
];
const STATUS = {
  pending:   { label: "Pending",   color: "#f59e0b" },
  confirmed: { label: "Confirmed", color: "#10b981" },
  cancelled: { label: "Cancelled", color: "#ef4444" },
  completed: { label: "Completed", color: "#6b7280" },
};

const empty = {
  studio_id: "", event_type: "private", event_name: "",
  event_date: "", start_time: "", end_time: "",
  contact_name: "", contact_phone: "", contact_email: "",
  attendees: 0, total_price: 0, deposit_paid: 0, status: "pending", notes: "",
};

export default function CinemaEventBooking({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [studios, setStudios] = useState([]);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("upcoming");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [toast, setToast] = useState(null);
  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter === "upcoming")  params.set("from", new Date().toISOString().slice(0, 10));
    if (filter === "pending")   params.set("status", "pending");
    if (filter === "confirmed") params.set("status", "confirmed");
    const r = await fetch(`${base}/event-bookings?${params}`);
    const d = await r.json();
    setRows(d.bookings || []);
  }, [base, filter]);
  const loadStudios = useCallback(async () => {
    const r = await fetch(`${base}/studios`); const d = await r.json();
    setStudios(d.studios || []);
  }, [base]);
  useEffect(() => { load(); loadStudios(); }, [load, loadStudios]);

  const startNew = () => { setEditing("new"); setForm(empty); };
  const startEdit = (r) => { setEditing(r.id); setForm({ ...empty, ...r }); };
  const cancel = () => { setEditing(null); setForm(empty); };

  async function save() {
    if (!form.studio_id || !form.event_date || !form.start_time || !form.end_time) {
      showToast("Studio + tanggal + waktu wajib", "err"); return;
    }
    const url = editing === "new" ? `${base}/event-bookings` : `${base}/event-bookings/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(editing === "new" ? `Booking dibuat (${d.booking_code})` : "Booking diperbarui");
    cancel(); load();
  }
  async function setStatus(r, st) {
    const rr = await fetch(`${base}/event-bookings/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: st }) });
    const d = await rr.json();
    if (!d.ok) { showToast(d.error || "Gagal", "err"); return; }
    showToast(`Status: ${STATUS[st]?.label || st}`); load();
  }
  async function remove(r) {
    if (!window.confirm(`Hapus booking ${r.booking_code}?`)) return;
    await fetch(`${base}/event-bookings/${r.id}`, { method: "DELETE" });
    showToast("Booking dihapus"); load();
  }

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎉 Studio Event Booking</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Booking studio penuh: corporate, wedding, birthday, private screening · auto conflict-check.</div>
        </div>
        {!editing && <button onClick={startNew} style={B.add}>＋ Booking baru</button>}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["upcoming", "Mendatang"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["all", "Semua"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ background: filter === id ? "#a855f72a" : "transparent", border: `1px solid ${filter === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "7px 14px", color: filter === id ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      {editing && (
        <div style={{ background: C.card, border: "1px solid #a855f766", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#d8b4fe", marginBottom: 10 }}>{editing === "new" ? "Booking baru" : `Edit ${form.booking_code || `#${editing}`}`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Studio">
              <select value={form.studio_id || ""} onChange={e => setForm({ ...form, studio_id: e.target.value })} style={inp}>
                <option value="">— Pilih studio —</option>
                {studios.map(s => <option key={s.id} value={s.id}>{s.name} · {s.studio_type} · {s.capacity} kursi</option>)}
              </select>
            </Field>
            <Field label="Tipe event">
              <select value={form.event_type || "private"} onChange={e => setForm({ ...form, event_type: e.target.value })} style={inp}>
                {EVENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} style={inp}>
                {Object.entries(STATUS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </Field>
            <Field label="Nama event" wide><input value={form.event_name || ""} onChange={e => setForm({ ...form, event_name: e.target.value })} placeholder="Ultah Karyawan PT XYZ" style={inp} /></Field>
            <Field label="Jumlah tamu"><input type="number" value={form.attendees || 0} onChange={e => setForm({ ...form, attendees: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Tanggal"><input type="date" value={form.event_date || ""} onChange={e => setForm({ ...form, event_date: e.target.value })} style={inp} /></Field>
            <Field label="Mulai"><input type="time" value={form.start_time || ""} onChange={e => setForm({ ...form, start_time: e.target.value })} style={inp} /></Field>
            <Field label="Selesai"><input type="time" value={form.end_time || ""} onChange={e => setForm({ ...form, end_time: e.target.value })} style={inp} /></Field>
            <Field label="Kontak person"><input value={form.contact_name || ""} onChange={e => setForm({ ...form, contact_name: e.target.value })} style={inp} /></Field>
            <Field label="Telepon"><input value={form.contact_phone || ""} onChange={e => setForm({ ...form, contact_phone: e.target.value })} style={inp} /></Field>
            <Field label="Email"><input value={form.contact_email || ""} onChange={e => setForm({ ...form, contact_email: e.target.value })} style={inp} /></Field>
            <Field label="Total harga (Rp)"><input type="number" value={form.total_price || 0} onChange={e => setForm({ ...form, total_price: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="DP terbayar (Rp)"><input type="number" value={form.deposit_paid || 0} onChange={e => setForm({ ...form, deposit_paid: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Catatan"><input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} style={B.save}>{editing === "new" ? "Buat booking" : "Simpan"}</button>
            <button onClick={cancel} style={B.cancel}>Batal</button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "30px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>
          Tidak ada booking di filter ini.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(380px,1fr))", gap: 12 }}>
          {rows.map(r => {
            const st = STATUS[r.status] || STATUS.pending;
            const type = EVENT_TYPES.find(([v]) => v === r.event_type)?.[1] || r.event_type;
            const paid = (r.deposit_paid || 0) >= (r.total_price || 0) && r.total_price > 0;
            return (
              <div key={r.id} style={{ background: C.card, border: `2px solid ${st.color}55`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#fbbf24", letterSpacing: 1.5 }}>{r.booking_code}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{r.event_name || type}</div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>{type}{r.attendees ? ` · ${r.attendees} tamu` : ""}</div>
                  </div>
                  <span style={{ background: st.color + "22", color: st.color, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{st.label}</span>
                </div>
                <div style={{ background: "#0a0e16", borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 12.5, lineHeight: 1.6 }}>
                  <div><span style={{ color: C.sub }}>Studio</span> <b>{r.studio_name || `#${r.studio_id}`}</b> {r.studio_type ? `· ${r.studio_type}` : ""} {r.capacity ? `· ${r.capacity} kursi` : ""}</div>
                  <div><span style={{ color: C.sub }}>Tanggal</span> <b>{r.event_date}</b> · {r.start_time}–{r.end_time}</div>
                  {r.contact_name && <div><span style={{ color: C.sub }}>Kontak</span> {r.contact_name}{r.contact_phone ? " · " + r.contact_phone : ""}{r.contact_email ? " · " + r.contact_email : ""}</div>}
                </div>
                {r.notes && <div style={{ fontSize: 12, color: "#fbbf24", background: "#f59e0b15", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>📝 {r.notes}</div>}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, paddingTop: 8, marginBottom: 10, fontSize: 13 }}>
                  <span>Total <b style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(r.total_price)}</b></span>
                  <span>DP <b style={{ color: paid ? "#10b981" : "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{rp(r.deposit_paid)}</b>{paid ? " ✓" : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.status === "pending" && <button onClick={() => setStatus(r, "confirmed")} style={Bact("#10b981")}>✓ Confirm</button>}
                  {r.status === "confirmed" && <button onClick={() => setStatus(r, "completed")} style={Bact("#6b7280")}>✓ Done</button>}
                  <button onClick={() => startEdit(r)} style={Bact("#a855f7")}>Edit</button>
                  {r.status !== "cancelled" && <button onClick={() => setStatus(r, "cancelled")} style={Bact("#ef4444")}>Batal</button>}
                  <button onClick={() => remove(r)} style={Bact("#ef4444")}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d",
          border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
        }}>{toast.m}</div>
      )}
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "auto" }}>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
const inp = { width: "100%", padding: "8px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
const B = {
  add:    { background: "#a855f72a", border: "1px solid #a855f766", color: "#d8b4fe", padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "#1b212c", border: "1px solid #2a2b30", color: "#9ca3af", padding: "9px 18px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
const Bact = (color) => ({ background: color + "18", border: `1px solid ${color}55`, color, padding: "5px 11px", borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
