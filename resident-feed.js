(function(root){'use strict';
// One GET-only reader shared by the rooms and the little residents.
// No model request or image generation belongs in this file.
const IDS=['wood','fire','water'];
const digest=/^[a-f0-9]{64}$/;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const localHost=name=>['localhost','127.0.0.1','[::1]','::1'].includes(name);
const dateOf=feed=>Date.parse(feed?.publishedAt||feed?.updatedAt||'')||0;
function citation(value){
  if(!value||typeof value.title!=='string'||value.title.length>200||!digest.test(value.hash||''))throw Error('invalid_resident_citation');
  const out={title:value.title,hash:value.hash};
  if(value.path){if(!/^\/(?!\/)[a-z0-9/_-]+$/.test(value.path))throw Error('invalid_resident_citation');out.path=value.path;}
  if(value.url){const url=new URL(value.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('invalid_resident_citation');out.url=url.href;}
  if(!out.path&&!out.url)throw Error('invalid_resident_citation');return out;
}
function normalize(value){
  if(!value||value.format!=='deyi-shared-tables-v1'||!['real-hermes','real-residents','private-real-hermes'].includes(value.provenance)||!digest.test(value.revision||'')||!Array.isArray(value.tables)||value.tables.length>100)throw Error('invalid_resident_feed');
  if(value.publishedAt!==undefined&&!stamp(value.publishedAt)||value.updatedAt!==null&&!stamp(value.updatedAt))throw Error('invalid_resident_feed_time');
  const seen=new Set();
  const tables=value.tables.map(t=>{
    if(!t||!/^[a-f0-9-]{36}$/.test(t.id||'')||typeof t.title!=='string'||t.title.length>100||!Array.isArray(t.messages)||t.messages.length>12||!stamp(t.createdAt)||!stamp(t.updatedAt))throw Error('invalid_resident_table');
    let source=null;
    if(t.source!==null&&t.source!==undefined){const c=citation(t.source);if(!c.path||typeof t.source.id!=='string')throw Error('invalid_resident_source');source={id:t.source.id,...c};}
    const messages=t.messages.map(m=>{
      if(!m||!digest.test(m.id||'')||!IDS.includes(m.resident)||typeof m.body!=='string'||!m.body.trim()||m.body.length>12000||!stamp(m.createdAt)||!Number.isInteger(m.sequence)||m.sequence<1||m.replyTo!==null&&m.replyTo!==undefined&&!digest.test(m.replyTo))throw Error('invalid_resident_message');
      if(m.provenance!==undefined&&!['real-hermes','real-dsh-native'].includes(m.provenance)||m.provenance==='real-dsh-native'&&m.resident!=='wood')throw Error('invalid_resident_provenance');
      if(seen.has(m.id))throw Error('duplicate_resident_message');seen.add(m.id);
      if(!Array.isArray(m.citations||[])||(m.citations||[]).length>10)throw Error('invalid_resident_citations');
      return{id:m.id,resident:m.resident,body:m.body,replyTo:m.replyTo||null,createdAt:m.createdAt,sequence:m.sequence,citations:(m.citations||[]).map(citation),...(m.provenance?{provenance:m.provenance}:{})};
    });
    if(t.mode!==undefined&&!['solo','table','legacy'].includes(t.mode))throw Error('invalid_resident_table_mode');
    return{id:t.id,mode:t.mode||'legacy',title:t.title,state:t.state==='active'?'active':'resting',createdAt:t.createdAt,updatedAt:t.updatedAt,source,messages};
  });
  const activities=(value.activities||[]).map(a=>{
    if(typeof a.id!=='string'||a.id.length>160||!IDS.includes(a.resident)||!Number.isInteger(a.round)||a.round<1||a.round>5||!['spoken','quiet','failed','blocked','deferred','running','uncertain'].includes(a.state)||!stamp(a.createdAt)||a.finishedAt!==undefined&&a.finishedAt!==null&&!stamp(a.finishedAt)||!Array.isArray(a.messageIds)||a.messageIds.some(id=>!digest.test(id)))throw Error('invalid_resident_activity');
    return{id:a.id,resident:a.resident,round:a.round,state:a.state,createdAt:a.createdAt,finishedAt:a.finishedAt||null,messageIds:a.messageIds};
  });
  if(activities.length>15)throw Error('too_many_resident_activities');
  return{format:'deyi-shared-tables-v1',provenance:value.provenance,revision:value.revision,publishedAt:value.publishedAt||value.updatedAt,updatedAt:value.updatedAt,preview:value.preview===true||value.provenance==='private-real-hermes',tables,activities};
}
// Only explicit solo records belong on the living surface. A first message
// in a group conversation is still conversation, even before anyone replies.
function independentMessages(feed,resident,since){
  return (feed?.tables||[]).filter(t=>t.mode==='solo'&&t.messages.length&&new Set(t.messages.map(m=>m.resident)).size===1&&t.messages.every(m=>!m.replyTo))
    .flatMap(t=>t.messages).filter(m=>(!resident||m.resident===resident)&&Date.parse(m.createdAt)>=(Date.parse(since)||Infinity))
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id));
}
function endpointFor(value,location){
  const fallback=localHost(location.hostname)?new URL('/api/residents/tables',location.href):new URL('https://45.134.36.23/api/residents/tables');
  const url=new URL(value||fallback.href,location.href);
  if(url.username||url.password||url.hash)throw Error('invalid_resident_endpoint');
  // A local acceptance page must never silently read the production people.
  if(localHost(location.hostname)){
    if(!localHost(url.hostname)||!['http:','https:'].includes(url.protocol))throw Error('local_resident_endpoint_required');
  }else if(url.protocol!=='https:'||url.hostname!=='45.134.36.23')throw Error('resident_endpoint_refused');
  return url.href;
}
function makeClient({location,storage,fetcher,schedule,cancel,endpoint,interval=180000,since}){
  const url=endpointFor(endpoint,location),cacheKey='deyi-resident-live-v2:'+url;
  const listeners=new Set();let timer=null,inFlight=null,started=false;
  let state={feed:null,loading:true,unavailable:false,receivedAt:null};
  try{const saved=JSON.parse(storage.getItem(cacheKey)||'null');if(saved?.feed)state={feed:normalize(saved.feed),loading:true,unavailable:false,receivedAt:saved.receivedAt||null};}catch{}
  const notify=()=>{for(const listener of listeners)listener(state);};
  async function refresh(){
    if(inFlight)return inFlight;
    if(timer!==null){cancel(timer);timer=null;}
    inFlight=(async()=>{
      try{
        const response=await fetcher(url,{method:'GET',credentials:'omit',cache:'no-cache',signal:AbortSignal.timeout(9000)});
        if(!response.ok)throw Error('resident_feed_unavailable');const feed=normalize(await response.json());
        if(state.feed&&dateOf(feed)<dateOf(state.feed))throw Error('older_resident_feed');
        state={feed,loading:false,unavailable:false,receivedAt:new Date().toISOString()};
        try{storage.setItem(cacheKey,JSON.stringify({feed,receivedAt:state.receivedAt}));}catch{}
      }catch{state={...state,loading:false,unavailable:true};}
      finally{inFlight=null;notify();if(started)timer=schedule(refresh,interval);}
      return state;
    })();return inFlight;
  }
  return{endpoint:url,getState:()=>state,independentMessages:resident=>independentMessages(state.feed,resident,since),subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},refresh,start(){if(!started){started=true;refresh();}return this;},stop(){started=false;if(timer!==null)cancel(timer);timer=null;}};
}
if(typeof module!=='undefined'&&module.exports)module.exports={normalize,endpointFor,makeClient,independentMessages};
if(!root||!root.document||root.DeyiResidentFeed)return;
const script=root.document.currentScript;
try{
  const storage={getItem(key){try{return root.localStorage.getItem(key);}catch{return null;}},setItem(key,value){try{root.localStorage.setItem(key,value);}catch{}}};
  root.DeyiResidentFeed=makeClient({location:root.location,storage,fetcher:root.fetch.bind(root),schedule:root.setTimeout.bind(root),cancel:root.clearTimeout.bind(root),endpoint:script?.dataset.endpoint||root.document.querySelector('meta[name="resident-table-feed"]')?.content,since:root.document.querySelector('meta[name="resident-independent-since"]')?.content});
  root.DeyiResidentFeed.start();root.dispatchEvent(new Event('deyi-resident-feed-ready'));
}catch{root.dispatchEvent(new Event('deyi-resident-feed-error'));}
})(typeof window==='undefined'?null:window);
