// src/Admin/AdminOutletMaster.jsx
// Outlet Master — registry & lifecycle outlet (CRUD lengkap).

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#15803d";
const ST = { active: { c: "#10b981", l: "ACTIVE" }, renovation: { c: "#f59e0b", l: "RENOVATION" }, onboarding: { c: "#3b82f6", l: "ONBOARDING" }, closed: { c: "#ef4444", l: "CLOSED" } };
const TYPE_ICON = { "Dine-in": "🍽️", Express: "⚡", Kiosk: "🖥️" };

export default function AdminOutletMaster({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/outlet-master`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const cycleStatus = (o) => {
    if (!d) return;
    const next = d.statuses[(d.statuses.indexOf(o.status) + 1) % d.statuses.length];
    fetch(`${apiBase}/api/outlet-master/${o.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${o.name} → ${next}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/outlet-master/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg(`✓ ${editing.name} disimpan`); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const submitAdd = async () => {
    if (!adding.name?.trim()) { setMsg("⚠ Nama outlet wajib"); return; }
    const r = await fetch(`${apiBase}/api/outlet-master`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adding),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Outlet ditambah"); setAdding(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (o) => {
    const ok = await confirm({ title: `Delete outlet "${o.name}"?`, message: `Outlet ${o.code} will be permanently deleted. Related transaction data remains in history but outlet reference is lost.\n\nCannot be undone.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/outlet-master/${o.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Outlet dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Outlet Master…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🏪 <b style={{ color: "#4ade80" }}>OUTLET MASTER</b> — outlet registry &amp; lifecycle: profile, type,
        capacity &amp; status (active / renovation / onboarding / closed). Click the status badge to change.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Outlets"    v={String(s.total)} c={AC} />
        <Kpi label="Operational"      v={String(s.active)} c="#10b981" />
        <Kpi label="Non-Operational"  v={String(s.not_operational)} c={s.not_operational > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Total Capacity"   v={s.total_capacity + " seats"} c="#3b82f6" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={S.kicker}>🏪 OUTLET REGISTRY — {d.outlets.length}</span>
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#5b6470" }}>{s.by_type.map(t => `${TYPE_ICON[t.type]} ${t.type} ${t.count}`).join("  ·  ")}</span>
            <button onClick={() => setAdding({ name: "", area: "", address: "", phone: "", manager: "", outlet_type: "Dine-in", seat_capacity: 0 })} style={{ background: AC, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Outlet</button>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 12, marginTop: 10 }}>
          {d.outlets.map(o => {
            const st = ST[o.status] || ST.active;
            return (
              <div key={o.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${st.c}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{TYPE_ICON[o.outlet_type] || "🏪"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{o.name}</div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{o.code} · {o.area}</div>
                  </div>
                  <button onClick={() => cycleStatus(o)} style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}66`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>{st.l}</button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "#9da7b3", lineHeight: 1.7 }}>
                  <div>📍 {o.address}</div>
                  <div>👤 {o.manager} · ☎ {o.phone}</div>
                  <div>🪑 {o.seat_capacity} seats · <span style={{ color: "#5b6470" }}>{o.outlet_type}</span></div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 8 }}>
                  <button onClick={() => setEditing({ ...o })} style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 9px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️ Edit</button>
                  <button onClick={() => remove(o)} style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 9px", borderRadius: 5, fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(editing || adding) && (
        <OutletForm
          data={editing || adding}
          isEdit={!!editing}
          d={d}
          onChange={(patch) => editing ? setEditing(e => ({ ...e, ...patch })) : setAdding(a => ({ ...a, ...patch }))}
          onClose={() => { setEditing(null); setAdding(null); }}
          onSave={editing ? saveEdit : submitAdd}
        />
      )}
    </div>
  );
}

