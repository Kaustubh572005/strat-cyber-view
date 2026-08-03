import { useEffect, useState } from "react";
import { UtiLogo } from "./UtiLogo";

export function SplashScreen() {
  const [hidden, setHidden] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem("kaalu-splash-seen")) {
      setHidden(true);
      return;
    }
    window.sessionStorage.setItem("kaalu-splash-seen", "1");
    const t1 = window.setTimeout(() => setFading(true), 1700);
    const t2 = window.setTimeout(() => setHidden(true), 2300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-100 flex items-center justify-center bg-background transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="fade-in-soft flex flex-col items-center gap-5 px-6 text-center">
        <UtiLogo className="h-12" />
        <div className="h-px w-24 bg-border" />
        <div>
          <div className="text-3xl font-semibold tracking-tight text-primary">Kaalu AI</div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Enterprise Cyber Intelligence Platform
          </div>
        </div>
        <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
        </div>
      </div>
    </div>
  );
}
