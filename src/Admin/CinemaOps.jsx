import { useState, useEffect, Component } from "react";
import { useUiKit } from "../components/uiKit.jsx";
import CinemaStudioLayoutEditor from "./CinemaStudioLayoutEditor.jsx";

// Error boundary — biar crash di Cinema Ops gak bikin admin blank total
class CinemaOpsErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[CinemaOps] crash:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 30, color: "#fca5a5", fontFamily: "'Inter',sans-serif" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>⚠ Cinema Ops crashed</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16 }}>Error: {String(this.state.error?.message || this.state.error)}</div>
          <button onClick={() => this.setState({ error: null })} style={{ background: "#a855f7", border: "none", borderRadius: 8, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↻ Reset</button>
          <pre style={{ marginTop: 14, padding: 14, background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, fontSize: 11, overflow: "auto", color: "#7d8590" }}>{String(this.state.error?.stack || "")}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Cinema Operations — manage films, studios/screens and showtimes.
// karyaOS cinema vertical (admin side). Talks to /api/cinema/*.
const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };
const inp = { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "7px 9px", color: "#fff", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
// LSF Indonesia age classification — SU=Semua Umur, 13+, 17+, D21=Dewasa 21+
const RATINGS = ["SU", "13+", "17+", "D21"];
const RATING_COLOR = { "SU": "#10b981", "13+": "#22d3ee", "17+": "#f59e0b", "D21": "#ef4444" };
const RATING_NAME  = { "SU": "Semua Umur", "13+": "Remaja 13+", "17+": "Remaja 17+", "D21": "Dewasa 21+" };
const STATUSES = [["now_showing", "Tayang"], ["coming_soon", "Segera"], ["archived", "Arsip"]];
const STUDIO_TYPES = ["Regular", "IMAX", "Premiere", "4DX"];
const FORMATS = ["2D", "3D", "IMAX", "4DX"];
const TABS = [["film", "🎬 Film"], ["studio", "🏛️ Studio"], ["showtime", "🗓️ Jadwal Tayang"], ["branding", "🎨 Branding CDS"]];
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const statusLabel = (s) => (STATUSES.find(x => x[0] === s) || [s, s])[1];
const statusColor = (s) => s === "now_showing" ? "#10b981" : s === "coming_soon" ? "#eab308" : "#5b6470";
// Derived showtime status (computed from time + sold + manual_closed_at)
const DS_LABEL = { scheduled: "Terjadwal", running: "Berlangsung", closed: "Tutup", sold_out: "Sold Out", cancelled: "Batal" };
const DS_COLOR = { scheduled: "#10b981", running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };

export default function CinemaOpsWrapped(props) {
  return <CinemaOpsErrorBoundary><CinemaOpsInner {...props} /></CinemaOpsErrorBoundary>;
}

function CinemaOpsInner({ apiBase }) {
  const { confirm } = useUiKit();
  const [tab, setTab] = useState("film");
  const [films, setFilms] = useState([]);
  const [studios, setStudios] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); // { type:'film'|'studio'|'showtime', data:{} }
  const [layoutStudio, setLayoutStudio] = useState(null); // studio object being layout-edited
  const [tmdbModal, setTmdbModal] = useState(null);       // { query, loading, results }
  const [bulkOutlets, setBulkOutlets] = useState([]);     // list outlet untuk bulk-push
  const [selectedOutlets, setSelectedOutlets] = useState(new Set());
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    fetch(`${apiBase}/api/outlet-master`).then(r => r.json()).then(d => {
      setBulkOutlets((d.outlets || d.data || []).filter(o => o.status === "active"));
    }).catch(() => {});
  }, [apiBase]);

  const base = `${apiBase}/api/cinema`;
  const reload = () => {
    fetch(`${base}/summary`).then(r => r.json()).then(setSummary).catch(() => {});
    fetch(`${base}/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
    fetch(`${base}/studios`).then(r => r.json()).then(d => setStudios(d.studios || [])).catch(() => {});
    fetch(`${base}/showtimes`).then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [apiBase]);

  const f = (k) => form[k] ?? "";
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const add = (path, body) => {
    setMsg("");
    fetch(`${base}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => r.json()).then(d => { if (d && d.error) setMsg(d.error); else { setForm({}); reload(); } })
      .catch(() => setMsg("Gagal menyimpan"));
  };
  const del = (path) => { fetch(`${base}/${path}`, { method: "DELETE" }).then(() => reload()).catch(() => {}); };
  const askDelete = async (item, path, label) => {
    const ok = await confirm({
      title: `Hapus "${label || item.title || item.name || ('#' + item.id)}"?`,
      message: "Akan dihapus permanen — termasuk data terkait (jadwal/tiket).",
      danger: true, okLabel: "Hapus",
    });
    if (!ok) return;
    del(path);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const { type, data } = editing;
    const path = type === "film" ? `films/${data.id}` : type === "studio" ? `studios/${data.id}` : `showtimes/${data.id}`;
    let body = {};
    if (type === "film") {
      body = {
        title: data.title, genre: data.genre, duration_min: data.duration_min,
        rating: data.rating, status: data.status, synopsis: data.synopsis,
        poster_url: data.poster_url, trailer_url: data.trailer_url,
      };
    } else if (type === "studio") {
      body = { name: data.name, studio_type: data.studio_type, rows: data.rows, cols: data.cols, outlet: data.outlet };
    } else {
      body = {
        film_id: data.film_id, studio_id: data.studio_id, show_date: data.show_date,
        start_time: data.start_time, price: data.price, format: data.format,
      };
    }
    try {
      const r = await fetch(`${base}/${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { setMsg("✓ Tersimpan"); setEditing(null); reload(); }
      else setMsg(j.error || "gagal");
    } catch { setMsg("Gagal menyimpan"); }
  };
  const closeShow = (id) => {
    const reason = window.prompt("Alasan tutup showtime (opsional):", "") ?? "";
    fetch(`${base}/showtimes/${id}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, manager_name: "ops" }),
    }).then(r => r.json()).then(d => { if (d.error) setMsg(d.error); else reload(); }).catch(() => setMsg("Gagal menutup"));
  };
  const reopenShow = (id) => {
    fetch(`${base}/showtimes/${id}/reopen`, { method: "POST" })
      .then(r => r.json()).then(d => { if (d.error) setMsg(d.error); else reload(); }).catch(() => setMsg("Gagal membuka"));
  };

  const btn = (label, onClick, color = "#a855f7") => (
    <button onClick={onClick} style={{ background: color + "1f", border: `1px solid ${color}55`, borderRadius: 7, padding: "7px 14px", color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{label}</button>
  );
  const editBtn = (type, item) => (
    <button onClick={() => setEditing({ type, data: { ...item } })} title="Edit" style={{ background: "transparent", border: "1px solid #30363d", borderRadius: 6, padding: "4px 9px", color: "#9da7b3", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✎</button>
  );
  const delBtnAsk = (item, path, label) => (
    <button onClick={() => askDelete(item, path, label)} title="Hapus" style={{ background: "transparent", border: "1px solid #ef444444", borderRadius: 6, padding: "4px 9px", color: "#ef4444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
  );

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎬 Cinema Operations</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>karyaOS — vertikal cinema · film, studio &amp; jadwal tayang</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label="Film tayang" value={summary ? summary.films_now_showing : "—"} color="#10b981" />
          <Stat label="Studio" value={summary ? summary.studios : "—"} color="#a855f7" />
          <Stat label="Jadwal hari ini" value={summary ? summary.showtimes_today : "—"} color="#22d3ee" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setForm({}); setMsg(""); }}
            style={{ background: tab === id ? "#a855f72a" : "transparent", border: `1px solid ${tab === id ? "#a855f766" : C.border}`, borderRadius: 8, padding: "8px 14px", color: tab === id ? "#fff" : C.sub, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      {msg && <div style={{ background: "#ef444415", border: "1px solid #ef444433", borderRadius: 8, padding: "8px 12px", color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>{msg}</div>}

      {/* ── FILM ── */}
      {tab === "film" && (
        <>
          <Form>
            <input style={{ ...inp, flex: 2, minWidth: 150 }} placeholder="Judul film" value={f("title")} onChange={set("title")} />
            <input style={{ ...inp, flex: 1, minWidth: 110 }} placeholder="Genre" value={f("genre")} onChange={set("genre")} />
            <input style={{ ...inp, width: 90 }} type="number" placeholder="Durasi" value={f("duration_min")} onChange={set("duration_min")} />
            <select style={{ ...inp, width: 84 }} value={f("rating") || "SU"} onChange={set("rating")}>{RATINGS.map(r => <option key={r} value={r}>{r}</option>)}</select>
            <select style={{ ...inp, width: 110 }} value={f("status") || "now_showing"} onChange={set("status")}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input style={{ ...inp, width: 110 }} placeholder="Bahasa" value={f("language")} onChange={set("language")} />
            <input style={{ ...inp, width: 110 }} placeholder="Subtitle" value={f("subtitle")} onChange={set("subtitle")} />
            <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="Poster URL" value={f("poster_url")} onChange={set("poster_url")} />
            <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="Trailer URL (YouTube)" value={f("trailer_url")} onChange={set("trailer_url")} />
            {btn("+ Tambah", () => add("films", { title: f("title"), genre: f("genre"), duration_min: f("duration_min"), rating: f("rating") || "SU", status: f("status") || "now_showing", language: f("language") || "Indonesia", subtitle: f("subtitle") || "", poster_url: f("poster_url") || "", trailer_url: f("trailer_url") || "" }))}
          </Form>
          <List empty={films.length === 0} emptyText="Belum ada film.">
            {films.map(x => (
              <Row key={x.id}>
                <div style={{ flex: 2, minWidth: 150 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{x.title}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{x.genre || "—"} · {x.duration_min || 0} mnt</div>
                </div>
                <Badge color={RATING_COLOR[x.rating] || "#6366f1"}>{x.rating}</Badge>
                <Badge color={statusColor(x.status)}>{statusLabel(x.status)}</Badge>
                {editBtn("film", x)}
                {delBtnAsk(x, `films/${x.id}`, x.title)}
              </Row>
            ))}
          </List>
        </>
      )}

      {/* ── STUDIO ── */}
      {tab === "studio" && (
        <>
          <Form>
            <input style={{ ...inp, flex: 2, minWidth: 130 }} placeholder="Nama studio" value={f("name")} onChange={set("name")} />
            <select style={{ ...inp, width: 116 }} value={f("studio_type") || "Regular"} onChange={set("studio_type")}>{STUDIO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <input style={{ ...inp, width: 78 }} type="number" placeholder="Baris" value={f("rows")} onChange={set("rows")} />
            <input style={{ ...inp, width: 78 }} type="number" placeholder="Kolom" value={f("cols")} onChange={set("cols")} />
            <input style={{ ...inp, flex: 1, minWidth: 100 }} placeholder="Outlet" value={f("outlet")} onChange={set("outlet")} />
            {btn("+ Tambah", () => add("studios", { name: f("name"), studio_type: f("studio_type") || "Regular", rows: f("rows") || 8, cols: f("cols") || 12, outlet: f("outlet") }))}
          </Form>
          <List empty={studios.length === 0} emptyText="Belum ada studio.">
            {studios.map(x => (
              <Row key={x.id}>
                <div style={{ flex: 2, minWidth: 130 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{x.name}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>🏪 {x.outlet || "—"} · {x.rows}×{x.cols}</div>
                </div>
                <Badge color="#a855f7">{x.studio_type}</Badge>
                <div style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#22d3ee", width: 86, textAlign: "right" }}>{x.capacity} kursi</div>
                <button onClick={() => setLayoutStudio(x)} style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc", borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🪑 Layout</button>
                {editBtn("studio", x)}
                {delBtnAsk(x, `studios/${x.id}`, x.name)}
              </Row>
            ))}
          </List>
        </>
      )}

      {/* ── SHOWTIME ── */}
      {tab === "showtime" && (
        <>
          <Form>
            <select style={{ ...inp, flex: 2, minWidth: 150 }} value={f("film_id")} onChange={set("film_id")}>
              <option value="">— Pilih film —</option>
              {films.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            <select style={{ ...inp, flex: 1, minWidth: 110 }} value={f("studio_id")} onChange={set("studio_id")}>
              <option value="">— Studio —</option>
              {studios.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <input style={{ ...inp, width: 130 }} type="date" value={f("show_date")} onChange={set("show_date")} />
            <input style={{ ...inp, width: 84 }} type="time" value={f("start_time")} onChange={set("start_time")} />
            <select style={{ ...inp, width: 78 }} value={f("format") || "2D"} onChange={set("format")} title="Format film">
              {FORMATS.map(fm => <option key={fm} value={fm}>{fm}</option>)}
            </select>
            <input style={{ ...inp, width: 96 }} type="number" placeholder="Harga" value={f("price")} onChange={set("price")} />
            {btn("+ Jadwalkan", () => add("showtimes", { film_id: f("film_id"), studio_id: f("studio_id"), show_date: f("show_date"), start_time: f("start_time"), format: f("format") || "2D", price: f("price") || 0 }))}
          </Form>

          {/* BULK MULTI-OUTLET PUSH */}
          {bulkOutlets.length > 0 && (
            <div style={{ marginTop: 10, padding: 14, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#c084fc", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🌐 PUSH KE BANYAK OUTLET SEKALIGUS</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Centang outlet target → backend auto-pilih studio yang tersedia per outlet</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setSelectedOutlets(new Set(bulkOutlets.map(o => o.code)))} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Semua</button>
                  <button onClick={() => setSelectedOutlets(new Set())} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e6edf3", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Kosongkan</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, marginBottom: 10 }}>
                {bulkOutlets.map(o => {
                  const sel = selectedOutlets.has(o.code);
                  return (
                    <label key={o.code} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: sel ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.02)", border: sel ? "1px solid rgba(168,85,247,0.5)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                      <input type="checkbox" checked={sel} onChange={(e) => {
                        setSelectedOutlets(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(o.code); else next.delete(o.code);
                          return next;
                        });
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#e6edf3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.name}</div>
                        <div style={{ fontSize: 10, color: "#7d8590", fontFamily: "'Geist Mono',monospace" }}>{o.code} · {o.area || "—"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  <b style={{ color: "#c084fc", fontFamily: "'Geist Mono',monospace" }}>{selectedOutlets.size}</b> outlet dicentang · pakai film+tanggal+jam+format+harga dari form atas
                </div>
                <button onClick={async () => {
                  if (selectedOutlets.size === 0) { setMsg("Centang minimal 1 outlet"); return; }
                  if (!f("film_id") || !f("show_date") || !f("start_time")) { setMsg("Film, tanggal, dan jam wajib diisi di form atas"); return; }
                  setBulkBusy(true); setMsg(""); setBulkResult(null);
                  try {
                    const r = await fetch(`${base}/showtimes/bulk`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        film_id: parseInt(f("film_id"), 10),
                        outlets: [...selectedOutlets],
                        show_date: f("show_date"),
                        start_time: f("start_time"),
                        format: f("format") || "2D",
                        price: parseInt(f("price"), 10) || 0,
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok || !d.ok) throw new Error(d.error || "Push gagal");
                    setBulkResult(d);
                    setSelectedOutlets(new Set());
                    reload();
                  } catch (e) { setMsg("⚠ " + e.message); }
                  setBulkBusy(false);
                }} disabled={bulkBusy || selectedOutlets.size === 0} style={{
                  background: selectedOutlets.size > 0 ? "linear-gradient(135deg,#a855f7,#c084fc)" : "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 8, padding: "9px 18px",
                  color: selectedOutlets.size > 0 ? "#fff" : "#5b6470",
                  fontSize: 12, fontWeight: 800, cursor: selectedOutlets.size > 0 ? "pointer" : "not-allowed", fontFamily: "inherit",
                  boxShadow: selectedOutlets.size > 0 ? "0 4px 12px rgba(168,85,247,0.3)" : "none",
                }}>{bulkBusy ? "⏳ Push..." : `🚀 PUSH KE ${selectedOutlets.size} OUTLET`}</button>
              </div>
              {bulkResult && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, fontSize: 12 }}>
                  <div style={{ color: "#10b981", fontWeight: 700 }}>✓ Sukses: {bulkResult.created.length} jadwal dibuat</div>
                  {bulkResult.skipped.length > 0 && (
                    <div style={{ color: "#eab308", marginTop: 4 }}>⚠ Skipped: {bulkResult.skipped.length} outlet ({bulkResult.skipped.map(s => s.outlet).join(", ")}) — {bulkResult.skipped[0]?.reason}</div>
                  )}
                </div>
              )}
            </div>
          )}
          <List empty={showtimes.length === 0} emptyText="Belum ada jadwal tayang.">
            {showtimes.map(x => {
              const ds = x.derived_status || "scheduled";
              const isClosedManual = !!x.manual_closed_at;
              const soldText = (x.sold_count != null && x.capacity != null) ? `${x.sold_count}/${x.capacity}` : "";
              return (
                <Row key={x.id}>
                  <div style={{ flex: 2, minWidth: 150 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{x.film_title || "—"}</div>
                    <div style={{ fontSize: 11, color: C.sub }}>{x.studio_name || "—"} · {x.studio_type || ""}{x.capacity ? ` · ${x.capacity} kursi` : ""}{soldText ? ` · ${soldText} terjual` : ""}</div>
                  </div>
                  <Badge color="#22d3ee">{x.show_date}</Badge>
                  <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, fontWeight: 700, width: 56 }}>{x.start_time}</div>
                  <Badge color="#a78bfa">{x.format || "2D"}</Badge>
                  <Badge color={DS_COLOR[ds] || "#5b6470"}>{DS_LABEL[ds] || ds}</Badge>
                  <div style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#10b981", width: 80, textAlign: "right" }}>{rp(x.price)}</div>
                  {isClosedManual
                    ? btn("🔓 Buka lagi", () => reopenShow(x.id), "#10b981")
                    : btn("🔒 Tutup", () => closeShow(x.id), "#f59e0b")}
                  {editBtn("showtime", x)}
                  {delBtnAsk(x, `showtimes/${x.id}`, `${x.film_title || ""} ${x.show_date} ${x.start_time}`)}
                </Row>
              );
            })}
          </List>
        </>
      )}

      {tab === "branding" && (
        <CdsBrandingPanel apiBase={apiBase} outlets={bulkOutlets} />
      )}

      {editing && editing.data && (
        <div onClick={() => { setEditing(null); setTmdbModal(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, width: 520, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#a855f7", marginBottom: 14, fontFamily: "'Geist Mono',monospace" }}>
              EDIT {(editing.type || "").toUpperCase()} #{editing.data.id ?? "new"}
            </div>

            {editing.type === "film" && (
              <div style={{ display: "grid", gap: 10 }}>
                <Field label="Judul">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ ...modalInp, flex: 1 }} value={editing.data.title || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })} />
                    <button onClick={async () => {
                      const q = editing.data.title?.trim();
                      if (!q) { setMsg("Isi judul dulu untuk lookup TMDB"); return; }
                      setTmdbModal({ query: q, loading: true, results: [] });
                      try {
                        const r = await fetch(`${base}/tmdb/search?q=${encodeURIComponent(q)}`);
                        const d = await r.json();
                        if (!d.ok) throw new Error(d.error || "Lookup gagal");
                        setTmdbModal({ query: q, loading: false, results: d.results || [] });
                      } catch (e) {
                        setTmdbModal({ query: q, loading: false, results: [], error: e.message });
                      }
                    }} style={{ background: "linear-gradient(135deg,#a855f7,#c084fc)", border: "none", color: "#fff", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>🎥 TMDB</button>
                  </div>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <Field label="Genre"><input style={modalInp} value={editing.data.genre || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, genre: e.target.value } })} /></Field>
                  <Field label="Durasi (mnt)"><input type="number" style={modalInp} value={editing.data.duration_min || 0} onChange={e => setEditing({ ...editing, data: { ...editing.data, duration_min: e.target.value } })} /></Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Rating">
                    <select style={modalInp} value={editing.data.rating || "SU"} onChange={e => setEditing({ ...editing, data: { ...editing.data, rating: e.target.value } })}>
                      {RATINGS.map(r => <option key={r} value={r}>{r} — {RATING_NAME[r] || r}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select style={modalInp} value={editing.data.status || "now_showing"} onChange={e => setEditing({ ...editing, data: { ...editing.data, status: e.target.value } })}>
                      {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Sinopsis"><textarea rows={3} style={{ ...modalInp, resize: "vertical" }} value={editing.data.synopsis || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, synopsis: e.target.value } })} /></Field>
                <Field label="Poster URL">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {editing.data.poster_url && <img src={editing.data.poster_url} alt="poster" style={{ width: 40, height: 60, objectFit: "cover", borderRadius: 4, border: "1px solid #30363d" }} />}
                    <input style={{ ...modalInp, flex: 1 }} placeholder="URL atau upload file" value={editing.data.poster_url || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, poster_url: e.target.value } })} />
                    <label style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", borderRadius: 7, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      📤 Upload
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const fd = new FormData(); fd.append("file", file);
                        setMsg("Uploading poster…");
                        try {
                          const r = await fetch(`${apiBase}/api/upload`, { method: "POST", body: fd });
                          const d = await r.json();
                          if (!d.ok) throw new Error(d.error || "Upload gagal");
                          setEditing(prev => prev ? { ...prev, data: { ...prev.data, poster_url: d.url } } : prev);
                          setMsg("✓ Poster di-upload");
                        } catch (err) { setMsg("⚠ " + err.message); }
                      }} />
                    </label>
                  </div>
                </Field>
                <Field label="Trailer URL (YouTube atau upload file)">
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ ...modalInp, flex: 1 }} placeholder="https://www.youtube.com/watch?v=... atau /uploads/trailer.mp4" value={editing.data.trailer_url || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, trailer_url: e.target.value } })} />
                    <label style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", borderRadius: 7, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      📤 Upload
                      <input type="file" accept="video/*" style={{ display: "none" }} onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const fd = new FormData(); fd.append("file", file);
                        setMsg(`Uploading trailer (${(file.size / 1024 / 1024).toFixed(1)}MB)…`);
                        try {
                          const r = await fetch(`${apiBase}/api/upload`, { method: "POST", body: fd });
                          const d = await r.json();
                          if (!d.ok) throw new Error(d.error || "Upload gagal");
                          setEditing(prev => prev ? { ...prev, data: { ...prev.data, trailer_url: d.url } } : prev);
                          setMsg("✓ Trailer di-upload");
                        } catch (err) { setMsg("⚠ " + err.message); }
                      }} />
                    </label>
                    {editing.data.trailer_url && <a href={editing.data.trailer_url} target="_blank" rel="noreferrer" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, textDecoration: "none", fontFamily: "inherit", whiteSpace: "nowrap" }}>▶ Test</a>}
                  </div>
                </Field>
              </div>
            )}

            {editing.type === "studio" && (
              <div style={{ display: "grid", gap: 10 }}>
                <Field label="Nama"><input style={modalInp} value={editing.data.name || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, name: e.target.value } })} /></Field>
                <Field label="Tipe">
                  <select style={modalInp} value={editing.data.studio_type || "Regular"} onChange={e => setEditing({ ...editing, data: { ...editing.data, studio_type: e.target.value } })}>
                    {STUDIO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Baris"><input type="number" style={modalInp} value={editing.data.rows || 0} onChange={e => setEditing({ ...editing, data: { ...editing.data, rows: e.target.value } })} /></Field>
                  <Field label="Kolom"><input type="number" style={modalInp} value={editing.data.cols || 0} onChange={e => setEditing({ ...editing, data: { ...editing.data, cols: e.target.value } })} /></Field>
                </div>
                <Field label="Outlet"><input style={modalInp} value={editing.data.outlet || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, outlet: e.target.value } })} /></Field>
              </div>
            )}

            {editing.type === "showtime" && (
              <div style={{ display: "grid", gap: 10 }}>
                <Field label="Film">
                  <select style={modalInp} value={editing.data.film_id || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, film_id: e.target.value } })}>
                    <option value="">— pilih film —</option>
                    {films.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
                  </select>
                </Field>
                <Field label="Studio">
                  <select style={modalInp} value={editing.data.studio_id || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, studio_id: e.target.value } })}>
                    <option value="">— pilih studio —</option>
                    {studios.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Tanggal"><input type="date" style={modalInp} value={editing.data.show_date || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, show_date: e.target.value } })} /></Field>
                  <Field label="Jam"><input type="time" style={modalInp} value={editing.data.start_time || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, start_time: e.target.value } })} /></Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Format">
                    <select style={modalInp} value={editing.data.format || "2D"} onChange={e => setEditing({ ...editing, data: { ...editing.data, format: e.target.value } })}>
                      {FORMATS.map(fm => <option key={fm} value={fm}>{fm}</option>)}
                    </select>
                  </Field>
                  <Field label="Harga"><input type="number" style={modalInp} value={editing.data.price || 0} onChange={e => setEditing({ ...editing, data: { ...editing.data, price: e.target.value } })} /></Field>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #30363d", color: "#9da7b3", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
              <button onClick={saveEdit} style={{ background: "#a855f7", border: "none", color: "#fff", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
      {layoutStudio && (
        <CinemaStudioLayoutEditor
          studio={layoutStudio}
          onClose={() => setLayoutStudio(null)}
          onSaved={() => {
            fetch(`${base}/studios`).then(r => r.json()).then(d => setStudios(d.studios || [])).catch(() => {});
            setMsg("✓ Layout studio tersimpan");
            setTimeout(() => setMsg(""), 2000);
          }}
        />
      )}

      {tmdbModal && (
        <div onClick={() => setTmdbModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "linear-gradient(160deg,#050810 0%,#0c0f1a 50%,#08090f 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto", color: "#e6edf3" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>🎥 Hasil TMDB</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>Query: "{tmdbModal.query}"</div>
              </div>
              <button onClick={() => setTmdbModal(null)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#e6edf3", padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            {tmdbModal.loading && <div style={{ padding: 30, textAlign: "center", color: "#9ca3af" }}>⏳ Mencari di TMDB...</div>}
            {tmdbModal.error && <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#fca5a5", fontSize: 13 }}>⚠ {tmdbModal.error}<br/><span style={{ fontSize: 11, opacity: 0.7 }}>Pastikan TMDB_API_KEY sudah di-set di server .env (free signup di themoviedb.org)</span></div>}
            {!tmdbModal.loading && !tmdbModal.error && tmdbModal.results.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "#9ca3af" }}>Tidak ada hasil</div>}
            <div style={{ display: "grid", gap: 8 }}>
              {tmdbModal.results.map(m => (
                <button key={m.tmdb_id} onClick={async () => {
                  // Fetch full detail dengan trailer
                  try {
                    const r = await fetch(`${base}/tmdb/movie/${m.tmdb_id}`);
                    const d = await r.json();
                    if (!d.ok) throw new Error(d.error);
                    setEditing(prev => {
                      const base = prev && prev.data ? prev.data : { id: null };
                      const data = {
                        ...base,
                        title: base.title || d.title,
                        synopsis: base.synopsis || d.overview || "",
                        duration_min: base.duration_min || d.runtime || 0,
                        genre: base.genre || d.genres || "",
                        poster_url: d.poster_url || base.poster_url,
                        trailer_url: d.trailer_url || base.trailer_url,
                      };
                      return prev ? { ...prev, data } : { type: "film", data };
                    });
                    setTmdbModal(null);
                  } catch (e) {
                    setTmdbModal({ ...tmdbModal, error: e.message });
                  }
                }} style={{ display: "flex", gap: 12, padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "#e6edf3" }}>
                  {m.poster_url ? <img src={m.poster_url} alt="" style={{ width: 56, height: 84, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} /> : <div style={{ width: 56, height: 84, background: "#1a1b1e", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🎬</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.2 }}>{m.title}</div>
                    {m.original_title !== m.title && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{m.original_title}</div>}
                    <div style={{ fontSize: 11, color: "#7d8590", marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{m.release_date || "—"} · ⭐ {m.vote_average?.toFixed(1) || "—"}</div>
                    <div style={{ fontSize: 11.5, color: "#9ca3af", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.overview || "—"}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 92 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}
function Form({ children }) {
  return <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 12 }}>{children}</div>;
}
function List({ children, empty, emptyText }) {
  if (empty) return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "24px 18px", textAlign: "center", color: C.sub, fontSize: 13 }}>{emptyText}</div>;
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "4px 14px" }}>{children}</div>;
}
function Row({ children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>{children}</div>;
}
function Badge({ children, color }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: color + "22", borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap" }}>{children}</span>;
}

// CdsBrandingPanel — Admin set background image untuk Cinema Customer Display (CDS)
// per-outlet (key: CINEMA_CDS_BG:OUTLET_CODE) atau default (key: CINEMA_CDS_BG_DEFAULT)
function CdsBrandingPanel({ apiBase, outlets }) {
  const [selectedOutlet, setSelectedOutlet] = useState("DEFAULT");
  const [bgUrl, setBgUrl] = useState("");
  const [idleText, setIdleText] = useState("");
  const [ticketBrand, setTicketBrand] = useState("");
  const [ticketFooter, setTicketFooter] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const cfgKey = selectedOutlet === "DEFAULT" ? "CINEMA_CDS_BG_DEFAULT" : `CINEMA_CDS_BG:${selectedOutlet}`;
  const idleKey = selectedOutlet === "DEFAULT" ? "CINEMA_CDS_IDLE_TEXT_DEFAULT" : `CINEMA_CDS_IDLE_TEXT:${selectedOutlet}`;
  const ticketBrandKey = selectedOutlet === "DEFAULT" ? "CINEMA_TICKET_BRAND_DEFAULT" : `CINEMA_TICKET_BRAND:${selectedOutlet}`;
  const ticketFooterKey = selectedOutlet === "DEFAULT" ? "CINEMA_TICKET_FOOTER_DEFAULT" : `CINEMA_TICKET_FOOTER:${selectedOutlet}`;

  // Load current value when outlet changes
  useEffect(() => {
    setLoading(true);
    const parseVal = (d) => {
      try { return typeof d?.value === "string" ? JSON.parse(d.value) : (d?.value || ""); } catch { return ""; }
    };
    Promise.all([
      fetch(`${apiBase}/api/pos/config/${encodeURIComponent(cfgKey)}`).then(r => r.json()).catch(() => ({})),
      fetch(`${apiBase}/api/pos/config/${encodeURIComponent(idleKey)}`).then(r => r.json()).catch(() => ({})),
      fetch(`${apiBase}/api/pos/config/${encodeURIComponent(ticketBrandKey)}`).then(r => r.json()).catch(() => ({})),
      fetch(`${apiBase}/api/pos/config/${encodeURIComponent(ticketFooterKey)}`).then(r => r.json()).catch(() => ({})),
    ]).then(([bg, txt, tb, tf]) => {
      setBgUrl(parseVal(bg));
      setIdleText(parseVal(txt));
      setTicketBrand(parseVal(tb));
      setTicketFooter(parseVal(tf));
    }).finally(() => setLoading(false));
  }, [apiBase, cfgKey, idleKey, ticketBrandKey, ticketFooterKey]);

  const saveConfig = async (key, value) => {
    try {
      const r = await fetch(`${apiBase}/api/pos/config/${encodeURIComponent(key)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(value) }),
      });
      if (!r.ok) {
        // Try POST kalau key belum ada
        await fetch(`${apiBase}/api/pos/config`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: JSON.stringify(value), type: "string", category: "cinema_branding" }),
        });
      }
    } catch (e) { throw e; }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(`Uploading ${(file.size / 1024 / 1024).toFixed(1)}MB...`);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`${apiBase}/api/upload`, { method: "POST", body: fd });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "Upload gagal");
      setBgUrl(d.url);
      await saveConfig(cfgKey, d.url);
      setMsg("✓ Background tersimpan");
    } catch (err) { setMsg("⚠ " + err.message); }
  };

  const handleSaveText = async () => {
    setMsg("Menyimpan...");
    try { await saveConfig(idleKey, idleText); setMsg("✓ Idle text tersimpan"); }
    catch (e) { setMsg("⚠ " + e.message); }
  };

  const clearBg = async () => {
    if (!confirm("Hapus background image?")) return;
    setBgUrl("");
    await saveConfig(cfgKey, "");
    setMsg("✓ Background dihapus");
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: -0.2 }}>🎨 Cinema CDS Branding</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Custom background image + idle message untuk layar second display per outlet</div>
        </div>
        <select value={selectedOutlet} onChange={e => setSelectedOutlet(e.target.value)}
          style={{ background: "#0a0e16", border: "1px solid #30363d", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
          <option value="DEFAULT">🌐 Default (fallback semua outlet)</option>
          {outlets?.map(o => <option key={o.code} value={o.code}>{o.code} · {o.name}</option>)}
        </select>
      </div>

      {/* Preview */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontFamily: "Geist Mono,monospace", letterSpacing: 1.5, fontWeight: 700 }}>PREVIEW {selectedOutlet === "DEFAULT" ? "DEFAULT" : selectedOutlet}</div>
        <div style={{
          width: "100%", aspectRatio: "16/9", maxHeight: 320,
          background: bgUrl ? `url(${bgUrl}) center/cover` : "linear-gradient(160deg,#050810,#0c0f1a)",
          borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
          position: "relative", overflow: "hidden",
        }}>
          {bgUrl && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.2), rgba(5,8,16,0.6))" }} />}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>🎬</div>
            <div style={{ fontSize: 12, color: "#c084fc", letterSpacing: 3, fontFamily: "Geist Mono,monospace", fontWeight: 800 }}>karyaOS CINEMA</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>Selamat Datang</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{idleText || "Silakan pilih film & jadwal di counter"}</div>
          </div>
        </div>
      </div>

      {/* Background controls */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          📤 Upload Background Image
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
        </label>
        <input type="text" value={bgUrl} onChange={e => setBgUrl(e.target.value)}
          onBlur={() => saveConfig(cfgKey, bgUrl)}
          placeholder="atau paste URL https://..." style={{ ...inp, flex: 1, minWidth: 240 }} />
        {bgUrl && <button onClick={clearBg} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5", borderRadius: 7, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Hapus</button>}
      </div>

      {/* Idle message */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontFamily: "Geist Mono,monospace", letterSpacing: 1.5, fontWeight: 700 }}>IDLE MESSAGE (Optional)</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" value={idleText} onChange={e => setIdleText(e.target.value)}
            placeholder="mis: Selamat menonton di Cinema XXI Jakarta!"
            style={{ ...inp, flex: 1 }} />
          <button onClick={handleSaveText} style={{ background: "#a855f7", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 Save</button>
        </div>
      </div>

      {/* TICKET PRINT BRANDING */}
      <div style={{ marginBottom: 14, padding: 14, background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10 }}>
        <div style={{ fontSize: 12, color: "#22d3ee", letterSpacing: 1.5, fontFamily: "Geist Mono,monospace", fontWeight: 800, marginBottom: 10 }}>🎟️ BRANDING TIKET PRINT</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>HEADER BRAND (default: "🎬 karyaOS CINEMA")</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={ticketBrand} onChange={e => setTicketBrand(e.target.value)}
                placeholder="🎬 karyaOS CINEMA · Jakarta Central"
                style={{ ...inp, flex: 1 }} />
              <button onClick={async () => { try { await saveConfig(ticketBrandKey, ticketBrand); setMsg("✓ Header brand tersimpan"); } catch (e) { setMsg("⚠ " + e.message); } }} style={{ background: "#22d3ee", border: "none", color: "#04303a", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>FOOTER TEXT (default: "Tunjukkan QR di pintu masuk studio")</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={ticketFooter} onChange={e => setTicketFooter(e.target.value)}
                placeholder="Datang 15 menit sebelum jam tayang · No refund"
                style={{ ...inp, flex: 1 }} />
              <button onClick={async () => { try { await saveConfig(ticketFooterKey, ticketFooter); setMsg("✓ Footer tersimpan"); } catch (e) { setMsg("⚠ " + e.message); } }} style={{ background: "#22d3ee", border: "none", color: "#04303a", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾</button>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.sub, marginTop: 8 }}>💡 Pakai outlet-specific atau DEFAULT untuk fallback semua outlet. Emoji support 🎬🍿✨</div>
      </div>

      {msg && <div style={{ padding: "8px 12px", background: msg.startsWith("✓") ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.startsWith("✓") ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#fca5a5" }}>{msg}</div>}

      <div style={{ marginTop: 14, padding: 10, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
        💡 <b>Tips:</b> Background ideal 1920×1080 (Full HD) atau 16:9 ratio. CDS akan apply overlay gradient gelap di atas image agar text tetap readable. Default fallback: gradient dark blue/purple.
      </div>
    </div>
  );
}

