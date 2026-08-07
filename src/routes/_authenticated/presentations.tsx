import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { planPptxDeck, buildPptxDeck, extractReferenceFiles } from "@/lib/pptx.functions";
import type { DeckPlan, TemplateBlueprint } from "@/lib/pptx/types";
import { BUILTIN_TEMPLATE_ID } from "@/lib/pptx/constants";
import { DeckPlanEditor } from "@/components/kaalu/DeckPlanEditor";
import { SlideThumbGrid } from "@/components/kaalu/SlideThumbs";
import {
  listTemplates,
  createTemplate,
  renameTemplate,
  deleteTemplate,
  duplicateTemplate,
  setDefaultTemplate,
  getTemplateDownloadUrl,
} from "@/lib/templates.functions";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Presentation,
  Sparkles,
  Download,
  Trash2,
  Upload,
  Copy,
  Star,
  Layers,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  Printer,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/presentations")({
  component: PresentationsPage,
  head: () => ({
    meta: [
      { title: "Smart PPT Generator | Kaalu AI" },
      {
        name: "description",
        content:
          "Template-aware AI presentation builder: analyses your corporate .pptx plus reference documents and generates dense, on-brand executive slides.",
      },
      { property: "og:title", content: "Smart PPT Generator | Kaalu AI" },
      {
        property: "og:description",
        content: "Generate on-brand executive decks from your own PowerPoint template and reference files.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const ACCEPT =
  ".pptx,.ppt,.pdf,.docx,.doc,.xlsx,.xlsm,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.vsdx,.zip";

type RefFile = {
  id: string;
  file: File;
  status: "pending" | "reading" | "ready" | "error";
  kind?: string;
  chars?: number;
  text?: string;
  error?: string;
};

function fileIcon(name: string) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return FileImage;
  if (["xlsx", "xlsm", "csv"].includes(ext)) return FileSpreadsheet;
  if (["pptx", "ppt"].includes(ext)) return Presentation;
  if (["pdf", "docx", "doc", "txt", "md"].includes(ext)) return FileText;
  return FileIcon;
}

function prettySize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function toBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(bin);
}

function printDeck(plan: DeckPlan) {
  const esc = (s: string) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blockHtml = (b: any): string => {
    switch (b.kind) {
      case "paragraph":
        return `${b.heading ? `<h3>${esc(b.heading)}</h3>` : ""}<p>${esc(b.text)}</p>`;
      case "bullets":
        return `<ul>${b.items.map((i: string) => `<li>${esc(i)}</li>`).join("")}</ul>`;
      case "table":
        return `<table><tr>${b.headers.map((h: string) => `<th>${esc(h)}</th>`).join("")}</tr>${b.rows
          .map((r: string[]) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("")}</table>`;
      case "kpis":
        return `<div class="kpis">${b.items
          .map((k: any) => `<div class="kpi"><b>${esc(k.value)}</b><span>${esc(k.label)}</span></div>`)
          .join("")}</div>`;
      case "timeline":
        return `<div class="kpis">${b.items
          .map((t: any) => `<div class="kpi"><b>${esc(t.when)}</b><span>${esc(t.what)}</span></div>`)
          .join("")}</div>`;
      case "chart":
        return `${b.chartTitle ? `<h3>${esc(b.chartTitle)}</h3>` : ""}<ul>${b.series
          .map((s: any) => `<li>${esc(s.label)}: <b>${esc(String(s.value))}${esc(b.unit ?? "")}</b></li>`)
          .join("")}</ul>`;
      case "twoCol":
        return `<div class="cols">${[b.left, b.right]
          .map(
            (c: any) =>
              `<div><h3>${esc(c.heading)}</h3><ul>${c.items.map((i: string) => `<li>${esc(i)}</li>`).join("")}</ul></div>`,
          )
          .join("")}</div>`;
      default:
        return "";
    }
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.deckTitle)}</title>
<style>
@page{size:A4 landscape;margin:12mm}
body{font-family:Segoe UI,Arial,sans-serif;color:#23272F;margin:0}
.slide{page-break-after:always;border-top:6px solid #F05A29;padding:18px 4px;min-height:150mm}
.slide h1{color:#074F9D;font-size:26px;margin:0 0 4px}
.slide .sub{color:#5A6373;font-size:14px;margin-bottom:14px}
h3{color:#074F9D;font-size:14px;margin:12px 0 4px}
p,li{font-size:13px;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:8px 0}
th{background:#074F9D;color:#fff;text-align:left;padding:5px 7px;font-size:12px}
td{border:1px solid #D8DEE9;padding:5px 7px;font-size:12px}
.kpis{display:flex;gap:10px;margin:8px 0}
.kpi{flex:1;background:#F4F6FA;border:1px solid #D8DEE9;border-radius:6px;padding:8px;text-align:center}
.kpi b{display:block;color:#074F9D;font-size:20px}
.kpi span{font-size:11px;color:#5A6373}
.cols{display:flex;gap:14px}
.cols>div{flex:1;background:#F4F6FA;border-radius:6px;padding:10px}
.notes{margin-top:10px;font-size:11px;color:#6B7280;font-style:italic}
</style></head><body>
${plan.slides
  .map(
    (s) =>
      `<section class="slide"><h1>${esc(s.title)}</h1>${s.subtitle ? `<div class="sub">${esc(s.subtitle)}</div>` : ""}${s.blocks
        .map(blockHtml)
        .join("")}${s.notes ? `<div class="notes">Speaker note: ${esc(s.notes)}</div>` : ""}</section>`,
  )
  .join("")}
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Allow pop-ups to export a PDF");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function PresentationsPage() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [mode, setMode] = useState<"quick" | "corporate" | "detailed">("corporate");
  const [detailLevel, setDetailLevel] = useState<"concise" | "balanced" | "dense">("balanced");
  const [presentationType, setPresentationType] = useState("Corporate briefing");
  const [language, setLanguage] = useState("English");
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeTables, setIncludeTables] = useState(true);
  const [includeTimelines, setIncludeTimelines] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [templateId, setTemplateId] = useState<string>(BUILTIN_TEMPLATE_ID);
  const [plan, setPlan] = useState<DeckPlan | null>(null);
  const [blueprint, setBlueprint] = useState<TemplateBlueprint | null>(null);
  const [refs, setRefs] = useState<RefFile[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [phase, setPhase] = useState<string>("");
  const [progress, setProgress] = useState(0);

  const planFn = useServerFn(planPptxDeck);
  const buildFn = useServerFn(buildPptxDeck);
  const extractFn = useServerFn(extractReferenceFiles);

  function applyMode(m: "quick" | "corporate" | "detailed") {
    setMode(m);
    if (m === "quick") {
      setSlideCount(7);
      setDetailLevel("concise");
    } else if (m === "corporate") {
      setSlideCount(12);
      setDetailLevel("balanced");
    } else {
      setSlideCount(24);
      setDetailLevel("dense");
    }
  }

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).slice(0, 10 - refs.length);
    if (!incoming.length) {
      toast.error("Up to 10 reference files");
      return;
    }
    const entries: RefFile[] = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
    }));
    setRefs((r) => [...r, ...entries]);

    for (const entry of entries) {
      if (entry.file.size > 15 * 1024 * 1024) {
        setRefs((r) =>
          r.map((x) => (x.id === entry.id ? { ...x, status: "error", error: "Over 15 MB" } : x)),
        );
        continue;
      }
      setRefs((r) => r.map((x) => (x.id === entry.id ? { ...x, status: "reading" } : x)));
      try {
        const base64 = await toBase64(entry.file);
        const res = await extractFn({
          data: { files: [{ name: entry.file.name, mime: entry.file.type, base64 }] },
        });
        const d = res.digests[0]!;
        setRefs((r) =>
          r.map((x) =>
            x.id === entry.id
              ? { ...x, status: "ready", kind: d.kind, chars: d.chars, text: d.text }
              : x,
          ),
        );
      } catch (e) {
        setRefs((r) =>
          r.map((x) =>
            x.id === entry.id
              ? { ...x, status: "error", error: e instanceof Error ? e.message : "Read failed" }
              : x,
          ),
        );
      }
    }
  }

  const planning = useMutation({
    mutationFn: async () => {
      setPhase("Analysing template & reference material…");
      setProgress(35);
      const res = await planFn({
        data: {
          templateId,
          topic,
          slideCount,
          audience: audience || undefined,
          tone: tone || undefined,
          extraContext: extraContext || undefined,
          references: refs
            .filter((r) => r.status === "ready" && r.text)
            .map((r) => ({ name: r.file.name, kind: r.kind!, chars: r.chars!, text: r.text! })),
          controls: {
            mode,
            detailLevel,
            presentationType,
            language,
            includeCharts,
            includeTables,
            includeTimelines,
            includeNotes,
          },
        },
      });
      setProgress(90);
      return res;
    },
    onSuccess: (res) => {
      setBlueprint(res.blueprint as TemplateBlueprint);
      setPlan(res.plan as DeckPlan);
      setActiveSlide(0);
      setProgress(100);
      setPhase("");
      toast.success(`Plan ready · ${(res.plan as DeckPlan).slides.length} slides`);
    },
    onError: (e: Error) => {
      setProgress(0);
      setPhase("");
      toast.error(e.message || "Planning failed");
    },
  });

  const building = useMutation({
    mutationFn: () => buildFn({ data: { templateId, plan } }),
    onSuccess: (res) => {
      const bin = Uint8Array.from(atob(res.base64), (ch) => ch.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bin], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Deck exported in your template");
    },
    onError: (e: Error) => toast.error(e.message || "Export failed"),
  });

  const readyRefs = refs.filter((r) => r.status === "ready");
  const templateRef = refs.find((r) => /\.pptx?$/i.test(r.file.name));

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6 lg:p-8">
      <header className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Deck Studio</div>
        <h1 className="mt-1 flex min-w-0 items-center gap-2 text-2xl font-semibold md:text-3xl">
          <Presentation className="h-6 w-6 shrink-0 text-primary" />
          <span className="truncate">Smart PPT Generator</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kaalu AI reads your PowerPoint template — masters, layouts, fonts, logos and colours — plus any reference
          documents you upload, then writes dense, slide-specific content into it.
        </p>
      </header>

      <TemplateManager selectedTemplateId={templateId} onSelect={(id) => setTemplateId(id ?? BUILTIN_TEMPLATE_ID)} />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ---------------- LEFT: workspace ---------------- */}
        <div className="min-w-0 space-y-5">
          <ReferencePanel refs={refs} onAdd={addFiles} onRemove={(id) => setRefs((r) => r.filter((x) => x.id !== id))} />

          <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Topic</label>
              <Textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. DPDP Act compliance readiness for UTI AMC"
                className="mt-1"
                rows={2}
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Generation mode</label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    ["quick", "Quick Deck", "5–10 slides · exec summary"],
                    ["corporate", "Corporate", "Meeting-ready, uses template"],
                    ["detailed", "Detailed Report", "20+ slides, charts & annexures"],
                  ] as const
                ).map(([key, label, hint]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyMode(key)}
                    className={`min-w-0 rounded-lg border p-2.5 text-left transition ${
                      mode === key ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="truncate text-sm font-medium">{label}</div>
                    <div className="text-[11px] text-muted-foreground">{hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="min-w-0">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Audience</label>
                <Input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="Board / CISO / IT Ops"
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Tone</label>
                <Input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="Executive, factual"
                  className="mt-1"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Presentation type</label>
                <Select value={presentationType} onValueChange={setPresentationType}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Corporate briefing",
                      "Board / Risk review",
                      "Cybersecurity report",
                      "SEBI regulatory update",
                      "CERT-In briefing",
                      "Audit report",
                      "Training deck",
                    ].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Detail level</label>
                <Select value={detailLevel} onValueChange={(v) => setDetailLevel(v as typeof detailLevel)}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="balanced">Balanced</SelectItem>
                    <SelectItem value="dense">Dense (fill every slide)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Language</label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["English", "Hindi", "Marathi", "Gujarati"].map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Slides: <span className="text-primary">{slideCount}</span>
                </label>
                <Slider
                  value={[slideCount]}
                  onValueChange={(v) => setSlideCount(v[0]!)}
                  min={4}
                  max={50}
                  step={1}
                  className="mt-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Charts", includeCharts, setIncludeCharts],
                  ["Tables", includeTables, setIncludeTables],
                  ["Timelines", includeTimelines, setIncludeTimelines],
                  ["Speaker notes", includeNotes, setIncludeNotes],
                ] as const
              ).map(([label, val, set]) => (
                <label
                  key={label}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="truncate text-xs">{label}</span>
                  <Switch checked={val} onCheckedChange={(v) => (set as (b: boolean) => void)(v)} />
                </label>
              ))}
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Instructions / data to use (optional)
              </label>
              <Textarea
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                placeholder="Paste metrics, findings or circular references the deck must reflect."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => planning.mutate()} disabled={!topic.trim() || planning.isPending}>
                <Sparkles className="mr-1 h-4 w-4" />
                {planning.isPending ? "Generating…" : "Generate presentation"}
              </Button>
              <Button variant="secondary" onClick={() => building.mutate()} disabled={!plan || building.isPending}>
                <Download className="mr-1 h-4 w-4" /> {building.isPending ? "Building…" : "Export .pptx"}
              </Button>
              <Button variant="outline" onClick={() => plan && printDeck(plan)} disabled={!plan}>
                <Printer className="mr-1 h-4 w-4" /> Export PDF
              </Button>
            </div>

            {planning.isPending && (
              <div className="space-y-1">
                <Progress value={progress} className="h-1.5" />
                <div className="text-[11px] text-muted-foreground">{phase}</div>
              </div>
            )}

            {blueprint && (
              <div className="border-t border-border pt-3 text-[11px] text-muted-foreground">
                Template blueprint: {blueprint.layouts.length} layouts · fonts {blueprint.fonts.major}/
                {blueprint.fonts.minor} · brand colours #{blueprint.colors.accent1} / #{blueprint.colors.accent4}
                {blueprint.footerText ? ` · footer preserved: “${blueprint.footerText}”` : ""}
              </div>
            )}
          </section>
        </div>

        {/* ---------------- RIGHT: preview ---------------- */}
        <aside className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5 xl:sticky xl:top-20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Preview</div>
              <h2 className="truncate text-lg font-semibold">{plan?.deckTitle || "Slide thumbnails"}</h2>
            </div>
            {plan && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {plan.slides.length} slides
              </span>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground">
            {readyRefs.length > 0 ? (
              <>
                References used: {readyRefs.map((r) => r.file.name).join(", ")}
                {templateRef ? " · PowerPoint reference treated as the master template style guide" : ""}
              </>
            ) : (
              "No reference files — the deck will be generated from your topic and instructions."
            )}
          </div>

          {plan ? (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <SlideThumbGrid plan={plan} activeIndex={activeSlide} onSelect={setActiveSlide} />
            </div>
          ) : (
            <div className="grid place-items-center rounded-lg border border-dashed border-border py-14 text-center">
              <div className="text-sm text-muted-foreground">
                {planning.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Building your slides…
                  </span>
                ) : (
                  "Slide thumbnails appear here once you generate a deck."
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {plan && <DeckPlanEditor plan={plan} onChange={setPlan} />}
    </div>
  );
}

function ReferencePanel({
  refs,
  onAdd,
  onRemove,
}: {
  refs: RefFile[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Reference Engine</div>
          <h2 className="text-lg font-semibold">Reference files</h2>
          <p className="text-xs text-muted-foreground">
            PPT, PDF, Word, Excel, CSV, TXT, Markdown and images. Used as reading material for the AI — your template
            and theme stay unchanged.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-1 h-4 w-4" /> Browse files
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
        <div className="mt-1 text-sm">Drag &amp; drop reference files here</div>
        <div className="text-[11px] text-muted-foreground">Up to 10 files · 15 MB each</div>
      </div>

      {refs.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {refs.map((r) => {
            const Icon = fileIcon(r.file.name);
            return (
              <div
                key={r.id}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.file.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {prettySize(r.file.size)}
                    {r.status === "reading" && " · reading…"}
                    {r.status === "ready" && ` · ${r.kind} · ${r.chars?.toLocaleString()} chars extracted`}
                    {r.status === "error" && ` · ${r.error}`}
                  </div>
                </div>
                {r.status === "reading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                {r.status === "ready" && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                {r.status === "error" && <X className="h-4 w-4 shrink-0 text-destructive" />}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  aria-label={`Remove ${r.file.name}`}
                  onClick={() => onRemove(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}



function TemplateManager({
  selectedTemplateId,
  onSelect,
}: {
  selectedTemplateId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const createFn = useServerFn(createTemplate);
  const renameFn = useServerFn(renameTemplate);
  const deleteFn = useServerFn(deleteTemplate);
  const duplicateFn = useServerFn(duplicateTemplate);
  const setDefaultFn = useServerFn(setDefaultTemplate);
  const downloadFn = useServerFn(getTemplateDownloadUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["pptx-templates"],
    queryFn: () => listFn(),
  });

  async function handleUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      toast.error("Only .pptx files are supported");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Template must be under 25 MB");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sign in required");
      const path = `${userData.user.id}/${crypto.randomUUID()}.pptx`;
      const { error } = await supabase.storage
        .from("pptx-templates")
        .upload(path, file, {
          contentType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        });
      if (error) throw error;
      await createFn({
        data: {
          name: file.name.replace(/\.pptx$/i, ""),
          storage_path: path,
          size_bytes: file.size,
        },
      });
      toast.success("Template uploaded");
      qc.invalidateQueries({ queryKey: ["pptx-templates"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function preview(id: string) {
    try {
      const { url, name } = await downloadFn({ data: { id } });
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.download = `${name}.pptx`;
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  return (
    <section className="glass rounded-xl p-5 border border-border">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Template Manager</div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mt-0.5">
            <Layers className="h-4 w-4 text-primary" /> Presentation templates
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a .pptx to reuse its theme, fonts, and layouts. The AI outline slots into your chosen template.
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" /> {uploading ? "Uploading…" : "Upload .pptx"}
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          No templates yet. Upload one to keep your decks on-brand.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          <button
            onClick={() => onSelect(null)}
            className={`text-left rounded-lg p-3 border transition ${
              selectedTemplateId === null ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"
            }`}
          >
            <div className="text-sm font-medium">Kaalu default</div>
            <div className="text-[11px] text-muted-foreground">Built-in themed generator</div>
          </button>
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              selected={selectedTemplateId === t.id}
              onSelect={() => onSelect(t.id)}
              onRename={async (name) => {
                await renameFn({ data: { id: t.id, name } });
                qc.invalidateQueries({ queryKey: ["pptx-templates"] });
              }}
              onDelete={async () => {
                if (!window.confirm(`Delete "${t.name}"?`)) return;
                await deleteFn({ data: { id: t.id } });
                if (selectedTemplateId === t.id) onSelect(null);
                toast.success("Template deleted");
                qc.invalidateQueries({ queryKey: ["pptx-templates"] });
              }}
              onDuplicate={async () => {
                await duplicateFn({ data: { id: t.id } });
                toast.success("Template duplicated");
                qc.invalidateQueries({ queryKey: ["pptx-templates"] });
              }}
              onSetDefault={async () => {
                await setDefaultFn({ data: { id: t.id } });
                toast.success("Set as default");
                qc.invalidateQueries({ queryKey: ["pptx-templates"] });
              }}
              onPreview={() => preview(t.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
  onRename,
  onDelete,
  onDuplicate,
  onSetDefault,
  onPreview,
}: {
  template: {
    id: string;
    name: string;
    is_default: boolean;
    size_bytes: number;
    created_at: string;
  };
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetDefault: () => void;
  onPreview: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  return (
    <div
      className={`rounded-lg p-3 border transition ${
        selected ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"
      }`}
    >
      <button onClick={onSelect} className="text-left w-full">
        <div className="flex items-center gap-2">
          {editing ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={async () => {
                setEditing(false);
                if (name.trim() && name !== template.name) await onRename(name.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setName(template.name);
                  setEditing(false);
                }
              }}
              className="h-6 text-sm"
            />
          ) : (
            <div className="text-sm font-medium truncate flex items-center gap-1">
              {template.is_default && <Star className="h-3.5 w-3.5 text-primary fill-primary" />}
              {template.name}
            </div>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {(template.size_bytes / 1024).toFixed(0)} KB · {new Date(template.created_at).toLocaleDateString()}
        </div>
      </button>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onPreview}>
          <Download className="h-3 w-3 mr-1" /> Preview
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onDuplicate}>
          <Copy className="h-3 w-3 mr-1" /> Duplicate
        </Button>
        {!template.is_default && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={onSetDefault}>
            <Star className="h-3 w-3 mr-1" /> Default
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}