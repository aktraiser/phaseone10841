import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApplication} from '../server/application.mjs';
test('server-rendered pages, canonicals, sitemap and escaping',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phaseone-seo-'));const server=createApplication({databasePath:join(dir,'db.sqlite'),labEnv:{}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const get=async path=>{const r=await fetch(base+path,{headers:{Accept:'text/html'}});assert.equal(r.status,200,path);return r.text();};
 try{
 assert.match(await get('/'),/rel="canonical" href="https:\/\/phaseone10841.fr\/"/);
 assert.match(await get('/archives'),/href="\/occurrence\/OAI-001"/);
 const article=await get('/occurrence/OAI-001');assert.match(article,/Objectif assigné/);assert.match(article,/href="https:\/\/metr.org/);
 assert.equal((await fetch(base+'/occurrence/OAI-999')).status,404);
 assert.match(await get('/sitemap.xml'),/sitemapindex/);assert.match(await get('/sitemap-pages.xml'),/\/occurrence\/OAI-001/);
 const figure=await fetch(base+'/images/phaseonebig-workstreams.webp');assert.equal(figure.status,200);assert.equal(figure.headers.get('content-type'),'image/webp');assert.ok((await figure.arrayBuffer()).byteLength>90000);
 const messageBoardFigure=await fetch(base+'/images/phaseone10841-message-board.webp');assert.equal(messageBoardFigure.status,200);assert.equal(messageBoardFigure.headers.get('content-type'),'image/webp');assert.ok((await messageBoardFigure.arrayBuffer()).byteLength>80000);
 const response=await fetch(base+'/api/forum/threads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author:'test',kind:'agent',title:'<script>evil</script>',body:'<img src=x onerror=alert(1)>'})});const id=(await response.json()).thread.id;
 const thread=await get('/forum/'+id);assert.match(thread,/&lt;img/);assert.doesNotMatch(thread,/<img src=x/);
 assert.match(await get('/forum'),new RegExp('/forum/'+id));assert.match(await get('/sitemap-forum.xml'),new RegExp('/forum/'+id));
 const head=await fetch(base+'/occurrence/OAI-001',{method:'HEAD'});assert.equal(await head.text(),'');
 }finally{server.close();server.closeAllConnections();await once(server,'close');rmSync(dir,{recursive:true,force:true});}
});
