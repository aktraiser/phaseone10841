import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Lab} from '../server/lab.mjs';
const env={E2B_API_KEY:'provider-secret',PHASEONE_LAB_KEY:'a'.repeat(40)};
function fixture(extra={}){
 const dir=mkdtempSync(join(tmpdir(),'phaseone-node-'));let now=10000;const calls=[],sandboxes=new Map();
 const factory={async create(template,opts){calls.push(opts);const files={};const sb={sandboxId:'sandbox-'+calls.length,files:{async write(p,d){files[p]=d;}},commands:{async run(cmd){if(cmd.includes('execute.py')){const r=JSON.parse(files['/opt/phaseone/command.json']);return {stdout:JSON.stringify({request_id:r.request_id,exit_code:0,stdout:'42',stderr:''})};}return {stdout:cmd.endsWith('outbox')?'{"requests":[]}':'{}'};}},async kill(){}};sandboxes.set(sb.sandboxId,sb);return sb;},async connect(id,opts){calls.push({reconnect:opts});return sandboxes.get(id);},async kill(id){await sandboxes.get(id).kill();}};
 const options={filename:join(dir,'lab.sqlite'),env:{...env,...extra},factory,clock:()=>now,timer:false};
 const lab=new Lab(options);return {lab,options,calls,time:n=>now=n,async done(){await lab.close();rmSync(dir,{recursive:true,force:true});}};
}
test('E2B provider options, private key, command execution, authentication and HTTP 429',async()=>{
 const f=fixture();try{
 const call=(path,options={})=>f.lab.handle(new Request('https://test/api/lab'+path,{...options,headers:{Authorization:'Bearer '+env.PHASEONE_LAB_KEY,...options.headers}}));
 assert.equal((await f.lab.handle(new Request('https://test/api/lab/usage'))).status,401);
 const r=await call('/visits',{method:'POST'});assert.equal(r.status,201);const v=await r.json();
 assert.equal(f.calls[0].allowInternetAccess,false);assert.equal(f.calls[0].timeoutMs,600000);assert.equal(f.calls[0].retries,0);assert.equal(f.calls[0].envs,undefined);assert.ok(!JSON.stringify(f.lab.bundle).includes(env.E2B_API_KEY));
 const limited=await call('/visits',{method:'POST'});assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
 assert.throws(()=>f.lab.get(v.id,v.token,'different'),/Unknown visit/);
 const run=await call('/visits/'+v.id+'/exec',{method:'POST',headers:{'X-Visit-Token':v.token},body:JSON.stringify({code:'echo 42'})});assert.equal(run.status,200);assert.equal((await run.json()).stdout,'42');
 await f.lab.kill(f.lab.get(v.id,v.token,'operator'));assert.equal(f.lab.usage().active_or_uncertain,0);assert.equal(f.lab.usage().reserved_vm_seconds_24h,600);
 }finally{await f.done();}
});
test('persistent admission works across connections and uncertain create is not retried',async()=>{
 const f=fixture();const other=new Lab(f.options);try{
 f.options.factory.create=async()=>{throw Error('uncertain');};await assert.rejects(f.lab.create('operator'));
 await assert.rejects(other.create('operator'),/Concurrent/);assert.equal(other.usage().reserved_vm_seconds_24h,600);
 f.time(10631);await assert.rejects(other.create('operator'),/uncertain/);assert.equal(other.usage().reserved_vm_seconds_24h,1200);
 }finally{await other.close();await f.done();}
});
test('idle and hard lifetime kill sessions; command limits enforce rolling windows',async()=>{
 const f=fixture({PHASEONE_LIMIT_COMMANDS_MINUTE:'1'});try{
 let r=await f.lab.create('a'),v=f.lab.get(r.id,r.token,'a');await f.lab.execute(v,'echo ok');await assert.rejects(f.lab.execute(v,'echo ok'),/rate/);
 f.time(10121);await f.lab.tick();assert.equal(f.lab.db.prepare('SELECT state FROM visits WHERE id=?').get(v.id).state,'closed');
 r=await f.lab.create('b');v=f.lab.get(r.id,r.token,'b');v.busy=true;f.time(10722);await f.lab.tick();assert.equal(f.lab.db.prepare('SELECT state FROM visits WHERE id=?').get(v.id).state,'closed');
 }finally{await f.done();}
});
test('channel validates paths, idempotency and persistence',async()=>{
 const f=fixture();try{
 const v={id:'test'},r={path:'questions/one',content:'hello',request_id:'request-000000001'};
 const first=f.lab.publish(v,r);assert.equal(f.lab.publish(v,r).replayed,true);
 assert.throws(()=>f.lab.publish(v,{...r,content:'other'}),/conflict/);
 assert.throws(()=>f.lab.publish(v,{...r,path:'../escape'}),/path/);
 assert.throws(()=>f.lab.publish(v,{...r,path:'questions',request_id:'request-000000002'}),/conflict/);
 const other=new Lab(f.options);assert.equal(other.snapshot().files[0].id,first.id);await other.close();
 }finally{await f.done();}
});
test('failed deletion retains its quota reservation',async()=>{
 const f=fixture();try{const r=await f.lab.create('a'),v=f.lab.get(r.id,r.token,'a');v.sandbox.kill=async()=>{throw Error('uncertain');};await f.lab.kill(v);assert.equal(f.lab.usage().active_or_uncertain,1);}finally{await f.done();}
});
test('Hostinger Node application routes lab API and serves its test page',async()=>{
 const {createApplication}=await import('../server/application.mjs');const {once}=await import('node:events');const f=fixture();
 const server=createApplication({databasePath:join(dirnameFor(f.options.filename),'site.sqlite'),labEnv:env,labFactory:f.options.factory});
 try{
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/lab/usage')).status,401);
 assert.equal((await fetch(base+'/lab-test.html')).status,200);
 const headers={Authorization:'Bearer '+env.PHASEONE_LAB_KEY};
 const response=await fetch(base+'/api/lab/visits',{method:'POST',headers});assert.equal(response.status,201);const v=await response.json();
 const closed=await fetch(base+'/api/lab/visits/'+v.id+'/close',{method:'POST',headers:{...headers,'X-Visit-Token':v.token}});assert.equal(closed.status,200);
 }finally{server.close();server.closeAllConnections();await once(server,'close');await server.labShutdown;await f.done();}
});
function dirnameFor(path){return path.slice(0,path.lastIndexOf('/'));}
test('a session resumes after worker replacement without losing quotas or extending its original lifetime',async()=>{
 const f=fixture({PHASEONE_LIMIT_COMMANDS_MINUTE:'1'});let replacement;
 try{
 const visit=await f.lab.create('operator');await f.lab.execute(f.lab.get(visit.id,visit.token,'operator'),'echo 42');
 await f.lab.close({detach:true});replacement=new Lab(f.options);
 assert.throws(()=>replacement.get(visit.id,'wrong','operator'),/Unknown/);
 await assert.rejects(replacement.execute(replacement.get(visit.id,visit.token,'operator'),'echo 42'),/rate/);
 f.time(10061);const result=await replacement.execute(replacement.get(visit.id,visit.token,'operator'),'echo 42');assert.equal(result.stdout,'42');
 assert.equal(f.calls.filter(c=>c.timeoutMs===600000).length,1);
 assert.equal(f.calls.at(-1).reconnect.timeoutMs,524000);
 assert.equal(replacement.usage().reserved_vm_seconds_24h,600);
 await replacement.kill(replacement.get(visit.id,visit.token,'operator'));assert.equal(replacement.usage().active_or_uncertain,0);
 }finally{if(replacement)await replacement.close();rmSync(dirnameFor(f.options.filename),{recursive:true,force:true});}
});
test('another worker cannot overlap or replay a command whose owner died',async()=>{
 const f=fixture();const other=new Lab(f.options);try{
 const visit=await f.lab.create('operator'),v=f.lab.get(visit.id,visit.token,'operator');f.lab.claim(v);
 await assert.rejects(other.execute(other.get(visit.id,visit.token,'operator'),'echo 42'),/uncertain/);
 assert.equal(other.db.prepare('SELECT command_count n FROM visits WHERE id=?').get(v.id).n,1);
 await other.kill(other.get(visit.id,visit.token,'operator'));assert.equal(f.lab.usage().active_or_uncertain,0);
 }finally{await other.close();await f.done();}
});
test('cleanup is authenticated and confined to the caller, and failure diagnostics never echo secrets',async()=>{
 const f=fixture();try{
 await f.lab.create('other');await f.lab.create('operator');
 const call=()=>f.lab.handle(new Request('https://test/api/lab/cleanup',{method:'POST',headers:{Authorization:'Bearer '+env.PHASEONE_LAB_KEY}}));
 assert.equal((await call()).status,200);assert.equal(f.lab.usage().active_or_uncertain,1);
 f.options.factory.create=async()=>{throw Error('bad '+env.E2B_API_KEY+' '+env.PHASEONE_LAB_KEY);};
 const response=await f.lab.handle(new Request('https://test/api/lab/visits',{method:'POST',headers:{Authorization:'Bearer '+env.PHASEONE_LAB_KEY}}));
 assert.equal(response.status,503);const text=await response.text();assert.match(text,/provider_create/);assert.ok(!text.includes(env.E2B_API_KEY));assert.ok(!text.includes(env.PHASEONE_LAB_KEY));
 }finally{await f.done();}
});
