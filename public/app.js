import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
} from "https://cdn.jsdelivr.net/npm/lightweight-charts@5.0.8/+esm";

const form = document.querySelector("#lookup-form");
const input = document.querySelector("#ca-input");
const status = document.querySelector("#status");
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
const openFourmeme = document.querySelector("#open-fourmeme");
const sakuraShell = document.querySelector("#sakura-shell");
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
let chartApi = null;
let candleSeries = null;
let volumeSeries = null;
let resizeObserver = null;
let currentTimeframe = "15m";
let chartRequestId = 0;
let chartLoading = false;

renderSkeleton();
updateTimeframeButtons();

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
    status.textContent = "Lookup complete.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Lookup failed.";
    result.classList.add("hidden");
  }
});

timeframeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (!lastResult || chartLoading) return;
    if ((button.dataset.timeframe || "15m") === currentTimeframe) return;
    currentTimeframe = button.dataset.timeframe || "15m";
    updateTimeframeButtons();
    await renderChart(lastResult);
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

  await renderSakura(data.tokenAddress);
  await renderChart(data);
  rawOutput.innerHTML = syntaxHighlight(data);
  result.classList.remove("hidden");
}

async function renderSakura(address) {
  sakuraShell.classList.remove("hidden");
  sakuraVerdict.className = "sakura-verdict";
  sakuraVerdict.textContent = "Reading";
  sakuraSummary.textContent = "Sakura is checking the chart, liquidity, and visible danger signals for the trader.";
  sakuraReasons.innerHTML = "";
  sakuraCautions.innerHTML = "";

  try {
    const response = await fetch(`/api/analyze?address=${encodeURIComponent(address)}`);
    const analysis = await response.json();

    if (!response.ok) {
      throw new Error(analysis.error || "Sakura analysis failed.");
    }

    sakuraVerdict.textContent = analysis.verdict;
    sakuraVerdict.classList.add(analysis.verdict === "bullish" ? "is-bullish" : "is-bearish");
    sakuraSummary.textContent = analysis.summary;
    fillSakuraList(sakuraReasons, analysis.reasons, "Sakura does not see enough clean bullish signals yet.");
    fillSakuraList(sakuraCautions, analysis.cautions, "No major danger signal is visible right now.");
  } catch (error) {
    sakuraVerdict.textContent = "Offline";
    sakuraSummary.textContent = error instanceof Error ? error.message : "Sakura analysis failed.";
    fillSakuraList(sakuraReasons, [], "No analysis points available.");
    fillSakuraList(sakuraCautions, [], "No caution points available.");
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
    socialRow.appendChild(createStat(label, data.summary?.[key]));
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
  const requestId = ++chartRequestId;
  chartLoading = true;
  chartShell.classList.remove("hidden");
  chartLink.href = data.dexScreener?.url || `https://dexscreener.com/bsc/${data.tokenAddress}`;
  chartLink.textContent = "Open Market";
  chartPrice.textContent = formatUsd(data.dexScreener?.priceUsd);
  chartMarketCap.textContent = formatCompactMoney(data.dexScreener?.marketCap);
  chartLiquidity.textContent = formatCompactMoney(data.dexScreener?.liquidityUsd);
  setTimeframeButtonsDisabled(true);

  chartStatus.textContent = "Loading chart data...";
  chartStatus.classList.remove("hidden");

  try {
    const response = await fetch(
      `/api/chart?address=${encodeURIComponent(data.tokenAddress)}&timeframe=${encodeURIComponent(currentTimeframe)}`,
    );
    const chartData = await response.json();

    if (!response.ok) {
      throw new Error(chartData.error || "Chart lookup failed.");
    }

    if (requestId !== chartRequestId) {
      return;
    }

    if (!Array.isArray(chartData.candles) || chartData.candles.length === 0) {
      chartStatus.textContent = "No candle data found for this token yet.";
      clearChartData();
      setTimeframeButtonsDisabled(false);
      return;
    }

    chartLink.href = chartData.dexUrl || chartLink.href;
    chartStatus.classList.add("hidden");
    chartStatus.textContent = "";
    drawChart(chartData.candles);
  } catch (error) {
    if (requestId !== chartRequestId) {
      return;
    }
    chartStatus.textContent = error instanceof Error ? error.message : "Chart failed to load.";
    chartStatus.classList.remove("hidden");
    clearChartData();
  } finally {
    if (requestId === chartRequestId) {
      chartLoading = false;
      setTimeframeButtonsDisabled(false);
    }
  }
}

function drawChart(candles) {
  const precision = derivePrecision(candles);
  ensureChart(precision);

  candleSeries.applyOptions({
    priceFormat: {
      type: "price",
      precision,
      minMove: 1 / 10 ** precision,
    },
  });

  candleSeries.setData(
    candles.map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
  );

  volumeSeries.setData(
    candles.map((candle) => ({
      time: candle.time,
      value: candle.volume,
      color: candle.close >= candle.open ? "rgba(255, 143, 186, 0.42)" : "rgba(139, 107, 232, 0.34)",
    })),
  );

  chartApi.timeScale().fitContent();
}

function ensureChart(precision) {
  if (chartApi && candleSeries && volumeSeries) {
    chartApi.applyOptions({
      localization: {
        priceFormatter: (price) => formatChartPrice(price, precision),
      },
    });
    return;
  }

  const chartHeight = chartFrame.clientHeight || 560;
  chartApi = createChart(chartFrame, {
    width: chartFrame.clientWidth || 900,
    height: chartHeight,
    layout: {
      background: { type: ColorType.Solid, color: "#fff9fc" },
      textColor: "#8d5b77",
      fontFamily: '"M PLUS Rounded 1c", "Noto Sans JP", sans-serif',
    },
    localization: {
      priceFormatter: (price) => formatChartPrice(price, precision),
    },
    grid: {
      vertLines: { color: "rgba(226, 184, 205, 0.22)" },
      horzLines: { color: "rgba(226, 184, 205, 0.22)" },
    },
    rightPriceScale: {
      borderColor: "rgba(210, 155, 185, 0.28)",
      scaleMargins: {
        top: 0.08,
        bottom: 0.2,
      },
    },
    timeScale: {
      borderColor: "rgba(210, 155, 185, 0.28)",
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      vertLine: { color: "rgba(212, 125, 170, 0.28)" },
      horzLine: { color: "rgba(212, 125, 170, 0.28)" },
    },
  });

  candleSeries = chartApi.addSeries(CandlestickSeries, {
    upColor: "#ff8fba",
    downColor: "#8b6be8",
    borderVisible: false,
    wickUpColor: "#ff8fba",
    wickDownColor: "#8b6be8",
    priceFormat: {
      type: "price",
      precision,
      minMove: 1 / 10 ** precision,
    },
  });

  volumeSeries = chartApi.addSeries(HistogramSeries, {
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
  });

  chartApi.priceScale("volume").applyOptions({
    scaleMargins: {
      top: 0.78,
      bottom: 0,
    },
    borderColor: "rgba(210, 155, 185, 0.18)",
  });

  resizeObserver = new ResizeObserver(() => {
    if (!chartApi) return;
    chartApi.applyOptions({
      width: chartFrame.clientWidth || 900,
      height: chartFrame.clientHeight || 560,
    });
    chartApi.timeScale().fitContent();
  });
  resizeObserver.observe(chartFrame);
}

function clearChartData() {
  if (candleSeries) candleSeries.setData([]);
  if (volumeSeries) volumeSeries.setData([]);
}

function destroyChart() {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (chartApi) {
    chartApi.remove();
    chartApi = null;
    candleSeries = null;
    volumeSeries = null;
  }

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

function derivePrecision(candles) {
  const lowest = Math.min(...candles.map((candle) => candle.low).filter((value) => Number.isFinite(value) && value > 0));
  if (!Number.isFinite(lowest) || lowest <= 0) return 6;
  if (lowest >= 1000) return 2;
  if (lowest >= 1) return 4;
  const decimals = Math.ceil(Math.abs(Math.log10(lowest))) + 2;
  return Math.min(Math.max(decimals, 4), 12);
}

function formatChartPrice(value, precision) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function updateTimeframeButtons() {
  timeframeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timeframe === currentTimeframe);
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

function createValueElement(label, value) {
  const text = formatValue(value);
  if (isSocialLabel(label) && value) {
    const link = document.createElement("a");
    link.className = "stat-value stat-link";
    link.href = String(value);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = prettyLinkText(String(value));
    return link;
  }

  const content = document.createElement("p");
  content.className = "stat-value";
  content.textContent = text;
  return content;
}

function prettyLinkText(value) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "") + url.pathname;
  } catch {
    return value;
  }
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
    item.classList.add("is-link");
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

function selectTab(name) {
  tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === name);
  });

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== name);
  });
}
