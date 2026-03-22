import { fetchChartCandlesForTimeframe, lookupCa } from "../lib/ca-lookup.js";

type SakuraVerdict = "bullish" | "bearish";

type SakuraResult = {
  tokenAddress: string;
  verdict: SakuraVerdict;
  score: number;
  confidence: number | null;
  persona: string;
  summary: string;
  market: {
    priceUsd: number | null;
    marketCap: number | null;
    liquidityUsd: number | null;
    changePct1h: number;
    volatilityPct1h: number;
  };
  reasons: string[];
  cautions: string[];
  engine: "heuristic" | "openai";
  model: string | null;
};

type SakuraLlmPayload = {
  verdict?: unknown;
  summary?: unknown;
  reasons?: unknown;
  cautions?: unknown;
  confidence?: unknown;
};

const SAKURA_PERSONA =
  "Sakura is a cute anime guardian who stays beside the trader and watches for danger first.";

export async function analyzeWithSakura(rawInput: string) {
  const [lookup, chart] = await Promise.all([
    lookupCa(rawInput),
    fetchChartCandlesForTimeframe(rawInput, "1h"),
  ]);

  const heuristic = analyzeHeuristically(lookup, chart.candles);
  const openAiResult = await analyzeWithOpenAI(lookup, chart.candles, heuristic);

  return openAiResult || heuristic;
}

async function analyzeWithOpenAI(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  candles: Array<{ open: number; high: number; low: number; close: number; volume?: number }>,
  heuristic: SakuraResult,
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
  const candleSummary = summarizeCandles(candles);
  const payload = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You are Sakura, a cute anime market guardian who protects the trader from bad setups.",
          "You analyze BSC meme coins and must stay grounded in the supplied data only.",
          "Return a raw JSON object only. No markdown. No code fences.",
          'Use this exact shape: {"verdict":"bullish|bearish","summary":"string","reasons":["..."],"cautions":["..."],"confidence":0.0}',
          "Keep summary to one short paragraph.",
          "Reasons and cautions must each contain 2 to 4 concise strings.",
          "If the setup is unclear or fragile, lean bearish because Sakura protects first.",
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
            },
          },
          null,
          2,
        ),
      },
    ],
    response_format: {
      type: "json_object",
    },
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
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
      return null;
    }

    const parsed = normalizeLlmResult(content);
    if (!parsed) {
      return null;
    }

    return {
      ...heuristic,
      verdict: parsed.verdict,
      summary: parsed.summary,
      reasons: parsed.reasons,
      cautions: parsed.cautions,
      confidence: parsed.confidence,
      engine: "openai" as const,
      model,
    };
  } catch {
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

  if (lookup.summary.liquidityAdded) {
    score += 2;
    reasons.push("liquidity is live, so the market is already in trade mode");
  } else {
    score -= 3;
    cautions.push("liquidity is not added yet, so this is still fragile");
  }

  if (liquidityUsd >= 15000) {
    score += 2;
    reasons.push("liquidity looks healthy enough for cleaner execution");
  } else if (liquidityUsd > 0) {
    score -= 1;
    cautions.push("liquidity is thin, which makes volatility and slippage worse");
  } else {
    score -= 2;
    cautions.push("liquidity is missing or not visible");
  }

  if (marketCap >= 50000) {
    score += 1;
    reasons.push("market cap is starting to carry some weight");
  } else if (marketCap > 0 && marketCap < 10000) {
    score -= 1;
    cautions.push("market cap is still tiny, so it can move violently");
  }

  if (lookup.summary.website) {
    score += 1;
    reasons.push("project has at least one public link");
  } else {
    score -= 1;
    cautions.push("there is no visible public website");
  }

  if (lookup.summary.twitter || lookup.summary.telegram) {
    score += 1;
    reasons.push("there is some social surface to monitor");
  } else {
    score -= 1;
    cautions.push("social presence is weak right now");
  }

  if (candleSummary.changePct >= 8) {
    score += 2;
    reasons.push("short-term momentum is pushing up");
  } else if (candleSummary.changePct <= -8) {
    score -= 2;
    cautions.push("short-term momentum is rolling over");
  }

  if (candleSummary.greenRatio >= 0.58) {
    score += 1;
    reasons.push("recent candle structure favors buyers");
  } else if (candleSummary.greenRatio <= 0.42) {
    score -= 1;
    cautions.push("recent candle structure favors sellers");
  }

  if (candleSummary.volatilityPct >= 35) {
    cautions.push("volatility is elevated, so entries need discipline");
  }

  const verdict: SakuraVerdict = score >= 2 ? "bullish" : "bearish";
  const summary =
    verdict === "bullish"
      ? "Sakura says momentum is tradable, but only if you respect volatility and liquidity."
      : "Sakura says protect the trader first. The setup is too weak or too unstable right now.";

  return {
    tokenAddress: lookup.tokenAddress,
    verdict,
    score,
    confidence: null,
    persona: SAKURA_PERSONA,
    summary,
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

function normalizeLlmResult(content: string) {
  try {
    const payload = JSON.parse(extractJsonObject(content)) as SakuraLlmPayload;
    const verdict = payload.verdict === "bullish" ? "bullish" : payload.verdict === "bearish" ? "bearish" : null;
    const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
    const reasons = sanitizeStringList(payload.reasons);
    const cautions = sanitizeStringList(payload.cautions);
    const confidence = clampConfidence(payload.confidence);

    if (!verdict || !summary || reasons.length === 0 || cautions.length === 0) {
      return null;
    }

    return {
      verdict,
      summary,
      reasons: reasons.slice(0, 4),
      cautions: cautions.slice(0, 4),
      confidence,
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
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
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
