import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Presentation, Upload, Sparkles, FileDown, PencilRuler } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/presentations")({
  head: () => ({
    meta: [
      { title: "AI Presentation Generator · Kaalu AI" },
      {
        name: "description",
        content:
          "Upload a PowerPoint template and generate on-brand executive briefings powered by AI.",
      },
    ],
  }),
  component: PresentationsPage,
});

function PresentationsPage() {
  const [template, setTemplate] = useState<File | null>(null);
  const [brief, setBrief] = useState("");

  return (
    <AppShell>
      <div className="max-w-4xl">
        <div className="text-xs uppercase tracking-[0.3em] text-primary/80 font-mono">
          /// briefing generator
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Presentation className="w-7 h-7 text-primary" /> Presentation Generator
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Upload your organisation's .pptx template — the generator preserves its layouts,
          theme, fonts, colours, headers/footers and master slides while the AI fills in the
          content you brief.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <label className="panel p-6 flex flex-col items-center justify-center text-center cursor-pointer border-dashed hover:border-primary/50 transition-colors">
            <Upload className="w-8 h-8 text-primary mb-3" />
            <div className="font-medium">
              {template ? template.name : "Upload PowerPoint template"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              .pptx up to 20 MB · your theme is preserved
            </div>
            <input
              type="file"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              onChange={(e) => setTemplate(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="panel p-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
              Template library
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {["Kaalu Executive (default)", "Board Briefing", "Incident Report"].map((t) => (
                <li key={t} className="flex items-center justify-between p-2 rounded border border-border/50">
                  <span>{t}</span>
                  <button className="text-xs text-primary hover:underline">Select</button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Additional templates can be added by an admin — the pipeline is designed to
              register new .pptx files as reusable presets.
            </p>
          </div>
        </div>

        <div className="mt-6 panel p-6">
          <label className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
            Briefing prompt
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="e.g. Board update on recent CERT-In advisories affecting BFSI, with recommended controls."
            className="mt-2 w-full rounded-md bg-background/60 border border-border p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-60 cursor-not-allowed"
              title="Available after backend wiring"
            >
              <Sparkles className="w-4 h-4" /> Generate presentation
            </button>
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent opacity-60 cursor-not-allowed"
            >
              <PencilRuler className="w-4 h-4" /> Edit slides
            </button>
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent opacity-60 cursor-not-allowed"
            >
              <FileDown className="w-4 h-4" /> Export .pptx / PDF
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Note: template preservation and export are being finished in the next pass — the UI
            and storage schema are ready for it.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
