// src/Admin/AdminSignage.jsx
// Digital Signage CMS — device-centric (TV per outlet × zone).
//
// Pakai endpoint /api/signage/devices untuk list, /api/signage/devices/seed
// untuk bulk-create per outlet. Tampilkan health badge (online <30s, dim 30s-5m,
// offline >5m) + player URL utk dipair ke TV/tablet.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useUiKit, LoadingState, EmptyState } from "../components/uiKit.jsx";
import { useOutletScope } from "./OutletScopeContext";

const AC = "#9333ea";
const MEDIA_STATUSES = ["active", "scheduled", "inactive"];
const TYPE_ICON = { Image: "🖼️", Video: "🎬", Banner: "🪧", Promo: "🏷️" };
const MST = { active: "#10b981", scheduled: "#f59e0b", inactive: "#5b6470" };

const ZONE_META = {
  // Cinema
  "lobby":           { vertical: "cinema", icon: "🏛️", label: "Lobby", desc: "Now showing + Coming Soon" },
  "box-office":      { vertical: "cinema", icon: "🎟️", label: "Box Office", desc: "Jadwal hari ini + harga" },
  "fnb-counter":     { vertical: "cinema", icon: "🍿", label: "F&B Counter", desc: "Combo bundles + harga" },
  "studio-entrance": { vertical: "cinema", icon: "🚪", label: "Studio Entrance", desc: "Film aktif + next show" },
  // F&B
  "menu-board":      { vertical: "fnb", icon: "🍔", label: "Menu Board", desc: "Menu lengkap + harga" },
  "counter-side":    { vertical: "fnb", icon: "🏪", label: "Counter Side", desc: "Promo + combo deals" },
  "dining-area":     { vertical: "fnb", icon: "🪑", label: "Dining Area", desc: "Favorit + brand story" },
  "pickup":          { vertical: "fnb", icon: "🛒", label: "Order Pickup", desc: "Antrian pesanan siap" },
  // Shared
  "window":          { vertical: "shared", icon: "🪟", label: "Window/Outdoor", desc: "Walk-in attractor" },
};

