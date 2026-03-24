import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeWithSakura } from "../agents/sakura.js";
import { launchTokenFromRequest } from "./fourmeme-launch.js";
import { lookupCa } from "./ca-lookup.js";

type XBotConfig = {
  botUsername: string;
  bearerToken: string;
  apiKey: string | null;
  apiSecret: string | null;
  accessToken: string | null;
  accessTokenSecret: string | null;
  userId: string | null;
  dryRun: boolean;
  pollSeconds: number;
  statePath: string;
  maxResults: number;
};

type XBotState = {
  lastMentionId: string | null;
  processedTweetIds: string[];
  updatedAt: string | null;
};

type XUser = {
  id: string;
  username: string;
  name?: string;
};

type XMention = {
  id: string;
  text: string;
  authorId: string;
  conversationId: string | null;
  createdAt: string | null;
  author: XUser | null;
};

type ProcessedMention = {
  mentionId: string;
  authorUsername: string | null;
  contractAddress: string | null;
  status: "replied" | "drafted" | "skipped" | "failed";
  replyText: string | null;
  replyTweetId: string | null;
  note: string;
};

type LaunchCommand = {
  name: string;
  shortName: string;
  desc?: string;
  webUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
};

type ProcessMentionsResult = {
  mode: "dry-run" | "live";
  mentionsFetched: number;
  mentionsHandled: number;
  lastMentionId: string | null;
  items: ProcessedMention[];
};

type DraftPayload = {
  tokenAddress: string;
  text: string;
  verdict: "bullish" | "bearish";
  name: string | null;
  symbol: string | null;
  bullCase: string[];
  bearCase: string[];
};

type MentionsResponse = {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    conversation_id?: string;
    created_at?: string;
  }>;
  includes?: {
    users?: Array<{
      id: string;
      username: string;
      name?: string;
    }>;
  };
  meta?: {
    newest_id?: string;
  };
};

type CreateTweetResponse = {
  data?: {
    id?: string;
    text?: string;
  };
};

const DEFAULT_STATE: XBotState = {
  lastMentionId: null,
  processedTweetIds: [],
  updatedAt: null,
};

const PROCESSED_TWEET_LIMIT = 200;

