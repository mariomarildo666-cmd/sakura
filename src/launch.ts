import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import mime from "mime-types";
import { z } from "zod";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  formatEther,
  http,
  isHex,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const FOUR_MEME_API_BASE = "https://four.meme/meme-api";
const TOKEN_MANAGER_2_ADDRESS = "0x5c952063c7fc8610FFDB798152D69F0B9550762b";
const AGENT_IDENTIFIER_ADDRESS = "0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13";

const bsc = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: {
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://bsc-dataseed.binance.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "BscScan",
      url: "https://bscscan.com",
    },
  },
});

const tokenConfigSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  desc: z.string().min(1),
  imagePath: z.string().min(1),
  label: z.enum([
    "Meme",
    "AI",
    "Defi",
    "Games",
    "Infra",
    "De-Sci",
    "Social",
    "Depin",
    "Charity",
    "Others",
  ]),
  webUrl: z.union([z.string().url(), z.literal("")]).optional(),
  twitterUrl: z.union([z.string().url(), z.literal("")]).optional(),
  telegramUrl: z.union([z.string().url(), z.literal("")]).optional(),
  presale: z.string().default("0"),
  launchDelaySeconds: z.number().int().min(0).default(120),
  raisedTokenSymbol: z.string().default("BNB"),
  walletName: z.string().default("MetaMask"),
  feePlan: z.boolean().default(false),
  onlyMPC: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  taxToken: z
    .object({
      feeRate: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)]),
      burnRate: z.number().int().min(0),
      divideRate: z.number().int().min(0),
      liquidityRate: z.number().int().min(0),
      recipientRate: z.number().int().min(0),
      recipientAddress: z.string().default(""),
      minSharing: z.number().int().min(100000),
    })
    .optional(),
});

const tokenManager2Abi = parseAbi([
  "function _launchFee() view returns (uint256)",
  "function _tradingFeeRate() view returns (uint256)",
  "function createToken(bytes args, bytes signature) payable",
  "event TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)",
]);

const agentIdentifierAbi = parseAbi([
  "function isAgent(address wallet) view returns (bool)",
]);


type TokenConfig = z.infer<typeof tokenConfigSchema>;

type RaisedTokenConfig = {
  symbol: string;
  nativeSymbol: string;
  symbolAddress: string;
  deployCost: string;
  buyFee: string;
  sellFee: string;
  minTradeFee: string;
  b0Amount: string;
  totalBAmount: string;
  totalAmount: string;
  logoUrl: string;
  tradeLevel: string[];
  status: string;
  buyTokenLink?: string;
  reservedNumber: number;
  saleRate: string;
  networkCode: string;
  platform: string;
};

type FourMemeResponseError = {
  code?: number | string;
  msg?: string;
};

class FourMemeApiError extends Error {
  payload: FourMemeResponseError;

  constructor(endpoint: string, payload: FourMemeResponseError) {
    super(`Four.meme API error on ${endpoint}: ${JSON.stringify(payload)}`);
    this.payload = payload;
  }
}

