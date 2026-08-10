import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listPresentationProfiles,
  savePresentationProfile,
  deletePresentationProfile,
  duplicatePresentationProfile,
  type PresentationProfile,
} from "@/lib/profiles.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookMarked,
  Plus,
  Copy,
  Trash2,
  Star,
  Download,
  Upload,
  Pencil,
  Save,
} from "lucide-react";
import { toast } from "sonner";

const RULE_LIBRARY = [
  "Use executive summaries",
  "Prefer tables over bullet points",
  "Generate charts wherever possible",
  "Preserve uploaded template layouts",
  "Use concise language",
  "Expand technical sections",
  "Include speaker notes",
  "Keep branding unchanged",
  "Generate risk matrices",
  "Generate timelines",
  "Reuse tables from uploaded documents verbatim",
  "Quote regulatory references exactly",
];

const STARTERS = [
  "UTI AMC Board Meeting",
  "Technology Advisory Committee",
  "Cybersecurity Incident Report",
  "SEBI Compliance Review",
  "CERT-In Advisory Summary",
  "Risk Committee Presentation",
  "Quarterly Management Review",
  "Audit Presentation",
];

type Draft = {
  id?: string;
  name: string;
  description: string;
  audience: string;
  presentationType: string;
  tone: string;
  language: string;
  contentRules: string[];
  instructions: string;
  isDefault: boolean;
};

const emptyDraft = (name = ""): Draft => ({
  name,
  description: "",
  audience: "",
  presentationType: "Corporate briefing",
  tone: "Executive, factual",
  language: "English",
  contentRules: [],
  instructions: "",
  isDefault: false,
});

const toDraft = (p: PresentationProfile): Draft => ({
  id: p.id,
  name: p.name,
  description: p.description ?? "",
  audience: p.audience ?? "",
  presentationType: p.presentation_type ?? "",
  tone: p.tone ?? "",
  language: p.language ?? "English",
  contentRules: p.content_rules ?? [],
  instructions: p.instructions ?? "",
  isDefault: p.is_default,
});

