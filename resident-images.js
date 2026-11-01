(function(root){'use strict';
// Public image snapshots only. A page never sends a generation request.
const IDS=['wood','fire','water'],MOODS=['normal','happy','quiet'];
const hash=/^[a-f0-9]{64}$/;
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const localHost=host=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
function endpointFor(value,location){
  const fallback=localHost(location.hostname)?new URL('/api/residents/images',location.href):new URL('https://45.134.36.23/api/residents/images');
  const url=new URL(value||fallback.href,location.href);
  if(url.username||url.password||url.hash||url.search||url.pathname!=='/api/residents/images')throw Error('invalid_image_endpoint');
  if(localHost(location.hostname)){
    if(!localHost(url.hostname)||!['http:','https:'].includes(url.protocol))throw Error('local_image_endpoint_required');
  }else if(url.protocol!=='https:'||url.hostname!=='45.134.36.23')throw Error('image_endpoint_refused');
  return url.href;
}
function normalize(value,endpoint){
  if(!value||value.format!=='deyi-resident-images-v1'||!hash.test(value.revision||'')||!stamp(value.publishedAt)||!Array.isArray(value.images)||value.images.length>9)throw Error('invalid_image_manifest');
  const origin=new URL(endpoint).origin,pairs=new Set();
  const images=value.images.map(item=>{
    if(!item||!IDS.includes(item.resident)||!MOODS.includes(item.mood)||!Number.isInteger(item.poseIndex)||item.poseIndex<0||!hash.test(item.imageId||'')||!stamp(item.createdAt)||item.source!=='generated'||!Number.isInteger(item.width)||item.width<1||item.width>8192||!Number.isInteger(item.height)||item.height<1||item.height>8192)throw Error('invalid_image_record');
    const expected='/api/residents/image-assets/'+item.imageId+'.png';
    if(item.url!==expected)throw Error('invalid_image_asset_url');
    const pair=item.resident+':'+item.mood;if(pairs.has(pair))throw Error('duplicate_image_slot');pairs.add(pair);
    return{resident:item.resident,mood:item.mood,poseIndex:item.poseIndex,imageId:item.imageId,createdAt:item.createdAt,url:expected,src:origin+expected,width:item.width,height:item.height,source:'generated'};
  });
  return{format:'deyi-resident-images-v1',revision:value.revision,publishedAt:value.publishedAt,images};
}
function selectImage(state,resident,{imageId=null,mood=null}={}){
  if(imageId==='original')return null;
  const images=(state.manifest?.images||[]).filter(image=>image.resident===resident).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const selected=imageId?images.find(image=>image.imageId===imageId):mood?(images.find(image=>image.mood===mood)||images.find(image=>image.mood==='normal')||images[0]):images[0];
  return selected&&!(state.failedImageIds||[]).includes(selected.imageId)?selected:null;
}
function makeClient({location,storage,fetcher,schedule,cancel,endpoint,interval=180000}){
  const url=endpointFor(endpoint,location),cacheKey='deyi-resident-images-v1:'+url,listeners=new Set();
  let started=false,timer=null,inFlight=null;
  let state={manifest:null,loading:true,unavailable:false,receivedAt:null,failedImageIds:[]};
  try{const saved=JSON.parse(storage.getItem(cacheKey)||'null');if(saved?.manifest)state={...state,manifest:normalize(saved.manifest,url),receivedAt:saved.receivedAt||null};}catch{}
  const notify=()=>{for(const fn of listeners)fn(state);};
  async function refresh(){
    if(inFlight)return inFlight;if(timer!==null){cancel(timer);timer=null;}
    inFlight=(async()=>{
      try{
        const response=await fetcher(url,{method:'GET',credentials:'omit',cache:'no-cache',redirect:'error',signal:AbortSignal.timeout(9000)});
        if(!response.ok)throw Error('image_manifest_unavailable');
        const manifest=normalize(await response.json(),url);
        if(state.manifest&&Date.parse(manifest.publishedAt)<Date.parse(state.manifest.publishedAt))throw Error('older_image_manifest');
        // Successful empty manifests are withdrawals, not generation failures.
        state={manifest,loading:false,unavailable:false,receivedAt:new Date().toISOString(),failedImageIds:[]};
        try{storage.setItem(cacheKey,JSON.stringify({manifest,receivedAt:state.receivedAt}));}catch{}
      }catch{state={...state,loading:false,unavailable:true};}
      finally{inFlight=null;notify();if(started)timer=schedule(refresh,interval);}
      return state;
    })();return inFlight;
  }
  return{endpoint:url,getState:()=>state,subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},refresh,
    select:(resident,options)=>selectImage(state,resident,options),
    markAssetFailed(imageId){if(!state.manifest?.images.some(image=>image.imageId===imageId)||state.failedImageIds.includes(imageId))return;state={...state,failedImageIds:[...state.failedImageIds,imageId]};notify();},
    start(){if(!started){started=true;refresh();}return this;},stop(){started=false;if(timer!==null)cancel(timer);timer=null;}};
}
if(typeof module!=='undefined'&&module.exports)module.exports={endpointFor,normalize,selectImage,makeClient};
if(!root||!root.document||root.DeyiResidentImages)return;
try{
  const storage={getItem(key){try{return root.localStorage.getItem(key);}catch{return null;}},setItem(key,value){try{root.localStorage.setItem(key,value);}catch{}}};
  const script=root.document.currentScript;
  root.DeyiResidentImages=makeClient({location:root.location,storage,fetcher:root.fetch.bind(root),schedule:root.setTimeout.bind(root),cancel:root.clearTimeout.bind(root),endpoint:script?.dataset.endpoint||root.document.querySelector('meta[name="resident-image-feed"]')?.content});
  root.DeyiResidentImages.start();root.dispatchEvent(new Event('deyi-resident-images-ready'));
}catch{root.dispatchEvent(new Event('deyi-resident-images-error'));}
})(typeof window==='undefined'?null:window);
