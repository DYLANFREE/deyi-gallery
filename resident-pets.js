(()=>{'use strict';
// 保留「歇」的插画相册与休息提醒；漂浮人物、气泡和走动循环已撤下。
// 沿用原资源路径以兼容主站与备用站；浏览只读取已有图片。
const compactView=()=>matchMedia('(max-width: 880px)').matches;
function scriptBase(){
  try{const src=document.currentScript?.src||'';const u=new URL(src||location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
  catch{const u=new URL(location.href);return u.origin+u.pathname.replace(/[^/]*$/,'');}
}
const base=scriptBase();
const PEOPLE={
  wood:{name:'小木',color:'#3d6b52',restLines:[
    '俊哥，坐得有点久了。起来走走，喝口水，我在这儿呢。',
    '俊哥，眼睛歇一歇。你坐了半天了，风在外面等你呢。']},
  fire:{name:'小火',color:'#c2622a',restLines:[
    '喂，眼睛都直了。站起来活动一下，别把身子熬坏了。',
    '行了，屏幕先放一放。身子是炉子，不能光烧不加柴。']},
  water:{name:'小水',color:'#3a6ea5',restLines:[
    '该歇口气啦。起来伸个懒腰，回来再继续。',
    '水都坐浑了。起来走两步，让它重新流起来。']},
};
// 每日动漫图由只读来源更新，首批图作为初始显示。
const REST_ART=[
  {id:'wood',title:'窗边读书',file:'wood-reading.webp'},
  {id:'fire',title:'灯下倒茶',file:'fire-tea.webp'},
  {id:'water',title:'雨窗听雨',file:'water-rain.webp'},
];
// 这层只展示已有图片。浏览与休息提醒都不触发图片模型。
const FAST=new URLSearchParams(location.search).has('pets-fast'); // 测试钩子：短计时看休息接管
const REST_AFTER_MS=FAST?14*1000:30*60*1000, REST_EVERY_MS=FAST?25*1000:45*60*1000, BREAK_MS=FAST?12*1000:45*1000;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const layer=document.createElement('div');layer.className='rp-layer';layer.setAttribute('role','region');layer.setAttribute('aria-label','休息提醒');
document.body.append(layer);
// 右下角小圆钮：主动叫一位驻馆者来接管休息
const restBtn=document.createElement('button');
restBtn.type='button';restBtn.className='rp-rest-btn';restBtn.title='叫她们来提醒休息';restBtn.setAttribute('aria-label','主动触发休息提醒');
restBtn.textContent='歇';
restBtn.addEventListener('click',()=>{restDue=performance.now()+REST_EVERY_MS;showBreak();});
layer.append(restBtn);
// ── 休息接管（Cat Gatekeeper 式：出现、占屏、停留、可提前请走）──
let breakEl=null,breakTimer=0,breakClosing=false,breakReturnFocus=null;
// Reuse decoded images. Only warm the first page and immediate neighbours.
const artCache=new Map();
function loadArt(src,priority='high'){
  if(artCache.has(src)){
    const entry=artCache.get(src);artCache.delete(src);artCache.set(src,entry);
    if(priority==='high')entry.image.fetchPriority='high';
    return entry;
  }
  const image=new Image();image.width=960;image.height=1280;image.draggable=false;
  image.referrerPolicy='no-referrer';image.decoding='async';image.fetchPriority=priority;
  const entry={image,ready:false,promise:null};
  entry.promise=new Promise((resolve,reject)=>{
    image.onload=async()=>{try{await image.decode();entry.ready=true;resolve(image);}catch(error){reject(error);}};
    image.onerror=()=>reject(Error('rest_image_unavailable'));
  });
  entry.promise.catch(()=>{if(artCache.get(src)===entry)artCache.delete(src);});
  artCache.set(src,entry);while(artCache.size>6)artCache.delete(artCache.keys().next().value);
  image.src=src;return entry;
}
function mayPrefetch(){return !navigator.connection?.saveData&&!/^(slow-)?2g$/.test(navigator.connection?.effectiveType||'');}
function warmNeighbours(items,index){
  if(!mayPrefetch()||items.length<2)return;
  for(const offset of [1,-1])loadArt(items[(index+offset+items.length)%items.length].src,'low').promise.catch(()=>{});
}
let warmTimer=0;
function warmFirst(){
  clearTimeout(warmTimer);if(!mayPrefetch()||breakEl?.open)return;
  const state=window.DeyiResidentRestImages?.getState();if(state?.loading)return;
  let index=0;try{index=Math.max(0,parseInt(localStorage.getItem('deyi-pets-next-break')||'0',10)||0)%REST_ART.length;}catch{}
  const items=availableArt(),item=items.find(x=>x.resident===REST_ART[index].id)||items[0];
  if(item)loadArt(item.src,'low').promise.catch(()=>{});
}
restBtn.addEventListener('pointerenter',warmFirst);restBtn.addEventListener('focus',warmFirst);
function buildBreak(){
  const veil=document.createElement('div');veil.className='rp-break';veil.setAttribute('role','dialog');veil.setAttribute('aria-label','休息插画');veil.setAttribute('aria-modal','true');
  const stage=document.createElement('div');stage.className='rp-break-stage';
  const card=document.createElement('div');card.className='rp-break-card';
  const img=document.createElement('img');img.alt='';img.width=960;img.height=1280;img.draggable=false;
  const empty=document.createElement('div');empty.className='rp-break-empty';empty.hidden=true;empty.textContent='插画暂时没能打开';
  const loading=document.createElement('div');loading.className='rp-break-loading';loading.hidden=true;loading.setAttribute('role','status');loading.textContent='正在打开这张图…';
  const bubble=document.createElement('div');bubble.className='rp-break-bubble';
  const foot=document.createElement('div');foot.className='rp-break-foot';
  const note=document.createElement('div');note.className='rp-break-note';
  const caption=document.createElement('div');caption.className='rp-break-image-caption';
  const feedStatus=document.createElement('p');feedStatus.className='rp-break-feed-status';feedStatus.hidden=true;feedStatus.setAttribute('role','status');
  const counter=document.createElement('div');counter.className='rp-break-counter';counter.setAttribute('aria-live','polite');counter.setAttribute('aria-atomic','true');
  const previous=document.createElement('button');previous.type='button';previous.className='rp-break-arrow';previous.setAttribute('aria-label','上一张插画');previous.textContent='‹';
  const next=document.createElement('button');next.type='button';next.className='rp-break-arrow';next.setAttribute('aria-label','下一张插画');next.textContent='›';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='rp-break-dismiss';dismiss.textContent='让她先走';
  card.append(img,loading,empty);stage.append(previous,card,next);foot.append(counter,caption,feedStatus,note,dismiss);veil.append(bubble,stage,foot);
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
  return{veil,card,img,loading,empty,bubble,note,caption,feedStatus,counter,previous,next,dismiss,selected:null,resident:null,position:0,failed:new Set(),browsing:false,open:false,loadToken:0,requested:null};
}
function showBreak(){
  if(breakEl&&document.body.contains(breakEl.veil))return;
  if(!breakEl)breakEl=buildBreak();
  // 轮流：记住上次是谁（本地存储），刷新后接着轮
  let idx=0;try{idx=Math.max(0,parseInt(localStorage.getItem('deyi-pets-next-break')||'0',10)||0)%REST_ART.length;}catch{}
  try{localStorage.setItem('deyi-pets-next-break',String((idx+1)%REST_ART.length));}catch{}
  breakClosing=false;breakReturnFocus=document.activeElement;breakEl.browsing=false;breakEl.bubble.textContent='';
  breakEl.failed.clear();breakEl.resident=REST_ART[idx].id;breakEl.selected=null;breakEl.requested=null;breakEl.open=true;
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
      if(seen.has(key)||breakEl?.failed.has(key))continue;
      seen.add(key);items.push({key,resident:fallback.id,title:image.variation?.title||'馆中片刻',src:image.src,imageId:image.imageId,createdAt:image.createdAt});
    }
    if(!images.length){
      const key='initial:'+fallback.id;
      if(!breakEl?.failed.has(key))items.push({key,resident:fallback.id,title:fallback.title,initial:true,src:base+'images/residents/rest-anime/v1/'+fallback.file});
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
  album.empty.hidden=!!item;
  album.previous.disabled=items.length<2;album.next.disabled=items.length<2;
  album.note.textContent=album.browsing?'慢慢看，歇好了再回来。':'休息提醒 · '+Math.round(BREAK_MS/1000)+' 秒后收起';
  if(album.previous.disabled&&[album.previous,album.next].includes(document.activeElement))album.dismiss.focus({preventScroll:true});
  if(!item){
    album.loadToken++;album.requested=null;album.img.hidden=true;album.loading.hidden=true;album.card.setAttribute('aria-busy','false');
    album.counter.textContent='休息插画';album.caption.textContent='';album.feedStatus.hidden=true;
    album.bubble.textContent='歇一会儿吧。';album.veil.removeAttribute('data-who');
    return;
  }
  const person=PEOPLE[item.resident],src=item.src;album.resident=item.resident;
  if(album.veil.dataset.who!==item.resident||!album.bubble.textContent)album.bubble.textContent=person.restLines[Math.floor(Math.random()*person.restLines.length)];
  album.veil.dataset.who=item.resident;album.veil.style.setProperty('--c',person.color);

  album.counter.textContent=person.name+' · '+(items.indexOf(item)+1)+' / '+items.length;
  const imageState=window.DeyiResidentRestImages?.getState();
  album.feedStatus.hidden=!imageState?.unavailable&&!item.initial;
  album.feedStatus.textContent=item.initial?'正在展示初始插画，新的图片暂时没有取到。':imageState?.unavailable?'暂时没取到更新，保留上次收到的图片。':'';
  album.caption.textContent=item.title+(item.initial?' · 初始插画':' · 休息插画')+(item.createdAt?' · '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(item.createdAt)):'');
  if(album.requested===src)return;
  const token=++album.loadToken;album.requested=src;album.img.hidden=true;
  album.loading.hidden=false;album.card.setAttribute('aria-busy','true');
  const current=()=>album.open&&!breakClosing&&album.loadToken===token&&album.selected===item.key;
  const paint=image=>{
    if(!current())return;
    image.alt=person.name+' · '+item.title;image.hidden=false;
    if(album.img!==image){album.img.replaceWith(image);album.img=image;}
    album.loading.hidden=true;album.card.setAttribute('aria-busy','false');
    warmNeighbours(items,items.indexOf(item));
  };
  const fail=()=>{
    if(!current())return;
    album.requested=null;album.failed.add(item.key);
    if(item.imageId)window.DeyiResidentRestImages?.markAssetFailed(item.imageId);
    syncBreakArt();
  };
  const entry=loadArt(src);if(entry.ready)paint(entry.image);else entry.promise.then(paint,fail);
}
window.DeyiResidentRestImages?.subscribe(()=>{
  if(breakEl?.open&&!breakClosing)syncBreakArt();
  else{clearTimeout(warmTimer);warmTimer=setTimeout(warmFirst,600);}
});
function hideBreak(){
  if(!breakEl||breakClosing)return;breakClosing=true;breakEl.open=false;breakEl.loadToken++;breakEl.requested=null;
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

})();
