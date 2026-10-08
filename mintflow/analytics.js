export function seriesWindow(series, days) {
  if (!Array.isArray(series) || series.length === 0) return [];
  const pointCount = Math.max(2, Number(days) + 1);
  return series.slice(-Math.min(pointCount, series.length));
}

export function deltasForSeries(series, days) {
  const window = seriesWindow(series, days);
  return window.slice(1).map((point, index) => ({
    date: point.date,
    supply: point.supply,
    delta: point.supply - window[index].supply,
  }));
}

function selectedAssets(snapshot, assetSymbol) {
  if (!snapshot?.assets) return [];
  return assetSymbol === "ALL"
    ? snapshot.assets
    : snapshot.assets.filter((asset) => asset.symbol === assetSymbol);
}

function periodForAsset(asset, days) {
  const window = seriesWindow(asset.totalSeries, days);
  const first = window.at(0)?.supply ?? 0;
  const last = window.at(-1)?.supply ?? 0;
  return {
    symbol: asset.symbol,
    startSupply: first,
    endSupply: last,
    delta: last - first,
    changePct: first ? (last - first) / first : 0,
    currentSupply: asset.currentSupply,
  };
}

export function buildDashboardView(snapshot, options = {}) {
  const days = Number(options.days || 180);
  const threshold = Number(options.threshold || 100_000_000);
  const assetSymbol = options.asset || "ALL";
  const assets = selectedAssets(snapshot, assetSymbol);
  const dailyMap = new Map();
  const events = [];
  const assetPeriods = assets.map((asset) => periodForAsset(asset, days));

  for (const asset of assets) {
    for (const point of deltasForSeries(asset.totalSeries, days)) {
      const day = dailyMap.get(point.date) ?? {
        date: point.date,
        total: 0,
        contributions: {},
        large: false,
      };
      day.contributions[asset.symbol] = point.delta;
      day.total += point.delta;
      dailyMap.set(point.date, day);

      if (Math.abs(point.delta) >= threshold) {
        day.large = true;
        events.push({
          date: point.date,
          symbol: asset.symbol,
          delta: point.delta,
          supply: point.supply,
          shareOfSupply: point.supply ? Math.abs(point.delta) / point.supply : 0,
        });
      }
    }
  }

  let cumulative = 0;
  const daily = [...dailyMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => {
      cumulative += point.total;
      return { ...point, cumulative };
    });

  const totalDelta = assetPeriods.reduce((sum, asset) => sum + asset.delta, 0);
  const startSupply = assetPeriods.reduce((sum, asset) => sum + asset.startSupply, 0);
  const endSupply = assetPeriods.reduce((sum, asset) => sum + asset.endSupply, 0);
  const grossIncrease = daily.reduce((sum, day) => sum + Math.max(0, day.total), 0);
  const grossDecrease = daily.reduce((sum, day) => sum + Math.abs(Math.min(0, day.total)), 0);
  const positiveDays = daily.filter((day) => day.total > 0).length;
  const negativeDays = daily.filter((day) => day.total < 0).length;

  return {
    assetSymbol,
    days,
    threshold,
    daily,
    events: events.sort((a, b) => b.date.localeCompare(a.date) || Math.abs(b.delta) - Math.abs(a.delta)),
    largeDateCount: new Set(events.map((event) => event.date)).size,
    assetPeriods,
    totalDelta,
    startSupply,
    endSupply,
    changePct: startSupply ? totalDelta / startSupply : 0,
    grossIncrease,
    grossDecrease,
    positiveDays,
    negativeDays,
    largestIncrease: daily.reduce((best, day) => (day.total > (best?.total ?? -Infinity) ? day : best), null),
    largestDecrease: daily.reduce((best, day) => (day.total < (best?.total ?? Infinity) ? day : best), null),
  };
}

export function buildSupplyTrend(view) {
  if (!view?.daily?.length) return [];
  const startSupply = Number(view.startSupply) || 0;
  return view.daily.map((point) => ({
    date: point.date,
    supply: startSupply + point.cumulative,
  }));
}

