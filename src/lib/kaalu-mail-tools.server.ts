// Outlook action tools for Kaalu. Server-only.
import { tool } from "ai";
import { z } from "zod";
import { graphFetch } from "@/lib/ms-graph.server";

type Recipient = { email: string; name?: string | null };

function toRecipients(list: Recipient[] | undefined) {
  return (list ?? []).map((r) => ({
    emailAddress: { address: r.email, ...(r.name ? { name: r.name } : {}) },
  }));
}

async function graphJson(userId: string, path: string, init?: RequestInit) {
  const res = await graphFetch(userId, path, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`Graph ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const RecipientSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
});

export function buildMailTools(userId: string) {
  return {
    find_contact: tool({
      description:
        "Look up an email address for a person by name or partial email from the user's Outlook contacts and directory. Use this before drafting when the user gives only a name.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          const params = new URLSearchParams({
            $top: "5",
            $search: `"${query.replace(/"/g, "")}"`,
          });
          const data = (await graphJson(userId, `/me/people?${params}`)) as {
            value?: Array<{
              displayName?: string;
              scoredEmailAddresses?: Array<{ address?: string }>;
              emailAddresses?: Array<{ address?: string }>;
            }>;
          };
          const people = (data.value ?? [])
            .map((p) => ({
              name: p.displayName ?? "",
              email: p.scoredEmailAddresses?.[0]?.address ?? p.emailAddresses?.[0]?.address ?? "",
            }))
            .filter((p) => p.email);
          return { people };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e), people: [] };
        }
      },
    }),

    create_outlook_draft: tool({
      description:
        "Create a real draft email in the user's Outlook Drafts folder. Write the full subject and body yourself. NEVER sends the email — the draft only sits in Drafts until the user explicitly asks to send it.",
      inputSchema: z.object({
        to: z.array(RecipientSchema),
        cc: z.array(RecipientSchema).nullable(),
        subject: z.string(),
        body: z.string().describe("Email body. Plain text or simple HTML."),
        isHtml: z.boolean().nullable(),
      }),
      execute: async ({ to, cc, subject, body, isHtml }) => {
        try {
          const created = (await graphJson(userId, `/me/messages`, {
            method: "POST",
            body: JSON.stringify({
              subject: subject || "(no subject)",
              body: { contentType: isHtml ? "HTML" : "Text", content: body },
              toRecipients: toRecipients(to),
              ccRecipients: toRecipients(cc ?? []),
            }),
          })) as { id?: string; webLink?: string };
          return {
            ok: true,
            draftId: created.id,
            webLink: created.webLink,
            to: to.map((r) => r.email),
            subject,
          };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    update_outlook_draft: tool({
      description:
        "Update an existing Outlook draft's recipients, subject or body (for example after the user asks for changes).",
      inputSchema: z.object({
        draftId: z.string(),
        to: z.array(RecipientSchema).nullable(),
        cc: z.array(RecipientSchema).nullable(),
        subject: z.string().nullable(),
        body: z.string().nullable(),
        isHtml: z.boolean().nullable(),
      }),
      execute: async ({ draftId, to, cc, subject, body, isHtml }) => {
        try {
          const patch: Record<string, unknown> = {};
          if (to) patch.toRecipients = toRecipients(to);
          if (cc) patch.ccRecipients = toRecipients(cc);
          if (subject !== null) patch.subject = subject;
          if (body !== null) patch.body = { contentType: isHtml ? "HTML" : "Text", content: body };
          await graphJson(userId, `/me/messages/${encodeURIComponent(draftId)}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          });
          return { ok: true, draftId };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    send_outlook_draft: tool({
      description:
        "Send an existing Outlook draft. ONLY call this when, in the latest message, the user has explicitly commanded you to send the mail (e.g. 'send it', 'send the mail now'). Never call it on your own initiative, never right after creating a draft, and never to 'confirm' a draft.",
      inputSchema: z.object({
        draftId: z.string(),
        userExplicitlyAskedToSend: z
          .boolean()
          .describe("Must be true, and only true when the user's latest message commands sending."),
      }),
      execute: async ({ draftId, userExplicitlyAskedToSend }) => {
        if (!userExplicitlyAskedToSend) {
          return { ok: false, error: "Send blocked: no explicit send command from the user." };
        }
        try {
          const res = await graphFetch(userId, `/me/messages/${encodeURIComponent(draftId)}/send`, {
            method: "POST",
          });
          if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 400)}`);
          return { ok: true, sent: true, draftId };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    list_outlook_drafts: tool({
      description: "List the user's most recent Outlook drafts with their ids, subjects and recipients.",
      inputSchema: z.object({ limit: z.number().nullable() }),
      execute: async ({ limit }) => {
        try {
          const top = Math.min(Math.max(limit ?? 10, 1), 25);
          const data = (await graphJson(
            userId,
            `/me/mailFolders/drafts/messages?$top=${top}&$select=id,subject,toRecipients,bodyPreview,lastModifiedDateTime&$orderby=lastModifiedDateTime desc`,
          )) as {
            value?: Array<{
              id?: string;
              subject?: string;
              bodyPreview?: string;
              lastModifiedDateTime?: string;
              toRecipients?: Array<{ emailAddress?: { address?: string } }>;
            }>;
          };
          return {
            drafts: (data.value ?? []).map((m) => ({
              draftId: m.id,
              subject: m.subject,
              preview: m.bodyPreview,
              to: (m.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean),
              updatedAt: m.lastModifiedDateTime,
            })),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e), drafts: [] };
        }
      },
    }),

    list_recent_mail: tool({
      description: "Read the user's most recent inbox messages (subject, sender, preview) to answer questions or draft replies.",
      inputSchema: z.object({ limit: z.number().nullable(), search: z.string().nullable() }),
      execute: async ({ limit, search }) => {
        try {
          const top = Math.min(Math.max(limit ?? 10, 1), 25);
          const params = new URLSearchParams({
            $top: String(top),
            $select: "id,subject,from,bodyPreview,receivedDateTime,isRead",
          });
          if (search) params.set("$search", `"${search.replace(/"/g, "")}"`);
          else params.set("$orderby", "receivedDateTime desc");
          const data = (await graphJson(
            userId,
            `/me/mailFolders/inbox/messages?${params}`,
            search ? { headers: { ConsistencyLevel: "eventual" } } : undefined,
          )) as {
            value?: Array<{
              id?: string;
              subject?: string;
              bodyPreview?: string;
              receivedDateTime?: string;
              isRead?: boolean;
              from?: { emailAddress?: { name?: string; address?: string } };
            }>;
          };
          return {
            messages: (data.value ?? []).map((m) => ({
              id: m.id,
              subject: m.subject,
              from: m.from?.emailAddress?.address,
              fromName: m.from?.emailAddress?.name,
              preview: m.bodyPreview,
              receivedAt: m.receivedDateTime,
              isRead: m.isRead,
            })),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e), messages: [] };
        }
      },
    }),

    create_reply_draft: tool({
      description:
        "Create a reply draft in Outlook for an existing inbox message, then optionally update its body. Does not send.",
      inputSchema: z.object({
        messageId: z.string(),
        body: z.string(),
        replyAll: z.boolean().nullable(),
      }),
      execute: async ({ messageId, body, replyAll }) => {
        try {
          const path = replyAll ? "createReplyAll" : "createReply";
          const created = (await graphJson(
            userId,
            `/me/messages/${encodeURIComponent(messageId)}/${path}`,
            { method: "POST", body: JSON.stringify({}) },
          )) as { id?: string; webLink?: string };
          if (created.id) {
            await graphJson(userId, `/me/messages/${encodeURIComponent(created.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ body: { contentType: "Text", content: body } }),
            });
          }
          return { ok: true, draftId: created.id, webLink: created.webLink };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
