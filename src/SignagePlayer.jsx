// SignagePlayer — fullscreen digital signage player per device.
// URL: ?signage&device=TV-CMX-JKT01-LOBBY
// Render rotation: image/poster/showtime grid/bundles/trailers/menu/promo.
// Heartbeat: fetch /api/signage/player/:device_id setiap refresh_sec (default 60s).

import { useEffect, useState, useRef } from "react";
import API_HOST from "./apiBase.js";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function SignagePlayer() {
  const [items, setItems] = useState([]);
  const [device, setDevice] = useState(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState(null);
  const [refreshSec, setRefreshSec] = useState(60);
  const timerRef = useRef(null);

  const deviceId = (() => {
    try { return new URLSearchParams(window.location.search).get("device") || ""; }
    catch { return ""; }
  })();

  useEffect(() => {
    if (!deviceId) { setErr("Device ID belum di-set di URL"); return; }
    const load = () => {
      fetch(`${API_HOST}/api/signage/player/${encodeURIComponent(deviceId)}`)
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
        .then(d => {
          setItems(d.items || []);
          setDevice(d.device || null);
          setRefreshSec(d.refresh_sec || 60);
          setErr(null);
        })
        .catch(e => setErr(e.error || "Gagal memuat playlist"));
    };
    load();
    const refresh = setInterval(load, (refreshSec || 60) * 1000);
    return () => clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  // Rotation timer — advance ke item berikutnya per duration_sec
  useEffect(() => {
    if (!items.length) return;
    const dur = items[idx]?.duration_sec || 10;
    timerRef.current = setTimeout(() => setIdx(i => (i + 1) % items.length), dur * 1000);
    return () => clearTimeout(timerRef.current);
  }, [idx, items]);

  // Fullscreen + hide cursor
  useEffect(() => {
    document.body.style.cursor = "none";
    document.body.style.overflow = "hidden";
    return () => { document.body.style.cursor = ""; document.body.style.overflow = ""; };
  }, []);

  if (err) {
    return (
      <div style={S.errRoot}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>📺</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fca5a5" }}>{err}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 12, fontFamily: "'Geist Mono',monospace" }}>
          Device ID: {deviceId || "(kosong)"}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
          URL example: <code>?signage&device=TV-CMX-JKT01-LOBBY</code>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div style={S.errRoot}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>⏳</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Memuat playlist…</div>
      </div>
    );
  }

  const item = items[idx];

  return (
    <div style={S.root}>
      {/* Tiny device badge bottom-right */}
      <div style={S.deviceBadge}>
        {device?.zone || "—"} · {device?.outlet || "—"} · {idx + 1}/{items.length}
      </div>

      {/* Content renderer per type */}
      <div style={S.canvas}>
        {item.type === "film_poster" && <FilmPoster data={item.data} />}
        {item.type === "showtimes_today" && <ShowtimesToday data={item.data} />}
        {item.type === "fnb_combo" && <FnbCombo data={item.data} />}
        {item.type === "studio_now_next" && <StudioNowNext data={item.data} />}
        {item.type === "trailer" && <Trailer data={item.data} />}
        {item.type === "fnb_menu_grid" && <FnbMenuGrid data={item.data} />}
        {item.type === "fnb_promo_carousel" && <FnbPromoCarousel apiBase={API_HOST} data={item.data} />}
        {item.type === "fnb_dining" && <FnbDining data={item.data} />}
        {item.type === "fnb_pickup_queue" && <FnbPickupQueue data={item.data} />}
        {item.type === "fnb_window" && <FnbWindow data={item.data} />}
        {item.type === "idle" && <Idle data={item.data} />}
      </div>

      {/* Progress bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 4, background: "rgba(0,0,0,0.4)" }}>
        <div style={{
          height: "100%", background: "linear-gradient(90deg,#a855f7,#fbbf24)",
          width: `${((idx + 1) / items.length) * 100}%`,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Content type components
// ───────────────────────────────────────────────────────────

function FilmPoster({ data }) {
  return (
    <div style={{ display: "flex", height: "100%", gap: 40, padding: 40, alignItems: "center" }}>
      {data.poster_url ? (
        <img src={data.poster_url} style={{ height: "85vh", borderRadius: 14, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }} />
      ) : (
        <div style={{ height: "85vh", aspectRatio: "2/3", background: "linear-gradient(135deg,#1e1b4b,#0a0e16)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 120 }}>🎬</div>
      )}
      <div style={{ flex: 1, color: "#fff" }}>
        <div style={{
          fontSize: 12, color: "#fbbf24", letterSpacing: 4, fontFamily: "'Geist Mono',monospace",
          fontWeight: 800, textTransform: "uppercase", marginBottom: 18,
        }}>
          {data.status === "now_showing" ? "✨ NOW SHOWING" : "🎬 COMING SOON"}
        </div>
        <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: -2, lineHeight: 1.05, marginBottom: 16 }}>{data.title}</div>
        <div style={{ display: "flex", gap: 14, marginBottom: 24, alignItems: "center" }}>
          <span style={{ fontSize: 18, padding: "6px 16px", border: "2px solid #fbbf24", color: "#fbbf24", borderRadius: 10, fontWeight: 800 }}>{data.rating || "SU"}</span>
          <span style={{ fontSize: 20, color: "rgba(255,255,255,0.7)" }}>{data.genre || ""} · {data.duration_min || 0} min</span>
        </div>
      </div>
    </div>
  );
}

function ShowtimesToday({ data }) {
  const grouped = {};
  for (const s of (data.shows || [])) {
    if (!grouped[s.film_title]) grouped[s.film_title] = { film: s, times: [] };
    grouped[s.film_title].times.push({ start_time: s.start_time, studio: s.studio_name, type: s.studio_type, price: s.price, format: s.format });
  }
  return (
    <div style={{ padding: 50, height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 16, color: "#fbbf24", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", marginBottom: 24 }}>🎟️ JADWAL HARI INI · {data.outlet}</div>
      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(420px,1fr))", gap: 20 }}>
        {Object.values(grouped).map(g => (
          <div key={g.film.film_title} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, display: "flex", gap: 16 }}>
            {g.film.poster_url && <img src={g.film.poster_url} style={{ width: 100, height: 150, objectFit: "cover", borderRadius: 8 }} />}
            <div style={{ flex: 1, color: "#fff" }}>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{g.film.film_title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>{g.film.rating}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {g.times.slice(0, 6).map(t => (
                  <div key={`${t.start_time}-${t.studio}`} style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.4)", padding: "8px 12px", borderRadius: 8, fontFamily: "'Geist Mono',monospace", fontSize: 18, fontWeight: 800 }}>
                    {t.start_time}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{t.studio} · {rp(t.price)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FnbCombo({ data }) {
  return (
    <div style={{ display: "flex", height: "100%", alignItems: "center", gap: 50, padding: 60 }}>
      {data.image_url ? (
        <img src={data.image_url} style={{ width: "45%", maxHeight: "75vh", objectFit: "cover", borderRadius: 20, boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }} />
      ) : (
        <div style={{ width: "45%", height: 500, background: "linear-gradient(135deg,#f59e0b,#fb923c)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 200 }}>🍿</div>
      )}
      <div style={{ flex: 1, color: "#fff" }}>
        <div style={{ fontSize: 14, color: "#fbbf24", letterSpacing: 5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 20 }}>🍿 F&B COMBO</div>
        <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.05, marginBottom: 18 }}>{data.name}</div>
        {data.description && <div style={{ fontSize: 24, color: "rgba(255,255,255,0.65)", marginBottom: 30, lineHeight: 1.4 }}>{data.description}</div>}
        <div style={{ fontSize: 56, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{rp(data.price)}</div>
      </div>
    </div>
  );
}

function StudioNowNext({ data }) {
  const next = data.upcoming?.[0];
  return (
    <div style={{ padding: 60, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 16, color: "#fbbf24", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", marginBottom: 30 }}>🚪 NEXT SHOW · {data.outlet}</div>
      {next ? (
        <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
          {next.poster_url && <img src={next.poster_url} style={{ height: "70vh", borderRadius: 14 }} />}
          <div style={{ flex: 1, color: "#fff" }}>
            <div style={{ fontSize: 80, fontWeight: 900, marginBottom: 16, letterSpacing: -2, lineHeight: 1.05 }}>{next.film_title}</div>
            <div style={{ fontSize: 30, color: "rgba(255,255,255,0.65)", marginBottom: 24 }}>{next.studio_name} · {next.studio_type} · {next.format}</div>
            <div style={{ fontSize: 100, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{next.start_time}</div>
          </div>
        </div>
      ) : <div style={{ fontSize: 32, color: "rgba(255,255,255,0.55)" }}>Tidak ada jadwal mendatang</div>}
    </div>
  );
}

function Trailer({ data }) {
  // Embed YouTube trailer (autoplay muted)
  const ytId = (() => {
    if (!data.trailer_url) return null;
    const m = data.trailer_url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  })();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {ytId ? (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&showinfo=0&modestbranding=1`}
          allow="autoplay; encrypted-media" style={{ flex: 1, border: "none" }}
        />
      ) : data.poster_url ? (
        <img src={data.poster_url} style={{ flex: 1, objectFit: "cover", width: "100%" }} />
      ) : null}
      <div style={{ padding: "16px 30px", background: "rgba(0,0,0,0.7)", color: "#fff" }}>
        <div style={{ fontSize: 36, fontWeight: 900 }}>{data.title}</div>
        <div style={{ fontSize: 14, color: "#fbbf24", marginTop: 4 }}>{data.status === "coming_soon" ? "🎬 COMING SOON" : "✨ NOW SHOWING"} · {data.rating || ""}</div>
      </div>
    </div>
  );
}

function FnbMenuGrid({ data }) {
  return (
    <div style={{ padding: 50, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", color: "#fff" }}>
      <div style={{ fontSize: 14, color: "#f97316", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", marginBottom: 20 }}>🍔 MENU BOARD · {data.outlet}</div>
      <div style={{ fontSize: 80, fontWeight: 900 }}>Menu F&B</div>
      <div style={{ fontSize: 22, color: "rgba(255,255,255,0.55)", marginTop: 16 }}>Menu items akan tampil dari MenuContext frontend</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginTop: 30, fontFamily: "'Geist Mono',monospace" }}>(MVP: render placeholder — integrate dengan MenuContext untuk live data)</div>
    </div>
  );
}

function FnbPromoCarousel({ apiBase, data }) {
  const [promos, setPromos] = useState([]);
  useEffect(() => {
    fetch(`${apiBase}/api/promos`).then(r => r.json()).then(arr => {
      const list = Array.isArray(arr) ? arr : (arr?.promos || []);
      setPromos(list.filter(p => p.active).slice(0, 6));
    }).catch(() => {});
  }, [apiBase]);
  const [pi, setPi] = useState(0);
  useEffect(() => { if (promos.length < 2) return; const t = setTimeout(() => setPi(p => (p + 1) % promos.length), 4000); return () => clearTimeout(t); }, [pi, promos]);
  const p = promos[pi];
  if (!p) return <Idle data={{ brand: "F&B", message: "Belum ada promo aktif" }} />;
  const valLabel = p.type === "percentage" ? `${p.value}% OFF` : p.type === "fixed" ? `${rp(p.value)} OFF` : p.type === "bogo" ? "BUY 1 GET 1" : "";
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#fff", padding: 60, textAlign: "center", background: "linear-gradient(135deg,rgba(249,115,22,0.18),rgba(245,158,11,0.18))" }}>
      <div style={{ fontSize: 14, color: "#fbbf24", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", marginBottom: 30 }}>🎁 PROMO HARI INI</div>
      <div style={{ fontSize: 180, fontWeight: 900, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", lineHeight: 1, letterSpacing: -4 }}>{valLabel}</div>
      <div style={{ fontSize: 50, fontWeight: 800, marginTop: 30, letterSpacing: -1 }}>{p.desc || p.code}</div>
      <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)", marginTop: 16, fontFamily: "'Geist Mono',monospace", letterSpacing: 3 }}>kode: <b style={{ color: "#fbbf24" }}>{p.code}</b></div>
    </div>
  );
}

function FnbDining({ data }) {
  return (
    <div style={{ padding: 60, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#fff", textAlign: "center" }}>
      <div style={{ fontSize: 200, marginBottom: 30 }}>🍦</div>
      <div style={{ fontSize: 100, fontWeight: 900, letterSpacing: -2 }}>Karya Bites</div>
      <div style={{ fontSize: 26, color: "rgba(255,255,255,0.65)", marginTop: 16, maxWidth: 700, lineHeight: 1.4 }}>Dari hati ke hati. Setiap menu kami buat dengan bahan terbaik untuk pelanggan tercinta.</div>
    </div>
  );
}

function FnbPickupQueue({ data }) {
  const ready = data.ready_orders || [];
  return (
    <div style={{ padding: 60, height: "100%", display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ fontSize: 16, color: "#10b981", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", marginBottom: 24 }}>🛒 SIAP DIAMBIL · {data.outlet}</div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, alignContent: "start" }}>
        {ready.length === 0 ? (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "rgba(255,255,255,0.5)", fontSize: 32 }}>No orders siap saat ini</div>
        ) : ready.map(o => (
          <div key={o.id} style={{ background: "rgba(16,185,129,0.15)", border: "2px solid rgba(16,185,129,0.45)", borderRadius: 18, padding: 30, textAlign: "center" }}>
            <div style={{ fontSize: 18, color: "#10b981", letterSpacing: 3, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>ORDER</div>
            <div style={{ fontSize: 80, fontWeight: 900, color: "#10b981", fontFamily: "'Geist Mono',monospace", lineHeight: 1 }}>#{o.id}</div>
            {o.customer_name && <div style={{ fontSize: 26, color: "rgba(255,255,255,0.85)", marginTop: 14, fontWeight: 700 }}>{o.customer_name}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FnbWindow({ data }) {
  return (
    <div style={{ padding: 60, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#fff", textAlign: "center", background: "linear-gradient(135deg,rgba(249,115,22,0.15),rgba(168,85,247,0.15))" }}>
      <div style={{ fontSize: 220, marginBottom: 30, filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.5))" }}>🍦</div>
      <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: -3, marginBottom: 16 }}>Karya Bites</div>
      <div style={{ fontSize: 38, color: "rgba(255,255,255,0.8)", maxWidth: 800 }}>Yuk mampir! Menu terbaru, promo terbaik.</div>
    </div>
  );
}

function Idle({ data }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#fff", textAlign: "center" }}>
      <div style={{ fontSize: 200, marginBottom: 30 }}>📺</div>
      <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -2 }}>{data.brand || "karyaOS"}</div>
      <div style={{ fontSize: 30, color: "rgba(255,255,255,0.55)", marginTop: 16 }}>{data.message || "Selamat datang"}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────
const S = {
  root: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg,#08090f 0%,#11131c 50%,#1a1d29 100%)",
    color: "#fff", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    overflow: "hidden",
  },
  canvas: { position: "absolute", inset: 0 },
  errRoot: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg,#08090f 0%,#11131c 100%)",
    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
    fontFamily: "'Inter',sans-serif", textAlign: "center", padding: 40,
  },
  deviceBadge: {
    position: "fixed", bottom: 10, right: 14, zIndex: 100,
    background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.55)", padding: "4px 12px", borderRadius: 999,
    fontSize: 10, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5,
    backdropFilter: "blur(8px)",
  },
};
