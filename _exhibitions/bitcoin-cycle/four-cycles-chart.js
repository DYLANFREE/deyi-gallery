(() => {
  'use strict';
  const data = window.BTC_HISTORY, model = window.BitcoinCycleModel, d3 = window.d3;
  const host = document.querySelector('#chart-scroll');
  if (!data || !model || !d3) {
    host.innerHTML = '<p class="error">图表资源未加载，请刷新页面重试。</p>';
    return;
  }
  const cycles = model.buildCycles(data), active = new Set(cycles.map(cycle => cycle.year));
  const svg = d3.select('#cycles-svg'), bounds = {l:61,r:25,t:49,b:67};
  const end = Math.max(...cycles.map(cycle => cycle.endDay - cycle.halving.day));
  const latest = cycles.at(-1).points.at(-1).offset;
  const values = cycles.flatMap(cycle => cycle.points.map(point => point.multiple));
  const domain = [Math.min(.5,Math.min(...values)*.9),Math.max(100,Math.max(...values)*1.12)];
  let width, height, x, y, cursor, selected = latest;
  const setText = (selector,value) => { document.querySelector(selector).textContent = value; };
  const multiple = value => value.toFixed(2) + ' ×';

  // Build the legend and readouts once; resizing never changes the user's selection.
  for (const cycle of cycles) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.cycle = cycle.year;
    button.style.setProperty('--cycle-color',cycle.color);
    button.setAttribute('aria-pressed','true');
    button.innerHTML = '<i class="swatch"></i><span>' + cycle.year + (cycle.complete ? '' : ' · 本轮') + '</span>';
    button.addEventListener('click',() => {
      if (active.has(cycle.year) && active.size > 1) active.delete(cycle.year);
      else active.add(cycle.year);
      syncLegend(); render();
    });
    document.querySelector('#cycle-legend').insertBefore(button,document.querySelector('.legend .hint'));
    const readout = document.createElement('div');
    readout.className = 'cycle-readout';
    readout.dataset.readCycle = cycle.year;
    readout.style.setProperty('--cycle-color',cycle.color);
    readout.innerHTML = '<span class="label">' + cycle.year + (cycle.complete ? ' 轮' : ' 轮 · 进行中') + '</span><strong></strong><time></time>';
    document.querySelector('#cycle-readouts').append(readout);
    const row = document.createElement('tr');
    row.innerHTML = '<th scope="row">' + cycle.year + '</th>' + cycle.seasons.map(season =>
      '<td><time datetime="' + model.iso(season.start) + '">' + model.iso(season.start) + '</time>' +
      (season.end === null ? '<span>至下次实际减半前</span>' :
        '<time datetime="' + model.iso(season.end-1) + '">' + model.iso(season.end-1) + '</time>') + '</td>').join('');
    document.querySelector('#season-dates').append(row);
  }
  function syncLegend() {
    document.querySelectorAll('[data-cycle]').forEach(button => {
      const enabled = active.has(button.dataset.cycle);
      button.setAttribute('aria-pressed',String(enabled));
      button.disabled = enabled && active.size === 1;
    });
  }

  function read(offset,draw=true) {
    selected = Math.max(0,Math.min(end,Math.round(offset)));
    setText('#read-offset','减半后第 ' + selected + ' 天 · ' + model.seasonAt(selected) + '季');
    for (const cycle of cycles) {
      const element = document.querySelector('[data-read-cycle="' + cycle.year + '"]');
      element.setAttribute('aria-hidden',String(!active.has(cycle.year)));
      const point = model.pointAt(cycle,selected), value = element.querySelector('strong'), time = element.querySelector('time');
      value.className = point ? '' : 'ended';
      value.textContent = point ? multiple(point.multiple) : cycle.complete ? '该轮已结束' : '尚无数据';
      time.textContent = point ? model.iso(point.day) : '截至 ' + model.iso(cycle.points.at(-1).day);
      time.dateTime = model.iso(point?.day ?? cycle.points.at(-1).day);
    }
    if (!draw || !cursor) return;
    cursor.attr('display',null);
    cursor.select('line').attr('x1',x(selected)).attr('x2',x(selected));
    cursor.selectAll('circle').remove();
    for (const cycle of cycles.filter(cycle => active.has(cycle.year))) {
      const point = model.pointAt(cycle,selected);
      if (point) cursor.append('circle').attr('cx',x(selected)).attr('cy',y(point.multiple))
        .attr('r',4).attr('fill',cycle.color).attr('stroke','#fff').attr('stroke-width',1.5);
    }
  }

  function render(exportWidth) {
    width = exportWidth || Math.max(280,Math.round(host.clientWidth));
    const compact = width < 650;
    height = compact ? 370 : 506;
    bounds.l = compact ? 40 : 61;
    bounds.r = compact ? 15 : 25;
    const bottom = height-bounds.b, right = width-bounds.r;
    x = d3.scaleLinear().domain([0,end]).range([bounds.l,right]);
    y = d3.scaleLog().domain(domain).range([bottom,bounds.t]);
    svg.attr('width',width).attr('height',height).attr('viewBox','0 0 '+width+' '+height)
      .attr('font-family','PingFang SC, Microsoft YaHei, sans-serif').attr('font-size',11);
    svg.selectAll('*').remove();
    svg.append('title').text('四轮比特币减半周期，统一从减半日进入夏季');
    svg.append('desc').text('日收盘价除以各轮减半日价格。历史轮止于下次实际减半前一日，本轮价格截至 '+data.meta.priceThrough+'。方向键逐日查看。');
    svg.append('rect').attr('width',width).attr('height',height).attr('fill','#fff');
    const plot = svg.append('g');
    for (const season of model.seasons) {
      const stop = Math.min(season.end ?? end,end);
      plot.append('rect').attr('data-season',season.name).attr('data-start',season.start).attr('data-end',stop)
        .attr('x',x(season.start)).attr('y',bounds.t).attr('width',x(stop)-x(season.start))
        .attr('height',bottom-bounds.t).attr('fill',season.fill).attr('opacity',.65);
      svg.append('rect').attr('x',x(season.start)).attr('y',14).attr('width',x(stop)-x(season.start))
        .attr('height',24).attr('fill',season.fill);
      svg.append('text').attr('x',(x(stop)+x(season.start))/2).attr('y',30).attr('text-anchor','middle')
        .attr('font-size',12).attr('fill',season.color).text(season.name+(season.name==='春'&&!compact?' · 至下次减半':''));
    }
    const ticks = [.5,1,2,5,10,20,50,100].filter(value=>value>=domain[0]&&value<=domain[1]);
    plot.selectAll('.grid').data(ticks).join('line').attr('class','grid')
      .attr('x1',bounds.l).attr('x2',right).attr('y1',y).attr('y2',y)
      .attr('stroke',value=>value===1?'#779384':'#cbd5cd').attr('stroke-width',value=>value===1?1:.65)
      .attr('stroke-dasharray',value=>value===1?'4 4':null);
    svg.append('g').attr('transform','translate('+bounds.l+',0)')
      .call(d3.axisLeft(y).tickValues(ticks).tickFormat(value=>value+'×').tickSize(0).tickPadding(compact?7:10))
      .call(group=>group.select('.domain').remove()).call(group=>group.selectAll('text').attr('fill','#64766c'));
    svg.append('g').attr('transform','translate(0,'+bottom+')')
      .call(d3.axisBottom(x).tickValues([0,365,730,1095,end]).tickFormat(value=>value===0?'减半日':value+' 天').tickSize(0).tickPadding(13))
      .call(group=>group.select('.domain').attr('stroke','#acbab0'))
      .call(group=>group.selectAll('text').attr('fill','#64766c').attr('font-size',compact?9:11))
      .call(group=>group.select('.tick:last-child text').attr('text-anchor','end'));
    const line = d3.line().defined(point=>point.multiple>0).x(point=>x(point.offset)).y(point=>y(point.multiple));
    for (const cycle of cycles.filter(cycle=>active.has(cycle.year))) {
      plot.append('path').datum(cycle.points).attr('class','cycle-line').attr('data-year',cycle.year)
        .attr('data-last-offset',cycle.points.at(-1).offset).attr('d',line).attr('fill','none')
        .attr('stroke',cycle.color).attr('stroke-width',cycle.complete?1.8:2.4)
        .attr('stroke-dasharray',cycle.complete?null:'6 3').attr('stroke-linejoin','round').attr('stroke-linecap','round');
      const last = cycle.points.at(-1);
      plot.append('circle').attr('cx',x(last.offset)).attr('cy',y(last.multiple)).attr('r',3)
        .attr('fill',cycle.color).attr('stroke','#fff');
    }
    svg.append('text').attr('x',bounds.l).attr('y',height-25).attr('font-size',10).attr('fill','#6c7b72')
      .text(compact?'减半日价格 = 1 倍 · 对数纵轴':'减半日价格 = 1 倍 · 对数纵轴 · 夏、秋、冬各 365 天，春至下次实际减半');
    svg.append('text').attr('x',bounds.l).attr('y',height-8).attr('font-size',10).attr('fill','#849086')
      .text(compact?'日线至 '+data.meta.priceThrough+' · Coin Metrics':'Coin Metrics · UTC 日收盘 · 截至 '+data.meta.priceThrough+' · 不外推未来价格');
    cursor = plot.append('g').attr('class','crosshair').attr('pointer-events','none');
    cursor.append('line').attr('y1',bounds.t).attr('y2',bottom).attr('stroke','#657c6e').attr('stroke-width',.8).attr('stroke-dasharray','3 3');
    svg.append('rect').attr('class','hit-target').attr('x',bounds.l).attr('y',bounds.t).attr('width',right-bounds.l)
      .attr('height',bottom-bounds.t).attr('fill','transparent').style('cursor','crosshair')
      .on('pointermove pointerdown',event=>read(x.invert(d3.pointer(event,svg.node())[0])))
      .on('pointerleave',()=>cursor.attr('display','none'));
    read(selected);
  }
  svg.on('keydown',event=>{
    let offset;
    if (event.key==='ArrowLeft') offset=selected-(event.shiftKey?30:1);
    else if (event.key==='ArrowRight') offset=selected+(event.shiftKey?30:1);
    else if (event.key==='Home') offset=0;
    else if (event.key==='End') offset=end;
    else return;
    event.preventDefault(); read(offset);
    const px=x(selected);
    if(px<host.scrollLeft+30||px>host.scrollLeft+host.clientWidth-30)host.scrollLeft=Math.max(0,px-host.clientWidth/2);
  });

  function svgText() {
    // Export the same selection at full size, independent of the reader's screen.
    render(1200);
    const clone=svg.node().cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    clone.setAttribute('height',height+76);
    clone.setAttribute('viewBox','0 -76 '+width+' '+(height+76));
    clone.querySelectorAll('.crosshair,.hit-target').forEach(element=>element.remove());
    const exportSvg=d3.select(clone);
    exportSvg.insert('rect',':first-child').attr('x',0).attr('y',-76).attr('width',width).attr('height',height+76).attr('fill','#fff');
    exportSvg.append('text').attr('x',bounds.l).attr('y',-43).attr('font-size',22).attr('font-weight',550).attr('fill','#243b36')
      .text('减半后，价格真的走同一条路吗？');
    cycles.filter(cycle=>active.has(cycle.year)).forEach((cycle,index)=>{
      const left=bounds.l+index*160;
      exportSvg.append('line').attr('x1',left).attr('x2',left+22).attr('y1',-16).attr('y2',-16)
        .attr('stroke',cycle.color).attr('stroke-width',2).attr('stroke-dasharray',cycle.complete?null:'6 3');
      exportSvg.append('text').attr('x',left+29).attr('y',-12).attr('font-size',11).attr('fill','#63756b')
        .text(cycle.year+(cycle.complete?' 轮':' 轮 · 进行中'));
    });
    const serialized=new XMLSerializer().serializeToString(clone);
    render();
    return serialized;
  }
  function download(blob,extension) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='bitcoin-four-cycles-'+data.meta.priceThrough+'.'+extension;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  document.querySelector('#export-svg').addEventListener('click',()=>{
    download(new Blob([svgText()],{type:'image/svg+xml;charset=utf-8'}),'svg');
    setText('#export-status','已导出当前可见曲线的 SVG。');
  });
  document.querySelector('#export-png').addEventListener('click',async()=>{
    const button=document.querySelector('#export-png');button.disabled=true;
    setText('#export-status','正在生成高清图…');
    const url=URL.createObjectURL(new Blob([svgText()],{type:'image/svg+xml;charset=utf-8'}));
    try {
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth*3;canvas.height=image.naturalHeight*3;
      const context=canvas.getContext('2d');context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Canvas export failed');
      download(blob,'png');setText('#export-status','已导出 '+canvas.width+' × '+canvas.height+' 高清图。');
    } catch {
      setText('#export-status','PNG 导出失败，仍可下载 SVG。');
    } finally {
      button.disabled=false;URL.revokeObjectURL(url);
    }
  });
  let timer;
  new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(render,100);}).observe(host);
  const sendHeight=()=>parent.postMessage({type:'btc-cycles-height',height:Math.ceil(document.body.getBoundingClientRect().height)},location.protocol==='file:'?'*':location.origin);
  new ResizeObserver(sendHeight).observe(document.body);
  syncLegend();render();sendHeight();
})();
