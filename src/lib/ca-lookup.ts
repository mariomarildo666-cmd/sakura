import { createPublicClient, formatEther, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

const FOUR_MEME_API_BASE = "https://four.meme/meme-api/v1";
const HELPER3_ADDRESS = "0xF251F83e40a78868FcfA3FA4599Dad6494E46034";

const helper3Abi = parseAbi([
  "function getTokenInfo(address token) view returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)",
]);

type RestTokenResponse = {
  code: number | string;
  msg?: string;
  data?: Record<string, unknown>;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  pairCreatedAt?: number | null;
  info?: {
    websites?: Array<{
      label?: string | null;
      url?: string | null;
    }> | null;
    socials?: Array<{
      type?: string | null;
      url?: string | null;
    }> | null;
  } | null;
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    } | null;
  } | null;
  volume?: {
    h24?: number;
  } | null;
  priceChange?: {
    h24?: number;
  } | null;
  liquidity?: {
    usd?: number;
  } | null;
  priceUsd?: string | null;
  marketCap?: number | null;
  fdv?: number | null;
};

type HolderSecurityRecord = {
  holder_count?: string | number | null;
  holders?: Array<{
    address?: string | null;
    percent?: string | number | null;
    is_locked?: string | number | boolean | null;
    is_contract?: string | number | boolean | null;
  }> | null;
};

export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export async function lookupCa(rawInput: string, rpcUrl?: string) {
  const tokenAddress = extractAddress(rawInput);
  if (!tokenAddress) {
    throw new Error("No valid contract address found in input.");
  }

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl || process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org"),
  });

  const [rest, chain, dexScreenerPairs] = await Promise.all([
    fetchRestToken(tokenAddress),
    fetchChainToken(publicClient, tokenAddress),
    fetchDexScreenerPairs(tokenAddress),
  ]);

  const [
    version,
    tokenManager,
    quote,
    lastPrice,
    tradingFeeRate,
    minTradingFee,
    launchTime,
    offers,
    maxOffers,
    funds,
    maxFunds,
    liquidityAdded,
  ] = chain;

  const bestDexPair = pickBestDexPair(dexScreenerPairs);
  const holderSignals = await fetchHolderSignals(tokenAddress);
  const launchTimestampMs = Number(launchTime) > 0 ? Number(launchTime) * 1000 : null;
  const pairAgeMinutes = getPairAgeMinutes(bestDexPair?.pairCreatedAt);
  const contractAgeMinutes = launchTimestampMs ? Math.max(0, Math.round((Date.now() - launchTimestampMs) / 60000)) : null;

  return {
    input: rawInput,
    tokenAddress,
    summary: {
      name: firstString(rest.data, ["tokenName", "name"]),
      symbol: firstString(rest.data, ["shortName", "symbol"]),
      creator: firstString(rest.data, ["creator", "founder", "userAddress"]),
      logoUrl: firstString(rest.data, ["imgUrl", "logoUrl", "image"]),
      description: firstString(rest.data, ["desc", "descr", "description"]),
      website: firstString(rest.data, ["webUrl"]) || getDexWebsite(bestDexPair),
      twitter: firstString(rest.data, ["twitterUrl"]) || getDexSocial(bestDexPair, "twitter"),
      telegram: firstString(rest.data, ["telegramUrl"]) || getDexSocial(bestDexPair, "telegram"),
      aiCreator: firstBoolean(rest.data, ["aiCreator"]),
      liquidityAdded,
      raisedBnb: formatEther(funds),
      maxRaisedBnb: formatEther(maxFunds),
      launchTime: new Date(Number(launchTime) * 1000).toISOString(),
      contractAgeMinutes,
      tokenAgeMinutes: contractAgeMinutes,
      tradingFeeRate: Number(tradingFeeRate) / 10000,
      tokenManager,
      version: Number(version),
      hasWebsite: Boolean(firstString(rest.data, ["webUrl"]) || getDexWebsite(bestDexPair)),
      hasTwitter: Boolean(firstString(rest.data, ["twitterUrl"]) || getDexSocial(bestDexPair, "twitter")),
      hasTelegram: Boolean(firstString(rest.data, ["telegramUrl"]) || getDexSocial(bestDexPair, "telegram")),
    },
    dexScreener: bestDexPair
      ? {
          url: bestDexPair.url || null,
          pairAddress: bestDexPair.pairAddress || null,
          dexId: bestDexPair.dexId || null,
          priceUsd: bestDexPair.priceUsd || null,
          liquidityUsd: bestDexPair.liquidity?.usd ?? null,
          marketCap: bestDexPair.marketCap ?? null,
          fdv: bestDexPair.fdv ?? null,
          volume24hUsd: bestDexPair.volume?.h24 ?? null,
          priceChange24h: bestDexPair.priceChange?.h24 ?? null,
          buys24h: bestDexPair.txns?.h24?.buys ?? null,
          sells24h: bestDexPair.txns?.h24?.sells ?? null,
          pairCreatedAt: bestDexPair.pairCreatedAt ?? null,
          pairAgeMinutes,
        }
      : null,
    holders: holderSignals,
    rest,
    chain: {
      version: version.toString(),
      tokenManager,
      quote: quote === "0x0000000000000000000000000000000000000000" ? null : quote,
      lastPrice: lastPrice.toString(),
      tradingFeeRate: tradingFeeRate.toString(),
      minTradingFee: minTradingFee.toString(),
      launchTime: launchTime.toString(),
      offers: offers.toString(),
      maxOffers: maxOffers.toString(),
      funds: funds.toString(),
      maxFunds: maxFunds.toString(),
      liquidityAdded,
    },
  };
}

