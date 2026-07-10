import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RecipientInput, type Recipient } from "@/components/kaalu/RecipientInput";
import { useServerFn } from "@tanstack/react-start";
import { emailAssist } from "@/lib/ai-assist.functions";
import { saveDraft } from "@/lib/drafts.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Save, Sparkles, Wand2, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComposeInitial = {
  id?: string;
  to?: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  subject?: string;
  body?: string;
};

export function ComposeDialog({
  open,
  onOpenChange,
  initial,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: ComposeInitial;
  onSent?: () => void;
}) {
  const [to, setTo] = useState<Recipient[]>(initial?.to ?? []);
  const [cc, setCc] = useState<Recipient[]>(initial?.cc ?? []);
  const [bcc, setBcc] = useState<Recipient[]>(initial?.bcc ?? []);
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [assistPrompt, setAssistPrompt] = useState("");
  const [assistOpen, setAssistOpen] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(initial?.id);
  const assist = useServerFn(emailAssist);
  const save = useServerFn(saveDraft);

  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? []);
      setCc(initial?.cc ?? []);
      setBcc(initial?.bcc ?? []);
      setSubject(initial?.subject ?? "");
      setBody(initial?.body ?? "");
      setDraftId(initial?.id);
      setConfirmSend(false);
    }
  }, [open, initial]);

  type AssistAction =
    | "generate" | "rewrite" | "improve" | "professional" | "shorten"
    | "expand" | "change_tone" | "reply" | "followup" | "bullets_to_email"
    | "summarize_thread";
  async function runAssist(action: AssistAction, inputOverride?: string) {
    setAssisting(true);
    try {
      const input = inputOverride ?? body ?? assistPrompt;
      const res = await assist({
        data: { action, input, subjectHint: subject || undefined },
      });
      setBody(res.text);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setAssisting(false);
      setAssistOpen(false);
    }
  }

  async function generateFromPrompt() {
    if (!assistPrompt.trim()) return;
    await runAssist("generate", assistPrompt);
    setAssistPrompt("");
  }

  async function saveAsDraft() {
    const saved = await save({
      data: { id: draftId, to, cc, bcc, subject, body },
    });
    setDraftId(saved.id);
    toast.success("Draft saved");
  }

  async function doSend() {
    if (!to.length) return toast.error("Please add a recipient");
    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const saved = await save({
        data: { id: draftId, to, cc, bcc, subject, body },
      });
      const res = await fetch("/api/graph/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          draftId: saved.id,
          to,
          cc,
          bcc,
          subject,
          body,
          contentType: "Text",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Sent");
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong border-white/10 max-w-3xl">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <RecipientInput label="To" value={to} onChange={setTo} />
          {!showCc && !cc.length && (
            <div className="flex gap-3 text-xs">
              <button
                onClick={() => setShowCc(true)}
                className="text-muted-foreground hover:text-primary"
              >
                + Cc
              </button>
              <button
                onClick={() => setShowBcc(true)}
                className="text-muted-foreground hover:text-primary"
              >
                + Bcc
              </button>
            </div>
          )}
          {(showCc || cc.length > 0) && (
            <RecipientInput label="Cc" value={cc} onChange={setCc} />
          )}
          {(showBcc || bcc.length > 0) && (
            <RecipientInput label="Bcc" value={bcc} onChange={setBcc} />
          )}
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="bg-white/5 border-white/10"
          />
          <Textarea
            placeholder="Write your message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[280px] bg-white/5 border-white/10 resize-none"
          />
        </div>

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex gap-2">
            <Popover open={assistOpen} onOpenChange={setAssistOpen}>
              <PopoverTrigger asChild>
                <Button variant="secondary" className="gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Kaalu assist
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[360px] glass-strong border-white/10">
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Describe what to write, or use a quick action on the existing text.
                  </div>
                  <Textarea
                    placeholder="e.g. Reply politely, decline the meeting, propose next Tuesday…"
                    value={assistPrompt}
                    onChange={(e) => setAssistPrompt(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <Button
                    className="w-full gap-2"
                    onClick={generateFromPrompt}
                    disabled={assisting || !assistPrompt.trim()}
                  >
                    {assisting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Generate
                  </Button>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ["improve", "Improve"],
                        ["professional", "Make professional"],
                        ["shorten", "Shorten"],
                        ["expand", "Expand"],
                        ["rewrite", "Rewrite"],
                        ["followup", "Follow-up"],
                      ] as const
                    ).map(([k, label]) => (
                      <Button
                        key={k}
                        variant="ghost"
                        size="sm"
                        disabled={!body || assisting}
                        onClick={() => runAssist(k)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" onClick={saveAsDraft} className="gap-2">
              <Save className="h-4 w-4" /> Save draft
            </Button>
          </div>
          {!confirmSend ? (
            <Button className="gap-2" onClick={() => setConfirmSend(true)}>
              <Send className="h-4 w-4" /> Send
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Sir, shall I send this email?
              </span>
              <Button variant="ghost" onClick={() => setConfirmSend(false)}>
                Cancel
              </Button>
              <Button onClick={doSend} disabled={sending} className="gap-2">
                {sending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm send
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}