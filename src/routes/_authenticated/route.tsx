import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/kaalu/Sidebar";
import { StarField } from "@/components/kaalu/StarField";
import { TopHeader } from "@/components/kaalu/TopHeader";
import { AppFooter } from "@/components/kaalu/AppFooter";
import { SplashScreen } from "@/components/kaalu/SplashScreen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const { data: lastSync } = useQuery({
    queryKey: ["last-sync"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_runs")
        .select("finished_at")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.finished_at ?? null;
    },
    staleTime: 60_000,
  });

  return (
    <div className="relative min-h-screen w-full text-foreground">
      <StarField />
      <SplashScreen />
      <div className="relative z-10 flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopHeader />
          <main className="flex-1 min-w-0">
            <Outlet />
          </main>
          <AppFooter lastSync={lastSync ?? null} />
        </div>
      </div>
    </div>
  );
}
