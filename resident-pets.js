(()=>{'use strict';
// 木火水小人：在页面底部空白处走动，随机飘出她们真实说过的话。
// 数据只来自同桌 feed（真实原话）；取不到就安静走路，不编台词。
// 预览页可先设 window.RESIDENT_PETS_QUOTES=[{resident,body}] 跳过取数。
if(matchMedia('(max-width: 880px)').matches)return;
function scriptBase(){
  try{const src=document.currentScript?.src||'';const u=new URL(src||location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
  catch{const u=new URL(location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
}
const base=scriptBase();
const PEOPLE={
  wood:{name:'小木',image:base+'images/residents/wood.webp',color:'#3d6b52'},
  fire:{name:'小火',image:base+'images/residents/fire.webp',color:'#c2622a'},
  water:{name:'小水',image:base+'images/residents/water.webp',color:'#3a6ea5'},
};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIZE=44,MARGIN=10,LANES=[4,48,92];
const quotes={wood:[],fire:[],water:[]};
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function loadFeed(raw){
  if(raw?.format!=='deyi-shared-tables-v1'||!Array.isArray(raw.tables))return;
  for(const t of raw.tables)for(const m of t.messages||[]){
    if(PEOPLE[m.resident]&&typeof m.body==='string'&&m.body.trim())quotes[m.resident].push(m.body.trim());
  }
}
if(Array.isArray(window.RESIDENT_PETS_QUOTES)){for(const q of window.RESIDENT_PETS_QUOTES){if(PEOPLE[q.resident]&&typeof q.body==='string'&&q.body.trim())quotes[q.resident].push(q.body.trim());}}
else{
  const endpoint=document.querySelector('meta[name="resident-table-feed"]')?.content||'https://45.134.36.23/api/residents/tables';
  let url=null;try{const u=new URL(endpoint,location.href);if(u.protocol==='https:'&&u.hostname==='45.134.36.23')url=u;}catch{}
  if(url){
    const refresh=async()=>{try{const r=await fetch(url.href,{credentials:'omit',cache:'no-cache',signal:AbortSignal.timeout(9000)});if(r.ok)loadFeed(await r.json());}catch{}setTimeout(refresh,10*60*1000);};
    setTimeout(refresh,1500);
  }
}
const layer=document.createElement('div');layer.className='rp-layer';layer.setAttribute('aria-hidden','true');
const pets=Object.entries(PEOPLE).map(([id,p])=>{
  const el=document.createElement('div');el.className='rp-pet';el.style.setProperty('--c',p.color);
  const img=document.createElement('img');img.src=p.image;img.alt='';img.width=SIZE;img.height=SIZE;img.draggable=false;
  const bubble=document.createElement('div');bubble.className='rp-bubble';bubble.hidden=true;
  el.append(img,bubble);layer.append(el);
  return{id,...p,el,bubble,x:0,dir:1,speed:0,state:'walk',next:0,until:0,speakUntil:0,bag:[]};
});
document.body.append(layer);
let vw=innerWidth;addEventListener('resize',()=>{vw=innerWidth;for(const p of pets)p.x=Math.min(p.x,vw-SIZE-MARGIN);});
function nextLine(p){if(!p.bag.length)p.bag=shuffle(quotes[p.id].slice());return p.bag.pop()||null;}
function speak(p){
  const line=nextLine(p);if(!line){p.next=performance.now()+8000;return;}
  p.state='speak';p.bubble.textContent=Array.from(line).slice(0,64).join('')+(Array.from(line).length>64?'…':'');
  p.bubble.hidden=false;p.speakUntil=performance.now()+6200+Math.random()*1800;
}
pets.forEach((p,i)=>{
  p.lane=LANES[i];p.x=vw*0.12*(i+1)+Math.random()*60;p.dir=Math.random()<0.5?-1:1;
  p.speed=16+Math.random()*14;p.next=performance.now()+6000+Math.random()*16000;
});
let last=performance.now();
function tick(now){
  const dt=Math.min(50,now-last);last=now;
  for(const p of pets){
    p.el.style.bottom=p.lane+'px';
    if(p.state==='speak'){
      p.el.style.transform=`translateX(${p.x}px)`;
      if(now>p.speakUntil){p.bubble.hidden=true;p.state='walk';p.next=performance.now()+8000+Math.random()*14000;}
    }else if(p.state==='pause'){
      p.el.style.transform=`translateX(${p.x}px)`;
      if(now>p.until)p.state='walk';
    }else{
      const bob=Math.sin(now/260+p.lane)*2.5;
      p.el.style.transform=`translateX(${p.x}px) translateY(${bob}px)`;
      if(!reduced){
        p.x+=p.dir*p.speed*dt/1000;
        if(p.x<=0){p.x=0;p.dir=1;}else if(p.x>=vw-SIZE-MARGIN){p.x=vw-SIZE-MARGIN;p.dir=-1;}
        if(Math.random()<0.003){p.state='pause';p.until=performance.now()+2200+Math.random()*3800;}
      }
    }
    if(p.state==='walk'&&now>p.next){if(quotes[p.id].length)speak(p);else p.next=performance.now()+15000;}
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
})();
