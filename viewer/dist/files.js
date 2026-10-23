'use strict';
function remapSpans(before,after,spans){
  let a=0;while(a<before.length&&a<after.length&&before[a]===after[a])a++;
  let z=before.length,y=after.length;while(z>a&&y>a&&before[z-1]===after[y-1]){z--;y--;}
  const delta=after.length-before.length;
  const next=[];
  for(const s of spans){
    if(s.end<=a){next.push({...s});continue;}
    if(s.start>=z){next.push({...s,start:s.start+delta,end:s.end+delta});continue;}
    if(s.start<a)next.push({...s,end:a});
    if(s.start<=a&&s.end>a&&y>a)next.push({...s,start:a,end:y});
    if(s.end>z)next.push({...s,start:y,end:s.end+delta});
  }
  const merged=[];
  for(const s of next.filter(s=>s.end>s.start)){const prev=merged.at(-1);if(prev&&prev.end===s.start&&prev.italic===s.italic&&prev.lang===s.lang)prev.end=s.end;else merged.push(s);}
  return merged;
}
function parsePageRange(text,available){
  const numbers=[];
  for(const part of text.replaceAll('，',',').split(',').map(s=>s.trim())){
    const m=part.match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);if(!m)throw Error('页码格式：90-99 或 60,140,220');
    const first=Number(m[1]),last=Number(m[2]||m[1]);if(last<first||last-first>500)throw Error('页码范围无效');
    for(let n=first;n<=last;n++){if(!available.includes(n))throw Error('第 '+n+' 页尚未电子化');if(!numbers.includes(n))numbers.push(n);}
  }
  return numbers;
}
if(typeof module!=='undefined')module.exports={remapSpans,parsePageRange};
else{
  let importing=null,importPreview=null,busy=false;
  async function post(path,body){return api(path,{method:'POST',headers:{'Content-Type':'application/json','X-Study-Token':state.token},body:JSON.stringify(body)});}
  function downloadJson(data,name){const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function taskBusy(value){busy=value;$('export-pdf').disabled=$('export-json').disabled=$('import-confirm').disabled=value;}
  $('export-open').addEventListener('click',()=>{$('export-message').textContent=state.annotationsEnabled?'存档包含中英文本、斜体标记、排版参数与注释；PDF 自动附可打印注释页。原图留在项目中。':'存档包含中英文本、斜体标记与排版参数；原图留在项目中。';$('export-download').hidden=true;$('export-dialog').showModal();});
  $('export-json').addEventListener('click',async()=>{if(busy)return;taskBusy(true);try{await save();const pages=parsePageRange($('export-pages').value,state.pages),data=await post('/api/bundle',{pages});downloadJson(data,'undertale-'+pages[0]+'-'+pages.at(-1)+'.json');$('export-message').textContent='JSON 存档已导出，可用“载入”恢复。';}catch(e){$('export-message').textContent=e.message;}finally{taskBusy(false);}});
  $('import-open').addEventListener('click',()=>{if(!busy)$('import-input').click();});
  $('import-input').addEventListener('change',async()=>{
    const file=$('import-input').files[0];if(!file)return;
    try{if(file.size>12000000)throw Error('存档大于 12 MB');await save();importing=JSON.parse(await file.text());importPreview=await post('/api/import-preview',{bundle:importing});$('import-summary').textContent='文件：'+file.name+'\n页码：'+importPreview.pages.join('、')+'；共 '+importPreview.blocks+' 个文字块。'+(state.annotationsEnabled?' 注释：'+(importPreview.annotations||0)+' 条。':'');$('import-message').textContent='';$('import-dialog').showModal();}catch(e){toast('无法载入：'+e.message);}finally{$('import-input').value='';}
  });
  $('import-cancel').addEventListener('click',()=>{$('import-dialog').close();importing=importPreview=null;});
  $('import-confirm').addEventListener('click',async()=>{
    if(busy||!importing)return;taskBusy(true);
    try{await save();await post('/api/import',{bundle:importing,expected_revisions:importPreview.expected_revisions});const n=state.page.pdf_page;state.page=null;state.selected=null;await loadPage(n);$('import-dialog').close();toast('已载入；原版本已自动备份。');importing=importPreview=null;}catch(e){$('import-message').textContent=e.message;}finally{taskBusy(false);}
  });
  $('italic-selection').addEventListener('click',()=>{
    const b=current(),input=$('translation-input'),start=input.selectionStart,end=input.selectionEnd;if(!b||start===end){toast('先选中需要设置斜体的英文');return;}
    const text=b.translation.text.slice(start,end);if(!/^[\p{Script=Latin}\p{Number}\p{Mark}\p{Punctuation}\s]+$/u.test(text)){toast('斜体仅用于英文及罗马字；中文沿用正体。');return;}
    const spans=b.translation.spans||[],covered=spans.some(s=>s.start<=start&&s.end>=end&&s.italic),next=[];
    for(const s of spans){if(s.end<=start||s.start>=end)next.push(s);else{if(s.start<start)next.push({...s,end:start});if(s.end>end)next.push({...s,start:end});}}
    next.push({start,end,italic:!covered,lang:'en'});b.translation.spans=next.sort((a,b)=>a.start-b.start);renderPage();window.updateExtraFields?.();scheduleSave();requestAnimationFrame(checkLayout);input.focus();input.setSelectionRange(start,end);
  });
  const ctx=document.createElement('canvas').getContext('2d'),graphemes=new Intl.Segmenter('zh-Hans',{granularity:'grapheme'});
  function fontInfo(style){
    let family=style.fontFamily.includes('Book Serif Latin')?'serif-latin':style.fontFamily.includes('Book Serif JP')?'serif-jp':style.fontFamily.includes('Book Sans SC')?'sans-sc':'serif-sc';
    let weight=Number(style.fontWeight)||400;if(family==='serif-latin'){weight=400;if(style.fontStyle==='italic')family+='-italic';}if(family==='serif-jp')weight=400;
    return family+'-'+weight;
  }
  function colorHex(value){const nums=value.match(/[\d.]+/g);return '#'+nums.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join('');}
  function captureBlock(box,b,origin){
    const runs=[],walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      const parent=node.parentElement,style=getComputedStyle(parent),size=parseFloat(style.fontSize);if(size<1)continue;
      ctx.font=style.fontStyle+' '+style.fontWeight+' '+size+'px '+style.fontFamily;ctx.textBaseline='alphabetic';ctx.fontKerning='normal';
      const metrics=ctx.measureText(node.textContent||'字'),font=fontInfo(style),color=colorHex(style.color);
      let parts=Array.from(graphemes.segment(node.textContent));
      if(parent.lang==='en'&&!/[\u4e00-\u9fff\u3040-\u30ff]/.test(node.textContent)){
        // Keep shaping/kerning within each visible line, including wrapped Latin
        // words in narrow captions. The browser's line break is valid for PDF.
        const lines=[];
        for(const part of parts){const range=document.createRange();range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);const r=range.getBoundingClientRect(),last=lines.at(-1);if(last&&Math.abs(last.top-r.top)<1){last.segment+=part.segment;}else lines.push({segment:part.segment,index:part.index,top:r.top});}
        parts=lines;
      }
      for(const part of parts){
        if(!part.segment.trim())continue;
        const range=document.createRange();range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);
        const rects=Array.from(range.getClientRects()).filter(r=>r.width>.01);if(!rects.length)continue;
        if(rects.length>1&&part.segment.length>1)throw Error('英文跨行，需调整第 '+b.id+' 段');
        const r=rects[0],trim=!box.classList.contains('composed')&&/^[（《〈「『【〔［｛“‘]$/u.test(part.segment)?Math.min(size/2,Math.max(0,ctx.measureText(part.segment).width-r.width)):0;runs.push({text:part.segment,x:r.x-origin.x-trim,y:r.y-origin.y+metrics.fontBoundingBoxAscent,size,font,color});
      }
    }
    if(b.kind==='list')for(const item of box.children){const style=getComputedStyle(item,'::before'),size=parseFloat(style.fontSize),r=item.getBoundingClientRect();ctx.font=style.fontWeight+' '+size+'px "Book Sans SC"';const m=ctx.measureText('•'),line=parseFloat(getComputedStyle(item).lineHeight);runs.push({text:'•',decoration:true,x:r.x-origin.x,y:r.y-origin.y+(line-m.fontBoundingBoxAscent-m.fontBoundingBoxDescent)/2+m.fontBoundingBoxAscent,size,font:fontInfo(style),color:colorHex(style.color)});}
    const rect=box.getBoundingClientRect();return {id:b.id,text:b.translation.text,...(b.source.quote_mark?{position:[rect.x-origin.x,rect.y-origin.y]}:{}),overflow:inkOverflow(textInk(box)),runs};
  }
  async function snapshotPage(page){
    const host=el('div','export-page'),[w,h]=page.reference_size;host.style.cssText='position:absolute;left:-100000px;top:0;width:'+w+'px;height:'+h+'px';host.lang='zh-Hans';
    for(const b of page.blocks)host.append(makeTranslation(b,page));document.body.append(host);
    try{
      await document.fonts.ready;arrangeBoxes(host,page);const origin=host.getBoundingClientRect(),blocks=page.blocks.map((b,i)=>captureBlock(host.children[i],b,origin)),inks=page.blocks.map((b,i)=>textInk(host.children[i])),issues=[];
      blocks.forEach((b,i)=>{if(b.overflow)issues.push(b.id+' 字形越界');const source=page.blocks[i],limit=origin.top+(source.layout.limit_bottom??1)*h;if(source.layout.auto_height&&inks[i].lines.some(r=>r[3]>limit+1.25))issues.push(b.id+' 超出区域底线');});
      for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)if(inkCollision(inks[i],inks[j]))issues.push(blocks[i].id+' 与 '+blocks[j].id+' 文字相碰');
      return {number:page.pdf_page,revision:page.revision,blocks,issues};
    }finally{host.remove();}
  }
  $('export-pdf').addEventListener('click',async()=>{
    if(busy)return;taskBusy(true);$('export-download').hidden=true;
    try{await save();const numbers=parsePageRange($('export-pages').value,state.pages),pages=[];
      $('export-message').textContent='正在读取所选页面…';const bundle=await post('/api/bundle',{pages:numbers});
      for(const page of bundle.pages){$('export-message').textContent='正在排版第 '+page.pdf_page+' 页…';pages.push(await snapshotPage(page));if(pages.length%8===0)await new Promise(resolve=>setTimeout(resolve,0));}
      const problems=pages.flatMap(p=>(p.issues||[]).map(issue=>'第 '+p.number+' 页：'+issue));if(problems.length)throw Error('发现 '+problems.length+' 处实际文字问题：\n'+problems.join('\n'));
      $('export-message').textContent='正在生成 PDF，嵌入字体…';const result=await post('/api/pdf',{version:1,include_original:$('export-original').checked,pages});
      const link=$('export-download');link.href=result.url;link.download='undertale-'+numbers[0]+'-'+numbers.at(-1)+'.pdf';link.hidden=false;$('export-message').textContent='已生成 '+result.pages+' 页 PDF（'+(result.bytes/1048576).toFixed(1)+' MB），已保存在项目 private/exports 中。';
    }catch(e){$('export-message').textContent='导出失败：'+e.message;}finally{taskBusy(false);}
  });
}
