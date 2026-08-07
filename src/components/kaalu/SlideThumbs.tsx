import type { Block, DeckPlan, PlannedSlide } from "@/lib/pptx/types";

function BlockPreview({ block }: { block: Block }) {
  switch (block.kind) {
    case "paragraph":
      return (
        <div>
          {block.heading && <div className="text-[6px] font-semibold text-primary">{block.heading}</div>}
          <p className="line-clamp-4 text-[5.5px] leading-[1.5] text-foreground/80">{block.text}</p>
        </div>
      );
    case "bullets":
      return (
        <ul className="space-y-[2px]">
          {block.items.slice(0, 6).map((it, i) => (
            <li key={i} className="flex gap-1 text-[5.5px] leading-[1.4] text-foreground/80">
              <span className="mt-[2px] h-[2px] w-[2px] shrink-0 rounded-full bg-uti-orange" />
              <span className="line-clamp-2">{it}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-hidden rounded-[2px] border border-border">
          <div className="flex bg-primary text-[5px] font-semibold text-primary-foreground">
            {block.headers.slice(0, 6).map((h, i) => (
              <div key={i} className="flex-1 truncate px-1 py-[2px]">
                {h}
              </div>
            ))}
          </div>
          {block.rows.slice(0, 5).map((r, i) => (
            <div key={i} className="flex border-t border-border text-[5px]">
              {r.slice(0, 6).map((cell, j) => (
                <div key={j} className="flex-1 truncate px-1 py-[2px] text-foreground/75">
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    case "kpis":
      return (
        <div className="flex gap-1">
          {block.items.slice(0, 4).map((k, i) => (
            <div key={i} className="flex-1 rounded-[2px] bg-muted px-1 py-[3px] text-center">
              <div className="text-[8px] font-bold leading-none text-primary">{k.value}</div>
              <div className="truncate text-[4.5px] text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>
      );
    case "timeline":
      return (
        <div className="flex gap-1">
          {block.items.slice(0, 5).map((t, i) => (
            <div key={i} className="flex-1">
              <div className="h-[2px] w-full rounded bg-uti-orange" />
              <div className="mt-[2px] text-[5px] font-semibold text-primary">{t.when}</div>
              <div className="line-clamp-2 text-[4.5px] text-muted-foreground">{t.what}</div>
            </div>
          ))}
        </div>
      );
    case "chart": {
      const max = Math.max(...block.series.map((s) => Math.abs(s.value)), 1);
      return (
        <div>
          {block.chartTitle && <div className="text-[5px] font-semibold text-primary">{block.chartTitle}</div>}
          <div className="flex h-8 items-end gap-1">
            {block.series.slice(0, 6).map((s, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full rounded-t-[1px] bg-primary/80"
                  style={{ height: `${Math.max(6, (Math.abs(s.value) / max) * 100)}%` }}
                />
                <div className="w-full truncate text-center text-[4px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "twoCol":
      return (
        <div className="grid grid-cols-2 gap-1">
          {[block.left, block.right].map((col, i) => (
            <div key={i} className="rounded-[2px] bg-muted p-1">
              <div className="text-[5px] font-semibold text-primary">{col.heading}</div>
              {col.items.slice(0, 4).map((it, j) => (
                <div key={j} className="line-clamp-1 text-[4.5px] text-muted-foreground">
                  • {it}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function SlideThumb({
  slide,
  index,
  active,
  onClick,
}: {
  slide: PlannedSlide;
  index: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const dark = slide.kind === "title" || slide.kind === "divider" || slide.kind === "closing";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full overflow-hidden rounded-lg border text-left transition ${
        active ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-primary/50"
      }`}
    >
      <div
        className={`relative aspect-video w-full overflow-hidden p-2 ${
          dark ? "bg-primary text-primary-foreground" : "bg-card"
        }`}
      >
        {!dark && <div className="absolute left-0 top-0 h-[3px] w-full bg-uti-orange/80" />}
        <div className={`truncate text-[7px] font-semibold ${dark ? "" : "text-primary"}`}>{slide.title}</div>
        {slide.subtitle && (
          <div className={`truncate text-[5px] ${dark ? "opacity-80" : "text-muted-foreground"}`}>
            {slide.subtitle}
          </div>
        )}
        {!dark && (
          <div className="mt-1 space-y-1">
            {slide.blocks.slice(0, 3).map((b, i) => (
              <BlockPreview key={i} block={b} />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/50 px-2 py-1">
        <span className="truncate text-[10px] text-muted-foreground">
          {index + 1}. {slide.title}
        </span>
        <span className="shrink-0 rounded bg-background px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
          {slide.kind}
        </span>
      </div>
    </button>
  );
}

export function SlideThumbGrid({
  plan,
  activeIndex,
  onSelect,
}: {
  plan: DeckPlan;
  activeIndex?: number;
  onSelect?: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
      {plan.slides.map((s, i) => (
        <SlideThumb
          key={i}
          slide={s}
          index={i}
          active={activeIndex === i}
          onClick={() => onSelect?.(i)}
        />
      ))}
    </div>
  );
}
