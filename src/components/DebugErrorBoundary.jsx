// Debug error boundary — display error visibly in UI sehingga gak perlu lihat console
// Wrap component yang suspected error untuk catch + tampilkan stack.
import { Component } from "react";

export default class DebugErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[DebugErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", background: "#0a0e16", color: "#fff",
          padding: 24, fontFamily: "'Inter',sans-serif",
          display: "flex", flexDirection: "column", gap: 16,
        }}>
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "2px solid #ef4444",
            borderRadius: 12, padding: 20,
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#fca5a5", marginBottom: 12 }}>
              {this.props.label || "Error"} — {this.state.error?.name || "RenderError"}
            </div>
            <div style={{
              background: "#000", padding: 14, borderRadius: 8,
              fontFamily: "monospace", fontSize: 13, color: "#fbbf24",
              wordBreak: "break-word", whiteSpace: "pre-wrap", marginBottom: 14,
              lineHeight: 1.6,
            }}>
              {this.state.error?.message || String(this.state.error) || "(no message)"}
            </div>
            {this.state.errorInfo?.componentStack && (
              <details>
                <summary style={{ cursor: "pointer", color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>Component stack</summary>
                <pre style={{
                  background: "#000", padding: 10, borderRadius: 8,
                  fontFamily: "monospace", fontSize: 11, color: "#9ca3af",
                  overflow: "auto", maxHeight: 240, lineHeight: 1.5,
                }}>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}
            {this.state.error?.stack && (
              <details>
                <summary style={{ cursor: "pointer", color: "#9ca3af", fontSize: 12, marginTop: 8, marginBottom: 8 }}>Error stack</summary>
                <pre style={{
                  background: "#000", padding: 10, borderRadius: 8,
                  fontFamily: "monospace", fontSize: 11, color: "#9ca3af",
                  overflow: "auto", maxHeight: 240, lineHeight: 1.5,
                }}>{this.state.error.stack}</pre>
              </details>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => location.reload()} style={{
              background: "#fbbf24", color: "#1a1205", border: "none",
              borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}>↻ Reload</button>
            <button onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })} style={{
              background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}>Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
