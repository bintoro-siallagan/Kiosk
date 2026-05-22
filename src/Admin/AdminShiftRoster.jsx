// src/Admin/AdminShiftRoster.jsx
// Shift Roster — penjadwalan shift staff.

import { useState, useEffect, useCallback } from "react";

const AC = "#059669";
const SHIFT_C = { Pagi: "#f59e0b", Siang: "#3b82f6", Malam: "#a855f7" };
const dayLabel = (d) => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });

export default function AdminShiftRoster({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ staff_name: "", role: "Crew", outlet: "Paskal", shift_date: "", shift_type: "Pagi" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/shift-roster`).then(r => r.json()).then(j => {
      setD(j);
      setForm(f => f.shift_date ? f : { ...f, shift_date: (j.days[0] && j.days[0].date) || "" });
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.staff_name.trim() || !form.shift_date) { setMsg("⚠ Nama staff & tanggal wajib"); return; }
    fetch(`${apiBase}/api/shift-roster`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Shift dijadwalkan"); setForm({ ...form, staff_name: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const remove = (sh) => {
    fetch(`${apiBase}/api/shift-roster/${sh.id}/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Shift dihapus"); load(); } }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Shift Roster…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📆 <b style={{ color: "#34d399" }}>SHIFT ROSTER</b> — penjadwalan shift staff per outlet per hari
        (Pagi / Siang / Malam). Rencanakan roster mingguan biar coverage outlet aman.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Shift" v={String(s.total_shifts)} c={AC} />
        <Kpi label="Shift Hari Ini" v={String(s.today_shifts)} c="#f59e0b" />
        <Kpi label="Staff Terjadwal" v={String(s.staff_count)} c="#3b82f6" />
        <Kpi label="Hari Ter-roster" v={String(s.days)} c="#a855f7" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ JADWALKAN SHIFT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1.2fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.staff_name} onChange={e => setForm({ ...form, staff_name: e.target.value })} placeholder="Nama staff" style={S.input} />
          <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role" style={S.input} />
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <select value={form.shift_date} onChange={e => setForm({ ...form, shift_date: e.target.value })} style={S.input}>
            {d.days.map(x => <option key={x.date} value={x.date}>{dayLabel(x.date)}</option>)}
          </select>
          <select value={form.shift_type} onChange={e => setForm({ ...form, shift_type: e.target.value })} style={S.input}>
            {d.shift_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={add} style={S.btn}>+ Jadwal</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12, marginTop: 14 }}>
        {d.days.map(day => (
          <div key={day.date} style={{ ...S.card, borderTop: `2px solid ${day.is_today ? "#10b981" : "#161b22"}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: day.is_today ? "#34d399" : "#e6edf3", marginBottom: 8 }}>
              {dayLabel(day.date)} {day.is_today ? "· HARI INI" : ""}
            </div>
            {day.shifts.map(sh => (
              <div key={sh.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: SHIFT_C[sh.shift_type] }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{sh.staff_name} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 10 }}>{sh.role}</span></div>
                  <div style={{ fontSize: 10, color: "#5b6470" }}>{sh.outlet} · {sh.shift_type} {sh.hours}</div>
                </div>
                <button onClick={() => remove(sh)} style={S.del}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#059669", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  del: { background: "transparent", border: "none", color: "#5b6470", fontSize: 12, cursor: "pointer", fontWeight: 700 },
};
