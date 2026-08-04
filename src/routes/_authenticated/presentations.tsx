import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { planPptxDeck, buildPptxDeck } from "@/lib/pptx.functions";
import type { DeckPlan, TemplateBlueprint } from "@/lib/pptx/types";
import { BUILTIN_TEMPLATE_ID } from "@/lib/pptx/constants";
import { DeckPlanEditor } from "@/components/kaalu/DeckPlanEditor";
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
import { Presentation, Sparkles, Download, Trash2, Plus, ArrowUp, ArrowDown, Upload, Copy, Star, Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/presentations")({
  component: PresentationsPage,
  head: () => ({
    meta: [
      { title: "Smart PPT Generator | Kaalu AI" },
      {
        name: "description",
        content:
          "Template-aware AI presentation builder: analyses your corporate .pptx and generates dense, on-brand executive slides.",
      },
      { property: "og:title", content: "Smart PPT Generator | Kaalu AI" },
      {
        property: "og:description",
        content: "Generate on-brand executive decks from your own PowerPoint template.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PresentationsPage() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [templateId, setTemplateId] = useState<string>(BUILTIN_TEMPLATE_ID);
  const [plan, setPlan] = useState<DeckPlan | null>(null);
  const [blueprint, setBlueprint] = useState<TemplateBlueprint | null>(null);

  const planFn = useServerFn(planPptxDeck);
  const buildFn = useServerFn(buildPptxDeck);

  const planning = useMutation({
    mutationFn: () =>
      planFn({
        data: {
          templateId,
          topic,
          slideCount,
          audience: audience || undefined,
          tone: tone || undefined,
          extraContext: extraContext || undefined,
        },
      }),
    onSuccess: (res) => {
      setBlueprint(res.blueprint as TemplateBlueprint);
      setPlan(res.plan as DeckPlan);
      toast.success(`Plan ready · ${(res.plan as DeckPlan).slides.length} slides`);
    },
    onError: (e: Error) => toast.error(e.message || "Planning failed"),
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

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Deck Studio</div>
        <h1 className="text-3xl font-semibold mt-1 flex items-center gap-2">
          <Presentation className="h-6 w-6 text-primary" /> Smart PPT Generator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kaalu AI reads your PowerPoint template — masters, layouts, fonts, logos and colours — then writes dense,
          slide-specific content into it.
        </p>
      </header>

      <TemplateManager selectedTemplateId={templateId} onSelect={(id) => setTemplateId(id ?? BUILTIN_TEMPLATE_ID)} />

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Audience</label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Board / CISO / IT Ops" className="mt-1" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Tone</label>
            <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Executive, factual" className="mt-1" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">
              Slides: <span className="text-primary">{slideCount}</span>
            </label>
            <Slider value={[slideCount]} onValueChange={(v) => setSlideCount(v[0]!)} min={4} max={20} step={1} className="mt-3" />
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Context / data to use (optional)</label>
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
            <Sparkles className="h-4 w-4 mr-1" /> {planning.isPending ? "Analysing template…" : "Analyse template & plan deck"}
          </Button>
          <Button variant="secondary" onClick={() => building.mutate()} disabled={!plan || building.isPending}>
            <Download className="h-4 w-4 mr-1" /> {building.isPending ? "Building…" : "Export .pptx"}
          </Button>
        </div>

        {blueprint && (
          <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
            Template blueprint: {blueprint.layouts.length} layouts · fonts {blueprint.fonts.major}/{blueprint.fonts.minor} ·
            brand colours #{blueprint.colors.accent1} / #{blueprint.colors.accent4}
            {blueprint.footerText ? ` · footer preserved: “${blueprint.footerText}”` : ""}
          </div>
        )}
      </section>

      {plan && <DeckPlanEditor plan={plan} onChange={setPlan} />}
    </div>
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