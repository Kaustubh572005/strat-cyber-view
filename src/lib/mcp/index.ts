import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConversations from "./tools/list-conversations";
import getConversation from "./tools/get-conversation";
import listNotifications from "./tools/list-notifications";
import listFeedArticles from "./tools/list-feed-articles";
import listNseDisclosures from "./tools/list-nse-disclosures";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "kaalu-mcp",
  title: "Kaalu Cyber Intelligence",
  version: "0.1.0",
  instructions:
    "Access the signed-in user's Kaalu conversations plus the cyber/regulatory intelligence repository (SEBI, CERT-In, cyber news, AI news, NSE cyber disclosures) and notifications.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listConversations, getConversation, listNotifications, listFeedArticles, listNseDisclosures],
});
