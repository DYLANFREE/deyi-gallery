import {
  buildDashboardView,
  buildPriceOverlay,
  buildSupplyTrend,
  classifyDirection,
  formatCompact,
  formatDate,
  formatPercent,
  formatSigned,
} from "./analytics.js";

const config = {
  mode: document.body.dataset.dashboardMode || "service",
  dataUrl: document.body.dataset.dataUrl || "/api/dashboard",
  refreshUrl: document.body.dataset.refreshUrl || "",
};

const state = {
  snapshot: null,
  days: 180,
  flowChart: null,
  supplyChart: null,
  toastTimer: null,
};

const dom = {
  loadingLayer: document.querySelector("#loadingLayer"),
  errorBanner: document.querySelector("#errorBanner"),
  errorText: document.querySelector("#errorText"),
  retryButton: document.querySelector("#retryButton"),
  sourceState: document.querySelector("#sourceState"),
  sourceStateText: document.querySelector("#sourceStateText"),
  refreshButton: document.querySelector("#refreshButton"),
  methodButton: document.querySelector("#methodButton"),
  methodDialog: document.querySelector("#methodDialog"),
  closeMethodButton: document.querySelector("#closeMethodButton"),
  signalSentence: document.querySelector("#signalSentence"),
  observationDate: document.querySelector("#observationDate"),
  fetchTime: document.querySelector("#fetchTime"),
  supplyValue: document.querySelector("#supplyValue"),
  supplyMeta: document.querySelector("#supplyMeta"),
  netChangeLabel: document.querySelector("#netChangeLabel"),
  netChangeValue: document.querySelector("#netChangeValue"),
  netChangeMeta: document.querySelector("#netChangeMeta"),
  flowChart: document.querySelector("#flowChart"),
  supplyChart: document.querySelector("#supplyChart"),
  priceReadouts: document.querySelector("#priceReadouts"),
  trendReadout: document.querySelector("#trendReadout"),
  toast: document.querySelector("#toast"),
};

const COLORS = {
  positive: "#15916d",
  negative: "#cc5847",
  ink: "#152a24",
  muted: "#60746e",
  line: "rgba(23, 62, 52, 0.12)",
  btc: "#f7931a",
  eth: "#627eea",
};

function callIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setLoading(isLoading) {
  dom.loadingLayer.classList.toggle("is-hidden", !isLoading);
  dom.refreshButton.classList.toggle("is-spinning", isLoading);
  dom.refreshButton.disabled = isLoading;
}

function setError(message = "数据暂时无法载入，请稍后重试。") {
  dom.errorText.textContent = message;
  dom.errorBanner.hidden = false;
}

function clearError() {
  dom.errorBanner.hidden = true;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 3200);
}

function setSourceState() {
  const runtime = state.snapshot?.runtime;
  const warnings = state.snapshot?.warnings ?? [];
  const pricesComplete = (state.snapshot?.prices?.length ?? 0) >= 2;
  const fallbackWarnings = warnings.filter((warning) => warning.includes("close-only fallback"));
  const priceFallback = pricesComplete && warnings.length > 0 && fallbackWarnings.length === warnings.length;
  const partial = !pricesComplete || (warnings.length > 0 && !priceFallback);
  const stale = Boolean(runtime?.refreshError);
  const snapshotMode = config.mode === "snapshot";

  dom.sourceState.classList.toggle("is-stale", stale || partial || priceFallback);
  dom.sourceState.classList.toggle("is-live", !stale && !partial && !priceFallback);
  dom.sourceStateText.textContent = stale
    ? snapshotMode ? "快照不可用" : "使用缓存"
    : priceFallback
      ? snapshotMode ? "价格回退 · 快照" : "价格使用回退"
      : partial
        ? snapshotMode ? "部分数据 · 快照" : "部分数据缺失"
        : snapshotMode ? "按需数据快照" : "数据正常";

  dom.sourceState.title = stale
    ? snapshotMode
      ? `公开快照载入失败：${runtime.refreshError}`
      : `刷新失败，显示最近成功缓存：${runtime.refreshError}`
    : priceFallback
      ? "Coinbase K 线暂不可用；价格层显示 DeFiLlama 日度收盘价。"
      : partial
        ? `部分数据未更新：${warnings.join("；") || "BTC / ETH 价格缺失"}`
        : snapshotMode
          ? "公开版使用最近一次按需发布的有效数据快照"
          : "供应与价格数据来自最近一次成功刷新";
}

