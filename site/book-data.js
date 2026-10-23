// Public static reading files. No login, token, or GitHub API requests.
export const REPO='MrH2T/undertale-localization-zh';
export const PAGE_PREFIX='private/content/viewer/';
export const IMAGE_PREFIX='images/';

export class BookData {
  #controller=new AbortController();
  constructor({fetcher=fetch}={}){this.fetcher=(...args)=>fetcher(...args);}
  close(){this.#controller.abort();}
  async file(path,cache='default'){
    this.#controller.signal.throwIfAborted();
    const response=await this.fetcher('./data/'+path,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache,signal:this.#controller.signal});
    if(!response.ok)throw Error(response.status===404?'这个版本尚未发布。':'读取失败，请稍后重试。');
    return response;
  }
  async catalog(){return (await this.file('catalog.json','no-cache')).json();}
  async snapshot(ref,progress=()=>{},cached=null){
    progress('载入中…');
    const catalog=await this.catalog(),version=catalog.versions.find(v=>v.ref===ref||v.sha===ref);
    if(!version||!/^[a-f0-9]{40}$/.test(version.sha))throw Error('这个版本尚未发布。');
    if(cached?.sha===version.sha&&cached.ref===ref&&cached.tree instanceof Map&&cached.pages?.length)return cached;
    const data=await (await this.file('versions/'+version.sha+'/index.json')).json();
    if(!Array.isArray(data.pages)||!data.pages.length||data.sha!==version.sha)throw Error('页面数据不完整，请稍后重试。');
    return {sha:version.sha,ref,date:version.date,pages:data.pages,tree:new Map(Object.entries(data.images||{}))};
  }
  async image(page,snapshot){
    const key=snapshot.tree.get(IMAGE_PREFIX+'p'+String(page.pdf_page).padStart(4,'0')+'.jpg');
    if(!key)return null;
    if(!/^[a-f0-9]{40}$/.test(key))throw Error('书页图片地址无效。');
    return (await this.file('images/'+key+'.jpg')).blob();
  }
  async refs(){return (await this.catalog()).versions.map(v=>v.ref);}
}

export function searchPages(pages,query,{language='both',matchCase=false}={}){
  const needle=matchCase?query.trim():query.trim().toLocaleLowerCase();if(!needle)return [];
  const results=[];
  for(const page of pages)for(const block of page.blocks){
    for(const key of language==='both'?['translation','source']:[language]){
      const text=block[key]?.text||'',offset=(matchCase?text:text.toLocaleLowerCase()).indexOf(needle);
      if(offset>=0){results.push({page:page.pdf_page,block:block.id,title:page.title,language:key,text,offset,length:needle.length});break;}
    }
  }
  return results;
}
