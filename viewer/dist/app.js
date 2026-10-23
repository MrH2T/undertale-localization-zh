'use strict';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const proofPage=Number(params.get('proof'));
const isProof=Number.isInteger(proofPage)&&proofPage>0;
if(isProof){document.body.classList.add('proof');if(params.get('compare')==='1'){const source=el('div','proof-original');source.id='proof-original';const img=el('img');img.alt='原 PDF 对照';source.append(img);$('workspace').prepend(source);}}
const kinds={heading:'标题',subheading:'小标题',paragraph:'正文',caption:'图注',aside:'侧栏',quote:'引用',list:'列表',footer:'页脚',legal:'版权说明', 'toc-entry':'目录项','table-cell':'表格单元'};
const state={annotationsEnabled:false,page:null,token:'',mode:'source',selected:null,scale:1,zoom:'fit',seq:0,savedSeq:0,saving:null,timer:null,switching:false,glossary:[],pages:[],issues:new Map()};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function current(){return state.page?.blocks.find(b=>b.id===state.selected);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4000);}
function savedLabel(text,error=false){$('save-state').textContent=text;$('save-state').classList.toggle('error',error);}
async function api(path,options={}){const {_sessionRetried,...request}=options;const r=await fetch(path,{cache:'no-store',...request});let data;try{data=await r.json();}catch{throw Error('本地服务响应异常');}if(!r.ok){if(r.status===403&&data.error==='invalid_session'&&!_sessionRetried){const boot=await fetch('/api/bootstrap',{cache:'no-store'});if(boot.ok){state.token=(await boot.json()).token;return api(path,{...options,_sessionRetried:true,headers:{...options.headers,'X-Study-Token':state.token}});}}if(r.status===409)throw Error(path==='/api/pdf'?'排版期间有页面被保存，请重新导出。':'本页已由另一个窗口更新。请先复制未保存的译文，再重新载入此页。');throw Error(data.error==='save_failed'?'写入失败，请检查磁盘与权限':data.error||'请求失败');}return data;}
function scheduleSave(){state.seq++;savedLabel('未保存');clearTimeout(state.timer);state.timer=setTimeout(()=>save().catch(()=>{}),900);}
async function save(){
  clearTimeout(state.timer);
  if(state.saving){await state.saving;if(state.seq!==state.savedSeq)return save();return;}
  if(!state.page||state.seq===state.savedSeq)return;
  const p=state.page,seq=state.seq;
  const body={revision:p.revision,blocks:p.blocks.map(b=>({id:b.id,text:b.translation.text,...(b.translation.spans!==undefined?{spans:structuredClone(b.translation.spans)}:{}),layout:structuredClone(b.layout),annotations:structuredClone(b.annotations||[])}))};
  savedLabel('保存中');
  state.saving=(async()=>{try{const result=await api('/api/pages/'+p.pdf_page,{method:'PUT',headers:{'Content-Type':'application/json','X-Study-Token':state.token},body:JSON.stringify(body)});p.revision=result.revision;p.updated_at=result.updated_at;state.savedSeq=seq;savedLabel(state.seq===seq?'已保存':'未保存');}catch(e){savedLabel('保存失败',true);toast(e.message);throw e;}finally{state.saving=null;}})();
  await state.saving;if(state.seq!==state.savedSeq)return save();
}
async function loadPage(number){
  if(state.switching||state.page?.pdf_page===number)return;
  state.switching=true;$('workspace').inert=true;$('page-select').disabled=true;
  try{
    await save();savedLabel('载入中');const p=await api('/api/pages/'+number);
    $('page-stage').style.visibility='hidden';$('page-image').src=p.image_url;await $('page-image').decode();
    state.page=p;state.seq=state.savedSeq=0;state.selected=p.blocks[0]?.id||null;state.issues.clear();
    $('page-select').value=String(number);$('page-image').alt='原书第 '+number+' 页';
    $('block-select').replaceChildren(...p.blocks.map((b,i)=>{const option=el('option','',String(i+1)+' / '+p.blocks.length+' · '+kinds[b.kind]);option.value=b.id;return option;}));
    const [w,h]=p.reference_size;$('page-content').style.width=w+'px';$('page-content').style.height=h+'px';
    if($('proof-original')){const original=$('proof-original');original.style.width=w+'px';original.style.height=h+'px';original.querySelector('img').src=p.image_url;await original.querySelector('img').decode();}
    $('toggle-editor').disabled=!p.blocks.length;if(!p.blocks.length)showEditor(false);renderPage();renderEditor();sizePage(false);$('viewport').scrollTo(0,0);savedLabel('已保存');history.replaceState(null,'','#page='+number);
  }catch(e){toast(e.message);savedLabel('读取或保存失败',true);if(state.page){$('page-select').value=String(state.page.pdf_page);$('page-image').src=state.page.image_url;}}
  finally{state.switching=false;$('workspace').inert=false;$('page-select').disabled=false;$('page-stage').style.visibility='visible';}
}
function applyBox(node,bbox,page=state.page){const [w,h]=page.reference_size;node.style.left=bbox[0]*w+'px';node.style.top=bbox[1]*h+'px';node.style.width=(bbox[2]-bbox[0])*w+'px';node.style.height=(bbox[3]-bbox[1])*h+'px';}
function inlineText(node,text,japaneseList=false,keepPhrases=[]){
  if(keepPhrases.length){
    let start=0;
    while(start<text.length){
      const matches=keepPhrases.map(phrase=>({phrase,index:text.indexOf(phrase,start)})).filter(m=>m.index>=0).sort((a,b)=>a.index-b.index);
      if(!matches.length){inlineText(node,text.slice(start));break;}
      const m=matches[0];inlineText(node,text.slice(start,m.index));
      const phrase=el('span','keep-together');inlineText(phrase,m.phrase);node.append(phrase);start=m.index+m.phrase.length;
    }
    return;
  }
  // Keep language runs inline: quoted phrases can wrap at words, punctuation
  // still participates in the browser's Chinese/Japanese line-break rules.
  const pattern=japaneseList?/^(?:びぼう|ビボウ|美貌|美ぼう|美ボウ|び貌|ビ貌)/g:/([\u3040-\u30ff]+(?:[ \u3000]+[\u3040-\u30ff]+)*|[A-Za-z0-9][A-Za-z0-9ōŌ’'\-]*)/g;let start=0;
  for(const match of text.matchAll(pattern)){
    node.append(document.createTextNode(text.slice(start,match.index)));
    const ja=japaneseList||/[\u3040-\u30ff]/.test(match[0]);
    const italic=!ja&&/^(Undertale|ikashita|kōgeki|bibō)$/.test(match[0]);
    const run=el(italic?'em':'span','',match[0]);run.lang=ja?'ja':'en';
    node.append(run);start=match.index+match[0].length;
  }
  node.append(document.createTextNode(text.slice(start)));
}
function spanSlice(spans,start,end){return spans.filter(s=>s.end>start&&s.start<end).map(s=>({...s,start:Math.max(0,s.start-start),end:Math.min(end-start,s.end-start)}));}
function formattedInline(node,text,spans,keep=[]){
  if(keep.length){let start=0;while(start<text.length){const m=keep.map(phrase=>({phrase,index:text.indexOf(phrase,start)})).filter(m=>m.index>=0).sort((a,b)=>a.index-b.index)[0];if(!m){formattedInline(node,text.slice(start),spanSlice(spans,start,text.length));break;}formattedInline(node,text.slice(start,m.index),spanSlice(spans,start,m.index));const holder=el('span','keep-together');formattedInline(holder,m.phrase,spanSlice(spans,m.index,m.index+m.phrase.length));node.append(holder);start=m.index+m.phrase.length;}return;}
  const tokens=BookComposition.tokenize(text,spans);
  tokens.forEach((token,i)=>{if(i&&BookComposition.boundary(tokens,i)&&!tokens[i-1].space&&!token.space&&!/[\r\n]/.test(tokens[i-1].text+token.text))node.append(el('wbr'));const run=el(token.italic?'em':'span','',token.text);if(token.lang!=='zh')run.lang=token.lang;node.append(run);});
}

function fillTranslation(node,b,page=state.page){
  node.classList.remove('composed');node.removeAttribute('role');node.removeAttribute('aria-label');node.replaceChildren();
  if(['paragraph','quote'].includes(b.kind)&&(!b.layout.text_align||b.layout.text_align==='justify')&&params.get('composition')!=='native'&&BookComposition.render(node,b.translation.text,{fontSize:b.layout.font_size,weight:b.layout.font_weight||400,width:(b.layout.bbox[2]-b.layout.bbox[0])*page.reference_size[0],spans:b.translation.spans}))return;
  if(b.kind==='list'){let offset=0;const rows=b.translation.text.split('\n'),leftCount=Math.ceil(rows.length/2);rows.forEach((line,i)=>{const item=el('div');item.style.gridColumn=String(i<leftCount?1:2);item.style.gridRow=String(i<leftCount?i+1:i-leftCount+1);if(b.translation.spans!==undefined){const spans=spanSlice(b.translation.spans,offset,offset+line.length),prefix=line.match(/^(?:びぼう|ビボウ|美貌|美ぼう|美ボウ|び貌|ビ貌)/)?.[0];if(prefix&&!spans.some(s=>s.start<prefix.length))spans.unshift({start:0,end:prefix.length,lang:'ja'});formattedInline(item,line,spans);}else inlineText(item,line,true);offset+=line.length+1;node.append(item);});}
  else if(b.translation.spans!==undefined){const text=b.translation.text,after=b.layout.break_after,index=after?text.indexOf(after):-1;if(index>=0){const end=index+after.length;formattedInline(node,text.slice(0,end),spanSlice(b.translation.spans,0,end));node.append(el('br'));formattedInline(node,text.slice(end),spanSlice(b.translation.spans,end,text.length));}else formattedInline(node,text,b.translation.spans,b.layout.keep_phrases||[]);node.setAttribute('role','group');node.setAttribute('aria-label',b.translation.text);for(const child of node.children)child.setAttribute('aria-hidden','true');}
  else{const text=b.translation.text,after=b.layout.break_after,index=after?text.indexOf(after):-1;if(index>=0){const end=index+after.length;inlineText(node,text.slice(0,end));node.append(el('br'));inlineText(node,text.slice(end));}else inlineText(node,text,false,b.layout.keep_phrases||[]);}
}
function makeTranslation(b,page){
  const box=el('div','translation-box '+b.kind+(b.layout.style==='chapter-heading'?' chapter-heading':''));box.dataset.block=b.id;applyBox(box,b.layout.bbox,page);box.style.fontSize=b.layout.font_size+'px';box.style.lineHeight=b.layout.line_height;box.style.fontWeight=b.layout.font_weight||(['heading','subheading'].includes(b.kind)?700:400);if(b.layout.column_gap)box.style.columnGap=b.layout.column_gap+'px';if(b.layout.text_align)box.style.textAlign=b.layout.text_align;if(b.layout.color)box.style.color=b.layout.color;fillTranslation(box,b,page);return box;
}

function arrangeBoxes(host,page){
  const nodes=new Map(Array.from(host.children).filter(n=>n.dataset.block).map(n=>[n.dataset.block,n])),blocks=new Map(page.blocks.map(b=>[b.id,b])),done=new Set(),pending=new Set();
  for(const [id,node]of nodes){const height=node.style.height;node.style.height='auto';node.dataset.naturalHeight=parseFloat(getComputedStyle(node).height)||0;node.style.height=blocks.get(id).layout.auto_height?'auto':height;}
  function place(id){if(done.has(id))return;if(pending.has(id))throw Error('段落接排形成循环');pending.add(id);const b=blocks.get(id),node=nodes.get(id);if(b.layout.flow_after&&nodes.has(b.layout.flow_after)){place(b.layout.flow_after);const prev=nodes.get(b.layout.flow_after);node.style.top=(parseFloat(prev.style.top)+Number(prev.dataset.naturalHeight)+(b.layout.gap_before??12))+'px';}
    const bottom=parseFloat(node.style.top)+parseFloat(getComputedStyle(node).height);node.dataset.limitOverflow=b.layout.auto_height&&bottom>(b.layout.limit_bottom??b.layout.bbox[3])*page.reference_size[1]+1?'true':'false';pending.delete(id);done.add(id);}
  for(const id of nodes.keys())place(id);
}
function renderedBox(node,page){const [w,h]=page.reference_size,x=parseFloat(node.style.left),y=parseFloat(node.style.top);return [x/w,y/h,(x+parseFloat(node.style.width))/w,(y+parseFloat(getComputedStyle(node).height))/h];}
function renderQuoteMarks(host,page){
  const [w,h]=page.reference_size;
  for(const b of page.blocks){
    const mark=b.source.quote_mark;if(!mark)continue;
    const box=host.querySelector('[data-block="'+b.id+'"]');if(!box)continue;
    const [x0,y0,x1,y1]=mark.bbox,icon=el('div','quote-mark');
    icon.setAttribute('aria-hidden','true');icon.dataset.quoteFor=b.id;
    Object.assign(icon.style,{position:'absolute',pointerEvents:'none',left:(parseFloat(box.style.left)+mark.offset[0])+'px',top:(parseFloat(box.style.top)+mark.offset[1])+'px',width:((x1-x0)*w)+'px',height:((y1-y0)*h)+'px',backgroundImage:'url("'+page.image_url+'")',backgroundRepeat:'no-repeat',backgroundSize:w+'px '+h+'px',backgroundPosition:(-x0*w)+'px '+(-y0*h)+'px'});
    host.append(icon);
  }
}
function renderPage(){
  if(!state.page)return;
  const masks=$('mask-layer'),overlay=$('overlay-layer'),regions=$('region-layer');masks.replaceChildren();overlay.replaceChildren();regions.replaceChildren();
  state.page.blocks.forEach((b,i)=>{
    const mask=el('div','source-mask');applyBox(mask,b.source.mask_bbox||b.source.bbox);mask.style.background=b.layout.mask_color||'#ffffff';masks.append(mask);if(b.source.quote_mark){const iconMask=el('div','source-mask');applyBox(iconMask,b.source.quote_mark.bbox);iconMask.style.background=b.layout.mask_color||'#ffffff';masks.append(iconMask);}
    const box=makeTranslation(b,state.page);box.id='translation-'+b.id;overlay.append(box);
    const region=el('button','region');region.id='region-'+b.id;region.dataset.block=b.id;applyBox(region,state.mode==='source'?b.source.bbox:b.layout.bbox);region.setAttribute('aria-label','第 '+(i+1)+' 段 '+kinds[b.kind]+'：'+b.source.text.slice(0,45));region.title='第 '+(i+1)+' 段 '+kinds[b.kind];region.addEventListener('click',()=>selectBlock(b.id,true));regions.append(region);
  });
  // Rebuilt tables retain editable text, and only replace explicit scan areas.
  if(state.page.erase_regions?.length||state.page.vector_shapes?.length){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),[w,h]=state.page.reference_size;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.style.cssText='position:absolute;inset:0;pointer-events:none';
    for(const s of [...(state.page.erase_regions||[]),...(state.page.vector_shapes||[])]){
      const shape=document.createElementNS(ns,s.type);
      if(s.type==='rect'){const [x0,y0,x1,y1]=s.bbox;for(const [k,v]of Object.entries({x:x0,y:y0,width:x1-x0,height:y1-y0,fill:s.fill||'#ffffff'}))shape.setAttribute(k,v);}
      else if(s.type==='line'){const [[x1,y1],[x2,y2]]=s.points;for(const [k,v]of Object.entries({x1,y1,x2,y2,stroke:s.stroke||'#555555','stroke-width':s.stroke_width||1}))shape.setAttribute(k,v);}
      svg.append(shape);
    }
    masks.append(svg);
  }
  arrangeBoxes(overlay,state.page);renderQuoteMarks(overlay,state.page);if(state.mode==='overlay')state.page.blocks.forEach(b=>applyBox($('region-'+b.id),renderedBox($('translation-'+b.id),state.page)));
  masks.style.visibility=overlay.style.visibility=state.mode==='overlay'?'visible':'hidden';regions.classList.toggle('show-all',$('show-regions').checked);updateSelection();requestAnimationFrame(()=>{checkLayout();window.renderNotes?.();});
}
function setMode(mode){state.mode=mode;$('mode-source').setAttribute('aria-pressed',String(mode==='source'));$('mode-overlay').setAttribute('aria-pressed',String(mode==='overlay'));renderPage();}
function sizePage(preserve=true){
  if(!state.page)return;const viewport=$('viewport'),[w,h]=state.page.reference_size,oldScale=state.scale;
  const center=[(viewport.scrollLeft+viewport.clientWidth/2-12)/oldScale,(viewport.scrollTop+viewport.clientHeight/2-12)/oldScale];
  state.scale=isProof?1:state.zoom==='fit'?Math.max(.1,(viewport.clientWidth-24)/w):Number(state.zoom);
  $('page-stage').style.width=w*state.scale+'px';$('page-stage').style.height=h*state.scale+'px';$('page-content').style.transform='scale('+state.scale+')';
  if(preserve&&Math.abs(state.scale-oldScale)>.001)viewport.scrollTo(Math.max(0,center[0]*state.scale-viewport.clientWidth/2+12),Math.max(0,center[1]*state.scale-viewport.clientHeight/2+12));
  requestAnimationFrame(()=>window.renderNotes?.());
}
function showEditor(show){show=show&&!isProof&&!!state.page?.blocks.length;$('editor').hidden=!show;$('toggle-editor').setAttribute('aria-pressed',String(show));sizePage();}
function locate(){if(!state.page)return;const node=$('region-'+state.selected),vp=$('viewport'),r=node.getBoundingClientRect(),v=vp.getBoundingClientRect();let top=vp.scrollTop,left=vp.scrollLeft;if(r.top<v.top+12||r.bottom>v.bottom-12)top+=r.top-v.top-24;if(r.left<v.left+12||r.right>v.right-12)left+=r.left-v.left-24;vp.scrollTo(left,top);}
function updateSelection(){const p=state.page,b=current();if(!p)return;if(!b){$('selection-hint').textContent='第 '+p.pdf_page+' 页 · '+p.title;$('block-select').replaceChildren();return;}const index=p.blocks.indexOf(b);document.querySelectorAll('.region').forEach(n=>n.classList.toggle('selected',n.dataset.block===b.id));$('block-select').value=b.id;$('block-prev').disabled=index===0;$('block-next').disabled=index===p.blocks.length-1;$('selection-hint').textContent='第 '+p.pdf_page+' 页 · 第 '+(index+1)+' 段 / '+p.blocks.length;}
function selectBlock(id,open=false){state.selected=id;updateSelection();renderEditor();if(open)showEditor(true);requestAnimationFrame(locate);}
function changeBlock(delta){const i=state.page.blocks.findIndex(b=>b.id===state.selected);if(state.page.blocks[i+delta])selectBlock(state.page.blocks[i+delta].id,true);}
function hasTerm(text,term){const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^A-Za-z0-9_])'+escaped+'(?=$|[^A-Za-z0-9_])','i').test(text);}
function renderEditor(){
  const b=current();$('toc-target').hidden=!b?.structure?.target_pdf_page;if(b?.structure?.target_pdf_page)$('toc-target').textContent='前往第 '+b.structure.target_pdf_page+' 页';if(!b){$('source-text').textContent='';$('translation-input').value='';return;}$('source-text').textContent=b.source.text;$('source-text').scrollTop=0;$('translation-input').value=b.translation.text;$('translation-input').setAttribute('aria-label','第 '+(state.page.blocks.indexOf(b)+1)+' 段译文');
  const matched=state.glossary.filter(t=>t.source_term.split(' / ').some(term=>term.length>2&&hasTerm(b.source.text,term))).slice(0,6);
  $('reference-text').textContent=[...matched.map(t=>t.source_term+' → '+t.preferred_zh_hans),b.notes].filter(Boolean).join('\n')||'无';
  renderLayoutFields();updateWarning();updateSelection();window.renderNotesEditor?.();
}
function renderLayoutFields(){const b=current();if(!b)return;const [w,h]=state.page.reference_size,bb=b.layout.bbox;const values={'font-size':b.layout.font_size,'line-height':b.layout.line_height,'box-x':bb[0]*w,'box-y':bb[1]*h,'box-width':(bb[2]-bb[0])*w,'box-height':(bb[3]-bb[1])*h};for(const [id,value]of Object.entries(values))$(id).value=Number(value.toFixed(2));$('coordinate-size').textContent='页面坐标 '+w.toFixed(1)+' × '+h;$('box-x').max=w-10;$('box-y').max=h-7;$('box-width').max=w;$('box-height').max=h;window.updateExtraFields?.();}
function changeLayout(id){
  const b=current(),v=Number($(id).value),[w,h]=state.page.reference_size;let bb=b.layout.bbox.slice();
  if(!Number.isFinite(v)||$(id).value===''||!$(id).checkValidity()){renderLayoutFields();toast('数值超出允许范围');return;}
  if(id==='font-size')b.layout.font_size=v;else if(id==='line-height')b.layout.line_height=v;
  else{const width=bb[2]-bb[0],height=bb[3]-bb[1];if(id==='box-x'){bb[0]=Math.min(v/w,1-width);bb[2]=bb[0]+width;}if(id==='box-y'){bb[1]=Math.min(v/h,1-height);bb[3]=bb[1]+height;}if(id==='box-width')bb=BookLayout.resize(bb,v/w,BookLayout.anchor(b));if(id==='box-height')bb[3]=Math.min(1,bb[1]+v/h);if(bb[2]-bb[0]<.01||bb[3]-bb[1]<.005){renderLayoutFields();toast('文字框过小');return;}if((id==='box-x'||id==='box-width')&&b.layout.snap_to_guides!==false){const snapped=BookLayout.snap(bb,BookLayout.anchor(b),BookLayout.guides(b,state.page.blocks),id==='box-x'?'move':'resize',4/w);bb=snapped.bbox;if(snapped.line!==null){$('page-content').querySelector('.snap-guide')?.remove();const guide=el('div','snap-guide');guide.style.left=snapped.line*w+'px';$('page-content').append(guide);setTimeout(()=>guide.remove(),900);}}b.layout.bbox=bb;}
  scheduleSave();renderPage();renderLayoutFields();
}
// Ink bounds exclude invisible font ascent/descent padding, but still detect
// clipped glyphs and real collisions. Values are viewport pixels at current zoom.
const inkCanvas=document.createElement('canvas').getContext('2d'),inkSegments=new Intl.Segmenter('zh-Hans',{granularity:'grapheme'}),inkMetrics=new Map();
function textInk(box){
  const rect=box.getBoundingClientRect(),scale=rect.width/parseFloat(getComputedStyle(box).width)||1,lines=[],overhang={left:0,right:0},walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
    const style=getComputedStyle(node.parentElement),font=style.fontStyle+' '+style.fontWeight+' '+style.fontSize+' '+style.fontFamily;inkCanvas.font=font;inkCanvas.textBaseline='alphabetic';
    for(const part of inkSegments.segment(node.textContent)){
      if(!part.segment.trim())continue;const key=font+'|'+part.segment;let m=inkMetrics.get(key);
      if(!m){const v=inkCanvas.measureText(part.segment);m={width:v.width,ascent:v.fontBoundingBoxAscent,left:v.actualBoundingBoxLeft,right:v.actualBoundingBoxRight,top:v.actualBoundingBoxAscent,bottom:v.actualBoundingBoxDescent};inkMetrics.set(key,m);}
      const range=document.createRange();range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);const r=Array.from(range.getClientRects()).find(r=>r.width>.01&&r.height>.01);if(!r)continue;overhang.left=Math.max(overhang.left,m.left*scale);overhang.right=Math.max(overhang.right,(m.right-m.width)*scale);
      const baseline=r.top+m.ascent*scale,ink=[r.left-m.left*scale,baseline-m.top*scale,r.left+m.right*scale,baseline+m.bottom*scale];
      let line=lines.find(l=>Math.abs(l.baseline-baseline)<2*scale);
      if(!line){line={baseline,box:ink};lines.push(line);}else line.box=[Math.min(line.box[0],ink[0]),Math.min(line.box[1],ink[1]),Math.max(line.box[2],ink[2]),Math.max(line.box[3],ink[3])];
    }
  }
  return {rect,scale,overhang,autoHeight:box.style.height==='auto',lines:lines.map(l=>l.box)};
}
function inkOverflow(ink){const r=ink.rect,t=1.25*ink.scale;return ink.lines.some(b=>b[0]<r.left-t-ink.overhang.left||b[2]>r.right+t+ink.overhang.right||(!ink.autoHeight&&(b[1]<r.top-t||b[3]>r.bottom+t)));}
function inkCollision(a,b){const t=Math.min(a.scale,b.scale);return a.lines.some(x=>b.lines.some(y=>Math.min(x[2],y[2])-Math.max(x[0],y[0])>t&&Math.min(x[3],y[3])-Math.max(x[1],y[1])>t));}
function checkLayout(){
  if(!state.page)return;const issues=new Map();function add(id,message){if(!issues.has(id))issues.set(id,[]);issues.get(id).push(message);}
  const blocks=state.page.blocks,inks=new Map(),origin=$('page-content').getBoundingClientRect();
  for(const b of blocks){const node=$('translation-'+b.id),ink=textInk(node);inks.set(b.id,ink);if(inkOverflow(ink))add(b.id,'实际字形超出文本框，会被裁切。');const limit=origin.top+(b.layout.limit_bottom??1)*state.page.reference_size[1]*ink.scale;const beyond=b.layout.auto_height&&ink.lines.some(r=>r[3]>limit+1.25*ink.scale);node.dataset.limitOverflow=beyond?'true':'false';if(beyond)add(b.id,'文字超出接排区域底线。');}
  for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)if(inkCollision(inks.get(blocks[i].id),inks.get(blocks[j].id))){add(blocks[i].id,'文字与第 '+(j+1)+' 段相碰。');add(blocks[j].id,'文字与第 '+(i+1)+' 段相碰。');}
  state.issues=issues;state.page.blocks.forEach(b=>$('translation-'+b.id)?.classList.toggle('problem',issues.has(b.id)));
  $('layout-status').textContent=issues.size?issues.size+' 段排版待调整':'未检测到文字溢出或重叠';$('layout-status').classList.toggle('warning',issues.size>0);updateWarning();
}
function updateWarning(){const messages=state.issues.get(state.selected)||[];$('layout-warning').hidden=!messages.length;$('layout-warning').textContent=messages.join(' ');}
$('translation-input').addEventListener('input',()=>{const b=current();if(!b)return;if(b.translation.spans!==undefined)b.translation.spans=remapSpans(b.translation.text,$('translation-input').value,b.translation.spans);window.remapNotes?.(b,$('translation-input').value);b.translation.text=$('translation-input').value;b.translation.status='draft';renderPage();window.updateExtraFields?.();window.renderNotesEditor?.();scheduleSave();requestAnimationFrame(checkLayout);});
for(const id of ['font-size','line-height','box-x','box-y','box-width','box-height'])$(id).addEventListener('change',()=>changeLayout(id));
$('reset-position').addEventListener('click',()=>{const b=current();b.layout.bbox=(b.calibration?.bbox||b.source.bbox).slice();delete b.layout.flow_after;b.layout.auto_height=false;renderPage();renderLayoutFields();scheduleSave();});
$('toc-open').addEventListener('click',()=>loadPage(5));
$('toc-target').addEventListener('click',()=>{const n=current()?.structure?.target_pdf_page;if(state.pages.includes(n))loadPage(n);else toast('该章节尚未电子化，原书起页为 '+n+'。');});
$('page-select').addEventListener('change',()=>loadPage(Number($('page-select').value)));
$('block-select').addEventListener('change',()=>selectBlock($('block-select').value));
$('block-prev').addEventListener('click',()=>changeBlock(-1));$('block-next').addEventListener('click',()=>changeBlock(1));$('locate').addEventListener('click',locate);
$('toggle-editor').addEventListener('click',()=>showEditor($('editor').hidden));$('close-editor').addEventListener('click',()=>showEditor(false));
$('mode-source').addEventListener('click',()=>setMode('source'));$('mode-overlay').addEventListener('click',()=>setMode('overlay'));
$('show-regions').addEventListener('change',()=>$('region-layer').classList.toggle('show-all',$('show-regions').checked));
$('zoom').addEventListener('change',()=>{state.zoom=$('zoom').value;sizePage();});
function zoomStep(delta){const values=[.5,.75,1,1.25,1.5,2],next=delta>0?values.find(v=>v>state.scale+.01):values.slice().reverse().find(v=>v<state.scale-.01);if(next){state.zoom=String(next);$('zoom').value=String(next);sizePage();}}
$('zoom-in').addEventListener('click',()=>zoomStep(1));$('zoom-out').addEventListener('click',()=>zoomStep(-1));
$('save').addEventListener('click',()=>save().then(()=>toast('已保存')).catch(()=>{}));
$('layout-status').addEventListener('click',()=>{const first=state.issues.keys().next().value;if(first){setMode('overlay');selectBlock(first,true);$('layout-settings').open=true;}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(()=>{});}});
window.addEventListener('beforeunload',e=>{if(state.seq!==state.savedSeq){e.preventDefault();e.returnValue='';}});
new ResizeObserver(()=>sizePage()).observe($('viewport'));
(async()=>{try{const [config,glossary]=await Promise.all([api('/api/bootstrap'),api('/api/glossary')]);state.annotationsEnabled=config.features?.annotations===true;state.token=config.token;state.pages=config.pages.map(p=>p.number);state.glossary=glossary.entries;config.pages.forEach(p=>{const o=el('option','',String(p.number));o.value=p.number;$('page-select').append(o);});savedLabel('载入字体');const loaded=await Promise.all(['400 20.5px "Book Serif SC"','700 46px "Book Serif SC"','700 22px "Book Sans SC"','400 20px "Book Serif JP"','400 20px "Book Serif Latin"','italic 400 20px "Book Serif Latin"'].map(font=>document.fonts.load(font)));if(loaded.some(fonts=>fonts.length===0))throw Error('书页字体加载失败，请重启本地服务');await document.fonts.ready;showEditor(innerWidth>900);if(isProof)setMode(params.get('mode')==='source'?'source':'overlay');const match=location.hash.match(/page=(\d+)/);await loadPage(isProof&&state.pages.includes(proofPage)?proofPage:match&&state.pages.includes(Number(match[1]))?Number(match[1]):60);}catch(e){savedLabel('载入失败',true);toast(e.message);}})();
