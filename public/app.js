const form = document.querySelector("#lookup-form");
const input = document.querySelector("#ca-input");
const status = document.querySelector("#status");
const historyShell = document.querySelector("#history-shell");
const historyList = document.querySelector("#history-list");
const homeRail = document.querySelector(".rail-home");
const result = document.querySelector("#result");
const overviewGrid = document.querySelector("#overview-grid");
const marketGrid = document.querySelector("#market-grid");
const skeletonGrid = document.querySelector("#skeleton-grid");
const rawOutput = document.querySelector("#raw-output");
const heroResult = document.querySelector("#hero-result");
const logoShell = document.querySelector("#logo-shell");
const tokenLogo = document.querySelector("#token-logo");
const resultName = document.querySelector("#result-name");
const copyCa = document.querySelector("#copy-ca");
const copyLink = document.querySelector("#copy-link");
const openFourmeme = document.querySelector("#open-fourmeme");
const sakuraShell = document.querySelector("#sakura-shell");
const sakuraFigure = document.querySelector("#sakura-figure");
const sakuraVerdict = document.querySelector("#sakura-verdict");
const sakuraSummary = document.querySelector("#sakura-summary");
const sakuraScorecard = document.querySelector("#sakura-scorecard");
const sakuraReasons = document.querySelector("#sakura-reasons");
const sakuraCautions = document.querySelector("#sakura-cautions");
const sakuraModeButtons = Array.from(document.querySelectorAll(".sakura-mode-btn"));
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
const tabs = Array.from(document.querySelectorAll(".tab-btn"));
const panels = {
  overview: document.querySelector("#panel-overview"),
  market: document.querySelector("#panel-market"),
  raw: document.querySelector("#panel-raw"),
};

const tokenLogoFallback = document.createElement("div");
tokenLogoFallback.className = "token-logo-fallback hidden";
logoShell.appendChild(tokenLogoFallback);

const leftOverviewGroups = [
  [
    ["Name", "name"],
    ["Ticker", "symbol"],
    ["AI Creator", "aiCreator"],
  ],
  [
    ["Website", "website"],
    ["Twitter", "twitter"],
    ["Telegram", "telegram"],
  ],
];

const rightOverviewGroups = [
  ["Contract", "tokenAddress"],
  ["Creator", "creator"],
];

const marketFields = [
  ["Raised BNB", "raisedBnb"],
  ["Max Raised BNB", "maxRaisedBnb"],
  ["Launch Time", "launchTime"],
  ["Liquidity Added", "liquidityAdded"],
  ["Trading Fee", "tradingFeeRate"],
];

let lastResult = null;
let currentTimeframe = "15m";
let chartLoading = false;
let currentSakuraMode = "read";

