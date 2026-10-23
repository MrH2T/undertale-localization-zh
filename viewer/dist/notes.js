(function(root){
  'use strict';
  function anchorAt(text,quote,start=text.indexOf(quote)){
    if(!quote)return {quote:'',prefix:'',suffix:'',start:0,end:0,status:'attached'};
    if(start<0)return {quote,prefix:'',suffix:'',start:0,end:quote.length,status:'orphan'};
    return {quote,prefix:Array.from(text.slice(0,start)).slice(-24).join(''),suffix:Array.from(text.slice(start+quote.length)).slice(0,24).join(''),start,end:start+quote.length,status:'attached'};
  }
  function resolve(text,a){
    if(!a.quote)return anchorAt(text,'');if(a.status==='orphan')return {...a};
    const positions=[];let i=0;while((i=text.indexOf(a.quote,i))>=0){positions.push(i);i++;}
    const exact=positions.filter(i=>(!a.prefix||text.slice(0,i).endsWith(a.prefix))&&(!a.suffix||text.slice(i+a.quote.length).startsWith(a.suffix)));
    const candidates=exact.length===1?exact:positions;
    return candidates.length===1?anchorAt(text,a.quote,candidates[0]):{...a,status:'orphan'};
  }
  const api={anchorAt,resolve};if(typeof module!=='undefined'){module.exports=api;return;}root.BookNotes=api;
  let selected=null,editingBlock=null,active=null,pinned=false,hideTimer,trigger=null;
  const fieldIds={'original':'note-original','reading':'note-reading','gloss_zh':'note-gloss','note_zh':'note-body','language':'note-language','source_kind':'note-kind','role':'note-role','source_ref':'note-source'};
  const kinds={verbatim:'原语原句',romanization:'原书罗马字',author_gloss:'作者英文转述',editorial:'译者说明'};
  function chosen(){return current()?.annotations?.find(n=>n.id===selected);}
  function pageNotes(){let number=0;return state.page.blocks.flatMap(b=>(b.annotations||[]).map(n=>({b,n,number:++number})));}
  function close(){clearTimeout(hideTimer);$('note-popup').hidden=true;active=null;pinned=false;}
  function drawEditor(){
    const b=current();$('notes-editor').hidden=!state.annotationsEnabled;if(!b||!state.annotationsEnabled)return;
    if(editingBlock!==b.id){editingBlock=b.id;selected=b.annotations?.[0]?.id||null;}
    if(!b.annotations?.some(n=>n.id===selected))selected=b.annotations?.[0]?.id||null;
    const entries=pageNotes().filter(x=>x.b===b);
    $('note-select').replaceChildren(...entries.map(({n,number})=>{const o=el('option','',number+' · '+(n.original||n.anchor.quote||'整段注释').slice(0,32));o.value=n.id;return o;}));
    $('note-select').value=selected||'';$('note-select').disabled=!entries.length;
    $('notes-summary').textContent='注释'+(entries.length?'（'+entries.length+'）':'');
    const n=chosen();$('note-fields').hidden=!n;$('note-delete').disabled=!n;
    if(!n)return;
    for(const [k,id]of Object.entries(fieldIds))$(id).value=n[k]||'';
    $('note-anchor').textContent=(n.anchor.status==='orphan'?'待重新关联：':'关联：')+(n.anchor.quote||'整段');
    $('note-anchor').classList.toggle('warning',n.anchor.status==='orphan');
  }
  function changed(){const n=chosen();if(!n)return;for(const[k,id]of Object.entries(fieldIds))n[k]=$(id).value;n.status='draft';scheduleSave();drawLayer();}
  function attachSelection(n){const input=$('translation-input'),b=current();n.anchor=anchorAt(b.translation.text,input.value.slice(input.selectionStart,input.selectionEnd),input.selectionStart);n.status='draft';}
  function add(){const b=current();if(!b)return;const n={id:'note-'+crypto.randomUUID(),original:'',reading:'',gloss_zh:'',note_zh:'',language:'mixed',source_kind:'editorial',role:'explanation',source_ref:'本书 PDF 第 '+state.page.pdf_page+' 页，第 '+(state.page.blocks.indexOf(b)+1)+' 段',status:'draft'};attachSelection(n);b.annotations??=[];b.annotations.push(n);selected=n.id;editingBlock=b.id;$('notes-editor').open=true;drawEditor();drawLayer();scheduleSave();$('note-body').focus();}
  function show(entry,element,pin=false){
    clearTimeout(hideTimer);if(pinned&&!pin&&active!==entry.n.id)return;
    active=entry.n.id;trigger=element;pinned=pin;const n=entry.n;
    $('note-popup-title').textContent='译注 '+entry.number+(n.anchor.status==='orphan'?' · 待重新关联':'');
    const content=$('note-popup-body');content.replaceChildren();
    for(const [label,value]of [[kinds[n.source_kind],n.original],['读音',n.reading],['释义',n.gloss_zh],['说明',n.note_zh],['来源',n.source_ref]])if(value)content.append(el('p','',label+'：'+value));
    if(!n.original&&!n.gloss_zh&&!n.note_zh)content.append(el('p','','尚未填写注释。'));
    const popup=$('note-popup');popup.hidden=false;const r=element.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(r.left,innerWidth-popup.offsetWidth-8))+'px';popup.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-popup.offsetHeight-8))+'px';
    $('note-popup-edit').onclick=()=>{selectBlock(entry.b.id,true);selected=n.id;editingBlock=entry.b.id;drawEditor();$('notes-editor').open=true;close();$('note-body').focus();};
  }
  function delayedClose(){if(!pinned){clearTimeout(hideTimer);hideTimer=setTimeout(close,240);}}
  function rects(box,text,a){
    if(!a.quote||a.status==='orphan')return [];
    const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT),found=[];let node,cursor=0;
    while(node=walker.nextNode()){
      const s=node.textContent;if(!s)continue;const at=text.indexOf(s,cursor);if(at<0)continue;cursor=at+s.length;
      const start=Math.max(a.start,at),end=Math.min(a.end,cursor);if(start>=end)continue;
      const range=document.createRange();range.setStart(node,start-at);range.setEnd(node,end-at);for(const r of range.getClientRects())if(r.width>1&&r.height>1)found.push({left:r.left,top:r.top,right:r.right,bottom:r.bottom});
    }
    const lines=[];for(const r of found){const p=lines.at(-1);if(p&&Math.abs(p.top-r.top)<3&&r.left-p.right<16){p.right=Math.max(p.right,r.right);p.bottom=Math.max(p.bottom,r.bottom);}else lines.push(r);}return lines;
  }
  function drawLayer(){
    const layer=$('note-layer');if(!layer||!state.page)return;close();layer.replaceChildren();layer.hidden=!state.annotationsEnabled||state.mode!=='overlay'||isProof;
    if(layer.hidden)return;
    const origin=$('page-content').getBoundingClientRect(),scale=origin.width/state.page.reference_size[0];if(!scale)return;
    const counts=new Map();
    for(const entry of pageNotes()){
      const {b,n,number}=entry,box=$('translation-'+b.id);if(!box)continue;
      const a=resolve(b.translation.text,n.anchor);n.anchor=a;
      const places=rects(box,b.translation.text,a);for(const r of places){const hit=el('button','note-hit');hit.setAttribute('aria-label','译注 '+number+'：'+(n.original||a.quote));hit.style.cssText=`left:${(r.left-origin.left)/scale}px;top:${(r.top-origin.top)/scale}px;width:${(r.right-r.left)/scale}px;height:${(r.bottom-r.top)/scale}px`;wire(hit,entry);layer.append(hit);}
      const index=counts.get(b.id)||0;counts.set(b.id,index+1);const r=box.getBoundingClientRect(),badge=el('button','note-badge'+(a.status==='orphan'?' orphan':''),String(number));badge.setAttribute('aria-label','译注 '+number+'：'+(n.original||a.quote||'整段'));badge.style.left=Math.min(state.page.reference_size[0]-23,(r.right-origin.left)/scale+3)+'px';badge.style.top=((r.top-origin.top)/scale+index*23)+'px';wire(badge,entry);layer.append(badge);
    }
  }
  function wire(button,entry){button.addEventListener('mouseenter',()=>show(entry,button));button.addEventListener('focus',()=>show(entry,button));button.addEventListener('mouseleave',delayedClose);button.addEventListener('blur',delayedClose);button.addEventListener('click',e=>{e.stopPropagation();show(entry,button,true);});}
  $('note-new').addEventListener('mousedown',e=>e.preventDefault());$('note-new').addEventListener('click',add);
  $('note-select').addEventListener('change',()=>{selected=$('note-select').value;drawEditor();});
  $('note-delete').addEventListener('click',()=>{const b=current();b.annotations=b.annotations.filter(n=>n.id!==selected);selected=null;drawEditor();drawLayer();scheduleSave();});
  $('note-reanchor').addEventListener('mousedown',e=>e.preventDefault());$('note-reanchor').addEventListener('click',()=>{const n=chosen();if(n){attachSelection(n);drawEditor();drawLayer();scheduleSave();}});
  for(const id of Object.values(fieldIds))$(id).addEventListener('input',changed);
  $('note-popup-close').addEventListener('click',()=>{const t=trigger;close();t?.focus();close();});
  $('note-popup').addEventListener('mouseenter',()=>clearTimeout(hideTimer));$('note-popup').addEventListener('mouseleave',delayedClose);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('note-popup').hidden){e.preventDefault();close();}});
  $('viewport').addEventListener('scroll',close);
  root.renderNotesEditor=drawEditor;root.renderNotes=drawLayer;root.remapNotes=(b,text)=>{for(const n of b.annotations||[])n.anchor=resolve(text,n.anchor);};
})(typeof window!=='undefined'?window:globalThis);
