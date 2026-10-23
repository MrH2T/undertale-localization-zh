const test=require('node:test'),assert=require('node:assert/strict');
const {remapSpans,parsePageRange}=require('./dist/files.js');
test('ranges are explicit, stable and reject unavailable pages',()=>{
  assert.deepEqual(parsePageRange('90-92，91,99',[90,91,92,99]),[90,91,92,99]);
  assert.throws(()=>parsePageRange('1-272',[90,91]));assert.throws(()=>parsePageRange('99-90',[90,99]));
});
test('format spans move with insertion and survive edits inside their words',()=>{
  const spans=[{start:2,end:6,italic:true,lang:'en'}];
  assert.deepEqual(remapSpans('中 word','新增中 word',spans),[{start:4,end:8,italic:true,lang:'en'}]);
  assert.deepEqual(remapSpans('中 word','中 worlds',spans),[{start:2,end:8,italic:true,lang:'en'}]);
  assert.deepEqual(remapSpans('中 word','中 ',spans),[]);
});
test('composition applies stored italics across explicit paragraph boundaries',()=>{
  const c=require('./dist/composition.js');
  const tokens=c.tokenize('名字 EarthBound 与 Undertale',[{start:3,end:13,italic:true,lang:'en'}]);
  assert.equal(tokens.find(t=>t.text==='EarthBound').italic,true);
  assert.equal(tokens.find(t=>t.text==='Undertale').italic,false);
});

test('replacement across several styles removes obsolete spans without overlap',()=>{
  const spans=[{start:0,end:3,italic:true,lang:'en'},{start:4,end:7,italic:false,lang:'en'}];
  assert.deepEqual(remapSpans('one two','new',spans),[{start:0,end:3,italic:true,lang:'en'}]);
});
test('partial-word formatting is retained without allowing a word break',()=>{
  const c=require('./dist/composition.js'),tokens=c.tokenize('Undertale',[{start:3,end:8,italic:true,lang:'en'}]);
  assert.deepEqual(tokens.map(t=>[t.text,t.italic]),[['Und',false],['ertal',true],['e',false]]);
  assert.equal(c.boundary(tokens,1),false);assert.equal(c.boundary(tokens,2),false);
});
