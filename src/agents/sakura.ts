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

type SakuraEvidenceContext = {
  hasName: boolean;
  hasSymbol: boolean;
  hasCreatorAddress: boolean;
  hasWebsite: boolean;
  hasTwitter: boolean;
  hasTelegram: boolean;
  socialLinkCount: number;
  hasPrice: boolean;
  hasLiquidity: boolean;
  hasMarketCap: boolean;
  hasFdv: boolean;
  hasPair: boolean;
  hasLaunchTime: boolean;
  hasRaisedBnb: boolean;
  hasMaxRaisedBnb: boolean;
  hasTradingFeeRate: boolean;
  liquidityAdded: boolean;
  hasCreatorHistory: false;
  hasHolderData: false;
  hasWalletDistribution: false;
  hasSocialMetrics: false;
  hasNarrativeMetrics: false;
  hasAttentionMetrics: false;
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

VARIATION RULES

- Do not reuse the same opening lines across outputs.
- Do not repeat the same risk phrases unless absolutely necessary.
- Rephrase similar ideas naturally.
- Let different tokens produce different voice texture.
- Avoid sounding like a fixed phrase engine.
- Do not mirror reference wording if reference context is provided.
- If two ideas are similar, keep the sharper one and phrase the second one differently.

STYLE RULES

- Write like a trader making live notes.
- Use fresh wording.
- Keep it concise, but not robotic.
- Avoid canned phrasing unless the setup truly demands it.
- Avoid stock lines like:
  - "social backing is thin"
  - "liquidity still looks weak"
  - "exit risk is elevated"
  - "enough attention to matter"
  unless those exact words feel necessary.

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
Good setups should still be treated cautiously.

EVIDENCE BOUNDARY RULES:

- Only make claims that are directly supported by the provided token data.
- Never invent facts that are not present in the input.
- Never guess creator reputation unless explicit creator-history data is provided.
- Never claim strong or weak social backing unless explicit social metrics are provided.
- Never describe wallet distribution unless holder/wallet data is explicitly present.
- Never infer "Binance backing", "creator reputation", "clean track record", or similar unless the input explicitly contains that information.
- If a datapoint is missing, say it is missing.
- Prefer "unknown", "unclear", "not enough data", or "unverified" over fabricated certainty.

DO NOT INVENT:
- creator reputation
- wallet distribution
- social strength
- holder quality
- narrative stickiness
- liquidity depth quality
- attention flow quality
unless those are explicitly present in the input data.

SOURCE AWARE WRITING RULES:

- Every important sentence in TRADER READ, BULL CASE, and BEAR CASE must be traceable to an input signal.
- If a sentence cannot be justified by the input data, remove or rewrite it.
- If social metrics are missing, say social quality is unclear or unverified.
- If holder data is missing, say holder quality is unknown.
- If creator history is missing, say creator quality is unverified.
- If narrative evidence is weak, say narrative strength is still unclear.`;

export async function analyzeWithSakura(rawInput: string): Promise<SakuraResult> {
  const lookup = await lookupCa(rawInput);
  const evidence = buildEvidenceContext(lookup);
  const heuristic = buildHeuristicResult(lookup);
  const hfKey = process.env.HF_API_KEY?.trim();
  const model = process.env.HF_MODEL?.trim() || DEFAULT_HF_MODEL;

  if (!hfKey) {
    return buildRuntimeResult(
      postProcessPayload(heuristic, lookup.summary.name, lookup.summary.symbol, lookup.tokenAddress, evidence),
      heuristic.engine,
      heuristic.model,
      heuristic,
    );
  }

  try {
    const payload = await requestHuggingFaceAnalysis(hfKey, model, lookup, heuristic, evidence);
    if (!payload) {
      return buildRuntimeResult(
        postProcessPayload(heuristic, lookup.summary.name, lookup.summary.symbol, lookup.tokenAddress, evidence),
        heuristic.engine,
        heuristic.model,
        heuristic,
      );
    }

    return buildRuntimeResult(
      postProcessPayload(payload, lookup.summary.name, lookup.summary.symbol, lookup.tokenAddress, evidence),
      "huggingface",
      model,
      heuristic,
    );
  } catch (error) {
    console.error("[sakura:hf] runtime failure", error instanceof Error ? error.message : error);
    return buildRuntimeResult(
      postProcessPayload(heuristic, lookup.summary.name, lookup.summary.symbol, lookup.tokenAddress, evidence),
      heuristic.engine,
      heuristic.model,
      heuristic,
    );
  }
}

async function requestHuggingFaceAnalysis(
  apiKey: string,
  model: string,
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  heuristic: SakuraResult,
  evidence: SakuraEvidenceContext,
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
            heuristicReference: {
              verdict: heuristic.verdict,
              scores: heuristic.scores,
              overallScore: heuristic.overallScore,
              classification:
                heuristic.overallScore >= 7
                  ? "tradable"
                  : heuristic.scores.exitLiquidityRisk >= 7
                    ? "exit-liquidity risk"
                    : heuristic.scores.tradeability <= 4
                      ? "watchlist"
                      : "mixed",
            },
            availableSignals: {
              tokenName: evidence.hasName,
              ticker: evidence.hasSymbol,
              creatorAddress: evidence.hasCreatorAddress,
              websiteLink: evidence.hasWebsite,
              twitterLink: evidence.hasTwitter,
              telegramLink: evidence.hasTelegram,
              socialLinkCount: evidence.socialLinkCount,
              priceUsd: evidence.hasPrice,
              liquidityUsd: evidence.hasLiquidity,
              marketCap: evidence.hasMarketCap,
              fdv: evidence.hasFdv,
              pairData: evidence.hasPair,
              launchTime: evidence.hasLaunchTime,
              raisedBnb: evidence.hasRaisedBnb,
              maxRaisedBnb: evidence.hasMaxRaisedBnb,
              tradingFeeRate: evidence.hasTradingFeeRate,
              liquidityAdded: evidence.liquidityAdded,
            },
            missingSignals: [
              "creator history",
              "holder distribution",
              "wallet quality",
              "verified social metrics",
              "attention flow metrics",
              "narrative metrics",
            ],
          }),
        },
      ],
      temperature: 0.68,
      top_p: 0.9,
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
  const traderRead = toCleanList(value.traderRead, 2, ["There is interest here, but the structure still needs proof."]);
  const bullCase = toCleanList(value.bullCase, 2, ["There is enough here to keep it on the watchlist."]);
  const bearCase = toCleanList(value.bearCase, 2, ["Late buyers are the first thing at risk if this slips."]);
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
  const bullCase = toCleanList(value.reasons, 2, ["There is enough attention here to stay on radar."]);
  const bearCase = toCleanList(value.cautions, 2, ["The structure still looks fragile if buyers pile in."]);
  const finalLine = deriveFinalLine(verdict, scores);

  return postProcessPayload({ verdict, verdictLine, traderRead, bullCase, bearCase, scores, finalLine });
}

function buildHeuristicResult(lookup: Awaited<ReturnType<typeof lookupCa>>): SakuraResult {
  const seed = buildVariationSeed(lookup.tokenAddress);
  const scores = scoreLookup(lookup);
  const verdict: SakuraVerdict = scores.tradeability >= 6 && scores.exitLiquidityRisk <= 6 ? "bullish" : "bearish";
  const verdictLine = deriveVerdictLine(verdict, scores, deriveSummary(lookup, verdict, scores, seed), seed);
  const traderRead = buildTraderRead(lookup, verdict, scores, seed);
  const bullCase = buildBullCase(lookup, scores, seed);
  const bearCase = buildBearCase(lookup, scores, seed);
  const finalLine = deriveFinalLine(verdict, scores, seed);

  return buildRuntimeResult(
    postProcessPayload(
      { verdict, verdictLine, traderRead, bullCase, bearCase, scores, finalLine },
      lookup.summary.name,
      lookup.summary.symbol,
      lookup.tokenAddress,
      buildEvidenceContext(lookup),
    ),
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
  seed: number,
): string[] {
  const socialCount = [lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length;
  const liquidity = Number(lookup.dexScreener?.liquidityUsd || 0);
  const marketCap = Number(lookup.dexScreener?.marketCap || 0);

  const bullishOpeners = [
    "There is enough going on here to keep traders interested, and the tape is not completely fake.",
    "This is not clean, but there is enough structure for it to matter if bids keep showing up.",
    "You can make a case for trading this, but only while attention and structure stay aligned.",
  ];
  const bearishOpeners = [
    "This does not look solid enough to trust yet. If it moves, hype is probably doing the lifting.",
    "The read still looks flimsy. Buyers might show up, but the structure is not carrying much weight.",
    "There is interest here, but not enough underneath it to treat this like a clean setup.",
  ];

  const socialReads = [
    "Public links are present, but social quality is still unverified.",
    "There are social links to check, though real backing is still unclear from this input.",
    "There is at least a surface social footprint, but not enough data to call it strong.",
  ];
  const stretchedReads = [
    "The ratio already looks stretched, which is where late buyers usually get punished.",
    "This is the kind of shape where late entries pay for everyone else if momentum slips.",
    "The move already feels extended enough that chasing here can turn into donation flow.",
  ];
  const thinReads = [
    "Social quality is unclear from the current input, so this stays in watchlist territory.",
    "There is not enough verified social evidence here to upgrade the read.",
    "Public support is still unverified, which keeps this in stalk-not-chase mode.",
  ];

  const first = verdict === "bullish" ? pickVariant(bullishOpeners, seed) : pickVariant(bearishOpeners, seed);
  const second =
    socialCount >= 2
      ? pickVariant(socialReads, seed + 1)
      : liquidity > 0 && marketCap > 0 && marketCap / Math.max(liquidity, 1) > 18
        ? pickVariant(stretchedReads, seed + 2)
        : pickVariant(thinReads, seed + 3);

  return [first, second].map(cleanSentence).filter(Boolean);
}

function buildBullCase(lookup: Awaited<ReturnType<typeof lookupCa>>, scores: SakuraScores, seed: number): string[] {
  const points: string[] = [];
  if (scores.memeStrength >= 6) {
    points.push(
      pickVariant(
        [
          "The meme packaging is strong enough to pull attention quickly.",
          "The name and ticker are readable enough to give the branding a chance.",
          "The branding is clear enough that traders will understand the pitch fast.",
        ],
        seed,
      ),
    );
  }
  if ([lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length >= 2) {
    points.push(
      pickVariant(
        [
          "The social layer is built enough to support a rotation if buyers lean in.",
          "There are public links to inspect, which is better than a blank shell.",
          "There is at least a visible social footprint, even if quality is still unverified.",
        ],
        seed + 1,
      ),
    );
  }
  if (scores.tradeability >= 6) {
    points.push(
      pickVariant(
        [
          "There is enough underneath it to trade instead of just spectate.",
          "The setup has enough shape that this can be worked, not just watched.",
          "This is structured enough to be tradable if the tape stays alive.",
        ],
        seed + 2,
      ),
    );
  }
  if (scores.rotationPotential >= 6) {
    points.push(
      pickVariant(
        [
          "This can still catch a rotation if the sector bid keeps moving.",
          "Market cap and liquidity are in a range that can still move if interest appears.",
          "This still sits in a size range where rotation can happen if bids show up.",
        ],
        seed + 3,
      ),
    );
  }
  if (scores.launchQuality >= 6) {
    points.push(
      pickVariant(
        [
          "The launch setup is decent enough that it is not immediately disqualified.",
          "Launch quality is not perfect, but it clears the minimum bar for a real look.",
          "The opening structure is decent but not clean, which is still workable on BSC.",
        ],
        seed + 4,
      ),
    );
  }
  return points.slice(0, 4);
}

function buildBearCase(lookup: Awaited<ReturnType<typeof lookupCa>>, scores: SakuraScores, seed: number): string[] {
  const points: string[] = [];
  if (scores.exitLiquidityRisk >= 7) {
    points.push(
      pickVariant(
        [
          "Late buyers are the first thing at risk if this stalls.",
          "This can turn into exit liquidity fast if the push loses steam.",
          "If this rolls over, the last buyers are probably the product.",
        ],
        seed,
      ),
    );
  }
  if (!lookup.summary.liquidityAdded) {
    points.push(
      pickVariant(
        [
          "The liquidity picture still looks too soft for real trust.",
          "Under pressure, the liquidity side still looks shaky.",
          "There is not enough liquidity comfort here if momentum slips.",
        ],
        seed + 1,
      ),
    );
  }
  if ([lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length <= 1) {
    points.push(
      pickVariant(
        [
          "The social layer is thin, which makes attention fragile.",
          "There are not enough visible social links to judge support with confidence.",
          "Public presence is limited, so social quality stays unverified.",
        ],
        seed + 2,
      ),
    );
  }
  if (scores.tradeability <= 4) {
    points.push(
      pickVariant(
        [
          "This is watchlist material, not chase material.",
          "The tape does not look good enough to reward bad entries.",
          "There is not enough here yet to justify chasing it.",
        ],
        seed + 3,
      ),
    );
  }
  if (scores.launchQuality <= 4) {
    points.push(
      pickVariant(
        [
          "Launch quality is still below the level that deserves blind trust.",
          "The opening setup still looks rough enough to keep size small.",
          "The launch structure is loose, which keeps this in cautious territory.",
        ],
        seed + 4,
      ),
    );
  }
  return points.slice(0, 4);
}

function deriveSummary(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  verdict: SakuraVerdict,
  scores: SakuraScores,
  seed: number,
): string {
  if (verdict === "bullish") {
    return pickVariant(
      [
        "There is enough attention and shape here to stay tradable, but it still needs discipline.",
        "This has enough going for it to trade, but not enough to trust blindly.",
        "The setup is workable, but it still needs respect and good entries.",
      ],
      seed,
    );
  }
  if (scores.exitLiquidityRisk >= 7) {
    return pickVariant(
      [
        "This reads closer to exit liquidity than a clean rotation.",
        "The setup leans more toward feeding exits than building a clean move.",
        "This looks more dangerous than tradable right now.",
      ],
      seed + 1,
    );
  }
  return pickVariant(
    [
      "There is some meme appeal here, but the setup is still too loose to trust.",
      "The story can catch attention, but the structure still feels undercooked.",
      "There is enough here to watch, not enough here to trust.",
    ],
    seed + 2,
  );
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

function deriveVerdictLine(verdict: SakuraVerdict, scores: SakuraScores, summary?: string, seed = 0): string {
  if (summary) {
    return cleanSentence(summary);
  }

  if (verdict === "bullish") {
    return scores.tradeability >= 7
      ? pickVariant(
          [
            "Tradable setup, but still worth stalking with discipline.",
            "Good enough to trade, not good enough to switch your brain off.",
            "This is tradable, but only if you stay selective.",
          ],
          seed,
        )
      : pickVariant(
          [
            "Interesting enough to stalk, not clean enough to ape blind.",
            "Worth tracking, not worth lunging at.",
            "There is enough here to monitor, not enough to blindly chase.",
          ],
          seed + 1,
        );
  }

  return scores.exitLiquidityRisk >= 7
    ? pickVariant(
        [
          "Crowded or weak enough to treat like exit liquidity risk.",
          "This is weak enough that exit risk is the first thing to respect.",
          "The setup looks crowded enough to punish lazy entries.",
        ],
        seed + 2,
      )
    : pickVariant(
        [
          "There is some attention here, but the structure still looks too soft.",
          "Interest is there, but the setup still feels too loose.",
          "There is a pulse here, but not enough to call it solid.",
        ],
        seed + 3,
      );
}

function postProcessPayload(
  payload: ParsedSakuraPayload,
  tokenName?: string | null,
  tokenSymbol?: string | null,
  tokenAddress?: string | null,
  evidence?: SakuraEvidenceContext,
): ParsedSakuraPayload {
  const seed = buildVariationSeed(tokenAddress || `${tokenName || ""}${tokenSymbol || ""}`);
  const verdictLine = enforceEvidenceBoundary(
    applyVariationPass(stripLeadingTokenReference(payload.verdictLine, tokenName, tokenSymbol), seed),
    evidence,
  );
  const traderRead = compressTraderRead(
    payload.traderRead.map((line) => stripLeadingTokenReference(line, tokenName, tokenSymbol)),
    seed,
    evidence,
  );

  const bullCase = compressCaseLines(
    payload.bullCase.map((line) => stripLeadingTokenReference(line, tokenName, tokenSymbol)),
    "bull",
    payload.verdict,
    payload.scores,
    seed + 11,
    evidence,
  );
  const bearCase = compressCaseLines(
    payload.bearCase.map((line) => stripLeadingTokenReference(line, tokenName, tokenSymbol)),
    "bear",
    payload.verdict,
    payload.scores,
    seed + 23,
    evidence,
  );
  const rawFinalLine = stripLeadingTokenReference(payload.finalLine, tokenName, tokenSymbol);
  const finalLine = sentenceNeedsEvidenceDowngrade(rawFinalLine, evidence)
    ? deriveFinalLine(payload.verdict, payload.scores, seed)
    : tightenFinalLine(rawFinalLine, payload.verdict, payload.scores, seed);

  return {
    ...payload,
    verdictLine,
    traderRead: traderRead.length ? traderRead : [pickVariant(["There is interest here, but the structure still needs proof.", "Enough here to watch, not enough here to trust yet."], seed)],
    bullCase: bullCase.length ? bullCase : [pickVariant(["There is enough here to keep it on the watchlist.", "There is still a reason to keep this on radar."], seed + 1)],
    bearCase: bearCase.length ? bearCase : [pickVariant(["Late buyers are the first thing at risk if this slips.", "If this loses momentum, the last buyers get punished first."], seed + 2)],
    finalLine,
  };
}

function compressTraderRead(lines: string[], seed: number, evidence?: SakuraEvidenceContext): string[] {
  const normalized = dedupeLines(lines.map((line) => applyVariationPass(line, seed)), seed, 4);
  const output: string[] = [];
  const localTopics = new Set<string>();

  for (const line of normalized) {
    const tightened = enforceEvidenceBoundary(tightenSentence(line), evidence);
    if (!tightened) continue;
    const key = classifyIdea(tightened);
    if (localTopics.has(key)) continue;
    localTopics.add(key);
    output.push(tightened);
    if (output.length >= 2) break;
  }

  return output;
}

function compressCaseLines(
  lines: string[],
  mode: "bull" | "bear",
  verdict: SakuraVerdict,
  scores: SakuraScores,
  seed: number,
  evidence?: SakuraEvidenceContext,
): string[] {
  const prepared = dedupeLines(lines, seed, 5);
  const output: string[] = [];

  for (const line of prepared) {
    const tightened = enforceEvidenceBoundary(tightenSentence(line), evidence);
    if (!tightened) continue;
    if (mode === "bull" && (verdict === "bearish" || scores.tradeability <= 4) && looksOvereagerBullLine(tightened)) {
      continue;
    }
    output.push(tightened);
    if (output.length >= 3) break;
  }

  return output;
}

function dedupeLines(lines: string[], seed: number, limit: number): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const localTopics = new Set<string>();
  const prepared = lines.map((raw) => applyVariationPass(cleanSentence(raw), seed)).filter(Boolean);

  for (const line of prepared) {
    if (!line) continue;
    const key = normalizeIdeaKey(line);
    if (seen.has(key)) continue;
    const topic = classifyIdea(line);
    if (localTopics.has(topic)) continue;
    seen.add(key);
    localTopics.add(topic);
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

function applyVariationPass(value: string, seed: number): string {
  let next = cleanSentence(value);
  if (!next) return "";

  const replacements: Array<[RegExp, string[]]> = [
    [/\brespectable\b/gi, ["decent but not clean", "solid enough for a look", "good enough to note"]],
    [/\bat least present\b/gi, ["thin but usable", "barely there but usable", "just enough to register"]],
    [/\bmay exist\b/gi, ["is there", "shows up", "does appear"]],
    [/\bsocial backing is thin\b/gi, ["the social layer is thin", "the social side still looks light", "support around it still feels shallow"]],
    [/\bliquidity still looks weak\b/gi, ["liquidity still feels light", "liquidity still looks soft", "the liquidity side still needs work"]],
    [/\bexit risk is elevated\b/gi, ["exit risk is real here", "this can turn into an exit-farm", "the exit risk is hard to ignore"]],
    [/\benough attention to matter\b/gi, ["enough attention here to matter", "enough eyes on it to count", "just enough attention to keep it live"]],
    [/\bwatchlist material, not chase material\b/gi, ["watchlist material, not chase material", "stalk it, do not chase it", "keep it close, not in size"]],
    [/\blate buyers can get farmed here\b/gi, ["late buyers can get farmed here", "late entries can get punished here", "late buyers are exposed here"]],
  ];

  for (const [index, [pattern, options]] of replacements.entries()) {
    next = next.replace(pattern, () => pickVariant(options, seed + index));
  }

  if (looksTemplateLike(next)) {
    next = paraphraseTemplateLine(next, seed);
  }

  return next;
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
  if (/\bstructure\b/i.test(value)) score += 2;
  if (/\brotation\b|\btradable\b/i.test(value)) score += 1;
  if (/\blate buyers\b|\bexit\b/i.test(value)) score += 2;
  if (/\bmarket cap\b|\bliquidity\b|\bsocial\b|\blaunch\b/i.test(value)) score += 1;
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

function tightenFinalLine(value: string, verdict: SakuraVerdict, scores: SakuraScores, seed: number): string {
  const cleaned = applyVariationPass(cleanSentence(value), seed);
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 12) {
    return cleaned;
  }

  if (verdict === "bullish") {
    return scores.tradeability >= 7
      ? pickVariant(["Good enough to trade. Not good enough to trust.", "Trade it if you want. Trust it if you are careless.", "Playable tape. Still not trust tape."], seed)
      : pickVariant(["Watch it first. Let it earn the chase.", "Keep it close. Make it prove itself.", "Track it first. Do not pay up yet."], seed + 1);
  }

  return scores.exitLiquidityRisk >= 7
    ? pickVariant(["Looks crowded. Let someone else pay the exit.", "Crowded setup. Let someone else fund the unwind.", "Too crowded for comfort. Let others test the exit."], seed + 2)
    : pickVariant(["Watchlist only. Not clean enough to trust.", "Track it, do not trust it.", "Worth monitoring. Not worth size yet."], seed + 3);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVariationSeed(value: string): number {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash);
}

function pickVariant<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}

function looksTemplateLike(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    lowered.includes("enough attention to matter") ||
    lowered.includes("watchlist material, not chase material") ||
    lowered.includes("late buyers can get farmed here") ||
    lowered.includes("social backing is thin") ||
    lowered.includes("liquidity still looks weak")
  );
}

function paraphraseTemplateLine(value: string, seed: number): string {
  let next = value;
  const swaps: Array<[RegExp, string[]]> = [
    [/\benough attention to matter\b/gi, ["enough attention here to count", "enough interest here to stay relevant", "enough eyes on it that it can still move"]],
    [/\bwatchlist material, not chase material\b/gi, ["keep it on the watchlist, not in a chase", "track it first, do not force the entry", "watch it before you pay up"]],
    [/\blate buyers can get farmed here\b/gi, ["late buyers can get clipped here", "late entries can get punished here", "this can still punish the last money in"]],
    [/\bsocial backing is thin\b/gi, ["the social side still looks light", "support around it still feels shallow", "the social layer still needs more weight"]],
    [/\bliquidity still looks weak\b/gi, ["liquidity still feels light", "the liquidity side still needs work", "liquidity still looks softer than it should"]],
  ];

  for (const [index, [pattern, options]] of swaps.entries()) {
    next = next.replace(pattern, () => pickVariant(options, seed + index));
  }

  return next;
}

function looksOvereagerBullLine(value: string): boolean {
  return /\b(send|rip|explod|fly|easy money|ape|moon)\b/i.test(value);
}

function buildEvidenceContext(lookup: Awaited<ReturnType<typeof lookupCa>>): SakuraEvidenceContext {
  return {
    hasName: Boolean(lookup.summary.name),
    hasSymbol: Boolean(lookup.summary.symbol),
    hasCreatorAddress: Boolean(lookup.summary.creator),
    hasWebsite: Boolean(lookup.summary.website),
    hasTwitter: Boolean(lookup.summary.twitter),
    hasTelegram: Boolean(lookup.summary.telegram),
    socialLinkCount: [lookup.summary.website, lookup.summary.twitter, lookup.summary.telegram].filter(Boolean).length,
    hasPrice: Number(lookup.dexScreener?.priceUsd || 0) > 0,
    hasLiquidity: Number(lookup.dexScreener?.liquidityUsd || 0) > 0,
    hasMarketCap: Number(lookup.dexScreener?.marketCap || 0) > 0,
    hasFdv: Number(lookup.dexScreener?.fdv || 0) > 0,
    hasPair: Boolean(lookup.dexScreener?.pairAddress),
    hasLaunchTime: Boolean(lookup.summary.launchTime),
    hasRaisedBnb: Number(lookup.summary.raisedBnb || 0) > 0,
    hasMaxRaisedBnb: Number(lookup.summary.maxRaisedBnb || 0) > 0,
    hasTradingFeeRate: Number(lookup.summary.tradingFeeRate || 0) >= 0,
    liquidityAdded: Boolean(lookup.summary.liquidityAdded),
    hasCreatorHistory: false,
    hasHolderData: false,
    hasWalletDistribution: false,
    hasSocialMetrics: false,
    hasNarrativeMetrics: false,
    hasAttentionMetrics: false,
  };
}

function enforceEvidenceBoundary(value: string, evidence?: SakuraEvidenceContext): string {
  const sentence = cleanSentence(value);
  if (!sentence) return "";
  if (!evidence) return sentence;

  if (/\b(binance backing|backed by binance|clean track record|creator has|creator history|reputable creator)\b/i.test(sentence)) {
    return "Creator quality is unverified.";
  }

  if (!evidence.hasHolderData && /\b(holder|holders|wallet distribution|distribution|wallet quality|holder quality|bundled wallets|sniper)\b/i.test(sentence)) {
    return "No verified holder data yet.";
  }

  if (!evidence.hasSocialMetrics && /\b(strong social|weak social|social backing|community support|community shell|social proof|audience side|attention from socials)\b/i.test(sentence)) {
    return evidence.socialLinkCount > 0
      ? "Social links are present, but social quality is still unverified."
      : "Social strength is unclear from the current input.";
  }

  if (!evidence.hasNarrativeMetrics && /\b(narrative strength|narrative is strong|sticky narrative|meme strength is strong|story is landing)\b/i.test(sentence)) {
    return "Narrative strength is still unclear.";
  }

  if (!evidence.hasAttentionMetrics && /\b(attention flow|crowd is here|crowded already|attention is strong|attention sticks)\b/i.test(sentence)) {
    return "Attention quality is unverified from the current input.";
  }

  if (!evidence.hasLiquidity && /\b(liquidity depth|deep liquidity|liquidity is strong|liquidity is weak)\b/i.test(sentence)) {
    return "Liquidity quality is unclear from current data.";
  }

  return sentence;
}

function sentenceNeedsEvidenceDowngrade(value: string, evidence?: SakuraEvidenceContext): boolean {
  if (!evidence) return false;
  return enforceEvidenceBoundary(value, evidence) !== cleanSentence(value);
}

function deriveFinalLine(verdict: SakuraVerdict, scores: SakuraScores, seed = 0): string {
  if (verdict === "bullish") {
    return scores.tradeability >= 7
      ? pickVariant(["Good enough to trade. Not good enough to get lazy.", "Playable if you stay sharp.", "Tradable, but only with discipline."], seed)
      : pickVariant(["Keep it on watch, but make it earn the chase.", "Watch it first. Make it prove itself.", "On radar, not on autopilot."], seed + 1);
  }

  return scores.exitLiquidityRisk >= 7
    ? pickVariant(["Looks dangerous enough to fade until structure proves otherwise.", "This looks easier to fade than trust.", "Let structure show up before you respect it."], seed + 2)
    : pickVariant(["Fine to stalk from distance, not something to trust with size yet.", "Watch from distance. No reason to force it.", "You can track it. You do not need to own it."], seed + 3);
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
