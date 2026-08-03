import { UtiLogo } from "./UtiLogo";

export const APP_VERSION = "v2.4.0";

export function AppFooter({ lastSync }: { lastSync?: string | null }) {
  return (
    <footer className="mt-8 border-t border-border bg-card">
      <div className="h-1 w-full bg-linear-to-r from-primary via-primary/60 to-uti-orange" />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:flex sm:flex-wrap sm:justify-between sm:px-6">
        <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
          <div className="truncate">
            Information Classification:{" "}
            <span className="font-semibold text-primary">UTI AMC – Confidential</span>
          </div>
          <div className="truncate">
            Kaalu AI {APP_VERSION} · Last synchronization:{" "}
            {lastSync ? new Date(lastSync).toLocaleString() : "—"}
          </div>
        </div>
        <UtiLogo className="h-6 shrink-0 opacity-90" />
      </div>
    </footer>
  );
}
