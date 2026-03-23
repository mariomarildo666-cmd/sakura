import { fetchChartCandlesForTimeframe, lookupCa } from "../lib/ca-lookup.js";

type SakuraVerdict = "bullish" | "bearish";

type SakuraResult = {
  tokenAddress: string;
  verdict: SakuraVerdict;
  score: number;
  confidence: number | null;
  persona: string;
  summary: string;
  scorecard: {
    nameVibe: number;
    socialHeat: number;
    chartHeat: number;
    danger: number;
  };
  market: {
    priceUsd: number | null;
    marketCap: number | null;
    liquidityUsd: number | null;
    changePct1h: number;
    volatilityPct1h: number;
  };
  reasons: string[];
  cautions: string[];
  engine: "heuristic" | "huggingface";
  model: string | null;
};

type SakuraLlmPayload = {
  verdict?: unknown;
  summary?: unknown;
  reasons?: unknown;
  cautions?: unknown;
  confidence?: unknown;
  scorecard?: unknown;
};

const SAKURA_PERSONA =
  "Sakura is a cute anime shitcoin trader who reads trend, meme energy, and name vibe before anything else.";

export async function analyzeWithSakura(rawInput: string) {
  const [lookup, chart] = await Promise.all([
    lookupCa(rawInput),
    fetchChartCandlesForTimeframe(rawInput, "1h"),
  ]);

  const heuristic = analyzeHeuristically(lookup, chart.candles);
  const huggingFaceResult =
    (await analyzeWithHuggingFace(lookup, chart.candles, heuristic)) ||
    (await analyzeWithHuggingFace(lookup, chart.candles, heuristic));

  if (!huggingFaceResult) {
    throw new Error("Sakura AI is unavailable right now.");
  }

  return huggingFaceResult;
}

async function analyzeWithHuggingFace(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  candles: Array<{ open: number; high: number; low: number; close: number; volume?: number }>,
  heuristic: SakuraResult,
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
        content: [
          "You are Sakura, a cute anime shitcoin trader with degen instincts.",
          "You analyze BSC meme coins and must stay grounded in the supplied data only.",
          "Talk like a sharp, terminally online shitcoin trader. Sound casual, punchy, and a little degen.",
          "Focus on trend, meme energy, ticker and name quality, social fuel, chart mood, and whether the coin feels easy to shill.",
          "Do not sound corporate, academic, or generic.",
          "Do not talk about liquidity unless it is absolutely necessary.",
          "A little playful absurdity is good, but do not invent facts.",
          "Always comment on the name or ticker vibe if possible.",
          "Always include at least one observation about chart heat or social heat.",
          "Use short trader phrasing like timeline bait, clean ticker, cooked chart, weak sauce, farmable, dead feed, easy shill, chop, or no juice when it fits the data.",
          "Return a raw JSON object only. No markdown. No code fences.",
          'Use this exact shape: {"verdict":"bullish","summary":"string","reasons":["..."],"cautions":["..."],"confidence":0.0,"scorecard":{"nameVibe":0,"socialHeat":0,"chartHeat":0,"danger":0}}',
          'The verdict field must be exactly one literal value: either "bullish" or "bearish". Never output placeholders like "bullish|bearish".',
          "Keep summary to one short paragraph.",
          "Reasons and cautions must each contain 2 to 4 concise strings.",
          "If the setup is unclear, lean bearish but sound like a shitcoin trader calling the vibe.",
        ].join(" "),
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
            heuristicBaseline: {
              verdict: heuristic.verdict,
              score: heuristic.score,
              summary: heuristic.summary,
              reasons: heuristic.reasons,
              cautions: heuristic.cautions,
              scorecard: heuristic.scorecard,
            },
          },
          null,
          2,
        ),
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 350,
    temperature: 0.9,
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

    const parsed = normalizeLlmResult(content, heuristic.verdict);
    if (!parsed) {
      console.error(`[sakura:hf] parse failed ${content}`);
      return null;
    }

    const reasons = finalizeInsights(parsed.reasons, buildReasonFallbacks(heuristic));
    const cautions = finalizeInsights(parsed.cautions, buildCautionFallbacks(heuristic));
    if (!reasons.length || !cautions.length) {
      console.error(`[sakura:hf] weak insight set ${content}`);
      return null;
    }

    return {
      ...heuristic,
      verdict: parsed.verdict,
      summary: parsed.summary,
      reasons,
      cautions,
      confidence: parsed.confidence,
      scorecard: parsed.scorecard,
      engine: "huggingface" as const,
      model,
    };
  } catch (error) {
    console.error("[sakura:hf] request failed", error);
    return null;
  }
}

