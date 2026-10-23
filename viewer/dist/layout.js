/* Editable geometry; source masks never participate in these operations. */
(function(root){
  'use strict';
  function anchor(b){return b.layout.resize_anchor||(b.kind==='aside'?(b.layout.text_align==='left'?'left':'right'):b.kind==='caption'?'center':'left');}
  function resize(box,width,edge){
    const b=box.slice(),fixed=edge==='right'?b[2]:edge==='center'?(b[0]+b[2])/2:b[0];
    width=Math.max(.01,Math.min(width,edge==='right'?fixed:edge==='center'?2*Math.min(fixed,1-fixed):1-fixed));
    b[0]=edge==='right'?fixed-width:edge==='center'?fixed-width/2:fixed;b[2]=b[0]+width;return b;
  }
  function guides(block,blocks){
    const side=(block.layout.bbox[0]+block.layout.bbox[2])/2<.5;
    const peers=blocks.filter(b=>b.id!==block.id&&b.kind===block.kind&&((b.layout.bbox[0]+b.layout.bbox[2])/2<.5)===side&&!b.structure);
    const boxes=peers.map(b=>b.layout.bbox);if(block.calibration?.bbox)boxes.push(block.calibration.bbox);
    return {left:boxes.map(b=>b[0]),right:boxes.map(b=>b[2]),center:boxes.map(b=>(b[0]+b[2])/2)};
  }
  function nearest(value,values,tolerance){const sorted=values.map(x=>({x,d:Math.abs(x-value)})).filter(x=>x.d<=tolerance).sort((a,b)=>a.d-b.d);return sorted[0]?.x??null;}
  function snap(box,edge,g,mode,tolerance){
    let b=box.slice(),line=null;
    if(mode==='move'){
      const value=edge==='right'?b[2]:edge==='center'?(b[0]+b[2])/2:b[0],hit=nearest(value,g[edge],tolerance);
      if(hit!==null){const shift=hit-value;if(b[0]+shift>=0&&b[2]+shift<=1){b[0]+=shift;b[2]+=shift;line=hit;}}
    }else{
      const moving=edge==='right'?'left':'right',value=moving==='left'?b[0]:b[2],hit=nearest(value,g[moving],tolerance);
      if(hit!==null){const width=edge==='right'?b[2]-hit:edge==='center'?2*(hit-(b[0]+b[2])/2):hit-b[0];if(width>=.01){b=resize(b,width,edge);line=hit;}}
    }
    return {bbox:b,line};
  }
  const api={anchor,resize,guides,snap};
  if(typeof module!=='undefined')module.exports=api;else root.BookLayout=api;
})(typeof window!=='undefined'?window:globalThis);

if(typeof document!=='undefined'){
  function formatMarkup(text,spans){
    let result='',offset=0;const escape=s=>s.replace(/[\\*]/g,'\\$&');
    for(const s of spans||[]){result+=escape(text.slice(offset,s.start));const value=escape(text.slice(s.start,s.end));result+=s.italic?'*'+value+'*':value;offset=s.end;}
    return result+escape(text.slice(offset));
  }
  function renderFormatInspector(){const b=current();if(!b)return;$('format-markup').textContent=formatMarkup(b.translation.text,b.translation.spans);$('format-language').textContent=(b.translation.spans||[]).filter(s=>s.lang).map(s=>b.translation.text.slice(s.start,s.end)+' · '+s.lang+(s.italic?' · 斜体':'')).join('；')||'无行内格式；字体由段落样式决定。';}
  window.renderFormatInspector=renderFormatInspector;
  function effectiveBBox(b){const n=$('translation-'+b.id),[w,h]=state.page.reference_size;return n?[parseFloat(n.style.left)/w,parseFloat(n.style.top)/h,(parseFloat(n.style.left)+parseFloat(n.style.width))/w,(parseFloat(n.style.top)+parseFloat(getComputedStyle(n).height))/h]:b.layout.bbox.slice();}
  window.effectiveBBox=effectiveBBox;
  function updateExtraFields(){
    const b=current();if(!b)return;const [w,h]=state.page.reference_size,bb=effectiveBBox(b);
    $('resize-anchor').value=BookLayout.anchor(b);$('snap-guides').checked=b.layout.snap_to_guides!==false;$('auto-height').checked=!!b.layout.auto_height;
    $('box-height').disabled=!!b.layout.auto_height;$('box-y').disabled=!!b.layout.flow_after;
    $('box-height').value=Number(((bb[3]-bb[1])*h).toFixed(2));$('box-y').value=Number((bb[1]*h).toFixed(2));
    $('gap-before').value=b.layout.gap_before??12;$('gap-before').disabled=!b.layout.flow_after;
    $('flow-limit').value=Number(((b.layout.limit_bottom??b.layout.bbox[3])*h).toFixed(2));$('flow-limit').disabled=!b.layout.auto_height;
    const options=[el('option','','固定位置')];options[0].value='';
    state.page.blocks.forEach((p,i)=>{if(p.id===b.id)return;const a=p.layout.bbox,c=b.layout.bbox,overlap=Math.min(a[2],c[2])-Math.max(a[0],c[0]);if((a[1]<c[1]&&overlap>Math.min(a[2]-a[0],c[2]-c[0])*.5&&['paragraph','quote'].includes(p.kind)&&!p.structure)||p.id===b.layout.flow_after){const o=el('option','',String(i+1)+' · '+p.translation.text.slice(0,16));o.value=p.id;options.push(o);}});
    $('flow-after').replaceChildren(...options);$('flow-after').value=b.layout.flow_after||'';
    renderFormatInspector();
  }
  window.updateExtraFields=updateExtraFields;
  for(const id of ['resize-anchor','snap-guides','auto-height','flow-after','gap-before','flow-limit'])$(id).addEventListener('change',()=>{
    const b=current();if(!b)return;
    if(id==='resize-anchor')b.layout.resize_anchor=$(id).value;
    if(id==='snap-guides')b.layout.snap_to_guides=$(id).checked;
    if(id==='auto-height'){b.layout.bbox=effectiveBBox(b);b.layout.auto_height=$(id).checked;if(b.layout.auto_height)b.layout.limit_bottom??=b.layout.bbox[3];else{delete b.layout.flow_after;delete b.layout.limit_bottom;}}
    if(id==='flow-after'){b.layout.bbox=effectiveBBox(b);if($(id).value){b.layout.flow_after=$(id).value;b.layout.auto_height=true;b.layout.gap_before??=12;b.layout.limit_bottom??=b.layout.bbox[3];}else delete b.layout.flow_after;}
    if(id==='gap-before'||id==='flow-limit'){const v=Number($(id).value);if(!$(id).checkValidity()||!Number.isFinite(v)){updateExtraFields();return;}if(id==='gap-before')b.layout.gap_before=v;else b.layout.limit_bottom=v/state.page.reference_size[1];}
    scheduleSave();renderPage();renderLayoutFields();
  });
  $('trim-empty-lines').addEventListener('click',()=>{
    const b=current();if(!b)return;const before=b.translation.text,after=before.replace(/^(?:[ \t]*\r?\n)+/,'').replace(/(?:\r?\n[ \t]*)+$/,'');
    if(before===after){toast('没有首尾空行；框底空余请用“高度随文字”处理。');return;}
    b.translation.spans=remapSpans(before,after,b.translation.spans||[]);b.translation.text=after;scheduleSave();renderPage();renderEditor();
  });
}
