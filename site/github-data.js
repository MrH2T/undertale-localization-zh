// Private data is fetched only from GitHub, with a per-tab, read-only credential.
export const REPO = 'MrH2T/undertale-localization-zh';
export const PAGE_PREFIX = 'private/content/viewer/';
export const INDEX_PATH = 'private/content/reader-index.json';
export const IMAGE_PREFIX = 'private/reader/assets/';
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const PAGE_PATTERN = /^private\/content\/viewer\/p(\d{4})\.json$/;

export function reconcileIndex(tree, index) {
  const cached = new Map((index?.entries || []).map(e => [e.path, e]));
  return tree.filter(e => e.type === 'blob' && PAGE_PATTERN.test(e.path)).map(e => {
    const hit = cached.get(e.path);
    return {path:e.path, sha:e.sha, number:Number(e.path.match(PAGE_PATTERN)[1]),
      page:hit?.blob === e.sha ? hit.page : null};
  }).sort((a,b) => a.number-b.number);
}

export class GitHubData {
  #token; #controller = new AbortController(); #queue = Promise.resolve();
  constructor(token, {fetcher=fetch, local=false}={}) {this.#token=token;this.fetcher=(...args)=>fetcher(...args);this.local=local;}
  close() {this.#controller.abort();this.#token='';}
  async request(path, raw=false) {
    const run = async () => {
      this.#controller.signal.throwIfAborted();
      const root=this.local?'./preview-api/':'https://api.github.com/repos/'+REPO+'/';
      const response=await this.fetcher(root+path, {headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',...(!this.local?{Authorization:'Bearer '+this.#token}: {})},credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:this.#controller.signal});
      if(!response.ok){
        let message='读取失败（HTTP '+response.status+'）';
        if(response.status===401)message='令牌无效或已过期，请重新连接。';
        if(response.status===404)message='该仓库、版本或文件不存在，或当前令牌没有访问权限。';
        if(response.status===403)message='GitHub 拒绝读取。请检查 Contents: Read-only 权限及令牌有效期。';
        if(response.status===429||response.headers.get('x-ratelimit-remaining')==='0')message='GitHub 请求额度暂时用尽，请稍后再试。';
        const error=new Error(message);error.status=response.status;throw error;
      }
      return response;
    };
    const pending=this.#queue.then(run,run);this.#queue=pending.then(()=>{},()=>{});return pending;
  }
  async json(path) {return (await this.request(path)).json();}
  async file(path,sha) {return this.request('contents/'+encodePath(path)+'?ref='+encodeURIComponent(sha),true);}
  async snapshot(ref, progress=()=>{}) {
    progress('确定版本…');
    const commit=await this.json('commits/'+encodeURIComponent(ref));
    const sha=commit.sha;
    if(!/^[a-f0-9]{40}$/.test(sha))throw Error('GitHub 返回的版本编号无效。');
    const result=await this.json('git/trees/'+commit.commit.tree.sha+'?recursive=1');
    if(result.truncated)throw Error('仓库文件清单不完整，无法可靠读取此版本。');
    let index=null;
    if(result.tree.some(e=>e.path===INDEX_PATH))index=await (await this.file(INDEX_PATH,sha)).json();
    const entries=reconcileIndex(result.tree,index);
    if(!entries.length)throw Error('此版本没有逐页稿件。');
    let completed=0;
    for(const entry of entries){
      this.#controller.signal.throwIfAborted();
      if(!entry.page)entry.page=await (await this.file(entry.path,sha)).json();
      if(entry.page.pdf_page!==entry.number||!Array.isArray(entry.page.blocks))throw Error('页面数据无效：'+entry.path);
      progress('读取稿件 '+(++completed)+' / '+entries.length);
    }
    return {sha,ref,date:commit.commit.committer?.date||'',pages:entries.map(e=>e.page),tree:new Map(result.tree.map(e=>[e.path,e.sha]))};
  }
  async image(page,snapshot) {
    const path=IMAGE_PREFIX+'p'+String(page.pdf_page).padStart(4,'0')+'.jpg';
    if(!snapshot.tree.has(path))return null;
    return (await this.file(path,snapshot.sha)).blob();
  }
  async refs() {
    const result=[];
    for(const route of ['branches?per_page=100','tags?per_page=100']){
      const rows=await this.json(route);for(const row of rows)result.push(row.name);
    }
    return [...new Set(result)];
  }
}

export function searchPages(pages,query,{language='both',matchCase=false}={}) {
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
