// Coin Metrics labels a UTC closing price with the date of the day that ended.
(function (root) {
  'use strict';
  const dayMs = 86400000;
  const iso = day => new Date(day * dayMs).toISOString().slice(0, 10);
  const dayOf = date => Date.parse(date + 'T00:00:00Z') / dayMs;
  const closedDay = now => Math.floor(now / dayMs) - 1;

  // Re-read the last packaged close and any incomplete trailing model date.
  // Each model value needs issuance on this day and the preceding 364 UTC days.
  function mergeDay(base) {
    return Math.min(base.points.at(-1)[0], dayOf(base.meta.modelThrough) + 1);
  }
  function number(value, positive) {
    if (value == null) return null;
    if (!['number', 'string'].includes(typeof value) ||
        (typeof value === 'string' && !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))) throw Error('Invalid BTC metric');
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (positive ? parsed <= 0 : parsed < 0)) throw Error('Invalid BTC metric');
    return parsed;
  }

  function calculateTail(base, rows, target) {
    const start = mergeDay(base);
    let expected = start - 364;
    const issuance = [], tail = [];
    for (const row of rows) {
      const stamp = row?.time;
      if (row?.asset !== 'btc' || typeof stamp !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/.test(stamp) ||
          stamp.slice(0, 10) !== iso(expected) || expected > target) throw Error('Incomplete calendar sequence');
      const day = expected++;
      issuance.push(number(row.IssTotNtv, false));
      if (issuance.length > 365) issuance.shift();
      if (day < start) continue;
      const price = number(row.PriceUSD, true), stock = number(row.SplyCur, true);
      let model = null;
      if (stock > 1000000 && issuance.length === 365 && issuance.every(value => value !== null)) {
        const flow = issuance.reduce((sum, value) => sum + value, 0);
        if (!(flow > 0)) throw Error('Invalid annual issuance');
        model = number(Math.exp(14.6) * ((stock - 1000000) / flow) ** 3.3 / stock, true);
      }
      tail.push([day, price, model]);
    }
    while (tail.length && tail.at(-1)[1] === null) tail.pop();
    return tail;
  }

  function halvingBands(points, halvings) {
    const seasons = ['夏', '秋', '冬', '春'], bands = [];
    for (const [day] of points) {
      const last = halvings.findLast(halving => halving.day <= day);
      const anchor = last || halvings[0];
      const years = Math.floor((day - anchor.day) / 365);
      const name = seasons[last ? Math.min(3, years) : ((years % 4) + 4) % 4];
      const band = bands.at(-1);
      if (band && band.name === name && band.anchor === anchor.date && band.inferred === !last) band.end = day + 1;
      else bands.push({start:day, end:day+1, name, anchor:anchor.date, inferred:!last});
    }
    return bands;
  }

  function assemble(base, tail, target, verifiedAt) {
    const start = mergeDay(base);
    if (!Array.isArray(tail) || !tail.length || tail.length > target - start + 1) throw Error('Invalid daily data span');
    for (const [i, point] of tail.entries()) {
      if (!Array.isArray(point) || point.length !== 3 || point[0] !== start + i ||
          !Number.isFinite(point[1]) || point[1] <= 0 ||
          !(point[2] === null || (Number.isFinite(point[2]) && point[2] > 0))) throw Error('Invalid daily observation');
    }
    const points = base.points.slice(0, start - base.points[0][0]).concat(tail);
    const latest = points.at(-1), lastModel = points.findLast(point => point[2] !== null);
    return {
      points, halvings:base.halvings, bands:halvingBands(points, base.halvings),
      meta:{...base.meta, priceThrough:iso(latest[0]), latestPrice:latest[1],
        modelThrough:iso(lastModel[0]), latestModel:lastModel[2], preparedAt:iso(Math.floor(verifiedAt/dayMs)),
        missingModel:points.filter(point => point[2] === null).map(point => iso(point[0]))}
    };
  }

  function retainObserved(previous, tail) {
    const first = previous.points[0][0];
    return tail.map(([day, price, model]) => {
      const known = previous.points[day - first];
      if (!known || known[0] !== day) return [day, price, model];
      // Only restore the same date's actual previously verified value.
      return [day, price ?? known[1], model ?? known[2]];
    });
  }

  function mergeSnapshots(base, current, incoming, preferIncoming) {
    const start = mergeDay(base) - base.points[0][0];
    const result = current.points.slice(start);
    for (let i = start; i < incoming.points.length; i++) {
      const next = incoming.points[i], known = result[i-start];
      if (!known) { result.push(next); continue; }
      const first = preferIncoming ? next : known;
      const second = preferIncoming ? known : next;
      result[i-start] = [next[0], first[1], first[2] ?? second[2]];
    }
    return result;
  }

  function requireCoverage(previous, next, start) {
    if (next.meta.priceThrough < previous.meta.priceThrough || next.meta.modelThrough < previous.meta.modelThrough) {
      throw Error('Source lags previously verified data');
    }
    // Missing upstream values cannot withdraw a previously observed model point.
    const first = previous.points[0][0];
    for (let i = start - first; i < previous.points.length; i++) {
      if (previous.points[i][2] !== null && next.points[i][2] === null) throw Error('Incomplete supply window');
    }
  }

  async function fetchTail(base, target, fetcher, signal) {
    const start = mergeDay(base) - 364;
    const url = new URL('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics');
    const params = {assets:'btc', metrics:'PriceUSD,SplyCur,IssTotNtv', frequency:'1d',
      start_time:iso(start), end_time:iso(target), page_size:'10000'};
    url.search = new URLSearchParams(params).toString();
    const rows = [], tokens = new Set();
    for (;;) {
      const response = await fetcher(url.href, {method:'GET',credentials:'omit',redirect:'error',cache:'no-store',signal});
      if (!response.ok) throw Error('Coin Metrics HTTP ' + response.status);
      const chunk = await response.json();
      if (!Array.isArray(chunk.data) || !chunk.data.length || rows.length + chunk.data.length > target - start + 1) {
        throw Error('Invalid BTC response');
      }
      rows.push(...chunk.data);
      const token = chunk.next_page_token;
      if (!token && !chunk.next_page_url) break;
      if (typeof token !== 'string' || !token || token.length > 4096 || tokens.has(token)) throw Error('Incomplete BTC pagination');
      tokens.add(token);
      url.searchParams.set('next_page_token', token);
    }
    return calculateTail(base, rows, target);
  }

  const api = {dayMs, iso, dayOf, closedDay, mergeDay, calculateTail, assemble, retainObserved, mergeSnapshots, requireCoverage, fetchTail};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BitcoinDailyData = api;
})(globalThis);
