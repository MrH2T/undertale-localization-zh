import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubData,reconcileIndex,searchPages,INDEX_PATH} from '../github-data.js';
const path='private/content/viewer/p0001.json';
const page={pdf_page:1,title:'测试',blocks:[{id:'p0001-b001',source:{text:'Determination and 決意'},translation:{text:'决心（determination）'}}]};
test('index never hides newer edits, added pages or deleted pages',()=>{
  const tree=[{type:'blob',path,sha:'new'},{type:'blob',path:'private/content/viewer/p0002.json',sha:'b'}];
  const rows=reconcileIndex(tree,{entries:[{path,blob:'old',page},{path:'private/content/viewer/p0003.json',blob:'c',page}]});
  assert.deepEqual(rows.map(r=>[r.number,r.page]),[[1,null],[2,null]]);
  assert.equal(reconcileIndex([{type:'blob',path,sha:'old'}],{entries:[{path,blob:'old',page}]})[0].page,page);
});
test('full text search covers Chinese, Japanese and English without regex execution',()=>{
  assert.equal(searchPages([page],'决心').length,1);assert.equal(searchPages([page],'決意')[0].language,'source');
  assert.equal(searchPages([page],'DETERMINATION').length,1);assert.equal(searchPages([page],'DETERMINATION',{matchCase:true}).length,0);
  assert.equal(searchPages([page],'决心',{language:'source'}).length,0);assert.equal(searchPages([page],'[').length,0);assert.equal(searchPages([page],' ').length,0);
});
test('snapshot pins every file request to one commit and refreshes stale cache',async()=>{
  const sha='a'.repeat(40),calls=[];
  const fetcher=async(url,options)=>{
    calls.push([url,options]);
    if(url.includes('/commits/'))return Response.json({sha,commit:{tree:{sha:'tree'},committer:{date:'2026-10-23'}}});
    if(url.includes('/git/trees/'))return Response.json({tree:[{path:INDEX_PATH,type:'blob',sha:'index'},{path,type:'blob',sha:'new'}]});
    if(url.includes('reader-index.json'))return Response.json({entries:[{path,blob:'old',page:{...page,title:'stale'}}]});
    return Response.json(page);
  };
  const client=new GitHubData('test-only-placeholder',{fetcher});const result=await client.snapshot('test/tag');
  assert.equal(result.pages[0].title,'测试');assert.equal(result.sha,sha);
  for(const [url,options]of calls){assert.ok(url.startsWith('https://api.github.com/repos/'));assert.equal(options.method,undefined);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.ok(!url.includes('test-only-placeholder'));if(url.includes('/contents/'))assert.ok(url.endsWith('?ref='+sha));}
  client.close();await assert.rejects(()=>client.snapshot('main'),{name:'AbortError'});
});
test('401, missing files, rate limits and truncated trees fail explicitly',async()=>{
  for(const code of [401,403,404,429]){const client=new GitHubData('test',{fetcher:async()=>new Response('',{status:code})});await assert.rejects(()=>client.snapshot('main'),error=>error.status===code);}
  const client=new GitHubData('test',{fetcher:async url=>Response.json(url.includes('/commits/')?{sha:'a'.repeat(40),commit:{tree:{sha:'x'}}}:{truncated:true,tree:[]})});
  await assert.rejects(()=>client.snapshot('main'),/清单不完整/);
});
