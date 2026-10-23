import test from 'node:test';
import assert from 'node:assert/strict';
import {BookData,searchPages} from '../book-data.js';
const sha='a'.repeat(40),imageSha='b'.repeat(40);
const page={pdf_page:1,title:'测试',blocks:[{id:'p0001-b001',source:{text:'Determination and 決意'},translation:{text:'决心（determination）'}}]};
const catalog={versions:[{ref:'main',sha,date:'2026-10-23'},{ref:'reader-v1',sha,date:'2026-10-23'}]};
test('static reading and images use only same-site files without credentials',async()=>{
  const calls=[],client=new BookData({fetcher:async(url,options)=>{
    calls.push([url,options]);
    if(url.endsWith('catalog.json'))return Response.json(catalog);
    if(url.endsWith('index.json'))return Response.json({sha,pages:[page],images:{'images/p0001.jpg':imageSha}});
    return new Response('image');
  }});
  const result=await client.snapshot('reader-v1');assert.equal(result.pages[0].title,'测试');assert.equal(result.ref,'reader-v1');
  await client.image(page,result);
  assert.deepEqual(calls.map(c=>c[0]),['./data/catalog.json','./data/versions/'+sha+'/index.json','./data/images/'+imageSha+'.jpg']);
  for(const [url,options]of calls){assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);assert.ok(!url.includes('api.github.com'));}
  client.close();await assert.rejects(()=>client.snapshot('main'),{name:'AbortError'});
});
test('reopening an unchanged version only checks the small catalog',async()=>{
  const calls=[],cached={sha,ref:'main',tree:new Map(),pages:[page]};
  const client=new BookData({fetcher:async url=>{calls.push(url);return Response.json(catalog);}});
  assert.equal(await client.snapshot('main',()=>{},cached),cached);assert.equal(calls.length,1);
});
test('newly published main replaces the old snapshot and unknown versions fail',async()=>{
  const client=new BookData({fetcher:async url=>Response.json(url.endsWith('catalog.json')?catalog:{sha,pages:[page],images:{}})});
  const result=await client.snapshot('main',()=>{},{sha:'c'.repeat(40),ref:'main',tree:new Map(),pages:[{...page,title:'old'}]});
  assert.equal(result.pages[0].title,'测试');await assert.rejects(()=>client.snapshot('missing'),/尚未发布/);
  await assert.rejects(()=>client.image(page,{tree:new Map([['images/p0001.jpg','../invalid']])}),/地址无效/);
});
test('full text search covers Chinese, Japanese and English without regex execution',()=>{
  assert.equal(searchPages([page],'决心').length,1);assert.equal(searchPages([page],'決意')[0].language,'source');
  assert.equal(searchPages([page],'DETERMINATION').length,1);assert.equal(searchPages([page],'DETERMINATION',{matchCase:true}).length,0);
  assert.equal(searchPages([page],'决心',{language:'source'}).length,0);assert.equal(searchPages([page],'[').length,0);assert.equal(searchPages([page],' ').length,0);
});