async function main() {
  const rpcUrl = mustEnv("BSC_RPC_URL");
  const privateKey = mustEnv("PRIVATE_KEY");
  const mode = process.argv[2] === "symbol-check" ? "symbol-check" : "launch";
  const configPath = mode === "symbol-check" ? (process.argv[3] ?? "token.json") : (process.argv[2] ?? "token.json");
  const resolvedConfigPath = path.resolve(configPath);
  const config = await readTokenConfig(resolvedConfigPath);

  validateConfig(config);

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(rpcUrl),
  });

  console.log(`Launch wallet: ${account.address}`);

  const isAgent = await publicClient.readContract({
    address: AGENT_IDENTIFIER_ADDRESS,
    abi: agentIdentifierAbi,
    functionName: "isAgent",
    args: [account.address],
  });

  console.log(`Agent wallet detected: ${isAgent ? "yes" : "no"}`);
  if (!isAgent) {
    console.log("Warning: this wallet is not flagged by Four.meme as an agent wallet.");
  }

  const launchFee = await publicClient.readContract({
    address: TOKEN_MANAGER_2_ADDRESS,
    abi: tokenManager2Abi,
    functionName: "_launchFee",
  });

  console.log(`Current on-chain launch fee: ${formatEther(launchFee)} BNB`);

  const authToken = await loginToFourMeme(account.address, config.walletName, account);
  const imageUrl = await uploadImage(authToken, resolvedConfigPath, config.imagePath);
  const raisedToken = await fetchRaisedTokenConfig(config.raisedTokenSymbol);

  if (raisedToken.symbol !== "BNB") {
    throw new Error(
      `This launcher currently supports BNB pair launches only. Requested pair: ${raisedToken.symbol}`,
    );
  }

  if (mode === "symbol-check") {
    const candidatesPath = process.argv[4] ?? "symbols.txt";
    await runSymbolCheck(authToken, imageUrl, raisedToken, config, path.resolve(candidatesPath));
    return;
  }

  const launchTime = Date.now() + config.launchDelaySeconds * 1000;
  const createPayload = buildCreatePayload(config, imageUrl, raisedToken, launchTime, config.shortName);

  console.log("Requesting create signature from Four.meme...");
  const createResponse = await requestCreateSignature(authToken, createPayload);

  const createArg = normalizeBytes(createResponse.createArg, "createArg");
  const signature = normalizeBytes(createResponse.signature, "signature");
  const presaleValue = parseEther(config.presale);
  const tradingFeeRate = await publicClient.readContract({
    address: TOKEN_MANAGER_2_ADDRESS,
    abi: tokenManager2Abi,
    functionName: "_tradingFeeRate",
  });
  const presaleTradingFee = (presaleValue * tradingFeeRate) / 10000n;
  const txValue = launchFee + presaleValue + presaleTradingFee;

  console.log(`Planned launch time: ${new Date(launchTime).toISOString()}`);
  console.log(`Presale amount: ${config.presale} BNB`);
  console.log(`Presale trading fee: ${formatEther(presaleTradingFee)} BNB`);
  console.log(`Total tx value: ${formatEther(txValue)} BNB`);

  if (config.dryRun) {
    console.log("Dry run enabled. Skipping on-chain createToken transaction.");
    return;
  }

  console.log("Submitting createToken transaction...");
  const hash = await walletClient.writeContract({
    address: TOKEN_MANAGER_2_ADDRESS,
    abi: tokenManager2Abi,
    functionName: "createToken",
    args: [createArg, signature],
    value: txValue,
    chain: bsc,
    account,
  });

  console.log(`Transaction sent: https://bscscan.com/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  const tokenCreateLog = receipt.logs.find((log) => {
    try {
      const decoded = decodeEventLog({
        abi: tokenManager2Abi,
        data: log.data,
        topics: log.topics,
      });
      return decoded.eventName === "TokenCreate";
    } catch {
      return false;
    }
  });

  if (!tokenCreateLog) {
    console.log("Launch transaction succeeded, but TokenCreate event was not decoded from the receipt.");
    return;
  }

  const decoded = decodeEventLog({
    abi: tokenManager2Abi,
    data: tokenCreateLog.data,
    topics: tokenCreateLog.topics,
  });

  if (decoded.eventName !== "TokenCreate") {
    throw new Error("Unexpected event decoded from receipt.");
  }

  console.log(`Token address: ${decoded.args.token}`);
  console.log(`Request ID: ${decoded.args.requestId}`);
  console.log(`Token page: https://four.meme/token/${decoded.args.token}`);

}

async function runSymbolCheck(
  authToken: string,
  imageUrl: string,
  raisedToken: RaisedTokenConfig,
  config: TokenConfig,
  candidatesPath: string,
) {
  const rawCandidates = await readFile(candidatesPath, "utf8");
  const candidates = rawCandidates
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    throw new Error(`No symbol candidates found in ${candidatesPath}`);
  }

  console.log(`Testing ${candidates.length} symbol candidates from ${candidatesPath}...`);

  for (const candidate of candidates) {
    const launchTime = Date.now() + config.launchDelaySeconds * 1000;
    const payload = buildCreatePayload(config, imageUrl, raisedToken, launchTime, candidate);

    try {
      await requestCreateSignature(authToken, payload);
      console.log(`VALID SYMBOL: ${candidate}`);
      return;
    } catch (error) {
      if (error instanceof FourMemeApiError) {
        console.log(`Rejected ${candidate}: ${error.payload.msg ?? "Unknown error"}`);
        continue;
      }
      throw error;
    }
  }

  console.log("No valid symbol found in candidate list.");
}

function validateConfig(config: TokenConfig) {
  if (config.taxToken) {
    const sum =
      config.taxToken.burnRate +
      config.taxToken.divideRate +
      config.taxToken.liquidityRate +
      config.taxToken.recipientRate;
    if (sum !== 100) {
      throw new Error(`taxToken rate sum must equal 100. Current sum: ${sum}`);
    }
  }
}

async function readTokenConfig(configPath: string): Promise<TokenConfig> {
  const raw = await readFile(configPath, "utf8");
  return tokenConfigSchema.parse(JSON.parse(raw));
}

