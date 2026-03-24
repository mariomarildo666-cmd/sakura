import { z } from "zod";

import { runAnalyzeTool, runLookupTool, runTweetDraftTool, type SakuraToolTrace } from "./tools.js";

const sakuraAgentRequestSchema = z.object({
  address: z.string().min(1),
  mode: z.enum(["read", "warn", "tweet", "reply"]).default("read"),
  question: z.string().trim().optional(),
  username: z.string().trim().optional(),
});

export type SakuraAgentMode = z.infer<typeof sakuraAgentRequestSchema>["mode"];

export type SakuraAgentRequest = z.input<typeof sakuraAgentRequestSchema>;

export type SakuraAgentResponse = {
  mode: SakuraAgentMode;
  tokenAddress: string;
  answer: string;
  nextActions: string[];
  toolTrace: SakuraToolTrace[];
  payload: {
    lookup: Awaited<ReturnType<typeof runLookupTool>>;
    analysis: Awaited<ReturnType<typeof runAnalyzeTool>>;
    tweetDraft?: Awaited<ReturnType<typeof runTweetDraftTool>>;
  };
};

export async function runSakuraAgent(input: SakuraAgentRequest) {
  const request = sakuraAgentRequestSchema.parse(input);
  const toolTrace: SakuraToolTrace[] = [];

  const lookup = await runWithTrace(toolTrace, "lookup_token", "loaded token profile", () => runLookupTool(request.address));
  const analysis = await runWithTrace(toolTrace, "analyze_token", "loaded Sakura market read", () => runAnalyzeTool(request.address));

  let tweetDraft: Awaited<ReturnType<typeof runTweetDraftTool>> | undefined;
  if (request.mode === "tweet" || request.mode === "reply") {
    tweetDraft = await runWithTrace(toolTrace, "build_tweet_draft", "prepared post copy", () =>
      runTweetDraftTool(request.address, request.username || "anon"),
    );
  }

  return {
    mode: request.mode,
    tokenAddress: lookup.tokenAddress,
    answer: buildAgentAnswer(request.mode, lookup, analysis, tweetDraft, request.question),
    nextActions: buildNextActions(request.mode, analysis.verdict),
    toolTrace,
    payload: {
      lookup,
      analysis,
      ...(tweetDraft ? { tweetDraft } : {}),
    },
  } satisfies SakuraAgentResponse;
}

async function runWithTrace<T>(
  toolTrace: SakuraToolTrace[],
  tool: SakuraToolTrace["tool"],
  successNote: string,
  action: () => Promise<T>,
) {
  try {
    const result = await action();
    toolTrace.push({ tool, status: "success", note: successNote });
    return result;
  } catch (error) {
    toolTrace.push({
      tool,
      status: "failed",
      note: error instanceof Error ? error.message : "unknown tool failure",
    });
    throw error;
  }
}

function buildAgentAnswer(
  mode: SakuraAgentMode,
  lookup: Awaited<ReturnType<typeof runLookupTool>>,
  analysis: Awaited<ReturnType<typeof runAnalyzeTool>>,
  tweetDraft: Awaited<ReturnType<typeof runTweetDraftTool>> | undefined,
  question: string | undefined,
) {
  const name = lookup.summary.name || "Unknown coin";
  const ticker = lookup.summary.symbol ? `$${lookup.summary.symbol}` : "no ticker";
  const primaryBull = analysis.bullCase[0] || "no clean bull case";
  const primaryBear = analysis.bearCase[0] || "no strong bear case";
  const nameLine = `${name} / ${ticker}`;

  switch (mode) {
    case "warn":
      return `VERDICT: ${analysis.verdictLine}\n\nTRADER READ:\n${analysis.traderRead.join("\n\n")}\n\nBULL CASE:\n- ${analysis.bullCase.join("\n- ")}\n\nBEAR CASE:\n- ${analysis.bearCase.join("\n- ")}\n\nSCORES:\n- Launch Quality: ${analysis.scores.launchQuality}/10\n- Meme Strength: ${analysis.scores.memeStrength}/10\n- Tradeability: ${analysis.scores.tradeability}/10\n- Exit Liquidity Risk: ${analysis.scores.exitLiquidityRisk}/10\n- Rotation Potential: ${analysis.scores.rotationPotential}/10\n\nFINAL LINE:\n${analysis.finalLine}`;
    case "tweet":
      return tweetDraft
        ? `Tweet mode is live for ${nameLine}. Draft leans on ${primaryBull}. Main risk is ${primaryBear}.`
        : `Tweet draft unavailable for ${name}.`;
    case "reply":
      return tweetDraft
        ? `Reply mode ready for ${nameLine}. Draft opens off ${analysis.verdictLine} and leans on ${primaryBull}.`
        : `Reply mode unavailable for ${name}.`;
    case "read":
    default:
      return question
        ? `Sakura read for "${question}": ${analysis.verdictLine} ${analysis.traderRead.join(" ")} Final read: ${analysis.finalLine}`
        : `VERDICT: ${analysis.verdictLine}\n\nTRADER READ:\n${analysis.traderRead.join("\n\n")}\n\nBULL CASE:\n- ${analysis.bullCase.join("\n- ")}\n\nBEAR CASE:\n- ${analysis.bearCase.join("\n- ")}\n\nSCORES:\n- Launch Quality: ${analysis.scores.launchQuality}/10\n- Meme Strength: ${analysis.scores.memeStrength}/10\n- Tradeability: ${analysis.scores.tradeability}/10\n- Exit Liquidity Risk: ${analysis.scores.exitLiquidityRisk}/10\n- Rotation Potential: ${analysis.scores.rotationPotential}/10\n\nFINAL LINE:\n${analysis.finalLine}`;
  }
}

function buildNextActions(mode: SakuraAgentMode, verdict: "bullish" | "bearish") {
  const base =
    verdict === "bullish"
      ? ["Switch to tweet mode", "Open market page", "Run warning mode"]
      : ["Run warning mode", "Open market page", "Switch to tweet mode"];

  if (mode === "tweet" || mode === "reply") {
    return ["Post the draft on X", "Run warning mode", "Open market page"];
  }

  return base;
}
