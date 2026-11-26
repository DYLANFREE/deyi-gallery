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
const BATCH_SIZE = 15;
const DRAW_STORAGE = 'deyi-reviewed-rest-draw-v1';
const dateLabel = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'numeric',day:'numeric'});
let drawn = new Set(), lastDraw = null, warmId = null, warmTimer = 0;
try {
  const saved=JSON.parse(localStorage.getItem(DRAW_STORAGE));
  if (Array.isArray(saved?.ids)) drawn=new Set(saved.ids.filter(id=>typeof id==='string'));
  if (typeof saved?.last==='string') lastDraw=saved.last;
} catch {}

function availableArt(){
  const state=window.DeyiResidentRestImages?.getState();
  if (state?.manifest?.format!=='deyi-reviewed-rest-album-v1') return [];
  return state.manifest.images.filter(image=>!state.failedImageIds.includes(image.imageId));
}
function rememberDraw(id,allowed,exhausted=false){
  drawn=exhausted?new Set():new Set([...drawn].filter(value=>allowed.has(value)));
  drawn.add(id);lastDraw=id;warmId=null;
  try {localStorage.setItem(DRAW_STORAGE,JSON.stringify({ids:[...drawn],last:lastDraw}));} catch {}
}
function pickRandom(items,consume){
  if (!items.length) return null;
  const allowed=new Set(items.map(image=>image.imageId));
  let remaining=items.filter(image=>!drawn.has(image.imageId));
  const exhausted=remaining.length===0;
  if (exhausted) remaining=items.length===1?items:items.filter(image=>image.imageId!==lastDraw);
  const next=remaining.find(image=>image.imageId===warmId)||remaining[Math.floor(Math.random()*remaining.length)];
  if (consume) {
    rememberDraw(next.imageId,allowed,exhausted);
  } else warmId=next.imageId;
  return next;
}
function warmFirst(){
  if (!mayPrefetch()||breakEl?.open) return;
  const image=pickRandom(availableArt(),false);
  if (image) loadArt(image.src,'low').promise.catch(()=>{});
}
restBtn.addEventListener('pointerenter',warmFirst);
restBtn.addEventListener('focus',warmFirst);

