export default function OrderTypePicker({ onPick, onCancel }) {
  return (
    <div style={S.root}>
      <style>{OT_CSS}</style>
      <div style={S.card}>
        <h1 style={S.title}>Select order type</h1>
        <p style={S.subtitle}>How will the customer enjoy their order?</p>

        <div style={S.grid}>
          <button onClick={() => onPick("dine-in")} className="lg ot-pop" style={S.option}>
            <div style={S.icon}>🍽️</div>
            <div style={S.optionTitle}>Dine-in</div>
            <div style={S.optionHint}>Eat at the restaurant</div>
          </button>
          <button onClick={() => onPick("take-away")} className="lg ot-pop" style={S.option}>
            <div style={S.icon}>🛍️</div>
            <div style={S.optionTitle}>Takeaway</div>
            <div style={S.optionHint}>Bring it home</div>
          </button>
        </div>

        <button onClick={onCancel} style={S.cancelLink}>✕ Cancel order</button>
      </div>
    </div>
  );
}

const OT_CSS = `
  :root{color-scheme:dark}
  *{box-sizing:border-box;margin:0;padding:0}
  @keyframes otFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .lg{
    position:relative;
    background:linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%);
    backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);
    border:1px solid rgba(255,255,255,0.07);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.14),inset 0 -1px 0 rgba(0,0,0,0.18),0 8px 24px rgba(0,0,0,0.24),0 24px 60px rgba(0,0,0,0.28);
  }
  .ot-pop{transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease;animation:otFadeIn .4s ease both}
  .ot-pop:hover{transform:translateY(-3px);box-shadow:inset 0 1px 0 rgba(255,255,255,0.18),inset 0 -1px 0 rgba(0,0,0,0.18),0 12px 32px rgba(0,0,0,0.32),0 32px 80px color-mix(in srgb,var(--brand-primary,#FF6B35) 22%,transparent)}
  .ot-pop:active{transform:translateY(-1px) scale(.99)}
  button{cursor:pointer;font-family:'Inter',sans-serif}
`;

const S = {
  root: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(70,76,98,0.45) 0%, transparent 70%), linear-gradient(160deg,#12141c 0%,#181b25 50%,#22253a 100%)",
    backgroundAttachment: "fixed",
    color: "#fff", fontFamily: "'Inter',sans-serif",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 24
  },
  card: { maxWidth: 640, width: "100%", textAlign: "center" },
  title: {
    fontFamily: "'Inter',sans-serif",
    fontSize: "min(40px,8vw)",
    fontWeight: 600,
    letterSpacing: "-1.2px",
    margin: "0 0 8px",
    color: "rgba(255,255,255,0.95)",
    lineHeight: 1.1
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    marginBottom: 36,
    fontWeight: 400,
    letterSpacing: "-0.2px"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,1fr)",
    gap: 16,
    marginBottom: 28
  },
  option: {
    border: "none",
    borderRadius: 22,
    padding: "44px 24px",
    color: "#fff",
    fontFamily: "inherit",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10
  },
  icon: {
    fontSize: 64,
    marginBottom: 4,
    filter: "drop-shadow(0 8px 20px rgba(0,0,0,0.35))"
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: 600,
    letterSpacing: "-0.4px",
    color: "rgba(255,255,255,0.95)"
  },
  optionHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: "-0.1px"
  },
  cancelLink: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 12,
    letterSpacing: "-0.1px"
  }
};