renderSkeleton();
updateTimeframeButtons();
renderRecentSearches();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const address = extractAddress(input.value.trim());

  if (!address) {
    status.textContent = "Enter a contract address first.";
    result.classList.add("hidden");
    return;
  }

  status.textContent = "Looking up token data...";
  input.value = address;
  currentTimeframe = "15m";
  updateTimeframeButtons();
  result.classList.remove("hidden");
  heroResult.classList.add("hidden");
  logoShell.classList.add("hidden");
  overviewGrid.innerHTML = "";
  marketGrid.innerHTML = "";
  chartShell.classList.add("hidden");
  sakuraShell.classList.add("hidden");
  chartStatus.classList.add("hidden");
  chartStatus.textContent = "";
  resetChartMetrics();
  destroyChart();
  skeletonGrid.classList.remove("hidden");
  rawOutput.innerHTML = "";

  try {
    const response = await fetch(`/api/ca?address=${encodeURIComponent(address)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Lookup failed.");
    }

    await renderResult(data);
    syncShareUrl(address);
    renderRecentSearches();
    status.textContent = "Lookup complete.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Lookup failed.";
    result.classList.add("hidden");
  }
});

timeframeButtons.forEach((button) => {
  button.addEventListener("click", () => {});
});

homeRail.addEventListener("click", (event) => {
  event.preventDefault();
  resetHomeView();
});

sakuraModeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.mode || "read";
    currentSakuraMode = mode;
    setActiveSakuraMode(mode);
    if (lastResult?.tokenAddress) {
      await renderSakura(lastResult.tokenAddress);
    }
  });
});

async function renderResult(data) {
  lastResult = data;
  skeletonGrid.classList.add("hidden");
  heroResult.classList.remove("hidden");
  logoShell.classList.remove("hidden");
  overviewGrid.innerHTML = "";
  marketGrid.innerHTML = "";
  selectTab("overview");

  resultName.textContent = `${formatValue(data.summary?.name)} ${String.fromCharCode(183)} ${formatValue(data.summary?.symbol)}`;

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

  renderOverview(data);

  for (const [label, key] of marketFields) {
    marketGrid.appendChild(createStat(label, data.summary?.[key]));
  }

  await Promise.all([renderSakura(data.tokenAddress), renderChart(data)]);
  rawOutput.innerHTML = syntaxHighlight(data);
  result.classList.remove("hidden");
}

async function renderSakura(address) {
  sakuraShell.classList.remove("hidden");
  sakuraVerdict.className = "sakura-verdict";
  sakuraVerdict.textContent = "Reading";
  sakuraShell.classList.remove("is-bullish", "is-bearish");
  setActiveSakuraMode(currentSakuraMode);
  setSakuraFigure("neutral");
  sakuraSummary.textContent =
    "Sakura is staring at the candles and deciding whether this thing belongs on the timeline or in the mute list.";
  sakuraScorecard.innerHTML = "";
  sakuraReasons.innerHTML = "";
  sakuraCautions.innerHTML = "";

  try {
    const response = await fetch(`/api/sakura-agent?address=${encodeURIComponent(address)}&mode=${encodeURIComponent(currentSakuraMode)}`);
    const agent = await response.json();

    if (!response.ok) {
      throw new Error(agent.error || "Sakura agent failed.");
    }

    const analysis = agent.payload?.analysis || null;
    if (!analysis) {
      throw new Error("Sakura agent returned no analysis.");
    }

    sakuraVerdict.textContent = analysis.verdict;
    sakuraVerdict.classList.add(analysis.verdict === "bullish" ? "is-bullish" : "is-bearish");
    sakuraShell.classList.add(analysis.verdict === "bullish" ? "is-bullish" : "is-bearish");
    setSakuraFigure(analysis.verdict === "bullish" ? "bullish" : "bearish");
    sakuraSummary.textContent = agent.answer || analysis.summary;
    renderSakuraScorecard(analysis.scorecard);
    fillSakuraList(sakuraReasons, analysis.reasons, "Sakura does not see enough clean bullish signals yet.");
    fillSakuraList(sakuraCautions, analysis.cautions, "No major danger signal is visible right now.");
  } catch (error) {
    sakuraVerdict.textContent = "Offline";
    sakuraShell.classList.remove("is-bullish", "is-bearish");
    setSakuraFigure("neutral");
    sakuraSummary.textContent = error instanceof Error ? error.message : "Sakura analysis failed.";
    sakuraScorecard.innerHTML = "";
    fillSakuraList(sakuraReasons, [], "No analysis points available.");
    fillSakuraList(sakuraCautions, [], "No caution points available.");
  }
}

function setActiveSakuraMode(mode) {
  sakuraModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
}

function renderSakuraScorecard(scorecard) {
  if (!sakuraScorecard) return;

  const entries = [
    ["Name Vibe", scorecard?.nameVibe ?? 0],
    ["Social Heat", scorecard?.socialHeat ?? 0],
    ["Chart Heat", scorecard?.chartHeat ?? 0],
    ["Danger", scorecard?.danger ?? 0],
  ];

  sakuraScorecard.innerHTML = "";
  for (const [label, value] of entries) {
    const publicScore = toPublicScore(label, value);
    const descriptor = describeScore(label, publicScore);
    const chip = document.createElement("div");
    chip.className = "sakura-score-chip";
    chip.innerHTML = `
      <span class="sakura-score-label">${escapeHtml(label)}</span>
      <strong class="sakura-score-value">${publicScore}/10</strong>
      <span class="sakura-score-note">${escapeHtml(descriptor)}</span>
    `;
    sakuraScorecard.appendChild(chip);
  }
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
    case "neutral":
    default:
      sakuraFigure.src = "/assets/sakura-neutral.png";
      sakuraFigure.alt = "Sakura neutral";
      break;
  }
}

function renderOverview(data) {
  const left = document.createElement("div");
  left.className = "overview-left";

  const topRow = document.createElement("div");
  topRow.className = "overview-row overview-row-top";
  for (const [label, key] of leftOverviewGroups[0]) {
    topRow.appendChild(createStat(label, data.summary?.[key]));
  }

  const socialRow = document.createElement("div");
  socialRow.className = "overview-row overview-row-social";
  for (const [label, key] of leftOverviewGroups[1]) {
    socialRow.appendChild(createSocialStat(label, data.summary?.[key]));
  }

  left.append(topRow, socialRow);

  const right = document.createElement("div");
  right.className = "overview-right";
  for (const [label, key] of rightOverviewGroups) {
    const value = key === "tokenAddress" ? data.tokenAddress : data.summary?.[key];
    right.appendChild(createStat(label, value));
  }

  overviewGrid.append(left, right);
}

async function renderChart(data) {
  chartLoading = true;
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
  chartFrame.innerHTML = `<iframe
    class="chart-embed"
    src="${embedUrl}"
    title="DexScreener chart"
    loading="lazy"
    allowfullscreen
  ></iframe>`;
  chartLoading = false;
  setTimeframeButtonsDisabled(true);
}

function destroyChart() {
  chartFrame.innerHTML = "";
  chartLoading = false;
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

function updateTimeframeButtons() {
  timeframeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timeframe === "15m");
  });
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

function createStat(label, value) {
  const item = document.createElement("article");
  item.className = `stat ${toLabelClass(label)}`;
  applyMetricTone(item, label);
  applyValueStyle(item, label, value);

  const title = document.createElement("p");
  title.className = "stat-label";
  title.textContent = label;

  const content = createValueElement(label, value);
  item.append(title, content);

  if (isCopyable(value) && !isSocialLabel(label)) {
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "stat-copy";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(String(value));
      copyButton.textContent = "Copied";
      setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1200);
    });
    item.append(copyButton);
  }

  return item;
}

function createSocialStat(label, value) {
  const href = typeof value === "string" && value.length > 0 ? value : null;

  if (href) {
    const link = document.createElement("a");
    link.className = `social-stat ${toLabelClass(label)} is-live`;
    link.href = href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = label;
    return link;
  }

  const button = document.createElement("button");
  button.className = `social-stat ${toLabelClass(label)} is-missing`;
  button.type = "button";
  button.disabled = true;
  button.textContent = label;
  return button;
}

function createValueElement(label, value) {
  if (isSocialLabel(label)) {
    if (value) {
      const link = document.createElement("a");
      link.className = "stat-value social-action is-live";
      link.href = String(value);
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Open";
      return link;
    }

    const badge = document.createElement("button");
    badge.className = "stat-value social-action is-missing";
    badge.type = "button";
    badge.disabled = true;
    badge.textContent = "Unavailable";
    return badge;
  }

  const text = formatValue(value);
  const content = document.createElement("p");
  content.className = "stat-value";
  content.textContent = text;
  return content;
}

function isSocialLabel(label) {
  return label === "Website" || label === "Twitter" || label === "Telegram";
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

function formatMiniScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number > 0 ? `+${number}` : String(number);
}

function toPublicScore(label, value) {
  const number = Number(value);
  const clamped = Number.isFinite(number) ? Math.max(-2, Math.min(2, number)) : 0;
  const mapped = Math.round(((clamped + 2) / 4) * 10);

  if (label === "Danger") {
    return mapped;
  }

  return mapped;
}

function describeScore(label, score) {
  if (label === "Name Vibe") {
    if (score >= 8) return "easy shill";
    if (score >= 6) return "pretty sticky";
    if (score >= 4) return "mid vibe";
    return "weak branding";
  }

  if (label === "Social Heat") {
    if (score >= 8) return "feed is live";
    if (score >= 6) return "some pulse";
    if (score >= 4) return "still sleepy";
    return "dead socials";
  }

  if (label === "Chart Heat") {
    if (score >= 8) return "sending";
    if (score >= 6) return "warming up";
    if (score >= 4) return "still chop";
    return "chart looks cooked";
  }

  if (label === "Danger") {
    if (score >= 8) return "high risk";
    if (score >= 6) return "spicy";
    if (score >= 4) return "manageable";
    return "low danger";
  }

  return "";
}

function applyMetricTone(item, label) {
  if (label === "AI Creator" || label === "Liquidity Added") {
    item.classList.add("metric-matcha");
    return;
  }

  if (label === "Contract" || label === "Creator") {
    item.classList.add("metric-lilac");
    return;
  }

  if (label === "Raised BNB" || label === "Trading Fee" || label === "Twitter") {
    item.classList.add("metric-rose");
    return;
  }

  if (label === "Max Raised BNB" || label === "Launch Time" || label === "Website" || label === "Telegram") {
    item.classList.add("metric-peach");
  }
}

function applyValueStyle(item, label, value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (label === "Contract" || label === "Creator") {
    item.classList.add("is-code");
  }

  if (isSocialLabel(label)) {
    item.classList.add("is-social");
  }

  if (text.length > 90) {
    item.classList.add("is-compact");
  }
}

function toLabelClass(label) {
  return `stat--${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function isCopyable(value) {
  if (!value) return false;
  const text = String(value);
  return text.startsWith("0x") || text.startsWith("http");
}

function extractAddress(value) {
  const match = value.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : "";
}

function renderSkeleton() {
  skeletonGrid.innerHTML = "";
  for (let i = 0; i < 6; i += 1) {
    const card = document.createElement("article");
    card.className = "stat skeleton";
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

copyCa.addEventListener("click", async () => {
  if (!lastResult?.tokenAddress) return;
  await navigator.clipboard.writeText(lastResult.tokenAddress);
  copyCa.textContent = "Copied";
  setTimeout(() => {
    copyCa.textContent = "Copy CA";
  }, 1200);
});

copyLink.addEventListener("click", async () => {
  if (!lastResult?.tokenAddress) return;
  await navigator.clipboard.writeText(makeShareUrl(lastResult.tokenAddress));
  copyLink.textContent = "Copied";
  setTimeout(() => {
    copyLink.textContent = "Copy Link";
  }, 1200);
});

input.addEventListener("paste", (event) => {
  const pasted = event.clipboardData?.getData("text") || "";
  const address = extractAddress(pasted);
  if (!address) return;
  event.preventDefault();
  input.value = address;
  queueMicrotask(() => form.requestSubmit());
});

tabs.forEach((button) => {
  button.addEventListener("click", () => {
    selectTab(button.dataset.tab);
  });
});

const initialAddress = extractAddress(new URL(window.location.href).searchParams.get("ca") || "");
if (initialAddress) {
  input.value = initialAddress;
  queueMicrotask(() => form.requestSubmit());
}

function selectTab(name) {
  tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== name);
  });
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
  currentSakuraMode = "read";
  setActiveSakuraMode("read");
  result.classList.add("hidden");
  heroResult.classList.add("hidden");
  logoShell.classList.add("hidden");
  chartShell.classList.add("hidden");
  sakuraShell.classList.add("hidden");
  chartStatus.classList.add("hidden");
  chartStatus.textContent = "";
  overviewGrid.innerHTML = "";
  marketGrid.innerHTML = "";
  rawOutput.innerHTML = "";
  resetChartMetrics();
  destroyChart();
}

async function renderRecentSearches() {
  let entries = [];
  try {
    const response = await fetch("/api/recent");
    const data = await response.json();
    if (response.ok && Array.isArray(data.items)) {
      entries = data.items;
    }
  } catch {
    entries = [];
  }

  historyList.innerHTML = "";

  if (!entries.length) {
    historyShell.classList.add("hidden");
    return;
  }

  historyShell.classList.remove("hidden");

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-chip";
    button.innerHTML = `
      <span class="history-chip-name">${escapeHtml(formatValue(entry.name))}</span>
      <span class="history-chip-symbol">${escapeHtml(formatValue(entry.symbol))}</span>
      <span class="history-chip-address">${shortenAddress(entry.tokenAddress)}</span>
    `;
    button.addEventListener("click", () => {
      input.value = entry.tokenAddress;
      form.requestSubmit();
    });
    historyList.appendChild(button);
  }
}

function shortenAddress(address) {
  if (typeof address !== "string" || address.length < 10) return address || "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
