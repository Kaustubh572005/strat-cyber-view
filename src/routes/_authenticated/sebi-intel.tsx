import { createFileRoute, redirect } from "@tanstack/react-router";

// SEBI Intelligence is now merged into the single unified /sebi portal.
export const Route = createFileRoute("/_authenticated/sebi-intel")({
  beforeLoad: () => {
    throw redirect({ to: "/sebi" });
  },
});
