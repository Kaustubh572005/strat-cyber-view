import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { KAALU_SYSTEM_PROMPT } from "@/lib/kaalu-persona";

const ACTIONS = [
  "generate",
  "rewrite",
  "improve",
  "professional",
  "shorten",
  "expand",
  "change_tone",
  "reply",
  "followup",
  "bullets_to_email",
  "summarize_thread",
] as const;

function actionPrompt(action: (typeof ACTIONS)[number], tone?: string) {
  switch (action) {
    case "generate":
      return "Draft a complete, professional email based on the user's request. Return ONLY the email body — no preamble.";
    case "rewrite":
      return "Rewrite the following email keeping the same intent but improving clarity and flow. Return only the rewritten email body.";
    case "improve":
      return "Improve the grammar, clarity, and professionalism of the following email. Return only the improved body.";
    case "professional":
      return "Rewrite the following email in a formal professional tone. Return only the body.";
    case "shorten":
      return "Shorten the following email significantly while preserving all key points. Return only the body.";
    case "expand":
      return "Expand the following email with more helpful detail while staying on-topic. Return only the body.";
    case "change_tone":
      return `Rewrite the following email in a ${tone || "warm and professional"} tone. Return only the body.`;
    case "reply":
      return "Write a concise, professional reply to the email below. Return only the reply body.";
    case "followup":
      return "Write a polite follow-up email based on the context below. Return only the body.";
    case "bullets_to_email":
      return "Convert the following bullet points into a well-written professional email. Return only the body.";
    case "summarize_thread":
      return "Summarize the following email thread into a concise briefing with key points and action items.";
  }
}

export const emailAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(ACTIONS),
        input: z.string().min(1).max(20000),
        tone: z.string().optional(),
        subjectHint: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");
    const instr = actionPrompt(data.action, data.tone);
    const { text } = await generateText({
      model,
      system: KAALU_SYSTEM_PROMPT + "\n\nWhen assisting with email, output plain text unless HTML is requested.",
      prompt: `${instr}\n\n${data.subjectHint ? `Subject context: ${data.subjectHint}\n\n` : ""}---\n${data.input}\n---`,
    });
    return { text: text.trim() };
  });