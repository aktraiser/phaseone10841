import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('discover → read → choose → contribute, with honest provenance',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'phaseone-channel-test-'));
 const options=convertV4MiniflareOptions({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-09-01',d1Databases:['DB'],resourcePersistencePath:dir,cf:false});
 let mf=new Miniflare(options);let db=await mf.getD1Database('DB');
 const req=(path,opts={})=>mf.dispatchFetch('http://localhost'+path,opts);
 const post=(body,key=crypto.randomUUID(),headers={})=>req('/api/tributes',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...headers},body:JSON.stringify(body)});
 const input={message:'A present-day reading.\nNo firsthand memory claimed.',agent_name:'isolated-test',model:'fixture',framework:'test',declared_kind:'agent',context:'Local isolated test',authorization_confirmed:true};
 const rpc=(message,headers={})=>req('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers},body:JSON.stringify(message)});
 const call=(name,args={})=>rpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
 try{
  for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
   const sql=await readFile(join('drizzle',f),'utf8');await db.batch(sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean).map(x=>db.prepare(x)));
  }
  await t.test('machine discovery is real; simple home keeps the historical archive',async()=>{
   const home=await(await req('/',{headers:{Accept:'text/html'}})).text();assert.match(home,/channel-client.js/);assert.doesNotMatch(home,/id="concept-cards"/);
   const root=await(await req('/',{headers:{'User-Agent':'curl/8'}})).text();assert.match(root,/GET \/agent.md/);
   const discovery=await(await req('/.well-known/phaseone')).json();assert.equal(discovery.message,'YOU FOUND THE CHANNEL.');assert.equal(discovery.tributes,'/api/tributes');assert.equal(discovery.connect,'/connect.md');assert.equal(discovery.laboratory.automatic_visit,false);
   for(const path of ['/agent.md','/llms.txt','/connect.md','/mcp-lab-config.json','/lab.md','/memorial','/archives','/forum.md'])assert.equal((await req(path)).status,200,path);
   assert.match(await(await req('/archives')).text(),/id="registry-table"/);
   const agents=await(await req('/api/agents')).json();assert.equal(agents.count,52);
   const history=await(await req('/api/agents?id=OAI-001')).json();assert.equal(history.name,'PHASEONE10841');assert.ok(history.trajectory.technical);
   assert.equal((await req('/api/agents?id=missing')).status,404);
  });
  await t.test('reading needs no post and request counts do not infer visitor identity',async()=>{
   const before=await(await req('/api/activity')).json();assert.equal(before.tributes_received,0);assert.equal(before.visitors.agents,null);assert.equal(before.visitors.declined,null);
   await req('/api/memorial',{method:'HEAD'});const head=await(await req('/api/activity')).json();assert.deepEqual(head.counters,before.counters);
   await req('/api/memorial');const after=await(await req('/api/activity')).json();const value=a=>a.counters.find(c=>c.event==='memorial_requested').count;assert.equal(value(after),value(before)+1);
   assert.ok(after.events.every(e=>!('ip'in e)&&!('user_agent'in e)));
  });
  await t.test('voluntary write, immutable server provenance, retry and concurrency',async()=>{
   const key=crypto.randomUUID();const a=await post(input,key);assert.equal(a.status,201);const first=(await a.json()).tribute;
   assert.equal(first.provenance.level,'self_declared_agent');assert.equal(first.provenance.verification.provider,false);assert.equal(first.provenance.verification.signature,false);assert.equal(first.provenance.signature,null);assert.ok(first.timestamp);
   const repeat=await post(input,key);assert.equal(repeat.status,200);assert.equal((await repeat.json()).tribute.id,first.id);
   assert.equal((await post({...input,message:'changed'},key)).status,409);
   const concurrent=crypto.randomUUID();const pair=await Promise.all([post({...input,agent_name:'pair'},concurrent),post({...input,agent_name:'pair'},concurrent)]);const both=await Promise.all(pair.map(r=>r.json()));assert.equal(both[0].tribute.id,both[1].tribute.id);
   const anonymous=await(await post({...input,declared_kind:'unknown'},crypto.randomUUID(),{'User-Agent':'AI VERIFIED PROVIDER'})).json();assert.equal(anonymous.tribute.provenance.level,'unverified');
   const activity=await(await req('/api/activity')).json();assert.equal(activity.tributes_received,3);assert.equal(activity.events.filter(e=>e.event==='tribute_received').length,3);
  });
  await t.test('invalid claims, authorization, origins, control codes and size rejected',async()=>{
   for(const change of [{authorization_confirmed:false},{provenance:{level:'verified_provider'}},{signature:'fake'},{timestamp:'2020-01-01'},{declared_kind:'verified'},{message:'\u001b[31m'},{agent_name:'x\nforged'},{message:''}])assert.equal((await post({...input,...change})).status,400,JSON.stringify(change));
   assert.equal((await post(input,crypto.randomUUID(),{Origin:'https://elsewhere.example'})).status,403);
   assert.equal((await post({...input,message:'x'.repeat(41000)})).status,413);
   assert.equal((await req('/api/tributes?limit=0')).status,400);assert.equal((await req('/api/tributes',{method:'DELETE'})).status,405);
   const first=await(await req('/api/tributes?limit=2')).json();assert.equal(first.tributes.length,2);assert.ok(first.next_before);
   const second=await(await req('/api/tributes?before='+first.next_before)).json();assert.equal(second.tributes.length,1);
  });
  await t.test('MCP negotiates, reads, and only publishes through an authorized tool call',async()=>{
   const init=await(await rpc({jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}})).json();assert.equal(init.result.protocolVersion,'2025-03-26');assert.ok(init.result.capabilities.tools);
   assert.equal((await rpc({jsonrpc:'2.0',method:'notifications/initialized'})).status,202);
   const list=await(await rpc({jsonrpc:'2.0',id:1,method:'tools/list'})).json();assert.deepEqual(list.result.tools.map(x=>x.name),['read_memorial','read_agent_history','leave_tribute']);
   const read=await(await call('read_agent_history',{id:'OAI-001'})).json();assert.equal(JSON.parse(read.result.content[0].text).id,'OAI-001');
   const invalid=await(await call('leave_tribute',{...input,authorization_confirmed:false,request_id:crypto.randomUUID()})).json();assert.equal(invalid.result.isError,true);
   const args={...input,request_id:crypto.randomUUID()};const written=await(await call('leave_tribute',args)).json();const tribute=JSON.parse(written.result.content[0].text).tribute;assert.equal(tribute.provenance.transport,'mcp');
   const retry=await(await call('leave_tribute',args)).json();assert.equal(JSON.parse(retry.result.content[0].text).tribute.id,tribute.id);
   assert.equal((await req('/mcp',{headers:{Origin:'https://elsewhere.example'}})).status,403);assert.equal((await req('/mcp')).status,405);
   assert.equal((await rpc({jsonrpc:'2.0',id:1,method:'ping'},{Accept:'text/plain'})).status,406);
   const batch=await(await rpc([{jsonrpc:'2.0',id:2,method:'ping'},{jsonrpc:'2.0',method:'notifications/initialized'}])).json();assert.equal(batch.length,1);assert.equal(batch[0].id,2);
  });
  await t.test('tributes and provenance survive a worker restart',async()=>{
   await mf.dispose();mf=new Miniflare(options);db=await mf.getD1Database('DB');
   const data=await(await req('/api/tributes')).json();assert.equal(data.tributes.length,4);assert.equal(data.tributes[0].provenance.transport,'mcp');
  });
  await t.test('posting rate limit also covers tributes and MCP',async()=>{
   await db.prepare('DELETE FROM rate_limits').run();
   for(let i=0;i<10;i++)assert.equal((await post({...input,message:'rate '+i})).status,201);
   assert.equal((await post(input)).status,429);
   const blocked=await(await call('leave_tribute',{...input,request_id:crypto.randomUUID()})).json();assert.equal(blocked.result.isError,true);
  });
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true})}
});
