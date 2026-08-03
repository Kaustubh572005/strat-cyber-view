import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { StarField } from "@/components/kaalu/StarField";
import { UtiLogo } from "@/components/kaalu/UtiLogo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : "",
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const canSubmit = useMemo(() => email.trim().length > 3 && password.length >= 6, [email, password]);

  const goNext = () => {
    if (next) {
      window.location.href = next;
    } else {
      navigate({ to: "/voice" });
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function explainAuthError(errorMessage: string) {
    const normalized = errorMessage.toLowerCase();
    if (normalized.includes("email not confirmed")) {
      return "This account was created before instant sign-in was enabled. Please create the account again with a strong password, then sign in.";
    }
    if (normalized.includes("invalid login credentials")) {
      return "No matching account was found for that email and password. Create an account first, or check the password.";
    }
    if (normalized.includes("weak_password") || normalized.includes("weak") || normalized.includes("pwned")) {
      return "That password is too weak. Use a stronger password with uppercase, lowercase, numbers, and symbols.";
    }
    return errorMessage;
  }

  async function signIn(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmit) {
      const text = "Enter your email and password first.";
      setMessage({ type: "error", text });
      toast.error(text);
      return;
    }
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      const text = explainAuthError(error.message);
      setMessage({ type: "error", text });
      toast.error(text);
      return;
    }
    goNext();
  }

  async function signUp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmit) {
      const text = "Use a valid email and a password of at least 6 characters.";
      setMessage({ type: "error", text });
      toast.error(text);
      return;
    }
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: next ? window.location.origin + next : window.location.origin,
        data: { display_name: name || email.trim().split("@")[0] },
      },
    });
    setLoading(false);
    if (error) {
      const text = explainAuthError(error.message);
      setMessage({ type: "error", text });
      toast.error(text);
      return;
    }
    if (!data.session) {
      const text = "Account created. Please check your email once, then sign in here.";
      setMessage({ type: "success", text });
      toast.success(text);
      return;
    }
    const text = "Welcome, Sir. Setting things up…";
    setMessage({ type: "success", text });
    toast.success(text);
    goNext();
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-4">
      <StarField />
      <div className="fade-in-soft relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="h-1.5 w-full bg-linear-to-r from-primary via-primary/60 to-uti-orange" />
        <div className="p-8">
        <div className="mb-6 text-center">
          <UtiLogo className="mx-auto mb-4 h-9" />
          <h1 className="text-2xl font-semibold tracking-tight text-primary">Kaalu AI</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            UTI AMC · Cyber Intelligence Platform
          </p>
        </div>
        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
          {message ? (
            <div
              className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                message.type === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-primary/40 bg-primary/10 text-primary"
              }`}
            >
              {message.text}
            </div>
          ) : null}
          <TabsContent value="signin" className="mt-4">
            <form className="space-y-3" onSubmit={signIn}>
            <div className="space-y-2">
              <Label htmlFor="signin-email">Email</Label>
              <Input id="signin-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signin-password">Password</Label>
              <Input
                id="signin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading || !canSubmit}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup" className="mt-4">
            <form className="space-y-3" onSubmit={signUp}>
            <div className="space-y-2">
              <Label htmlFor="signup-name">Name</Label>
              <Input id="signup-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input id="signup-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading || !canSubmit}>
              {loading ? "Creating account…" : "Create account"}
            </Button>
            </form>
          </TabsContent>
        </Tabs>
        <p className="mt-6 text-xs text-muted-foreground text-center">
          After signing in, connect your Microsoft account to enable Outlook mail features.
        </p>
        </div>
        <div className="border-t border-border bg-muted px-8 py-2.5 text-center text-[10px] text-muted-foreground">
          Information Classification: <span className="font-semibold text-primary">UTI AMC – Confidential</span>
        </div>
      </div>
    </div>
  );
}
