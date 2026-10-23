import {BookData, REPO, PAGE_PREFIX, IMAGE_PREFIX, searchPages} from './book-data.js';
import {cachedSnapshot,saveSnapshot,cachedImage,saveImage} from './reader-cache.js';

const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const state={client:null,snapshot:null,page:null,mode:'overlay',zoom:'fit',scale:1,selected:null,operation:0,pageOperation:0,urls:new Map(),results:[],resultLimit:100,sidebar:'toc',fonts:null};
const preferenceKey='undertale-reader-position-v1',bookmarkKey='undertale-reader-bookmarks-v1';
function stored(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function remember(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* reading remains available */}}
let bookmarks=stored(bookmarkKey,[]);if(!Array.isArray(bookmarks))bookmarks=[];
const initialHash=new URLSearchParams(location.hash.slice(1));
const preference=stored(preferenceKey,{});
const requestedPage=Number(initialHash.get('page')||preference.page||1);
$('version-ref').value=initialHash.get('ref')||preference.ref||'main';
if(['overlay','source','compare','text'].includes(preference.mode))state.mode=preference.mode;
if([...$('zoom').options].some(o=>o.value===preference.zoom)){state.zoom=preference.zoom;$('zoom').value=state.zoom;}

function status(message,error=false){$('reading-status').textContent=message;$('reading-status').classList.toggle('error',error);}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function failure(error){if(error.name!=='AbortError'){status(error.message,true);toast(error.message);}}
function opened(id){if(!$(id).open)$(id).showModal();}
function hash(){const params=new URLSearchParams({page:state.page.pdf_page,ref:state.snapshot.ref});if(state.selected)params.set('block',state.selected);history.replaceState(null,'','#'+params);remember(preferenceKey,{page:state.page.pdf_page,ref:state.snapshot.ref,mode:state.mode,zoom:state.zoom});}
function setAvailable(yes){for(const id of ['contents','search-open','mode-overlay','mode-source','mode-compare','mode-text','zoom-out','zoom-in','bookmark','version-open','page-number'])$(id).disabled=!yes;}
function clearUrls(){for(const url of state.urls.values())URL.revokeObjectURL(url);state.urls.clear();}
function disconnect(){
  state.operation++;state.pageOperation++;state.client?.close();state.client=null;state.snapshot=null;state.page=null;state.selected=null;state.results=[];clearUrls();
  for(const id of ['overlay-layer','mask-layer','comparison-body','text-reader','side-list'])$(id).replaceChildren();
  $('page-image').removeAttribute('src');$('page-stage').hidden=$('text-reader').hidden=$('comparison').hidden=$('sidebar').hidden=true;
  $('welcome').hidden=false;$('image-message').hidden=true;$('version-status').textContent='';$('version-current').textContent='';$('page-total').textContent='';
  $('search-summary').textContent='';$('search-query').value='';$('edit-page').hidden=true;$('edit-page').removeAttribute('href');
  $('retry-load').disabled=$('version-load').disabled=$('version-latest').disabled=false;
  setAvailable(false);$('previous').disabled=$('next').disabled=true;status('');
}
async function loadFonts(page){
  const requests=new Map();
  function add(font,text){requests.set(font,(requests.get(font)||'')+text);}
  for(const block of page.blocks){
    const sans=['heading','subheading','caption','aside'].includes(block.kind)||block.layout.style==='chapter-heading';
    add((block.layout.font_weight||400)+' 20px "Book '+(sans?'Sans':'Serif')+' SC"',block.translation.text);
    for(const token of BookComposition.tokenize(block.translation.text,block.translation.spans)){
      if(token.lang==='en')add((token.italic?'italic ':'')+'400 20px "Book Serif Latin"',token.text);
      if(token.lang==='ja')add('400 20px "Book Serif JP"',token.text);
    }
  }
  const all=await Promise.all([...requests].filter(([,text])=>text.length).map(([font,text])=>document.fonts.load(font,text)));
  if(all.some(font=>!font.length))throw Error('书页字体未能加载，请检查网络后重试。');
}
async function start(){
  const pageNumber=state.page?.pdf_page||requestedPage;
  disconnect();state.client=new BookData();const operation=state.operation;
  $('retry-load').disabled=true;status('载入中…');
  try{
    const ref=$('version-ref').value.trim()||'main',cached=await cachedSnapshot(ref);
    if(operation!==state.operation)return;
    if(cached){await applySnapshot(cached,pageNumber);if(operation!==state.operation)return;$('version-status').textContent='已保存版本';}
    await loadVersion(ref,pageNumber);if(operation!==state.operation)return;
  }
  catch(e){if(operation===state.operation&&e.name!=='AbortError'){if(state.snapshot){status('显示已保存版本');$('version-status').textContent='尚未更新';}else failure(e);}}
  finally{if(operation===state.operation)$('retry-load').disabled=false;}
}
async function applySnapshot(snapshot,pageNumber){
  const operation=state.operation;
  state.snapshot=snapshot;state.pageOperation++;clearUrls();state.page=null;state.results=[];
  $('side-list').replaceChildren();$('search-summary').textContent='';$('version-ref').value=snapshot.ref;
  $('version-status').textContent=snapshot.ref==='main'?'最新版':snapshot.ref;
  $('version-current').textContent=(snapshot.date?new Date(snapshot.date).toLocaleString()+' · ':'')+snapshot.sha.slice(0,7);
  $('page-total').textContent='/ '+snapshot.pages.length;$('page-number').max=Math.max(...snapshot.pages.map(p=>p.pdf_page));
  setAvailable(true);$('welcome').hidden=true;
  await goPage(snapshot.pages.some(p=>p.pdf_page===pageNumber)?pageNumber:snapshot.pages[0].pdf_page,initialHash.get('block'));
  if(operation!==state.operation)return;
  if(!$('sidebar').hidden){if(state.sidebar==='search')search();else showContents();}
}
async function loadVersion(ref,pageNumber=state.page?.pdf_page||requestedPage){
  if(!state.client)throw Error('请重新加载页面。');
  const client=state.client,operation=state.operation;$('version-load').disabled=$('version-latest').disabled=true;
  $('version-message').textContent='读取中…';
  try{
    const snapshot=await client.snapshot(ref,message=>{if(operation===state.operation){if(!state.page)status(message);$('version-message').textContent=message;}},state.snapshot);
    if(operation!==state.operation)return;
    // Keep the page the reader reached while the saved copy was being refreshed.
    if(snapshot.sha!==state.snapshot?.sha||snapshot.ref!==state.snapshot?.ref||snapshot.format!==state.snapshot?.format||!state.page)await applySnapshot(snapshot,state.snapshot?.ref===ref?(state.page?.pdf_page||pageNumber):pageNumber);
    $('version-status').textContent=ref==='main'?'最新版':ref;
    if(operation!==state.operation)return;
    await saveSnapshot(snapshot);
    if(operation!==state.operation)return;
    $('version-message').textContent='';$('version-dialog').close();
  }finally{if(operation===state.operation)$('version-load').disabled=$('version-latest').disabled=false;}
}
async function imageFor(page,snapshot){
  const path=IMAGE_PREFIX+'p'+String(page.pdf_page).padStart(4,'0')+'.jpg',key=snapshot.tree.get(path);
  if(!key)return null;
  if(state.urls.has(key))return state.urls.get(key);
  const client=state.client;let blob=await cachedImage(key);
  if(client!==state.client||snapshot!==state.snapshot)return null;
  if(!blob){blob=await client.image(page,snapshot);if(client!==state.client||snapshot!==state.snapshot)return null;if(blob)void saveImage(key,blob);}
  if(client!==state.client||snapshot!==state.snapshot)return null;
  if(!blob)return null;
  const url=URL.createObjectURL(blob);state.urls.set(key,url);
  while(state.urls.size>4){const first=state.urls.keys().next().value;URL.revokeObjectURL(state.urls.get(first));state.urls.delete(first);}
  return url;
}
async function goPage(number,block=null){
  if(!state.snapshot)return;
  const summary=state.snapshot.pages.find(p=>p.pdf_page===number);if(!summary){toast('没有这一页。');$('page-number').value=state.page?.pdf_page||1;return;}
  const operation=++state.pageOperation,snapshot=state.snapshot,client=state.client;status('读取第 '+number+' 页…');
  let image=null,imageError='';
  // Page text/fonts and the reading image load concurrently; search data is deferred.
  const imageReady=imageFor(summary,snapshot).catch(e=>{if(e.name!=='AbortError')imageError=e.message;return null;});
  const page=await client.page(number,snapshot);
  if(operation!==state.pageOperation||snapshot!==state.snapshot)return;
  const loaded=await Promise.all([imageReady,state.mode==='source'?Promise.resolve():loadFonts(page)]);image=loaded[0];
  if(operation!==state.pageOperation||snapshot!==state.snapshot)return;
  if(image){const img=new Image();img.src=image;try{await img.decode();}catch{image=null;imageError='书页图片未能解码。';}}
  if(operation!==state.pageOperation||snapshot!==state.snapshot)return;
  state.page={...page,image_url:image};state.selected=page.blocks.some(b=>b.id===block)?block:null;
  $('page-number').value=number;$('page-image').alt='原书第 '+number+' 页';
  if(image)$('page-image').src=image;else $('page-image').removeAttribute('src');
  $('image-message').hidden=!!image;$('image-message').textContent=imageError?imageError+' 已显示此页文本，可切换页面后重试。':'此历史版本未包含书页图片，以下显示该版本的原文和译文。';
  $('edit-page').href='https://github.com/'+REPO+'/edit/main/'+PAGE_PREFIX+'p'+String(number).padStart(4,'0')+'.json';$('edit-page').hidden=false;
  $('edit-page').title=snapshot.ref==='main'?'修改此页':'修改最新版本中的此页';
  const index=snapshot.pages.findIndex(p=>p.pdf_page===number);$('previous').disabled=index===0;$('next').disabled=index===snapshot.pages.length-1;
  updateBookmark();render();$('viewport').scrollTo(0,0);if(state.selected)selectBlock(state.selected,true);
  status('第 '+number+' 页 · '+page.title);document.title=page.title+' · 书籍阅读';hash();
  document.body.dataset.readerFirstPageMs??=String(Math.round(performance.now()));
  document.body.dataset.readerPage=String(number);
  void saveSnapshot(snapshot);
}
function render(){
  if(!state.page)return;
  const text=state.mode==='text'||!state.page.image_url;
  $('page-stage').hidden=text;$('text-reader').hidden=!text;
  for(const mode of ['overlay','source','compare','text'])$('mode-'+mode).setAttribute('aria-pressed',String(state.mode===mode));
  $('comparison').hidden=state.mode!=='compare';
  if(text)renderText();
  else{
    const [w,h]=state.page.reference_size;Object.assign($('page-content').style,{width:w+'px',height:h+'px'});
    BookRenderer.render(state.page,{mode:state.mode==='source'?'source':'overlay',masks:$('mask-layer'),overlay:$('overlay-layer'),onSelect:id=>selectBlock(id,false)});
    resize(false);
  }
  if(state.mode==='compare'&&!state.selected)state.selected=state.page.blocks[0]?.id||null;
  highlight();renderComparison();
}
function renderText(){
  const article=$('text-reader');article.replaceChildren(node('h1','',state.page.title));
  if(!state.page.blocks.length){article.append(node('p','','此页没有可搜索的文字，请查看原书图片。'));return;}
  for(const block of state.page.blocks){
    const section=node('section');section.id='text-'+block.id;section.dataset.block=block.id;
    const source=node('p','original',block.source.text),translation=node(['heading','subheading'].includes(block.kind)?'h2':'p','translated');
    BookRenderer.formattedInline(translation,block.translation.text,block.translation.spans||[]);
    const locate=node('button','','定位书页');locate.addEventListener('click',()=>{state.mode='overlay';render();selectBlock(block.id,true);hash();});
    if(!state.page.image_url)locate.disabled=true;section.append(source,translation,locate);article.append(section);
  }
}
function highlight(){
  for(const el of $('overlay-layer').querySelectorAll('[data-block]'))el.classList.toggle('reader-selected',el.dataset.block===state.selected);
  for(const el of $('text-reader').querySelectorAll('section'))el.classList.toggle('selected',el.dataset.block===state.selected);
}
function renderComparison(){
  const host=$('comparison-body');host.replaceChildren();const block=state.page?.blocks.find(b=>b.id===state.selected);
  if(!block){host.append(node('p','','点击书页中的段落，查看原文和译文。'));return;}
  host.append(node('h3','','原文'),node('p','original',block.source.text),node('h3','','译文'));
  const translation=node('p','translated');BookRenderer.formattedInline(translation,block.translation.text,block.translation.spans||[]);host.append(translation);
  const target=block.structure?.target_pdf_page||block.target_pdf_page;
  if(target){const button=node('button','','前往第 '+target+' 页');button.addEventListener('click',()=>goPage(target).catch(failure));host.append(button);}
  const link=node('a','','查看此页文件 ↗');link.href='https://github.com/'+REPO+'/blob/'+state.snapshot.sha+'/'+PAGE_PREFIX+'p'+String(state.page.pdf_page).padStart(4,'0')+'.json';link.target='_blank';link.rel='noopener noreferrer';host.append(link);
}
function selectBlock(id,scroll){
  if(!state.page?.blocks.some(b=>b.id===id))return;state.selected=id;highlight();renderComparison();hash();
  if(scroll){const el=$(($('text-reader').hidden?'translation-':'text-')+id)||$('source-'+id);el?.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});}
}
function resize(preserve=true){
  if(!state.page||$('page-stage').hidden)return;
  const vp=$('viewport'),[w,h]=state.page.reference_size,old=state.scale;
  const cx=(vp.scrollLeft+vp.clientWidth/2)/old,cy=(vp.scrollTop+vp.clientHeight/2)/old;
  const available=vp.clientWidth-(innerWidth<=900?16:24);
  state.scale=state.zoom==='fit'?available/w:state.zoom==='page'?Math.min(available/w,(vp.clientHeight-24)/h):Number(state.zoom);
  state.scale=Math.max(.1,state.scale);$('page-stage').style.width=w*state.scale+'px';$('page-stage').style.height=h*state.scale+'px';$('page-content').style.transform='scale('+state.scale+')';
  if(preserve&&Math.abs(old-state.scale)>.001)vp.scrollTo(Math.max(0,cx*state.scale-vp.clientWidth/2),Math.max(0,cy*state.scale-vp.clientHeight/2));
}
function move(delta){if(!state.snapshot||!state.page)return;const index=state.snapshot.pages.findIndex(p=>p.pdf_page===state.page.pdf_page),page=state.snapshot.pages[index+delta];if(page)goPage(page.pdf_page).catch(failure);}
function zoomStep(delta){const steps=[.5,.75,1,1.25,1.5,2],next=delta>0?steps.find(v=>v>state.scale+.01):steps.slice().reverse().find(v=>v<state.scale-.01);if(next){state.zoom=String(next);$('zoom').value=state.zoom;resize();if(state.page)hash();}}
function openSidebar(kind){state.sidebar=kind;$('sidebar').hidden=false;$('side-title').textContent=kind==='search'?'全文搜索':'目录';$('search-tools').hidden=kind!=='search';resize();}
function tocButton(page,cls='toc-item'){
  const button=node('button',cls);button.append(node('span','',String(page.pdf_page)),node('span','',page.title));button.addEventListener('click',()=>{if(innerWidth<=900)$('sidebar').hidden=true;goPage(page.pdf_page).catch(failure);});return button;
}
function showContents(){
  if(!state.snapshot)return;openSidebar('toc');const host=$('side-list');host.replaceChildren();
  const marked=state.snapshot.pages.filter(p=>bookmarks.includes(p.pdf_page));
  if(marked.length){host.append(node('h3','','书签'));marked.forEach(p=>host.append(tocButton(p,'bookmark-item')));}
  host.append(node('h3','','全部页面'));
  for(const page of state.snapshot.pages)host.append(tocButton(page,'toc-item'+(page.chapter||page.page_role==='chapter'||page.blocks?.some(b=>b.layout.style==='chapter-heading')?' chapter':'')));
}
function updateBookmark(){const marked=bookmarks.includes(state.page?.pdf_page);$('bookmark').setAttribute('aria-pressed',String(marked));$('bookmark').textContent=marked?'已加书签':'书签';}
async function search(){
  if(!state.snapshot)return;openSidebar('search');
  const snapshot=state.snapshot,client=state.client,query=$('search-query').value;
  if(!query.trim()){state.results=[];$('search-summary').textContent='输入词语搜索全书。';renderResults();return;}
  $('search-summary').textContent='搜索中…';
  try{
    const pages=await client.searchData(snapshot);
    if(snapshot!==state.snapshot||client!==state.client||query!==$('search-query').value)return;
    state.results=searchPages(pages,query,{language:$('search-language').value,matchCase:$('search-case').checked});state.resultLimit=100;
    $('search-summary').textContent='找到 '+state.results.length+' 段';renderResults();
  }catch(error){if(snapshot===state.snapshot&&error.name!=='AbortError')$('search-summary').textContent='搜索暂时无法加载，请重试。';}
}
function renderResults(){
  const host=$('side-list');host.replaceChildren();
  for(const result of state.results.slice(0,state.resultLimit)){
    const button=node('button','result');button.append(node('strong','','第 '+result.page+' 页 · '+(result.language==='translation'?'译文':'原文')));
    const excerpt=node('span'),start=Math.max(0,result.offset-25),end=Math.min(result.text.length,result.offset+result.length+75);
    excerpt.append(document.createTextNode((start?'…':'')+result.text.slice(start,result.offset)),node('mark','',result.text.slice(result.offset,result.offset+result.length)),document.createTextNode(result.text.slice(result.offset+result.length,end)+(end<result.text.length?'…':'')));button.append(excerpt);
    button.addEventListener('click',()=>{if(innerWidth<=900)$('sidebar').hidden=true;if(result.language==='source'&&state.mode!=='text')state.mode='compare';goPage(result.page,result.block).catch(failure);});host.append(button);
  }
  if(state.results.length>state.resultLimit){const more=node('button','result','继续显示结果');more.addEventListener('click',()=>{state.resultLimit+=100;renderResults();});host.append(more);}
}

