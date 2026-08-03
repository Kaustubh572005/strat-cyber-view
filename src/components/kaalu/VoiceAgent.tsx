import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiCore, type AiCoreState } from "@/components/kaalu/AiCore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, Square, Volume2, VolumeX, Copy, RefreshCw, Radio } from "lucide-react";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { useTtsPlayer } from "@/hooks/useTtsPlayer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createConversation,
  getConversation,
} from "@/lib/conversations.functions";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export function VoiceAgent({ conversationId }: { conversationId: string | null }) {
  const qc = useQueryClient();
  const getConv = useServerFn(getConversation);
  const createConv = useServerFn(createConversation);

  const { data: convData } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => (conversationId ? getConv({ data: { id: conversationId } }) : null),
    enabled: !!conversationId,
  });

  const initial: UIMessage[] = useMemo(() => {
    if (!convData) return [];
    return convData.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text", text: m.content }],
    }));
  }, [convData]);

  const [chatId, setChatId] = useState<string | null>(conversationId);
  useEffect(() => setChatId(conversationId), [conversationId]);
  // Holds the conversation id created lazily during a hands-free session,
  // so subsequent submits reuse it WITHOUT remounting via router navigation
  // (which would abort the in-flight /api/chat stream).
  const pendingConvRef = useRef<string | null>(null);

  const [autoSpeak, setAutoSpeak] = useState(true);
  const [handsFree, setHandsFree] = useState(true);
  const spokenRef = useRef<Set<string>>(new Set());
  const greetedRef = useRef<string | null>(null);
  const tts = useTtsPlayer();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, id, body }) => {
          const { data: s } = await supabase.auth.getSession();
          return {
            headers: {
              Authorization: `Bearer ${s.session?.access_token ?? ""}`,
            },
            body: {
              messages,
              conversationId: id,
              ...body,
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: chatId ?? "new",
    messages: initial,
    transport,
    onError: (e) => toast.error(e.message || "Chat failed"),
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  useEffect(() => {
    // reset when conversation switches with loaded messages
    setMessages(initial);
    spokenRef.current = new Set(initial.map((m) => m.id));
  }, [initial, setMessages]);

  // Auto-greet on empty conversation so the user can start speaking
  // immediately without saying an activation word.
  useEffect(() => {
    const key = chatId ?? "new";
    if (greetedRef.current === key) return;
    if (convData === undefined && conversationId) return; // wait for load
    if (messages.length > 0) {
      greetedRef.current = key;
      return;
    }
    greetedRef.current = key;
    const greeting = "Hello Sir, Kaalu here. How may I assist you today?";
    const greetId = `greet-${Date.now()}`;
    setMessages([
      {
        id: greetId,
        role: "assistant",
        parts: [{ type: "text", text: greeting }],
      } as UIMessage,
    ]);
    spokenRef.current.add(greetId);
    if (autoSpeak) {
      // Speak (browser autoplay may block until first gesture — harmless).
      setTimeout(() => tts.speak(greeting), 200);
    }
  }, [chatId, conversationId, convData, messages.length, setMessages, autoSpeak, tts]);

  // Speak new assistant messages after stream finishes
  useEffect(() => {
    if (!autoSpeak) return;
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (spokenRef.current.has(last.id)) return;
    spokenRef.current.add(last.id);
    const text = last.parts
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    if (text) tts.speak(text);
  }, [messages, status, autoSpeak, tts]);

  async function ensureConversation(): Promise<string> {
    if (chatId) return chatId;
    if (pendingConvRef.current) return pendingConvRef.current;
    const created = await createConv();
    pendingConvRef.current = created.id;
    qc.invalidateQueries({ queryKey: ["conversations"] });
    // Update the URL WITHOUT triggering a router remount — remounting
    // aborts the in-flight sendMessage and drops the assistant reply.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/voice/${created.id}`);
    }
    return created.id;
  }

  async function submit(text: string, kind: "text" | "voice" = "text") {
    const trimmed = text.trim();
    if (!trimmed) return;
    tts.stop();
    const id = await ensureConversation();
    await sendMessage(
      { text: trimmed },
      { body: { conversationId: id, kind } },
    );
  }

  const voice = useVoiceCapture(
    (text) => {
      submit(text, "voice");
    },
    { autoStop: handsFree },
  );

  // Hands-free: auto-start listening on mount and resume after TTS ends
  // or after the assistant finishes replying. Requires the user to have
  // interacted with the page at least once (browser autoplay policy).
  useEffect(() => {
    if (!handsFree) return;
    if (tts.speaking) return;
    if (voice.state !== "idle") return;
    if (status === "submitted" || status === "streaming") return;
    const t = setTimeout(() => {
      voice.start().catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [handsFree, tts.speaking, voice.state, status, voice]);

  const coreState: AiCoreState = tts.speaking
    ? "speaking"
    : voice.state === "recording"
      ? "listening"
      : status === "submitted" || status === "streaming"
        ? "thinking"
        : "idle";

  const amplitude = tts.speaking ? tts.amplitude : voice.amplitude;
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [chatId]);

  const empty = messages.length === 0;

  return (
    <div className="h-screen flex flex-col">
      {/* Chat area */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        {empty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            <div className="w-[380px] h-[380px] md:w-[440px] md:h-[440px]">
              <AiCore state={coreState} amplitude={amplitude} />
            </div>
          <h2 className="mt-4 text-2xl font-semibold neon-text">
            How may I assist you, Sir?
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {handsFree
              ? "I'm listening — just start speaking."
              : "Tap the microphone or type below to begin."}
          </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
            <MessageList
              messages={messages}
              streaming={status === "streaming"}
              onSpeak={(t) => tts.speak(t)}
            />
            <div className="hidden lg:flex items-center justify-center border-l border-border glass">
              <div className="w-[300px] h-[300px]">
                <AiCore state={coreState} amplitude={amplitude} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="glass-strong border-t border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-end gap-2">
          <Button
            variant={voice.state === "recording" ? "destructive" : "secondary"}
            size="icon"
            className={`rounded-full h-12 w-12 shrink-0 ${
              voice.state === "recording" ? "" : "neon-ring"
            }`}
            onClick={voice.toggle}
            aria-label={voice.state === "recording" ? "Stop" : "Speak"}
          >
            {voice.state === "recording" ? (
              <Square className="h-5 w-5" />
            ) : voice.state === "transcribing" ? (
              <MicOff className="h-5 w-5 animate-pulse" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voice.state === "recording"
                ? "Listening…"
                : voice.state === "transcribing"
                  ? "Transcribing…"
                  : "Ask Kaalu anything…"
            }
            className="min-h-[48px] max-h-[200px] resize-none bg-muted/50 border-border"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
                setInput("");
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-full h-10 w-10 shrink-0 ${handsFree ? "text-primary" : ""}`}
            onClick={() => setHandsFree((v) => !v)}
            title={handsFree ? "Hands-free on" : "Hands-free off"}
          >
            <Radio className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-10 w-10 shrink-0"
            onClick={() => setAutoSpeak((v) => !v)}
            title={autoSpeak ? "Voice on" : "Voice off"}
          >
            {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            className="rounded-full h-12 w-12 shrink-0"
            onClick={() => {
              submit(input);
              setInput("");
            }}
            disabled={status === "streaming" || !input.trim()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageList({
  messages,
  streaming,
  onSpeak,
}: {
  messages: UIMessage[];
  streaming: boolean;
  onSpeak: (t: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);
  return (
    <div ref={scrollerRef} className="overflow-y-auto px-4 md:px-8 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((m) => {
          const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] ${
                  isUser
                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5"
                    : "text-foreground"
                }`}
              >
                {isUser ? (
                  <div className="whitespace-pre-wrap text-sm">{text}</div>
                ) : (
                  <>
                    <div className="prose prose-sm max-w-none [&_p]:my-2 [&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:rounded-lg [&_code]:text-primary">
                      <ReactMarkdown>{text || "…"}</ReactMarkdown>
                    </div>
                    <div className="mt-1 flex gap-1 opacity-60 hover:opacity-100 transition">
                      <button
                        className="text-[11px] flex items-center gap-1 hover:text-primary"
                        onClick={() => {
                          navigator.clipboard.writeText(text);
                          toast.success("Copied");
                        }}
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      <button
                        className="text-[11px] flex items-center gap-1 hover:text-primary ml-2"
                        onClick={() => onSpeak(text)}
                      >
                        <RefreshCw className="h-3 w-3" /> Speak
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {streaming && (
          <div className="text-xs text-muted-foreground animate-pulse">Kaalu is thinking…</div>
        )}
      </div>
    </div>
  );
}