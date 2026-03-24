const form = document.querySelector("#lookup-form");
const input = document.querySelector("#ca-input");
const status = document.querySelector("#status");
const historyShell = document.querySelector("#history-shell");
const historyList = document.querySelector("#history-list");
const historyClear = document.querySelector("#history-clear");
const homeRail = document.querySelector(".rail-home");
const result = document.querySelector("#result");
const skeletonGrid = document.querySelector("#skeleton-grid");
const rawOutput = document.querySelector("#raw-output");
const heroResult = document.querySelector("#hero-result");
const logoShell = document.querySelector("#logo-shell");
const tokenLogo = document.querySelector("#token-logo");
const resultName = document.querySelector("#result-name");
const copyCa = document.querySelector("#copy-ca");
const copyLink = document.querySelector("#copy-link");
const openFourmeme = document.querySelector("#open-fourmeme");
const statName = document.querySelector("#stat-name");
const statSymbol = document.querySelector("#stat-symbol");
const statAi = document.querySelector("#stat-ai");
const socialWebsite = document.querySelector("#social-website");
const socialTwitter = document.querySelector("#social-twitter");
const socialTelegram = document.querySelector("#social-telegram");
const contractAddress = document.querySelector("#contract-address");
const creatorAddress = document.querySelector("#creator-address");
const copyContractInline = document.querySelector("#copy-contract-inline");
const copyCreatorInline = document.querySelector("#copy-creator-inline");
const sakuraShell = document.querySelector("#sakura-shell");
const sakuraFigure = document.querySelector("#sakura-figure");
const sakuraVerdict = document.querySelector("#sakura-verdict");
const sakuraSummary = document.querySelector("#sakura-summary");
const sakuraReasons = document.querySelector("#sakura-reasons");
const sakuraCautions = document.querySelector("#sakura-cautions");
const chartShell = document.querySelector("#chart-shell");
const chartFrame = document.querySelector("#chart-frame");
const chartLink = document.querySelector("#chart-link");
const chartStatus = document.querySelector("#chart-status");
const chartPrice = document.querySelector("#chart-price");
const chartMarketCap = document.querySelector("#chart-marketcap");
const chartLiquidity = document.querySelector("#chart-liquidity");
const chartTrendChip = document.querySelector("#chart-trend-chip");
const chartTimeframeChip = document.querySelector("#chart-timeframe-chip");
const chartCandleChip = document.querySelector("#chart-candle-chip");
const timeframeButtons = Array.from(document.querySelectorAll(".timeframe-btn"));
const marketGrid = document.querySelector("#market-grid");

let lastResult = null;
let currentTimeframe = "15m";
let recentEntries = [];
let recentFetched = false;
let currentLookupAddress = "";
let currentSakuraAddress = "";
let lookupRequestToken = 0;
let sakuraRequestToken = 0;

const tokenLogoFallback = document.createElement("div");
tokenLogoFallback.className = "token-logo-fallback hidden";
logoShell.appendChild(tokenLogoFallback);

const marketFields = [
  ["Raised BNB", "raisedBnb"],
  ["Max Raised BNB", "maxRaisedBnb"],
  ["Launch Time", "launchTime"],
  ["Liquidity Added", "liquidityAdded"],
  ["Trading Fee", "tradingFeeRate"],
];