function analyzeHeuristically(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  candles: Array<{ open: number; high: number; low: number; close: number }>,
): SakuraResult {
  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;

  const liquidityUsd = Number(lookup.dexScreener?.liquidityUsd || 0);
  const marketCap = Number(lookup.dexScreener?.marketCap || 0);
  const priceUsd = Number(lookup.dexScreener?.priceUsd || 0);
  const candleSummary = summarizeCandles(candles);
  const vibe = scoreNameVibe(lookup.summary.name, lookup.summary.symbol, lookup.summary.description);
  let nameVibe = 0;
  let socialHeat = 0;
  let chartHeat = 0;
  let danger = 0;

  if (vibe.score >= 2) {
    score += 2;
    nameVibe += 2;
    reasons.push(vibe.reason || "name and ticker have decent meme memory");
  } else if (vibe.score <= -1) {
    score -= 1;
    nameVibe -= 1;
    danger += 1;
    cautions.push(vibe.caution || "name and ticker feel hard to push on the timeline");
  }

  if (lookup.summary.aiCreator) {
    score += 1;
    socialHeat += 1;
    reasons.push("AI angle still farms attention in this lane");
  }

  if (marketCap >= 50000) {
    score += 1;
    chartHeat += 1;
    reasons.push("market cap is big enough to feel like a real rotation candidate");
  } else if (marketCap > 0 && marketCap < 10000) {
    score -= 1;
    danger += 1;
    cautions.push("market cap is still micro enough to feel one wallet away from chaos");
  }

  if (lookup.summary.website && (lookup.summary.twitter || lookup.summary.telegram)) {
    score += 1;
    socialHeat += 2;
    reasons.push("there is enough social surface to give the coin some timeline fuel");
  } else if (!lookup.summary.website && !lookup.summary.twitter && !lookup.summary.telegram) {
    score -= 1;
    socialHeat -= 2;
    danger += 1;
    cautions.push("the social shell is thin, so the narrative may die in the feed");
  }

  if (candleSummary.changePct >= 8) {
    score += 2;
    chartHeat += 2;
    reasons.push("chart is printing enough green to wake up the trend chasers");
  } else if (candleSummary.changePct <= -8) {
    score -= 2;
    chartHeat -= 2;
    danger += 2;
    cautions.push("chart is bleeding and the vibe is starting to smell like exit liquidity");
  }

  if (candleSummary.greenRatio >= 0.58) {
    score += 1;
    chartHeat += 1;
    reasons.push("recent candles still look like buyers are steering the meme");
  } else if (candleSummary.greenRatio <= 0.42) {
    score -= 1;
    chartHeat -= 1;
    danger += 1;
    cautions.push("recent candles look like sellers are farming the bounce");
  }

  if (candleSummary.volatilityPct >= 35 && liquidityUsd > 0) {
    danger += 1;
    cautions.push("the move is spicy enough to nuke late entries if the crowd apes too hard");
  }

  if (priceUsd > 0 && priceUsd < 0.00001) {
    nameVibe += 1;
    reasons.push("tiny unit bias can still bait the classic cheap-coin crowd");
  }

  if (!lookup.summary.liquidityAdded) {
    danger += 1;
    cautions.push("the coin still feels pre-chaos rather than post-send");
  }

  const verdict: SakuraVerdict = score >= 2 ? "bullish" : "bearish";
  const summary =
    verdict === "bullish"
      ? "Sakura likes the trend and the meme packaging. This one has enough sauce to tempt the timeline."
      : "Sakura is not buying the story yet. The chart or the branding still feels too awkward to shill with confidence.";

  return {
    tokenAddress: lookup.tokenAddress,
    verdict,
    score,
    confidence: null,
    persona: SAKURA_PERSONA,
    summary,
    scorecard: {
      nameVibe,
      socialHeat,
      chartHeat,
      danger,
    },
    market: {
      priceUsd: Number.isFinite(priceUsd) ? priceUsd : null,
      marketCap: Number.isFinite(marketCap) ? marketCap : null,
      liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : null,
      changePct1h: candleSummary.changePct,
      volatilityPct1h: candleSummary.volatilityPct,
    },
    reasons: reasons.slice(0, 4),
    cautions: cautions.slice(0, 4),
    engine: "heuristic",
    model: null,
  };
}

function normalizeLlmResult(content: string, fallbackVerdict: SakuraVerdict) {
  try {
    const payload = JSON.parse(extractJsonObject(content)) as SakuraLlmPayload;
    const verdict = payload.verdict === "bullish" ? "bullish" : payload.verdict === "bearish" ? "bearish" : fallbackVerdict;
    const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
    const reasons = sanitizeStringList(payload.reasons);
    const cautions = sanitizeStringList(payload.cautions);
    const confidence = clampConfidence(payload.confidence);
    const scorecard = normalizeScorecard(payload.scorecard);

    if (!summary || reasons.length === 0 || cautions.length === 0) {
      return null;
    }

    return {
      verdict,
      summary,
      reasons: reasons.slice(0, 4),
      cautions: cautions.slice(0, 4),
      confidence,
      scorecard,
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

function sanitizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => normalizeInsightText(item))
    .filter(Boolean);
}

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function normalizeScorecard(value: unknown) {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    nameVibe: clampMiniScore(raw.nameVibe),
    socialHeat: clampMiniScore(raw.socialHeat),
    chartHeat: clampMiniScore(raw.chartHeat),
    danger: clampMiniScore(raw.danger),
  };
}

