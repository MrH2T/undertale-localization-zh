// Public reading content only; bounded page image cache.
let database;
function open(){
  database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('undertale-reader-public-cache',1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('snapshot');db.createObjectStore('images');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return database;
}
async function transaction(store,mode,work){
  const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode),result=work(tx.objectStore(store));
    tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function cachedSnapshot(ref){try{const value=await transaction('snapshot','readonly',s=>s.get('last'));return value?.ref===ref?value:null;}catch{return null;}}
export async function saveSnapshot(snapshot){try{await transaction('snapshot','readwrite',s=>s.put(snapshot,'last'));}catch{/* cache is optional */}}
export async function cachedImage(key){if(!key)return null;try{return (await transaction('images','readonly',s=>s.get(key)))?.blob||null;}catch{return null;}}
export async function saveImage(key,blob){
  if(!key)return;try{
    await transaction('images','readwrite',s=>s.put({key,blob,time:Date.now()},key));
    const items=await transaction('images','readonly',s=>s.getAll());
    if(items.length>12){const old=items.sort((a,b)=>b.time-a.time).slice(12);await transaction('images','readwrite',s=>{for(const item of old)s.delete(item.key);});}
  }catch{/* cache is optional */}
}
export async function clearReadingCache(){try{await transaction('snapshot','readwrite',s=>s.clear());await transaction('images','readwrite',s=>s.clear());}catch{/* unavailable cache */}}
