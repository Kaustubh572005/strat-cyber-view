import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ScanSearch, ExternalLink, ShieldCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/breach")({
  head: () => ({
    meta: [
      { title: "Data Breach Scanner · Kaalu AI" },
      {
        name: "description",
        content:
          "Check whether your email or password has been exposed in a known breach via Have I Been Pwned.",
      },
    ],
  }),
  component: BreachPage,
});

function BreachPage() {
  return (
    <AppShell>
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.3em] text-primary/80 font-mono">
          /// exposure check
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight flex items-center gap-2">
          <ScanSearch className="w-7 h-7 text-primary" /> Data Breach Scanner
        </h1>

        <div className="mt-6 panel p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">Check exposure with Have I Been Pwned</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Have I Been Pwned (HIBP) is the industry-standard breach lookup service
                maintained by security researcher Troy Hunt. It searches your email address
                across hundreds of confirmed data breaches — safely, and without ever storing
                what you look up.
              </p>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Kaalu AI keeps this check <span className="text-foreground">off-platform on purpose</span> so
                your search stays entirely between you and HIBP.
              </p>

              <a
                href="https://haveibeenpwned.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Open Have I Been Pwned <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Tip
            icon={<Lock className="w-4 h-4 text-primary" />}
            title="Rotate exposed credentials"
            body="If a breach is confirmed, change the password on that service and anywhere else it was reused."
          />
          <Tip
            icon={<ShieldCheck className="w-4 h-4 text-primary" />}
            title="Enable MFA everywhere"
            body="Passkeys or app-based MFA neutralise most credential-stuffing attacks even when a password leaks."
          />
        </div>
      </div>
    </AppShell>
  );
}

function Tip({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-sm font-medium">{icon}{title}</div>
      <p className="mt-1.5 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
