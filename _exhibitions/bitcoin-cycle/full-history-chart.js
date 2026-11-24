(() => {
  'use strict';
  let data=window.BTC_HISTORY;
  if(!window.d3||!data){document.querySelector('#history-scroll').innerHTML='<p class="error">图表资源尚未加载。请重新打开图表。</p>';return;}
  const DAY=86400000, first=data.points[0][0];
  let last = data.points.at(-1)[0];
  const iso=day=>new Date(day*DAY).toISOString().slice(0,10),date=day=>new Date(day*DAY),day=value=>Math.round(Number(value)/DAY);
  const money=value=>value==null?'—':value<1?'$'+value.toFixed(4):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
  const colors={夏:'#bd902f',秋:'#c46035',冬:'#387fa5',春:'#408b5b'},fills={夏:'#fbf3d6',秋:'#fae5d8',冬:'#e2edf7',春:'#e3f1e5'};
  let points=data.points.map(([t,p,m])=>({t,p,m}));
  const svg=d3.select('#history-svg'),nav=d3.select('#navigator-svg');
  const host=document.querySelector('#history-scroll'),from=document.querySelector('#date-from'),to=document.querySelector('#date-to');
  let range=[first,last],showModel=true,showBands=true,showHalvings=true,width=1200,height=572,x,y,crosshair,selected=last,syncing=false,brush,navX;
  const bounds={l:77,r:32,t:107,b:79};
  const byTime=d3.bisector(p=>p.t).center;
  let naturalBands = BitcoinSeasons.calendarBands(first, last + 1);
  const inspect = document.querySelector('#inspect-day');
  let bands = data.bands;
  const inBand = day => bands.find(band => band.start <= day && day < band.end);
  const setText=(id,value)=>{document.querySelector(id).textContent=value};
  const labelPrice=n=>n>=1e6?'$'+(n/1e6)+'百万':n>=1e4?'$'+(n/1e4)+'万':n>=1000?'$'+(n/1000)+'千':'$'+n;
  function describeSnapshot() {
    from.min = to.min = iso(first);
    from.max = to.max = iso(last);
    const {start, priceThrough, modelThrough} = data.meta;
    setText('#data-period', start + ' — ' + priceThrough + ' · BTC / USD · UTC 日收盘 · 对数价格轴');
    setText('#cutoff-note', priceThrough === modelThrough
      ? '价格和 S2F 均截至 ' + priceThrough + '。'
      : '价格截至 ' + priceThrough + '，S2F 的完整供给数据截至 ' + modelThrough + '。');
  }
  describeSnapshot();

  function updateReadout(t,draw=true,preserveEdit=false){
    const nearest=points[Math.max(0,Math.min(points.length-1,byTime(points,t)))];selected=nearest.t;
    const band=inBand(selected);
    if (!preserveEdit || document.activeElement !== inspect) inspect.value=iso(selected);setText('#read-price',money(nearest.p));setText('#read-model',showModel?money(nearest.m):'已隐藏');setText('#read-season',band?band.name+'季':'未定义');
    if (BitcoinSeasons.isCalendar()) {
      setText('#read-status', '换季日 ' + iso(band.start));
    } else {
      const anchor = data.halvings.find(halving => halving.date === band.anchor);
      setText('#read-status', band.inferred ? '首次减半前 · 回推标签' : '距 ' + band.anchor + ' 减半 ' + (selected - anchor.day) + ' 天');
    }
    document.querySelector('#read-season').style.color = colors[band.name];
    if(!draw||!crosshair)return;
    crosshair.attr('display',null);const px=x(date(selected));
    crosshair.select('.cross-line').attr('x1',px).attr('x2',px);
    crosshair.select('.price-dot').attr('cx',px).attr('cy',y(nearest.p)).attr('fill',colors[band?.name]||'#355a42');
    crosshair.select('.model-dot').attr('display',showModel&&nearest.m!==null?null:'none').attr('cx',px).attr('cy',nearest.m!==null?y(nearest.m):bounds.t);
  }

  function render(exportWidth) {
    if (!host.clientWidth && !exportWidth) return;
    const calendar = BitcoinSeasons.isCalendar();
    bands = calendar ? naturalBands : data.bands;
    setText('#history-rule', calendar
      ? '每年元旦换季，2024 春、2025 夏、2026 秋、2027 冬。'
      : '每次减半进入夏季，随后是秋、冬、春。');
    setText('#history-method', calendar
      ? '每个 UTC 日历年对应一个季节，1 月 1 日换季。以 2024 年为春年，每四年重复，2011 全年为冬。'
      : '减半日进入夏季，夏、秋、冬各 365 天。春季持续到下次实际减半。2012 年首次减半之前的分段向前回推，用斜纹和星号标出。');
    width = exportWidth || Math.max(280, Math.round(host.clientWidth));
    const compact = width < 650;
    height = compact ? 375 : 495;
    bounds.l = compact ? 43 : 67;
    bounds.r = compact ? 9 : 20;
    bounds.t = compact ? 72 : 82;
    bounds.b = compact ? 52 : 63;
    svg.attr('width',width).attr('height',height).attr('viewBox',`0 0 ${width} ${height}`).attr('font-family','PingFang SC, Microsoft YaHei, sans-serif').attr('font-size',12);
    svg.selectAll('*').remove();
    const modeName = calendar ? '自然年四季' : '减半日四季';
    svg.append('title').text('比特币历史全景 · ' + modeName);
    svg.append('rect').attr('width',width).attr('height',height).attr('fill','#fff');
    svg.append('text').attr('x',bounds.l).attr('y',20).attr('font-size',compact?12:15).attr('font-weight',550).attr('fill','#253e35')
      .text('BTC 日收盘 · ' + modeName + ' · ' + iso(range[0]).slice(0,4) + '—' + iso(range[1]).slice(0,4));
    if (showModel) {
      svg.append('line').attr('x1',width-(compact?70:137)).attr('x2',width-(compact?53:112)).attr('y1',17).attr('y2',17).attr('stroke','#536764').attr('stroke-width',1.4).attr('stroke-dasharray','5 4');
      svg.append('text').attr('x',width-(compact?50:106)).attr('y',20).attr('font-size',10).attr('fill','#53665a').text(compact?'S2F':'S2F 复算');
    }
    const visible=points.filter(p=>p.t>=range[0]&&p.t<=range[1]),values=visible.flatMap(p=>showModel?[p.p,p.m]:[p.p]).filter(v=>v>0);
    const low=Math.min(...values),high=Math.max(...values);
    x=d3.scaleUtc().domain([date(range[0]),date(range[1])]).range([bounds.l,width-bounds.r]);
    y=d3.scaleLog().domain([10**(Math.floor(Math.log10(low))-.1),10**(Math.ceil(Math.log10(high))+.06)]).range([height-bounds.b,bounds.t]);
    const defs=svg.append('defs');defs.append('clipPath').attr('id','history-clip').append('rect').attr('x',bounds.l).attr('y',bounds.t).attr('width',width-bounds.l-bounds.r).attr('height',height-bounds.t-bounds.b);
    const pattern=defs.append('pattern').attr('id','history-inferred').attr('patternUnits','userSpaceOnUse').attr('width',8).attr('height',8);pattern.append('path').attr('d','M-1 1L1 -1M0 8L8 0M7 9L9 7').attr('stroke','#526b67').attr('stroke-width',.65).attr('opacity',.2);
    const plot=svg.append('g').attr('clip-path','url(#history-clip)');
    bands.filter(b=>b.end>range[0]&&b.start<=range[1]).forEach(b=>{
      const a=Math.max(range[0],b.start),z=Math.min(range[1],b.end),left=x(date(a)),right=x(date(z)),bw=right-left;
      if(showBands){plot.append('rect').attr('data-season',b.name).attr('data-start',iso(b.start)).attr('data-inferred',String(b.inferred)).attr('x',left).attr('y',bounds.t).attr('width',Math.max(0,bw)).attr('height',height-bounds.t-bounds.b).attr('fill',fills[b.name]).attr('opacity',.74);if(b.inferred)plot.append('rect').attr('x',left).attr('y',bounds.t).attr('width',Math.max(0,bw)).attr('height',height-bounds.t-bounds.b).attr('fill','url(#history-inferred)');}
      svg.append('rect').attr('x',left).attr('y',bounds.t-23).attr('width',Math.max(0,bw)).attr('height',18).attr('fill',fills[b.name]);
      if(bw>=(b.inferred?17:12))svg.append('text').attr('x',(left+right)/2).attr('y',bounds.t-10).attr('text-anchor','middle').attr('font-size',bw<22?9:bw<43?10:12).attr('fill',colors[b.name]).attr('font-weight',500).text(b.name+(b.inferred?'*':''));
    });
    const ticks=[];for(let n=Math.floor(Math.log10(low));n<=Math.ceil(Math.log10(high));n++)ticks.push(10**n);
    plot.selectAll('.grid').data(ticks).join('line').attr('class','grid').attr('x1',bounds.l).attr('x2',width-bounds.r).attr('y1',y).attr('y2',y).attr('stroke','#ccd6ce').attr('stroke-width',.65).attr('opacity',.8);
    svg.append('g').attr('transform',`translate(${bounds.l},0)`).call(d3.axisLeft(y).tickValues(ticks).tickFormat(labelPrice).tickSize(0).tickPadding(11)).call(g=>g.select('.domain').remove()).call(g=>g.selectAll('text').attr('fill','#64766c').attr('font-size',11));
    const years=(range[1]-range[0])/365.25;
    const xa=d3.axisBottom(x).ticks(years>7?d3.utcYear.every(compact?4:1):years>2?d3.utcMonth.every(compact?12:6):d3.utcMonth.every(compact?6:3)).tickFormat(d3.utcFormat(years>7?'%Y':'%Y-%m')).tickSize(0).tickPadding(13);
    svg.append('g').attr('transform',`translate(0,${height-bounds.b})`).call(xa).call(g=>g.select('.domain').attr('stroke','#acbab0')).call(g=>g.selectAll('text').attr('fill','#64766c').attr('font-size',11));
    const priceLine=d3.line().defined(p=>p.p!==null).x(p=>x(date(p.t))).y(p=>y(p.p));
    plot.append('path').datum(visible).attr('d',priceLine).attr('fill','none').attr('stroke','#34483c').attr('stroke-width',.9);
    bands.forEach(b=>{const subset=visible.filter(p=>p.t>=b.start&&p.t<=b.end);if(subset.length>1)plot.append('path').datum(subset).attr('data-price-season',b.name).attr('d',priceLine).attr('fill','none').attr('stroke',colors[b.name]).attr('stroke-width',1.9).attr('stroke-linejoin','round').attr('stroke-linecap','round')});
    if(showModel){const modelLine=d3.line().defined(p=>p.m!==null).x(p=>x(date(p.t))).y(p=>y(p.m));for(const isPast of [true,false]){plot.append('path').datum(visible.filter(p=>isPast?p.t<=data.meta.publicationDay:p.t>=data.meta.publicationDay)).attr('data-model',isPast?'before-publication':'after-publication').attr('d',modelLine).attr('fill','none').attr('stroke','#536764').attr('stroke-width',1.4).attr('stroke-dasharray',isPast?'2 5':'6 4').attr('opacity',isPast?.42:.88);}}
    if(showHalvings)data.halvings.filter(h=>h.day>=range[0]&&h.day<=range[1]).forEach(h=>{const hx=x(date(h.day));plot.append('line').attr('data-halving',h.date).attr('x1',hx).attr('x2',hx).attr('y1',bounds.t).attr('y2',height-bounds.b).attr('stroke','#47715b').attr('stroke-width',1).attr('stroke-dasharray','4 4');svg.append('text').attr('x',hx).attr('y',bounds.t-29).attr('text-anchor','middle').attr('fill','#315c46').attr('font-size',compact?9:10).text(h.date.slice(0,4)+(compact?'':' 减半'))});
    const lastInView=visible.findLast(p=>p.p!==null);plot.append('circle').attr('cx',x(date(lastInView.t))).attr('cy',y(lastInView.p)).attr('r',3).attr('fill',colors[inBand(lastInView.t).name]).attr('stroke','#fff');
    svg.append('text').attr('x',bounds.l).attr('y',height-17).attr('font-size',compact?9:10).attr('fill','#637569')
      .text(calendar ? '每年 1 月 1 日换季 · ' + data.meta.priceThrough + ' 截止 · UTC' : '减半日起算 · 首次减半前为回推标签（*） · UTC');
    crosshair=plot.append('g').attr('class','crosshair').attr('display','none').attr('pointer-events','none');crosshair.append('line').attr('class','cross-line').attr('y1',bounds.t).attr('y2',height-bounds.b).attr('stroke','#4e6757').attr('stroke-width',.8).attr('stroke-dasharray','3 3');crosshair.append('circle').attr('class','price-dot').attr('r',4).attr('stroke','#fff').attr('stroke-width',1.5);crosshair.append('circle').attr('class','model-dot').attr('r',3).attr('fill','#657873').attr('stroke','#fff');
    svg.append('rect').attr('class','hit-target').attr('x',bounds.l).attr('y',bounds.t).attr('width',width-bounds.l-bounds.r).attr('height',height-bounds.t-bounds.b).attr('fill','transparent').style('cursor','crosshair').on('pointermove pointerdown',event=>{const px=d3.pointer(event,svg.node())[0];updateReadout(Math.max(range[0],Math.min(range[1],day(x.invert(px)))))}).on('pointerleave',()=>crosshair.attr('display','none')).on('dblclick',()=>setRange(first,last));
    updateReadout(Math.max(range[0],Math.min(range[1],selected)),true,true);
    inspect.min=iso(range[0]);inspect.max=iso(range[1]);
    from.value=iso(range[0]);to.value=iso(range[1]);setText('#range-label',iso(range[0])+' → '+iso(range[1]));
    document.querySelectorAll('[data-range]').forEach(b=>b.setAttribute('aria-pressed',String(matchesRange(b.dataset.range))));
  }
  function preset(id){return [id==='all'?first:id==='current'?data.halvings.at(-1).day:Math.max(first,last-Math.round(Number(id)*365.25)),last]}
  function matchesRange(id){const p=preset(id);return p[0]===range[0]&&p[1]===range[1]}
  function setRange(a,b,moveBrush=true){a=Math.max(first,Math.round(a));b=Math.min(last,Math.round(b));if(b-a<30){setText('#date-error','请选择至少 30 天的范围。');return;}setText('#date-error','');range=[a,b];selected=b;render();if(moveBrush&&brush){syncing=true;nav.select('.brush').call(brush.move,[navX(date(a)),navX(date(b))]);syncing=false}}
  function navigator(){const w=Math.max(260,document.querySelector('.navigator').clientWidth);nav.attr('viewBox',`0 0 ${w} 82`).attr('width',w);nav.selectAll('*').remove();navX=d3.scaleUtc().domain([date(first),date(last)]).range([12,w-12]);const ny=d3.scaleLog().domain(d3.extent(points,p=>p.p)).range([64,9]);const area=d3.area().defined(p=>p.p>0).x(p=>navX(date(p.t))).y0(66).y1(p=>ny(p.p));nav.append('path').datum(points).attr('d',area).attr('fill','#d4dfcf');nav.append('path').datum(points).attr('d',d3.line().defined(p=>p.p>0).x(p=>navX(date(p.t))).y(p=>ny(p.p))).attr('fill','none').attr('stroke','#627f69').attr('stroke-width',.8);brush=d3.brushX().extent([[12,5],[w-12,71]]).on('end',event=>{if(syncing)return;if(!event.selection){setRange(first,last);return}const selectedRange=event.selection.map(px=>day(navX.invert(px)));if(selectedRange[1]-selectedRange[0]<30){syncing=true;nav.select('.brush').call(brush.move,range.map(t=>navX(date(t))));syncing=false;return}setRange(...selectedRange,false)});nav.append('g').attr('class','brush').call(brush).call(g=>g.selectAll('.selection').attr('fill','#8caf83').attr('fill-opacity',.18).attr('stroke','#507552')).call(g=>g.selectAll('.handle').attr('fill','#4a7050'));syncing=true;nav.select('.brush').call(brush.move,range.map(t=>navX(date(t))));syncing=false;}
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>setRange(...preset(button.dataset.range))));
  for(const input of [from,to])input.addEventListener('change',()=>{const a=Date.parse(from.value+'T00:00:00Z')/DAY,b=Date.parse(to.value+'T00:00:00Z')/DAY;if(!Number.isFinite(a)||!Number.isFinite(b)){setText('#date-error','请填写完整日期。');return;}setRange(a,b)});
  document.querySelector('#reset-range').addEventListener('click',()=>setRange(first,last));
  document.querySelector('#show-model').addEventListener('change',e=>{showModel=e.target.checked;render()});document.querySelector('#show-bands').addEventListener('change',e=>{showBands=e.target.checked;render()});document.querySelector('#show-halvings').addEventListener('change',e=>{showHalvings=e.target.checked;render()});
  svg.on('keydown',event=>{let next;if(event.key==='ArrowLeft')next=selected-(event.shiftKey?30:1);else if(event.key==='ArrowRight')next=selected+(event.shiftKey?30:1);else if(event.key==='Home')next=range[0];else if(event.key==='End')next=range[1];else return;event.preventDefault();updateReadout(Math.max(range[0],Math.min(range[1],next)))});
  inspect.addEventListener('change', () => {
    const entered = inspect.valueAsNumber / DAY;
    if (Number.isInteger(entered) && entered >= range[0] && entered <= range[1]) updateReadout(entered);
    else inspect.value = iso(selected);
  });
  function svgText() {
    render(1200);
    const clone = svg.node().cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    clone.querySelectorAll('.crosshair,.hit-target').forEach(element => element.remove());
    const result = new XMLSerializer().serializeToString(clone);
    render();
    return result;
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000)}
  document.querySelector('#history-export-svg').addEventListener('click',()=>{download(new Blob([svgText()],{type:'image/svg+xml;charset=utf-8'}),`bitcoin-full-history-${BitcoinSeasons.route().rule}-${iso(range[0])}-${iso(range[1])}.svg`);setText('#history-export-status','已导出当前显示范围的 SVG。')});
  document.querySelector('#history-export-png').addEventListener('click', async () => {
    const button = document.querySelector('#history-export-png');
    const filename = 'bitcoin-full-history-' + BitcoinSeasons.route().rule + '-' + iso(range[0]) + '-' + iso(range[1]) + '.png';
    button.disabled = true;
    setText('#history-export-status','正在生成高清图…');
    const url = URL.createObjectURL(new Blob([svgText()], {type:'image/svg+xml;charset=utf-8'}));
    try {
      const image = new Image();
      await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=reject; image.src=url; });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth * 3; canvas.height = image.naturalHeight * 3;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if (!blob) throw Error('PNG export failed');
      download(blob,filename);
      setText('#history-export-status','已导出 ' + canvas.width + ' × ' + canvas.height + ' 高清图。');
    } catch {
      setText('#history-export-status','PNG 导出失败，可以下载 SVG。');
    } finally {
      button.disabled = false; URL.revokeObjectURL(url);
    }
  });
  function refresh() {
    if (!host.clientWidth) return;
    render();
    navigator();
  }
  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 75);
  }).observe(host);
  document.addEventListener('bitcoin-data-change', () => {
    const previousLast = last;
    const rangeId = ['all','10','5','current'].find(matchesRange);
    data = window.BTC_HISTORY;
    last = data.points.at(-1)[0];
    points = data.points.map(([t,p,m]) => ({t,p,m}));
    naturalBands = BitcoinSeasons.calendarBands(first, last + 1);
    if (rangeId) range = preset(rangeId);
    else if (range[1] === previousLast) range = [range[0], last];
    if (selected === previousLast) selected = last;
    describeSnapshot();
    refresh();
  });
  document.addEventListener('season-view-change', refresh);
})();