function relativeTime(secAgo) {
  if (secAgo == null) return "belum pernah";
  const s = Math.floor(secAgo);
  if (s < 30) return `${s} detik lalu`;
  if (s < 90) return "1 menit lalu";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

function deviceHealth(d) {
  const sec = d.sec_since_seen;
  if (sec == null || sec > 86400) return { tier: "never", color: "#5b6470", label: "Belum aktif" };
  if (sec < 30) return { tier: "online", color: "#10b981", label: "Online" };
  if (sec < 300) return { tier: "dim", color: "#f59e0b", label: "Idle" };
  return { tier: "offline", color: "#ef4444", label: "Offline" };
}

export default function AdminSignage({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const { outlets } = useOutletScope();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", media_type: "Image", duration_sec: "15", channel: "TV Menu" });
  const [editing, setEditing] = useState(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(`${apiBase}/api/signage`).then(r => r.json()).catch(() => null),
      fetch(`${apiBase}/api/signage/devices`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}` }
      }).then(r => r.json()).catch(() => ({ devices: [] })),
    ]).then(([base, dv]) => {
      if (!base) return;
      setD({ ...base, devices: dv.devices || [] });
    });
  }, [apiBase]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const post = (path, body, okMsg) => {
    fetch(`${apiBase}/api/signage/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}` },
      body: body ? JSON.stringify(body) : "{}",
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const addMedia = () => {
    if (!form.title.trim()) { setMsg("⚠ Judul media wajib"); return; }
    post("media", { ...form, duration_sec: Number(form.duration_sec) }, "✓ Media ditambah");
    setForm({ ...form, title: "" });
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/signage/media/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.title || '#' + item.id}"?`,
      message: "Media akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/signage/media/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  const removeDevice = async (dev) => {
    const ok = await confirm({
      title: `Hapus device "${dev.device_id || dev.name}"?`,
      message: `${dev.outlet} · ${dev.zone || "—"}. TV ini akan offline dari sistem.`,
      danger: true, okLabel: "Hapus device",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/signage/screen/${dev.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}` },
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Device dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  // Group devices per outlet
  const devicesByOutlet = useMemo(() => {
    if (!d?.devices) return {};
    const g = {};
    for (const dv of d.devices) {
      const out = dv.outlet || "(tanpa outlet)";
      if (!g[out]) g[out] = [];
      g[out].push(dv);
    }
    return g;
  }, [d?.devices]);

  if (!d) return <LoadingState label="Memuat Digital Signage…" />;
  const s = d.summary;
  const totalDevices = d.devices?.length || 0;
  const onlineDevices = (d.devices || []).filter(dv => deviceHealth(dv).tier === "online").length;

  return (
    <div>
      <div style={S.intro}>
        📺 <b style={{ color: "#c084fc" }}>DIGITAL SIGNAGE CMS</b> — TV menu board, lobby display, kiosk media.
        Tiap device punya zone (lobby/menu-board/dll), konten auto-rotate sesuai vertikal outlet.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Device" v={String(totalDevices)} c={AC} />
        <Kpi label="Online" v={`${onlineDevices}/${totalDevices}`} c="#10b981" />
        <Kpi label="Total Media" v={String(s.media)} c="#3b82f6" />
        <Kpi label="Media Active" v={String(s.active_media)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Devices */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={S.kicker}>🖥️ DEVICE TV — {totalDevices} · {Object.keys(devicesByOutlet).length} outlet</div>
          <button onClick={() => setSeedOpen(true)} style={S.btn}>+ Tambah Device</button>
        </div>

        {totalDevices === 0 ? (
          <EmptyState icon="📺" title="Belum ada TV terdaftar" desc="Klik '+ Tambah Device' untuk bulk-register 5 device per outlet (lobby/menu-board/dll)." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
            {Object.entries(devicesByOutlet).map(([outlet, devs]) => (
              <div key={outlet}>
                <div style={S.outletHead}>📍 {outlet} <span style={{ color: "#5b6470", fontWeight: 500 }}>· {devs.length} device</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
                  {devs.map(dv => <DeviceCard key={dv.id} dev={dv} apiBase={apiBase} onPreview={() => setPreviewDevice(dv)} onDelete={() => removeDevice(dv)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Media library */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🎬 MEDIA LIBRARY — {d.media.length}</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.9fr 1.2fr auto", gap: 8, margin: "10px 0 12px" }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul media" style={S.input} />
          <select value={form.media_type} onChange={e => setForm({ ...form, media_type: e.target.value })} style={S.input}>
            {d.media_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.duration_sec} onChange={e => setForm({ ...form, duration_sec: e.target.value })} placeholder="Durasi (s)" type="number" style={S.input} />
          <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} style={S.input}>
            {d.channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={addMedia} style={S.btn}>+ Media</button>
        </div>
        {d.media.length === 0 && <EmptyState icon="🎞️" title="Belum ada media" desc="Tambahkan gambar/video/banner — bisa di-pin per device." />}
        {d.media.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
            <span style={{ fontSize: 16 }}>{TYPE_ICON[m.media_type] || "📄"}</span>
            <span style={{ flex: 1, color: "#e6edf3", fontWeight: 600 }}>{m.title}</span>
            <span style={{ width: 100, color: "#5b6470", fontSize: 11 }}>{m.channel}</span>
            <span style={{ width: 50, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{m.duration_sec}s</span>
            <button onClick={() => post(`media/${m.id}/toggle`, null, `✓ ${m.title} di-toggle`)}
              style={{ width: 90, fontSize: 10, fontWeight: 700, color: MST[m.status], background: MST[m.status] + "1f", border: `1px solid ${MST[m.status]}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
              {m.status.toUpperCase()}
            </button>
            <button onClick={() => setEditing({ ...m })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(m)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
      </div>

      {/* Media edit modal */}
      {editing && (
        <div onClick={() => setEditing(null)} style={S.modalBackdrop}>
          <div onClick={e => e.stopPropagation()} style={S.modal}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={modalLbl}>Judul</label>
                <input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={modalLbl}>Tipe Media</label>
                  <select value={editing.media_type || ""} onChange={e => setEditing({ ...editing, media_type: e.target.value })} style={modalInp}>
                    {(d.media_types || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLbl}>Channel</label>
                  <select value={editing.channel || ""} onChange={e => setEditing({ ...editing, channel: e.target.value })} style={modalInp}>
                    {(d.channels || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={modalLbl}>Durasi (sec)</label>
                  <input type="number" value={editing.duration_sec ?? 0} onChange={e => setEditing({ ...editing, duration_sec: Number(e.target.value) })} style={modalInp} />
                </div>
                <div>
                  <label style={modalLbl}>Status</label>
                  <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                    {MEDIA_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={S.btnGhost}>Cancel</button>
              <button onClick={saveEdit} style={S.btnPrimary}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Seed devices modal */}
      {seedOpen && (
        <SeedDevicesModal
          outlets={outlets || []}
          apiBase={apiBase}
          onClose={() => setSeedOpen(false)}
          onDone={(m) => { setMsg(m); setSeedOpen(false); load(); }}
        />
      )}

      {/* Preview device modal */}
      {previewDevice && (
        <DevicePreviewModal device={previewDevice} apiBase={apiBase} onClose={() => setPreviewDevice(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Device card
// ─────────────────────────────────────────────────────────
function DeviceCard({ dev, apiBase, onPreview, onDelete }) {
  const health = deviceHealth(dev);
  const zone = ZONE_META[dev.zone] || { icon: "📺", label: dev.zone || "—", desc: "" };
  const playerUrl = dev.player_url ? `${window.location.origin}${dev.player_url}` : null;
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!playerUrl) return;
    navigator.clipboard?.writeText(playerUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ background: "#0a0e16", border: `1px solid ${health.tier === "online" ? "#10b98144" : "#161b22"}`, borderRadius: 10, padding: "13px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{zone.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#e6edf3" }}>{zone.label}</div>
          <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dev.device_id || `#${dev.id}`}</div>
        </div>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: health.color, boxShadow: health.tier === "online" ? `0 0 8px ${health.color}` : "none" }} />
      </div>
      <div style={{ fontSize: 11, color: "#9da7b3", marginBottom: 8, lineHeight: 1.4 }}>{zone.desc}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontFamily: "'Geist Mono',monospace", color: health.color, letterSpacing: 1, fontWeight: 700 }}>
          ● {health.label.toUpperCase()}
        </div>
        <div style={{ fontSize: 9, color: "#5b6470", fontStyle: "italic" }}>{relativeTime(dev.sec_since_seen)}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {playerUrl && (
          <>
            <button onClick={onPreview} title="Preview di tab baru" style={S.devBtn}>👁️ Preview</button>
            <button onClick={copy} title="Copy URL" style={S.devBtn}>{copied ? "✓ Copied" : "🔗 URL"}</button>
          </>
        )}
        <button onClick={onDelete} title="Hapus device" style={{ ...S.devBtn, marginLeft: "auto", color: "#ef4444", borderColor: "#ef444444" }}>🗑️</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Seed devices modal — bulk-create per outlet
// ─────────────────────────────────────────────────────────
function SeedDevicesModal({ outlets, apiBase, onClose, onDone }) {
  const [vertical, setVertical] = useState("fnb");
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const filtered = useMemo(() => {
    const list = outlets.filter(o => o.status !== "closed");
    if (vertical === "fnb") return list.filter(o => !o.vertical || o.vertical === "fnb" || o.vertical === "hybrid");
    if (vertical === "cinema") return list.filter(o => o.vertical === "cinema" || o.vertical === "hybrid");
    return list;
  }, [outlets, vertical]);

  const toggle = (code) => setSelected(s => s.includes(code) ? s.filter(c => c !== code) : [...s, code]);

  const seed = async () => {
    if (!selected.length) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${apiBase}/api/signage/devices/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}` },
        body: JSON.stringify({ outlets: selected, vertical }),
      });
      const j = await r.json();
      if (j.ok) {
        setResult(j);
        setTimeout(() => onDone(`✓ ${j.summary.created} device dibuat, ${j.summary.skipped} sudah ada`), 800);
      } else {
        setSubmitting(false);
        alert(j.error || "Gagal");
      }
    } catch (e) {
      setSubmitting(false);
      alert(String(e));
    }
  };

  const zones = vertical === "cinema"
    ? ["lobby", "box-office", "fnb-counter", "studio-entrance", "window"]
    : ["menu-board", "counter-side", "dining-area", "pickup", "window"];

  return (
    <div onClick={onClose} style={S.modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...S.modal, maxWidth: 620 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 6 }}>📺 Tambah Device TV</div>
        <div style={{ fontSize: 12, color: "#9da7b3", marginBottom: 18 }}>
          Bulk-create 5 device per outlet (sesuai zones vertikal). Device yg sudah ada akan di-skip.
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={modalLbl}>VERTIKAL</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {["fnb", "cinema"].map(v => (
              <button key={v} onClick={() => { setVertical(v); setSelected([]); }}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: `1px solid ${vertical === v ? "#9333ea" : "#21262d"}`, background: vertical === v ? "rgba(147,51,234,0.15)" : "#0a0e16", color: vertical === v ? "#c084fc" : "#9da7b3", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {v === "cinema" ? "🎬 Cinema" : "🍽️ F&B"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={modalLbl}>ZONES YG AKAN DIBUAT ({zones.length} per outlet)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {zones.map(z => {
              const m = ZONE_META[z] || { icon: "📺", label: z };
              return (
                <span key={z} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, background: "rgba(147,51,234,0.10)", color: "#c084fc", border: "1px solid rgba(147,51,234,0.25)", fontWeight: 700 }}>
                  {m.icon} {m.label}
                </span>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={modalLbl}>PILIH OUTLET ({selected.length}/{filtered.length})</div>
            {filtered.length > 0 && (
              <button onClick={() => setSelected(selected.length === filtered.length ? [] : filtered.map(o => o.code))}
                style={{ fontSize: 10, color: "#fbbf24", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                {selected.length === filtered.length ? "Bersihkan" : "Pilih semua"}
              </button>
            )}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", marginTop: 6, border: "1px solid #21262d", borderRadius: 8, background: "#0a0e16" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 16, color: "#5b6470", textAlign: "center", fontSize: 12 }}>Tidak ada outlet untuk vertikal ini.</div>
            ) : filtered.map(o => {
              const checked = selected.includes(o.code);
              return (
                <div key={o.code} onClick={() => toggle(o.code)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid #161b22", cursor: "pointer", background: checked ? "rgba(147,51,234,0.10)" : "transparent" }}>
                  <span style={{ fontSize: 16 }}>{checked ? "☑" : "☐"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{o.area || o.name}</div>
                    <div style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{o.code}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {result && (
          <div style={{ padding: 12, borderRadius: 8, background: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.30)", marginBottom: 12, fontSize: 12, color: "#10b981" }}>
            ✓ Berhasil — {result.summary.created} device baru, {result.summary.skipped} sudah ada
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={S.btnGhost}>Cancel</button>
          <button onClick={seed} disabled={!selected.length || submitting} style={{ ...S.btnPrimary, opacity: (!selected.length || submitting) ? 0.4 : 1, cursor: (!selected.length || submitting) ? "not-allowed" : "pointer" }}>
            {submitting ? "⏳ Membuat..." : `📺 Buat ${selected.length * zones.length} Device`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Device preview modal — embed player + show pair URL
// ─────────────────────────────────────────────────────────
function DevicePreviewModal({ device, apiBase, onClose }) {
  const url = device.player_url ? `${window.location.origin}${device.player_url}` : "";
  return (
    <div onClick={onClose} style={S.modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={{ ...S.modal, maxWidth: 880, width: "92%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>👁️ Preview — {device.outlet} · {ZONE_META[device.zone]?.label || device.zone}</div>
            <div style={{ fontSize: 11, fontFamily: "'Geist Mono',monospace", color: "#5b6470", marginTop: 4 }}>{device.device_id}</div>
          </div>
          <button onClick={onClose} style={S.btnGhost}>✕ Tutup</button>
        </div>

        <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", marginBottom: 14, border: "1px solid #21262d" }}>
          {url ? (
            <iframe src={url} style={{ width: "100%", height: "100%", border: "none" }} title="signage-preview" />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#5b6470" }}>Device ID belum di-set</div>
          )}
        </div>

        <div style={{ background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#9da7b3", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>🔗 URL UNTUK TV / TABLET</div>
          <div style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24", fontSize: 12, wordBreak: "break-all" }}>{url}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => navigator.clipboard?.writeText(url)} style={S.devBtn}>📋 Copy URL</button>
            <a href={url} target="_blank" rel="noreferrer" style={{ ...S.devBtn, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>🔗 Buka di tab baru</a>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "#9da7b3", lineHeight: 1.6, padding: 12, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 8 }}>
          💡 <b style={{ color: "#c084fc" }}>Cara pasang ke TV:</b><br />
          1. Buka browser di TV/tablet/mini-PC<br />
          2. Paste URL di atas<br />
          3. Tekan F11 untuk fullscreen<br />
          4. Player akan auto-refresh tiap 60 detik<br />
          5. Status "Online" muncul di dashboard ini ≤30 detik
        </div>
      </div>
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
const modalLbl = { fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4, display: "block", marginBottom: 4 };

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
  outletHead: { fontSize: 13, fontWeight: 800, color: "#fbbf24", marginBottom: 8, letterSpacing: 0.3 },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#9333ea", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnPrimary: { background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 },
  btnGhost: { background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
  devBtn: { background: "rgba(255,255,255,0.04)", border: "1px solid #21262d", color: "#e6edf3", padding: "5px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 },
  modal: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 520, width: "100%", maxHeight: "92vh", overflowY: "auto" },
};