function element(tag,cls,text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text)node.textContent=text;
  return node;
}
function button(cls,label,action){
  const node=element('button',cls,label);
  node.type='button';node.addEventListener('click',action);return node;
}
function keepOpen(){
  breakEl.browsing=true;
  clearTimeout(breakTimer);
}
function makeViewer(){
  const veil=element('div','rp-break');
  veil.setAttribute('role','dialog');veil.setAttribute('aria-label','休息插画');veil.setAttribute('aria-modal','true');
  const stage=element('div','rp-break-stage'),card=element('div','rp-break-card');
  const img=element('img');img.alt='';img.width=960;img.height=1280;img.draggable=false;img.hidden=true;
  const empty=element('div','rp-break-empty');empty.hidden=true;
  const loading=element('div','rp-break-loading','正在打开这张图…');loading.hidden=true;loading.setAttribute('role','status');
  const bubble=element('div','rp-break-bubble'),foot=element('div','rp-break-foot');
  const counter=element('div','rp-break-counter'),caption=element('div','rp-break-image-caption'),note=element('div','rp-break-note');
  counter.setAttribute('aria-live','polite');counter.setAttribute('aria-atomic','true');
  const feedStatus=element('p','rp-break-feed-status');feedStatus.hidden=true;feedStatus.setAttribute('role','status');
  const previous=button('rp-break-arrow','‹',()=>move(-1)),next=button('rp-break-arrow','›',()=>move(1));
  previous.setAttribute('aria-label','上一张插画');next.setAttribute('aria-label','下一张插画');
  const actions=element('div','rp-album-actions');
  const random=button('rp-album-action','随机一张',randomPhoto);
  const browse=button('rp-album-action','全部图片',openGrid);
  const dismiss=button('rp-break-dismiss','让她先走',hideBreak);
  actions.append(random,browse,dismiss);foot.append(counter,caption,feedStatus,actions,note);
  card.append(img,loading,empty);stage.append(previous,card,next);
  const shelf=element('section','rp-album-shelf');shelf.setAttribute('aria-label','全部图片');shelf.hidden=true;
  const heading=element('h2','rp-album-heading','全部图片'),filters=element('div','rp-album-filters');
  filters.setAttribute('role','group');filters.setAttribute('aria-label','按人物筛选');
  const grid=element('div','rp-album-grid'),pager=element('div','rp-album-pager');
  const backPage=button('rp-album-action','上一页',()=>gridPage(-1)),morePage=button('rp-album-action','下一页',()=>gridPage(1)),pageInfo=element('span');
  pageInfo.setAttribute('aria-live','polite');pager.append(backPage,pageInfo,morePage);
  for (const [id,label] of [['all','全部'],...Object.entries(PEOPLE).map(([id,p])=>[id,p.name])]) {
    const f=button('rp-album-filter',label,()=>{
      breakEl.filter=id;breakEl.page=0;breakEl.gridSig=null;sync();
    });
    f.dataset.person=id;filters.append(f);
  }
  const total=element('span','rp-album-total');heading.append(total);
  shelf.append(heading,filters,grid,pager);veil.append(bubble,stage,shelf,foot);
  veil.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();hideBreak();return;}
    if(!shelf.hidden&&event.target.closest('.rp-album-grid')&&['ArrowRight','ArrowLeft'].includes(event.key)){
      const nodes=[...grid.querySelectorAll('button')],idx=nodes.indexOf(event.target);
      event.preventDefault();nodes[Math.max(0,Math.min(nodes.length-1,idx+(event.key==='ArrowRight'?1:-1)))]?.focus();return;
    }
    if(shelf.hidden&&['ArrowRight','ArrowLeft'].includes(event.key)){event.preventDefault();move(event.key==='ArrowRight'?1:-1);return;}
    if(event.key==='Tab'){
      const controls=[...veil.querySelectorAll('button:not(:disabled)')].filter(b=>!b.closest('[hidden]'));
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
    }
  });
  let swipe;
  card.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    swipe={id:e.pointerId,x:e.clientX,y:e.clientY};try {card.setPointerCapture(e.pointerId);}catch{}
  });
  card.addEventListener('pointerup',e=>{
    if(!swipe||swipe.id!==e.pointerId)return;
    const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;
    if(Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);
  });
  card.addEventListener('pointercancel',()=>{swipe=null;});
  return {veil,bubble,stage,card,img,empty,loading,note,counter,caption,feedStatus,random,browse,dismiss,
    previous,next,shelf,filters,grid,pager,backPage,morePage,pageInfo,total,loadToken:0,selected:null,
    position:0,requested:null,browsing:false,open:false,mode:'photo',filter:'all',page:0,gridSig:null};
}
function showBreak(grid=false,automatic=false){
  if(breakEl?.open||breakClosing)return;
  breakEl??=makeViewer();
  const a=breakEl;
  breakReturnFocus=document.activeElement;
  Object.assign(a,{open:true,selected:null,position:0,requested:null,browsing:!automatic,
    mode:grid?'grid':'photo',filter:'all',page:0,gridSig:null});
  a.bubble.textContent='';a.img.hidden=true;
  document.body.append(a.veil);sync();
  (grid?a.filters.firstElementChild:a.random.disabled?a.dismiss:a.random).focus({preventScroll:true});
  requestAnimationFrame(()=>a.veil.classList.add('rp-break-show'));
  clearTimeout(breakTimer);
  if(automatic)breakTimer=setTimeout(hideBreak,BREAK_MS);
}
function gridPage(delta){
  const a=breakEl;
  a.page+=delta;sync();a.grid.querySelector('button')?.focus({preventScroll:true});a.shelf.scrollTop=0;
}
function openGrid(){
  const a=breakEl;
  keepOpen();a.mode='grid';a.loadToken++;a.requested=null;a.img.hidden=true;
  a.page=0;a.filter='all';
  a.gridSig=null;sync();a.filters.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
}
function display(image){
  keepOpen();breakEl.mode='photo';breakEl.selected=image?.imageId||null;
  if(image&&image.imageId!==lastDraw) rememberDraw(image.imageId,new Set(availableArt().map(i=>i.imageId)));
  sync();
}
function randomPhoto(){
  const next=pickRandom(availableArt(),true);if(!next)return;
  display(next);breakEl.random.focus({preventScroll:true});
}
function move(delta){
  const items=availableArt();if(!items.length)return;
  const at=items.findIndex(i=>i.imageId===breakEl.selected);
  display(items[(Math.max(0,at)+delta+items.length)%items.length]);
}
function drawGrid(a,items,state){
  const filtered=items.filter(item=>a.filter==='all'||item.resident===a.filter);
  a.total.textContent=filtered.length+' 张';
  const pages=Math.max(1,Math.ceil(filtered.length/BATCH_SIZE));
  a.page=Math.max(0,Math.min(a.page,pages-1));
  for(const f of a.filters.children)f.setAttribute('aria-pressed',String(f.dataset.person===a.filter));
  const sig=[state?.manifest?.revision,a.filter,a.page,filtered.length,state?.loading,state?.unavailable].join('/');
  if(sig===a.gridSig)return;
  a.gridSig=sig;
  const focused=document.activeElement?.closest('.rp-album-tile');
  const visible=filtered.slice(a.page*BATCH_SIZE,(a.page+1)*BATCH_SIZE);
  a.grid.replaceChildren();
  for(const item of visible){
    const who=PEOPLE[item.resident].name,title=item.variation?.title||'馆中片刻';
    const tile=button('rp-album-tile','',()=>{
      display(item);a.browse.focus({preventScroll:true});
    });
    tile.dataset.id=item.imageId;
    tile.setAttribute('aria-label',who+' · '+title+' · '+dateLabel.format(new Date(item.createdAt)));
    const image=element('img');image.alt='';image.width=180;image.height=240;image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
    image.src=item.src+'?size=thumb';
    const name=element('span','rp-tile-title',title),byline=element('span','rp-tile-byline',who+' · '+dateLabel.format(new Date(item.createdAt)));
    tile.append(image,name,byline);a.grid.append(tile);
  }
  if (!visible.length) a.grid.append(element('p','rp-album-empty',state?.loading?'正在打开相册…':state?.unavailable?'暂时没能打开相册。':'还没有通过审核的图片。'));
  a.pager.hidden=pages<=1;a.pageInfo.textContent=(a.page+1)+' / '+pages;
  a.backPage.disabled=a.page===0;a.morePage.disabled=a.page>=pages-1;
  if(focused&&!focused.isConnected){
    const replacement=[...a.grid.children].find(t=>t.dataset.id===focused.dataset.id);
    (replacement||a.filters.querySelector('[aria-pressed="true"]'))?.focus({preventScroll:true});
  }
}
function sync(){
  const a=breakEl;if(!a?.open||breakClosing)return;
  const items=availableArt(),state=window.DeyiResidentRestImages?.getState();
  const isGrid=a.mode==='grid';
  a.shelf.hidden=!isGrid;a.stage.hidden=isGrid;a.bubble.hidden=isGrid;a.counter.hidden=isGrid;
  a.caption.hidden=isGrid;a.browse.hidden=isGrid;a.veil.classList.toggle('rp-grid-open',isGrid);
  a.random.disabled=!items.length;a.browse.textContent='全部图片 · '+items.length;
  a.previous.disabled=a.next.disabled=items.length<2;
  a.feedStatus.hidden=!state?.unavailable;
  a.feedStatus.textContent=state?.unavailable?(items.length?'更新暂不可用，正在看上次收到的相册。':'暂时没能取得相册。'):'';
  a.note.textContent=a.browsing?'':'休息提醒 · '+Math.round(BREAK_MS/1000)+' 秒后收起';
  if(isGrid){drawGrid(a,items,state);return;}
  const item=items.find(i=>i.imageId===a.selected)||(a.selected?items[Math.min(a.position,items.length-1)]:pickRandom(items,true));
  a.selected=item?.imageId||null;
  a.empty.hidden=!!item;
  if(!item){
    a.loadToken++;a.requested=null;a.img.hidden=true;a.loading.hidden=true;a.card.setAttribute('aria-busy','false');
    a.empty.textContent=state?.loading?'正在打开相册…':state?.unavailable?'相册暂时无法打开。':'还没有通过审核的图片。';
    a.counter.textContent='休息插画';a.caption.textContent='';a.bubble.textContent='歇一会儿吧。';delete a.veil.dataset.who;
    return;
  }
  a.position=items.indexOf(item);
  const person=PEOPLE[item.resident],title=item.variation?.title||'馆中片刻';
  if(a.veil.dataset.who!==item.resident||!a.bubble.textContent)a.bubble.textContent=person.restLines[Math.floor(Math.random()*person.restLines.length)];
  a.veil.dataset.who=item.resident;a.veil.style.setProperty('--c',person.color);
  a.counter.textContent=person.name+' · '+(a.position+1)+' / '+items.length;
  a.caption.textContent=title+' · '+dateLabel.format(new Date(item.createdAt));
  if(a.requested===item.src)return;
  const token=++a.loadToken;a.requested=item.src;a.img.hidden=true;a.loading.hidden=false;a.card.setAttribute('aria-busy','true');
  const current=()=>a.open&&!breakClosing&&a.mode==='photo'&&a.loadToken===token&&a.selected===item.imageId;
  const paint=image=>{
    if(!current())return;
    image.alt=person.name+' · '+title;image.hidden=false;if(a.img!==image){a.img.replaceWith(image);a.img=image;}
    a.loading.hidden=true;a.card.setAttribute('aria-busy','false');warmNeighbours(items,a.position);
  };
  const entry=loadArt(item.src);
  if(entry.ready)paint(entry.image);else entry.promise.then(paint,()=>{
    if(current())window.DeyiResidentRestImages?.markAssetFailed(item.imageId);
  });
}
window.DeyiResidentRestImages?.subscribe(()=>{
  const allowed=new Set(availableArt().map(i=>i.src));
  for(const url of artCache.keys())if(!allowed.has(url))artCache.delete(url);
  if(breakEl?.open&&!breakClosing)sync();
  else {clearTimeout(warmTimer);warmTimer=setTimeout(warmFirst,600);}
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
  showBreak(false,true);
}
setInterval(checkRest,FAST?2000:30000);
if(location.hash==='#rest-album'||location.hash==='#rest')showBreak(location.hash==='#rest-album');
if(FAST)window.__RP=()=>({due:Math.round(restDue-performance.now()),breakOpen:!!breakEl&&document.body.contains(breakEl.veil)});

})();