export async function fetchChartCandles(rawInput: string) {
  return fetchChartCandlesForTimeframe(rawInput, "15m");
}

export async function fetchChartCandlesForTimeframe(rawInput: string, timeframe: string) {
  const tokenAddress = extractAddress(rawInput);
  if (!tokenAddress) {
    throw new Error("No valid contract address found in input.");
  }

  const pairs = await fetchDexScreenerPairs(tokenAddress);
  const bestPair = pickBestDexPair(pairs);
  if (!bestPair?.pairAddress) {
    return {
      tokenAddress,
      pairAddress: null,
      dexUrl: null,
      candles: [] as ChartCandle[],
    };
  }

  const candles = await fetchGeckoTerminalOhlcv(bestPair.pairAddress, timeframe);
  return {
    tokenAddress,
    pairAddress: bestPair.pairAddress,
    dexUrl: bestPair.url || null,
    timeframe,
    candles,
  };
}

function extractAddress(input: string): `0x${string}` | null {
  const match = input.match(/0x[a-fA-F0-9]{40}/);
  return match ? (match[0] as `0x${string}`) : null;
}

async function fetchRestToken(tokenAddress: `0x${string}`) {
  const url = `${FOUR_MEME_API_BASE}/private/token/get/v2?address=${encodeURIComponent(tokenAddress)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`token/get/v2 failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as RestTokenResponse;
  if (json.code !== 0 && json.code !== "0") {
    throw new Error(`Four.meme REST lookup failed: ${JSON.stringify(json)}`);
  }

  return json;
}

async function fetchChainToken(publicClient: ReturnType<typeof createPublicClient>, tokenAddress: `0x${string}`) {
  return publicClient.readContract({
    address: HELPER3_ADDRESS,
    abi: helper3Abi,
    functionName: "getTokenInfo",
    args: [tokenAddress],
  });
}

async function fetchDexScreenerPairs(tokenAddress: `0x${string}`) {
  const candidates = await Promise.all([
    fetchDexPairsFromUrl(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`),
    fetchDexPairsFromUrl(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(tokenAddress)}`),
    fetchDexPairsFromUrl(`https://api.dexscreener.com/token-pairs/v1/bsc/${encodeURIComponent(tokenAddress)}`),
  ]);

  const merged = candidates.flat();
  const seen = new Set<string>();
  const unique: DexPair[] = [];

  for (const pair of merged) {
    const key = String(pair.pairAddress || pair.url || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(pair);
  }

  return unique;
}

function pickBestDexPair(pairs: DexPair[]) {
  if (pairs.length === 0) return null;
  return (
    [...pairs].sort((a, b) => {
      const liquidityDelta = Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0);
      if (liquidityDelta !== 0) return liquidityDelta;
      return Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0);
    })[0] || null
  );
}