function renderMetadata() {
  const { snapshot } = state;
  dom.observationDate.textContent = snapshot.latestObservation
    ? formatDate(snapshot.latestObservation, true)
    : "--";

  const fetched = new Date(snapshot.fetchedAt);
  dom.fetchTime.textContent = Number.isNaN(fetched.getTime())
    ? "更新时间未知"
    : `更新于 ${fetched.toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  setSourceState();
}

function directionText(view) {
  const direction = classifyDirection(view.totalDelta, view.startSupply);
  if (direction.key === "flat") return "基本持平";
  return direction.label;
}

function renderSignal(view, recentView) {
  const current = `过去 ${state.days} 天合计${directionText(view)} ${formatCompact(Math.abs(view.totalDelta))}`;
  const recent = state.days > 30
    ? `；最近 30 天${directionText(recentView)} ${formatCompact(Math.abs(recentView.totalDelta))}`
    : "";
  dom.signalSentence.textContent = `${current}${recent}。`;
}

function renderHeadline(view) {
  const direction = view.totalDelta > 0 ? "positive" : view.totalDelta < 0 ? "negative" : "";
  dom.supplyValue.textContent = formatCompact(view.endSupply, 1);
  dom.supplyMeta.textContent = "USDT + USDC 合计";
  dom.netChangeLabel.textContent = `${state.days} 天净变化`;
  dom.netChangeValue.textContent = formatSigned(view.totalDelta);
  dom.netChangeValue.classList.toggle("is-positive", direction === "positive");
  dom.netChangeValue.classList.toggle("is-negative", direction === "negative");
  dom.netChangeMeta.textContent = `${formatPercent(view.changePct)} · 期初 ${formatCompact(view.startSupply, 1)}`;
  dom.trendReadout.textContent = `${formatCompact(view.endSupply, 1)} · ${state.days} 天 ${formatPercent(view.changePct)}`;
  dom.trendReadout.classList.toggle("is-positive", direction === "positive");
  dom.trendReadout.classList.toggle("is-negative", direction === "negative");
}

function formatUsdPrice(value, symbol = "") {
  if (!Number.isFinite(Number(value))) return "--";
  const digits = symbol === "BTC" ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function priceColor(asset) {
  return COLORS[asset?.symbol?.toLowerCase()] ?? asset?.color ?? COLORS.ink;
}

function renderPriceOverview(priceOverlay) {
  const assets = ["BTC", "ETH"]
    .map((symbol) => priceOverlay.find((asset) => asset.symbol === symbol))
    .filter(Boolean);

  dom.priceReadouts.innerHTML = assets.length
    ? assets.map((asset) => {
      const direction = asset.periodReturn > 0 ? "is-positive" : asset.periodReturn < 0 ? "is-negative" : "";
      return `<span class="price-tag ${asset.symbol.toLowerCase()}">
        <i aria-hidden="true"></i>
        <strong>${escapeHtml(asset.symbol)}</strong>
        <b>${escapeHtml(formatUsdPrice(asset.endPrice, asset.symbol))}</b>
        <small class="${direction}">${escapeHtml(formatPercent(asset.periodReturn))}</small>
      </span>`;
    }).join("")
    : '<span class="price-tag is-empty">价格暂不可用</span>';
}

function flowTooltip(params, view, priceOverlay) {
  const date = params[0]?.axisValue;
  if (!date) return "";
  const point = view.daily.find((item) => item.date === date);
  const raw = point?.total ?? 0;
  const contributionRows = ["USDT", "USDC"].map((symbol) => {
    const value = point?.contributions?.[symbol];
    if (!Number.isFinite(value)) return "";
    return `<div class="tooltip-row"><span>${symbol}</span><b>${escapeHtml(formatSigned(value))}</b></div>`;
  }).join("");
  const priceRows = ["BTC", "ETH"].map((symbol) => priceOverlay.find((asset) => asset.symbol === symbol))
    .filter(Boolean)
    .map((asset) => {
      const observation = asset.aligned.find((item) => item.date === date);
      const relativeReturn = observation?.index != null ? observation.index / 100 - 1 : null;
      return `<div class="tooltip-row price">
        <span><i style="background:${escapeHtml(priceColor(asset))}"></i>${escapeHtml(asset.symbol)} 收盘</span>
        <b>${escapeHtml(formatUsdPrice(observation?.price, asset.symbol))}<small>${relativeReturn == null ? "--" : escapeHtml(formatPercent(relativeReturn))}</small></b>
      </div>`;
    }).join("");

  const directionClass = raw > 0 ? "positive" : raw < 0 ? "negative" : "";
  return `<div class="chart-tooltip">
    <strong>${escapeHtml(formatDate(date, true))}</strong>
    ${priceRows}
    <div class="tooltip-divider"></div>
    <div class="tooltip-row"><span>合计日净变化</span><b class="${directionClass}">${escapeHtml(formatSigned(raw))}</b></div>
    ${contributionRows}
  </div>`;
}

function renderFlowChart(view, priceOverlay) {
  if (!window.echarts) return;
  if (!state.flowChart) {
    state.flowChart = window.echarts.init(dom.flowChart, null, { renderer: "canvas" });
  }

  const compact = window.innerWidth <= 620;
  const dates = view.daily.map((point) => point.date);
  const deltaData = view.daily.map((point) => ({
    value: point.total,
    contributions: point.contributions,
    itemStyle: {
      color: point.total >= 0 ? COLORS.positive : COLORS.negative,
      opacity: 0.84,
      borderRadius: point.total >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2],
    },
  }));
  const priceSeries = ["BTC", "ETH"]
    .map((symbol) => priceOverlay.find((asset) => asset.symbol === symbol))
    .filter(Boolean)
    .map((asset) => ({
      name: asset.symbol,
      type: "line",
      yAxisIndex: 1,
      data: asset.aligned.map((point) => point.index),
      symbol: "none",
      connectNulls: false,
      smooth: 0.12,
      lineStyle: { width: compact ? 1.8 : 2.3, color: priceColor(asset) },
      itemStyle: { color: priceColor(asset) },
      emphasis: { focus: "series", lineStyle: { width: 3 } },
      z: 5,
    }));

  renderPriceOverview(priceOverlay);
  state.flowChart.setOption({
    animationDuration: 420,
    animationEasing: "cubicOut",
    grid: {
      top: 34,
      right: compact ? 48 : 62,
      bottom: 44,
      left: compact ? 58 : 74,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "line", lineStyle: { color: "rgba(21,42,36,.36)" } },
      backgroundColor: "#152a24",
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: "#fff", fontFamily: "inherit", fontSize: 12 },
      formatter: (params) => flowTooltip(params, view, priceOverlay),
      extraCssText: "box-shadow: 0 12px 30px rgba(21,42,36,.2);",
    },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: true,
      axisLine: { lineStyle: { color: COLORS.line } },
      axisTick: { show: false },
      axisLabel: {
        color: COLORS.muted,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value) => formatDate(value),
      },
    },
    yAxis: [
      {
        type: "value",
        name: compact ? "日净变化" : "USDT + USDC 日净变化",
        nameTextStyle: { color: COLORS.muted, fontSize: 10, align: "left" },
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (value) => formatCompact(value, 0) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "rgba(23, 62, 52, 0.08)" } },
      },
      {
        type: "value",
        scale: true,
        name: compact ? "价格指数" : "价格指数 · 期初=100",
        nameTextStyle: { color: COLORS.muted, fontSize: 10, align: "right" },
        axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (value) => Number(value).toFixed(0) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "日度净铸造 / 净销毁",
        type: "bar",
        yAxisIndex: 0,
        barMaxWidth: 14,
        barMinHeight: 1,
        data: deltaData,
        emphasis: { itemStyle: { opacity: 1 } },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "rgba(21, 42, 36, .25)", type: "dashed" },
          data: [{ yAxis: 0 }],
        },
        z: 2,
      },
      ...priceSeries,
    ],
  }, { notMerge: true });
}

function supplyTooltip(params, view) {
  const point = params[0]?.data;
  if (!point) return "";
  const change = view.startSupply ? point.value / view.startSupply - 1 : 0;
  return `<div class="chart-tooltip">
    <strong>${escapeHtml(formatDate(point.date, true))}</strong>
    <div class="tooltip-row"><span>USDT + USDC 总供应</span><b>${escapeHtml(formatCompact(point.value, 2))}</b></div>
    <div class="tooltip-note">相对期初 ${escapeHtml(formatPercent(change))}</div>
  </div>`;
}

function renderSupplyChart(view) {
  if (!window.echarts) return;
  if (!state.supplyChart) {
    state.supplyChart = window.echarts.init(dom.supplyChart, null, { renderer: "canvas" });
  }

  const compact = window.innerWidth <= 620;
  const trend = buildSupplyTrend(view);
  state.supplyChart.setOption({
    animationDuration: 420,
    animationEasing: "cubicOut",
    grid: {
      top: 20,
      right: compact ? 20 : 30,
      bottom: 42,
      left: compact ? 58 : 74,
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "line", lineStyle: { color: "rgba(21,42,36,.36)" } },
      backgroundColor: "#152a24",
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: "#fff", fontFamily: "inherit", fontSize: 12 },
      formatter: (params) => supplyTooltip(params, view),
      extraCssText: "box-shadow: 0 12px 30px rgba(21,42,36,.2);",
    },
    xAxis: {
      type: "category",
      data: trend.map((point) => point.date),
      boundaryGap: false,
      axisLine: { lineStyle: { color: COLORS.line } },
      axisTick: { show: false },
      axisLabel: {
        color: COLORS.muted,
        fontSize: 10,
        hideOverlap: true,
        formatter: (value) => formatDate(value),
      },
    },
    yAxis: {
      type: "value",
      scale: true,
      name: compact ? "总供应" : "USDT + USDC 总供应",
      nameTextStyle: { color: COLORS.muted, fontSize: 10, align: "left" },
      axisLabel: { color: COLORS.muted, fontSize: 10, formatter: (value) => formatCompact(value, 0) },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "rgba(23, 62, 52, 0.08)" } },
    },
    series: [{
      name: "USDT + USDC 总供应",
      type: "line",
      data: trend.map((point) => ({ value: point.supply, date: point.date })),
      symbol: "none",
      smooth: 0.16,
      lineStyle: { width: 2.5, color: COLORS.positive },
      itemStyle: { color: COLORS.positive },
      areaStyle: {
        color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: "rgba(21,145,109,.24)" },
          { offset: 1, color: "rgba(21,145,109,.02)" },
        ]),
      },
      emphasis: { focus: "series", lineStyle: { width: 3.2 } },
    }],
  }, { notMerge: true });
}

function renderCurrentView() {
  if (!state.snapshot) return;
  const view = buildDashboardView(state.snapshot, {
    asset: "ALL",
    days: state.days,
  });
  const recentView = state.days > 30
    ? buildDashboardView(state.snapshot, { asset: "ALL", days: 30 })
    : view;
  const priceOverlay = buildPriceOverlay(state.snapshot, view.daily);

  renderMetadata();
  renderSignal(view, recentView);
  renderHeadline(view);
  renderFlowChart(view, priceOverlay);
  renderSupplyChart(view);
}

async function fetchDashboard({ force = false } = {}) {
  setLoading(true);
  clearError();
  try {
    const separator = config.dataUrl.includes("?") ? "&" : "?";
    const url = force ? `${config.dataUrl}${separator}t=${Date.now()}` : config.dataUrl;
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "数据不可用");
    state.snapshot = config.mode === "snapshot"
      ? {
        ...payload,
        runtime: {
          refreshError: null,
          cacheAgeMs: Date.now() - Date.parse(payload.fetchedAt),
          updateMode: "published-snapshot",
        },
      }
      : payload;
    renderCurrentView();
    return true;
  } catch (error) {
    setError(error instanceof Error ? error.message : "数据不可用");
    return false;
  } finally {
    setLoading(false);
  }
}

async function refreshData() {
  if (config.refreshUrl) {
    setLoading(true);
    try {
      const response = await fetch(config.refreshUrl, { method: "POST", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || payload.refreshError || "刷新失败");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "刷新失败");
      showToast("刷新失败，继续显示当前缓存");
      setLoading(false);
      return;
    }
  }

  const loaded = await fetchDashboard({ force: true });
  showToast(loaded
    ? config.mode === "snapshot" ? "已重新载入公开数据快照" : "数据已刷新"
    : "数据载入失败");
}

function bindControls() {
  document.querySelectorAll("#rangeControl button").forEach((button) => {
    button.addEventListener("click", () => {
      state.days = Number(button.dataset.range);
      document.querySelectorAll("#rangeControl button").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      renderCurrentView();
    });
  });

  dom.refreshButton.addEventListener("click", refreshData);
  dom.retryButton.addEventListener("click", () => fetchDashboard({ force: true }));
  dom.methodButton.addEventListener("click", () => dom.methodDialog.showModal());
  dom.closeMethodButton.addEventListener("click", () => dom.methodDialog.close());
  dom.methodDialog.addEventListener("click", (event) => {
    if (event.target === dom.methodDialog) dom.methodDialog.close();
  });
  window.addEventListener("resize", () => {
    state.flowChart?.resize();
    state.supplyChart?.resize();
  });
}

bindControls();
callIcons();
fetchDashboard();
setInterval(() => {
  if (!document.hidden) fetchDashboard();
}, 5 * 60 * 1000);