export async function processMentionsOnce() {
  const config = loadXBotConfig();
  const state = await readState(config);
  const userId = await getBotUserId(config);
  const mentions = await fetchMentions(config, userId, state.lastMentionId);
  const ordered = [...mentions].sort((left, right) => Number(left.id) - Number(right.id));
  const processed = new Set(state.processedTweetIds);
  const results: ProcessedMention[] = [];
  let newestId = state.lastMentionId;

  for (const mention of ordered) {
    if (!newestId || BigInt(mention.id) > BigInt(newestId)) {
      newestId = mention.id;
    }

    if (processed.has(mention.id)) {
      results.push({
        mentionId: mention.id,
        authorUsername: mention.author?.username || null,
        contractAddress: null,
        status: "skipped",
        replyText: null,
        replyTweetId: null,
        note: "already processed",
      });
      continue;
    }

    const contractAddress = extractContractAddress(mention.text);
    const launchCommand = parseLaunchCommandStrict(mention.text);

    if (launchCommand) {
      try {
        const launch = await launchTokenFromRequest({
          ...launchCommand,
          dryRun: config.dryRun,
        });
        const replyText = composeLaunchReplyText(launch, mention.author?.username || "anon");

        if (config.dryRun) {
          processed.add(mention.id);
          results.push({
            mentionId: mention.id,
            authorUsername: mention.author?.username || null,
            contractAddress: null,
            status: "drafted",
            replyText,
            replyTweetId: null,
            note: "launch dry run only",
          });
          continue;
        }

        const replyTweetId = await postReply(config, mention.id, replyText);
        processed.add(mention.id);
        results.push({
          mentionId: mention.id,
          authorUsername: mention.author?.username || null,
          contractAddress: launch.tokenAddress,
          status: "replied",
          replyText,
          replyTweetId,
          note: launch.tokenPageUrl ? "launch reply posted" : "launch posted without token page",
        });
        continue;
      } catch (error) {
        const failureText = composeLaunchFailureReplyText(
          error instanceof Error ? error.message : "launch failed",
          mention.author?.username || "anon",
        );

        let replyTweetId: string | null = null;
        if (!config.dryRun) {
          try {
            replyTweetId = await postReply(config, mention.id, failureText);
          } catch {}
        }

        processed.add(mention.id);
        results.push({
          mentionId: mention.id,
          authorUsername: mention.author?.username || null,
          contractAddress: null,
          status: "failed",
          replyText: failureText,
          replyTweetId,
          note: error instanceof Error ? error.message : "launch failed",
        });
        continue;
      }
    }

    if (!contractAddress) {
      processed.add(mention.id);
      results.push({
        mentionId: mention.id,
        authorUsername: mention.author?.username || null,
        contractAddress: null,
        status: "skipped",
        replyText: null,
        replyTweetId: null,
        note: "no contract address found",
      });
      continue;
    }

    try {
      const draft = await buildSakuraReplyDraft(contractAddress, mention.author?.username || "anon");
      if (config.dryRun) {
        processed.add(mention.id);
        results.push({
          mentionId: mention.id,
          authorUsername: mention.author?.username || null,
          contractAddress,
          status: "drafted",
          replyText: draft.text,
          replyTweetId: null,
          note: "dry run only",
        });
        continue;
      }

      const replyTweetId = await postReply(config, mention.id, draft.text);
      processed.add(mention.id);
      results.push({
        mentionId: mention.id,
        authorUsername: mention.author?.username || null,
        contractAddress,
        status: "replied",
        replyText: draft.text,
        replyTweetId,
        note: "reply posted",
      });
    } catch (error) {
      processed.add(mention.id);
      results.push({
        mentionId: mention.id,
        authorUsername: mention.author?.username || null,
        contractAddress,
        status: "failed",
        replyText: null,
        replyTweetId: null,
        note: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  const nextState: XBotState = {
    lastMentionId: newestId,
    processedTweetIds: [...processed].slice(-PROCESSED_TWEET_LIMIT),
    updatedAt: new Date().toISOString(),
  };
  await writeState(config, nextState);

  return {
    mode: config.dryRun ? "dry-run" : "live",
    mentionsFetched: mentions.length,
    mentionsHandled: results.filter((item) => item.status === "drafted" || item.status === "replied").length,
    lastMentionId: newestId,
    items: results,
  } satisfies ProcessMentionsResult;
}

export async function buildSakuraReplyDraft(rawInput: string, requesterUsername = "anon") {
  const [lookup, analysis] = await Promise.all([lookupCa(rawInput), analyzeWithSakura(rawInput)]);
  const text = composeReplyText(lookup, analysis, requesterUsername);

  return {
    tokenAddress: lookup.tokenAddress,
    text,
    verdict: analysis.verdict === "bullish" ? "bullish" : "bearish",
    name: lookup.summary.name,
    symbol: lookup.summary.symbol,
    bullCase: analysis.bullCase,
    bearCase: analysis.bearCase,
  } satisfies DraftPayload;
}

export async function pollMentionsForever() {
  const config = loadXBotConfig();
  for (;;) {
    const result = await processMentionsOnce();
    console.log(JSON.stringify(result, null, 2));
    await sleep(config.pollSeconds * 1000);
  }
}

function loadXBotConfig(): XBotConfig {
  const botUsername = process.env.X_BOT_USERNAME?.trim();
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();

  if (!botUsername) {
    throw new Error("Missing X_BOT_USERNAME.");
  }

  if (!bearerToken) {
    throw new Error("Missing X_BEARER_TOKEN.");
  }

  return {
    botUsername: botUsername.replace(/^@/, ""),
    bearerToken,
    apiKey: process.env.X_API_KEY?.trim() || null,
    apiSecret: process.env.X_API_SECRET?.trim() || null,
    accessToken: process.env.X_ACCESS_TOKEN?.trim() || null,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET?.trim() || null,
    userId: process.env.X_BOT_USER_ID?.trim() || null,
    dryRun: (process.env.X_BOT_DRY_RUN?.trim().toLowerCase() || "true") !== "false",
    pollSeconds: clampNumber(process.env.X_BOT_POLL_SECONDS, 60, 15),
    statePath: path.resolve(process.env.X_BOT_STATE_PATH?.trim() || ".data/x-bot-state.json"),
    maxResults: clampNumber(process.env.X_BOT_MAX_RESULTS, 10, 5),
  };
}

async function getBotUserId(config: XBotConfig) {
  if (config.userId) {
    return config.userId;
  }

  const response = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(config.botUsername)}`, {
    headers: {
      Authorization: `Bearer ${config.bearerToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve X bot user id: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as { data?: { id?: string } };
  const userId = json.data?.id;
  if (!userId) {
    throw new Error("X user id was not returned by API.");
  }

  return userId;
}

async function fetchMentions(config: XBotConfig, userId: string, sinceId: string | null) {
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/mentions`);
  url.searchParams.set("max_results", String(config.maxResults));
  url.searchParams.set("tweet.fields", "created_at,author_id,conversation_id");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name");
  if (sinceId) {
    url.searchParams.set("since_id", sinceId);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.bearerToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch X mentions: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as MentionsResponse;
  const users = new Map<string, XUser>();
  for (const user of json.includes?.users || []) {
    if (!user.id || !user.username) continue;
    users.set(user.id, { id: user.id, username: user.username, name: user.name });
  }

  return (json.data || []).map((mention) => ({
    id: mention.id,
    text: mention.text,
    authorId: mention.author_id,
    conversationId: mention.conversation_id || null,
    createdAt: mention.created_at || null,
    author: users.get(mention.author_id) || null,
  })) satisfies XMention[];
}

async function postReply(config: XBotConfig, inReplyToTweetId: string, text: string) {
  if (!config.apiKey || !config.apiSecret || !config.accessToken || !config.accessTokenSecret) {
    throw new Error("Missing X write credentials. Set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET.");
  }

  const url = "https://api.x.com/2/tweets";
  const body = JSON.stringify({
    text,
    reply: {
      in_reply_to_tweet_id: inReplyToTweetId,
    },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildOAuthHeader(
        "POST",
        url,
        config.apiKey,
        config.apiSecret,
        config.accessToken,
        config.accessTokenSecret,
      ),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Failed to post X reply: ${response.status} ${response.statusText} ${detail}`.trim());
  }

  const json = (await response.json()) as CreateTweetResponse;
  const replyTweetId = json.data?.id;
  if (!replyTweetId) {
    throw new Error("X reply created without tweet id.");
  }

  return replyTweetId;
}

async function readState(config: XBotConfig) {
  try {
    const raw = await readFile(config.statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<XBotState>;
    return {
      lastMentionId: typeof parsed.lastMentionId === "string" ? parsed.lastMentionId : null,
      processedTweetIds: Array.isArray(parsed.processedTweetIds)
        ? parsed.processedTweetIds.filter((item): item is string => typeof item === "string").slice(-PROCESSED_TWEET_LIMIT)
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    } satisfies XBotState;
  } catch {
    return DEFAULT_STATE;
  }
}

async function writeState(config: XBotConfig, state: XBotState) {
  await mkdir(path.dirname(config.statePath), { recursive: true });
  await writeFile(config.statePath, JSON.stringify(state, null, 2), "utf8");
}

function composeReplyText(
  lookup: Awaited<ReturnType<typeof lookupCa>>,
  analysis: Awaited<ReturnType<typeof analyzeWithSakura>>,
  requesterUsername: string,
) {
  const name = lookup.summary.name || "Unknown coin";
  const symbol = lookup.summary.symbol ? ` ($${lookup.summary.symbol})` : "";
  const verdict = analysis.verdict === "bullish" ? "BULLISH" : "BEARISH";
  const reason = analysis.bullCase[0] || analysis.bearCase[0] || "read is still forming";
  const summary = normalizeSentence(analysis.traderRead[0] || analysis.verdictLine);
  const why = normalizeSentence(reason);

  const chunks = [
    `@${trimUsername(requesterUsername)} Sakura read: ${verdict}`,
    `${truncateSafe(name, 34)}${truncateSafe(symbol, 12)}`,
    truncateSafe(summary, 110),
    `Why: ${truncateSafe(why, 72)}`,
    `CA: ${lookup.tokenAddress}`,
  ];

  return fitTweetSafe(chunks, 280);
}

function fitTweet(chunks: string[], limit: number) {
  let lines = [...chunks];
  while (lines.join("\n").length > limit && lines.length > 3) {
    lines.pop();
  }

  let text = lines.join("\n");
  if (text.length <= limit) {
    return text;
  }

  const overflow = text.length - limit + 1;
  const last = lines[lines.length - 1] || "";
  lines[lines.length - 1] = truncate(last, Math.max(0, last.length - overflow));
  text = lines.join("\n");

  return text.length > limit ? text.slice(0, limit - 3).trimEnd() + "..." : text;
}

function trimUsername(username: string) {
  return username.replace(/^@+/, "").trim() || "anon";
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
}

function normalizeSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractContractAddress(text: string) {
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

function parseLaunchCommand(text: string): LaunchCommand | null {
  const lowered = text.toLowerCase();
  const hasLaunchVerb =
    lowered.includes("launch") ||
    lowered.includes("create") ||
    lowered.includes("deploy") ||
    lowered.includes("çıkar") ||
    lowered.includes("cikar");

  if (!hasLaunchVerb) {
    return null;
  }

  const fields = extractLaunchFields(text);
  const ticker = fields.ticker?.trim().toUpperCase();
  const name = fields.name?.trim();

  if (!name || !ticker) {
    return null;
  }

  const normalizedName = name.replace(/\s+/g, " ").trim();
  if (normalizedName.length < 2 || normalizedName.length > 48) {
    return null;
  }

  return {
    name: normalizedName,
    shortName: ticker,
    ...(fields.desc ? { desc: fields.desc.trim() } : {}),
    ...(fields.website ? { webUrl: fields.website.trim() } : {}),
    ...(fields.twitter ? { twitterUrl: fields.twitter.trim() } : {}),
    ...(fields.telegram ? { telegramUrl: fields.telegram.trim() } : {}),
  };
}

function extractLaunchFields(text: string) {
  return {
    name: captureField(text, ["name", "isim"]) ?? captureQuotedValueAfterCommand(text),
    ticker: captureField(text, ["ticker", "symbol"]) ?? captureTickerToken(text),
    desc: captureField(text, ["desc", "description", "aciklama"]),
    website: captureField(text, ["website", "web"]),
    twitter: captureField(text, ["twitter", "x"]),
    telegram: captureField(text, ["telegram", "tg"]),
  };
}

function captureField(text: string, keys: string[]) {
  for (const key of keys) {
    const match = text.match(new RegExp(`${escapeRegex(key)}\\s*[:=-]\\s*([^\\n,]+)`, "i"));
    if (match?.[1]) {
      return sanitizeFieldValue(match[1]);
    }
  }
  return null;
}

function captureQuotedValueAfterCommand(text: string) {
  const match = text.match(/(?:launch|create|deploy|çıkar|cikar)\s+["“]([^"”]{2,48})["”]/i);
  return match?.[1] ? sanitizeFieldValue(match[1]) : null;
}

function captureTickerToken(text: string) {
  const match = text.match(/\$([A-Za-z0-9]{2,12})/);
  return match?.[1] || null;
}

function sanitizeFieldValue(value: string) {
  return value.replace(/^["“]|["”]$/g, "").trim();
}

function composeLaunchReplyText(
  launch: Awaited<ReturnType<typeof launchTokenFromRequest>>,
  requesterUsername: string,
) {
  const lines = [
    `@${trimUsername(requesterUsername)} Sakura launch ready: ${truncateSafe(launch.name, 28)} ($${launch.shortName})`,
    launch.tokenPageUrl ? `Four.meme: ${launch.tokenPageUrl}` : `Launch queued. Dry run: ${launch.dryRun ? "yes" : "no"}`,
  ];

  if (launch.txHash) {
    lines.push(`TX: https://bscscan.com/tx/${launch.txHash}`);
  } else if (launch.dryRun) {
    lines.push("Dry run only. Flip X_BOT_DRY_RUN=false for live launch.");
  }

  return fitTweetSafe(lines, 280);
}

function composeLaunchFailureReplyText(message: string, requesterUsername: string) {
  const normalized = message
    .replace(/\s+/g, " ")
    .replace(/^Four\.meme API error on [^:]+:\s*/i, "")
    .trim();

  return fitTweet(
    [
      `@${trimUsername(requesterUsername)} Sakura could not launch that token.`,
      `Why: ${truncateSafe(normalized || "Missing or invalid launch fields.", 160)}`,
      "Use: launch name: <name> ticker: <ticker>",
    ],
    280,
  );
}

function fitTweetSafe(chunks: string[], limit: number) {
  let lines = [...chunks];
  while (lines.join("\n").length > limit && lines.length > 3) {
    lines.pop();
  }

  let text = lines.join("\n");
  if (text.length <= limit) {
    return text;
  }

  const overflow = text.length - limit + 1;
  const last = lines[lines.length - 1] || "";
  lines[lines.length - 1] = truncateSafe(last, Math.max(0, last.length - overflow));
  text = lines.join("\n");

  return text.length > limit ? text.slice(0, Math.max(0, limit - 3)).trimEnd() + "..." : text;
}

function truncateSafe(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - 3)).trimEnd() + "...";
}

function parseLaunchCommandStrict(text: string): LaunchCommand | null {
  const lowered = text.toLowerCase();
  const hasLaunchVerb =
    lowered.includes("launch") ||
    lowered.includes("create") ||
    lowered.includes("deploy") ||
    lowered.includes("çıkar") ||
    lowered.includes("cikar");

  if (!hasLaunchVerb) {
    return null;
  }

  const fields = extractLaunchFieldsStrict(text);
  const ticker = fields.ticker?.trim().toUpperCase();
  const name = fields.name?.trim();

  if (!name || !ticker) {
    return null;
  }

  const normalizedName = name.replace(/\s+/g, " ").trim();
  if (normalizedName.length < 2 || normalizedName.length > 48) {
    return null;
  }

  return {
    name: normalizedName,
    shortName: ticker,
    ...(fields.desc ? { desc: fields.desc.trim() } : {}),
    ...(fields.website ? { webUrl: fields.website.trim() } : {}),
    ...(fields.twitter ? { twitterUrl: fields.twitter.trim() } : {}),
    ...(fields.telegram ? { telegramUrl: fields.telegram.trim() } : {}),
  };
}

function extractLaunchFieldsStrict(text: string) {
  return {
    name: captureFieldStrict(text, ["name", "isim"]) ?? captureQuotedValueAfterCommandStrict(text),
    ticker: captureFieldStrict(text, ["ticker", "symbol"]) ?? captureTickerToken(text),
    desc: captureFieldStrict(text, ["desc", "description", "aciklama"]),
    website: captureFieldStrict(text, ["website", "web"]),
    twitter: captureFieldStrict(text, ["twitter", "x"]),
    telegram: captureFieldStrict(text, ["telegram", "tg"]),
  };
}

function captureFieldStrict(text: string, keys: string[]) {
  for (const key of keys) {
    const match = text.match(new RegExp(`${escapeRegex(key)}\\s*[:=-]\\s*([^\\n,]+)`, "i"));
    if (match?.[1]) {
      return sanitizeFieldValueStrict(match[1]);
    }
  }
  return null;
}

function captureQuotedValueAfterCommandStrict(text: string) {
  const match = text.match(/(?:launch|create|deploy|çıkar|cikar)\s+["“]([^"”]{2,48})["”]/i);
  return match?.[1] ? sanitizeFieldValueStrict(match[1]) : null;
}

function sanitizeFieldValueStrict(value: string) {
  return value.replace(/^["“]|["”]$/g, "").trim();
}

function buildOAuthHeader(
  method: string,
  rawUrl: string,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string,
) {
  const url = new URL(rawUrl);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const queryParams: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    queryParams.push([key, value]);
  }

  const signingParams = [...Object.entries(oauthParams), ...queryParams]
    .map(([key, value]) => [percentEncode(key), percentEncode(value)] as const)
    .sort((left, right) => {
      if (left[0] === right[0]) return left[1].localeCompare(right[1]);
      return left[0].localeCompare(right[0]);
    });

  const parameterString = signingParams.map(([key, value]) => `${key}=${value}`).join("&");
  const baseUrl = `${url.protocol}//${url.host}${url.pathname}`;
  const baseString = [method.toUpperCase(), percentEncode(baseUrl), percentEncode(parameterString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  oauthParams.oauth_signature = signature;

  const headerValue = Object.entries(oauthParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ");

  return `OAuth ${headerValue}`;
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampNumber(raw: string | undefined, fallback: number, min: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
