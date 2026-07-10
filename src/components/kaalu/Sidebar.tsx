import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createConversation,
  deleteConversation,
  clearAllConversations,
  listConversations,
  renameConversation,
} from "@/lib/conversations.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AudioLines,
  Mail,
  MessageSquarePlus,
  Search,
  Settings,
  LogOut,
  Trash2,
  Pencil,
  Sparkles,
  History,
  LayoutDashboard,
  ShieldAlert,
  Presentation,
  FileText,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function Sidebar() {
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const qc = useQueryClient();
  const list = useServerFn(listConversations);
  const create = useServerFn(createConversation);
  const del = useServerFn(deleteConversation);
  const rename = useServerFn(renameConversation);
  const clearAll = useServerFn(clearAllConversations);
  const [query, setQuery] = useState("");

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => list(),
  });

  const filtered = useMemo(() => {
    if (!query) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const createMut = useMutation({
    mutationFn: () => create(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/voice/$conversationId", params: { conversationId: data.id } });
    },
  });

  const isMailActive = location.pathname.startsWith("/mail");
  const isSettings = location.pathname.startsWith("/settings");
  const isDashboard = location.pathname === "/dashboard" || location.pathname === "/";
  const isCyber = location.pathname.startsWith("/cyber");
  const isPresentations = location.pathname.startsWith("/presentations");
  const isSebi = location.pathname.startsWith("/sebi");
  const isMarkets = location.pathname.startsWith("/markets");
  const isVoiceActive =
    location.pathname.startsWith("/voice") ||
    (!isMailActive && !isSettings && !isDashboard && !isCyber && !isPresentations && !isSebi && !isMarkets);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const activeConvId =
    (location.pathname.match(/^\/voice\/([^/]+)/) || [])[1] || null;

  return (
    <aside className="w-72 shrink-0 h-screen sticky top-0 glass-strong border-r border-white/5 flex flex-col">
      <div className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full neon-ring flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="font-semibold neon-text tracking-wide">Kaalu</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Executive AI
          </div>
        </div>
      </div>

      <nav className="px-3 space-y-1">
        <NavItem
          active={isDashboard}
          onClick={() => navigate({ to: "/dashboard" })}
          icon={<LayoutDashboard className="h-4 w-4" />}
          label="Dashboard"
        />
        <NavItem
          active={isVoiceActive}
          onClick={() => navigate({ to: "/voice" })}
          icon={<AudioLines className="h-4 w-4" />}
          label="Voice Agent"
        />
        <NavItem
          active={isCyber}
          onClick={() => navigate({ to: "/cyber" })}
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Cyber Intelligence"
        />
        <NavItem
          active={isSebi}
          onClick={() => navigate({ to: "/sebi" })}
          icon={<FileText className="h-4 w-4" />}
          label="SEBI Circulars"
        />
        <NavItem
          active={isMarkets}
          onClick={() => navigate({ to: "/markets" })}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Financial Markets"
        />
        <NavItem
          active={isMailActive}
          onClick={() => navigate({ to: "/mail" })}
          icon={<Mail className="h-4 w-4" />}
          label="Mail Assistant"
        />
        <NavItem
          active={isPresentations}
          onClick={() => navigate({ to: "/presentations" })}
          icon={<Presentation className="h-4 w-4" />}
          label="Presentation Generator"
        />
      </nav>

      {isVoiceActive && (
        <div className="mt-4 flex-1 min-h-0 flex flex-col px-3">
          <div className="flex items-center gap-2 mb-2">
            <Button
              size="sm"
              className="flex-1 justify-start gap-2"
              variant="secondary"
              onClick={() => createMut.mutate()}
            >
              <MessageSquarePlus className="h-4 w-4" />
              New conversation
            </Button>
          </div>
          <div className="flex items-center justify-between px-1 mb-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <History className="h-3 w-3" /> History
            </div>
            {conversations.length > 0 && (
              <button
                className="text-[10px] text-muted-foreground hover:text-destructive transition"
                onClick={async () => {
                  if (!window.confirm("Delete all conversations? This cannot be undone.")) return;
                  await clearAll();
                  toast.success("History cleared");
                  qc.invalidateQueries({ queryKey: ["conversations"] });
                  navigate({ to: "/voice" });
                }}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="relative mb-2">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-8 pl-8 text-sm bg-white/5 border-white/10"
            />
          </div>
          <ScrollArea className="flex-1 -mx-1">
            <div className="space-y-0.5 px-1">
              {filtered.map((c) => (
                <ConvRow
                  key={c.id}
                  active={activeConvId === c.id}
                  title={c.title}
                  onOpen={() =>
                    navigate({
                      to: "/voice/$conversationId",
                      params: { conversationId: c.id },
                    })
                  }
                  onRename={async (title) => {
                    await rename({ data: { id: c.id, title } });
                    qc.invalidateQueries({ queryKey: ["conversations"] });
                  }}
                  onDelete={async () => {
                    await del({ data: { id: c.id } });
                    toast.success("Conversation deleted");
                    qc.invalidateQueries({ queryKey: ["conversations"] });
                    if (activeConvId === c.id) {
                      navigate({ to: "/voice" });
                    } else {
                      router.invalidate();
                    }
                  }}
                />
              ))}
              {filtered.length === 0 && (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  {query ? "No matches" : "No conversations yet"}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {!isVoiceActive && <div className="flex-1" />}

      <div className="p-3 border-t border-white/5 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-start gap-2"
          asChild
        >
          <Link to="/settings">
            <Settings className="h-4 w-4" /> Settings
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
        active
          ? "bg-primary/15 text-primary neon-ring"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ConvRow({
  active,
  title,
  onOpen,
  onRename,
  onDelete,
}: {
  active: boolean;
  title: string;
  onOpen: () => void;
  onRename: (t: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  if (editing) {
    return (
      <div className="px-2 py-1">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (value.trim() && value !== title) onRename(value.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setValue(title);
              setEditing(false);
            }
          }}
          className="h-7 text-sm"
        />
      </div>
    );
  }
  return (
    <div
      className={`group flex items-center rounded-md ${
        active ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      <button
        onClick={onOpen}
        className="flex-1 truncate text-left px-3 py-2 text-sm"
        title={title}
      >
        {title}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 mr-1 p-1 rounded hover:bg-white/10"
            aria-label="More"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}