// karyaOS — Cinema Emergency Operations Panel
// Handle force majeure: mati listrik, gangguan teknis, double ticket, dispute kursi.
// Manager-only access. Audit lengkap setiap action.
//
// Sections:
// 1. Emergency Close Showtime — listrik mati / force majeure → tutup + auto-refund all tickets
// 2. Swap Seat — conflict resolution (2 customer claim seat sama, dispute)
// 3. Manifest Print — backup paper reference per showtime (offline)
// 4. Manual Check-in — offline mode, usher input code manual
// 5. Conflicts Log — audit trail refund/swap/void

import { useState, useEffect, useCallback } from "react";

const C = { card: "#0d1117", border: "#1b212c", sub: "#9ca3af", dim: "#5b6470" };
const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtTs = (s) => s ? new Date(s * 1000).toLocaleString("id-ID", { hour12: false }) : "—";

export default function CinemaEmergencyOps({ apiBase = "" }) {
  const base = `${apiBase || ""}/api/cinema`;
  const [tab, setTab] = useState("close"); // close | swap | manifest | checkin | conflicts
  const [showtimes, setShowtimes] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${base}/showtimes?date=${new Date().toISOString().slice(0, 10)}`)
      .then(r => r.json()).then(d => setShowtimes(d.showtimes || [])).catch(() => {});
  }, [base]);

  const TABS = [
    { id: "close", label: "🚨 Emergency Close", desc: "Tutup showtime + auto-refund all tickets" },
    { id: "swap", label: "🔄 Swap Seat", desc: "Pindahkan kursi customer (dispute)" },
    { id: "manifest", label: "📋 Print Manifest", desc: "Daftar tiket per showtime (backup offline)" },
    { id: "checkin", label: "✋ Manual Check-in", desc: "Validasi tiket offline (sistem down)" },
    { id: "conflicts", label: "🗂️ Conflicts Log", desc: "Audit refund / swap / void" },
  ];

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", color: "#e6edf3", padding: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#ef4444", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🚨 CINEMA EMERGENCY OPERATIONS</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, letterSpacing: -0.3 }}>Crisis Management & Conflict Resolution</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>Manager-only · Semua action tercatat di audit log</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setMsg(""); }}
            style={{ background: tab === t.id ? "#ef444433" : "rgba(255,255,255,0.04)", border: tab === t.id ? "1px solid #ef4444" : `1px solid ${C.border}`, color: tab === t.id ? "#fca5a5" : C.sub, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div>{t.label}</div>
            <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {msg && <div style={{ padding: "10px 14px", background: msg.startsWith("✓") ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${msg.startsWith("✓") ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 8, fontSize: 12.5, color: msg.startsWith("✓") ? "#10b981" : "#fca5a5", marginBottom: 14 }}>{msg}</div>}

      {tab === "close"     && <EmergencyClose base={base} showtimes={showtimes} setMsg={setMsg} />}
      {tab === "swap"      && <SwapSeat base={base} showtimes={showtimes} setMsg={setMsg} />}
      {tab === "manifest"  && <PrintManifest base={base} showtimes={showtimes} setMsg={setMsg} />}
      {tab === "checkin"   && <ManualCheckin base={base} setMsg={setMsg} />}
      {tab === "conflicts" && <ConflictsLog base={base} showtimes={showtimes} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function EmergencyClose({ base, showtimes, setMsg }) {
  const [picked, setPicked] = useState("");
  const [reason, setReason] = useState("Listrik mati / gangguan teknis");
  const [manager, setManager] = useState("");
  const [refundAll, setRefundAll] = useState(true);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!picked) { setMsg("⚠ Pilih showtime"); return; }
    if (!reason.trim()) { setMsg("⚠ Reason wajib"); return; }
    if (!manager.trim()) { setMsg("⚠ Manager name wajib"); return; }
    if (!confirm(`EMERGENCY CLOSE showtime + ${refundAll ? "REFUND ALL tickets" : "TANPA refund"}?\nIni tidak bisa di-undo otomatis.`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`${base}/showtimes/${picked}/emergency-close`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, manager_name: manager, refund_all: refundAll }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setResult(d);
      setMsg(`✓ Showtime closed. ${d.refunded_count}/${d.tickets_affected} tickets refunded · Rp ${(d.refunded_amount || 0).toLocaleString("id-ID")}`);
    } catch (e) { setMsg("⚠ " + e.message); }
    setBusy(false);
  };

  return (
    <div style={{ background: C.card, border: "1px solid #ef444444", borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#fca5a5", marginBottom: 4 }}>🚨 Emergency Close Showtime</div>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>
        Force tutup showtime karena force majeure (listrik mati, gangguan teknis, dll). Otomatis refund semua tiket terjual + audit lengkap.
      </div>
      <Field label="SHOWTIME">
        <select value={picked} onChange={e => setPicked(e.target.value)} style={inp}>
          <option value="">— Pilih showtime —</option>
          {showtimes.filter(s => !s.manual_closed_at).map(s => (
            <option key={s.id} value={s.id}>{s.film_title} · {s.start_time} · {s.studio_name} ({s.outlet || "—"}) · {s.sold_count || 0} tiket</option>
          ))}
        </select>
      </Field>
      <Field label="ALASAN (wajib, masuk audit log)">
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Listrik mati outlet jam 19:30, ETA recovery 1 jam" style={inp} />
      </Field>
      <Field label="NAMA MANAGER YANG MEMUTUSKAN (audit)">
        <input value={manager} onChange={e => setManager(e.target.value)} placeholder="John Doe (Store Manager)" style={inp} />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
        <input type="checkbox" checked={refundAll} onChange={e => setRefundAll(e.target.checked)} />
        <span>Auto-refund semua tiket terjual <span style={{ color: C.dim, fontSize: 11 }}>(uncheck kalau mau handle manual via WA)</span></span>
      </label>
      <button onClick={submit} disabled={busy} style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", color: "#fff", borderRadius: 10, padding: "12px 22px", fontSize: 13, fontWeight: 900, cursor: busy ? "wait" : "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(239,68,68,0.3)" }}>
        {busy ? "⏳ Processing..." : "🚨 EMERGENCY CLOSE & REFUND"}
      </button>
      {result && result.contacts?.length > 0 && (
        <div style={{ marginTop: 18, padding: 14, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "#22d3ee", fontWeight: 700, letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 8 }}>📞 KONTAK CUSTOMER YANG PERLU DI-NOTIFY ({result.contacts.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
            {result.contacts.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 10, fontSize: 11.5, padding: "5px 8px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
                <span style={{ fontFamily: "'Geist Mono',monospace", color: "#fbbf24", minWidth: 50 }}>{c.seat}</span>
                <span style={{ flex: 1, color: "#cbd5e1" }}>{c.buyer || "—"}</span>
                {c.phone && <a href={`https://wa.me/${c.phone.replace(/^0/, "62").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "#25D366", textDecoration: "none" }}>📱 {c.phone}</a>}
                {c.email && <span style={{ color: "#a855f7" }}>✉ {c.email}</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: C.sub, marginTop: 8 }}>💡 Klik nomor WA → buka chat langsung dengan customer. Kasih info refund timeline + apology.</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function SwapSeat({ base, showtimes, setMsg }) {
  const [showtimeId, setShowtimeId] = useState("");
  const [tickets, setTickets] = useState([]);
  const [ticketId, setTicketId] = useState("");
  const [newSeat, setNewSeat] = useState("");
  const [reason, setReason] = useState("");
  const [manager, setManager] = useState("");

  useEffect(() => {
    if (!showtimeId) { setTickets([]); return; }
    fetch(`${base}/showtimes/${showtimeId}/manifest`).then(r => r.json())
      .then(d => setTickets(d.tickets || [])).catch(() => {});
  }, [base, showtimeId]);

  const submit = async () => {
    if (!ticketId || !newSeat) { setMsg("⚠ Tiket + kursi baru wajib"); return; }
    try {
      const r = await fetch(`${base}/tickets/${ticketId}/swap-seat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_seat: newSeat.toUpperCase(), reason, manager_name: manager }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Gagal swap");
      setMsg(`✓ Tiket ${d.ticket_code}: ${d.from_seat} → ${d.to_seat}`);
      setTicketId(""); setNewSeat(""); setReason("");
      // Reload tickets
      fetch(`${base}/showtimes/${showtimeId}/manifest`).then(r => r.json()).then(d => setTickets(d.tickets || []));
    } catch (e) { setMsg("⚠ " + e.message); }
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>🔄 Swap Seat (Conflict Resolution)</div>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>
        Pindah customer ke kursi lain — dispute, kursi rusak, accessibility, atau request VIP upgrade. Audit log otomatis.
      </div>
      <Field label="SHOWTIME">
        <select value={showtimeId} onChange={e => setShowtimeId(e.target.value)} style={inp}>
          <option value="">— Pilih showtime —</option>
          {showtimes.map(s => <option key={s.id} value={s.id}>{s.film_title} · {s.start_time} · {s.studio_name}</option>)}
        </select>
      </Field>
      {tickets.length > 0 && (
        <Field label="TIKET YG MAU DI-SWAP">
          <select value={ticketId} onChange={e => { setTicketId(e.target.value); const t = tickets.find(x => x.id == e.target.value); if (t) setNewSeat(""); }} style={inp}>
            <option value="">— Pilih tiket —</option>
            {tickets.map(t => <option key={t.id} value={t.id}>{t.seat} · {t.code} · {t.buyer || "Counter"}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Field label="KURSI BARU">
          <input value={newSeat} onChange={e => setNewSeat(e.target.value.toUpperCase())} placeholder="A5" style={inp} />
        </Field>
        <Field label="ALASAN">
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Customer complain kursi rusak" style={inp} />
        </Field>
      </div>
      <Field label="NAMA MANAGER">
        <input value={manager} onChange={e => setManager(e.target.value)} placeholder="John Doe" style={inp} />
      </Field>
      <button onClick={submit} style={{ background: "linear-gradient(135deg,#22d3ee,#06b6d4)", border: "none", color: "#04303a", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🔄 SWAP SEAT</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function PrintManifest({ base, showtimes, setMsg }) {
  const [showtimeId, setShowtimeId] = useState("");
  const [data, setData] = useState(null);

  const load = () => {
    if (!showtimeId) return;
    fetch(`${base}/showtimes/${showtimeId}/manifest`).then(r => r.json()).then(setData).catch(() => {});
  };

  return (
    <div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 14 }} className="no-print">
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>📋 Print Ticket Manifest</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>
          Backup paper list per showtime → usher bisa validate manual kalau scanner / sistem down.
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select value={showtimeId} onChange={e => setShowtimeId(e.target.value)} style={{ ...inp, flex: 1 }}>
            <option value="">— Pilih showtime —</option>
            {showtimes.map(s => <option key={s.id} value={s.id}>{s.film_title} · {s.start_time} · {s.studio_name}</option>)}
          </select>
          <button onClick={load} disabled={!showtimeId} style={{ background: "#a855f733", border: "1px solid #a855f7", color: "#c084fc", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>📋 Load Manifest</button>
          {data && <button onClick={() => window.print()} style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)", border: "none", color: "#1a1205", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🖨️ Print</button>}
        </div>
      </div>

      {data && (
        <div className="manifest-print" style={{ background: "#fff", color: "#000", padding: 28, borderRadius: 10, fontFamily: "'Geist Mono',monospace" }}>
          <style>{`@media print { @page { size: A4 } body { background: #fff !important } .no-print { display: none !important } .manifest-print { box-shadow: none !important; padding: 12mm !important } }`}</style>
          <div style={{ textAlign: "center", marginBottom: 20, borderBottom: "2px solid #000", paddingBottom: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.5 }}>🎬 TICKET MANIFEST</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>{data.showtime?.film_title} · {data.showtime?.studio_name}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{data.showtime?.show_date} {data.showtime?.start_time} · {data.showtime?.outlet}</div>
            <div style={{ fontSize: 11, marginTop: 8, color: "#555" }}>Printed: {fmtTs(data.summary?.printed_at)}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 11, marginBottom: 14 }}>
            <div><b>Sold:</b> {data.summary?.total_sold}</div>
            <div><b>Revenue:</b> {rp(data.summary?.total_revenue)}</div>
            <div><b>w/ Contact:</b> {data.summary?.with_contact}</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#f0f0f0", fontWeight: 800 }}>
                <th style={{ border: "1px solid #333", padding: "4px 6px", textAlign: "left" }}>SEAT</th>
                <th style={{ border: "1px solid #333", padding: "4px 6px", textAlign: "left" }}>KODE</th>
                <th style={{ border: "1px solid #333", padding: "4px 6px", textAlign: "left" }}>BUYER</th>
                <th style={{ border: "1px solid #333", padding: "4px 6px", textAlign: "left" }}>PHONE</th>
                <th style={{ border: "1px solid #333", padding: "4px 6px", textAlign: "left" }}>PAY</th>
                <th style={{ border: "1px solid #333", padding: "4px 6px", textAlign: "left" }}>✓ CHECK</th>
              </tr>
            </thead>
            <tbody>
              {data.tickets.map(t => (
                <tr key={t.id}>
                  <td style={{ border: "1px solid #ccc", padding: "4px 6px", fontWeight: 800 }}>{t.seat}</td>
                  <td style={{ border: "1px solid #ccc", padding: "4px 6px" }}>{t.code}</td>
                  <td style={{ border: "1px solid #ccc", padding: "4px 6px" }}>{t.buyer || "—"}</td>
                  <td style={{ border: "1px solid #ccc", padding: "4px 6px" }}>{t.buyer_phone || "—"}</td>
                  <td style={{ border: "1px solid #ccc", padding: "4px 6px" }}>{t.payment_method || "—"}</td>
                  <td style={{ border: "1px solid #ccc", padding: "4px 6px", width: 60 }}>☐</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 20, fontSize: 10, color: "#555" }}>
            💡 Usher: centang ✓ kolom kanan kalau customer sudah check-in. Setelah selesai, scan ulang ke sistem saat sudah recovery.
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function ManualCheckin({ base, setMsg }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (!code.trim()) return;
    try {
      const r = await fetch(`${base}/tickets/manual-checkin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase(), checked_by: "Manager (manual)" }),
      });
      const d = await r.json();
      setResult(d);
      if (!d.ok) setMsg("⚠ " + d.error);
      else setMsg(`✓ Tiket ${d.ticket.code} (${d.ticket.seat}) checked-in`);
      setCode("");
    } catch (e) { setMsg("⚠ " + e.message); }
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>✋ Manual Check-in</div>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 14 }}>
        Saat scanner / network down, usher input kode tiket manual untuk validasi. Audit tetap tercatat.
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CT-AB12CD"
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ ...inp, flex: 1, fontSize: 18, fontFamily: "'Geist Mono',monospace", textAlign: "center", letterSpacing: 2, fontWeight: 800 }} />
        <button onClick={submit} style={{ background: "linear-gradient(135deg,#10b981,#34d399)", border: "none", color: "#04130c", borderRadius: 8, padding: "12px 22px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✓ Check-in</button>
      </div>
      {result?.ok && result.ticket && (
        <div style={{ marginTop: 14, padding: 14, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#10b981" }}>✓ {result.ticket.film_title}</div>
          <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 4 }}>{result.ticket.studio_name} · {result.ticket.show_date} {result.ticket.start_time} · Seat <b>{result.ticket.seat}</b></div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 4, fontFamily: "'Geist Mono',monospace" }}>{result.ticket.code} · checked-in {fmtTs(result.ticket.checked_in_at)}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
function ConflictsLog({ base, showtimes }) {
  const [showtimeId, setShowtimeId] = useState("");
  const [data, setData] = useState({ refunded: [], swaps: [], voids: [] });

  useEffect(() => {
    const q = showtimeId ? `?showtime_id=${showtimeId}` : "";
    fetch(`${base}/tickets/conflicts${q}`).then(r => r.json()).then(setData).catch(() => {});
  }, [base, showtimeId]);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <select value={showtimeId} onChange={e => setShowtimeId(e.target.value)} style={{ ...inp, maxWidth: 400 }}>
          <option value="">— All showtimes —</option>
          {showtimes.map(s => <option key={s.id} value={s.id}>{s.film_title} · {s.start_time} · {s.studio_name}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <ConflictSection title="🔴 Refunded" items={data.refunded} render={r => `${r.seat} · ${r.code} · ${r.film_title}`} />
        <ConflictSection title="🔄 Seat Swaps" items={data.swaps} render={s => `${s.from_seat}→${s.to_seat} · ${s.reason || "—"} · ${s.swapped_by}`} />
        <ConflictSection title="🚫 Voided Tickets" items={data.voids} render={v => `${v.seat} · ${v.reason || "—"} · ${rp(v.amount)}`} />
      </div>
    </div>
  );
}
function ConflictSection({ title, items, render }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>{title} <span style={{ color: C.dim, fontFamily: "'Geist Mono',monospace" }}>({items.length})</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {items.length === 0 ? <div style={{ fontSize: 11, color: C.dim, padding: 10, textAlign: "center" }}>Tidak ada</div> :
          items.map((it, i) => (
            <div key={i} style={{ fontSize: 11, padding: "6px 10px", background: "rgba(255,255,255,0.02)", borderRadius: 6, color: "#cbd5e1" }}>
              {render(it)}
            </div>
          ))
        }
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = { width: "100%", boxSizing: "border-box", background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none" };
