import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  disconnectMicrosoft,
  getMicrosoftStatus,
} from "@/lib/conversations.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  ms_error: z.string().optional(),
  ms_connected: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (s) => searchSchema.parse(s),
  component: SettingsPage,
});

function SettingsPage() {
  const search = useSearch({ from: "/_authenticated/settings" });
  const status = useServerFn(getMicrosoftStatus);
  const disc = useServerFn(disconnectMicrosoft);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ms-status"],
    queryFn: () => status(),
  });

  useEffect(() => {
    if (search.ms_error) toast.error(`Microsoft: ${search.ms_error}`);
  }, [search.ms_error]);

  async function connect() {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return toast.error("Please sign in again");
    // Same-origin browser navigation so it can follow the 302 to Microsoft.
    window.location.href = `/api/auth/ms/start?t=${encodeURIComponent(token)}`;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and integrations.</p>
      </div>
      <Card className="glass-strong border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> Microsoft Outlook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data?.connected ? (
            <>
              <div className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> Connected as{" "}
                <span className="font-medium">{data.ms_email}</span>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  await disc();
                  qc.invalidateQueries({ queryKey: ["ms-status"] });
                  toast.success("Disconnected");
                }}
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your Microsoft account to give Kaalu access to your Outlook mailbox and
                contacts. Kaalu will never send email without your explicit approval.
              </p>
              <Button onClick={connect}>Connect Microsoft account</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}