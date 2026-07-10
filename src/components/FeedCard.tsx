import { Link } from "@tanstack/react-router";
import { ExternalLink, Clock, Sparkles } from "lucide-react";
import type { FeedItemDTO } from "@/lib/feeds.functions";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const sevClass: Record<string, string> = {
  critical: "border-critical/60 text-critical bg-critical/10",
  high: "border-high/60 text-high bg-high/10",
  medium: "border-medium/60 text-medium bg-medium/10",
  low: "border-low/60 text-low bg-low/10",
};

export function FeedCard({ item, compact = false }: { item: FeedItemDTO; compact?: boolean }) {
  const sum = item.ai_summary ?? item.description ?? "Summary pending — open article to generate.";
  return (
    <Link
      to="/article/$id"
      params={{ id: item.id }}
      className="group panel p-4 flex flex-col gap-2 hover:border-primary/50 transition-colors relative"
    >
      <div className="flex items-center gap-2 text-xs">
        {item.publisher && (
          <span className="chip text-primary/90 border-primary/30">{item.publisher}</span>
        )}
        {item.severity && (
          <span className={`chip ${sevClass[item.severity] ?? ""}`}>{item.severity}</span>
        )}
        {item.is_new && (
          <span className="chip border-neon/60 text-neon bg-neon/10">
            <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" /> New
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" /> {timeAgo(item.published_at ?? item.first_seen_at)}
        </span>
      </div>
      <h3
        className={`font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors ${
          compact ? "text-sm line-clamp-2" : "text-[15px] line-clamp-3"
        }`}
      >
        {item.title}
      </h3>
      {!compact && (
        <p className="text-xs text-muted-foreground line-clamp-3 flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 mt-0.5 text-primary/70 shrink-0" />
          <span>{sum}</span>
        </p>
      )}
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          AI Summary
        </span>
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
      </div>
    </Link>
  );
}

export function EmptyFeed({ label }: { label: string }) {
  return (
    <div className="panel p-6 text-sm text-muted-foreground text-center">
      Monitoring {label}. New items will appear here as soon as the source publishes.
    </div>
  );
}
