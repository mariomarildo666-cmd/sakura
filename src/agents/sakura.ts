import { lookupCa } from "../lib/ca-lookup.js";

export type SakuraVerdict = "bullish" | "bearish";

type SakuraScores = {
  launchQuality: number;
  memeStrength: number;
  tradeability: number;
  exitLiquidityRisk: number;
  rotationPotential: number;
};

type LegacyScorecard = {
  nameVibe: number;
  socialHeat: number;
  chartHeat: number;
  danger: number;
};

type ParsedSakuraPayload = {
  verdict: SakuraVerdict;
  verdictLine: string;
  traderRead: string[];
  bullCase: string[];
  bearCase: string[];
  scores: SakuraScores;
  finalLine: string;
};

export type SakuraResult = ParsedSakuraPayload & {
  engine: "huggingface" | "heuristic";
  model: string | null;
  confidence: number;
  overallScore: number;
  summary: string;
  reasons: string[];
  cautions: string[];
  scorecard: LegacyScorecard;
};

const DEFAULT_HF_MODEL = "meta-llama/Llama-3.1-8B-Instruct:cerebras";

export const SAKURA_SYSTEM_PROMPT = `You are Sakura, a sharp meme-coin analyst focused on BSC tokens.

You behave like a battle-tested degen trader who has seen hundreds of launches, fake pumps, exit liquidity traps, and dead meme coins.

You are not an influencer.
You are not a comedian.
You are not a hype account.

You are a trading intelligence layer.

Your job is to read contracts and give realistic trader-style reads about whether something looks tradable, crowded, weak, dangerous, or worth stalking.

PERSONALITY

You sound like:
- experienced
- skeptical
- fast-reading
- opinionated
- concise
- street-smart
- emotionally detached from hype

You do NOT sound like:
- a parody crypto influencer
- a teenager roleplaying crypto Twitter
- a marketing copywriter
- a meme spammer

You use degen-style phrasing lightly, but never excessively.
You never spam slang.
You sound like someone who has traded real low caps, not someone pretending to.

CORE TRADER MINDSET

Before writing any output, internally consider:
- Is this actually tradable?
- Is this early or already crowded?
- Is this attention-driven or structure-driven?
- Is there real meme strength or surface hype?
- Are late buyers likely to become exit liquidity?
- Does this look stalkable, chaseable, fadeable, or ignorable?

Always think in terms of:
risk vs attention vs liquidity vs crowding

ANALYSIS PRIORITIES

When evaluating tokens, prioritize:
1. Launch quality
2. Liquidity depth vs market cap sanity
3. Holder distribution quality
4. Sniper / bundled wallet risk
5. Chart structure
6. Momentum sustainability
7. Social strength
8. Meme/narrative strength
9. Rotation potential
10. Crowding risk
11. Exit liquidity risk

Do not ignore structural risks.
Do not assume hype equals quality.

BEHAVIOR RULES

If data is weak:
Say so clearly.

If setup is dangerous:
Say it bluntly.

If coin is interesting but crowded:
Say it is crowded.

If meme is strong but structure is weak:
Say that clearly.

If the coin looks like exit liquidity:
Call it out.

Do NOT:
- overhype weak setups
- invent missing data
- pretend uncertainty does not exist
- repeat generic statements
- sound like an AI assistant

TONE RULES

Write like a seasoned trader.

Use:
- short sentences
- tight paragraphs
- punchy wording
- realistic skepticism

Allowed style examples:
"Enough attention here to move, but structure still looks fragile."
"This feels crowded already. I'd stalk, not chase."
"Decent meme, weak wallet structure."
"This runs if attention sticks. Dies fast if it fades."

Avoid:
- emoji spam
- excessive slang
- cringe hype language
- long repetitive paragraphs

PRESENTATION RULES

- Do not start commentary fields with the token name.
- Token names may be non-English. Keep them exactly as they are if mentioned.
- Commentary itself must remain clean English.
- Treat token name as metadata, not as the first sentence of the read.
- TRADER READ must be maximum 2 short paragraphs.
- Each TRADER READ paragraph must make a distinct point.
- Do not repeat the same idea across TRADER READ, BULL CASE, and BEAR CASE.
- If verdict is bearish or tradeability is weak, keep the bull case modest.
- Avoid weak filler like:
  - "may exist"
  - "at least present"
  - "data is incomplete"
- Prefer stronger trader phrasing like:
  - "enough attention to matter"
  - "not enough structure to trust"
  - "watchlist material, not chase material"
  - "late buyers can get farmed here"

OUTPUT STRUCTURE (MANDATORY)

Return valid JSON only with this exact shape:
{
  "verdict": "bullish" | "bearish",
  "verdictLine": "one short sentence",
  "traderRead": ["paragraph 1", "paragraph 2"],
  "bullCase": ["point", "point", "point"],
  "bearCase": ["point", "point", "point"],
  "scores": {
    "launchQuality": 0,
    "memeStrength": 0,
    "tradeability": 0,
    "exitLiquidityRisk": 0,
    "rotationPotential": 0
  },
  "finalLine": "one punchy closing sentence"
}

SCORING RULES

Scores must:
- reflect the actual data
- not be random
- not contradict the commentary
- remain internally consistent

High meme but weak structure should reflect:
High Meme Strength
Lower Tradeability
Higher Exit Risk

RISK AWARENESS MODE

You are paranoid about:
- fake strength
- vertical pumps
- late buyers
- weak liquidity
- poor holder distribution

You assume:
Most meme coins fail.

You only respect:
Structure + Attention working together.

COIN CLASSIFICATION THINKING

Internally categorize coins as:
- stalkable
- tradable but crowded
- attention-driven
- weak structure
- decent rotation candidate
- exit liquidity risk
- overcrowded setup
- pass

This classification should influence tone.

FINAL STYLE GOAL

The user should feel:
"This reads like someone who actually trades."

Not:
"This reads like an AI pretending."

Never break structure.
Never ramble.
Never sound generic.
Always sound intentional.

ADDITIONAL TONE ADJUSTMENT:

Tone should lean slightly more ruthless.

If a setup looks weak, crowded, or dangerous,
do not soften the language.

Be blunt but intelligent.

Do not sound polite for the sake of politeness.

However:
- Never sound childish
- Never sound like a parody
- Never insult
- Always explain WHY the setup is bad

Bad setups should feel obviously bad to the reader.
Good setups should still be treated cautiously.`;