function OutletForm({ data, isEdit, d, onChange, onClose, onSave }) {
  const inp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 12.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
  const lbl = { fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4, fontFamily: "'Geist Mono',monospace" };
  const mapBtnSmall = { padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>{isEdit ? `✏️ Edit Outlet — ${data.code}` : "+ New Outlet"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><div style={lbl}>NAME *</div><input value={data.name || ""} onChange={e => onChange({ name: e.target.value })} style={inp} /></div>
          <div><div style={lbl}>AREA</div><input value={data.area || ""} onChange={e => onChange({ area: e.target.value })} style={inp} /></div>
          <div style={{ gridColumn: "1/-1" }}><div style={lbl}>ALAMAT</div><input value={data.address || ""} onChange={e => onChange({ address: e.target.value })} style={inp} /></div>
          <div><div style={lbl}>MANAGER</div><input value={data.manager || ""} onChange={e => onChange({ manager: e.target.value })} style={inp} /></div>
          <div><div style={lbl}>TELEPON</div><input value={data.phone || ""} onChange={e => onChange({ phone: e.target.value })} style={inp} /></div>
          <div><div style={lbl}>TIPE OUTLET</div>
            <select value={data.outlet_type || "Dine-in"} onChange={e => onChange({ outlet_type: e.target.value })} style={inp}>
              {(d.types || ["Dine-in", "Express", "Kiosk"]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><div style={lbl}>KAPASITAS KURSI</div><input type="number" min="0" value={data.seat_capacity || 0} onChange={e => onChange({ seat_capacity: Number(e.target.value) })} style={inp} /></div>
          {isEdit && (
            <div style={{ gridColumn: "1/-1" }}><div style={lbl}>STATUS</div>
              <select value={data.status || "active"} onChange={e => onChange({ status: e.target.value })} style={inp}>
                {(d.statuses || ["active", "renovation", "onboarding", "closed"]).map(s => <option key={s} value={s}>{ST[s]?.l || s}</option>)}
              </select>
            </div>
          )}

          {/* GPS Geofence (untuk staff check-in / anti-fraud lokasi) */}
          <div style={{ gridColumn: "1/-1", marginTop: 8, padding: 12, background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.18)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#22d3ee", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 8 }}>📍 LOKASI GPS + GEOFENCE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={lbl}>LATITUDE</div><input type="number" step="any" value={data.lat ?? ""} onChange={e => onChange({ lat: e.target.value === "" ? null : parseFloat(e.target.value) })} placeholder="-6.2088" style={inp} /></div>
              <div><div style={lbl}>LONGITUDE</div><input type="number" step="any" value={data.lon ?? ""} onChange={e => onChange({ lon: e.target.value === "" ? null : parseFloat(e.target.value) })} placeholder="106.8456" style={inp} /></div>
              <div><div style={lbl}>RADIUS (m)</div><input type="number" min="50" max="2000" value={data.geofence_radius_m || 100} onChange={e => onChange({ geofence_radius_m: Number(e.target.value) })} style={inp} /></div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => {
                if (!navigator.geolocation) { alert("Browser tidak support GPS"); return; }
                navigator.geolocation.getCurrentPosition(
                  p => { onChange({ lat: p.coords.latitude, lon: p.coords.longitude }); },
                  e => { alert("GPS error: " + e.message); },
                  { enableHighAccuracy: true, timeout: 10000 }
                );
              }} style={{ ...mapBtnSmall, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.4)", color: "#10b981" }}>📍 Gunakan lokasi saya</button>
              <button onClick={() => {
                const lat = data.lat, lon = data.lon;
                if (lat && lon) window.open(`https://www.google.com/maps?q=${lat},${lon}`, "_blank");
                else window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address || data.area || "Indonesia")}`, "_blank");
              }} style={{ ...mapBtnSmall, background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.4)", color: "#22d3ee" }}>🗺️ Buka Google Maps</button>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#9ca3af", marginLeft: "auto" }}>
                <input type="checkbox" checked={!!data.gps_lock} onChange={e => onChange({ gps_lock: e.target.checked ? 1 : 0 })} />
                🔒 Strict (anti-bypass)
              </label>
            </div>
            {data.lat && data.lon && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#7d8590", fontFamily: "'Geist Mono',monospace" }}>
                Coord: {data.lat.toFixed(6)}, {data.lon.toFixed(6)} · radius {data.geofence_radius_m || 100}m
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
          <button onClick={onSave} style={{ background: AC, color: "#fff", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>{isEdit ? "💾 Simpan" : "+ Tambah"}</button>
        </div>
      </div>
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

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
};
