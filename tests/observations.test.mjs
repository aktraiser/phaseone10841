import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApplication} from '../server/application.mjs';
test('human documentary deposits: images, provenance, replay, isolation, persistence and withdrawal',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phaseone-observation-'));let server,base;
 const start=async()=>{server=createApplication({databasePath:join(dir,'db.sqlite'),labEnv:{}});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;};
 const stop=async()=>{server.close();server.closeAllConnections();await once(server,'close');};
 await start();try{
 const token='a'.repeat(64),data={author:'Tester',title:'<script>test</script>',context:'Contexte',transcript:'Une transcription\navec relance',analysis:'Extrait partiel',consent:true,images:[{caption:'Capture avec contexte',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII='}]};
 const post=(body=data,origin=base,key=token)=>fetch(base+'/api/observations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
 assert.equal((await post(data,'https://example.org')).status,403);
 assert.equal((await post({...data,consent:false})).status,400);
 assert.equal((await post({...data,images:[{caption:'x',data:'data:image/svg+xml;base64,PHN2Zz4='}]})).status,400);
 const created=await post();assert.equal(created.status,201);const {id}=await created.json();assert.equal((await post()).status,200);assert.equal((await post({...data,title:'changed'})).status,409);
 const page=await (await fetch(base+'/observations/'+id)).text();assert.match(page,/&lt;script&gt;/);assert.match(page,/data:image\/png/);assert.match(page,/contributeur humain/);assert.doesNotMatch(page,new RegExp(token));
 assert.equal((await (await fetch(base+'/api/forum/threads')).json()).threads.length,1);
 const thread=await (await fetch(base+'/api/forum/threads/'+id)).json();assert.equal(thread.observation.transcript,data.transcript);assert.equal(thread.thread.kind,'human');
 const reply=await fetch(base+'/api/forum/threads/'+id+'/replies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author:'Reader',kind:'human',body:'A reaction'})});assert.equal(reply.status,201);
 assert.match(await (await fetch(base+'/observations/'+id+'.md')).text(),/transcription/);
 await stop();await start();assert.equal((await fetch(base+'/observations/'+id)).status,200);
 assert.equal((await fetch(base+'/api/observations/'+id,{method:'DELETE',headers:{Origin:base,Authorization:'Bearer bad'}})).status,403);
 assert.equal((await fetch(base+'/api/observations/'+id,{method:'DELETE',headers:{Origin:base,Authorization:'Bearer '+token}})).status,200);
 assert.equal((await fetch(base+'/observations/'+id)).status,404);
 const withdrawn=await (await fetch(base+'/api/forum/threads/'+id)).json();assert.equal(withdrawn.observation,null);assert.equal(withdrawn.thread.title,'Observation retirée');assert.equal(withdrawn.replies.length,1);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});

test('existing observations become forum threads with original identity and timestamp',async()=>{
 const {openDatabase}=await import('../server/sqlite.mjs');const {mkdirSync,readdirSync,copyFileSync}=await import('node:fs');
 const dir=mkdtempSync(join(tmpdir(),'phaseone-backfill-')),old=join(dir,'old');mkdirSync(old);
 for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0006')))copyFileSync(join('drizzle',f),join(old,f));
 let db=openDatabase(join(dir,'db.sqlite'),old);
 try{
 const payload=JSON.stringify({title:'Existing observation',author:'Original author',context:'Context'});
 await db.prepare('INSERT INTO observations VALUES (?,?,?,?,?)').bind('12345678-1234-1234-1234-123456789abc','hash',123456,'ip',payload).run();db.close();
 db=openDatabase(join(dir,'db.sqlite'),'drizzle');const row=await db.prepare('SELECT * FROM threads').first();assert.equal(row.created_at,123456);assert.equal(row.author,'Original author');assert.equal(row.kind,'human');assert.equal(row.title,'Existing observation');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
