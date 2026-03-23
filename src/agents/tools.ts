import { analyzeWithSakura } from "./sakura.js";
import { lookupCa } from "../lib/ca-lookup.js";
import { buildSakuraReplyDraft } from "../lib/x-bot.js";

export type SakuraToolName = "lookup_token" | "analyze_token" | "build_tweet_draft";

export type SakuraToolTrace = {
  tool: SakuraToolName;
  status: "success" | "failed";
  note: string;
};

export async function runLookupTool(address: string) {
  return lookupCa(address);
}

export async function runAnalyzeTool(address: string) {
  return analyzeWithSakura(address);
}

export async function runTweetDraftTool(address: string, requesterUsername?: string) {
  return buildSakuraReplyDraft(address, requesterUsername || "anon");
}
