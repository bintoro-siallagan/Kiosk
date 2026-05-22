// AdminShell.jsx — unified admin shell.
//
// Every admin surface (home, tools, command, reports, members, promo, shift,
// ESB, old Admin) is an internal `view` here instead of a separate top-level
// App scene. Phase 1 of the consolidation: routing only — the surface
// components and their own chrome are unchanged; their onBack/onNav/onExit
// callbacks are simply rewired to this shell's `nav()` instead of App.setScene.
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

  switch (view) {
    case "tools":
      return <AdminTools onBack={() => nav("home")} initialTab={toolsTab} />;
    case "command":
      return <CommandCenter />;
    case "admin":
      return <Admin initialTab={adminTab} adminSession={adminSession} onLogout={onLogout}
        onExit={() => nav("home")} onReport={() => nav("report")}
        onESBSync={() => nav("esb-sync")} onESBNotif={() => nav("esb-notif")}
        onMembers={() => nav("members")} onPromo={() => nav("promo")} onShift={() => nav("shift")}
        onTools={(tab) => nav(tab === "command" ? "command" : "tools", tab)} />;
    case "report":    return <Report onBack={() => nav("home")} />;
    case "esb-sync":  return <ESBSync onBack={() => nav("home")} />;
    case "esb-notif": return <ESBNotif onBack={() => nav("home")} />;
    case "members":   return <MemberList onBack={() => nav("home")} />;
    case "promo":     return <PromoManager onBack={() => nav("home")} />;
    case "shift":     return <ShiftManager onBack={() => nav("home")} />;
    default:
      return <AdminHome adminSession={adminSession} onLogout={onLogout}
        onExit={onExitKiosk} onNav={nav} />;
  }
}
