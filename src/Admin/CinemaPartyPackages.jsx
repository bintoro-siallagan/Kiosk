// karyaOS — Cinema Party Packages Admin
// Birthday/Anniversary/Corporate party package CRUD + booking list.

import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const OCCASION_ICON = { birthday: "🎂", anniversary: "💍", corporate: "🏢", school: "🎒", other: "🎉" };
const STATUS_COLOR = { pending: "#fbbf24", confirmed: "#10b981", cancelled: "#ef4444", completed: "#a855f7" };

const emptyPkg = {
  name: "", description: "", studio_type: "Deluxe",
  min_pax: 10, max_pax: 30, duration_hours: 3,
  base_price: 3500000, fnb_bundle_per_pax: 75000,
  includes_decoration: true, includes_host: true, includes_photographer: false,
  inclusions: [],
};

export default function CinemaPartyPackages({ apiBase = "" }) {
  const base = `${apiBase}/api/cinema`;
  const [tab, setTab] = useState("packages");
  const [packages, setPackages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPkg);
  const [msg, setMsg] = useState(null);

  const showMsg = (m, kind = "ok") => { setMsg({ m, kind }); setTimeout(() => setMsg(null), 2500); };

  const reload = useCallback(() => {
    fetch(`${base}/party-packages`).then(r => r.json()).then(d => setPackages(d.packages || [])).catch(() => {});
    fetch(`${base}/party-bookings`).then(r => r.json()).then(d => setBookings(d.bookings || [])).catch(() => {});
  }, [base]);
  useEffect(reload, [reload]);

  const startNew = () => { setEditing("new"); setForm(emptyPkg); };
  const cancel = () => { setEditing(null); setForm(emptyPkg); };

  const savePkg = async () => {
    if (!form.name || !form.base_price) { showMsg("Nama & harga wajib", "err"); return; }
    try {
      const r = await fetch(`${base}/party-packages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Gagal");
      showMsg("✓ Package created");
      cancel(); reload();
    } catch (e) { showMsg("⚠ " + e.message, "err"); }
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎂 Cinema Party Packages</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>Birthday / Anniversary / Corporate package · Studio + F&B + Dekorasi bundle · Conflict-checked booking.</div>
        </div>
        {tab === "packages" && !editing && <button onClick={startNew} style={B.add}>＋ Package baru</button>}
      </div>

      {/* Tab switcher */}
      <div style={{ display: "inline-flex", gap: 4, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 3, marginBottom: 14 }}>
        {[
          { v: "packages", l: `📦 Packages (${packages.length})` },
          { v: "bookings", l: `📅 Bookings (${bookings.length})` },
        ].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)} style={{
            padding: "8px 16px", background: tab === t.v ? "rgba(236,72,153,0.15)" : "transparent",
            color: tab === t.v ? "#ec4899" : C.sub, border: "none", borderRadius: 8,
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>

      {/* Package edit form */}
      {tab === "packages" && editing && (
        <div style={{ background: C.card, border: `1px solid #ec489966`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#ec4899", marginBottom: 10 }}>＋ Package Baru</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <Field label="Nama package*" wide><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="🎂 Birthday Mini" style={inp} /></Field>
            <Field label="Studio Type">
              <select value={form.studio_type} onChange={e => setForm({ ...form, studio_type: e.target.value })} style={inp}>
                {["Regular", "Deluxe", "IMAX", "Premiere"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Durasi (hr)"><input type="number" value={form.duration_hours} onChange={e => setForm({ ...form, duration_hours: parseInt(e.target.value, 10) || 3 })} style={inp} /></Field>
            <Field label="Min Pax"><input type="number" value={form.min_pax} onChange={e => setForm({ ...form, min_pax: parseInt(e.target.value, 10) || 10 })} style={inp} /></Field>
            <Field label="Max Pax"><input type="number" value={form.max_pax} onChange={e => setForm({ ...form, max_pax: parseInt(e.target.value, 10) || 30 })} style={inp} /></Field>
            <Field label="Base price (Rp)*"><input type="number" step={100000} value={form.base_price} onChange={e => setForm({ ...form, base_price: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="F&B per pax (Rp)"><input type="number" step={10000} value={form.fnb_bundle_per_pax} onChange={e => setForm({ ...form, fnb_bundle_per_pax: parseInt(e.target.value, 10) || 0 })} style={inp} /></Field>
            <Field label="Description" wide style={{ gridColumn: "span 3" }}><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ ...inp, minHeight: 60, resize: "vertical" }} /></Field>
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><input type="checkbox" checked={form.includes_decoration} onChange={e => setForm({ ...form, includes_decoration: e.target.checked })} /> 🎈 Dekorasi</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><input type="checkbox" checked={form.includes_host} onChange={e => setForm({ ...form, includes_host: e.target.checked })} /> 🎤 Host/MC</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><input type="checkbox" checked={form.includes_photographer} onChange={e => setForm({ ...form, includes_photographer: e.target.checked })} /> 📸 Photographer</label>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={savePkg} style={B.save}>Buat Package</button>
            <button onClick={cancel} style={B.cancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Packages list */}
      {tab === "packages" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
          {packages.length === 0 ? <div style={{ gridColumn: "1/-1", padding: 30, textAlign: "center", color: C.sub, background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12 }}>No package. Klik ＋ Package baru.</div>
            : packages.map(p => (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {p.image_url && <img src={p.image_url} style={{ width: "100%", height: 140, objectFit: "cover" }} />}
                <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#ec4899", fontFamily: "'Geist Mono',monospace", marginBottom: 8, letterSpacing: 1 }}>{p.studio_type} · {p.min_pax}-{p.max_pax} pax · {p.duration_hours}h</div>
                  {p.description && <div style={{ fontSize: 12, color: C.sub, marginBottom: 8, lineHeight: 1.4 }}>{p.description}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {p.includes_decoration ? <span style={pillTag}>🎈 Dekorasi</span> : null}
                    {p.includes_host ? <span style={pillTag}>🎤 Host</span> : null}
                    {p.includes_photographer ? <span style={pillTag}>📸 Photo</span> : null}
                  </div>
                  {p.inclusions?.length > 0 && (
                    <ul style={{ fontSize: 11.5, color: C.sub, marginBottom: 12, paddingLeft: 16, lineHeight: 1.6 }}>
                      {p.inclusions.slice(0, 5).map((it, i) => <li key={i}>{it}</li>)}
                      {p.inclusions.length > 5 && <li style={{ color: C.dim }}>+{p.inclusions.length - 5} lagi</li>}
                    </ul>
                  )}
                  <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.dim }}>Base price</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#ec4899", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.5 }}>{rp(p.base_price)}</div>
                    </div>
                    {p.fnb_bundle_per_pax > 0 && <div style={{ fontSize: 11, color: C.sub, textAlign: "right" }}>+ {rp(p.fnb_bundle_per_pax)}/pax F&B</div>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Bookings list */}
      {tab === "bookings" && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {bookings.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: C.sub }}>No booking.</div>
            : bookings.map(b => (
              <div key={b.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 0.8fr 0.8fr 0.6fr", padding: "14px 16px", borderBottom: `1px solid ${C.border}`, gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 28 }}>{OCCASION_ICON[b.occasion] || "🎉"}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{b.customer_name}</div>
                  <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{b.customer_phone || ""}</div>
                  {b.decoration_theme && <div style={{ fontSize: 10, color: "#ec4899", marginTop: 2 }}>Theme: {b.decoration_theme}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{b.package_name}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{b.studio_name} · {b.outlet}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontFamily: "'Geist Mono',monospace", color: "#fbbf24" }}>{b.booking_date}</div>
                  <div style={{ fontSize: 11, color: C.sub, fontFamily: "'Geist Mono',monospace" }}>{b.start_time}-{b.end_time}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(b.total_price)}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{b.pax} pax</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: STATUS_COLOR[b.status], background: STATUS_COLOR[b.status] + "22", border: `1px solid ${STATUS_COLOR[b.status]}55`, padding: "3px 10px", borderRadius: 999, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>{b.status}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {msg && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: msg.kind === "err" ? "#7f1d1d" : "#14532d", border: `1px solid ${msg.kind === "err" ? "#ef4444" : "#22c55e"}`, color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{msg.m}</div>}
    </div>
  );
}

function Field({ label, children, wide, style }) {
  return (
    <div style={{ gridColumn: wide ? "span 1" : "auto", ...style }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
const inp = { padding: "9px 11px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", width: "100%" };
const pillTag = { fontSize: 10, fontWeight: 700, padding: "3px 8px", background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc", borderRadius: 999, fontFamily: "'Geist Mono',monospace", letterSpacing: 0.5 };
const B = {
  add:    { background: "#ec489922", border: "1px solid #ec489966", color: "#ec4899", padding: "9px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  save:   { background: "#10b981", border: "none", color: "#04130c", padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" },
  cancel: { background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, color: C.sub, padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
};