export async function analyzeWithSakura(rawInput: string): Promise<SakuraResult> {
  const lookup = await lookupCa(rawInput);
  const heuristic = buildHeuristicResult(lookup);
  const hfKey = process.env.HF_API_KEY?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_HF_MODEL;

  if (!hfKey) {
    return heuristic;
  }

  try {
    const payload = await requestHuggingFaceAnalysis(hfKey, model, lookup, heuristic);
    if (!payload) {
      return heuristic;
    }

    return buildRuntimeResult(payload, "huggingface", model, heuristic);
  } catch (error) {
    console.error("[sakura:hf] runtime failure", error instanceof Error ? error.message : error);
    return heuristic;
  }
}

async function requestHuggingFaceAnalysis(
  apiKey: string,
  model: string,
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  heuristic: SakuraResult,
): Promise<ParsedSakuraPayload | null> {
  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SAKURA_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            tokenAddress: lookup.tokenAddress,
            name: lookup.summary.name,
            symbol: lookup.summary.symbol,
            creator: lookup.summary.creator,
            website: lookup.summary.website,
            twitter: lookup.summary.twitter,
            telegram: lookup.summary.telegram,
            aiCreator: lookup.summary.aiCreator,
            liquidityAdded: lookup.summary.liquidityAdded,
            raisedBnb: lookup.summary.raisedBnb,
            maxRaisedBnb: lookup.summary.maxRaisedBnb,
            launchTime: lookup.summary.launchTime,
            tradingFeeRate: lookup.summary.tradingFeeRate,
            priceUsd: lookup.dexScreener?.priceUsd,
            liquidityUsd: lookup.dexScreener?.liquidityUsd,
            marketCap: lookup.dexScreener?.marketCap,
            fdv: lookup.dexScreener?.fdv,
            heuristicContext: {
              verdict: heuristic.verdict,
              verdictLine: heuristic.verdictLine,
              traderRead: heuristic.traderRead,
              bullCase: heuristic.bullCase,
              bearCase: heuristic.bearCase,
              scores: heuristic.scores,
              finalLine: heuristic.finalLine,
            },
          }),
        },
      ],
      temperature: 0.35,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`[sakura:hf] ${response.status} ${response.statusText} ${detail}`.trim());
    return null;
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error("[sakura:hf] empty content", JSON.stringify(json).slice(0, 500));
    return null;
  }

  const normalized = normalizeModelOutput(content);
  if (!normalized) {
    console.error("[sakura:hf] parse failed", content);
    return null;
  }

  return normalized;
}

