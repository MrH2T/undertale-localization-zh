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
    if(url.endsWith('manifest.json'))return Response.json({sha,pages:[{pdf_page:1,title:'测试'}],images:{'images/p0001.jpg':imageSha}});
    if(url.endsWith('p0001.json'))return Response.json(page);
    return new Response('image');
  }});
  const result=await client.snapshot('reader-v1');assert.equal(result.pages[0].title,'测试');assert.equal(result.ref,'reader-v1');
  assert.equal(result.pages[0].blocks,undefined);
  assert.deepEqual(await client.page(1,result),page);
  await client.image(page,result);
  assert.deepEqual(calls.map(c=>c[0]),['./data/catalog.json','./data/versions/'+sha+'/manifest.json','./data/versions/'+sha+'/pages/p0001.json','./data/images/'+imageSha+'.jpg']);
  await client.page(1,result);assert.equal(calls.length,4);
  assert.ok(!calls.some(([url])=>url.endsWith('index.json')||url.endsWith('search.json')));
  for(const [url,options]of calls){assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);assert.ok(!url.includes('api.github.com'));}
  client.close();await assert.rejects(()=>client.snapshot('main'),{name:'AbortError'});
});
test('reopening an unchanged version only checks the small catalog',async()=>{
  const calls=[],cached={format:2,sha,ref:'main',tree:new Map(),pages:[page]};
  const client=new BookData({fetcher:async url=>{calls.push(url);return Response.json(catalog);}});
  assert.equal(await client.snapshot('main',()=>{},cached),cached);assert.equal(calls.length,1);
});
test('full-book search is fetched only when requested and reused',async()=>{
  let calls=0;const client=new BookData({fetcher:async url=>{calls++;assert.ok(url.endsWith('/search.json'));return Response.json({sha,pages:[page]});}});
  const [first,second]=await Promise.all([client.searchData({sha}),client.searchData({sha})]);
  assert.equal(calls,1);assert.equal(first,second);assert.equal(searchPages(first,'决心').length,1);
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
