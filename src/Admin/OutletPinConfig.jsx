// karyaOS — Outlet Pin & Geofence Config
// Admin set per outlet: manager PIN, WhatsApp number untuk anomaly,
// GPS pin (lat/lon) + radius geofence, via map picker (Leaflet + OSM).
//
// Super-admin: PIN dari admin_users table (role super-admin / admin)
// otomatis bypass geofence + outlet PIN saat submit audit/visit.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorInline } from "../components/ConnectionError.jsx";

const PURPLE = "#a855f7", GREEN = "#10b981", AMBER = "#f59e0b", RED = "#ef4444", CYAN = "#22d3ee";
const CARD_BG = "rgba(255,255,255,0.04)";
const BORDER  = "1px solid rgba(255,255,255,0.08)";

// Leaflet via CDN — load once on demand
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) { existing.addEventListener("load", () => resolve(window.L)); return; }
    const s = document.createElement("script");
    s.src = LEAFLET_JS; s.async = true;
    s.onload = () => resolve(window.L);
    s.onerror = () => reject(new Error("Gagal load Leaflet"));
    document.head.appendChild(s);
  });
}

export default function OutletPinConfig({ apiBase = "" }) {
  const API = apiBase || (typeof window !== "undefined" && window.location.origin) || "";
  const [pins, setPins] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null); // outlet object being edited
  const [info, setInfo] = useState("");

  const load = useCallback(() => {
    setErr(null); setLoading(true);
    Promise.all([
      fetch(`${API}/api/remote-ops/outlet-pins`).then(r => r.json()),
      fetch(`${API}/api/remote-ops/outlets`).then(r => r.json()),
    ])
    .then(([pR, oR]) => { setPins(pR?.data || []); setOutlets(oR?.data || []); })
    .catch(setErr).finally(() => setLoading(false));
  }, [API]);

  useEffect(() => { load(); }, [load]);

  const mergedList = useMemo(() => {
    // Merge outlets (from /outlets endpoint, includes legacy) + pins
    const pinByCode = Object.fromEntries(pins.map(p => [p.outlet_code, p]));
    const allCodes = new Set([...outlets.map(o => o.code), ...pins.map(p => p.outlet_code)]);
    return Array.from(allCodes).map(code => {
      const outlet = outlets.find(o => o.code === code);
      const pin = pinByCode[code];
      return {
        outlet_code: code,
        outlet_name: pin?.outlet_name || outlet?.name || code,
        vertical: pin?.vertical || outlet?.vertical || "fnb",
        manager_name: pin?.manager_name || outlet?.manager || null,
        has_gps: !!(pin?.gps_lat && pin?.gps_lon),
        gps_lat: pin?.gps_lat, gps_lon: pin?.gps_lon,
        gps_radius_m: pin?.gps_radius_m || 200,
        geofence_enforce: !!pin?.geofence_enforce,
        whatsapp_number: pin?.whatsapp_number,
        has_pin: !!pin?.has_pin,
        address: pin?.address,
      };
    }).sort((a, b) => a.outlet_name.localeCompare(b.outlet_name));
  }, [outlets, pins]);

  const stats = useMemo(() => ({
    total: mergedList.length,
    withGps: mergedList.filter(x => x.has_gps).length,
    enforced: mergedList.filter(x => x.geofence_enforce).length,
    withWa: mergedList.filter(x => x.whatsapp_number).length,
  }), [mergedList]);

  return (
    <div style={{ padding: 20, color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>karyaOS / KROC — OUTLET PIN & GEOFENCE</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 4, letterSpacing: -0.5 }}>📍 Outlet Pin Config</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Set lokasi outlet di peta, radius geofence, PIN manager, WhatsApp for alert. Super-admin (PIN from admin_users) otomatis bypass geofence di mana saja.</div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap: 10, marginBottom: 18 }}>
        <Kpi icon="🏪" label="TOTAL OUTLET" value={stats.total} color={CYAN} />
        <Kpi icon="📍" label="GPS DI-SET"   value={`${stats.withGps}/${stats.total}`} color={stats.withGps === stats.total ? GREEN : AMBER} />
        <Kpi icon="🔒" label="GEOFENCE ON"  value={stats.enforced} color={stats.enforced ? GREEN : "#475569"} />
        <Kpi icon="💬" label="WA TER-SET"   value={`${stats.withWa}/${stats.total}`} color={stats.withWa ? GREEN : "#475569"} />
      </div>

      {info && <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: `1px solid ${GREEN}55`, borderRadius: 10, color: "#86efac", fontSize: 13, marginBottom: 12 }}>{info}</div>}
      {err && <ErrorInline error={err} onRetry={load} label="List outlet belum dapat dimuat" />}

      <div style={{ background: CARD_BG, border: BORDER, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: BORDER, fontSize: 11, color: "#94a3b8", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 700, display: "grid", gridTemplateColumns: "1fr 80px 110px 100px 110px 1fr 110px", gap: 10, alignItems: "center" }}>
          <div>OUTLET</div><div>VERTICAL</div><div>GPS</div><div>RADIUS</div><div>GEOFENCE</div><div>WA / PIN</div><div style={{ textAlign: "right" }}>ACTIONS</div>
        </div>
        {mergedList.length === 0 && !loading && (
          <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No outlet terdaftar</div>
        )}
        {mergedList.map(o => (
          <div key={o.outlet_code} style={{
            padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "grid", gridTemplateColumns: "1fr 80px 110px 100px 110px 1fr 110px", gap: 10, alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{o.outlet_name}</div>
              <div style={{ fontSize: 10, color: "#64748b", fontFamily: "'Geist Mono',monospace" }}>{o.outlet_code}{o.address ? ` · ${o.address.slice(0,40)}…` : ""}</div>
            </div>
            <div style={{ fontSize: 10, color: o.vertical === "cinema" ? PURPLE : CYAN, fontWeight: 700, textTransform: "uppercase", fontFamily: "'Geist Mono',monospace" }}>{o.vertical}</div>
            <div style={{ fontSize: 10, fontFamily: "'Geist Mono',monospace" }}>
              {o.has_gps ? (
                <div style={{ color: GREEN }}>✓ {o.gps_lat.toFixed(4)}, {o.gps_lon.toFixed(4)}</div>
              ) : <div style={{ color: RED }}>✗ belum di-set</div>}
            </div>
            <div style={{ fontSize: 12, color: o.has_gps ? "#cbd5e1" : "#475569", fontFamily: "'Geist Mono',monospace" }}>{o.has_gps ? `${o.gps_radius_m}m` : "—"}</div>
            <div>
              <span style={chip(o.geofence_enforce ? GREEN : "#475569")}>{o.geofence_enforce ? "🔒 ENFORCED" : "⚠ Warn-only"}</span>
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {o.whatsapp_number ? <div>💬 {o.whatsapp_number}</div> : <div style={{ color: "#475569" }}>💬 belum</div>}
              {o.has_pin ? <div style={{ color: GREEN }}>🔑 PIN ter-set</div> : <div style={{ color: AMBER }}>🔑 default 1234</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => setEditing(o)} style={{ padding: "6px 12px", background: PURPLE, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>📍 Edit / Set Lokasi</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PinEditModal
          outlet={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setInfo(`✓ Configuration ${editing.outlet_name} tersimpan`); load(); setTimeout(() => setInfo(""), 4000); }}
          API={API}
        />
      )}

      <div style={{ marginTop: 18, padding: 14, background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10, fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: PURPLE, marginBottom: 6 }}>💡 Cara Kerja Geofence</div>
        • <b>Warn-only:</b> system tetap terima submit, tapi mark distance &gt; radius sebagai warning di audit.<br/>
        • <b>Enforced:</b> system <b>tolak submit</b> kalau lokasi di luar radius (HTTP 403). Manager harus from area outlet.<br/>
        • <b>Super-admin bypass:</b> PIN from <code>admin_users</code> (role super-admin / admin) auto-bypass geofence — bisa submit from mana saja.<br/>
        • Radius default 200m. Outlet di mall besar: set 300-500m. Outlet drive-thru kecil: set 100-150m.
      </div>
    </div>
  );
}

function PinEditModal({ outlet, onClose, onSaved, API }) {
  const [form, setForm] = useState({
    outlet_code: outlet.outlet_code,
    outlet_name: outlet.outlet_name,
    vertical: outlet.vertical || "fnb",
    manager_name: outlet.manager_name || "",
    manager_pin: "",
    gps_lat: outlet.gps_lat || null,
    gps_lon: outlet.gps_lon || null,
    gps_radius_m: outlet.gps_radius_m || 200,
    geofence_enforce: !!outlet.geofence_enforce,
    address: outlet.address || "",
    whatsapp_number: outlet.whatsapp_number || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // Init Leaflet map
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(L => {
      if (cancelled || !mapRef.current) return;
      // Default center: existing pin OR Jakarta center
      const lat = form.gps_lat || -6.2;
      const lon = form.gps_lon || 106.816;
      const map = L.map(mapRef.current).setView([lat, lon], form.gps_lat ? 17 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19,
      }).addTo(map);
      mapInstance.current = map;
      // Initial marker if existing
      if (form.gps_lat && form.gps_lon) {
        markerRef.current = L.marker([form.gps_lat, form.gps_lon], { draggable: true }).addTo(map);
        circleRef.current = L.circle([form.gps_lat, form.gps_lon], { radius: form.gps_radius_m, color: "#a855f7", fillOpacity: 0.1 }).addTo(map);
        markerRef.current.on("dragend", (e) => {
          const ll = e.target.getLatLng();
          setPin(ll.lat, ll.lng);
        });
      }
      // Click to set marker
      map.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng));
      setMapReady(true);
    }).catch(e => setErr(e.message));
    return () => {
      cancelled = true;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPin = (lat, lon) => {
    setForm(f => ({ ...f, gps_lat: lat, gps_lon: lon }));
    const L = window.L;
    if (!L || !mapInstance.current) return;
    if (markerRef.current) markerRef.current.setLatLng([lat, lon]);
    else {
      markerRef.current = L.marker([lat, lon], { draggable: true }).addTo(mapInstance.current);
      markerRef.current.on("dragend", (e) => { const ll = e.target.getLatLng(); setPin(ll.lat, ll.lng); });
    }
    if (circleRef.current) circleRef.current.setLatLng([lat, lon]);
    else circleRef.current = L.circle([lat, lon], { radius: form.gps_radius_m, color: "#a855f7", fillOpacity: 0.1 }).addTo(mapInstance.current);
  };

  // Update radius circle when radius input changes
  useEffect(() => {
    if (circleRef.current && form.gps_radius_m) circleRef.current.setRadius(form.gps_radius_m);
  }, [form.gps_radius_m]);

  const useMyLocation = () => {
    setErr("");
    if (!navigator.geolocation) { setErr("Browser tidak support GPS"); return; }
    navigator.geolocation.getCurrentPosition(
      p => {
        setPin(p.coords.latitude, p.coords.longitude);
        if (mapInstance.current) mapInstance.current.setView([p.coords.latitude, p.coords.longitude], 18);
      },
      e => setErr("GPS denied: " + e.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const searchAddress = async () => {
    if (!form.address) return;
    setErr("");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.address)}&limit=1`);
      const j = await r.json();
      if (!j?.[0]) { setErr("Alamat tidak ditemukan"); return; }
      const lat = parseFloat(j[0].lat), lon = parseFloat(j[0].lon);
      setPin(lat, lon);
      if (mapInstance.current) mapInstance.current.setView([lat, lon], 17);
    } catch (e) { setErr("Search gagal: " + e.message); }
  };

  const save = async () => {
    setErr("");
    if (!form.outlet_code || !form.outlet_name) { setErr("Outlet code + name wajib"); return; }
    if (form.geofence_enforce && (!form.gps_lat || !form.gps_lon)) {
      setErr("Geofence Enforced tapi GPS belum di-set"); return;
    }
    setBusy(true);
    try {
      const body = { ...form };
      if (!body.manager_pin) delete body.manager_pin;
      const r = await fetch(`${API}/api/remote-ops/outlet-pins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(900px, 100%)", maxHeight: "92vh", overflowY: "auto", background: "#0a0f1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: PURPLE, letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>EDIT OUTLET PIN</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginTop: 2 }}>{outlet.outlet_name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Geist Mono',monospace" }}>{outlet.outlet_code}</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <Field label="🗺️ ALAMAT (for search)">
          <div style={{ display: "flex", gap: 6 }}>
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} onKeyDown={e => e.key === "Enter" && searchAddress()} placeholder="cth: Plaza Indonesia, Jakarta Pusat" style={inp} />
            <button onClick={searchAddress} disabled={!form.address} style={{ padding: "8px 14px", background: CYAN, border: "none", borderRadius: 8, color: "#001620", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>🔍 Cari</button>
          </div>
        </Field>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontWeight: 700 }}>📍 LOKASI DI MAP (klik for pin / drag marker)</div>
            <button onClick={useMyLocation} style={{ padding: "4px 10px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)", borderRadius: 6, color: PURPLE, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>📡 Pakai Lokasi Saya</button>
          </div>
          <div ref={mapRef} style={{ width: "100%", height: 340, borderRadius: 10, background: "#0f172a", border: BORDER }} />
          {form.gps_lat && (
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontFamily: "'Geist Mono',monospace" }}>
              📌 {form.gps_lat.toFixed(6)}, {form.gps_lon.toFixed(6)} · radius {form.gps_radius_m}m
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="🎯 RADIUS GEOFENCE (meter)">
            <input type="number" min={50} max={5000} step={50} value={form.gps_radius_m} onChange={e => setForm({...form, gps_radius_m: parseInt(e.target.value, 10) || 200})} style={inp} />
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>50-5000m. Default 200m. Mall besar 300-500m.</div>
          </Field>
          <Field label="🔒 GEOFENCE MODE">
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={form.geofence_enforce} onChange={e => setForm({...form, geofence_enforce: e.target.checked})} />
              <span style={{ fontSize: 13, color: form.geofence_enforce ? GREEN : "#cbd5e1" }}>{form.geofence_enforce ? "🔒 Enforced (tolak luar area)" : "⚠ Warn-only"}</span>
            </label>
          </Field>
        </div>

        <Field label="👤 NAMA MANAGER OUTLET"><input value={form.manager_name} onChange={e => setForm({...form, manager_name: e.target.value})} placeholder="Nama" style={inp} /></Field>
        <Field label={`🔑 PIN MANAGER (kosongkan kalau gak ganti, default 1234)`}><input type="password" value={form.manager_pin} onChange={e => setForm({...form, manager_pin: e.target.value.replace(/\D/g,"").slice(0,6)})} placeholder="4-6 digit" style={{...inp, letterSpacing: 8, textAlign: "center"}} /></Field>
        <Field label="💬 WHATSAPP MANAGER (for anomaly alert)"><input value={form.whatsapp_number} onChange={e => setForm({...form, whatsapp_number: e.target.value})} placeholder="cth: 6281234567890" style={inp} /></Field>

        {err && <div style={{ padding: 10, background: "rgba(239,68,68,0.1)", border: `1px solid ${RED}55`, borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>⚠ {err}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ flex: 2, padding: 12, background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>{busy ? "⏳ Menyimpan…" : "💾 Simpan Configuration"}</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  return (
    <div style={{ padding: 12, background: CARD_BG, border: BORDER, borderRadius: 10 }}>
      <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1.3, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 0.5, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function chip(color) {
  return { padding: "3px 8px", background: `${color}22`, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 10, color, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.3 };
}

const inp = {
  width: "100%", boxSizing: "border-box",
  background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 12px", color: "#fff",
  fontSize: 13, fontFamily: "inherit", outline: "none",
};