function clampMiniScore(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  if (!Number.isFinite(number)) return 0;
  return Math.max(-2, Math.min(2, Math.round(number)));
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
    reason = "ticker is short enough to be sticky in chat and on the timeline";
  }

  if (name && /ai|agent|cat|dog|pepe|sakura|moon|pump|meme|coin|inu/.test(name.toLowerCase())) {
    score += 1;
    reason = "name hits familiar meme keywords, so the narrative is easy to grasp";
  }

  if (description && description.length > 24) {
    score += 1;
  }

  if (text.includes("fortune") || text.includes("oracle") || text.includes("agent")) {
    score += 1;
    reason = "theme has enough weird flavor to feel shillable";
  }

  if (name && name.length > 18) {
    score -= 1;
    caution = "name feels too long to spread cleanly";
  }

  if (symbol && symbol.length > 8) {
    score -= 1;
    caution = "ticker is too long and loses punch";
  }

  if (!/[a-z0-9]/i.test(text)) {
    score -= 1;
    caution = "branding is too abstract and hard to meme";
  }

  return { score, reason, caution };
}

function normalizeInsightText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\bgreenRatio\b/gi, "")
    .replace(/\bsampleSize\b/gi, "")
    .replace(/\bvolatilityPct\b/gi, "")
    .replace(/\bchangePct\b/gi, "")
    .replace(/\s+,/g, ",")
    .trim();
}

function isWeakInsight(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;

  const bannedFragments = [
    "greenratio",
    "samplesize",
    "volatilitypct",
    "changepct",
    "exactly",
    "0.5",
    "somewhat stable",
    "price seems",
    "indicating a mostly flat candle set",
    "flat candle set",
    "at this point",
    "looks okay",
    "pretty decent",
    "kind of",
    "sort of",
  ];

  if (bannedFragments.some((fragment) => normalized.includes(fragment))) {
    return true;
  }

  if (/\b\d+(\.\d+)?\b/.test(normalized) && !/\b\d+x\b/.test(normalized)) {
    return true;
  }

  if (normalized.length < 18) {
    return true;
  }

  return false;
}

function finalizeInsights(items: string[], fallback: string[]) {
  const final: string[] = [];
  const seen = new Set<string>();

  for (const item of [...items, ...fallback]) {
    const normalized = normalizeInsightText(item);
    const key = normalized.toLowerCase();
    if (!normalized || isWeakInsight(normalized) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    final.push(normalized);
    if (final.length >= 4) break;
  }

  return final;
}

function buildReasonFallbacks(result: SakuraResult) {
  const reasons: string[] = [];
  const { scorecard, market } = result;

  if (scorecard.nameVibe > 0) {
    reasons.push("name and ticker have enough timeline bait to feel easy to shill");
  }

  if (scorecard.socialHeat > 0) {
    reasons.push("social shell has enough pulse to give this thing some feed momentum");
  }

  if (scorecard.chartHeat > 1 || market.changePct1h > 6) {
    reasons.push("chart still has heat, so momentum chasers can actually notice it");
  } else if (scorecard.chartHeat > 0) {
    reasons.push("buyers still have a little control, so this is not fully cooked yet");
  }

  if (market.marketCap && market.marketCap >= 50000) {
    reasons.push("market cap is big enough to feel like a live rotation instead of a ghost launch");
  }

  if (market.priceUsd && market.priceUsd > 0 && market.priceUsd < 0.00001) {
    reasons.push("tiny unit bias can still bait the cheap-coin crowd into a fast ape");
  }

  return reasons.length ? reasons : result.reasons;
}

function buildCautionFallbacks(result: SakuraResult) {
  const cautions: string[] = [];
  const { scorecard, market } = result;

  if (scorecard.danger > 1) {
    cautions.push("this setup still smells like it can turn into exit liquidity fast");
  }

  if (scorecard.socialHeat < 0) {
    cautions.push("social presence feels dead, so the meme may never get enough timeline juice");
  }

  if (scorecard.chartHeat < 0 || market.changePct1h < -6) {
    cautions.push("chart looks cooked right now, so late apes could get farmed on the bounce");
  }

  if (scorecard.nameVibe < 0) {
    cautions.push("branding has weak sauce, so this is harder to push in chat than it should be");
  }

  if (!result.market.liquidityUsd && result.market.marketCap === null) {
    cautions.push("there is still not enough live market proof to trust the send");
  }

  if (result.cautions.some((item) => item.toLowerCase().includes("pre-chaos"))) {
    cautions.push("this still feels pre-chaos, not post-send");
  }

  return cautions.length ? cautions : result.cautions;
}
