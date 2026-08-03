import { useEffect, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, RefreshCw, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UtiLogo } from "./UtiLogo";
import { supabase } from "@/integrations/supabase/client";

export function TopHeader() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    );
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries();
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-primary text-primary-foreground">
      <div className="flex items-center gap-4 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden shrink-0 rounded-md bg-white px-2 py-1 sm:block">
            <UtiLogo className="h-6" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">Kaalu AI</div>
            <div className="truncate text-[10px] uppercase tracking-[0.16em] opacity-80">
              Enterprise Cyber Intelligence Platform
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <form
            className="relative hidden md:block"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/cyber" });
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 opacity-70" />
            <Input
              placeholder="Search intelligence…"
              aria-label="Search intelligence"
              className="h-9 w-56 border-primary-foreground/25 bg-primary-foreground/10 pl-8 text-sm text-primary-foreground placeholder:text-primary-foreground/60 focus-visible:ring-primary-foreground/40"
            />
          </form>
          <span className="hidden text-xs opacity-85 lg:inline">{today}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh data"
            onClick={refresh}
            className="text-primary-foreground hover:bg-primary-foreground/15"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            onClick={() => navigate({ to: "/notifications" })}
            className="relative text-primary-foreground hover:bg-primary-foreground/15"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-uti-orange" />
          </Button>
          <button
            onClick={() => navigate({ to: "/settings" })}
            className="flex items-center gap-2 rounded-full border border-primary-foreground/25 py-1 pl-1 pr-3 transition hover:bg-primary-foreground/15"
            aria-label="Profile and settings"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-foreground/20">
              <User className="h-3.5 w-3.5" />
            </span>
            <span className="hidden max-w-32 truncate text-xs sm:inline">{email ?? "Profile"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