export function ProfileBar({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (p: PresentationProfile | null) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPresentationProfiles);
  const saveFn = useServerFn(savePresentationProfile);
  const delFn = useServerFn(deletePresentationProfile);
  const dupFn = useServerFn(duplicatePresentationProfile);
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [customRule, setCustomRule] = useState("");

  const { data: profiles = [] } = useQuery({
    queryKey: ["presentation-profiles"],
    queryFn: () => listFn(),
  });

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const save = useMutation({
    mutationFn: (d: Draft) =>
      saveFn({
        data: {
          id: d.id,
          name: d.name.trim(),
          description: d.description || null,
          audience: d.audience || null,
          presentationType: d.presentationType || null,
          tone: d.tone || null,
          language: d.language || "English",
          contentRules: d.contentRules,
          instructions: d.instructions || null,
          controls: {},
          isDefault: d.isDefault,
        },
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["presentation-profiles"] });
      onSelect(p);
      setOpen(false);
      toast.success("Profile saved");
    },
    onError: (e: Error) => toast.error(e.message || "Could not save profile"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["presentation-profiles"] });
      onSelect(null);
      toast.success("Profile deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["presentation-profiles"] });
      onSelect(p);
      toast.success("Profile duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportProfile(p: PresentationProfile) {
    const blob = new Blob([JSON.stringify(toDraft(p), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[^a-z0-9]+/gi, "_")}.kaalu-profile.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importProfile(file: File) {
    try {
      const raw = JSON.parse(await file.text());
      save.mutate({
        ...emptyDraft(String(raw.name || file.name.replace(/\..*$/, ""))),
        description: String(raw.description ?? ""),
        audience: String(raw.audience ?? ""),
        presentationType: String(raw.presentationType ?? "Corporate briefing"),
        tone: String(raw.tone ?? ""),
        language: String(raw.language ?? "English"),
        contentRules: Array.isArray(raw.contentRules) ? raw.contentRules.map(String) : [],
        instructions: String(raw.instructions ?? ""),
        isDefault: false,
      });
    } catch {
      toast.error("That file is not a valid profile export");
    }
  }

  const toggleRule = (rule: string) =>
    setDraft((d) => ({
      ...d,
      contentRules: d.contentRules.includes(rule)
        ? d.contentRules.filter((r) => r !== rule)
        : [...d.contentRules, rule],
    }));

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Reusable skills
          </div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BookMarked className="h-4 w-4 text-primary" /> Presentation profiles
          </h2>
          <p className="text-xs text-muted-foreground">
            Save your generation instructions once, then reuse them for every deck.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDraft(emptyDraft());
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New profile
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importProfile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={selectedId ?? "none"}
          onValueChange={(v) => onSelect(v === "none" ? null : (profiles.find((p) => p.id === v) ?? null))}
        >
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="No profile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No profile (manual controls)</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.is_default ? "★ " : ""}
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(toDraft(selected));
                setOpen(true);
              }}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => duplicate.mutate(selected.id)}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Duplicate
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportProfile(selected)}>
              <Download className="mr-1 h-3.5 w-3.5" /> Export
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => remove.mutate(selected.id)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {profiles.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              onClick={() => {
                setDraft({
                  ...emptyDraft(s),
                  contentRules: [
                    "Use executive summaries",
                    "Preserve uploaded template layouts",
                    "Keep branding unchanged",
                  ],
                });
                setOpen(true);
              }}
            >
              <Plus className="mr-1 inline h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
          {selected.description && <div>{selected.description}</div>}
          <div>
            {[
              selected.audience && `Audience: ${selected.audience}`,
              selected.presentation_type && `Type: ${selected.presentation_type}`,
              selected.tone && `Tone: ${selected.tone}`,
              `Language: ${selected.language}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {selected.content_rules?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {selected.content_rules.map((r) => (
                <span key={r} className="rounded-full bg-muted px-2 py-0.5">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit profile" : "New presentation profile"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Profile name
                </label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="UTI AMC Board Meeting"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Default audience
                </label>
                <Input
                  value={draft.audience}
                  onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
                  placeholder="Board of Directors"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Presentation type
                </label>
                <Input
                  value={draft.presentationType}
                  onChange={(e) => setDraft({ ...draft, presentationType: e.target.value })}
                  placeholder="Board / Risk review"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Preferred tone
                </label>
                <Input
                  value={draft.tone}
                  onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
                  placeholder="Executive, factual"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Preferred language
                </label>
                <Select
                  value={draft.language}
                  onValueChange={(v) => setDraft({ ...draft, language: v })}
                >
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
              <label className="mt-6 flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs">
                  <Star className="h-3.5 w-3.5 text-primary" /> Use as default
                </span>
                <Switch
                  checked={draft.isDefault}
                  onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })}
                />
              </label>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Description
              </label>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Quarterly cyber posture pack for the board"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Content rules
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from(new Set([...RULE_LIBRARY, ...draft.contentRules])).map((r) => {
                  const on = draft.contentRules.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRule(r)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        on
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={customRule}
                  onChange={(e) => setCustomRule(e.target.value)}
                  placeholder="Add your own rule…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customRule.trim()) {
                      e.preventDefault();
                      toggleRule(customRule.trim());
                      setCustomRule("");
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (customRule.trim()) {
                      toggleRule(customRule.trim());
                      setCustomRule("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Default AI instructions
              </label>
              <Textarea
                rows={5}
                value={draft.instructions}
                onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                placeholder={
                  "Always preserve uploaded PowerPoint layouts.\nNever replace corporate branding.\nGenerate detailed tables.\nPrefer diagrams instead of long paragraphs."
                }
                className="mt-1"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => draft.name.trim() && save.mutate(draft)}
                disabled={!draft.name.trim() || save.isPending}
              >
                <Save className="mr-1 h-4 w-4" /> {save.isPending ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