for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
$('retry-load').addEventListener('click',start);
$('previous').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));$('page-number').addEventListener('change',()=>goPage(Number($('page-number').value)).catch(failure));
for(const mode of ['overlay','source','compare','text'])$('mode-'+mode).addEventListener('click',async()=>{const page=state.page;try{if(page&&mode!=='source')await loadFonts(page);if(page!==state.page)return;state.mode=mode;render();if(page)hash();}catch(error){failure(error);}});
$('zoom').addEventListener('change',()=>{state.zoom=$('zoom').value;resize();if(state.page)hash();});$('zoom-out').addEventListener('click',()=>zoomStep(-1));$('zoom-in').addEventListener('click',()=>zoomStep(1));
$('contents').addEventListener('click',showContents);$('side-close').addEventListener('click',()=>{$('sidebar').hidden=true;resize();});
$('search-open').addEventListener('click',()=>{openSidebar('search');$('side-list').replaceChildren();if(state.results.length)renderResults();$('search-query').focus();});
$('search-run').addEventListener('click',search);$('search-query').addEventListener('keydown',e=>{if(e.key==='Enter')search();});
$('comparison-close').addEventListener('click',()=>{state.mode='overlay';render();hash();});
$('bookmark').addEventListener('click',()=>{const page=state.page.pdf_page;bookmarks=bookmarks.includes(page)?bookmarks.filter(p=>p!==page):[...bookmarks,page].sort((a,b)=>a-b);remember(bookmarkKey,bookmarks);updateBookmark();if(!$('sidebar').hidden&&state.sidebar==='toc')showContents();});
$('version-open').addEventListener('click',async()=>{opened('version-dialog');const client=state.client;try{const refs=await client.refs();if(client!==state.client)return;$('version-options').replaceChildren(...refs.map(ref=>{const option=node('option');option.value=ref;return option;}));}catch(e){$('version-message').textContent=e.message;}});
$('version-load').addEventListener('click',()=>loadVersion($('version-ref').value.trim()||'main').catch(e=>{$('version-message').textContent=e.message;failure(e);}));
$('version-latest').addEventListener('click',()=>loadVersion('main').catch(e=>{$('version-message').textContent=e.message;failure(e);}));
new ResizeObserver(()=>resize()).observe($('viewport'));
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}if(e.key==='/'&&state.snapshot){e.preventDefault();$('search-open').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&state.snapshot){e.preventDefault();$('search-open').click();}});
window.addEventListener('hashchange',()=>{const p=new URLSearchParams(location.hash.slice(1)),number=Number(p.get('page')),ref=p.get('ref')||'main';if(state.snapshot){if(ref!==state.snapshot.ref)loadVersion(ref,number).catch(failure);else goPage(number,p.get('block')).catch(failure);}});
window.addEventListener('pagehide',disconnect);
// Remove any credential saved by an intermediate build; this reader never uses it.
try{localStorage.removeItem('undertale-reader-access-v1');}catch{/* storage unavailable */}
start();
window.addEventListener('pageshow',e=>{if(e.persisted)start();});
