import { fetchChartCandlesForTimeframe, lookupCa } from "../lib/ca-lookup.js";

type SakuraVerdict = "bullish" | "bearish";

export async function analyzeWithSakura(rawInput: string) {
  const [lookup, chart] = await Promise.all([
    lookupCa(rawInput),
    fetchChartCandlesForTimeframe(rawInput, "1h"),
  ]);

  const reasons: string[] = [];
  const cautions: string[] = [];
  let score = 0;

  const liquidityUsd = Number(lookup.dexScreener?.liquidityUsd || 0);
  const marketCap = Number(lookup.dexScreener?.marketCap || 0);
  const priceUsd = Number(lookup.dexScreener?.priceUsd || 0);
  const candleSummary = summarizeCandles(chart.candles);

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
    persona: "Sakura is a cute anime guardian who stays beside the trader and watches for danger first.",
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
  };
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