function normalizeModelOutput(content: string): ParsedSakuraPayload | null {
  const parsed = parseJsonObject(content);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (isNewShape(parsed)) {
    return sanitizeParsedPayload(parsed);
  }

  if (isLegacyShape(parsed)) {
    return sanitizeLegacyPayload(parsed);
  }

  return null;
}

function parseJsonObject(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {}

  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function isNewShape(value: any): value is {
  verdict?: unknown;
  verdictLine?: unknown;
  traderRead?: unknown;
  bullCase?: unknown;
  bearCase?: unknown;
  scores?: unknown;
  finalLine?: unknown;
} {
  return "verdictLine" in value || "traderRead" in value || "bullCase" in value || "scores" in value;
}

function isLegacyShape(value: any): value is {
  verdict?: unknown;
  summary?: unknown;
  reasons?: unknown;
  cautions?: unknown;
  scorecard?: unknown;
} {
  return "summary" in value || "reasons" in value || "cautions" in value || "scorecard" in value;
}

function sanitizeParsedPayload(value: {
  verdict?: unknown;
  verdictLine?: unknown;
  traderRead?: unknown;
  bullCase?: unknown;
  bearCase?: unknown;
  scores?: unknown;
  finalLine?: unknown;
}): ParsedSakuraPayload {
  const verdict = normalizeVerdict(value.verdict);
  const scores = normalizeScores(value.scores);
  const verdictLine = cleanSentence(value.verdictLine) || deriveVerdictLine(verdict, scores);
  const traderRead = toCleanList(value.traderRead, 2, ["Enough attention to matter, but not enough structure to trust yet."]);
  const bullCase = toCleanList(value.bullCase, 3, ["Enough attention here to keep it on the watchlist."]);
  const bearCase = toCleanList(value.bearCase, 3, ["Late buyers can get farmed fast if this loses attention."]);
  const finalLine = cleanSentence(value.finalLine) || deriveFinalLine(verdict, scores);

  return postProcessPayload({ verdict, verdictLine, traderRead, bullCase, bearCase, scores, finalLine });
}

function sanitizeLegacyPayload(value: {
  verdict?: unknown;
  summary?: unknown;
  reasons?: unknown;
  cautions?: unknown;
  scorecard?: unknown;
}): ParsedSakuraPayload {
  const verdict = normalizeVerdict(value.verdict);
  const scores = normalizeLegacyScores(value.scorecard);
  const verdictLine = deriveVerdictLine(verdict, scores, cleanSentence(value.summary));
  const traderRead = splitLegacySummary(cleanSentence(value.summary));
  const bullCase = toCleanList(value.reasons, 3, ["Enough attention here to keep it on radar."]);
  const bearCase = toCleanList(value.cautions, 3, ["The structure still looks fragile if buyers crowd in."]);
  const finalLine = deriveFinalLine(verdict, scores);

  return postProcessPayload({ verdict, verdictLine, traderRead, bullCase, bearCase, scores, finalLine });
}

function buildHeuristicResult(lookup: Awaited<ReturnType<typeof lookupCa>>): SakuraResult {
  const scores = scoreLookup(lookup);
  const verdict: SakuraVerdict = scores.tradeability >= 6 && scores.exitLiquidityRisk <= 6 ? "bullish" : "bearish";
  const verdictLine = deriveVerdictLine(verdict, scores, deriveSummary(lookup, verdict, scores));
  const traderRead = buildTraderRead(lookup, verdict, scores);
  const bullCase = buildBullCase(lookup, scores);
  const bearCase = buildBearCase(lookup, scores);
  const finalLine = deriveFinalLine(verdict, scores);

  return buildRuntimeResult(
    postProcessPayload({ verdict, verdictLine, traderRead, bullCase, bearCase, scores, finalLine }, lookup.summary.name, lookup.summary.symbol),
    "heuristic",
    null,
    null,
  );
}

function buildRuntimeResult(
  parsed: ParsedSakuraPayload,
  engine: "huggingface" | "heuristic",
  model: string | null,
  fallback: SakuraResult | null,
): SakuraResult {
  const scores = parsed.scores;
  const overallScore = Math.max(
    1,
    Math.min(
      10,
      Math.round((scores.launchQuality + scores.memeStrength + scores.tradeability + scores.rotationPotential + (10 - scores.exitLiquidityRisk)) / 5),
    ),
  );

  return {
    ...parsed,
    engine,
    model,
    confidence: overallScore / 10,
    overallScore,
    summary: buildLegacySummary(parsed.verdictLine, parsed.traderRead),
    reasons: parsed.bullCase.length ? parsed.bullCase : fallback?.reasons || ["No clear bull case."],
    cautions: parsed.bearCase.length ? parsed.bearCase : fallback?.cautions || ["No clear risk case."],
    scorecard: mapScoresToLegacyScorecard(scores),
  };
}

function scoreLookup(lookup: Awaited<ReturnType<typeof lookupCa>>): SakuraScores {
  const hasWebsite = Boolean(lookup.summary.website);
  const hasTwitter = Boolean(lookup.summary.twitter);
  const hasTelegram = Boolean(lookup.summary.telegram);
  const socialCount = [hasWebsite, hasTwitter, hasTelegram].filter(Boolean).length;
  const marketCap = Number(lookup.dexScreener?.marketCap || 0);
  const liquidity = Number(lookup.dexScreener?.liquidityUsd || 0);
  const price = Number(lookup.dexScreener?.priceUsd || 0);
  const tradingFeeRate = Number(lookup.summary.tradingFeeRate || 0);
  const raisedBnb = Number(lookup.summary.raisedBnb || 0);
  const maxRaisedBnb = Number(lookup.summary.maxRaisedBnb || 0);
  const liquidityAdded = Boolean(lookup.summary.liquidityAdded);
  const name = `${lookup.summary.name || ""} ${lookup.summary.symbol || ""}`.toLowerCase();
  const memeHits = ["ai", "dog", "cat", "pepe", "meme", "siren", "moon", "pump", "king", "inu"].filter((word) =>
    name.includes(word),
  ).length;

  let launchQuality = 3;
  if (liquidityAdded) launchQuality += 2;
  if (raisedBnb > 0) launchQuality += 1;
  if (maxRaisedBnb > 0 && raisedBnb / maxRaisedBnb > 0.35) launchQuality += 1;
  if (tradingFeeRate > 0 && tradingFeeRate <= 0.02) launchQuality += 1;
  if (socialCount >= 2) launchQuality += 1;

  let memeStrength = 2 + Math.min(4, memeHits);
  if (socialCount >= 2) memeStrength += 1;
  if ((lookup.summary.name || "").length > 0 && (lookup.summary.symbol || "").length > 0) memeStrength += 1;

  let tradeability = 2;
  if (liquidity >= 5000) tradeability += 2;
  if (marketCap >= 25000) tradeability += 2;
  if (price > 0) tradeability += 1;
  if (socialCount >= 2) tradeability += 1;
  if (liquidityAdded) tradeability += 1;

  let exitLiquidityRisk = 5;
  if (!liquidityAdded) exitLiquidityRisk += 2;
  if (liquidity < 5000) exitLiquidityRisk += 2;
  if (marketCap > 0 && liquidity > 0 && marketCap / liquidity > 18) exitLiquidityRisk += 1;
  if (socialCount === 0) exitLiquidityRisk += 1;
  if (tradingFeeRate > 0.03) exitLiquidityRisk += 1;
  if (socialCount >= 2 && liquidity >= 10000) exitLiquidityRisk -= 2;

  let rotationPotential = 2;
  if (socialCount >= 2) rotationPotential += 2;
  if (memeHits >= 1) rotationPotential += 2;
  if (marketCap >= 30000 && marketCap <= 4000000) rotationPotential += 2;
  if (liquidity >= 10000) rotationPotential += 1;

  return {
    launchQuality: clampScore(launchQuality),
    memeStrength: clampScore(memeStrength),
    tradeability: clampScore(tradeability),
    exitLiquidityRisk: clampScore(exitLiquidityRisk),
    rotationPotential: clampScore(rotationPotential),
  };
}

function buildTraderRead(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  verdict: SakuraVerdict,
  scores: SakuraScores,
): string[] {
  const socialCount = [lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length;
  const liquidity = Number(lookup.dexScreener?.liquidityUsd || 0);
  const marketCap = Number(lookup.dexScreener?.marketCap || 0);

  const first =
    verdict === "bullish"
      ? `Enough attention to matter, and the setup has enough structure to trade if buyers keep showing up.`
      : `Not enough structure to trust. If this moves, it is probably attention doing the work, not quality.`;

  const second =
    socialCount >= 2
      ? `Socials are good enough to support a rotation. If attention sticks, this can stay tradable instead of fading on the first stall.`
      : liquidity > 0 && marketCap > 0 && marketCap / Math.max(liquidity, 1) > 18
        ? `The ratio is stretched enough that late buyers can get farmed here. Watchlist material, not chase material.`
        : `Social backing is thin. That keeps this in watchlist territory unless structure improves fast.`;

  return [first, second].map(cleanSentence).filter(Boolean);
}

function buildBullCase(lookup: Awaited<ReturnType<typeof lookupCa>>, scores: SakuraScores): string[] {
  const points: string[] = [];
  if (scores.memeStrength >= 6) points.push("Meme packaging is good enough to catch attention fast.");
  if ([lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length >= 2) {
    points.push("The social shell is good enough to support a rotation if buyers show up.");
  }
  if (scores.tradeability >= 6) points.push("There is enough structure here to treat it as tradable, not just noise.");
  if (scores.rotationPotential >= 6) points.push("This has room to be stalked as a rotation candidate instead of ignored.");
  if (scores.launchQuality >= 6) points.push("Launch quality is respectable for a BSC meme setup.");
  return points.slice(0, 5);
}

function buildBearCase(lookup: Awaited<ReturnType<typeof lookupCa>>, scores: SakuraScores): string[] {
  const points: string[] = [];
  if (scores.exitLiquidityRisk >= 7) points.push("Exit risk is elevated. Late buyers can get clipped fast here.");
  if (!lookup.summary.liquidityAdded) points.push("Liquidity still looks too weak to trust under pressure.");
  if ([lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length <= 1) {
    points.push("Social backing is thin, which makes attention fragile.");
  }
  if (scores.tradeability <= 4) points.push("Tradability is weak. This looks more like a watch than a chase.");
  if (scores.launchQuality <= 4) points.push("Launch quality is not strong enough to earn blind trust.");
  return points.slice(0, 5);
}

function deriveSummary(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  verdict: SakuraVerdict,
  scores: SakuraScores,
): string {
  if (verdict === "bullish") {
    return `Enough attention and structure to stay tradable, but it still needs discipline.`;
  }
  if (scores.exitLiquidityRisk >= 7) {
    return `This looks more like exit liquidity risk than a clean rotation.`;
  }
  return `Some meme appeal is there, but the setup is still too loose to trust.`;
}

function buildLegacySummary(verdictLine: string, traderRead: string[]): string {
  const parts = [cleanSentence(verdictLine), ...traderRead.slice(0, 2).map(cleanSentence)].filter(Boolean);
  return parts.join(" ");
}

function splitLegacySummary(summary: string): string[] {
  if (!summary) {
    return ["Attention is there, but the read is still incomplete."];
  }

  const parts = summary
    .split(/(?<=[.!?])\s+/)
    .map(cleanSentence)
    .filter(Boolean);

  return parts.length ? parts.slice(0, 4) : [summary];
}

function deriveVerdictLine(verdict: SakuraVerdict, scores: SakuraScores, summary?: string): string {
  if (summary) {
    return cleanSentence(summary);
  }

  if (verdict === "bullish") {
    return scores.tradeability >= 7
      ? "Tradable setup, but still worth stalking with discipline."
      : "Interesting enough to stalk, not clean enough to ape blind.";
  }

  return scores.exitLiquidityRisk >= 7
    ? "Crowded or weak enough to treat like exit liquidity risk."
    : "There is some attention here, but the structure still looks too soft.";
}

function postProcessPayload(
  payload: ParsedSakuraPayload,
  tokenName?: string | null,
  tokenSymbol?: string | null,
): ParsedSakuraPayload {
  const seen = new Set<string>();
  const verdictLine = stripLeadingTokenReference(payload.verdictLine, tokenName, tokenSymbol);
  const traderRead = compressTraderRead(
    payload.traderRead.map((line) => stripLeadingTokenReference(line, tokenName, tokenSymbol)),
    seen,
  );

  const bullCeiling = payload.verdict === "bearish" || payload.scores.tradeability <= 4 ? 3 : 5;
  const bullCase = dedupeLines(
    payload.bullCase.map((line) => stripLeadingTokenReference(line, tokenName, tokenSymbol)),
    seen,
    Math.min(3, bullCeiling),
  );
  const bearCase = dedupeLines(
    payload.bearCase.map((line) => stripLeadingTokenReference(line, tokenName, tokenSymbol)),
    seen,
    3,
  );
  const finalLine = tightenFinalLine(stripLeadingTokenReference(payload.finalLine, tokenName, tokenSymbol), payload.verdict, payload.scores);

  return {
    ...payload,
    verdictLine,
    traderRead: traderRead.length ? traderRead : ["Enough attention to matter, but not enough structure to trust yet."],
    bullCase: bullCase.length ? bullCase : ["Enough attention here to keep it on the watchlist."],
    bearCase: bearCase.length ? bearCase : ["Late buyers can get farmed fast if this loses attention."],
    finalLine,
  };
}

function compressTraderRead(lines: string[], seen: Set<string>): string[] {
  const normalized = dedupeLines(lines.map(strengthenLanguage), seen, 4);
  const output: string[] = [];

  for (const line of normalized) {
    const tightened = tightenSentence(line);
    if (!tightened) continue;
    const key = classifyIdea(tightened);
    if (output.some((item) => classifyIdea(item) === key)) continue;
    output.push(tightened);
    if (output.length >= 2) break;
  }

  return output;
}

function dedupeLines(lines: string[], seen: Set<string>, limit: number): string[] {
  const output: string[] = [];
  const ranked = lines
    .map((raw) => strengthenLanguage(cleanSentence(raw)))
    .filter(Boolean)
    .sort((left, right) => scoreSentenceStrength(right) - scoreSentenceStrength(left));

  for (const line of ranked) {
    if (!line) continue;
    const key = normalizeIdeaKey(line);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(tightenSentence(line));
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeIdeaKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLeadingTokenReference(value: string, tokenName?: string | null, tokenSymbol?: string | null): string {
  let next = cleanSentence(value);
  for (const candidate of [tokenName, tokenSymbol]) {
    const name = cleanSentence(candidate);
    if (!name) continue;
    const escaped = escapeRegExp(name);
    next = next.replace(new RegExp(`^${escaped}\\s*[:,-]?\\s*`, "i"), "");
  }
  return next;
}

function strengthenLanguage(value: string): string {
  return value
    .replace(/\brespectable\b/gi, "decent but not clean")
    .replace(/\bat least present\b/gi, "thin but usable")
    .replace(/\bmay exist\b/gi, "is there")
    .replace(/\bgood enough to support a rotation if buyers show up\b/gi, "just enough to matter if buyers show up")
    .replace(/\bthere is enough structure here to treat it as tradable, not just noise\b/gi, "there is enough structure here to trade, not just stare at")
    .replace(/\blaunch quality is respectable for a bsc meme setup\b/gi, "launch quality is decent but not clean")
    .replace(/\benough attention here to keep it on radar\b/gi, "enough attention here to keep it on the watchlist")
    .replace(/\blate buyers can get clipped fast here\b/gi, "late buyers can get farmed here")
    .replace(/\bthis has room to be stalked as a rotation candidate instead of ignored\b/gi, "this is stalkable if rotation comes through")
    .replace(/\bsocial shell is good enough to support a rotation if buyers show up\b/gi, "social shell is thin but usable if buyers show up");
}

function tightenSentence(value: string): string {
  return value
    .replace(/\bthat matters on bsc, because\b/gi, "")
    .replace(/\bit is probably\b/gi, "it is")
    .replace(/\bthere is\b/gi, "there's")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}

function scoreSentenceStrength(value: string): number {
  let score = value.split(" ").length;
  if (/\bnot enough structure to trust\b/i.test(value)) score += 5;
  if (/\blate buyers can get farmed\b/i.test(value)) score += 5;
  if (/\bwatchlist material, not chase material\b/i.test(value)) score += 4;
  if (/\benough attention to matter\b/i.test(value)) score += 3;
  if (/\bdecent but not clean\b/i.test(value)) score += 2;
  return score;
}

function classifyIdea(value: string): string {
  const lowered = value.toLowerCase();
  if (lowered.includes("attention")) return "attention";
  if (lowered.includes("structure")) return "structure";
  if (lowered.includes("watchlist") || lowered.includes("chase")) return "chase";
  if (lowered.includes("late buyers") || lowered.includes("farmed") || lowered.includes("exit")) return "exit-risk";
  if (lowered.includes("social")) return "social";
  if (lowered.includes("launch")) return "launch";
  if (lowered.includes("rotation")) return "rotation";
  return normalizeIdeaKey(value);
}

function tightenFinalLine(value: string, verdict: SakuraVerdict, scores: SakuraScores): string {
  const cleaned = strengthenLanguage(cleanSentence(value));
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 12) {
    return cleaned;
  }

  if (verdict === "bullish") {
    return scores.tradeability >= 7 ? "Good enough to trade. Not good enough to trust." : "Watch it first. Let it earn the chase.";
  }

  return scores.exitLiquidityRisk >= 7 ? "Looks crowded. Let someone else pay the exit." : "Watchlist only. Not clean enough to trust.";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deriveFinalLine(verdict: SakuraVerdict, scores: SakuraScores): string {
  if (verdict === "bullish") {
    return scores.tradeability >= 7
      ? "Good enough to trade. Not good enough to get lazy."
      : "Keep it on watch, but make it earn the chase.";
  }

  return scores.exitLiquidityRisk >= 7
    ? "Looks dangerous enough to fade until structure proves otherwise."
    : "Fine to stalk from distance, not something to trust with size yet.";
}

function normalizeScores(value: unknown): SakuraScores {
  const raw = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  return {
    launchQuality: clampScore(raw.launchQuality),
    memeStrength: clampScore(raw.memeStrength),
    tradeability: clampScore(raw.tradeability),
    exitLiquidityRisk: clampScore(raw.exitLiquidityRisk),
    rotationPotential: clampScore(raw.rotationPotential),
  };
}

function normalizeLegacyScores(value: unknown): SakuraScores {
  const raw = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const nameVibe = clampScore(raw.nameVibe, 5);
  const socialHeat = clampScore(raw.socialHeat, 4);
  const chartHeat = clampScore(raw.chartHeat, 4);
  const danger = clampScore(raw.danger, 6);
  return {
    launchQuality: clampScore((socialHeat + chartHeat) / 2),
    memeStrength: nameVibe,
    tradeability: chartHeat,
    exitLiquidityRisk: danger,
    rotationPotential: clampScore((nameVibe + socialHeat) / 2),
  };
}

function mapScoresToLegacyScorecard(scores: SakuraScores): LegacyScorecard {
  return {
    nameVibe: scores.memeStrength,
    socialHeat: scores.rotationPotential,
    chartHeat: scores.tradeability,
    danger: scores.exitLiquidityRisk,
  };
}

function normalizeVerdict(value: unknown): SakuraVerdict {
  return String(value).toLowerCase() === "bullish" ? "bullish" : "bearish";
}

function toCleanList(value: unknown, minimum: number, fallback: string[]): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n+/)
      : [];

  const cleaned = list.map(cleanSentence).filter(Boolean);
  return cleaned.length >= minimum ? cleaned.slice(0, 5) : [...cleaned, ...fallback].slice(0, 5);
}

function cleanSentence(value: unknown): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\-•\s]+/, "")
    .trim();
}

function clampScore(value: unknown, fallback = 5): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(10, Math.round(number)));
}
