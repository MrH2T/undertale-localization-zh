const test=require('node:test'),assert=require('node:assert/strict');
const {anchorAt,resolve}=require('./dist/notes.js');
test('Unicode anchors follow edits before the quote',()=>{const a=anchorAt('😀前 word 后','word');assert.equal(a.start,4);assert.equal(resolve('增加 😀前 word 后',a).start,7);});
test('Repeated quotes retain their context and ambiguous/deleted anchors stay orphaned',()=>{const a=anchorAt('左 word 右；另 word 处','word');assert.equal(resolve('新 左 word 右；另 word 处',a).start,4);const gone=resolve('word 一个 word',a);assert.equal(gone.status,'orphan');assert.equal(resolve('word',gone).status,'orphan');assert.equal(resolve('没有目标',a).status,'orphan');});
test('Whole paragraph anchors remain attached',()=>assert.equal(resolve('修改正文',anchorAt('原段','')).status,'attached'));
