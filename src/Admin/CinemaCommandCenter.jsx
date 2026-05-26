// karyaOS — Cinema Command Center (HERO realtime dashboard)
// Single screen showing studio occupancy live, revenue today (tickets + F&B
// bundles + in-studio orders), pickup queue, feedback live, studio issues.
// Auto-poll 5s.
import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";
const DS_LABEL = { scheduled: "Terjadwal", running: "Berlangsung", closed: "Close", sold_out: "Sold Out", cancelled: "Cancel" };
const DS_COLOR = { scheduled: "#10b981", running: "#f59e0b", closed: "#6b7280", sold_out: "#ef4444", cancelled: "#dc2626" };
const MAINT_LABEL = { operational: "Operational", cleaning: "Cleaning", maintenance: "Maintenance", closed: "Close" };
const MAINT_COLOR = { operational: "#10b981", cleaning: "#22d3ee", maintenance: "#f59e0b", closed: "#ef4444" };

export default function CinemaCommandCenter({ apiBase = "" }) {
  const base = (apiBase || "") + "/api/cinema";
  const [data, setData] = useState(null);
  const [updated, setUpdated] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${base}/command-center`);
      const d = await r.json();
      setData(d); setUpdated(Date.now());
    } catch {}
  }, [base]);
  useEffect(() => {
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [load]);

  if (!data) return <div style={{ color: C.sub, fontFamily: "'Inter',sans-serif", padding: 30 }}>Memuat command center…</div>;

  const t = data.revenue || {};
  const running   = (data.showtimes_today || []).filter(s => s.derived_status === "running");
  const upcoming  = (data.showtimes_today || []).filter(s => s.derived_status === "scheduled");
  const completed = (data.showtimes_today || []).filter(s => s.derived_status === "closed" || s.derived_status === "sold_out");

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, letterSpacing: 1, color: "#fff" }}>🎬 Cinema Command Center</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>Realtime · {data.today} · refresh tiap 5 detik · update terakhir {new Date(updated).toLocaleTimeString("id-ID")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.studio_issues?.length > 0 && (
            <div style={{ background: "#ef444415", border: "1px solid #ef444466", borderRadius: 10, padding: "8px 14px" }}>
              <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, letterSpacing: 1 }}>⚠ STUDIO ISSUE</div>
              <div style={{ fontSize: 13, color: "#fff", marginTop: 2 }}>{data.studio_issues.length} studio non-operational</div>
            </div>
          )}
        </div>
      </div>

      {/* Revenue strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
        <Stat label="Revenue total hari ini" value={rp(t.total)} color="#10b981" big />
        <Stat label="Tiket" value={rp(t.tickets)} sub={`${t.tickets_count || 0} transaksi`} color="#22d3ee" />
        <Stat label="F&B Bundle" value={rp(t.bundles)} color="#f59e0b" />
        <Stat label="In-Studio Order" value={rp(t.in_studio)} color="#a855f7" />
        <Stat label="Void 24 jam" value={data.void_count_24h || 0} color={data.void_count_24h ? "#ef4444" : "#6b7280"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        {/* Left column: showtimes */}
        <div>
          <Section title={`🟢 SEDANG BERLANGSUNG (${running.length})`}>
            {running.length === 0 ? <Empty>None jadwal yang sedang berlangsung.</Empty> : running.map(s => <ShowRow key={s.id} s={s} />)}
          </Section>
          <Section title={`⏰ JADWAL BERIKUTNYA (${upcoming.length})`}>
            {upcoming.length === 0 ? <Empty>None jadwal yang akan datang hari ini.</Empty> : upcoming.slice(0, 8).map(s => <ShowRow key={s.id} s={s} />)}
          </Section>
          {completed.length > 0 && (
            <Section title={`✓ SUDAH SELESAI (${completed.length})`}>
              <div style={{ padding: "10px 14px", color: C.sub, fontSize: 12 }}>
                {completed.length} jadwal · revenue {rp(completed.reduce((a, s) => a + (s.sold * (s.price || 0)), 0))}
              </div>
            </Section>
          )}
        </div>

        {/* Right column */}
        <div>
          <Section title="🍿 ANTRIAN IN-STUDIO ORDER">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, padding: 12 }}>
              <QueueStat label="Baru"      value={data.queue.pending || 0}    color="#ef4444" />
              <QueueStat label="Disiapkan" value={data.queue.preparing || 0}  color="#f59e0b" />
              <QueueStat label="Diantar"   value={data.queue.delivered || 0}  color="#10b981" />
              <QueueStat label="Cancel"     value={data.queue.cancelled || 0}  color="#6b7280" />
            </div>
          </Section>

          <Section title="🏛️ STATUS STUDIO">
            {data.studios.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    {s.last_cleaned_at ? `Cleaned ${fmtTs(s.last_cleaned_at)}${s.last_cleaned_by ? ` · ${s.last_cleaned_by}` : ""}` : "Belum tercatat clean"}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, color: MAINT_COLOR[s.maintenance_status] || "#5b6470", background: (MAINT_COLOR[s.maintenance_status] || "#5b6470") + "22", borderRadius: 6, padding: "3px 8px", letterSpacing: 1 }}>
                  {MAINT_LABEL[s.maintenance_status] || s.maintenance_status || "—"}
                </span>
              </div>
            ))}
          </Section>

          <Section title="⭐ FEEDBACK TERBARU">
            {data.feedback.length === 0 ? <Empty>No feedback hari ini.</Empty> :
              data.feedback.map(f => (
                <div key={f.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>{f.film_title || "—"}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 3, fontFamily: "'Geist Mono',monospace", color: "#fbbf24" }}>
                    {f.rating_movie       ? <span>🎬 {f.rating_movie}</span> : null}
                    {f.rating_audio       ? <span>🔊 {f.rating_audio}</span> : null}
                    {f.rating_cleanliness ? <span>✨ {f.rating_cleanliness}</span> : null}
                    {f.rating_comfort     ? <span>💺 {f.rating_comfort}</span> : null}
                  </div>
                  {f.comment && <div style={{ color: C.sub, lineHeight: 1.45 }}>{f.comment}</div>}
                  <div style={{ color: C.dim, fontSize: 10, marginTop: 3 }}>{fmtTs(f.created_at)}</div>
                </div>
              ))
            }
          </Section>
        </div>
      </div>
    </div>
  );
}

function ShowRow({ s }) {
  const ds = s.derived_status || "scheduled";
  const occ = s.capacity ? Math.round((s.sold || 0) / s.capacity * 100) : 0;
  return (
    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.film_title || "—"}</div>
          <div style={{ fontSize: 11, color: C.sub }}>{s.studio_name} · {s.start_time} · {s.format || "2D"} · {s.film_rating}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: DS_COLOR[ds], background: DS_COLOR[ds] + "22", borderRadius: 5, padding: "3px 8px", letterSpacing: 1, whiteSpace: "nowrap" }}>{DS_LABEL[ds]}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1, height: 6, background: "#161b22", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.max(2, occ)}%`, background: occ >= 80 ? "#ef4444" : occ >= 50 ? "#eab308" : "#10b981", borderRadius: 3 }} />
        </div>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11.5, color: "#fff", fontWeight: 700 }}>{s.sold}/{s.capacity}</span>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: C.sub, width: 32, textAlign: "right" }}>{occ}%</span>
      </div>
    </div>
  );
}
function Stat({ label, value, sub, color, big }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: big ? 14 : 12 }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: big ? 22 : 17, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function QueueStat({ label, value, color }) {
  return (
    <div style={{ background: "#0a0e16", border: `1px solid ${color}55`, borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
      <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>{label}</div>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>{children}</div>
    </div>
  );
}
function Empty({ children }) { return <div style={{ padding: "18px 14px", textAlign: "center", color: C.sub, fontSize: 12 }}>{children}</div>; }
