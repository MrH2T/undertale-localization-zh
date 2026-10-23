const test=require('node:test'),assert=require('node:assert/strict');
const {anchor,resize,snap}=require('./dist/layout.js');
test('resizing preserves the selected left, right or center edge',()=>{
  const b=[.1,.2,.3,.4];
  assert.deepEqual(resize(b,.4,'left'),[.1,.2,.5,.4]);
  const r=resize(b,.25,'right');assert.ok(Math.abs(r[2]-.3)<1e-8);assert.ok(Math.abs(r[0]-.05)<1e-8);
  const c=resize(b,.3,'center');assert.ok(Math.abs(c[0]+c[2]-.4)<1e-8);
  assert.equal(anchor({kind:'aside',layout:{}}),'right');assert.equal(anchor({kind:'aside',layout:{text_align:'left'}}),'left');
});
test('page bounds constrain width without moving its anchor',()=>{
  assert.deepEqual(resize([.8,0,.9,1],.5,'left'),[.8,0,1,1]);
  const c=resize([.1,0,.3,1],.9,'center');assert.equal(c[0],0);assert.equal(c[2],.4);
});
test('snapping an editable edge never moves the opposite fixed edge',()=>{
  const b=[.102,0,.302,1],g={left:[.1],right:[.5],center:[.2]};
  const r=snap(b,'right',g,'resize',.004);assert.equal(r.line,.1);assert.equal(r.bbox[0],.1);assert.equal(r.bbox[2],.302);
  const far=snap(b,'left',g,'resize',.004);assert.equal(far.line,null);assert.deepEqual(far.bbox,b);
});
