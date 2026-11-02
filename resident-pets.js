(()=>{'use strict';
// 木火水小人：在页面底部空白处走动，随机飘出她们真实说过的话。
// 首页只播明确标记的独立留话；同桌聊天和未标记的旧记录只在住处历史阅读。
// 新话还没出现时安静走路，不编台词。
// 人物：直接用 images/residents/<id>.webp 做小人卡（圆角+投影+走路摇摆的3D感）。
// 多套衣服：按心情切换，命名约定 images/residents/<id>-<mood>.webp（如 wood-happy.webp），
// 俊后续加图即可自动生效；缺哪套自动落回默认图。页面可设 window.RESIDENT_PETS_OUTFITS 覆盖。
// 休息接管（木火水版 Cat Gatekeeper，自写实现）：页面连续停留满 REST_AFTER_MS 后，
// 一位驻馆者慢慢出现、占满屏幕接管页面（遮罩挡住内容），停留 BREAK_MS 后自己回去；
// 不想等可点「让她先走」。切走标签页重新计时。右下角小圆钮可主动触发。
// 与住处共用 DeyiResidentFeed，更新是完整快照替换；无新话就安静。
if(matchMedia('(max-width: 880px)').matches)return;
function scriptBase(){
  try{const src=document.currentScript?.src||'';const u=new URL(src||location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
  catch{const u=new URL(location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
}
const base=scriptBase();
const PEOPLE={
  wood:{name:'小木',image:base+'images/residents/wood-face-20261101.png',color:'#3d6b52',restLines:[
    '俊哥，坐得有点久了。起来走走，喝口水，我在这儿呢。',
    '俊哥，眼睛歇一歇。你坐了半天了，风在外面等你呢。']},
  fire:{name:'小火',image:base+'images/residents/fire.webp',color:'#c2622a',restLines:[
    '喂，眼睛都直了。站起来活动一下，别把身子熬坏了。',
    '行了，屏幕先放一放。身子是炉子，不能光烧不加柴。']},
  water:{name:'小水',image:base+'images/residents/water.webp',color:'#3a6ea5',restLines:[
    '该歇口气啦。起来伸个懒腰，回来再继续。',
    '水都坐浑了。起来走两步，让它重新流起来。']},
};
const BREAK_ORDER=['wood','fire','water']; // 轮流来，记住上次是谁
// 这层只展示已有图片。浏览、悬停与休息提醒都不触发图片模型。
const MOODS=['happy','quiet']; // 只切换实际注册的服装，默认保持原立绘
const FAST=new URLSearchParams(location.search).has('pets-fast'); // 测试钩子：短计时看休息接管
const REST_AFTER_MS=FAST?14*1000:30*60*1000, REST_EVERY_MS=FAST?25*1000:45*60*1000, BREAK_MS=FAST?12*1000:45*1000;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIZES={wood:76,fire:68,water:60}; // 三车道近大远小，出3D纵深感
const MARGIN=12,LANES={wood:6,fire:54,water:100};
const quotes={wood:[],fire:[],water:[]};
const outfits={wood:{},fire:{},water:{}};
if(window.RESIDENT_PETS_OUTFITS){for(const id of Object.keys(outfits)){if(window.RESIDENT_PETS_OUTFITS[id])Object.assign(outfits[id],window.RESIDENT_PETS_OUTFITS[id]);}}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const CUTOFF=Date.parse('2026-10-31T07:00:00Z');
function loadFeed(state){
  const next={wood:[],fire:[],water:[]};
  for(const message of window.DeyiResidentFeed?.independentMessages()||[]){
    if(Date.parse(message.createdAt)>=CUTOFF)next[message.resident].push(message);
  }
  for(const id of Object.keys(quotes)){
    quotes[id]=next[id].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    const pet=pets.find(p=>p.id===id);
    pet.bag=pet.bag.filter(message=>quotes[id].some(current=>current.id===message.id));
    if(pet.spokenId&&!quotes[id].some(message=>message.id===pet.spokenId)){
      pet.bubble.hidden=true;pet.spokenId=null;pet.state='walk';pet.next=performance.now()+8000;
    }
  }
}
const layer=document.createElement('div');layer.className='rp-layer';layer.setAttribute('role','region');layer.setAttribute('aria-label','驻馆者');
const pets=Object.entries(PEOPLE).map(([id,p])=>{
  const el=document.createElement('div');el.className='rp-pet';el.style.setProperty('--c',p.color);
  const figure=document.createElement('button');figure.type='button';figure.className='rp-figure';figure.setAttribute('aria-label','听'+p.name+'最近留下的话');
  const img=document.createElement('img');img.alt='';img.width=144;img.height=144;img.draggable=false;img.src=p.image;
  img.addEventListener('error',()=>{if(img.src!==p.image)img.src=p.image;},{once:false});
  const shadow=document.createElement('div');shadow.className='rp-shadow';
  const bubble=document.createElement('div');bubble.className='rp-bubble';bubble.hidden=true;
  figure.append(img);el.append(figure,shadow,bubble);layer.append(el);
  const pet={id,...p,el,figure,img,shadow,bubble,x:0,dir:1,speed:0,state:'walk',next:0,until:0,speakUntil:0,bag:[],spokenId:null,mood:'normal',moodNext:0,hover:false};
  // 鼠标停在人物上：停步，并让她开口说她想说的话；气泡计时也暂停，读完再走
  el.addEventListener('pointerenter',()=>{
    pet.hover=true;
    if((pet.state==='walk'||pet.state==='pause')&&quotes[pet.id].length&&pet.bubble.hidden)speak(pet);
  });
  // 点击头像：同样开口说她想说的话（有真话时才说，不编）
  figure.addEventListener('click',()=>{
    if(quotes[pet.id].length&&pet.bubble.hidden)speak(pet);
    else if(!quotes[pet.id].length)showRoomLink(pet);
  });
  el.addEventListener('focusin',()=>{pet.hover=true;});
  el.addEventListener('focusout',()=>{pet.hover=false;});
  el.addEventListener('pointerleave',()=>{pet.hover=false;});
  return pet;
});
document.body.append(layer);
window.DeyiResidentFeed?.subscribe(loadFeed);
// 右下角小圆钮：主动叫一位驻馆者来接管休息
const restBtn=document.createElement('button');
restBtn.type='button';restBtn.className='rp-rest-btn';restBtn.title='叫她们来提醒休息';restBtn.setAttribute('aria-label','主动触发休息提醒');
restBtn.textContent='歇';
restBtn.addEventListener('click',()=>{restDue=performance.now()+REST_EVERY_MS;showBreak();});
layer.append(restBtn);
let vw=innerWidth;addEventListener('resize',()=>{vw=innerWidth;for(const p of pets)p.x=Math.min(p.x,vw-SIZES[p.id]-MARGIN);});
pets.forEach(p=>{p.el.style.width=SIZES[p.id]+'px';p.el.style.height=SIZES[p.id]+'px';});
function nextLine(p){if(!p.bag.length)p.bag=shuffle(quotes[p.id].slice());return p.bag.pop()||null;}
function roomLink(p,message){const link=document.createElement('a');link.className='rp-room-link';link.href=base+'residents/'+p.id+'/' +(message?'#piece='+message.id:'');link.textContent='看看她最近留下的 ↗';return link;}
function showRoomLink(p){p.bubble.replaceChildren(roomLink(p));p.bubble.hidden=false;p.state='speak';p.speakUntil=performance.now()+8000;layoutBubble(p);}
function layoutBubble(p){
  // 气泡按内容定宽，同时保证不超出屏幕左右边
  p.bubble.style.left='50%';
  const bw=p.bubble.offsetWidth;
  if(bw){const petW=SIZES[p.id];const center=Math.max(bw/2+10,Math.min(vw-bw/2-10,p.x+petW/2));p.bubble.style.left=(center-p.x)+'px';}
}
function say(p,message,ms){
  p.state='speak';p.spokenId=message.id;
  const body=document.createElement('p');body.className='rp-quote-body';body.textContent=message.body;
  const foot=document.createElement('div');foot.className='rp-quote-foot';
  const time=document.createElement('time');time.dateTime=message.createdAt;
  time.textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(message.createdAt));
  foot.append(time,roomLink(p,message));p.bubble.replaceChildren(body,foot);
  p.bubble.hidden=false;layoutBubble(p);p.speakUntil=performance.now()+ms;
}
function speak(p){const message=nextLine(p);if(!message){p.next=performance.now()+8000;return;}
  const dur=Math.min(22000,8000+Math.max(0,Array.from(message.body).length-24)*50);
  say(p,message,dur);
}
function moodOf(p){const available=MOODS.filter(mood=>typeof outfits[p.id][mood]==='string');if(!available.length)return 'normal';return Math.random()<0.55?'normal':available[Math.floor(Math.random()*available.length)];}
pets.forEach((p,i)=>{
  p.x=vw*0.1*(i+1)+Math.random()*60;p.dir=Math.random()<0.5?-1:1;
  p.speed=16+Math.random()*14;p.next=performance.now()+6000+Math.random()*16000;
  p.moodNext=performance.now()+180000+Math.random()*240000;
});

// ── 休息接管（Cat Gatekeeper 式：出现、占屏、停留、可提前请走）──
let breakEl=null,breakTimer=0;
function buildBreak(){
  const veil=document.createElement('div');veil.className='rp-break';veil.setAttribute('role','dialog');veil.setAttribute('aria-label','休息提醒');
  const card=document.createElement('div');card.className='rp-break-card';
  const img=document.createElement('img');img.alt='';img.width=240;img.height=240;img.draggable=false;
  const bubble=document.createElement('div');bubble.className='rp-break-bubble';
  const foot=document.createElement('div');foot.className='rp-break-foot';
  const pedestal=document.createElement('div');pedestal.className='rp-break-pedestal';
  const glow=document.createElement('div');glow.className='rp-break-glow';
  const note=document.createElement('div');note.className='rp-break-note';
  const caption=document.createElement('div');caption.className='rp-break-image-caption';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='rp-break-dismiss';dismiss.textContent='让她先走';
  card.append(img);foot.append(caption,note,dismiss);veil.append(bubble,card,pedestal,glow,foot);
  img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{const imageId=img.dataset.imageId;if(!imageId)return;img.dataset.imageId='';img.src=PEOPLE[veil.dataset.who].image;window.DeyiResidentImages?.markAssetFailed(imageId);syncBreakImage();});
  dismiss.addEventListener('click',hideBreak);
  return{veil,card,img,bubble,note,caption,dismiss,glow,pedestal};
}
function showBreak(){
  if(breakEl&&document.body.contains(breakEl.veil))return;
  if(!breakEl)breakEl=buildBreak();
  // 轮流：记住上次是谁（本地存储），刷新后接着轮
  let idx=0;try{idx=(parseInt(localStorage.getItem('deyi-pets-next-break')||'0',10)||0)%BREAK_ORDER.length;}catch{}
  const id=BREAK_ORDER[idx],person=PEOPLE[id];
  try{localStorage.setItem('deyi-pets-next-break',String((idx+1)%BREAK_ORDER.length));}catch{}
  breakEl.veil.dataset.who=id;
  breakEl.veil.style.setProperty('--c',person.color);
  // 配图来自后台的成功快照，不代表她当下真实活动或心情。
  breakEl.veil.dataset.imageMood=pets.find(x=>x.id===id)?.mood||'normal';
  syncBreakImage();
  breakEl.bubble.textContent=person.restLines[Math.floor(Math.random()*person.restLines.length)];
  const s=Math.round(BREAK_MS/1000);
  breakEl.note.textContent=person.name+' · 休息提醒 · '+s+' 秒后她自己回去';
  document.body.append(breakEl.veil);
  requestAnimationFrame(()=>breakEl.veil.classList.add('rp-break-show'));
  clearTimeout(breakTimer);
  breakTimer=setTimeout(hideBreak,BREAK_MS);
  startBreak3D();
}
function syncBreakImage(){
  if(!breakEl)return;const id=breakEl.veil.dataset.who;if(!PEOPLE[id])return;
  const client=window.DeyiResidentImages,state=client?.getState();
  const image=client?.select(id,{mood:breakEl.veil.dataset.imageMood||'normal'});
  const src=image?.src||PEOPLE[id].image;
  breakEl.img.dataset.imageId=image?.imageId||'';
  if(breakEl.img.src!==src)breakEl.img.src=src;
  breakEl.img.alt=PEOPLE[id].name+(image?'的 AI 配图':'的原肖像');
  const date=value=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  breakEl.caption.textContent=image?'AI 配图 · '+date(image.createdAt):'原肖像';
  if(state?.unavailable&&state.manifest)breakEl.caption.textContent+=' · 暂用 '+date(state.manifest.publishedAt)+' 的记录';
  else if(!image&&state?.failedImageIds?.some(failedId=>state.manifest?.images.some(item=>item.resident===id&&item.imageId===failedId)))breakEl.caption.textContent+=' · 配图暂时没能打开';
}
window.DeyiResidentImages?.subscribe(()=>{if(breakEl&&document.body.contains(breakEl.veil))syncBreakImage();});
// 3D 舞台：入场动画结束后交给 JS——呼吸浮动＋随鼠标视角转动（参考 Cat Gatekeeper 的猫）
let break3D=0,mouseX=0,mouseY=0;
addEventListener('pointermove',e=>{mouseX=e.clientX;mouseY=e.clientY;},{passive:true});
function startBreak3D(){
  cancelAnimationFrame(break3D);
  const card=breakEl?.card;if(!card||reduced)return;
  let t=0,started=false;
  const loop=()=>{
    if(!breakEl||!document.body.contains(breakEl.veil))return;
    t+=16;
    const cx=(mouseX-innerWidth/2)/innerWidth, cy=(mouseY-innerHeight/2)/innerHeight;
    const rotY=cx*10+Math.sin(t/2600)*3;
    const rotX=-cy*8+Math.cos(t/3400)*2.5;
    const breathe=1+Math.sin(t/2400)*0.012;
    card.style.transform=`translate(-50%,-50%) rotateY(${rotY.toFixed(2)}deg) rotateX(${rotX.toFixed(2)}deg) scale(${breathe.toFixed(4)})`;
    break3D=requestAnimationFrame(loop);
  };
  // 入场动画期间不接管 transform；结束后交还
  const handoff=()=>{if(started)return;started=true;card.style.animation='none';loop();};
  card.addEventListener('animationend',handoff,{once:true});
  setTimeout(handoff,1400);
}
function hideBreak(){
  if(!breakEl)return;
  clearTimeout(breakTimer);
  breakEl.veil.classList.remove('rp-break-show');
  setTimeout(()=>breakEl.veil.remove(),600);
}
let restDue=0;
function armRest(){if(!restDue)restDue=performance.now()+REST_AFTER_MS;}
for(const evt of ['pointerdown','keydown','wheel','touchstart'])addEventListener(evt,armRest,{passive:true});
setTimeout(armRest,60000);
// 切走标签页重新计时（同 Cat Gatekeeper：按连续停留算）
document.addEventListener('visibilitychange',()=>{if(document.hidden){restDue=0;}else{armRest();}});
function checkRest(){
  const now=performance.now();
  if(!restDue||now<=restDue)return;
  if(document.visibilityState!=='visible'){restDue=now+60000;return;}
  restDue=now+REST_EVERY_MS;
  showBreak();
}
setInterval(checkRest,FAST?2000:30000);
if(FAST)window.__RP=()=>({due:Math.round(restDue-performance.now()),breakOpen:!!breakEl&&document.body.contains(breakEl.veil)});

let last=performance.now();
function tick(now){
  const dt=Math.min(50,now-last);last=now;
  for(const p of pets){
    p.el.style.bottom=LANES[p.id]+'px';
    if(p.state==='speak'){
      p.el.style.transform=`translateX(${p.x}px)`;
      if(p.hover){p.speakUntil=Math.max(p.speakUntil,now+1200);} // 悬停时气泡不消失
      else if(now>p.speakUntil){p.bubble.hidden=true;p.state='walk';p.next=performance.now()+8000+Math.random()*14000;}
    }else if(p.state==='pause'){
      p.el.style.transform=`translateX(${p.x}px)`;
      if(now>p.until&&!p.hover)p.state='walk';
    }else{
      const bob=p.hover?0:Math.sin(now/260+LANES[p.id])*2.5;
      const sway=p.hover?0:Math.sin(now/520+LANES[p.id])*4;
      p.el.style.transform=`translateX(${p.x}px) translateY(${bob}px) rotate(${sway*0.12}deg)`;
      if(now>p.moodNext){
        p.moodNext=now+180000+Math.random()*240000;
        const mood=moodOf(p);
        if(mood!==p.mood){p.mood=mood;p.img.src=mood==='normal'?p.image:(outfits[p.id][mood]||p.image);}
      }
      if(!reduced&&!p.hover){
        p.x+=p.dir*p.speed*dt/1000;
        if(p.x<=0){p.x=0;p.dir=1;}else if(p.x>=vw-SIZES[p.id]-MARGIN){p.x=vw-SIZES[p.id]-MARGIN;p.dir=-1;}
        if(Math.random()<0.003){p.state='pause';p.until=now+2200+Math.random()*3800;}
      }
    }
    if(p.state==='walk'&&now>p.next&&!p.hover){if(quotes[p.id].length)speak(p);else p.next=performance.now()+15000;}
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
})();
