import { useState } from "react";
import type { Block, DeckPlan, PlannedSlide } from "@/lib/pptx/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

const KIND_LABEL: Record<Block["kind"], string> = {
  paragraph: "Paragraph",
  bullets: "Bullets",
  table: "Table",
  kpis: "KPI cards",
  timeline: "Timeline",
  chart: "Bar chart",
  twoCol: "Two columns",
};

function blankBlock(kind: Block["kind"]): Block {
  switch (kind) {
    case "paragraph":
      return { kind: "paragraph", heading: "Overview", text: "" };
    case "table":
      return { kind: "table", headers: ["Item", "Owner", "Status"], rows: [["", "", ""]] };
    case "kpis":
      return { kind: "kpis", items: [{ label: "Metric", value: "0" }] };
    case "timeline":
      return { kind: "timeline", items: [{ when: "Q1", what: "Milestone" }] };
    case "chart":
      return { kind: "chart", chartTitle: "Chart", series: [{ label: "A", value: 10 }] };
    case "twoCol":
      return {
        kind: "twoCol",
        left: { heading: "Strengths", items: [""] },
        right: { heading: "Gaps", items: [""] },
      };
    default:
      return { kind: "bullets", items: [""] };
  }
}


function BlockEditor({
  block,
  onChange,
  onRemove,
}: {
  block: Block;
  onChange: (b: Block) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {KIND_LABEL[block.kind]}
        </span>
        <Button size="icon" variant="ghost" className="ml-auto h-6 w-6" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {block.kind === "paragraph" && (
        <div className="space-y-2">
          <Input
            value={block.heading ?? ""}
            onChange={(e) => onChange({ ...block, heading: e.target.value })}
            className="text-sm font-medium"
            placeholder="Heading (optional)"
          />
          <Textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            rows={4}
            className="text-sm"
            placeholder="Executive narrative paragraph"
          />
        </div>
      )}

      {block.kind === "bullets" && (
        <Textarea
          value={block.items.join("\n")}
          onChange={(e) => onChange({ kind: "bullets", items: e.target.value.split("\n") })}
          rows={Math.max(3, block.items.length)}
          className="text-sm"
          placeholder="One bullet per line"
        />
      )}

      {block.kind === "table" && (
        <div className="space-y-2">
          <Input
            value={block.headers.join(" | ")}
            onChange={(e) =>
              onChange({ ...block, headers: e.target.value.split("|").map((s) => s.trim()) })
            }
            className="text-sm font-medium"
            placeholder="Header 1 | Header 2"
          />
          <Textarea
            value={block.rows.map((r) => r.join(" | ")).join("\n")}
            onChange={(e) =>
              onChange({
                ...block,
                rows: e.target.value
                  .split("\n")
                  .map((line) => line.split("|").map((s) => s.trim())),
              })
            }
            rows={Math.max(3, block.rows.length)}
            className="text-sm"
            placeholder="Cell A | Cell B"
          />
          <p className="text-[11px] text-muted-foreground">Separate cells with “|”, one row per line.</p>
        </div>
      )}

      {block.kind === "kpis" && (
        <div className="space-y-2">
          <Textarea
            value={block.items.map((k) => [k.value, k.label, k.note ?? ""].join(" | ")).join("\n")}
            onChange={(e) =>
              onChange({
                kind: "kpis",
                items: e.target.value
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((line) => {
                    const [value = "", label = "", note = ""] = line.split("|").map((s) => s.trim());
                    return note ? { label, value, note } : { label, value };
                  }),
              })
            }
            rows={Math.max(3, block.items.length)}
            className="text-sm"
          />
          <p className="text-[11px] text-muted-foreground">value | label | optional note — one card per line.</p>
        </div>
      )}

      {block.kind === "timeline" && (
        <div className="space-y-2">
          <Textarea
            value={block.items.map((i) => `${i.when} | ${i.what}`).join("\n")}
            onChange={(e) =>
              onChange({
                kind: "timeline",
                items: e.target.value
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((line) => {
                    const [when = "", what = ""] = line.split("|").map((s) => s.trim());
                    return { when, what };
                  }),
              })
            }
            rows={Math.max(3, block.items.length)}
            className="text-sm"
          />
          <p className="text-[11px] text-muted-foreground">when | milestone — one per line.</p>
        </div>
      )}

      {block.kind === "chart" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={block.chartTitle ?? ""}
              onChange={(e) => onChange({ ...block, chartTitle: e.target.value })}
              placeholder="Chart title"
              className="text-sm"
            />
            <Input
              value={block.unit ?? ""}
              onChange={(e) => onChange({ ...block, unit: e.target.value })}
              placeholder="Unit (e.g. %)"
              className="text-sm"
            />
          </div>
          <Textarea
            value={block.series.map((s) => `${s.label} | ${s.value}`).join("\n")}
            onChange={(e) =>
              onChange({
                ...block,
                series: e.target.value
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((line) => {
                    const [label = "", value = "0"] = line.split("|").map((s) => s.trim());
                    return { label, value: Number(value) || 0 };
                  }),
              })
            }
            rows={Math.max(3, block.series.length)}
            className="text-sm"
          />
          <p className="text-[11px] text-muted-foreground">label | value — one bar per line.</p>
        </div>
      )}

      {block.kind === "twoCol" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(["left", "right"] as const).map((side) => (
            <div key={side} className="space-y-1">
              <Input
                value={block[side].heading}
                onChange={(e) =>
                  onChange({ ...block, [side]: { ...block[side], heading: e.target.value } })
                }
                className="text-sm font-medium"
              />
              <Textarea
                value={block[side].items.join("\n")}
                onChange={(e) =>
                  onChange({
                    ...block,
                    [side]: { ...block[side], items: e.target.value.split("\n") },
                  })
                }
                rows={Math.max(3, block[side].items.length)}
                className="text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeckPlanEditor({
  plan,
  onChange,
}: {
  plan: DeckPlan;
  onChange: (p: DeckPlan) => void;
}) {
  const [addKind, setAddKind] = useState<Block["kind"]>("bullets");

  function patchSlide(idx: number, patch: Partial<PlannedSlide>) {
    onChange({
      ...plan,
      slides: plan.slides.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  }
  function moveSlide(idx: number, dir: -1 | 1) {
    const next = [...plan.slides];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    const a = next[idx]!;
    const b = next[j]!;
    next[idx] = b;
    next[j] = a;
    onChange({ ...plan, slides: next });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={plan.deckTitle}
          onChange={(e) => onChange({ ...plan, deckTitle: e.target.value })}
          className="max-w-md text-lg font-semibold"
        />
        <Input
          value={plan.subtitle ?? ""}
          onChange={(e) => onChange({ ...plan, subtitle: e.target.value })}
          placeholder="Deck subtitle"
          className="max-w-xs text-sm"
        />
      </div>

      {plan.slides.map((slide, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Slide {i + 1} · {slide.kind}
            </span>
            <div className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(i, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveSlide(i, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => onChange({ ...plan, slides: plan.slides.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Input
            value={slide.title}
            onChange={(e) => patchSlide(i, { title: e.target.value })}
            className="font-semibold"
          />
          <Input
            value={slide.subtitle ?? ""}
            onChange={(e) => patchSlide(i, { subtitle: e.target.value })}
            placeholder="Subtitle / kicker (optional)"
            className="text-sm"
          />

          <div className="space-y-2">
            {slide.blocks.map((b, bi) => (
              <BlockEditor
                key={bi}
                block={b}
                onChange={(nb) =>
                  patchSlide(i, { blocks: slide.blocks.map((x, xi) => (xi === bi ? nb : x)) })
                }
                onRemove={() => patchSlide(i, { blocks: slide.blocks.filter((_, xi) => xi !== bi) })}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as Block["kind"])}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              {(Object.keys(KIND_LABEL) as Block["kind"][]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => patchSlide(i, { blocks: [...slide.blocks, blankBlock(addKind)] })}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add block
            </Button>
          </div>

          <Textarea
            value={slide.notes ?? ""}
            onChange={(e) => patchSlide(i, { notes: e.target.value })}
            placeholder="Speaker notes"
            rows={2}
            className="text-xs"
          />
        </div>
      ))}

      <Button
        variant="ghost"
        onClick={() =>
          onChange({
            ...plan,
            slides: [
              ...plan.slides,
              {
                layoutIndex: plan.slides[plan.slides.length - 1]?.layoutIndex ?? 1,
                kind: "content",
                title: "New slide",
                blocks: [{ kind: "bullets", items: ["Add a point"] }],
              },
            ],
          })
        }
      >
        <Plus className="h-4 w-4 mr-1" /> Add slide
      </Button>
    </section>
  );
}
