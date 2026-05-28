// karyaOS — Customer Digital Ticket (mobile QR)
// Route: /?ticket=CODE
// Fallback saat printer thermal mati — kasir kirim link via WA, customer
// buka di HP → tunjukkan QR di pintu studio untuk validasi.
import { useState, useEffect } from "react";
import QRCode from "qrcode";
import API_HOST from "../apiBase.js";
import { fmtMoney as rp } from "../lib/currency.js";
import { LoadingState } from "../components/uiKit.jsx";

export default function CinemaDigitalTicket() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("ticket") || "";
  const purchaseParam = (params.get("purchase") || "").trim().toUpperCase();
  const autoPrint = params.get("print") === "1";
  const thermal = params.get("thermal") === "1"; // 80mm thermal printer
  const [ticket, setTicket] = useState(null);
  const [purchase, setPurchase] = useState(null); // { tickets[], bundles[], purchase_id }
  const [error, setError] = useState("");
  const [qrSrc, setQrSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printingThermal, setPrintingThermal] = useState(false);
  const [thermalMsg, setThermalMsg] = useState("");
  // Phase 3 refund flow state
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundPhone, setRefundPhone] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundResult, setRefundResult] = useState(null);  // { ok, message } | { error }

  // Auto-print + close window setelah loaded (untuk Chrome --kiosk-printing flag)
  useEffect(() => {
    if (autoPrint && ticket && qrSrc) {
      const t = setTimeout(() => {
        window.print();
        // Optional: auto-close window setelah print (Chrome will close kalau opened via window.open)
        setTimeout(() => { try { window.close(); } catch {} }, 800);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [autoPrint, ticket, qrSrc]);

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) { root.style.maxWidth = "none"; root.style.width = "100%"; root.style.padding = "0"; }
    return () => { if (root) { root.style.maxWidth = ""; root.style.width = ""; root.style.padding = ""; } };
  }, []);

  // PURCHASE MODE — fetch all tickets in purchase (multi-seat booking).
  // Used by CinemaWeb e-ticket QR: 1 scan di counter → muncul semua tiket
  // dalam purchase → kasir klik "Print Semua" → thermal printer keluarkan
  // sejumlah tiket fisik.
  useEffect(() => {
    if (!purchaseParam) return;
    fetch(`${API_HOST}/api/cinema/purchase/${encodeURIComponent(purchaseParam)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error || "Purchase tidak ditemukan"); return; }
        setPurchase(d);
        if (d.tickets?.length > 0) setTicket(d.tickets[0]); // primary ticket for QR/header
      })
      .catch(() => setError("Gagal memuat data purchase"))
      .finally(() => setLoading(false));
  }, [purchaseParam]);

  // SINGLE TICKET MODE — only fire if not in purchase mode
  useEffect(() => {
    if (purchaseParam) return;
    if (!code) { setError("Kode tiket tidak valid"); setLoading(false); return; }
    fetch(`${API_HOST}/api/cinema/tickets/lookup/${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.message || d.error || "Tiket tidak ditemukan"); setTicket(d.ticket || null); }
        else setTicket(d.ticket);
      })
      .catch(() => setError("Tiket sedang dipersiapkan, mohon menunggu sebentar."))
      .finally(() => setLoading(false));
  }, [code, purchaseParam]);

  // QR generation — purchase QR encodes the lookup URL so re-scan works too
  useEffect(() => {
    const target = purchaseParam || code;
    if (!target) return;
    QRCode.toDataURL(target, { width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000", light: "#fff" } })
      .then(setQrSrc).catch(() => setQrSrc(null));
  }, [code, purchaseParam]);

  // Thermal print all tickets in purchase (counter use)
  const printAllThermal = async () => {
    if (!purchase?.purchase_id) return;
    setPrintingThermal(true); setThermalMsg("");
    try {
      const r = await fetch(`${API_HOST}/api/cinema/purchases/${encodeURIComponent(purchase.purchase_id)}/print`, { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        const where = d.printer?.host && d.printer.host !== "SIMULATED" ? ` · ${d.printer.host}` : "";
        const sim = d.simulated ? " (SIMULATED — no real printer)" : "";
        setThermalMsg(`✓ ${d.printed || purchase.tickets.length} tiket ter-print${where}${sim}`);
      } else {
        setThermalMsg(`⚠ ${d.error || "Gagal print"}`);
      }
    } catch (e) {
      setThermalMsg(`⚠ ${e.message}`);
    } finally {
      setPrintingThermal(false);
    }
  };

  if (loading) {
    return <Shell><LoadingState label="Memuat tiket…" /></Shell>;
  }
  if (error || !ticket) {
    return (
      <Shell>
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 14, opacity: 0.5 }}>⚠</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fca5a5" }}>{error || "Tiket tidak ditemukan"}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>Kode: <code style={{ color: "#fbbf24" }}>{code}</code></div>
          <div style={{ fontSize: 12, color: "#7d8590", marginTop: 16, lineHeight: 1.6 }}>
            Cek ulang link / hubungi kasir cinema untuk bantuan.
          </div>
        </div>
      </Shell>
    );
  }

  const isUsed = !!ticket.checked_in_at;
  const isRefunded = ticket.payment_status === "refunded" || ticket.refund_status === "refunded";

  // Phase 3 — refund eligibility (pre-sale tickets, H-1, not used/refunded)
  const isPreSale = !!ticket.is_pre_sale;
  const hoursUntilShow = (() => {
    if (!ticket.show_date || !ticket.start_time) return null;
    const showTs = new Date(`${ticket.show_date}T${ticket.start_time}:00+07:00`).getTime();
    return (showTs - Date.now()) / 3600000;
  })();
  const refundEligible = isPreSale && !isUsed && !isRefunded && ticket.payment_status === "paid" && (hoursUntilShow === null || hoursUntilShow >= 24);

  return (
    <Shell>
      {/* Print CSS — thermal 80mm atau A4 (auto detect via ?thermal=1) */}
      <style>{`
        @media print {
          ${thermal ? '@page { size: 80mm auto; margin: 2mm }' : '@page { size: A6 portrait; margin: 5mm }'}
          html, body { background: #fff !important; color: #000 !important; }
          body * { visibility: hidden }
          .digital-ticket-print, .digital-ticket-print * { visibility: visible }
          .digital-ticket-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; color: #000 !important; padding: ${thermal ? '4mm 2mm' : '8mm'} !important; }
          .digital-ticket-print * { color: #000 !important; background: transparent !important; }
          .digital-ticket-print .qr-card { box-shadow: none !important; border: 1px solid #333 !important; padding: 6mm !important; background: #fff !important; }
          .digital-ticket-print img { width: ${thermal ? '60mm' : '50mm'} !important; height: ${thermal ? '60mm' : '50mm'} !important; }
          .digital-ticket-print .seat-pill { background: #000 !important; color: #fff !important; border: 1px solid #000 !important; }
          .no-print, .tips-section { display: none !important }
        }
      `}</style>
      <div className="digital-ticket-print" style={{ padding: "20px 18px" }}>
        {/* PURCHASE MODE — banner + print-all button */}
        {purchase && purchase.tickets?.length > 1 && (
          <div className="no-print" style={{
            background: "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.08))",
            border: "1px solid rgba(251,191,36,0.4)",
            borderRadius: 14, padding: "14px 16px", marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>📦 PURCHASE</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginTop: 2 }}>{purchase.tickets.length} tiket · {purchase.tickets.map(t => t.seat).join(", ")}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, fontFamily: "'Geist Mono',monospace" }}>{purchase.purchase_id}</div>
              </div>
              <button onClick={printAllThermal} disabled={printingThermal} style={{
                background: printingThermal ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #fbbf24, #f59e0b)",
                border: "none", color: "#1a1205", borderRadius: 10, padding: "10px 18px",
                fontSize: 13, fontWeight: 800, cursor: printingThermal ? "not-allowed" : "pointer",
                fontFamily: "inherit", boxShadow: "0 4px 14px rgba(251,191,36,0.35)",
              }}>{printingThermal ? "Mencetak…" : `🖨️ Print Semua (${purchase.tickets.length})`}</button>
            </div>
            {thermalMsg && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: thermalMsg.startsWith("✓") ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                color: thermalMsg.startsWith("✓") ? "#10b981" : "#fca5a5",
                border: `1px solid ${thermalMsg.startsWith("✓") ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
              }}>{thermalMsg}</div>
            )}
            {purchase.tickets[0]?.outlet_name && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#9ca3af" }}>
                📍 {purchase.tickets[0].outlet_name} ({purchase.tickets[0].outlet_code})
              </div>
            )}
          </div>
        )}

        {/* Status banner kalau used/refunded */}
        {isUsed && (
          <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, color: "#10b981", fontSize: 12, fontWeight: 800, textAlign: "center", marginBottom: 14 }}>
            ✓ Tiket sudah di-check-in {new Date(ticket.checked_in_at * 1000).toLocaleString("id-ID")}
          </div>
        )}
        {isRefunded && (
          <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, color: "#fca5a5", fontSize: 12, fontWeight: 800, textAlign: "center", marginBottom: 14 }}>
            ⚠ Tiket sudah di-refund {ticket.refund_amount ? `· Rp ${ticket.refund_amount.toLocaleString("id-ID")}` : ""}
          </div>
        )}

        {/* Phase 3 — Refund eligibility banner (pre-sale + H-1 + paid) */}
        {refundEligible && (
          <div className="no-print" style={{
            padding: "12px 14px",
            background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(251,191,36,0.05))",
            border: "1px solid rgba(168,85,247,0.4)", borderRadius: 12, marginBottom: 14,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#c084fc", fontWeight: 800, letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", textTransform: "uppercase" }}>
                🎬 Pre-Sale Ticket · Refundable
              </div>
              <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4, lineHeight: 1.5 }}>
                Tiket bisa di-refund <b>100%</b> sampai H-1{hoursUntilShow !== null && hoursUntilShow > 24 ? ` (${Math.floor(hoursUntilShow / 24)} hari lagi)` : ""}.
              </div>
            </div>
            <button onClick={() => setRefundModalOpen(true)} style={{
              padding: "9px 16px", background: "rgba(239,68,68,0.15)", color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.5)", borderRadius: 8,
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}>↩️ Request Refund</button>
          </div>
        )}

        {/* Refund confirm modal */}
        {refundModalOpen && (
          <div className="no-print" onClick={() => !refundBusy && setRefundModalOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(6px)",
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              width: "min(440px, 100%)", background: "#0a0a0f", border: "1px solid #a855f755",
              borderRadius: 16, padding: 24,
            }}>
              {refundResult?.ok ? (
                <>
                  <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 8 }}>Refund Berhasil</div>
                  <div style={{ fontSize: 13, color: "#cbd5e1", textAlign: "center", lineHeight: 1.6, marginBottom: 18 }}>
                    {refundResult.message}
                  </div>
                  <button onClick={() => { setRefundModalOpen(false); window.location.reload(); }} style={{
                    width: "100%", padding: 12, background: "#a855f7", color: "#fff",
                    border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  }}>OK</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: "#fca5a5", fontFamily: "'Geist Mono',monospace", letterSpacing: 1.5, fontWeight: 800, textTransform: "uppercase" }}>↩️ Refund Tiket Pre-Sale</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 6, marginBottom: 4 }}>Tiket {ticket.code}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, lineHeight: 1.5 }}>
                    {ticket.film_title} · {ticket.seat} · {ticket.show_date} {ticket.start_time}
                    <br />Dana <b style={{ color: "#10b981" }}>Rp {(ticket.price || 0).toLocaleString("id-ID")}</b> akan dikembalikan ke metode pembayaran asal dalam 1-7 hari kerja.
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Geist Mono',monospace", marginBottom: 6, fontWeight: 700 }}>NO. WHATSAPP (verifikasi) *</div>
                    <input value={refundPhone} onChange={e => setRefundPhone(e.target.value)} placeholder="08xxxxxxxxxx"
                      style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: "1px solid #30363d", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Geist Mono',monospace", marginBottom: 6, fontWeight: 700 }}>ALASAN REFUND * (min 5 karakter)</div>
                    <textarea value={refundReason} onChange={e => setRefundReason(e.target.value)} rows={3}
                      placeholder="Contoh: Ada keperluan mendadak, tidak bisa hadir di tanggal showtime."
                      style={{ width: "100%", padding: 10, background: "rgba(0,0,0,0.4)", border: "1px solid #30363d", borderRadius: 8, color: "#fff", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", resize: "vertical" }} />
                  </div>

                  {refundResult?.error && (
                    <div style={{ padding: "10px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#fca5a5", fontSize: 12, marginBottom: 12 }}>
                      ⚠ {refundResult.error}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setRefundModalOpen(false)} disabled={refundBusy} style={{
                      flex: 1, padding: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 10, color: "#fff", fontWeight: 700, cursor: refundBusy ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}>Batal</button>
                    <button onClick={async () => {
                      setRefundBusy(true); setRefundResult(null);
                      try {
                        const r = await fetch(`${API_HOST}/api/cinema/tickets/${ticket.id}/refund`, {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reason: refundReason.trim(), phone: refundPhone.trim() }),
                        });
                        const d = await r.json();
                        if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
                        setRefundResult({ ok: true, message: d.message });
                      } catch (e) {
                        setRefundResult({ error: e.message });
                      }
                      setRefundBusy(false);
                    }} disabled={refundBusy || refundReason.trim().length < 5 || !refundPhone.trim()} style={{
                      flex: 2, padding: 12, background: refundBusy ? "rgba(239,68,68,0.3)" : "linear-gradient(135deg, #ef4444, #dc2626)",
                      border: "none", borderRadius: 10, color: "#fff", fontWeight: 800, cursor: refundBusy || refundReason.trim().length < 5 || !refundPhone.trim() ? "not-allowed" : "pointer", fontFamily: "inherit",
                    }}>{refundBusy ? "⏳ Memproses…" : "↩️ Refund Sekarang"}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* QR Code — big & scan-friendly */}
        <div className="qr-card" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20, textAlign: "center", marginBottom: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 2, fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>🎬 TIKET DIGITAL</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 6, letterSpacing: -0.4, lineHeight: 1.2 }}>{ticket.film_title || "—"}</div>
          {ticket.rating && <span style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 4, background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#c084fc", fontFamily: "'Geist Mono',monospace" }}>{ticket.rating}</span>}

          {/* QR */}
          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            {qrSrc ? (
              <div style={{ background: "#fff", padding: 14, borderRadius: 16, display: "inline-block", boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 0 0 4px rgba(251,191,36,0.1)" }}>
                <img src={qrSrc} alt={code} style={{ width: 240, height: 240, display: "block" }} />
              </div>
            ) : (
              <div style={{ width: 268, height: 268, background: "rgba(255,255,255,0.05)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>⏳</div>
            )}
          </div>

          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 12, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, fontWeight: 700 }}>{ticket.code}</div>
          <div style={{ fontSize: 11, color: "#7d8590", marginTop: 4 }}>Show this QR to the usher at the studio entrance</div>
        </div>

        {/* Ticket info */}
        <div style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
          <Line label="KURSI" value={<span className="seat-pill" style={{ fontSize: 22, fontWeight: 900, padding: "4px 14px", borderRadius: 8, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205", fontFamily: "'Geist Mono',monospace" }}>{ticket.seat}</span>} />
          <Line label="STUDIO" value={`${ticket.studio_name || "—"} ${ticket.outlet ? `· ${ticket.outlet}` : ""}`} />
          <Line label="TANGGAL" value={ticket.show_date || "—"} />
          <Line label="JAM" value={<span style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", fontFamily: "'Geist Mono',monospace" }}>{ticket.start_time || "—"}</span>} />
          {ticket.format && <Line label="FORMAT" value={ticket.format} />}
          {ticket.duration_min && <Line label="DURASI" value={`${ticket.duration_min} menit`} />}
          <Line label="HARGA" value={<span style={{ color: "#10b981", fontFamily: "'Geist Mono',monospace", fontWeight: 800 }}>{rp(ticket.price)}</span>} />
        </div>

        {/* PURCHASE MODE — list semua tiket di purchase */}
        {purchase && purchase.tickets?.length > 1 && (
          <div className="no-print" style={{ marginTop: 14, background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: "#fbbf24", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10 }}>🎟️ SEMUA TIKET ({purchase.tickets.length})</div>
            {purchase.tickets.map(t => (
              <div key={t.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 12 }}>
                <span className="seat-pill" style={{ fontSize: 14, fontWeight: 900, padding: "4px 12px", borderRadius: 7, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", color: "#1a1205", fontFamily: "'Geist Mono',monospace", flexShrink: 0 }}>{t.seat}</span>
                <span style={{ flex: 1, fontSize: 11, color: "#9ca3af", fontFamily: "'Geist Mono',monospace" }}>{t.code}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981", fontFamily: "'Geist Mono',monospace" }}>{rp(t.price)}</span>
              </div>
            ))}
            {purchase.bundles?.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 10, color: "#7d8590", letterSpacing: 1.2, fontFamily: "'Geist Mono',monospace", marginBottom: 6 }}>🍿 F&B BUNDLES</div>
                {purchase.bundles.map(b => (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: "#cbd5e1" }}>
                    <span>{b.qty}× {b.bundle_name}</span>
                    <span style={{ fontFamily: "'Geist Mono',monospace", color: "#9ca3af" }}>{rp(b.price * b.qty)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PURCHASE SUMMARY — subtotal, diskon, points, tax, total, payment method */}
        {purchase?.totals && (
          <div style={{ marginTop: 14, background: "linear-gradient(180deg, rgba(168,85,247,0.08), rgba(251,191,36,0.04))", border: "1px solid rgba(168,85,247,0.25)", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 11, color: "#c084fc", letterSpacing: 1.5, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 10 }}>💰 RINGKASAN PEMBAYARAN</div>
            <SumRow label={`Tiket (${purchase.tickets.length}×)`} value={rp(purchase.totals.tickets_total)} />
            {purchase.totals.bundles_total > 0 && <SumRow label="Snack & minuman" value={rp(purchase.totals.bundles_total)} />}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "6px 0", paddingTop: 6 }}>
              <SumRow label="Subtotal" value={rp(purchase.totals.gross_total)} muted />
            </div>
            {purchase.totals.promo_discount > 0 && (
              <SumRow
                label={`🎟 Diskon promo${purchase.promo?.code ? ` (${purchase.promo.code})` : ""}`}
                value={`− ${rp(purchase.totals.promo_discount)}`}
                color="#10b981"
              />
            )}
            {purchase.totals.points_used > 0 && (
              <SumRow
                label={`⭐ Poin ditukar (${purchase.totals.points_used} pt)`}
                value="—"
                color="#fbbf24"
              />
            )}
            {/* Tax breakdown — tax-inclusive Indonesian style */}
            <div style={{ marginTop: 8, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, color: "#7d8590", letterSpacing: 1, fontFamily: "'Geist Mono',monospace", marginBottom: 4 }}>BREAKDOWN PAJAK (INCL.)</div>
              <SumRow label="Harga dasar" value={rp(purchase.totals.base_amount)} muted small />
              <SumRow label={`PPN ${purchase.totals.tax_rate_pct}%`} value={rp(purchase.totals.tax_extracted)} muted small />
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>TOTAL DIBAYAR</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#c084fc", fontFamily: "'Geist Mono',monospace", letterSpacing: -0.3 }}>{rp(purchase.totals.final_total)}</span>
            </div>
            {purchase.payment_method && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af", textAlign: "right", fontFamily: "'Geist Mono',monospace" }}>
                via {purchase.payment_method === "counter" ? "💵 Bayar di Counter" : purchase.payment_method === "snap" ? "💳 Midtrans Snap" : purchase.payment_method.toUpperCase()}
                {purchase.payment_status === "paid" && <span style={{ color: "#10b981", fontWeight: 700 }}> · ✓ LUNAS</span>}
                {(!purchase.payment_status || purchase.payment_status === "pending_payment") && purchase.payment_method !== "counter" && <span style={{ color: "#fbbf24", fontWeight: 700 }}> · ⏳ PENDING</span>}
              </div>
            )}
          </div>
        )}

        {/* Tips — hidden saat print */}
        <div className="tips-section" style={{ marginTop: 14, padding: 14, background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 800, marginBottom: 6, fontFamily: "'Geist Mono',monospace", letterSpacing: 1.2 }}>💡 TIPS</div>
          <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.7 }}>
            <li>Datang 15 menit sebelum jam tayang</li>
            <li>Show QR to the usher at studio entrance (phone screen is fine)</li>
            <li>QR cukup di-scan sekali — kalau gagal, kasih kode {ticket.code} ke usher</li>
            <li>Tiket berlaku hanya untuk jadwal & kursi di atas</li>
          </ul>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)", color: "#e6edf3", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif", overflowY: "auto" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, background: "radial-gradient(700px 500px at 50% 0%, rgba(245,158,11,0.08), transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", maxWidth: 460, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 14 }}>
      <span style={{ fontSize: 10, color: "#7d8590", letterSpacing: 1.4, fontFamily: "'Geist Mono',monospace", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#e6edf3", textAlign: "right", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function SumRow({ label, value, muted, small, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: small ? "2px 0" : "4px 0", gap: 12 }}>
      <span style={{ fontSize: small ? 11 : 12.5, color: muted ? "#9ca3af" : "#e6edf3", fontWeight: muted ? 500 : 600 }}>{label}</span>
      <span style={{ fontSize: small ? 11 : 13, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: color || (muted ? "#9ca3af" : "#e6edf3") }}>{value}</span>
    </div>
  );
}
