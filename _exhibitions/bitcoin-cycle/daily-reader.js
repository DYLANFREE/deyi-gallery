(() => {
  'use strict';
  const base = window.BTC_HISTORY, daily = window.BitcoinDailyData;
  const key = 'deyi:bitcoin:utc-close-v1:' + base.meta.sourceHash;
  const retryMs = 30 * 60 * 1000;
  const cutoff = document.querySelector('#snapshot-through');
  const message = document.querySelector('#daily-status');
  let active = base, inFlight, timer, verifiedAt = 0, lastAttempt = 0, lastSeen = null;

  function status(text) { message.textContent = text; message.hidden = !text; }
  function describeAvailability(now) {
    const target = daily.iso(daily.closedDay(now));
    if (active.meta.priceThrough < target) {
      status('数据源尚未公布最新收盘，已显示至 ' + active.meta.priceThrough + '。稍后会再核对。');
    } else if (active.meta.modelThrough < active.meta.priceThrough) {
      status('S2F 的完整供给数据截至 ' + active.meta.modelThrough + '，稍后会再核对。');
    } else {
      status('');
    }
  }
  function apply(cached, now) {
    if (!Number.isFinite(cached?.verifiedAt) || cached.verifiedAt > now + 60000 || cached.verifiedAt <= 0) throw Error('Invalid check time');
    const retained = daily.retainObserved(active, cached.tail);
    const incoming = daily.assemble(base, retained, daily.closedDay(Math.min(now, cached.verifiedAt)), cached.verifiedAt);
    // A slower request can have later market observations. Merge the actual days
    // and backfilled models; request order only breaks ties for known numeric values.
    const merged = daily.mergeSnapshots(base, active, incoming, cached.verifiedAt >= verifiedAt);
    verifiedAt = Math.max(verifiedAt, cached.verifiedAt);
    const next = daily.assemble(base, merged, daily.closedDay(Math.min(now, verifiedAt)), verifiedAt);
    daily.requireCoverage(active, next, daily.mergeDay(base));
    const changed = merged.some(([day,price,model]) => {
      const old = active.points[day - active.points[0][0]];
      return !old || old[1] !== price || old[2] !== model;
    });
    active = window.BTC_HISTORY = next;
    cutoff.dateTime = next.meta.priceThrough;
    cutoff.textContent = next.meta.priceThrough.replaceAll('-', '.');
    if (changed) document.dispatchEvent(new Event('bitcoin-data-change'));
    describeAvailability(now);
    return {verifiedAt, tail:merged};
  }
  function restore(now) {
    try {
      const value = localStorage.getItem(key);
      if (!value || value === lastSeen) return;
      const cached = JSON.parse(value);
      apply(cached, now);
      lastSeen = value;
    } catch { /* Storage is optional; a malformed cache leaves the chart readable. */ }
  }
  async function save(tail, startedAt) {
    const mergeAndStore = () => {
      const now = Date.now();
      restore(now);
      const record = apply({verifiedAt:startedAt,tail}, now);
      try {
        const value = JSON.stringify(record);
        localStorage.setItem(key, value);
        lastSeen = value;
      } catch { /* The validated chart also works without persistent storage. */ }
    };
    if (navigator.locks?.request) {
      try { await navigator.locks.request(key, mergeAndStore); return; }
      catch (error) { if (error.name !== 'SecurityError' && error.name !== 'NotSupportedError') throw error; }
    }
    mergeAndStore();
  }
  function nextCheck(now) {
    const {priceThrough, modelThrough} = active.meta;
    const target = daily.iso(daily.closedDay(now));
    if (priceThrough >= target && modelThrough >= target && Math.floor(now/daily.dayMs) === Math.floor(verifiedAt/daily.dayMs)) {
      return (Math.floor(now/daily.dayMs) + 1) * daily.dayMs + 2 * 60000;
    }
    const attempted = Math.max(lastAttempt, verifiedAt);
    if (Math.floor(attempted/daily.dayMs) < Math.floor(now/daily.dayMs)) return 0;
    return attempted + retryMs;
  }
  function arm() {
    clearTimeout(timer);
    const now = Date.now();
    timer = setTimeout(wake, Math.max(500, nextCheck(now) - now));
  }
  async function update(now) {
    const target = daily.closedDay(now);
    lastAttempt = now;
    try {
      const tail = await daily.fetchTail(base, target, window.fetch.bind(window), AbortSignal.timeout(15000));
      await save(tail, now);
    } catch {
      restore(Date.now());
      if (verifiedAt >= now) describeAvailability(Date.now());
      else status('暂时无法核对新日线，当前显示至 ' + active.meta.priceThrough + '。');
    }
  }
  function wake() {
    if (inFlight || document.hidden) return;
    const now = Date.now();
    restore(now);
    if (now < nextCheck(now)) { arm(); return; }
    inFlight = update(now).finally(() => { inFlight = null; arm(); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  window.addEventListener('pageshow', wake);
  window.addEventListener('online', () => { lastAttempt = 0; wake(); });
  window.addEventListener('storage', event => { if (event.key === key && !document.hidden) wake(); });
  window.BitcoinDailyReader = {start:wake};
})();
