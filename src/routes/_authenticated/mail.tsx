import { createFileRoute } from "@tanstack/react-router";
import { MailModule } from "@/components/kaalu/MailModule";

export const Route = createFileRoute("/_authenticated/mail")({
  component: MailModule,
});