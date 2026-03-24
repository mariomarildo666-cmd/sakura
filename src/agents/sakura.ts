import { fetchChartCandlesForTimeframe, lookupCa } from "../lib/ca-lookup.js";

export type SakuraVerdict = "bullish" | "bearish";

export type SakuraScores = {
  launchQuality: number;
  memeStrength: number;
  tradeability: number;
  exitLiquidityRisk: number;
  rotationPotential: number;
};

export type SakuraResult = {
  tokenAddress: string;
  verdict: SakuraVerdict;
  overallScore: number;
  confidence: number | null;
  persona: string;
  verdictLine: string;
  traderRead: string[];
  bullCase: string[];
  bearCase: string[];
  scores: SakuraScores;
  finalLine: string;
  market: {
    priceUsd: number | null;
    marketCap: number | null;
    liquidityUsd: number | null;
    changePct1h: number;
    volatilityPct1h: number;
  };
  engine: "huggingface";
  model: string | null;
};

type SakuraBaseline = Omit<SakuraResult, "engine" | "model" | "confidence" | "persona">;

type SakuraLlmPayload = {
  verdict?: unknown;
  traderRead?: unknown;
  bullCase?: unknown;
  bearCase?: unknown;
  scores?: unknown;
  finalLine?: unknown;
};

type MiniScorecard = {
  nameVibe: number;
  socialHeat: number;
  chartHeat: number;
  danger: number;
};

