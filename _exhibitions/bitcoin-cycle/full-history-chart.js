(() => {
  'use strict';
  const data=window.BTC_HISTORY;
  if(!window.d3||!data){document.querySelector('#chart-scroll').innerHTML='<p class="error">图表资源尚未加载。请重新打开本地预览。</p>';return;}
  const DAY=86400000,first=data.points[0][0],last=data.points.at(-1)[0];
  const iso=day=>new Date(day*DAY).toISOString().slice(0,10),date=day=>new Date(day*DAY),day=value=>Math.round(Number(value)/DAY);
  const money=value=>value==null?'—':value<1?'$'+value.toFixed(4):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
  const colors={夏:'#bd902f',秋:'#c46035',冬:'#387fa5',春:'#408b5b'},fills={夏:'#fbf3d6',秋:'#fae5d8',冬:'#e2edf7',春:'#e3f1e5'};
  const points=data.points.map(([t,p,m])=>({t,p,m}));
  const svg=d3.select('#history-svg'),nav=d3.select('#navigator-svg');
  const host=document.querySelector('#chart-scroll'),from=document.querySelector('#date-from'),to=document.querySelector('#date-to');
  let range=[first,last],showModel=true,showBands=true,showHalvings=true,width=1200,height=572,x,y,crosshair,selected=last,syncing=false,brush,navX;
  const bounds={l:77,r:32,t:107,b:79};
  const byTime=d3.bisector(p=>p.t).center;
  const inBand=t=>data.bands.find(b=>t>=b.start&&t<b.end);
  const setText=(id,value)=>{document.querySelector(id).textContent=value};
  const labelPrice=n=>n>=1e6?'$'+(n/1e6)+'百万':n>=1e4?'$'+(n/1e4)+'万':n>=1000?'$'+(n/1000)+'千':'$'+n;
  from.min=to.min=iso(first);from.max=to.max=iso(last);
  setText('#data-period',`${data.meta.start} — ${data.meta.priceThrough} · BTC / USD · UTC 日收盘 · 对数价格轴`);
  setText('#cutoff-note',`全景在 ${data.meta.preparedAt} 核对更新，价格截至 ${data.meta.priceThrough}，S2F 复算截至 ${data.meta.modelThrough}。最新价格日的链上存量尚缺，模型停在最后完整日，不向前补值。四轮周期共用同一份日价格。`);

  function updateReadout(t,draw=true){
    const nearest=points[Math.max(0,Math.min(points.length-1,byTime(points,t)))];selected=nearest.t;
    const band=inBand(selected);
    setText('#read-date',iso(selected));setText('#read-price',money(nearest.p));setText('#read-model',showModel?money(nearest.m):'已隐藏');setText('#read-season',band?band.name+'季':'未定义');
    setText('#read-status',band?.inferred?'首次减半前 · 回推标签':`距 ${band?.anchor} 减半 ${selected-(data.halvings.find(h=>h.date===band?.anchor)?.day??selected)} 天`);
    if(!draw||!crosshair)return;
    crosshair.attr('display',null);const px=x(date(selected));
    crosshair.select('.cross-line').attr('x1',px).attr('x2',px);
    crosshair.select('.price-dot').attr('cx',px).attr('cy',y(nearest.p)).attr('fill',colors[band?.name]||'#355a42');
    crosshair.select('.model-dot').attr('display',showModel&&nearest.m!==null?null:'none').attr('cx',px).attr('cy',nearest.m!==null?y(nearest.m):bounds.t);
  }

  function render(){
    width=Math.max(1100,Math.round(host.clientWidth));
    svg.attr('width',width).attr('height',height).attr('viewBox',`0 0 ${width} ${height}`).attr('font-family','PingFang SC, Microsoft YaHei, sans-serif').attr('font-size',12);
    svg.selectAll('*').remove();
    svg.append('rect').attr('width',width).attr('height',height).attr('fill','#fff');
    svg.append('text').attr('x',bounds.l).attr('y',28).attr('font-size',19).attr('font-weight',550).attr('fill','#253e35').text(`比特币价格与春夏秋冬 · ${iso(range[0]).slice(0,4)}—${iso(range[1]).slice(0,4)}`);
    svg.append('text').attr('x',bounds.l).attr('y',49).attr('font-size',10).attr('fill','#6c7b72').text(`BTC/USD 日收盘 · 价格至 ${data.meta.priceThrough} · S2F 至 ${data.meta.modelThrough} · 四季为时间标签`);
    svg.append('line').attr('x1',width-283).attr('x2',width-259).attr('y1',24).attr('y2',24).attr('stroke','#408b5b').attr('stroke-width',2);
    svg.append('text').attr('x',width-251).attr('y',28).attr('font-size',10).attr('fill','#53665a').text('BTC 实际价格');
    if(showModel){svg.append('line').attr('x1',width-148).attr('x2',width-124).attr('y1',24).attr('y2',24).attr('stroke','#536764').attr('stroke-width',1.5).attr('stroke-dasharray','6 4');svg.append('text').attr('x',width-117).attr('y',28).attr('font-size',10).attr('fill','#53665a').text('S2F 复算');}
    const visible=points.filter(p=>p.t>=range[0]&&p.t<=range[1]),values=visible.flatMap(p=>showModel?[p.p,p.m]:[p.p]).filter(v=>v>0);
    const low=Math.min(...values),high=Math.max(...values);
    x=d3.scaleUtc().domain([date(range[0]),date(range[1])]).range([bounds.l,width-bounds.r]);
    y=d3.scaleLog().domain([10**(Math.floor(Math.log10(low))-.1),10**(Math.ceil(Math.log10(high))+.06)]).range([height-bounds.b,bounds.t]);
    const defs=svg.append('defs');defs.append('clipPath').attr('id','history-clip').append('rect').attr('x',bounds.l).attr('y',bounds.t).attr('width',width-bounds.l-bounds.r).attr('height',height-bounds.t-bounds.b);
    const pattern=defs.append('pattern').attr('id','history-inferred').attr('patternUnits','userSpaceOnUse').attr('width',8).attr('height',8);pattern.append('path').attr('d','M-1 1L1 -1M0 8L8 0M7 9L9 7').attr('stroke','#526b67').attr('stroke-width',.65).attr('opacity',.2);
    const plot=svg.append('g').attr('clip-path','url(#history-clip)');
    data.bands.filter(b=>b.end>range[0]&&b.start<=range[1]).forEach(b=>{
      const a=Math.max(range[0],b.start),z=Math.min(range[1],b.end),left=x(date(a)),right=x(date(z)),bw=right-left;
      if(showBands){plot.append('rect').attr('data-season',b.name).attr('data-start',iso(b.start)).attr('data-inferred',String(b.inferred)).attr('x',left).attr('y',bounds.t).attr('width',Math.max(0,bw)).attr('height',height-bounds.t-bounds.b).attr('fill',fills[b.name]).attr('opacity',.74);if(b.inferred)plot.append('rect').attr('x',left).attr('y',bounds.t).attr('width',Math.max(0,bw)).attr('height',height-bounds.t-bounds.b).attr('fill','url(#history-inferred)');}
      svg.append('rect').attr('x',left).attr('y',bounds.t-23).attr('width',Math.max(0,bw)).attr('height',18).attr('fill',fills[b.name]);
      if(bw>22)svg.append('text').attr('x',(left+right)/2).attr('y',bounds.t-10).attr('text-anchor','middle').attr('font-size',bw<43?10:12).attr('fill',colors[b.name]).attr('font-weight',500).text(b.name+(b.inferred?'*':''));
    });
    const ticks=[];for(let n=Math.floor(Math.log10(low));n<=Math.ceil(Math.log10(high));n++)ticks.push(10**n);
    plot.selectAll('.grid').data(ticks).join('line').attr('class','grid').attr('x1',bounds.l).attr('x2',width-bounds.r).attr('y1',y).attr('y2',y).attr('stroke','#ccd6ce').attr('stroke-width',.65).attr('opacity',.8);
    svg.append('g').attr('transform',`translate(${bounds.l},0)`).call(d3.axisLeft(y).tickValues(ticks).tickFormat(labelPrice).tickSize(0).tickPadding(11)).call(g=>g.select('.domain').remove()).call(g=>g.selectAll('text').attr('fill','#64766c').attr('font-size',11));
    const years=(range[1]-range[0])/365.25;
    const xa=d3.axisBottom(x).ticks(years>7?d3.utcYear.every(1):years>2?d3.utcMonth.every(6):d3.utcMonth.every(3)).tickFormat(d3.utcFormat(years>7?'%Y':'%Y-%m')).tickSize(0).tickPadding(13);
    svg.append('g').attr('transform',`translate(0,${height-bounds.b})`).call(xa).call(g=>g.select('.domain').attr('stroke','#acbab0')).call(g=>g.selectAll('text').attr('fill','#64766c').attr('font-size',11));
    const priceLine=d3.line().defined(p=>p.p!==null).x(p=>x(date(p.t))).y(p=>y(p.p));
    plot.append('path').datum(visible).attr('d',priceLine).attr('fill','none').attr('stroke','#34483c').attr('stroke-width',.9);
    data.bands.forEach(b=>{const subset=visible.filter(p=>p.t>=b.start&&p.t<=b.end);if(subset.length>1)plot.append('path').datum(subset).attr('data-price-season',b.name).attr('d',priceLine).attr('fill','none').attr('stroke',colors[b.name]).attr('stroke-width',1.9).attr('stroke-linejoin','round').attr('stroke-linecap','round')});
    if(showModel){const modelLine=d3.line().defined(p=>p.m!==null).x(p=>x(date(p.t))).y(p=>y(p.m));for(const isPast of [true,false]){plot.append('path').datum(visible.filter(p=>isPast?p.t<=data.meta.publicationDay:p.t>=data.meta.publicationDay)).attr('data-model',isPast?'before-publication':'after-publication').attr('d',modelLine).attr('fill','none').attr('stroke','#536764').attr('stroke-width',1.4).attr('stroke-dasharray',isPast?'2 5':'6 4').attr('opacity',isPast?.42:.88);}}
    if(showHalvings)data.halvings.filter(h=>h.day>=range[0]&&h.day<=range[1]).forEach(h=>{const hx=x(date(h.day));plot.append('line').attr('data-halving',h.date).attr('x1',hx).attr('x2',hx).attr('y1',bounds.t).attr('y2',height-bounds.b).attr('stroke','#47715b').attr('stroke-width',1).attr('stroke-dasharray','4 4');svg.append('text').attr('x',hx).attr('y',72).attr('text-anchor','middle').attr('fill','#315c46').attr('font-size',10).text(h.date.slice(0,4)+' 减半')});
    const lastInView=visible.findLast(p=>p.p!==null);plot.append('circle').attr('cx',x(date(lastInView.t))).attr('cy',y(lastInView.p)).attr('r',3).attr('fill',colors[inBand(lastInView.t).name]).attr('stroke','#fff');
    svg.append('text').attr('x',bounds.l).attr('y',height-31).attr('font-size',10).attr('fill','#748279').text('Coin Metrics · USD 日收盘（对数）｜2012 年首次减半之前为回推标签（*）｜不外推未来价格');
    svg.append('text').attr('x',bounds.l).attr('y',height-13).attr('font-size',9).attr('fill','#849086').text('夏、秋、冬各365天，春延续至下次实际减半；S2F为2019系数／365日供给复算，模型线非必达价格。');
    crosshair=plot.append('g').attr('class','crosshair').attr('display','none').attr('pointer-events','none');crosshair.append('line').attr('class','cross-line').attr('y1',bounds.t).attr('y2',height-bounds.b).attr('stroke','#4e6757').attr('stroke-width',.8).attr('stroke-dasharray','3 3');crosshair.append('circle').attr('class','price-dot').attr('r',4).attr('stroke','#fff').attr('stroke-width',1.5);crosshair.append('circle').attr('class','model-dot').attr('r',3).attr('fill','#657873').attr('stroke','#fff');
    svg.append('rect').attr('class','hit-target').attr('x',bounds.l).attr('y',bounds.t).attr('width',width-bounds.l-bounds.r).attr('height',height-bounds.t-bounds.b).attr('fill','transparent').style('cursor','crosshair').on('pointermove pointerdown',event=>{const px=d3.pointer(event,svg.node())[0];updateReadout(Math.max(range[0],Math.min(range[1],day(x.invert(px)))))}).on('pointerleave',()=>crosshair.attr('display','none')).on('dblclick',()=>setRange(first,last));
    updateReadout(Math.max(range[0],Math.min(range[1],selected)),false);
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
  function svgText(){const clone=svg.node().cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.querySelectorAll('.crosshair,.hit-target').forEach(el=>el.remove());return new XMLSerializer().serializeToString(clone)}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000)}
  document.querySelector('#export-svg').addEventListener('click',()=>{download(new Blob([svgText()],{type:'image/svg+xml;charset=utf-8'}),`bitcoin-four-seasons-${iso(range[0])}-${iso(range[1])}.svg`);setText('#export-status','已导出当前显示范围的 SVG。')});
  document.querySelector('#export-png').addEventListener('click',async()=>{const button=document.querySelector('#export-png');button.disabled=true;setText('#export-status','正在生成高清图…');const url=URL.createObjectURL(new Blob([svgText()],{type:'image/svg+xml;charset=utf-8'}));try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});const canvas=document.createElement('canvas');canvas.width=Math.round(width*3);canvas.height=height*3;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Canvas export failed');download(blob,`bitcoin-four-seasons-${iso(range[0])}-${iso(range[1])}.png`);setText('#export-status',`已导出 ${canvas.width} × ${canvas.height} 高清图。`)}catch{setText('#export-status','PNG 导出暂时失败，仍可下载 SVG。')}finally{button.disabled=false;URL.revokeObjectURL(url)}});
  let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{render();navigator()},120)}).observe(host);
  render();navigator();
  const sendHeight=()=>parent.postMessage({type:'btc-history-height',height:document.documentElement.scrollHeight},location.protocol==='file:'?'*':location.origin);
  new ResizeObserver(sendHeight).observe(document.body);sendHeight();
})();
