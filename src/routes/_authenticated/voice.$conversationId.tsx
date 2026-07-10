import { createFileRoute } from "@tanstack/react-router";
import { VoiceAgent } from "@/components/kaalu/VoiceAgent";

export const Route = createFileRoute("/_authenticated/voice/$conversationId")({
  component: ConvPage,
});

function ConvPage() {
  const { conversationId } = Route.useParams();
  return <VoiceAgent key={conversationId} conversationId={conversationId} />;
}