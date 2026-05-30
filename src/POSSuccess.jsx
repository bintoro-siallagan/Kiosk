export default function POSSuccess({ created, order, cashier, onDone, onAnother }) {
  const isPay = order.action === "pay";
  const fmt = (n) => (n || 0).toLocaleString("id-ID");

  return (
    <div style={S.root}>
      <style>{CSS}</style>
      <div className="lg success-card" style={S.card}>
        <div style={S.iconWrap}>
          <div style={S.iconGlow}/>
          <div style={S.icon}>{isPay ? "✅" : "📋"}</div>
        </div>

        <h1 style={S.title}>
          {isPay ? "Payment successful" : "Tab opened"}
        </h1>

        {created?.queueNumber && (
          <div style={S.queueBlock}>
            <div style={S.queueLabel}>Queue number</div>
            <div style={S.queueNumber}>{created.queueNumber}</div>
            <div style={S.queueHint}>Show this to the staff</div>
          </div>
        )}

        <div style={S.orderId}>Order · #{created?.id || "—"}</div>

        <div style={S.details}>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Type</span>
            <span style={S.detailVal}>{order.type === "dine-in" ? "🍽️ Dine-in" : "🛍️ Takeaway"}</span>
          </div>
          {order.table && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Table</span>
              <span style={S.detailVal}>{order.table.name}</span>
            </div>
          )}
          {order.customerName && (
            <div style={S.detailRow}>
              <span style={S.detailLabel}>Customer</span>
              <span style={S.detailVal}>{order.customerName}</span>
            </div>
          )}
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Status</span>
            <span style={isPay ? S.statusPaid : S.statusTab}>
              {isPay ? "💵 Paid (Cash)" : "📋 Open tab"}
            </span>
          </div>
          <div style={{ ...S.detailRow, borderBottom: "none", paddingTop: 14 }}>
            <span style={S.detailLabel}>Total</span>
            <span style={S.detailTotal}>Rp {fmt(created?.total || order.subtotal)}</span>
          </div>
        </div>

        <div style={S.actions}>
          <button onClick={onAnother} className="lg lg-brand pop" style={S.anotherBtn}>+ Order again</button>
          <button onClick={onDone} className="lg pop" style={S.doneBtn}>← Back to home</button>
        </div>

        <div style={S.hint}>
          {isPay
            ? "Order will be processed by the kitchen."
            : "Tap the tab on POS Home to settle payment later."}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  :root{color-scheme:dark}
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes popIn{from{transform:translateY(20px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
  @keyframes pulseGlow{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.7;transform:scale(1.05)}}
  .success-card{animation:popIn .5s cubic-bezier(.2,.8,.2,1)}
  .lg{position:relative;background:linear-gradient(180deg,rgba(255,255,255,0.06) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);border:1px solid rgba(255,255,255,0.07);box-shadow:inset 0 1px 0 rgba(255,255,255,0.16),inset 0 -1px 0 rgba(0,0,0,0.18),0 8px 24px rgba(0,0,0,0.28),0 24px 60px rgba(0,0,0,0.32)}
  .lg-brand{background:linear-gradient(180deg,var(--brand-primary,#FF6B35),var(--brand-secondary,#E55A2B));border:1px solid rgba(255,255,255,0.16);box-shadow:inset 0 1px 0 rgba(255,255,255,0.32),0 8px 24px color-mix(in srgb,var(--brand-primary,#FF6B35) 30%,transparent)}
  .pop{transition:transform .3s cubic-bezier(.2,.8,.2,1)}
  .pop:hover{transform:translateY(-2px)}
  .pop:active{transform:translateY(0) scale(.98)}
`;

const S = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse 60% 50% at 30% 20%, rgba(70,76,98,0.45) 0%, transparent 65%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(50,55,72,0.35) 0%, transparent 65%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    backgroundAttachment: "fixed",
    color: "#fff", fontFamily: "'Inter',sans-serif",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 24
  },
  card: { maxWidth: 520, width: "100%", textAlign: "center", padding: "44px 36px 32px", borderRadius: 28 },
  iconWrap: { position: "relative", width: 110, height: 110, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" },
  iconGlow: { position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.35), transparent 65%)", filter: "blur(24px)", animation: "pulseGlow 2.5s ease-in-out infinite" },
  icon: { position: "relative", zIndex: 1, fontSize: 80, lineHeight: 1, filter: "drop-shadow(0 8px 24px rgba(16,185,129,0.4))" },
  title: { fontFamily: "'Inter',sans-serif", fontSize: 28, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.8px", color: "#fff", margin: "0 0 6px" },
  orderId: { fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 2, marginBottom: 26, fontWeight: 500, fontFamily: "'Inter',sans-serif", textTransform: "uppercase" },
  // Big queue number — most prominent element on success screen
  queueBlock: {
    margin: "10px auto 22px",
    padding: "20px 28px 22px",
    borderRadius: 22,
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 55%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    border: "1px solid rgba(255,255,255,0.16)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 25%, transparent), 0 24px 60px color-mix(in srgb, var(--brand-primary,#FF6B35) 14%, transparent)",
    display: "inline-block",
    minWidth: 200,
  },
  queueLabel: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 2.5,
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    marginBottom: 6,
  },
  queueNumber: {
    fontSize: 64,
    fontWeight: 700,
    letterSpacing: "-2px",
    color: "#fff",
    fontFamily: "'Inter',sans-serif",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
    textShadow: "0 4px 16px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.55)",
  },
  queueHint: {
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    marginTop: 8,
    letterSpacing: 0.2,
    textShadow: "0 1px 2px rgba(0,0,0,0.4)",
  },
  details: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "8px 18px 14px", marginBottom: 24, textAlign: "left" },
  detailRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 },
  detailLabel: { color: "rgba(255,255,255,0.5)", fontWeight: 400, fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px" },
  detailVal: { color: "rgba(255,255,255,0.92)", fontWeight: 500, fontVariantNumeric: "tabular-nums" },
  statusPaid: { color: "#34D399", fontWeight: 600 },
  statusTab: { color: "rgba(255,255,255,0.85)", fontWeight: 600 },
  detailTotal: { fontFamily: "'Inter',sans-serif", fontSize: 22, fontWeight: 600, color: "#fff", letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" },
  actions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  anotherBtn: { color: "#fff", border: "none", borderRadius: 14, padding: "14px 18px", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: "-0.2px", cursor: "pointer" },
  doneBtn: { color: "rgba(255,255,255,0.7)", border: "none", borderRadius: 14, padding: "14px 18px", fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 500, letterSpacing: "-0.2px", cursor: "pointer" },
  hint: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 12, fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px" }
};
