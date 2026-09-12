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
        "Look up email addresses for a person by name or partial email across the user's Outlook relevant people, saved contacts and organisation directory. Use this before drafting whenever the user gives only a name. Returns several matches — if more than one plausible match comes back, ask the user which person they mean.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          const { searchPeople } = await import("@/lib/ms-people.server");
          const people = await searchPeople(userId, query, 8);
          return { people, count: people.length };
        } catch (e) {
          if (e instanceof Response) {
            return { error: "Microsoft account not connected", people: [] };
          }
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

    sync_contacts: tool({
      description:
        "Refresh Kaalu's copy of the user's Outlook address book (saved contacts and frequent correspondents). Use when a person cannot be found but the user insists the contact exists in Outlook.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { syncOutlookContacts } = await import("@/lib/ms-people.server");
          return { ok: true, ...(await syncOutlookContacts(userId)) };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    list_sent_mail: tool({
      description:
        "List the user's recently sent messages (subject, recipients, when). Use this to find mails that may need a follow-up or chase-up.",
      inputSchema: z.object({ limit: z.number().nullable(), search: z.string().nullable() }),
      execute: async ({ limit, search }) => {
        try {
          const top = Math.min(Math.max(limit ?? 10, 1), 25);
          const params = new URLSearchParams({
            $top: String(top),
            $select: "id,subject,toRecipients,bodyPreview,sentDateTime,conversationId",
          });
          if (search) params.set("$search", `"${search.replace(/"/g, "")}"`);
          else params.set("$orderby", "sentDateTime desc");
          const data = (await graphJson(
            userId,
            `/me/mailFolders/sentitems/messages?${params}`,
            search ? { headers: { ConsistencyLevel: "eventual" } } : undefined,
          )) as {
            value?: Array<{
              id?: string;
              subject?: string;
              bodyPreview?: string;
              sentDateTime?: string;
              conversationId?: string;
              toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
            }>;
          };
          return {
            messages: (data.value ?? []).map((m) => ({
              id: m.id,
              subject: m.subject,
              preview: m.bodyPreview,
              sentAt: m.sentDateTime,
              conversationId: m.conversationId,
              to: (m.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean),
            })),
          };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e), messages: [] };
        }
      },
    }),

    create_followup_draft: tool({
      description:
        "Create a polite follow-up / chase-up draft on an existing sent or received message, keeping the same email thread and subject. Write the follow-up body yourself. Does not send.",
      inputSchema: z.object({
        messageId: z.string().describe("Id of the original message (from list_sent_mail or list_recent_mail)."),
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
          )) as { id?: string; webLink?: string; subject?: string };
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

    forward_mail: tool({
      description:
        "Create a forward draft of an existing message to new recipients, keeping the original attachments. Write the covering comment yourself. Does not send.",
      inputSchema: z.object({
        messageId: z.string(),
        to: z.array(RecipientSchema),
        comment: z.string().nullable(),
      }),
      execute: async ({ messageId, to, comment }) => {
        try {
          const created = (await graphJson(
            userId,
            `/me/messages/${encodeURIComponent(messageId)}/createForward`,
            {
              method: "POST",
              body: JSON.stringify({
                toRecipients: toRecipients(to),
                comment: comment ?? "",
              }),
            },
          )) as { id?: string; webLink?: string };
          return { ok: true, draftId: created.id, webLink: created.webLink };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    flag_for_followup: tool({
      description:
        "Flag a message in Outlook for follow-up, optionally with a due date, so it appears in the user's Outlook follow-up list.",
      inputSchema: z.object({
        messageId: z.string(),
        dueDateIso: z.string().nullable().describe("ISO date/time for the reminder, or null."),
        timeZone: z.string().nullable().describe("IANA time zone, e.g. Asia/Kolkata."),
      }),
      execute: async ({ messageId, dueDateIso, timeZone }) => {
        try {
          const tz = timeZone || "Asia/Kolkata";
          const flag: Record<string, unknown> = { flagStatus: "flagged" };
          if (dueDateIso) {
            flag.dueDateTime = { dateTime: dueDateIso, timeZone: tz };
            flag.startDateTime = { dateTime: new Date().toISOString(), timeZone: tz };
          }
          await graphJson(userId, `/me/messages/${encodeURIComponent(messageId)}`, {
            method: "PATCH",
            body: JSON.stringify({ flag }),
          });
          return { ok: true, messageId, dueDate: dueDateIso };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    list_attachments: tool({
      description: "List the attachments on a message (name, type, size) so they can be referenced or forwarded.",
      inputSchema: z.object({ messageId: z.string() }),
      execute: async ({ messageId }) => {
        try {
          const data = (await graphJson(
            userId,
            `/me/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size`,
          )) as { value?: Array<{ id?: string; name?: string; contentType?: string; size?: number }> };
          return { attachments: data.value ?? [] };
        } catch (e) {
          return { error: e instanceof Error ? e.message : String(e), attachments: [] };
        }
      },
    }),

    attach_to_draft: tool({
      description:
        "Copy an attachment from an existing message onto a draft, so the draft goes out with that file attached. Use list_attachments first to get the attachment id.",
      inputSchema: z.object({
        draftId: z.string(),
        sourceMessageId: z.string(),
        attachmentId: z.string(),
      }),
      execute: async ({ draftId, sourceMessageId, attachmentId }) => {
        try {
          const att = (await graphJson(
            userId,
            `/me/messages/${encodeURIComponent(sourceMessageId)}/attachments/${encodeURIComponent(attachmentId)}`,
          )) as { name?: string; contentType?: string; contentBytes?: string };
          if (!att.contentBytes) {
            return { ok: false, error: "That attachment cannot be copied (it is not a file attachment)." };
          }
          await graphJson(userId, `/me/messages/${encodeURIComponent(draftId)}/attachments`, {
            method: "POST",
            body: JSON.stringify({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: att.name ?? "attachment",
              contentType: att.contentType ?? "application/octet-stream",
              contentBytes: att.contentBytes,
            }),
          });
          return { ok: true, draftId, name: att.name };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),
  };
}
