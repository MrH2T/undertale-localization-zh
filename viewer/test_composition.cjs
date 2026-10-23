const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {tokenize,compose,boundary}=require('./dist/composition.js');
const measure=t=>t.space?5*t.text.length:t.lang==='en'?10*t.text.length:20*[...t.text].length;
function lines(result){return result.lines.map(l=>result.tokens.slice(l.start,l.end).map(t=>t.text).join(''));}
test('tokenization preserves mixed text and keeps words / paired punctuation whole',()=>{
  const text='中文 “COOL DUDE” （ikashita kōgeki）……——Toby’s 256graph。';
  const t=tokenize(text);assert.equal(t.map(x=>x.text).join(''),text);
  for(const word of ['COOL','DUDE','kōgeki','Toby’s','256graph','……','——'])assert(t.some(t=>t.text===word));
});
test('line boundaries obey opening / closing punctuation and Japanese small kana',()=>{
  for(const text of ['甲乙（丙丁），戊己。庚辛。','甲“乙丙”丁戊己庚辛。','甲乙きゃく丁戊己。']){
    const result=compose(text,140,20,measure);assert(result);
    assert.equal(lines(result).join(''),text);
    for(const l of result.lines){assert(boundary(result.tokens,l.end));assert(!/^[，。！？；：、）》〉」』】〕］｝”’ゃ]/.test(result.tokens[l.start].text));}
  }
});
test('all nonfinal rows fit exactly; final rows retain natural spacing',()=>{
  const result=compose('这是中文正文。英文 Papyrus 和 Undertale 保持完整的字形与字距，最后一行自然收尾。',260,20,measure);
  assert(result);
  result.lines.forEach((l,i)=>{assert(l.natural<=260.02);if(i===result.lines.length-1)assert.equal(l.expansion,0);else assert(Math.abs(l.natural+l.expansion*l.opportunities-260)<.001);});
});
test('trailing spaces remain in the text without producing leading visual spaces',()=>{
  const text='甲乙 COOL DUDE 丙丁 戊己 庚辛';const r=compose(text,160,20,measure);assert(r);
  assert.equal(lines(r).join(''),text);
  r.lines.forEach(l=>{for(let i=l.start;i<l.first;i++)assert.equal(l.widths[i-l.start].width,0);for(let i=l.last+1;i<l.end;i++)assert.equal(l.widths[i-l.start].width,0);});
});
test('an oversized Latin word returns browser fallback, never drops or truncates text',()=>{
  assert.equal(compose('Supercalifragilisticexpialidocious',80,20,measure),null);
});
test('punctuation trimming never exceeds measured blank side bearings',()=>{
  const r=compose('《甲乙》，丙丁。',140,20,t=>({width:measure(t),blankLeft:3,blankRight:2}));
  assert(r);for(const l of r.lines)for(const w of l.widths){assert(w.trimLeft<=3);assert(w.trimRight<=2);}
});
test('all sample paragraphs preserve every character through composition',()=>{
  for(const page of [60,140,220]){
    const p=JSON.parse(fs.readFileSync(path.join(__dirname,`../private/content/viewer/p${String(page).padStart(4,'0')}.json`),'utf8'));
    for(const b of p.blocks.filter(b=>['paragraph','quote'].includes(b.kind))){
      const r=compose(b.translation.text,(b.layout.bbox[2]-b.layout.bbox[0])*p.reference_size[0],b.layout.font_size,measure);
      assert(r,b.id);assert.equal(lines(r).join(''),b.translation.text,b.id);
    }
  }
});

const {segments}=require('./dist/composition.js');
test('fixed display breaks preserve text and UTF-16 offsets for bilingual formatting',()=>{
 const text='中文😀。Undertale\n下一段';const rows=segments(text,'😀。');
 assert.deepEqual(rows,[{text:'中文😀。',offset:0},{text:'Undertale',offset:5},{text:'下一段',offset:15}]);
 for(const row of rows)assert.equal(text.slice(row.offset,row.offset+row.text.length),row.text);
 assert.deepEqual(segments('甲\n乙','甲'),[{text:'甲',offset:0},{text:'乙',offset:2}]);
 assert.deepEqual(segments('甲\n乙','丙'),segments('甲\n乙'));
 assert.deepEqual(segments('甲','甲'),[{text:'甲',offset:0}]);
});
