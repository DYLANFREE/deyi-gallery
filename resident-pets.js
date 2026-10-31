(()=>{'use strict';
// 木火水小人：在页面底部空白处走动，随机飘出她们真实说过的话。
// 数据只来自同桌 feed（真实原话）；取不到就安静走路，不编台词。
// 人物：直接用 images/residents/<id>.webp 做小人卡（圆角+投影+走路摇摆的3D感）。
// 多套衣服：按心情切换，命名约定 images/residents/<id>-<mood>.webp（如 wood-happy.webp），
// 俊后续加图即可自动生效；缺哪套自动落回默认图。页面可设 window.RESIDENT_PETS_OUTFITS 覆盖。
// 休息提醒：页面停留满 REST_AFTER_MS 后，小木走到中间放大提醒一次；此后每 REST_EVERY_MS 提醒一次。
// 预览页可先设 window.RESIDENT_PETS_QUOTES=[{resident,body}] 跳过取数。
if(matchMedia('(max-width: 880px)').matches)return;
function scriptBase(){
  try{const src=document.currentScript?.src||'';const u=new URL(src||location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
  catch{const u=new URL(location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
}
const base=scriptBase();
const PEOPLE={
  wood:{name:'小木',image:base+'images/residents/wood.webp',color:'#3d6b52',rest:'俊哥，坐得有点久了。起来走走，喝口水，我在这儿呢。'},
  fire:{name:'小火',image:base+'images/residents/fire.webp',color:'#c2622a',rest:'喂，眼睛都直了。站起来活动一下，别把身子熬坏了。'},
  water:{name:'小水',image:base+'images/residents/water.webp',color:'#3a6ea5',rest:'该歇口气啦。起来伸个懒腰，回来再继续。'},
};
const MOODS=['happy','quiet']; // 心情→衣服命名；缺图自动落回默认
const FAST=new URLSearchParams(location.search).has('pets-fast'); // 测试钩子：短计时看休息提醒
const REST_AFTER_MS=FAST?14*1000:30*60*1000, REST_EVERY_MS=FAST?25*1000:45*60*1000, REST_DURATION_MS=FAST?9*1000:20*1000;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIZES={wood:76,fire:68,water:60}; // 三车道近大远小，出3D纵深感
const MARGIN=12,LANES={wood:6,fire:54,water:100};
const quotes={wood:[],fire:[],water:[]};
const outfits={wood:{},fire:{},water:{}};
Object.keys(PEOPLE).forEach(id=>{for(const mood of MOODS){outfits[id][mood]=base+'images/residents/'+id+'-'+mood+'.webp';}});
if(window.RESIDENT_PETS_OUTFITS){for(const id of Object.keys(outfits)){if(window.RESIDENT_PETS_OUTFITS[id])Object.assign(outfits[id],window.RESIDENT_PETS_OUTFITS[id]);}}
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
  const figure=document.createElement('div');figure.className='rp-figure';
  const img=document.createElement('img');img.alt='';img.width=144;img.height=144;img.draggable=false;img.src=p.image;
  img.addEventListener('error',()=>{if(img.src!==p.image)img.src=p.image;},{once:false});
  const shadow=document.createElement('div');shadow.className='rp-shadow';
  const bubble=document.createElement('div');bubble.className='rp-bubble';bubble.hidden=true;
  figure.append(img);el.append(figure,shadow,bubble);layer.append(el);
  return{id,...p,el,figure,img,shadow,bubble,x:0,dir:1,speed:0,state:'walk',next:0,until:0,speakUntil:0,restUntil:0,bag:[],mood:'normal',moodNext:0};
});
document.body.append(layer);
let vw=innerWidth;addEventListener('resize',()=>{vw=innerWidth;for(const p of pets)p.x=Math.min(p.x,vw-SIZES[p.id]-MARGIN);});
pets.forEach(p=>{p.el.style.width=SIZES[p.id]+'px';p.el.style.height=SIZES[p.id]+'px';});
function nextLine(p){if(!p.bag.length)p.bag=shuffle(quotes[p.id].slice());return p.bag.pop()||null;}
function layoutBubble(p){
  // 气泡按内容定宽，同时保证不超出屏幕左右边
  p.bubble.style.left='50%';
  const bw=p.bubble.offsetWidth;
  if(bw){const petW=SIZES[p.id];const center=Math.max(bw/2+10,Math.min(vw-bw/2-10,p.x+petW/2));p.bubble.style.left=(center-p.x)+'px';}
}
function say(p,text,ms){
  p.state='speak';p.bubble.textContent=Array.from(text).slice(0,64).join('')+(Array.from(text).length>64?'…':'');
  p.bubble.hidden=false;layoutBubble(p);p.speakUntil=performance.now()+ms;
}
function speak(p){const line=nextLine(p);if(!line){p.next=performance.now()+8000;return;}say(p,line,6200+Math.random()*1800);}
function restReminder(p,now){
  p.state='rest';p.restUntil=now+REST_DURATION_MS;p.figure.classList.add('rp-rest-figure');
  p.bubble.classList.add('rp-rest-bubble');
  p.bubble.hidden=false;p.bubble.textContent=p.rest;p.speakUntil=now+REST_DURATION_MS;
}
function moodOf(p){if(!MOODS.length)return 'normal';return Math.random()<0.55?'normal':MOODS[Math.floor(Math.random()*MOODS.length)];}
pets.forEach((p,i)=>{
  p.x=vw*0.1*(i+1)+Math.random()*60;p.dir=Math.random()<0.5?-1:1;
  p.speed=16+Math.random()*14;p.next=performance.now()+6000+Math.random()*16000;
  p.moodNext=performance.now()+180000+Math.random()*240000;
});
let restDue=0,restFired=0,restSkips=0;
function armRest(){if(!restDue)restDue=performance.now()+REST_AFTER_MS;}
function checkRest(){
  const now=performance.now();
  if(!restDue||now<=restDue)return;
  restSkips++;
  if(document.visibilityState==='visible'&&!reduced){
    const p=pets[0];
    if(p.state==='walk'){restDue=now+REST_EVERY_MS;restFired++;restReminder(p,now);}
    // 她恰好在说话：不吞掉这次提醒，下次检查再试
  }else restDue=now+60000;
}
setInterval(checkRest,FAST?2000:30000);
for(const evt of ['pointerdown','keydown','wheel','touchstart'])addEventListener(evt,armRest,{passive:true});
setTimeout(armRest,60000);
let last=performance.now();
function tick(now){
  const dt=Math.min(50,now-last);last=now;
  for(const p of pets){
    p.el.style.bottom=LANES[p.id]+'px';
    if(p.state==='speak'){
      p.el.style.transform=`translateX(${p.x}px)`;
      if(now>p.speakUntil){p.bubble.hidden=true;p.state='walk';p.next=performance.now()+8000+Math.random()*14000;}
    }else if(p.state==='rest'){
      const cx=Math.max(0,(vw-SIZES[p.id])/2);
      p.el.style.transform=`translateX(${cx}px)`;
      p.bubble.style.left='50%';
      if(now>p.restUntil){
        p.bubble.hidden=true;p.figure.classList.remove('rp-rest-figure');p.bubble.classList.remove('rp-rest-bubble');
        p.state='walk';p.next=performance.now()+10000+Math.random()*20000;
      }
    }else if(p.state==='pause'){
      p.el.style.transform=`translateX(${p.x}px)`;
      if(now>p.until)p.state='walk';
    }else{
      const bob=Math.sin(now/260+LANES[p.id])*2.5;
      const sway=Math.sin(now/520+LANES[p.id])*4;
      p.el.style.transform=`translateX(${p.x}px) translateY(${bob}px) rotate(${sway*0.12}deg)`;
      if(now>p.moodNext){
        p.moodNext=now+180000+Math.random()*240000;
        const mood=moodOf(p);
        if(mood!==p.mood){p.mood=mood;p.img.src=mood==='normal'?p.image:outfits[p.id][mood];}
      }
      if(!reduced){
        p.x+=p.dir*p.speed*dt/1000;
        if(p.x<=0){p.x=0;p.dir=1;}else if(p.x>=vw-SIZES[p.id]-MARGIN){p.x=vw-SIZES[p.id]-MARGIN;p.dir=-1;}
        if(Math.random()<0.003){p.state='pause';p.until=now+2200+Math.random()*3800;}
      }
    }
    if(p.state==='walk'&&now>p.next){if(quotes[p.id].length)speak(p);else p.next=performance.now()+15000;}
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
if(FAST)window.__RP=()=>({due:Math.round(restDue-performance.now()),state:pets[0].state,reduced,vis:document.visibilityState,bubbles:document.querySelectorAll('.rp-bubble:not([hidden])').length,fast:FAST,after:REST_AFTER_MS,fired:restFired,skips:restSkips});
})();