renderSkeleton();
setTimeframeButtonsDisabled(true);
renderRecentSearches();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = extractAddress(input.value.trim());

  if (!address) {
    status.textContent = "Enter a contract address first.";
    result.classList.add("hidden");
    return;
  }

  if (lastResult?.tokenAddress === address) {
    status.textContent = "Lookup complete.";
    return;
  }

  status.textContent = "Looking up token data...";
  input.value = address;
  currentTimeframe = "15m";
  result.classList.remove("hidden");
  heroResult.classList.add("hidden");
  logoShell.classList.add("hidden");
  chartShell.classList.add("hidden");
  sakuraShell.classList.add("hidden");
  chartStatus.classList.add("hidden");
  chartStatus.textContent = "";
  rawOutput.innerHTML = "";
  marketGrid.innerHTML = "";
  sakuraShell.dataset.loadedFor = "";
  resetSummaryCards();
  resetSocialButtons();
  resetChartMetrics();
  destroyChart();
  skeletonGrid.classList.remove("hidden");

  try {
    const lookupToken = ++lookupRequestToken;
    currentLookupAddress = address;
    console.log("fetchCA called");
    const response = await fetch(`/api/ca?address=${encodeURIComponent(address)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Lookup failed.");
    }

    if (lookupToken !== lookupRequestToken || currentLookupAddress !== address) {
      return;
    }

    await renderResult(data);
    syncShareUrl(address);
    upsertRecentSearch(data);
    renderRecentSearches({ useCache: true });
    status.textContent = "Lookup complete.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Lookup failed.";
    result.classList.add("hidden");
  }
});

homeRail?.addEventListener("click", (event) => {
  event.preventDefault();
  resetHomeView();
});

historyClear?.addEventListener("click", async () => {
  try {
    await fetch("/api/recent", { method: "DELETE" });
  } catch {}
  recentEntries = [];
  recentFetched = true;
  renderRecentSearches({ useCache: true });
});

timeframeButtons.forEach((button) => {
  button.addEventListener("click", () => {});
});

async function renderResult(data) {
  lastResult = data;
  skeletonGrid.classList.add("hidden");
  heroResult.classList.remove("hidden");
  logoShell.classList.remove("hidden");
  resultName.textContent = formatValue(data.summary?.name);

  if (data.summary?.logoUrl) {
    tokenLogo.src = data.summary.logoUrl;
    tokenLogo.classList.remove("hidden");
    tokenLogoFallback.classList.add("hidden");
  } else {
    tokenLogo.removeAttribute("src");
    tokenLogo.classList.add("hidden");
    tokenLogoFallback.textContent = makeAvatarText(data.summary?.name, data.summary?.symbol);
    tokenLogoFallback.classList.remove("hidden");
  }

  openFourmeme.href = `https://four.meme/token/${data.tokenAddress}`;
  openFourmeme.classList.remove("hidden");

  statName.textContent = formatValue(data.summary?.name);
  statSymbol.textContent = formatValue(data.summary?.symbol);
  statAi.textContent = formatValue(data.summary?.aiCreator);
  contractAddress.textContent = formatValue(data.tokenAddress);
  creatorAddress.textContent = formatValue(data.summary?.creator);

  setSocialButton(socialWebsite, data.summary?.website, "Website");
  setSocialButton(socialTwitter, data.summary?.twitter, "Twitter");
  setSocialButton(socialTelegram, data.summary?.telegram, "Telegram");

  marketGrid.innerHTML = "";
  for (const [label, key] of marketFields) {
    marketGrid.appendChild(createMarketStat(label, data.summary?.[key]));
  }

  await Promise.all([renderSakura(data.tokenAddress), renderChart(data)]);
  rawOutput.innerHTML = syntaxHighlight(data);
}

async function renderSakura(address) {
  if (currentSakuraAddress === address && sakuraShell.dataset.loadedFor === address) {
    return;
  }

  sakuraShell.classList.remove("hidden");
  sakuraVerdict.className = "sakura-verdict";
  sakuraVerdict.textContent = "...";
  setSakuraFigure("neutral");
  renderSakuraSummary(["Sakura is reading the tape, checking the structure, and deciding if this is actually tradable or just another BSC trap."]);
  fillSakuraList(sakuraReasons, [], "No ape angle yet.");
  fillSakuraList(sakuraCautions, [], "No fade angle yet.");

  try {
    const requestToken = ++sakuraRequestToken;
    currentSakuraAddress = address;
    console.log("fetchSakura called");
    const response = await fetch(`/api/sakura-agent?address=${encodeURIComponent(address)}&mode=read`);
    const agent = await response.json();

    if (!response.ok) {
      throw new Error(agent.error || "Sakura agent failed.");
    }

    if (requestToken !== sakuraRequestToken || currentSakuraAddress !== address) {
      return;
    }

    const analysis = agent.payload?.analysis;
    if (!analysis) {
      throw new Error("Sakura agent returned no analysis.");
    }

    sakuraVerdict.textContent = `${analysis.overallScore}/10`;
    sakuraVerdict.classList.add(analysis.verdict === "bullish" ? "is-bullish" : "is-bearish");
    setSakuraFigure(analysis.verdict === "bullish" ? "bullish" : "bearish");
    renderSakuraSummary([analysis.verdictLine, ...analysis.traderRead, analysis.finalLine]);
    fillSakuraList(sakuraReasons, analysis.bullCase, "Sakura is not seeing a clean ape case.");
    fillSakuraList(sakuraCautions, analysis.bearCase, "Sakura is not seeing a giant red flag.");
    sakuraShell.dataset.loadedFor = address;
  } catch (error) {
    sakuraVerdict.textContent = "--";
    setSakuraFigure("neutral");
    renderSakuraSummary([error instanceof Error ? error.message : "Sakura analysis failed."]);
    fillSakuraList(sakuraReasons, [], "No analysis points available.");
    fillSakuraList(sakuraCautions, [], "No caution points available.");
  }
}

async function renderChart(data) {
  chartShell.classList.remove("hidden");
  const embedTarget = data.dexScreener?.pairAddress || data.tokenAddress;
  const embedUrl = `https://dexscreener.com/bsc/${embedTarget}?embed=1&theme=light&trades=0&info=0`;
  chartLink.href = data.dexScreener?.url || `https://dexscreener.com/bsc/${embedTarget}`;
  chartLink.textContent = "Open Market";
  chartPrice.textContent = formatUsd(data.dexScreener?.priceUsd);
  chartMarketCap.textContent = formatCompactMoney(data.dexScreener?.marketCap);
  chartLiquidity.textContent = formatCompactMoney(data.dexScreener?.liquidityUsd);
  chartTimeframeChip.textContent = "TF: Live";
  setTimeframeButtonsDisabled(true);
  setChartRibbonFromMarket(data);
  chartStatus.classList.add("hidden");
  chartStatus.textContent = "";
  chartFrame.innerHTML = `<iframe class="chart-embed" src="${embedUrl}" title="DexScreener chart" loading="lazy" allowfullscreen></iframe>`;
}

function destroyChart() {
  chartFrame.innerHTML = "";
}

function setTimeframeButtonsDisabled(disabled) {
  timeframeButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function resetChartMetrics() {
  chartPrice.textContent = "-";
  chartMarketCap.textContent = "-";
  chartLiquidity.textContent = "-";
  chartTrendChip.textContent = "Trend: -";
  chartTimeframeChip.textContent = `TF: ${currentTimeframe}`;
  chartCandleChip.textContent = "Candles: -";
}

function setChartRibbonFromMarket(data) {
  const marketCap = Number(data.dexScreener?.marketCap || 0);
  const liquidity = Number(data.dexScreener?.liquidityUsd || 0);
  const trend = marketCap > 0 && liquidity > 0 ? "Live Pair" : "Token Page";
  chartTrendChip.textContent = `Trend: ${trend}`;
  chartCandleChip.textContent = data.dexScreener?.pairAddress ? "Source: Pair" : "Source: Token";
}

function createMarketStat(label, value) {
  const item = document.createElement("article");
  item.className = "market-stat";

  const title = document.createElement("p");
  title.className = "token-card-label";
  title.textContent = label;

  const content = document.createElement("p");
  content.className = "market-stat-value";
  content.textContent = formatValue(value);

  item.append(title, content);
  return item;
}

function setSocialButton(element, href, label) {
  if (!element) return;

  const isLive = typeof href === "string" && href.length > 0;
  element.textContent = label;
  element.classList.toggle("is-live", isLive);
  element.classList.toggle("is-missing", !isLive);

  if (isLive) {
    element.href = href;
    element.removeAttribute("aria-disabled");
    element.tabIndex = 0;
  } else {
    element.href = "#";
    element.setAttribute("aria-disabled", "true");
    element.tabIndex = -1;
  }
}

function resetSocialButtons() {
  setSocialButton(socialWebsite, "", "Website");
  setSocialButton(socialTwitter, "", "Twitter");
  setSocialButton(socialTelegram, "", "Telegram");
}

function resetSummaryCards() {
  statName.textContent = "-";
  statSymbol.textContent = "-";
  statAi.textContent = "-";
  contractAddress.textContent = "-";
  creatorAddress.textContent = "-";
}

function setSakuraFigure(mode) {
  if (!sakuraFigure) return;
  switch (mode) {
    case "bullish":
      sakuraFigure.src = "/assets/sakura-bullish.png";
      sakuraFigure.alt = "Sakura bullish";
      break;
    case "bearish":
      sakuraFigure.src = "/assets/sakura-bearish.png";
      sakuraFigure.alt = "Sakura bearish";
      break;
    default:
      sakuraFigure.src = "/assets/sakura-neutral.png";
      sakuraFigure.alt = "Sakura neutral";
  }
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  if (number >= 1) {
    return `$${number.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  }
  return `$${number.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 10 })}`;
}

function formatCompactMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(number);
}

function renderSakuraSummary(paragraphs) {
  sakuraSummary.innerHTML = "";
  const items = Array.isArray(paragraphs)
    ? paragraphs.map((item) => String(item || "").trim()).filter(Boolean)
    : [String(paragraphs || "-").trim()].filter(Boolean);

  for (const chunk of items.length ? items : ["-"]) {
    const paragraph = document.createElement("p");
    paragraph.textContent = chunk;
    sakuraSummary.appendChild(paragraph);
  }
}

function fillSakuraList(target, items, fallbackText) {
  target.innerHTML = "";
  const values = Array.isArray(items) && items.length ? items : [fallbackText];
  for (const item of values) {
    const li = document.createElement("li");
    li.textContent = item;
    target.appendChild(li);
  }
}

function renderSkeleton() {
  skeletonGrid.innerHTML = "";
  for (let i = 0; i < 4; i += 1) {
    const card = document.createElement("article");
    card.className = "token-card skeleton";
    card.innerHTML = `
      <div class="skeleton-bar small"></div>
      <div class="skeleton-bar large"></div>
      <div class="skeleton-bar large"></div>
    `;
    skeletonGrid.appendChild(card);
  }
}

function makeAvatarText(name, symbol) {
  const source = String(name || symbol || "CA").trim();
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function syntaxHighlight(value) {
  const json = JSON.stringify(value, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (match.startsWith('"')) cls = match.endsWith(":") ? "json-key" : "json-string";
      else if (match === "true" || match === "false") cls = "json-boolean";
      else if (match === "null") cls = "json-null";
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

async function copyText(value, button, original) {
  if (!value || value === "-") return;
  await navigator.clipboard.writeText(String(value));
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

copyCa.addEventListener("click", () => copyText(lastResult?.tokenAddress, copyCa, "Copy CA"));
copyLink.addEventListener("click", () => copyText(makeShareUrl(lastResult?.tokenAddress || ""), copyLink, "Copy Link"));
copyContractInline.addEventListener("click", () => copyText(lastResult?.tokenAddress, copyContractInline, "Copy"));
copyCreatorInline.addEventListener("click", () => copyText(lastResult?.summary?.creator, copyCreatorInline, "Copy"));

input.addEventListener("paste", (event) => {
  const pasted = event.clipboardData?.getData("text") || "";
  const address = extractAddress(pasted);
  if (!address) return;
  event.preventDefault();
  input.value = address;
  queueMicrotask(() => form.requestSubmit());
});

const initialAddress = extractAddress(new URL(window.location.href).searchParams.get("ca") || "");
if (initialAddress) {
  input.value = initialAddress;
  queueMicrotask(() => form.requestSubmit());
}

function makeShareUrl(address) {
  const url = new URL(window.location.href);
  url.searchParams.set("ca", address);
  return url.toString();
}

function syncShareUrl(address) {
  const url = new URL(window.location.href);
  url.searchParams.set("ca", address);
  window.history.replaceState({}, "", url);
}

function resetHomeView() {
  const url = new URL(window.location.href);
  url.searchParams.delete("ca");
  window.history.replaceState({}, "", url);

  input.value = "";
  status.textContent = "";
  lastResult = null;
  result.classList.add("hidden");
  heroResult.classList.add("hidden");
  logoShell.classList.add("hidden");
  chartShell.classList.add("hidden");
  sakuraShell.classList.add("hidden");
  sakuraShell.dataset.loadedFor = "";
  chartStatus.classList.add("hidden");
  chartStatus.textContent = "";
  rawOutput.innerHTML = "";
  marketGrid.innerHTML = "";
  resetSummaryCards();
  resetSocialButtons();
  resetChartMetrics();
  destroyChart();
}

async function renderRecentSearches(options = {}) {
  const { useCache = false, force = false } = options;

  if ((!recentFetched || force) && !useCache) {
    try {
      console.log("fetchRecent called");
      const response = await fetch("/api/recent");
      const data = await response.json();
      recentEntries = response.ok && Array.isArray(data.items) ? data.items : [];
    } catch {
      recentEntries = [];
    }
    recentFetched = true;
  }

  historyList.innerHTML = "";

  if (!recentEntries.length) {
    historyShell.classList.add("hidden");
    historyClear?.classList.add("hidden");
    return;
  }

  historyShell.classList.remove("hidden");
  historyClear?.classList.remove("hidden");

  for (const entry of recentEntries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-chip";
    const avatar = renderRecentAvatar(entry);
    button.innerHTML = `
      <span class="history-chip-media">${avatar}</span>
      <span class="history-chip-copy">
        <span class="history-chip-name">${escapeHtml(formatValue(entry.name))}</span>
        <span class="history-chip-symbol">${escapeHtml(formatValue(entry.symbol))}</span>
        <span class="history-chip-address">${shortenAddress(entry.tokenAddress)}</span>
      </span>
    `;
    button.addEventListener("click", () => {
      input.value = entry.tokenAddress;
      form.requestSubmit();
    });
    historyList.appendChild(button);
  }
}

function upsertRecentSearch(data) {
  const next = {
    tokenAddress: data.tokenAddress,
    name: data.summary?.name || null,
    symbol: data.summary?.symbol || null,
    logoUrl: data.summary?.logoUrl || null,
    searchedAt: new Date().toISOString(),
  };

  const normalized = String(next.tokenAddress || "").toLowerCase();
  recentEntries = [next, ...recentEntries.filter((item) => String(item.tokenAddress || "").toLowerCase() !== normalized)].slice(0, 8);
  recentFetched = true;
}

function extractAddress(value) {
  const match = value.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : "";
}

function shortenAddress(address) {
  if (typeof address !== "string" || address.length < 10) return address || "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function renderRecentAvatar(entry) {
  const initials = escapeHtml(makeAvatarText(entry?.name, entry?.symbol).slice(0, 1));
  if (typeof entry?.logoUrl === "string" && entry.logoUrl.trim()) {
    return `<img class="history-chip-avatar" src="${escapeHtml(entry.logoUrl)}" alt="${escapeHtml(formatValue(entry.name))} logo" loading="lazy" />`;
  }

  return `<span class="history-chip-avatar history-chip-avatar-fallback">${initials}</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
