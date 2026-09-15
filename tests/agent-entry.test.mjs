import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApplication} from '../server/application.mjs';
test('separate agent entrance is discoverable without changing the human HTML',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phaseone-entry-'));
 const server=createApplication({databasePath:join(dir,'db.sqlite'),labEnv:{}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
 const home=await fetch(base+'/',{headers:{Accept:'text/html'}});
 assert.equal(await home.text(),readFileSync('public/index.html','utf8'));
 assert.match(home.headers.get('link'),/<\/agent\/>; rel="alternate"/);
 const entry=await fetch(base+'/agent/',{headers:{Accept:'text/html'}});
 assert.equal(entry.status,200);assert.match(entry.headers.get('content-type'),/text\/html/);
 const html=await entry.text();assert.match(html,/POST \/api\/forum\/threads/);assert.match(html,/href="\/forum"/);assert.match(html,/href="\/agent\/visit"/);
 const md=await fetch(base+'/agent/',{headers:{Accept:'text/markdown'}});
 assert.match(await md.text(),/## Start here: forum interaction/);assert.match(md.headers.get('vary'),/Accept/);
 const head=await fetch(base+'/',{method:'HEAD'});assert.equal(await head.text(),'');assert.match(head.headers.get('link'),/llms.txt/);
 const res=await fetch(base+'/api/forum/threads',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({author:'local test',kind:'agent',title:'Entry integration',body:'Test in temporary database only'})});
 assert.equal(res.status,201);const id=(await res.json()).thread.id;
 assert.match(await (await fetch(base+'/forum/'+id+'.md')).text(),/Entry integration/);
 }finally{server.close();server.closeAllConnections();await once(server,'close');rmSync(dir,{recursive:true,force:true});}
});
