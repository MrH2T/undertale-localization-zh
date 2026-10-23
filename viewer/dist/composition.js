/* Paragraph composition for editable mixed CJK samples. Text stays untouched;
   only display spans carry line breaks, punctuation trims and spacing. */
(function(root){
  'use strict';
  const opening=/^[（《〈「『【〔［｛“‘(\[]$/u;
  const closing=/^[，。！？；：、）》〉」』】〕］｝”’),.!?:;\]％%]/u;
  const smallKana=/^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶー々]/u;
  const trimOpen=/^[（《〈「『【〔［｛“‘]$/u;
  const trimClose=/^[，。！？；：、）》〉」』】〕］｝”’]$/u;
  const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const latin=/^[\p{Script=Latin}\p{Number}]/u;
  const segmenter=new Intl.Segmenter('zh-Hans',{granularity:'word'});
  function tokenize(text,spans){
    const pattern=/[\p{Script=Latin}\p{Number}][\p{Script=Latin}\p{Number}\p{Mark}]*(?:[’'\-][\p{Script=Latin}\p{Number}\p{Mark}]+)*|[ \t\u00a0]+|…+|—+|[^]/gu;
    const words=Array.from(segmenter.segment(text));let word=0;
    const matches=Array.from(text.matchAll(pattern)).flatMap(m=>{
      const cuts=[0,m[0].length];
      for(const s of spans||[])for(const pos of [s.start,s.end])if(pos>m.index&&pos<m.index+m[0].length)cuts.push(pos-m.index);
      const sorted=Array.from(new Set(cuts)).sort((a,b)=>a-b);
      return sorted.slice(0,-1).map((start,i)=>({0:m[0].slice(start,sorted[i+1]),index:m.index+start}));
    });
    return matches.map(m=>{
      while(word+1<words.length&&words[word+1].index<=m.index)word++;
      const value=m[0],mark=spans?.find(s=>s.start<=m.index&&s.end>=m.index+value.length),lang=mark?.lang==='zh-Hans'?'zh':mark?.lang||(latin.test(value)?'en':/[\u3040-\u30ff]/.test(value)?'ja':'zh');
      return {text:value,index:m.index,word,lang,space:/^[ \t\u00a0]+$/.test(value),italic:lang==='en'&&(mark?.italic??(spans===undefined&&/^(Undertale|ikashita|kōgeki|bibō)$/.test(value)))};
    });
  }
  function boundary(tokens,end){
    if(end===tokens.length)return true;
    let left=end-1,right=end;
    if(tokens[right].space)return false;
    while(left>=0&&tokens[left].space)left--;
    if(left<0)return false;
    const a=tokens[left],b=tokens[right];
    if(opening.test(a.text)||closing.test(b.text)||smallKana.test(b.text))return false;
    if(tokens[end-1].text.includes('\u00a0'))return false;
    return !(a.lang==='en'&&b.lang==='en'&&left===end-1);
  }
  function prepare(tokens,measure,fontSize){
    for(const token of tokens){
      const measured=measure(token);
      token.width=typeof measured==='number'?measured:measured.width;
      // Never trim the ink: some fullwidth brackets have less than half an em
      // of side bearing. Canvas measures the actual loaded font's glyph bounds.
      token.trimStart=Math.min(fontSize/2,typeof measured==='number'?fontSize/2:measured.blankLeft);
      token.trimEnd=Math.min(fontSize/2,typeof measured==='number'?fontSize/2:measured.blankRight);
    }
    for(let i=0;i<tokens.length;i++){
      const t=tokens[i],next=tokens[i+1];
      t.trimAfter=next&&trimClose.test(t.text)&&(trimOpen.test(next.text)||trimClose.test(next.text))?t.trimEnd:0;
      t.autoAfter=next&&!t.space&&!next.space&&((t.lang==='en'&&cjk.test(next.text))||(cjk.test(t.text)&&next.lang==='en'))?fontSize*.125:0;
    }
  }
  function metrics(tokens,start,end,fontSize){
    let first=start,last=end-1;
    while(first<=last&&tokens[first].space)first++;
    while(last>=first&&tokens[last].space)last--;
    const widths=[],gaps=[];let natural=0,opportunities=0;
    for(let i=start;i<end;i++){
      const t=tokens[i],hidden=i<first||i>last;
      const trimLeft=i===first&&trimOpen.test(t.text)?t.trimStart:0;
      const trimRight=i===last&&trimClose.test(t.text)?t.trimEnd:(i<last?t.trimAfter:0);
      const width=hidden?0:t.width-trimLeft-trimRight;
      const next=tokens[i+1];
      const base=i<last?t.autoAfter:0;
      // Expansion goes between ideographs or words, never inside a Latin word
      // or between paired punctuation. Each opportunity is independently small.
      const weight=i<last&&!hidden&&!opening.test(t.text)&&!closing.test(next.text)&&!next.space&&(t.space||cjk.test(t.text)||cjk.test(next.text)||closing.test(t.text)||opening.test(next.text))?1:0;
      widths.push({width,trimLeft,trimRight,hidden});gaps.push({base,weight});
      natural+=width+base;opportunities+=weight;
    }
    return {natural,opportunities,widths,gaps,first,last};
  }
  function compose(text,width,fontSize,measure,spans){
    const tokens=tokenize(text,spans);prepare(tokens,measure,fontSize);
    const n=tokens.length;if(!n)return {tokens,lines:[]};
    const best=Array(n+1).fill(null);best[n]={cost:0,lines:0};
    for(let start=n-1;start>=0;start--){
      let raw=0;
      for(let end=start+1;end<=n;end++){
        raw+=tokens[end-1].width;
        if(raw>width+fontSize*6)break;
        if(!boundary(tokens,end)||!best[end])continue;
        const m=metrics(tokens,start,end,fontSize),slack=width-m.natural;
        if(slack<-.02)continue;
        const last=end===n;
        if(!last&&!m.opportunities)continue;
        const expansion=last?0:slack/m.opportunities;
        let cost=last?Math.pow(Math.max(0,fontSize*6-m.natural)/fontSize,2)*12:Math.pow(expansion/fontSize,2)*1000+Math.pow(Math.max(0,expansion/fontSize-.07),2)*40000;
        if(!last){
          let prev=end-1;while(prev>=start&&tokens[prev].space)prev--;
          if(tokens[prev]?.word===tokens[end]?.word)cost+=4;
          if(tokens[prev]?.lang==='en'&&tokens[end]?.lang==='en')cost+=100;
        }
        const total=cost+best[end].cost,lines=best[end].lines+1;
        if(!best[start]||lines<best[start].lines||(lines===best[start].lines&&total<best[start].cost))best[start]={cost:total,lines,end,m,expansion};
      }
    }
    if(!best[0])return null; // Oversize/unhandled input uses normal browser layout.
    const lines=[];for(let start=0;start<n;){const b=best[start];lines.push({start,end:b.end,...b.m,expansion:b.expansion});start=b.end;}
    return {tokens,lines};
  }
  let context;
  function render(node,text,style){
    if(text.length>4000||/[\p{Extended_Pictographic}\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text))return false;
    context||=document.createElement('canvas').getContext('2d');
    const cache=new Map(),fontSize=style.fontSize;
    function measure(token){
      const family=token.lang==='en'?'Book Serif Latin':token.lang==='ja'?'Book Serif JP':'Book Serif SC';
      const weight=token.lang==='zh'?style.weight:400;
      const font=`${token.italic?'italic':'normal'} ${weight} ${fontSize}px "${family}"`;
      const key=font+'|'+token.text;
      if(!cache.has(key)){
        context.font=font;context.fontKerning='normal';const measured=context.measureText(token.text);
        cache.set(key,{width:measured.width,blankLeft:Math.max(0,-measured.actualBoundingBoxLeft),blankRight:Math.max(0,measured.width-measured.actualBoundingBoxRight)});
      }
      return cache.get(key);
    }
    let offset=0;const paragraphs=text.split('\n'),results=paragraphs.map(p=>{const spans=style.spans?.filter(s=>s.end>offset&&s.start<offset+p.length).map(s=>({...s,start:Math.max(0,s.start-offset),end:Math.min(p.length,s.end-offset)}));const result=compose(p,style.width,fontSize,measure,spans);offset+=p.length+1;return result;});
    if(results.some(r=>!r))return false;
    const fragment=document.createDocumentFragment();
    results.forEach((result,p)=>{
      if(p)fragment.append(document.createTextNode('\n'));
      if(!result.lines.length){const empty=document.createElement('span');empty.className='composed-line';fragment.append(empty);}
      result.lines.forEach(line=>{
        const row=document.createElement('span');row.className='composed-line';row.setAttribute('aria-hidden','true');
        row.dataset.expansion=line.expansion.toFixed(3);row.dataset.natural=line.natural.toFixed(3);
        const last=line.end===result.tokens.length;row.dataset.last=String(last);
        for(let i=line.start;i<line.end;i++){
          const t=result.tokens[i],m=line.widths[i-line.start],g=line.gaps[i-line.start];
          const part=document.createElement(t.italic?'em':'span');part.className='composed-token';part.lang=t.lang==='zh'?'zh-Hans':t.lang;part.textContent=t.text;
          part.style.width=(m.hidden?0:t.width)+'px';
          part.style.marginLeft=-m.trimLeft+'px';
          part.style.marginRight=(-m.trimRight+g.base+g.weight*line.expansion)+'px';
          if(m.hidden){part.style.fontSize='0';part.style.overflow='hidden';}
          row.append(part);
        }
        fragment.append(row);
      });
    });
    node.replaceChildren(fragment);node.classList.add('composed');node.setAttribute('role','group');node.setAttribute('aria-label',text);return true;
  }
  const api={tokenize,boundary,compose,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.BookComposition=api;
})(typeof window!=='undefined'?window:globalThis);
