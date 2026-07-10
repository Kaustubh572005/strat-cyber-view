import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMicrosoftStatus,
  disconnectMicrosoft,
} from "@/lib/conversations.functions";
import { emailAssist } from "@/lib/ai-assist.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Inbox,
  FileEdit,
  Send as SendIcon,
  Trash2,
  Search,
  Sparkles,
  RefreshCw,
  Reply,
  Wand2,
  Loader2,
  Mail as MailIcon,
} from "lucide-react";
import { ComposeDialog, type ComposeInitial } from "@/components/kaalu/ComposeDialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

type Folder = "inbox" | "drafts" | "sent" | "trash";

type GraphMessage = {
  id: string;
  subject: string;
  bodyPreview: string;
  from?: { emailAddress: { address: string; name: string } };
  toRecipients?: Array<{ emailAddress: { address: string; name: string } }>;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance?: string;
  body?: { content: string; contentType: string };
};

const searchSchema = z.object({ ms_connected: z.string().optional() });

export function MailModule() {
  const search = useSearch({ strict: false }) as z.infer<typeof searchSchema>;
  const navigate = useNavigate();
  const statusFn = useServerFn(getMicrosoftStatus);
  const disc = useServerFn(disconnectMicrosoft);
  const qc = useQueryClient();
  const { data: msStatus } = useQuery({
    queryKey: ["ms-status"],
    queryFn: () => statusFn(),
    refetchOnMount: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (search?.ms_connected) {
      toast.success("Microsoft account connected");
      qc.invalidateQueries({ queryKey: ["ms-status"] });
      navigate({ to: "/mail", replace: true, search: {} as never });
    }
  }, [search, navigate, qc]);

  const [folder, setFolder] = useState<Folder>("inbox");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInit, setComposeInit] = useState<ComposeInitial | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const listQ = useQuery({
    queryKey: ["mail-list", folder, debouncedQuery],
    enabled: !!msStatus?.connected,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const p = new URLSearchParams({ folder, top: "40" });
      if (debouncedQuery) p.set("search", debouncedQuery);
      const res = await fetch(`/api/graph/messages?${p}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const j = (await res.json()) as { value: GraphMessage[] };
      return j.value ?? [];
    },
  });

  const detailQ = useQuery({
    queryKey: ["mail-detail", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/graph/messages?id=${encodeURIComponent(selectedId!)}`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as GraphMessage;
    },
  });

  const messages = listQ.data ?? [];
  const detail = detailQ.data;

  useEffect(() => {
    if (!selectedId && messages[0]) setSelectedId(messages[0].id);
  }, [messages, selectedId]);

  if (!msStatus?.connected) {
    return <ConnectMailPrompt />;
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-white/5">
        <Button
          size="sm"
          onClick={() => {
            setComposeInit(undefined);
            setComposeOpen(true);
          }}
          className="gap-2"
        >
          <MailIcon className="h-4 w-4" /> Compose
        </Button>
        <div className="relative flex-1 max-w-md ml-4">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mail…"
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => qc.invalidateQueries({ queryKey: ["mail-list"] })}
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {msStatus.ms_email}{" "}
          <button
            className="hover:text-destructive ml-2"
            onClick={async () => {
              await disc();
              qc.invalidateQueries({ queryKey: ["ms-status"] });
            }}
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[220px_360px_1fr]">
        {/* Folders */}
        <div className="border-r border-white/5 p-3 space-y-1">
          {[
            ["inbox", "Inbox", <Inbox key="i" className="h-4 w-4" />] as const,
            ["drafts", "Drafts", <FileEdit key="d" className="h-4 w-4" />] as const,
            ["sent", "Sent", <SendIcon key="s" className="h-4 w-4" />] as const,
            ["trash", "Trash", <Trash2 key="t" className="h-4 w-4" />] as const,
          ].map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => {
                setFolder(k as Folder);
                setSelectedId(null);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${
                folder === k
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
          <div className="mt-6 pt-4 border-t border-white/5">
            <SummarizeInboxButton />
          </div>
        </div>

        {/* Message list */}
        <div className="border-r border-white/5 min-h-0 flex flex-col">
          {listQ.isLoading && (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          )}
          {!listQ.isLoading && messages.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No messages.</div>
          )}
          <ScrollArea className="flex-1">
            <ul className="divide-y divide-white/5">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-white/5 ${
                      selectedId === m.id ? "bg-white/10" : ""
                    } ${!m.isRead ? "font-medium" : ""}`}
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">
                        {m.from?.emailAddress?.name || m.from?.emailAddress?.address || ""}
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(m.receivedDateTime), { addSuffix: false })}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm truncate">
                      {m.subject || "(no subject)"}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {m.bodyPreview}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        {/* Reading pane */}
        <ReadingPane
          message={detail}
          onReply={(m) => {
            setComposeInit({
              to: m.from?.emailAddress
                ? [{ email: m.from.emailAddress.address, name: m.from.emailAddress.name }]
                : [],
              subject: `Re: ${m.subject || ""}`,
              body: `\n\n---\nOn ${new Date(m.receivedDateTime).toLocaleString()}, ${
                m.from?.emailAddress?.name || ""
              } wrote:\n${htmlToText(m.body?.content || m.bodyPreview)}`,
            });
            setComposeOpen(true);
          }}
        />
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initial={composeInit}
        onSent={() => qc.invalidateQueries({ queryKey: ["mail-list"] })}
      />
    </div>
  );
}

function ReadingPane({
  message,
  onReply,
}: {
  message?: GraphMessage;
  onReply: (m: GraphMessage) => void;
}) {
  const assist = useServerFn(emailAssist);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bodyText = useMemo(() => {
    if (!message) return "";
    if (message.body?.contentType === "html") return htmlToText(message.body.content || "");
    return message.body?.content || message.bodyPreview || "";
  }, [message]);

  useEffect(() => setSummary(null), [message?.id]);

  if (!message) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground">
        Select a message to read.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex flex-col">
      <div className="p-6 border-b border-white/5">
        <div className="text-xs text-muted-foreground">
          {new Date(message.receivedDateTime).toLocaleString()}
        </div>
        <h2 className="text-xl font-semibold mt-1">{message.subject || "(no subject)"}</h2>
        <div className="mt-2 text-sm text-muted-foreground">
          <span className="text-foreground font-medium">
            {message.from?.emailAddress?.name}
          </span>{" "}
          &lt;{message.from?.emailAddress?.address}&gt;
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" className="gap-1" onClick={() => onReply(message)}>
            <Reply className="h-4 w-4" /> Reply
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await assist({
                  data: { action: "summarize_thread", input: bodyText.slice(0, 15000) },
                });
                setSummary(r.text);
              } catch (e) {
                toast.error(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
            Summarize
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await assist({
                  data: {
                    action: "reply",
                    input: bodyText.slice(0, 15000),
                    subjectHint: message.subject,
                  },
                });
                onReply({ ...message, body: { contentType: "text", content: r.text } });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Wand2 className="h-4 w-4" /> Draft reply
          </Button>
        </div>
        {summary && (
          <div className="mt-4 rounded-lg glass p-4 text-sm">
            <div className="text-[10px] uppercase tracking-widest text-primary mb-1">
              Kaalu summary
            </div>
            <div className="whitespace-pre-wrap">{summary}</div>
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6 text-sm whitespace-pre-wrap leading-relaxed">{bodyText}</div>
      </ScrollArea>
    </div>
  );
}

function SummarizeInboxButton() {
  const assist = useServerFn(emailAssist);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/graph/messages?folder=inbox&top=15`, {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as { value: GraphMessage[] };
      const brief = (j.value ?? [])
        .map(
          (m) =>
            `From: ${m.from?.emailAddress?.name || m.from?.emailAddress?.address}\nSubject: ${m.subject}\nPreview: ${m.bodyPreview}\n`,
        )
        .join("\n---\n");
      const r = await assist({
        data: {
          action: "summarize_thread",
          input: `Summarize today's inbox. Group by importance. Flag anything time-sensitive.\n\n${brief}`,
        },
      });
      setText(r.text);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" className="w-full gap-2" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
        Brief my inbox
      </Button>
      {text && (
        <div className="glass rounded-md p-2 text-xs whitespace-pre-wrap max-h-80 overflow-auto">
          {text}
        </div>
      )}
    </div>
  );
}

function ConnectMailPrompt() {
  async function connect() {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return;
    window.location.href = `/api/auth/ms/start?t=${encodeURIComponent(token)}`;
  }
  return (
    <div className="h-screen flex items-center justify-center px-6">
      <div className="glass-strong rounded-2xl p-8 max-w-md text-center neon-ring">
        <MailIcon className="h-10 w-10 text-primary mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Connect your Microsoft account</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Connect Outlook so Kaalu can help you read, summarize, and draft your email. Nothing is
          sent without your explicit approval.
        </p>
        <Button onClick={connect} className="mt-6 w-full">
          Connect Microsoft
        </Button>
      </div>
    </div>
  );
}

function htmlToText(html: string): string {
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, "");
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}