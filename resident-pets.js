(()=>{'use strict';
// 木火水小人：在页面底部空白处走动，随机飘出她们真实说过的话。
// 首页只播明确标记的独立留话；同桌聊天和未标记的旧记录只在住处历史阅读。
// 新话还没出现时安静走路，不编台词。
// 小人头像取自「歇」的三张插画，使用轻量预览图。
// 页面可用 window.RESIDENT_PETS_OUTFITS 注册服装，加载失败时回到默认头像。
// 休息接管（木火水版 Cat Gatekeeper，自写实现）：页面连续停留满 REST_AFTER_MS 后，
// 一位驻馆者慢慢出现、占满屏幕接管页面（遮罩挡住内容），停留 BREAK_MS 后自己回去；
// 不想等可点「让她先走」。切走标签页重新计时。右下角小圆钮可主动触发。
// 与住处共用 DeyiResidentFeed，更新是完整快照替换；无新话就安静。
const compactView=()=>matchMedia('(max-width: 880px)').matches;
function scriptBase(){
  try{const src=document.currentScript?.src||'';const u=new URL(src||location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
  catch{const u=new URL(location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
}
const base=scriptBase();
const portraitBase=base+'images/residents/pets-anime/v1/';
const PEOPLE={
  wood:{name:'小木',image:portraitBase+'wood.webp',color:'#3d6b52',restLines:[
    '俊哥，坐得有点久了。起来走走，喝口水，我在这儿呢。',
    '俊哥，眼睛歇一歇。你坐了半天了，风在外面等你呢。']},
  fire:{name:'小火',image:portraitBase+'fire.webp',color:'#c2622a',restLines:[
    '喂，眼睛都直了。站起来活动一下，别把身子熬坏了。',
    '行了，屏幕先放一放。身子是炉子，不能光烧不加柴。']},
  water:{name:'小水',image:portraitBase+'water.webp',color:'#3a6ea5',restLines:[
    '该歇口气啦。起来伸个懒腰，回来再继续。',
    '水都坐浑了。起来走两步，让它重新流起来。']},
};
// 每日动漫图由只读来源更新，首批图作为初始显示。
const REST_ART=[
  {id:'wood',title:'窗边读书',file:'wood-reading.webp'},
  {id:'fire',title:'灯下倒茶',file:'fire-tea.webp'},
  {id:'water',title:'雨窗听雨',file:'water-rain.webp'},
];
const REST_TITLES={
  wood:{normal:'窗边读书',happy:'午后茶歇',quiet:'靠窗放空'},
  fire:{normal:'整理书架',happy:'灯下倒茶',quiet:'夜色与书'},
  water:{normal:'雨后翻书',happy:'水边茶歇',quiet:'雨窗听雨'},
};
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
let breakEl=null,breakTimer=0,breakClosing=false,breakReturnFocus=null;
function buildBreak(){
  const veil=document.createElement('div');veil.className='rp-break';veil.setAttribute('role','dialog');veil.setAttribute('aria-label','休息插画');veil.setAttribute('aria-modal','true');
  const stage=document.createElement('div');stage.className='rp-break-stage';
  const card=document.createElement('div');card.className='rp-break-card';
  const img=document.createElement('img');img.alt='';img.width=960;img.height=1280;img.draggable=false;
  const empty=document.createElement('div');empty.className='rp-break-empty';empty.hidden=true;empty.textContent='插画暂时没能打开';
  const bubble=document.createElement('div');bubble.className='rp-break-bubble';
  const foot=document.createElement('div');foot.className='rp-break-foot';
  const note=document.createElement('div');note.className='rp-break-note';
  const caption=document.createElement('div');caption.className='rp-break-image-caption';
  const counter=document.createElement('div');counter.className='rp-break-counter';counter.setAttribute('aria-live','polite');counter.setAttribute('aria-atomic','true');
  const previous=document.createElement('button');previous.type='button';previous.className='rp-break-arrow';previous.setAttribute('aria-label','上一张插画');previous.textContent='‹';
  const next=document.createElement('button');next.type='button';next.className='rp-break-arrow';next.setAttribute('aria-label','下一张插画');next.textContent='›';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='rp-break-dismiss';dismiss.textContent='让她先走';
  card.append(img,empty);stage.append(previous,card,next);foot.append(counter,caption,note,dismiss);veil.append(bubble,stage,foot);
  img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{
    if(!breakEl?.selected||breakClosing)return;
    const failed=availableArt().find(item=>item.key===breakEl.selected);
    breakEl.failed.add(breakEl.selected);
    if(failed?.imageId)window.DeyiResidentRestImages?.markAssetFailed(failed.imageId);
    syncBreakArt();
  });
  dismiss.addEventListener('click',hideBreak);
  previous.addEventListener('click',()=>moveBreakPhoto(-1));next.addEventListener('click',()=>moveBreakPhoto(1));
  veil.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();hideBreak();return;}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveBreakPhoto(event.key==='ArrowRight'?1:-1);return;}
    if(event.key==='Tab'){
      const controls=[previous,next,dismiss].filter(button=>!button.disabled),first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  let swipe=null;
  card.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||event.pointerType==='pen'){swipe={id:event.pointerId,x:event.clientX,y:event.clientY};try{card.setPointerCapture?.(event.pointerId);}catch{}}});
  card.addEventListener('pointerup',event=>{
    if(!swipe||swipe.id!==event.pointerId)return;
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;swipe=null;
    if(Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.3)moveBreakPhoto(dx<0?1:-1);
  });
  card.addEventListener('pointercancel',()=>{swipe=null;});
  return{veil,img,empty,bubble,note,caption,counter,previous,next,dismiss,selected:null,resident:null,position:0,failed:new Set(),browsing:false};
}
function showBreak(){
  if(breakEl&&document.body.contains(breakEl.veil))return;
  if(!breakEl)breakEl=buildBreak();
  // 轮流：记住上次是谁（本地存储），刷新后接着轮
  let idx=0;try{idx=Math.max(0,parseInt(localStorage.getItem('deyi-pets-next-break')||'0',10)||0)%REST_ART.length;}catch{}
  try{localStorage.setItem('deyi-pets-next-break',String((idx+1)%REST_ART.length));}catch{}
  breakClosing=false;breakReturnFocus=document.activeElement;breakEl.browsing=false;breakEl.bubble.textContent='';
  breakEl.failed.clear();breakEl.resident=REST_ART[idx].id;breakEl.selected=null;
  syncBreakArt();
  document.body.append(breakEl.veil);
  (breakEl.next.disabled?breakEl.dismiss:breakEl.next).focus({preventScroll:true});
  requestAnimationFrame(()=>breakEl.veil.classList.add('rp-break-show'));
  clearTimeout(breakTimer);
  breakTimer=setTimeout(hideBreak,BREAK_MS);
}
function availableArt(){
  const state=window.DeyiResidentRestImages?.getState(),items=[];
  for(const fallback of REST_ART){
    const images=(state?.manifest?.images||[]).filter(image=>image.resident===fallback.id&&!state.failedImageIds.includes(image.imageId));
    const seen=new Set();
    images.sort((a,b)=>['normal','happy','quiet'].indexOf(a.mood)-['normal','happy','quiet'].indexOf(b.mood));
    for(const image of images){
      const key=fallback.id+':'+image.imageId;
      if(seen.has(key)||breakEl.failed.has(key))continue;
      seen.add(key);items.push({key,resident:fallback.id,title:REST_TITLES[fallback.id][image.mood],src:image.src,imageId:image.imageId,createdAt:image.createdAt});
    }
    if(!images.length){
      const key='initial:'+fallback.id;
      if(!breakEl.failed.has(key))items.push({key,resident:fallback.id,title:fallback.title,src:base+'images/residents/rest-anime/v1/'+fallback.file});
    }
  }
  return items;
}
function moveBreakPhoto(direction){
  if(!breakEl||breakClosing||!document.body.contains(breakEl.veil))return;
  const items=availableArt();if(items.length<2)return;
  const position=items.findIndex(item=>item.key===breakEl.selected);
  breakEl.selected=items[(position+direction+items.length)%items.length].key;
  breakEl.browsing=true;clearTimeout(breakTimer);syncBreakArt();
}
function syncBreakArt(){
  const album=breakEl,items=availableArt();
  const item=items.find(entry=>entry.key===album.selected)||items.find(entry=>entry.resident===album.resident)||items[Math.min(album.position,items.length-1)];
  album.selected=item?.key??null;
  album.position=Math.max(0,items.indexOf(item));
  album.img.hidden=!item;album.empty.hidden=!!item;
  album.previous.disabled=items.length<2;album.next.disabled=items.length<2;
  album.note.textContent=album.browsing?'慢慢看，歇好了再回来。':'休息提醒 · '+Math.round(BREAK_MS/1000)+' 秒后收起';
  if(album.previous.disabled&&[album.previous,album.next].includes(document.activeElement))album.dismiss.focus({preventScroll:true});
  if(!item){
    album.img.removeAttribute('src');album.img.alt='';
    album.counter.textContent='休息插画';album.caption.textContent='';
    album.bubble.textContent='歇一会儿吧。';album.veil.removeAttribute('data-who');
    return;
  }
  const person=PEOPLE[item.resident],src=item.src;album.resident=item.resident;
  if(album.veil.dataset.who!==item.resident||!album.bubble.textContent)album.bubble.textContent=person.restLines[Math.floor(Math.random()*person.restLines.length)];
  album.veil.dataset.who=item.resident;album.veil.style.setProperty('--c',person.color);
  if(album.img.src!==src)album.img.src=src;
  album.img.alt=person.name+' · '+item.title;
  album.counter.textContent=person.name+' · '+(items.indexOf(item)+1)+' / '+items.length;
  album.caption.textContent=item.title+' · 休息插画'+(item.createdAt?' · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(item.createdAt)):'');
}
window.DeyiResidentRestImages?.subscribe(()=>{if(breakEl&&document.body.contains(breakEl.veil))syncBreakArt();});
function hideBreak(){
  if(!breakEl||breakClosing)return;breakClosing=true;
  clearTimeout(breakTimer);
  breakEl.veil.classList.remove('rp-break-show');
  setTimeout(()=>{breakEl.veil.remove();breakClosing=false;if(breakReturnFocus?.isConnected)breakReturnFocus.focus({preventScroll:true});},reduced?0:280);
}
let restDue=0;
function armRest(){if(!restDue)restDue=performance.now()+REST_AFTER_MS;}
for(const evt of ['pointerdown','keydown','wheel','touchstart'])addEventListener(evt,armRest,{passive:true});
setTimeout(armRest,60000);
// 切走标签页重新计时（同 Cat Gatekeeper：按连续停留算）
document.addEventListener('visibilitychange',()=>{if(document.hidden){restDue=0;}else{armRest();}});
function checkRest(){
  if(compactView())return; // 小屏只保留主动打开，不自动遮住阅读。
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
  if(compactView()){requestAnimationFrame(tick);return;}
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
