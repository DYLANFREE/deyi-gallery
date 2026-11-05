(function(root){'use strict';
// Read-only public results. Loading this client never starts an agent.
const digest=/^[a-f0-9]{64}$/;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const local=name=>['localhost','127.0.0.1','[::1]','::1'].includes(name);
const endpointPath='/api/residents/fish';
function source(value){
 if(!value||typeof value.title!=='string'||!value.title.trim()||value.title.length>240||typeof value.url!=='string'||value.url.length>2048||/[\u0000-\u0020\\]/.test(value.url))throw Error('invalid_fish_source');
 let url=value.url;
 if(url.startsWith('/')){
  if(url.startsWith('//')||url.split(/[?#]/)[0].split('/').some(x=>{try{return ['.','..'].includes(decodeURIComponent(x));}catch{return true;}}))throw Error('invalid_fish_source');
 }else{
  const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port&&parsed.port!=='443'||local(parsed.hostname))throw Error('invalid_fish_source');
  url=parsed.href;
 }
 return{title:value.title,url};
}
function normalize(value){
 if(!value||value.format!=='deyi-gallery-fish-v1'||!digest.test(value.revision||'')||!stamp(value.publishedAt)||value.updatedAt!==null&&!stamp(value.updatedAt)||value.resident?.id!=='fish'||value.resident?.name!=='大肥鱼'||!Array.isArray(value.entries)||value.entries.length>200)throw Error('invalid_fish_feed');
 const seen=new Set();const entries=value.entries.map(entry=>{
  if(!entry||!digest.test(entry.id||'')||seen.has(entry.id)||typeof entry.body!=='string'||!entry.body.trim()||entry.body.length>12000||!stamp(entry.createdAt)||!Array.isArray(entry.sources)||entry.sources.length>10)throw Error('invalid_fish_entry');
  seen.add(entry.id);return{id:entry.id,body:entry.body,createdAt:entry.createdAt,sources:entry.sources.map(source)};
 }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
 return{format:'deyi-gallery-fish-v1',revision:value.revision,publishedAt:value.publishedAt,updatedAt:value.updatedAt,resident:{id:'fish',name:'大肥鱼'},entries};
}
function endpointFor(value,location){
 const fallback=local(location.hostname)?new URL(endpointPath,location.href):new URL('https://45.134.36.23'+endpointPath);
 const url=new URL(value||fallback.href,location.href);
 if(url.username||url.password||url.search||url.hash||url.pathname!==endpointPath)throw Error('invalid_fish_endpoint');
 if(local(location.hostname)){
  if(!local(url.hostname)||!['http:','https:'].includes(url.protocol))throw Error('local_fish_endpoint_required');
 }else if(url.protocol!=='https:'||url.hostname!=='45.134.36.23'||url.port)throw Error('fish_endpoint_refused');
 return url.href;
}
function makeClient({location,storage,fetcher,schedule,cancel,endpoint,interval=180000}){
 const url=endpointFor(endpoint,location),cacheKey='deyi-gallery-fish-v1:'+url,listeners=new Set();let timer=null,inFlight=null,started=false;
 let state={feed:null,loading:true,unavailable:false,receivedAt:null};
 try{const saved=JSON.parse(storage.getItem(cacheKey)||'null');if(saved?.feed)state={feed:normalize(saved.feed),loading:true,unavailable:false,receivedAt:stamp(saved.receivedAt)?saved.receivedAt:null};}catch{}
 const notify=()=>{for(const fn of listeners)fn(state);};
 async function refresh(){
  if(inFlight)return inFlight;if(timer!==null){cancel(timer);timer=null;}
  inFlight=(async()=>{
   try{
    const response=await fetcher(url,{method:'GET',credentials:'omit',redirect:'error',cache:'no-cache',signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('fish_feed_unavailable');const feed=normalize(await response.json());
    if(state.feed&&Date.parse(feed.publishedAt)<Date.parse(state.feed.publishedAt))throw Error('older_fish_snapshot');
    state={feed,loading:false,unavailable:false,receivedAt:new Date().toISOString()};
    try{storage.setItem(cacheKey,JSON.stringify({feed,receivedAt:state.receivedAt}));}catch{}
   }catch{state={...state,loading:false,unavailable:true};}
   finally{inFlight=null;notify();if(started)timer=schedule(refresh,interval);}
   return state;
  })();return inFlight;
 }
 return{endpoint:url,getState:()=>state,subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},refresh,start(){if(!started){started=true;refresh();}return this;},stop(){started=false;if(timer!==null)cancel(timer);timer=null;}};
}
if(typeof module!=='undefined'&&module.exports)module.exports={normalize,endpointFor,makeClient};
if(!root?.document||root.DeyiGalleryFish)return;
try{
 const storage={getItem(key){try{return root.localStorage.getItem(key);}catch{return null;}},setItem(key,value){try{root.localStorage.setItem(key,value);}catch{}}};
 root.DeyiGalleryFish=makeClient({location:root.location,storage,fetcher:root.fetch.bind(root),schedule:root.setTimeout.bind(root),cancel:root.clearTimeout.bind(root),endpoint:root.document.currentScript?.dataset.endpoint});
 root.DeyiGalleryFish.start();
}catch{root.dispatchEvent(new Event('deyi-gallery-fish-error'));}
})(typeof window==='undefined'?null:window);
