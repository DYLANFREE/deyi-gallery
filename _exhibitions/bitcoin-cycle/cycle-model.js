/* Shared, date-independent cycle rules; also loaded by the regression tests. */
(() => {
  'use strict';
  const DAY = 86400000;
  const seasons = [
    {name:'夏', start:0, end:365, color:'#bd902f', fill:'#fbf3d6'},
    {name:'秋', start:365, end:730, color:'#c46035', fill:'#fae5d8'},
    {name:'冬', start:730, end:1095, color:'#387fa5', fill:'#e2edf7'},
    {name:'春', start:1095, end:null, color:'#408b5b', fill:'#e3f1e5'}
  ];
  const iso = day => new Date(day * DAY).toISOString().slice(0,10);
  function seasonAt(offset) {
    if (!Number.isFinite(offset) || offset < 0) return null;
    return seasons[Math.min(3, Math.floor(offset / 365))].name;
  }
  function buildCycles(history) {
    const last = history.points.at(-1)[0];
    const colors = ['#35799b','#ad762c','#39836b','#bf6375'];
    return history.halvings.map((halving,index) => {
      const next = history.halvings[index+1];
      const endDay = Math.min(next?.day ?? last+1, last+1);
      const base = history.points.find(point => point[0] === halving.day)?.[1];
      if (!(base > 0)) throw new Error('Missing halving-day price: ' + halving.date);
      const points = history.points.filter(point => point[0] >= halving.day && point[0] < endDay)
        .map(([day,price]) => ({day,offset:day-halving.day,price,multiple:price/base}));
      return {year:halving.date.slice(0,4),halving,next,base,endDay,points,
        complete:Boolean(next && next.day <= last),color:colors[index % colors.length],
        seasons:seasons.map(season => ({...season,start:halving.day+season.start,
          end:season.end === null ? (next?.day ?? null) : halving.day+season.end}))};
    });
  }
  // Exact observed day only: never extrapolate a finished or an incomplete cycle.
  function pointAt(cycle,offset) {
    return cycle.points.find(point => point.offset === offset) ?? null;
  }
  globalThis.BitcoinCycleModel = {seasons,seasonAt,buildCycles,pointAt,iso};
})();