async function loginToFourMeme(
  address: `0x${string}`,
  walletName: string,
  account: ReturnType<typeof privateKeyToAccount>,
) {
  console.log("Generating login nonce...");
  const nonce = await postJson<string>("/v1/private/user/nonce/generate", {
    method: "POST",
    body: {
      accountAddress: address,
      verifyType: "LOGIN",
      networkCode: "BSC",
    },
  });

  const message = `You are sign in Meme ${nonce}`;
  const signature = await account.signMessage({ message });

  console.log("Logging into Four.meme...");
  return postJson<string>("/v1/private/user/login/dex", {
    method: "POST",
    body: {
      region: "WEB",
      langType: "EN",
      loginIp: "",
      inviteCode: "",
      verifyInfo: {
        address,
        networkCode: "BSC",
        signature,
        verifyType: "LOGIN",
      },
      walletName,
    },
  });
}

async function uploadImage(accessToken: string, configPath: string, imagePath: string) {
  const absoluteImagePath = path.resolve(path.dirname(configPath), imagePath);
  const imageBuffer = await readFile(absoluteImagePath);
  const contentType = mime.lookup(absoluteImagePath) || "application/octet-stream";
  const form = new FormData();

  form.append(
    "file",
    new Blob([imageBuffer], { type: contentType }),
    path.basename(absoluteImagePath),
  );

  console.log(`Uploading image: ${absoluteImagePath}`);
  const response = await fetch(`${FOUR_MEME_API_BASE}/v1/private/token/upload`, {
    method: "POST",
    headers: {
      "meme-web-access": accessToken,
    },
    body: form,
  });

  const json = await response.json();
  if (!response.ok || json.code !== 0) {
    throw new Error(`Image upload failed: ${JSON.stringify(json)}`);
  }

  return json.data as string;
}

async function fetchRaisedTokenConfig(symbol: string): Promise<RaisedTokenConfig> {
  const response = await fetch(`${FOUR_MEME_API_BASE}/v1/public/config`);
  const json = await response.json();

  if (!response.ok || json.code !== 0 || !Array.isArray(json.data)) {
    throw new Error(`Failed to fetch raised token config: ${JSON.stringify(json)}`);
  }

  const match = json.data.find(
    (item: RaisedTokenConfig) => item.networkCode === "BSC" && item.symbol === symbol,
  );

  if (!match) {
    throw new Error(`Raised token config not found for symbol: ${symbol}`);
  }

  return match;
}

function buildCreatePayload(
  config: TokenConfig,
  imageUrl: string,
  raisedToken: RaisedTokenConfig,
  launchTime: number,
  shortName: string,
) {
  return {
    name: config.name,
    shortName,
    desc: config.desc,
    totalSupply: Number(raisedToken.totalAmount ?? "1000000000"),
    raisedAmount: Number(raisedToken.totalBAmount ?? "24"),
    saleRate: Number(raisedToken.saleRate ?? "0.8"),
    reserveRate: 0,
    imgUrl: imageUrl,
    raisedToken,
    launchTime,
    funGroup: false,
    label: config.label,
    lpTradingFee: 0.0025,
    preSale: config.presale,
    clickFun: false,
    symbol: raisedToken.symbol,
    dexType: "PANCAKE_SWAP",
    rushMode: false,
    onlyMPC: config.onlyMPC,
    feePlan: config.feePlan,
    ...(config.webUrl ? { webUrl: config.webUrl } : {}),
    ...(config.twitterUrl ? { twitterUrl: config.twitterUrl } : {}),
    ...(config.telegramUrl ? { telegramUrl: config.telegramUrl } : {}),
    ...(config.taxToken ? { tokenTaxInfo: config.taxToken } : {}),
  };
}

async function requestCreateSignature(
  authToken: string,
  createPayload: ReturnType<typeof buildCreatePayload>,
) {
  return postJson<{ createArg: string; signature: string }>("/v1/private/token/create", {
    method: "POST",
    headers: {
      "meme-web-access": authToken,
    },
    body: createPayload,
  });
}

async function postJson<T>(
  endpoint: string,
  options: {
    method: "POST";
    body: unknown;
    headers?: Record<string, string>;
  },
) {
  const response = await fetch(`${FOUR_MEME_API_BASE}${endpoint}`, {
    method: options.method,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(options.body),
  });

  const json = await response.json();
  if (!response.ok || json.code !== 0) {
    throw new FourMemeApiError(endpoint, json);
  }

  return json.data as T;
}

function normalizeBytes(value: string, label: string): `0x${string}` {
  if (isHex(value)) {
    return value;
  }

  if (/^[0-9a-fA-F]+$/.test(value)) {
    return `0x${value}`;
  }

  throw new Error(`${label} is not a hex string. Value: ${value}`);
}

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
