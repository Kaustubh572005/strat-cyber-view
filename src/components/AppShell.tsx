import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  Newspaper,
  ShieldAlert,
  FileText,
  Building2,
  Landmark,
  Radar,
  ScanSearch,
  Presentation,
  Terminal,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Command Center", icon: LayoutDashboard },
  { to: "/intelligence", label: "Cyber Intelligence", icon: Radar },
  { to: "/archive/news", label: "News Archive", icon: Newspaper },
  { to: "/archive/certin", label: "CERT-In Advisories", icon: ShieldAlert },
  { to: "/archive/sebi", label: "SEBI Circulars", icon: FileText },
  { to: "/archive/nse", label: "NSE Cyber", icon: Building2 },
  { to: "/archive/bse", label: "BSE Cyber", icon: Landmark },
  { to: "/breach", label: "Breach Scanner", icon: ScanSearch },
  { to: "/presentations", label: "Presentations", icon: Presentation },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex text-foreground">
      <aside className="hidden lg:flex w-64 flex-col border-r border-border/60 bg-background/70 backdrop-blur-md sticky top-0 h-screen">
        <div className="px-5 py-6 flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold tracking-wide">
              Kaalu <span className="text-primary">AI</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Cyber Command
            </div>
          </div>
        </div>
        <nav className="px-3 py-2 flex-1 overflow-y-auto space-y-0.5">
          {NAV.map((n) => {
            const active =
              n.to === "/"
                ? pathname === "/"
                : pathname === n.to || pathname.startsWith(n.to + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border/60 text-[10px] text-muted-foreground font-mono">
          <div>SYS: online</div>
          <div className="text-primary">Feeds encrypted · TLS 1.3</div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile nav */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-background/85 backdrop-blur-md overflow-x-auto">
          {NAV.map((n) => {
            const active =
              n.to === "/"
                ? pathname === "/"
                : pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full border ${
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[1500px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
