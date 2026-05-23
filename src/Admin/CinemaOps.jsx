import { useState, useEffect } from "react";
import { useUiKit } from "../components/uiKit.jsx";

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
const TABS = [["film", "🎬 Film"], ["studio", "🏛️ Studio"], ["showtime", "🗓️ Jadwal Tayang"]];
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const statusLabel = (s) => (STATUSES.find(x => x[0] === s) || [s, s])[1];
const statusColor = (s) => s === "now_showing" ? "#10b981" : s === "coming_soon" ? "#eab308" : "#5b6470";
// Derived showtime status (computed from time + sold + manual_closed_at)
const DS_LABEL = { scheduled: "Terjadwal", running: "Berlangsung", closed: "Tutup", sold_out: "Sold Out", cancelled: "Batal" };
const DS_COLOR = { scheduled: "#10b981", running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };

export default function CinemaOps({ apiBase }) {
  const { confirm } = useUiKit();
  const [tab, setTab] = useState("film");
  const [films, setFilms] = useState([]);
  const [studios, setStudios] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); // { type:'film'|'studio'|'showtime', data:{} }

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

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, width: 520, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#a855f7", marginBottom: 14, fontFamily: "'Geist Mono',monospace" }}>
              EDIT {editing.type.toUpperCase()} #{editing.data.id}
            </div>

            {editing.type === "film" && (
              <div style={{ display: "grid", gap: 10 }}>
                <Field label="Judul"><input style={modalInp} value={editing.data.title || ""} onChange={e => setEditing({ ...editing, data: { ...editing.data, title: e.target.value } })} /></Field>
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
