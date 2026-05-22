// AdminShell.jsx — unified admin shell.
//
// Every admin surface (home, tools, command, reports, members, promo, shift,
// ESB, old Admin) is an internal `view` here instead of a separate top-level
// App scene.
//
// Phase 1: routing — surfaces are internal views, not App scenes.
// Phase 2: a single shell-level "Home" affordance — a persistent floating
//   button shown on every non-home view, so there is always one consistent
//   way back to AdminHome (the surface components are still untouched; most
//   are position:fixed full-screen, so the shell sits above them).
import { useState } from "react";
import AdminHome from "./AdminHome.jsx";
import AdminTools from "./AdminTools.jsx";
import Admin from "./Admin.jsx";
import CommandCenter from "./CommandCenter.jsx";
import Report from "./Report.jsx";
import ESBSync from "./ESBSync.jsx";
import ESBNotif from "./ESBNotif.jsx";
import MemberList from "./MemberList.jsx";
import PromoManager from "./PromoManager.jsx";
import ShiftManager from "./ShiftManager.jsx";

const homeFab = {
  position: "fixed", left: 16, bottom: 16, zIndex: 100000,
  display: "flex", alignItems: "center", gap: 6,
  background: "#f59e0b", color: "#1a1205", border: "none", borderRadius: 999,
  padding: "10px 17px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
  boxShadow: "0 6px 20px rgba(0,0,0,.55)",
};

export default function AdminShell({ initialView = "home", adminSession, onLogout, onExitKiosk }) {
  const [view, setView] = useState(initialView);
  const [toolsTab, setToolsTab] = useState("dashboard");
  const [adminTab, setAdminTab] = useState("overview");

  // single navigation entry point — replaces App-level setScene for admin
  const nav = (v, arg) => {
    if (v === "tools") setToolsTab(arg || "dashboard");
    if (v === "admin") setAdminTab(arg || "overview");
    setView(v || "home");
  };

  let surface, atHome = false;
  switch (view) {
    case "tools":
      surface = <AdminTools onBack={() => nav("home")} initialTab={toolsTab} />;
      break;
    case "command":
      surface = <CommandCenter />;
      break;
    case "admin":
      surface = <Admin initialTab={adminTab} adminSession={adminSession} onLogout={onLogout}
        onExit={() => nav("home")} onReport={() => nav("report")}
        onESBSync={() => nav("esb-sync")} onESBNotif={() => nav("esb-notif")}
        onMembers={() => nav("members")} onPromo={() => nav("promo")} onShift={() => nav("shift")}
        onTools={(tab) => nav(tab === "command" ? "command" : "tools", tab)} />;
      break;
    case "report":    surface = <Report onBack={() => nav("home")} />; break;
    case "esb-sync":  surface = <ESBSync onBack={() => nav("home")} />; break;
    case "esb-notif": surface = <ESBNotif onBack={() => nav("home")} />; break;
    case "members":   surface = <MemberList onBack={() => nav("home")} />; break;
    case "promo":     surface = <PromoManager onBack={() => nav("home")} />; break;
    case "shift":     surface = <ShiftManager onBack={() => nav("home")} />; break;
    default:
      surface = <AdminHome adminSession={adminSession} onLogout={onLogout}
        onExit={onExitKiosk} onNav={nav} />;
      atHome = true;
  }

  return (
    <>
      {surface}
      {!atHome && (
        <button onClick={() => nav("home")} style={homeFab} title="Kembali ke AdminHome">
          🏠 Home
        </button>
      )}
    </>
  );
}
