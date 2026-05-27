// karyaOS — Cinema Refund / Void center
// Manager-only: pilih jadwal → void tiket terjual (kursi otomatis kembali ke peta).
// Audit lengkap di cinema_ticket_voids (alasan, oleh, kapan).
import { useState, useEffect, useCallback, useMemo } from "react";
import { requireManagerPin } from "../components/ManagerPinGate.jsx";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";

const PERIODS = [
  { id: "today",     label: "Hari ini" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week",      label: "7 day" },
  { id: "month",     label: "30 day" },
];

function periodRange(p) {
  const today = new Date(); today.setHours(0,0,0,0);
  const ymd = (d) => d.toISOString().slice(0, 10);
  if (p === "today")     return { from: ymd(today),                                   to: ymd(today) };
  if (p === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: ymd(y), to: ymd(y) };
  }
  if (p === "week") {
    const f = new Date(today); f.setDate(f.getDate() - 6);
    return { from: ymd(f), to: ymd(today) };
  }
  const f = new Date(today); f.setDate(f.getDate() - 29);
  return { from: ymd(f), to: ymd(today) };
}

export default function CinemaRefund({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [showtimes, setShowtimes] = useState([]);
  const [picked, setPicked]       = useState("");
  const [tickets, setTickets]     = useState([]);
  const [loadingT, setLoadingT]   = useState(false);
  const [period, setPeriod]       = useState("today");
  const [voids, setVoids]         = useState({ rows: [], summary: { count: 0, refunded: 0 } });
  const [toast, setToast]         = useState(null);

  const showToast = (m, kind = "ok") => { setToast({ m, kind }); setTimeout(() => setToast(null), 2600); };

  // Load showtimes (recent first) — reuse the box-office aggregated list
  const loadShowtimes = useCallback(async () => {
    try {
      const r = await fetch(`${base}/box-office`);
      const d = await r.json();
      const list = (d.showtimes || []).filter(s => s.sold > 0);
      setShowtimes(list);
      if (!picked && list.length) setPicked(String(list[0].id));
    } catch (e) { /* swallow */ }
  }, [base, picked]);

  const loadTickets = useCallback(async () => {
    if (!picked) { setTickets([]); return; }
    setLoadingT(true);
    try {
      const r = await fetch(`${base}/tickets?showtime=${picked}`);
      const d = await r.json();
      setTickets(d.tickets || []);
    } catch (e) { setTickets([]); }
    setLoadingT(false);
  }, [base, picked]);

  const loadVoids = useCallback(async () => {
    const { from, to } = periodRange(period);
    try {
      const r = await fetch(`${base}/voids?from=${from}&to=${to}`);
      const d = await r.json();
      setVoids({ rows: d.rows || [], summary: d.summary || { count: 0, refunded: 0 } });
    } catch (e) { setVoids({ rows: [], summary: { count: 0, refunded: 0 } }); }
  }, [base, period]);

  useEffect(() => { loadShowtimes(); }, [loadShowtimes]);
  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { loadVoids(); }, [loadVoids]);

  const pickedMeta = useMemo(() => showtimes.find(s => String(s.id) === String(picked)), [showtimes, picked]);

  async function postVoid(t, reason, auth, allowUsed = false) {
    const r = await fetch(`${base}/tickets/${t.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        manager_id:   auth.manager_id,
        manager_name: auth.manager_name,
        allow_used:   allowUsed,
      }),
    });
    return r.json();
  }

  async function voidTicket(t) {
    const auth = await requireManagerPin({
      title: `Void tiket ${t.code || ""} · kursi ${t.seat}`,
      message: `${t.film_title || "Film"} — ${t.show_date || ""} ${t.start_time || ""} · ${rp(t.price)}`,
      requireReason: true,
    });
    if (!auth.ok) return;
    let d = await postVoid(t, auth.reason, auth, false);
    if (d.used) {
      const ok = window.confirm("Tiket ini sudah di-check-in. Tetap lanjut void?");
      if (!ok) return;
      d = await postVoid(t, auth.reason, auth, true);
    }
    if (!d.ok) { showToast(d.error || "Gagal void", "err"); return; }
    showToast(`Tiket ${t.code || t.seat} di-void · ${rp(t.price)} refund`);
    loadTickets(); loadVoids(); loadShowtimes();
  }

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 19, fontWeight: 700, letterSpacing: 1 }}>🔁 Refund / Void Tiket</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>karyaOS · vertikal cinema — manager-only, audit lengkap (alasan + oleh).</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Stat label={`Void · ${PERIODS.find(p=>p.id===period)?.label}`} value={voids.summary.count} color="#ef4444" />
          <Stat label="Total refund" value={rp(voids.summary.refunded)} color="#f59e0b" />
        </div>
      </div>

      {/* Picker — jadwal aktif */}
      <div style={S.section}>
        <div style={S.h}>JADWAL DENGAN TIKET TERJUAL</div>
        {showtimes.length === 0 ? (
          <div style={S.empty}>No tickets terjual.</div>
        ) : (
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            style={S.select}
          >
            {showtimes.map(s => (
              <option key={s.id} value={s.id}>
                {s.film_title || "—"} · {s.studio_name || "—"} · {s.show_date} {s.start_time} · {s.sold}/{s.capacity} terjual
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tickets list */}
      <div style={S.section}>
        <div style={S.h}>
          TIKET AKTIF {pickedMeta ? `· ${pickedMeta.film_title} · ${pickedMeta.show_date} ${pickedMeta.start_time}` : ""}
        </div>
        {loadingT ? <LoadingState label="Memuat…" /> :
         tickets.length === 0 ? <div style={S.empty}>None tiket aktif.</div> : (
          <div style={S.card}>
            <div style={{ ...S.row, color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 130 }}>KODE</span>
              <span style={{ width: 60 }}>KURSI</span>
              <span style={{ flex: 1 }}>PEMBELI</span>
              <span style={{ width: 90 }}>STATUS</span>
              <span style={{ width: 130 }}>DIJUAL</span>
              <span style={{ width: 100, textAlign: "right" }}>HARGA</span>
              <span style={{ width: 70 }}></span>
            </div>
            {tickets.map(t => {
              const used = !!t.checked_in_at;
              return (
                <div key={t.id} style={{ ...S.row, padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#a3a3a3", letterSpacing: 1 }}>{t.code || "—"}</span>
                  <span style={{ width: 60, fontWeight: 700, fontSize: 13 }}>{t.seat}</span>
                  <span style={{ flex: 1, fontSize: 13, color: C.sub }}>{t.buyer || "—"}</span>
                  <span style={{ width: 90 }}>
                    {used
                      ? <span style={S.pill("#f59e0b")}>checked-in</span>
                      : <span style={S.pill("#10b981")}>sold</span>}
                  </span>
                  <span style={{ width: 130, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(t.sold_at)}</span>
                  <span style={{ width: 100, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#10b981" }}>{rp(t.price)}</span>
                  <span style={{ width: 70, textAlign: "right" }}>
                    <button onClick={() => voidTicket(t)} style={S.btnDanger}>Void</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Void history */}
      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={S.h}>RIWAYAT VOID</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)} style={S.periodBtn(period === p.id)}>{p.label}</button>
            ))}
          </div>
        </div>
        {voids.rows.length === 0 ? <div style={S.empty}>None void di periode ini.</div> : (
          <div style={S.card}>
            <div style={{ ...S.row, color: C.dim, fontSize: 11, letterSpacing: 1, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ width: 130 }}>KODE</span>
              <span style={{ width: 56 }}>KURSI</span>
              <span style={{ flex: 1.4 }}>FILM · JADWAL</span>
              <span style={{ flex: 1.2 }}>ALASAN</span>
              <span style={{ width: 110 }}>OLEH</span>
              <span style={{ width: 130 }}>DI-VOID</span>
              <span style={{ width: 100, textAlign: "right" }}>REFUND</span>
            </div>
            {voids.rows.map(v => (
              <div key={v.id} style={{ ...S.row, padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ width: 130, fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#a3a3a3", letterSpacing: 1 }}>{v.code || "—"}</span>
                <span style={{ width: 56, fontWeight: 700, fontSize: 13 }}>{v.seat}</span>
                <span style={{ flex: 1.4, fontSize: 12.5 }}>
                  <div style={{ fontWeight: 600 }}>{v.film_title || "—"}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{v.studio_name || "—"} · {v.show_date} {v.start_time}</div>
                </span>
                <span style={{ flex: 1.2, fontSize: 12.5, color: C.sub }}>{v.void_reason || "—"}</span>
                <span style={{ width: 110, fontSize: 12, color: C.sub }}>{v.voided_by || "—"}</span>
                <span style={{ width: 130, fontSize: 11, color: C.dim, fontFamily: "'Geist Mono',monospace" }}>{fmtTs(v.voided_at)}</span>
                <span style={{ width: 100, textAlign: "right", fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#f59e0b" }}>{rp(v.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.kind === "err" ? "#7f1d1d" : "#14532d",
          border: `1px solid ${toast.kind === "err" ? "#ef4444" : "#22c55e"}`,
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
        }}>{toast.m}</div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #1b212c", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 96 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
    </div>
  );
}

const S = {
  section: { marginBottom: 22 },
  h:       { fontSize: 11, color: "#5b6470", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 },
  empty:   { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "22px 18px", textAlign: "center", color: C.sub, fontSize: 13 },
  card:    { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" },
  row:     { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  select:  { width: "100%", padding: "10px 12px", background: "#0a0e16", border: `1px solid ${C.border}`, borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit" },
  btnDanger: { background: "#F8717118", border: "1px solid #F8717144", borderRadius: 8, padding: "6px 14px", color: "#F87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  periodBtn: (on) => ({ background: on ? "#a855f733" : "#0a0e16", border: `1px solid ${on ? "#a855f7aa" : C.border}`, color: on ? "#d8b4fe" : "#9ca3af", padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  pill:    (color) => ({ background: color + "22", color, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }),
};
