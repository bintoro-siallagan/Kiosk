// karyaOS — Driver Realtime Location Tracking (live ping) + CRUD
import { useState, useEffect, useCallback } from "react";
import { useUiKit, EmptyState, LoadingSkeleton } from "../components/uiKit.jsx";
const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const fmtAge = (s) => { if (s == null) return "never"; if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; return `${Math.floor(s/3600)}h ago`; };

const empty = { name: "", phone: "", vehicle_type: "motor", vehicle_plate: "", status: "available", outlet: "", is_active: 1 };

export default function FnbDriverTracking({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/fnb";
  const { confirm, toast } = useUiKit();
  const [drivers, setDrivers] = useState([]);
  const [updated, setUpdated] = useState(0);
  const [editing, setEditing] = useState(null); // null | empty | driver object
  const load = useCallback(async () => {
    const d = await fetch(`${base}/drivers/live`).then(r => r.json());
    setDrivers(d.drivers || []); setUpdated(Date.now());
  }, [base]);
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [load]);

  const ping = async (d) => {
    const lat = parseFloat(prompt("Latitude:", d.last_lat || "-6.9175"));
    if (isNaN(lat)) return;
    const lng = parseFloat(prompt("Longitude:", d.last_lng || "107.6191"));
    if (isNaN(lng)) return;
    await fetch(`${base}/drivers/${d.id}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
    load();
  };

  const save = async () => {
    if (!editing.name || !editing.phone) return toast("Nama + phone wajib", "warning");
    const isNew = !editing.id;
    const url = isNew ? `${base}/drivers` : `${base}/drivers/${editing.id}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const j = await res.json();
    if (j.ok || j.id) { toast(isNew ? "Driver ditambah" : "Driver disimpan", "success"); setEditing(null); load(); }
    else toast(j.error || "Gagal", "error");
  };

  const del = async (d) => {
    const ok = await confirm({ title: "Hapus driver?", message: `Driver "${d.name}" akan dihapus permanen. Tidak bisa dibatalkan.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`${base}/drivers/${d.id}`, { method: "DELETE" });
    const j = await res.json();
    if (j.ok) { toast("Driver dihapus", "success"); load(); }
    else toast(j.error || "Gagal hapus", "error");
  };

  const online = drivers.filter(d => d.is_online);
  const onDelivery = drivers.filter(d => d.status === "on_delivery");

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>📍 Driver Realtime Tracking</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Live location ping tiap 5 detik · driver app POST /drivers/:id/ping {`{lat,lng}`}.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Stat label="Total" value={drivers.length} color="#22d3ee" />
          <Stat label="Online" value={online.length} color="#10b981" />
          <Stat label="On Delivery" value={onDelivery.length} color="#f59e0b" />
          <Stat label="Update" value={new Date(updated).toLocaleTimeString("id-ID")} color="#a855f7" />
          <button onClick={() => setEditing({ ...empty })} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 14px", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>+ Tambah Driver</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
        {drivers.map(d => (
          <div key={d.id} style={{ background: C.card, border: `2px solid ${d.is_online ? "#10b98166" : C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: C.sub }}>🛵 {d.vehicle_plate} · {d.phone}</div>
                {d.outlet && <div style={{ fontSize: 11, color: C.dim }}>🏪 {d.outlet}</div>}
              </div>
              <span style={{ background: d.is_online ? "#10b98122" : "#6b728022", color: d.is_online ? "#10b981" : "#9ca3af", padding: "3px 9px", borderRadius: 7, fontSize: 11, fontWeight: 700 }}>{d.is_online ? "🟢 ONLINE" : "⚫ OFFLINE"}</span>
            </div>
            <div style={{ background: "#0a0e16", borderRadius: 9, padding: "8px 11px", marginTop: 8, fontSize: 12, fontFamily: "'Geist Mono',monospace" }}>
              {d.last_lat != null ? (
                <>
                  <div>📍 <b>{d.last_lat?.toFixed(6)}, {d.last_lng?.toFixed(6)}</b></div>
                  <div style={{ color: C.dim, marginTop: 3 }}>⏱ Last ping {fmtAge(d.ping_age_sec)}</div>
                  <a href={`https://maps.google.com/?q=${d.last_lat},${d.last_lng}`} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 11, color: "#22d3ee", textDecoration: "none", marginTop: 4, display: "inline-block" }}>🗺️ Open Google Maps →</a>
                </>
              ) : (
                <div style={{ color: C.dim }}>📍 No ping</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.sub, flex: 1 }}>Status: <b>{d.status}</b></span>
              <button onClick={() => ping(d)} style={Ba("#22d3ee")}>📡 Ping</button>
              <button onClick={() => setEditing({ ...d })} style={Ba("#f59e0b")}>✏️ Edit</button>
              <button onClick={() => del(d)} style={Ba("#ef4444")}>🗑️ Hapus</button>
            </div>
          </div>
        ))}
      </div>
      {drivers.length === 0 && <EmptyState icon="🚴" title="No driver aktif" desc="Klik '+ Tambah Driver' for mulai." />}

      {editing && (
        <Modal title={editing.id ? `Edit Driver — ${editing.name}` : "+ Tambah Driver Baru"} onClose={() => setEditing(null)}>
          <Field label="Nama *" v={editing.name} onChange={v => setEditing(e => ({ ...e, name: v }))} />
          <Field label="No. HP *" v={editing.phone} onChange={v => setEditing(e => ({ ...e, phone: v }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Select label="Tipe Kendaraan" v={editing.vehicle_type} onChange={v => setEditing(e => ({ ...e, vehicle_type: v }))}
              options={[["motor", "🛵 Motor"], ["car", "🚗 Mobil"], ["bike", "🚲 Sepeda"], ["van", "🚐 Van"]]} />
            <Field label="No. Plat" v={editing.vehicle_plate} onChange={v => setEditing(e => ({ ...e, vehicle_plate: v }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Select label="Status" v={editing.status} onChange={v => setEditing(e => ({ ...e, status: v }))}
              options={[["available", "Available"], ["on_delivery", "On Delivery"], ["off_duty", "Off Duty"]]} />
            <Field label="Outlet" v={editing.outlet || ""} onChange={v => setEditing(e => ({ ...e, outlet: v }))} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: C.sub, cursor: "pointer" }}>
            <input type="checkbox" checked={!!editing.is_active} onChange={e => setEditing(s => ({ ...s, is_active: e.target.checked ? 1 : 0 }))} />
            Aktif
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
            <button onClick={save} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{editing.id ? "Save" : "Tambah"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value, color }) { return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 12px", textAlign: "center", minWidth: 90 }}><div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700, color }}>{value}</div><div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5 }}>{label}</div></div>; }
const Ba = (color) => ({ background: color + "18", border: `1px solid ${color}44`, color, padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 500, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e6edf3" }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, v, onChange, type = "text" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <input type={type} value={v || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
    </div>
  );
}
function Select({ label, v, onChange, options }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <select value={v || ""} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", cursor: "pointer" }}>
        {options.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
      </select>
    </div>
  );
}