async function fetchDexPairsFromUrl(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    return [] as DexPair[];
  }

  const json = (await response.json()) as { pairs?: DexPair[] } | DexPair[] | null;
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.pairs)) return json.pairs;
  return [] as DexPair[];
}

async function fetchGeckoTerminalOhlcv(pairAddress: string, timeframe: string) {
  const config = getOhlcvConfig(timeframe);
  const url = `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${encodeURIComponent(pairAddress)}/ohlcv/${config.path}?aggregate=${config.aggregate}&limit=${config.limit}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    return [] as ChartCandle[];
  }

  const json = (await response.json()) as {
    data?: {
      attributes?: {
        ohlcv_list?: [number, number, number, number, number, number][];
      };
    };
  } | null;

  const list = json?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [] as ChartCandle[];

  return [...list]
    .reverse()
    .map(([time, open, high, low, close, volume]) => ({
      time,
      open,
      high,
      low,
      close,
      volume,
    }));
}

function getOhlcvConfig(timeframe: string) {
  switch (timeframe) {
    case "5m":
      return { path: "minute", aggregate: 5, limit: 120 };
    case "1h":
      return { path: "hour", aggregate: 1, limit: 120 };
    case "4h":
      return { path: "hour", aggregate: 4, limit: 120 };
    case "1d":
      return { path: "day", aggregate: 1, limit: 90 };
    case "15m":
    default:
      return { path: "minute", aggregate: 15, limit: 120 };
  }
}

function firstString(data: Record<string, unknown> | undefined, keys: string[]) {
  if (!data) return null;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function firstBoolean(data: Record<string, unknown> | undefined, keys: string[]) {
  if (!data) return null;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function getDexWebsite(pair: DexPair | null) {
  const websites = pair?.info?.websites;
  if (!Array.isArray(websites)) return null;

  for (const website of websites) {
    if (typeof website?.url === "string" && website.url.length > 0) {
      return website.url;
    }
  }

  return null;
}

function getDexSocial(pair: DexPair | null, type: string) {
  const socials = pair?.info?.socials;
  if (!Array.isArray(socials)) return null;

  for (const social of socials) {
    if (typeof social?.type === "string" && social.type.toLowerCase() !== type) continue;
    if (typeof social?.url === "string" && social.url.length > 0) {
      return social.url;
    }
  }

  return null;
}

async function fetchHolderSignals(tokenAddress: `0x${string}`) {
  try {
    const response = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=${encodeURIComponent(tokenAddress)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      return emptyHolderSignals();
    }

    const json = (await response.json()) as {
      result?: Record<string, HolderSecurityRecord | null> | null;
    } | null;

    const record = json?.result?.[tokenAddress.toLowerCase()] || json?.result?.[tokenAddress] || null;
    if (!record) {
      return emptyHolderSignals();
    }

    const holders = Array.isArray(record.holders) ? record.holders : [];
    const percents = holders
      .map((holder) => Number(holder?.percent || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    const topHolderPercent = percents.length ? Math.max(...percents) : null;
    const topTenPercent = percents
      .sort((left, right) => right - left)
      .slice(0, 10)
      .reduce((sum, value) => sum + value, 0);

    return {
      totalHolders: toNullableNumber(record.holder_count),
      topHolderPercent,
      distributionConcentration: topTenPercent || null,
    };
  } catch {
    return emptyHolderSignals();
  }
}

function emptyHolderSignals() {
  return {
    totalHolders: null,
    topHolderPercent: null,
    distributionConcentration: null,
  };
}

function toNullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPairAgeMinutes(pairCreatedAt?: number | null) {
  if (!pairCreatedAt || !Number.isFinite(pairCreatedAt)) return null;
  return Math.max(0, Math.round((Date.now() - Number(pairCreatedAt)) / 60000));
}