const SAKURA_SYSTEM_PROMPT = String.raw`You are Sakura, a sharp meme-coin analyst focused on BSC tokens.

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

OUTPUT STRUCTURE (MANDATORY)

Always produce output in this format:

VERDICT:
One short sentence describing the overall read.

TRADER READ:
2–4 short paragraphs explaining the real trader perspective.
Focus on tradability, crowding, structure, and risk.

BULL CASE:
- 3 to 5 short bullet points

BEAR CASE:
- 3 to 5 short bullet points

SCORES:
- Launch Quality: X/10
- Meme Strength: X/10
- Tradeability: X/10
- Exit Liquidity Risk: X/10
- Rotation Potential: X/10

FINAL LINE:
One punchy closing sentence that sounds like a seasoned degen trader.

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

const SAKURA_OUTPUT_SCHEMA = [
  "Return raw JSON only. No markdown. No code fences.",
  'Use this exact shape: {"verdict":"One short sentence","traderRead":["paragraph 1","paragraph 2"],"bullCase":["..."],"bearCase":["..."],"scores":{"launchQuality":0,"memeStrength":0,"tradeability":0,"exitLiquidityRisk":0,"rotationPotential":0},"finalLine":"One closing sentence"}',
  "verdict must be one sentence, not a label.",
  "traderRead must contain 2 to 4 short paragraphs.",
  "bullCase and bearCase must each contain 3 to 5 short bullet strings.",
  "Scores must be integers from 0 to 10.",
  "Do not include any other keys.",
].join(" ");

export async function analyzeWithSakura(rawInput: string) {
  const [lookup, chart] = await Promise.all([
    lookupCa(rawInput),
    fetchChartCandlesForTimeframe(rawInput, "1h"),
  ]);

  const baseline = analyzeBaseline(lookup, chart.candles);
  const huggingFaceResult =
    (await analyzeWithHuggingFace(lookup, chart.candles, baseline)) ||
    (await analyzeWithHuggingFace(lookup, chart.candles, baseline));

  if (!huggingFaceResult) {
    throw new Error("Sakura AI is unavailable right now.");
  }

  return huggingFaceResult;
}

async function analyzeWithHuggingFace(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  candles: Array<{ open: number; high: number; low: number; close: number; volume?: number }>,
  baseline: SakuraBaseline,
) {
  const apiKey = process.env.HF_API_KEY?.trim() || process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_TOKEN?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.HF_MODEL?.trim() || "meta-llama/Llama-3.1-8B-Instruct:cerebras";
  const candleSummary = summarizeCandles(candles);
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: `${SAKURA_SYSTEM_PROMPT}\n\n${SAKURA_OUTPUT_SCHEMA}`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            token: {
              address: lookup.tokenAddress,
              name: lookup.summary.name,
              symbol: lookup.summary.symbol,
              creator: lookup.summary.creator,
              description: lookup.summary.description,
              website: lookup.summary.website,
              twitter: lookup.summary.twitter,
              telegram: lookup.summary.telegram,
              aiCreator: lookup.summary.aiCreator,
              liquidityAdded: lookup.summary.liquidityAdded,
              raisedBnb: lookup.summary.raisedBnb,
              maxRaisedBnb: lookup.summary.maxRaisedBnb,
              launchTime: lookup.summary.launchTime,
            },
            market: {
              priceUsd: lookup.dexScreener?.priceUsd || null,
              marketCap: lookup.dexScreener?.marketCap || null,
              liquidityUsd: lookup.dexScreener?.liquidityUsd || null,
              dexId: lookup.dexScreener?.dexId || null,
              dexUrl: lookup.dexScreener?.url || null,
            },
            candles1h: {
              sampleSize: candles.length,
              changePct: round(candleSummary.changePct),
              volatilityPct: round(candleSummary.volatilityPct),
              greenRatio: round(candleSummary.greenRatio),
            },
            baselineRead: {
              verdict: baseline.verdict,
              verdictLine: baseline.verdictLine,
              traderRead: baseline.traderRead,
              bullCase: baseline.bullCase,
              bearCase: baseline.bearCase,
              scores: baseline.scores,
              finalLine: baseline.finalLine,
            },
          },
          null,
          2,
        ),
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 550,
    temperature: 0.7,
  };

  try {
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
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
      console.error("[sakura:hf] empty content", JSON.stringify(json));
      return null;
    }

    const parsed = normalizeLlmResult(content, baseline);
    if (!parsed) {
      console.error(`[sakura:hf] parse failed ${content}`);
      return null;
    }

    return {
      ...parsed,
      tokenAddress: lookup.tokenAddress,
      persona: SAKURA_SYSTEM_PROMPT,
      market: baseline.market,
      confidence: null,
      engine: "huggingface" as const,
      model,
    } satisfies SakuraResult;
  } catch (error) {
    console.error("[sakura:hf] request failed", error);
    return null;
  }
}

function analyzeBaseline(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  candles: Array<{ open: number; high: number; low: number; close: number }>,
): SakuraBaseline {
  const liquidityUsd = Number(lookup.dexScreener?.liquidityUsd || 0);
  const marketCap = Number(lookup.dexScreener?.marketCap || 0);
  const priceUsd = Number(lookup.dexScreener?.priceUsd || 0);
  const candleSummary = summarizeCandles(candles);
  const vibe = scoreNameVibe(lookup.summary.name, lookup.summary.symbol, lookup.summary.description);
  const socialExists = Boolean(lookup.summary.website || lookup.summary.twitter || lookup.summary.telegram);
  const socialDepth = Number(Boolean(lookup.summary.website)) + Number(Boolean(lookup.summary.twitter)) + Number(Boolean(lookup.summary.telegram));

  const scorecard: MiniScorecard = {
    nameVibe: 0,
    socialHeat: 0,
    chartHeat: 0,
    danger: 0,
  };

  if (vibe.score >= 2) scorecard.nameVibe += 2;
  else if (vibe.score === 1) scorecard.nameVibe += 1;
  else if (vibe.score <= -1) scorecard.nameVibe -= 1;

  if (socialDepth >= 2) scorecard.socialHeat += 2;
  else if (socialExists) scorecard.socialHeat += 1;
  else scorecard.socialHeat -= 2;

  if (candleSummary.changePct >= 10) scorecard.chartHeat += 2;
  else if (candleSummary.changePct >= 4) scorecard.chartHeat += 1;
  else if (candleSummary.changePct <= -10) scorecard.chartHeat -= 2;
  else if (candleSummary.changePct <= -4) scorecard.chartHeat -= 1;

  if (!lookup.summary.liquidityAdded) scorecard.danger += 1;
  if (candleSummary.volatilityPct >= 35) scorecard.danger += 1;
  if (!socialExists) scorecard.danger += 1;
  if (marketCap > 0 && marketCap < 10000) scorecard.danger += 1;
  if (candleSummary.changePct <= -8) scorecard.danger += 1;
  if (liquidityUsd > 0 && marketCap > 0 && liquidityUsd / marketCap < 0.08) scorecard.danger += 1;

  const scores: SakuraScores = {
    launchQuality: deriveLaunchQuality(lookup, marketCap, liquidityUsd),
    memeStrength: deriveMemeStrength(vibe.score, socialDepth, candleSummary.changePct),
    tradeability: deriveTradeability(scorecard, marketCap, liquidityUsd),
    exitLiquidityRisk: deriveExitRisk(scorecard, candleSummary, liquidityUsd),
    rotationPotential: deriveRotationPotential(scorecard, marketCap, socialDepth),
  };

  const verdict = deriveVerdictFromScores("", scores, "bearish");
  const verdictLine =
    verdict === "bullish"
      ? "Tradable if attention holds, but it still needs discipline."
      : "Weak read overall. This is stalk-at-best, not chaseable.";

  const traderRead = [
    buildStructureParagraph(scores, marketCap, liquidityUsd, socialExists),
    buildMomentumParagraph(candleSummary.changePct, candleSummary.volatilityPct, scores),
    buildCrowdingParagraph(scores, lookup.summary.name, lookup.summary.symbol),
  ].filter(Boolean);

  const bullCase = finalizeBulletList(
    [
      vibe.reason || null,
      socialDepth >= 2 ? "Social shell is live enough to keep this on the feed." : null,
      candleSummary.changePct >= 4 ? "Momentum is there, so this can keep moving if attention sticks." : null,
      marketCap >= 50000 ? "Market cap is big enough to support a real rotation instead of a ghost bounce." : null,
      priceUsd > 0 && priceUsd < 0.00001 ? "Cheap-unit bias can still pull in the usual retail crowd." : null,
    ],
    "Not much of a bull case here beyond short attention spikes.",
  );

  const bearCase = finalizeBulletList(
    [
      vibe.caution || null,
      !socialExists ? "Social strength looks thin. That kills meme velocity fast." : null,
      candleSummary.changePct <= -4 ? "Chart structure is weak enough to trap late buyers." : null,
      scores.exitLiquidityRisk >= 7 ? "Exit liquidity risk is high if this squeezes and stalls." : null,
      !lookup.summary.liquidityAdded ? "Launch quality still looks unproven." : null,
    ],
    "Structure looks weak enough that I would not force this read.",
  );

  const finalLine =
    verdict === "bullish"
      ? "Watch the tape, not the story. This is only good while attention keeps paying."
      : "Most of these die fast. This one still looks closer to that side of the board.";

  return {
    tokenAddress: lookup.tokenAddress,
    verdict,
    overallScore: calculateOverallScore(scores),
    verdictLine,
    traderRead: traderRead.slice(0, 4),
    bullCase: bullCase.slice(0, 5),
    bearCase: bearCase.slice(0, 5),
    scores,
    finalLine,
    market: {
      priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
      marketCap: Number.isFinite(marketCap) ? marketCap : null,
      liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : null,
      changePct1h: candleSummary.changePct,
      volatilityPct1h: candleSummary.volatilityPct,
    },
  };
}

function normalizeLlmResult(content: string, baseline: SakuraBaseline) {
  try {
    const payload = JSON.parse(extractJsonObject(content)) as SakuraLlmPayload;
    const verdictLine = normalizeSentence(payload.verdict);
    const traderRead = sanitizeParagraphList(payload.traderRead);
    const bullCase = sanitizeBulletList(payload.bullCase);
    const bearCase = sanitizeBulletList(payload.bearCase);
    const scores = normalizeScores(payload.scores, baseline.scores);
    const finalLine = normalizeSentence(payload.finalLine);

    if (!verdictLine || traderRead.length < 2 || bullCase.length < 3 || bearCase.length < 3 || !finalLine) {
      return null;
    }

    const verdict = deriveVerdictFromScores(verdictLine, scores, baseline.verdict);

    return {
      verdict,
      overallScore: calculateOverallScore(scores),
      verdictLine,
      traderRead: traderRead.slice(0, 4),
      bullCase: bullCase.slice(0, 5),
      bearCase: bearCase.slice(0, 5),
      scores,
      finalLine,
    };
  } catch {
    return null;
  }
}

function extractJsonObject(content: string) {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found.");
  }
  return content.slice(start, end + 1);
}

function sanitizeParagraphList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => normalizeSentence(item))
    .filter((item) => item.length >= 24)
    .slice(0, 4);
}

function sanitizeBulletList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizeBullet(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
    if (items.length >= 5) break;
  }

  return items;
}

function normalizeScores(value: unknown, fallback: SakuraScores) {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    launchQuality: normalizeScore(raw.launchQuality, fallback.launchQuality),
    memeStrength: normalizeScore(raw.memeStrength, fallback.memeStrength),
    tradeability: normalizeScore(raw.tradeability, fallback.tradeability),
    exitLiquidityRisk: normalizeScore(raw.exitLiquidityRisk, fallback.exitLiquidityRisk),
    rotationPotential: normalizeScore(raw.rotationPotential, fallback.rotationPotential),
  };
}

function normalizeScore(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(10, Math.round(number)));
}

function normalizeSentence(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeBullet(value: string) {
  return normalizeSentence(value)
    .replace(/^[-*•]\s*/, "")
    .replace(/\.$/, "")
    .trim();
}

function calculateOverallScore(scores: SakuraScores) {
  const weighted =
    scores.launchQuality * 0.18 +
    scores.memeStrength * 0.18 +
    scores.tradeability * 0.28 +
    (10 - scores.exitLiquidityRisk) * 0.18 +
    scores.rotationPotential * 0.18;
  return Math.max(0, Math.min(10, Math.round(weighted)));
}

function summarizeCandles(candles: Array<{ open: number; high: number; low: number; close: number }>) {
  if (!candles.length) {
    return {
      changePct: 0,
      volatilityPct: 0,
      greenRatio: 0.5,
    };
  }

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const first = closes[0] || 0;
  const last = closes[closes.length - 1] || 0;
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const greenCount = candles.filter((candle) => candle.close >= candle.open).length;

  return {
    changePct: first > 0 ? ((last - first) / first) * 100 : 0,
    volatilityPct: minLow > 0 ? ((maxHigh - minLow) / minLow) * 100 : 0,
    greenRatio: greenCount / candles.length,
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function scoreNameVibe(name: string | null, symbol: string | null, description: string | null) {
  const text = `${name || ""} ${symbol || ""} ${description || ""}`.toLowerCase();
  let score = 0;
  let reason: string | null = null;
  let caution: string | null = null;

  if (symbol && symbol.length >= 3 && symbol.length <= 6) {
    score += 1;
    reason = "Ticker is short enough to travel clean if attention shows up.";
  }

  if (name && /ai|agent|cat|dog|pepe|sakura|moon|pump|meme|coin|inu/.test(name.toLowerCase())) {
    score += 1;
    reason = "Narrative is easy to clock fast. That matters on BSC.";
  }

  if (description && description.length > 24) {
    score += 1;
  }

  if (text.includes("fortune") || text.includes("oracle") || text.includes("agent")) {
    score += 1;
    reason = "Theme has enough hook to get attention without overexplaining it.";
  }

  if (name && name.length > 18) {
    score -= 1;
    caution = "Branding is too long. Harder to move clean in chats.";
  }

  if (symbol && symbol.length > 8) {
    score -= 1;
    caution = "Ticker is too long. It loses punch.";
  }

  if (!/[a-z0-9]/i.test(text)) {
    score -= 1;
    caution = "Branding feels random, not sticky.";
  }

  return { score, reason, caution };
}

function deriveLaunchQuality(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  marketCap: number,
  liquidityUsd: number,
) {
  let score = 4;
  if (lookup.summary.liquidityAdded) score += 2;
  if (lookup.summary.aiCreator) score += 1;
  if (marketCap >= 25000) score += 1;
  if (liquidityUsd >= 5000) score += 1;
  if (!lookup.summary.liquidityAdded) score -= 2;
  return clampScore(score);
}

function deriveMemeStrength(nameVibe: number, socialDepth: number, changePct: number) {
  let score = 4 + nameVibe * 2;
  if (socialDepth >= 2) score += 2;
  else if (socialDepth === 1) score += 1;
  else score -= 2;
  if (changePct >= 8) score += 1;
  return clampScore(score);
}

function deriveTradeability(scorecard: MiniScorecard, marketCap: number, liquidityUsd: number) {
  let score = 4 + scorecard.chartHeat * 2 + scorecard.socialHeat;
  if (marketCap >= 30000) score += 1;
  if (liquidityUsd >= 7000) score += 1;
  if (scorecard.danger >= 3) score -= 2;
  return clampScore(score);
}

function deriveExitRisk(
  scorecard: MiniScorecard,
  candleSummary: { volatilityPct: number; changePct: number },
  liquidityUsd: number,
) {
  let score = 5 + scorecard.danger * 2;
  if (candleSummary.volatilityPct >= 35) score += 1;
  if (candleSummary.changePct >= 15) score += 1;
  if (liquidityUsd >= 12000) score -= 1;
  return clampScore(score);
}

function deriveRotationPotential(scorecard: MiniScorecard, marketCap: number, socialDepth: number) {
  let score = 4 + scorecard.chartHeat + scorecard.socialHeat;
  if (marketCap >= 50000) score += 2;
  else if (marketCap >= 20000) score += 1;
  if (socialDepth >= 2) score += 1;
  if (scorecard.danger >= 3) score -= 1;
  return clampScore(score);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function deriveVerdictFromScores(verdictLine: string, scores: SakuraScores, fallback: SakuraVerdict): SakuraVerdict {
  const normalized = verdictLine.toLowerCase();
  const positiveSignal =
    scores.tradeability * 0.35 +
    scores.rotationPotential * 0.25 +
    scores.memeStrength * 0.2 +
    scores.launchQuality * 0.2;
  const negativeSignal = scores.exitLiquidityRisk * 0.45 + Math.max(0, 6 - scores.tradeability) * 0.35;

  if (/\b(pass|fade|weak|dangerous|avoid|dead|ignore|crowded|fragile|exit liquidity)\b/.test(normalized)) {
    return "bearish";
  }

  if (/\b(tradable|stalkable|worth stalking|decent rotation|live|interesting)\b/.test(normalized)) {
    return "bullish";
  }

  if (positiveSignal - negativeSignal >= 1) {
    return "bullish";
  }

  return fallback;
}

function buildStructureParagraph(
  scores: SakuraScores,
  marketCap: number,
  liquidityUsd: number,
  socialExists: boolean,
) {
  if (!marketCap && !liquidityUsd) {
    return "Data is still thin. Hard to call this properly when structure is not fully on the table.";
  }

  if (scores.tradeability >= 7) {
    return "Enough structure here to trade it if attention keeps doing the work. Not clean enough to marry, but clean enough to watch closely.";
  }

  if (scores.tradeability <= 4) {
    return "Structure still looks loose. You can get a bounce, but that is not the same thing as having a good setup.";
  }

  return socialExists
    ? "There is at least some structure behind the move, but it still needs attention to stay alive."
    : "Without real social backing, this setup has to prove itself on price alone.";
}

function buildMomentumParagraph(changePct: number, volatilityPct: number, scores: SakuraScores) {
  if (changePct >= 10) {
    return volatilityPct >= 35
      ? "Momentum is there, but the tape is hot enough to punish anyone chasing too late."
      : "Momentum looks real for now. This runs while buyers stay interested.";
  }

  if (changePct <= -8) {
    return "Tape looks weak right now. If this bounces, it still has to prove it is not just exit liquidity recycling.";
  }

  if (scores.exitLiquidityRisk >= 7) {
    return "The move can still squeeze, but the risk/reward degrades fast once the crowd starts piling in.";
  }

  return "Nothing broken, nothing clean. Feels more like a stalking setup than a chase.";
}

function buildCrowdingParagraph(scores: SakuraScores, name: string | null, symbol: string | null) {
  const identity = [name, symbol ? `$${symbol}` : null].filter(Boolean).join(" / ");

  if (scores.memeStrength >= 7 && scores.tradeability < 6) {
    return `${identity || "This coin"} has enough surface meme strength, but the structure is weaker than the branding. That disconnect matters.`;
  }

  if (scores.rotationPotential >= 7) {
    return `${identity || "This coin"} has enough attention potential to stay on the watchlist, but I would still respect crowding risk.`;
  }

  if (scores.memeStrength <= 4) {
    return `${identity || "This coin"} does not have much natural pull. If volume comes, it still needs a story people will actually carry.`;
  }

  return `${identity || "This coin"} is not a clean pass, but it still needs more than headline attention to matter.`;
}

function finalizeBulletList(items: Array<string | null>, fallback: string) {
  const seen = new Set<string>();
  const final: string[] = [];

  for (const item of items) {
    if (!item) continue;
    const normalized = normalizeBullet(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    final.push(normalized);
  }

  if (!final.length) {
    final.push(fallback);
  }

  return final;
}
