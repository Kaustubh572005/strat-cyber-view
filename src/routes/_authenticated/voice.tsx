import { createFileRoute } from "@tanstack/react-router";
import { VoiceAgent } from "@/components/kaalu/VoiceAgent";

export const Route = createFileRoute("/_authenticated/voice")({
  component: () => <VoiceAgent conversationId={null} />,
});