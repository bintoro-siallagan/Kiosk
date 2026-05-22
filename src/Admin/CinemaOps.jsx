import { useState, useEffect } from "react";

// Cinema Operations — manage films, studios/screens and showtimes.
// karyaOS cinema vertical (admin side). Talks to /api/cinema/*.
const C = { card: "#0d1117", border: "#1b212c", sub: "#7d8590", dim: "#5b6470" };
const inp = { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "7px 9px", color: "#fff", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box", outline: "none" };
const RATINGS = ["SU", "13+", "17+", "21+"];
const STATUSES = [["now_showing", "Tayang"], ["coming_soon", "Segera"], ["archived", "Arsip"]];
const STUDIO_TYPES = ["Regular", "IMAX", "Premiere"];
const TABS = [["film", "🎬 Film"], ["studio", "🏛️ Studio"], ["showtime", "🗓️ Jadwal Tayang"]];
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const statusLabel = (s) => (STATUSES.find(x => x[0] === s) || [s, s])[1];
const statusColor = (s) => s === "now_showing" ? "#10b981" : s === "coming_soon" ? "#eab308" : "#5b6470";

export default function CinemaOps({ apiBase }) {
  const [tab, setTab] = useState("film");
  const [films, setFilms] = useState([]);
  const [studios, setStudios] = useState([]);
  const [showtimes, setShowtimes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");

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

  const btn = (label, onClick, color = "#a855f7") => (
    <button onClick={onClick} style={{ background: color + "1f", border: `1px solid ${color}55`, borderRadius: 7, padding: "7px 14px", color, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{label}</button>
  );
  const delBtn = (path) => (
    <button onClick={() => del(path)} title="Hapus" style={{ background: "transparent", border: "1px solid #ef444444", borderRadius: 6, padding: "4px 9px", color: "#ef4444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
  );

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#e6edf3" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🎬 Cinema Operations</div>
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
            {btn("+ Tambah", () => add("films", { title: f("title"), genre: f("genre"), duration_min: f("duration_min"), rating: f("rating") || "SU", status: f("status") || "now_showing" }))}
          </Form>
          <List empty={films.length === 0} emptyText="Belum ada film.">
            {films.map(x => (
              <Row key={x.id}>
                <div style={{ flex: 2, minWidth: 150 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{x.title}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{x.genre || "—"} · {x.duration_min || 0} mnt</div>
                </div>
                <Badge color="#6366f1">{x.rating}</Badge>
                <Badge color={statusColor(x.status)}>{statusLabel(x.status)}</Badge>
                {delBtn(`films/${x.id}`)}
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
                <div style={{ fontSize: 12, fontFamily: "'Space Mono',monospace", color: "#22d3ee", width: 86, textAlign: "right" }}>{x.capacity} kursi</div>
                {delBtn(`studios/${x.id}`)}
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
            <input style={{ ...inp, width: 96 }} type="number" placeholder="Harga" value={f("price")} onChange={set("price")} />
            {btn("+ Jadwalkan", () => add("showtimes", { film_id: f("film_id"), studio_id: f("studio_id"), show_date: f("show_date"), start_time: f("start_time"), price: f("price") || 0 }))}
          </Form>
          <List empty={showtimes.length === 0} emptyText="Belum ada jadwal tayang.">
            {showtimes.map(x => (
              <Row key={x.id}>
                <div style={{ flex: 2, minWidth: 150 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{x.film_title || "—"}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{x.studio_name || "—"} · {x.studio_type || ""}{x.capacity ? ` · ${x.capacity} kursi` : ""}</div>
                </div>
                <Badge color="#22d3ee">{x.show_date}</Badge>
                <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, width: 56 }}>{x.start_time}</div>
                <div style={{ fontSize: 12, fontFamily: "'Space Mono',monospace", color: "#10b981", width: 96, textAlign: "right" }}>{rp(x.price)}</div>
                {delBtn(`showtimes/${x.id}`)}
              </Row>
            ))}
          </List>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 92 }}>
      <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 19, fontWeight: 700, color }}>{value}</div>
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
