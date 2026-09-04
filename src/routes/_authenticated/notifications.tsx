import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listNotifications,
  dismissNotification,
  dismissAllNotifications,
} from "@/lib/notifications.functions";
import { Bell, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

const sourceLabels: Record<string, string> = {
  "sebi-whats-new": "SEBI",
  "cert-in": "CERT-In",
  "nse-cyber": "NSE",
  "cyber-news": "Cyber News",
  "ai-news": "AI",
};

function NotificationsPage() {
  const get = useServerFn(listNotifications);
  const dismiss = useServerFn(dismissNotification);
  const dismissAll = useServerFn(dismissAllNotifications);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => get({ data: { limit: 200 } }),
    refetchInterval: 6 * 60 * 60 * 1000,
    staleTime: 30_000,
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => dismiss({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const dismissAllMut = useMutation({
    mutationFn: () => dismissAll(),
    onSuccess: (r) => {
      toast.success(`Dismissed ${r.count} notification${r.count === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.dismissed);
  const read = items.filter((n) => n.dismissed);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Notification Center</div>
          <h1 className="text-3xl font-semibold neon-text mt-1">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unread.length} unread · {items.length} total. Unread notifications stay here until you dismiss them.
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={() => dismissAllMut.mutate()}
            disabled={dismissAllMut.isPending}
            className="text-xs text-muted-foreground hover:text-primary border border-border rounded-full px-3 py-1.5 hover:bg-muted"
          >
            Dismiss all
          </button>
        )}
      </header>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="glass rounded-xl border border-border p-12 text-center text-sm text-muted-foreground">
          <Bell className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
          No notifications yet. New items will appear here as syncs run.
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {unread.map((n) => (
              <li
                key={n.id}
                className="glass rounded-xl p-3 border border-primary/20 flex items-start gap-3"
              >
                <span className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary shrink-0 mt-0.5">
                  {sourceLabels[n.source_key] ?? n.source_key}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium line-clamp-2">{n.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
                {n.link && (
                  <a
                    href={n.link.startsWith("http") ? n.link : n.link}
                    target={n.link.startsWith("http") ? "_blank" : undefined}
                    rel="noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  onClick={() => dismissMut.mutate(n.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {read.length > 0 && (
            <>
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground mt-6">Dismissed</h2>
              <ul className="space-y-1 opacity-60">
                {read.slice(0, 40).map((n) => (
                  <li key={n.id} className="text-xs flex items-center gap-2 py-1">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
                      {sourceLabels[n.source_key] ?? n.source_key}
                    </span>
                    <span className="line-clamp-1">{n.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
