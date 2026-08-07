import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ScrollTabItem = { key: string; label: string; count?: number };

export function ScrollTabs({
  items,
  activeKey,
  onSelect,
  size = "md",
}: {
  items: ScrollTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  size?: "sm" | "md";
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setOverflow({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  // keep the selected tab visible
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(activeKey)}"]`);
    el?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [activeKey]);

  function nudge(dir: -1 | 1) {
    railRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  }

  return (
    <div className="relative min-w-0">
      {overflow.left && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => nudge(-1)}
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/95 p-1 shadow-sm"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      {overflow.right && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => nudge(1)}
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/95 p-1 shadow-sm"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        ref={railRef}
        onScroll={measure}
        onWheel={(e) => {
          const el = railRef.current;
          if (!el) return;
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            el.scrollLeft += e.deltaY;
          }
        }}
        className="no-scrollbar flex snap-x gap-1.5 overflow-x-auto scroll-smooth px-6"
      >
        {items.map((it) => {
          const active = it.key === activeKey;
          return (
            <button
              key={it.key}
              data-key={it.key}
              type="button"
              onClick={() => onSelect(it.key)}
              className={`shrink-0 snap-start whitespace-nowrap rounded-full border transition ${
                size === "sm" ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm"
              } ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:border-primary/50"
              }`}
            >
              {it.label}
              {typeof it.count === "number" && (
                <span className={`ml-1.5 text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {it.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
