(() => {
  'use strict';
  const dayMs = 86400000;
  const epochYear = 2024;
  const sequence = ['春','夏','秋','冬'];
  const palette = Object.fromEntries(BitcoinCycleModel.seasons.map(season => [season.name, season]));
  const toYear = day => new Date(day * dayMs).getUTCFullYear();
  const newYear = year => Date.UTC(year, 0, 1) / dayMs;
  function seasonForYear(year) {
    return sequence[((year - epochYear) % 4 + 4) % 4];
  }
  function calendarBands(firstDay, endExclusive) {
    const bands = [];
    for (let year = toYear(firstDay); newYear(year) < endExclusive; year++) {
      const name = seasonForYear(year);
      bands.push({year, name, color: palette[name].color, fill: palette[name].fill,
        start: newYear(year), end: newYear(year + 1), inferred: false});
    }
    return bands;
  }
  function route() {
    const own = new URL(location.href);
    let parentUrl;
    try {
      if (parent !== window && parent.location.origin === own.origin) parentUrl = new URL(parent.location.href);
    } catch { /* Embedded from another origin: only the local URL applies. */ }
    const outer = parentUrl?.hash.slice(1).split('/') ?? [];
    const [localView, localRule] = own.hash.slice(1).split('/');
    const view = localView || outer[0] || 'history';
    const rule = localRule || own.searchParams.get('rule') || outer[1] || parentUrl?.searchParams.get('rule');
    return {view: ['cycles','overview','model','seasons'].includes(view) ? 'cycles' : 'history',
      rule: rule === 'calendar' ? 'calendar' : 'halving'};
  }
  window.BitcoinSeasons = {route, toYear, seasonForYear, calendarBands, palette,
    isCalendar: () => route().rule === 'calendar'};
})();