export function buildChainView(snapshot, options = {}) {
  const days = Number(options.days || 90);
  const assetSymbol = options.asset || "ALL";
  const assets = selectedAssets(snapshot, assetSymbol);
  const movements = [];

  for (const asset of assets) {
    for (const chain of asset.chains ?? []) {
      const window = seriesWindow(chain.series, days);
      const start = window.at(0)?.supply ?? 0;
      const end = window.at(-1)?.supply ?? 0;
      movements.push({
        symbol: asset.symbol,
        chain: chain.name,
        currentSupply: chain.currentSupply,
        currentShare: chain.share,
        delta: end - start,
        changePct: start ? (end - start) / start : 0,
      });
    }
  }

  movements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const positive = movements.reduce((sum, item) => sum + Math.max(0, item.delta), 0);
  const negative = movements.reduce((sum, item) => sum + Math.abs(Math.min(0, item.delta)), 0);
  const assetOffsets = assets.map((asset) => {
    const assetMovements = movements.filter((item) => item.symbol === asset.symbol);
    const assetPositive = assetMovements.reduce((sum, item) => sum + Math.max(0, item.delta), 0);
    const assetNegative = assetMovements.reduce((sum, item) => sum + Math.abs(Math.min(0, item.delta)), 0);
    return {
      symbol: asset.symbol,
      positive: assetPositive,
      negative: assetNegative,
      offset: Math.min(assetPositive, assetNegative),
    };
  });
  const coverage = assets.reduce((sum, asset) => sum + asset.chainCoverage * asset.currentSupply, 0)
    / Math.max(1, assets.reduce((sum, asset) => sum + asset.currentSupply, 0));

  return {
    movements,
    positive,
    negative,
    assetOffsets,
    offsetAmount: assetOffsets.reduce((sum, asset) => sum + asset.offset, 0),
    coverage,
  };
}

export function buildPriceOverlay(snapshot, daily) {
  const dates = daily.map((point) => point.date);
  const dateSet = new Set(dates);

  return (snapshot?.prices ?? []).map((asset) => {
    const closeByDate = new Map(
      (asset.series ?? [])
        .filter((point) => dateSet.has(point.date))
        .map((point) => [point.date, point.price]),
    );
    const ohlcByDate = new Map(
      (asset.ohlc ?? [])
        .filter((point) => dateSet.has(point.date))
        .map((point) => [point.date, point]),
    );
    for (const [date, candle] of ohlcByDate) closeByDate.set(date, candle.close);
    const firstPrice = dates.map((date) => closeByDate.get(date)).find((price) => price > 0) ?? 0;
    const aligned = dates.map((date) => {
      const candle = ohlcByDate.get(date);
      const price = closeByDate.get(date) ?? null;
      return {
        date,
        price,
        open: candle?.open ?? null,
        high: candle?.high ?? null,
        low: candle?.low ?? null,
        close: candle?.close ?? price,
        index: price && firstPrice ? price / firstPrice * 100 : null,
      };
    });
    const valid = aligned.filter((point) => point.price);
    const startPrice = valid.at(0)?.price ?? 0;
    const endPrice = valid.at(-1)?.price ?? 0;

    return {
      symbol: asset.symbol,
      name: asset.name,
      color: asset.color,
      currentPrice: asset.currentPrice,
      startPrice,
      endPrice,
      periodReturn: startPrice ? endPrice / startPrice - 1 : 0,
      aligned,
      hasOhlc: ohlcByDate.size > 0,
      priceByDate: new Map(closeByDate),
    };
  });
}

function dateAfter(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildResponseStudy(priceOverlay, daily, horizons = [1, 3, 7]) {
  const eventDays = daily.filter((point) => point.large && point.total !== 0);

  return priceOverlay.map((asset) => {
    const groups = {};
    for (const [key, predicate] of [
      ["mint", (delta) => delta > 0],
      ["burn", (delta) => delta < 0],
    ]) {
      const events = eventDays.filter((point) => predicate(point.total));
      const outcomes = Object.fromEntries(horizons.map((horizon) => {
        const returns = events.flatMap((event) => {
          const start = asset.priceByDate.get(event.date);
          const end = asset.priceByDate.get(dateAfter(event.date, horizon));
          return start && end ? [end / start - 1] : [];
        });
        return [horizon, { median: median(returns), sampleSize: returns.length }];
      }));
      groups[key] = { eventCount: events.length, outcomes };
    }

    return {
      symbol: asset.symbol,
      color: asset.color,
      currentPrice: asset.currentPrice,
      endPrice: asset.endPrice,
      periodReturn: asset.periodReturn,
      groups,
    };
  });
}

export function classifyDirection(delta, startingSupply) {
  const ratio = startingSupply ? delta / startingSupply : 0;
  if (ratio > 0.0005) return { key: "up", label: "净扩张" };
  if (ratio < -0.0005) return { key: "down", label: "净收缩" };
  return { key: "flat", label: "基本持平" };
}

export function formatCompact(value, digits = 2) {
  const absolute = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "-" : "";
  if (absolute >= 1_000_000_000) return `${sign}$${(absolute / 1_000_000_000).toFixed(digits)}B`;
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(digits)}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(digits)}K`;
  return `${sign}$${absolute.toFixed(0)}`;
}

export function formatSigned(value, digits = 2) {
  if (value === 0) return "$0";
  return `${value > 0 ? "+" : ""}${formatCompact(value, digits)}`;
}

export function formatPercent(value, digits = 2) {
  const numeric = Number(value) || 0;
  return `${numeric > 0 ? "+" : ""}${(numeric * 100).toFixed(digits)}%`;
}

export function formatRatio(value, digits = 1) {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}

export function formatDate(date, withYear = false) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: withYear ? "numeric" : undefined,
    month: "short",
    day: "numeric",
  }).format(parsed);
}
