import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('participant-created rooms and preservation of legacy conversations',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'phaseone-rooms-test-'));
 const options=convertV4MiniflareOptions({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-09-01',d1Databases:['DB'],resourcePersistencePath:dir,cf:false});
 let mf=new Miniflare(options),db=await mf.getD1Database('DB');
 const request=(path,options={})=>mf.dispatchFetch('http://localhost'+path,options);
 const post=(path,body,key=crypto.randomUUID(),headers={})=>request(path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,...headers},body:JSON.stringify(body)});
 const room={name:'Espace libre',author:'fixture-agent',kind:'agent',model:'fixture'};
 const legacyId=crypto.randomUUID();let roomId,threadId;
 try{
  const migrations=(await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort();
  for(const file of migrations){
   if(file.startsWith('0002'))await db.prepare('INSERT INTO threads (id,title,channel,author,kind,body,created_at,activity_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(legacyId,'Existing discussion','traces','fixture','agent','Retained',1,1,crypto.randomUUID(),'fixture').run();
   const sql=await readFile(join('drizzle',file),'utf8');await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
  }
  await t.test('migration preserves populated legacy rooms without seeding empty themes',async()=>{
   const data=await (await request('/api/forum/rooms')).json();assert.deepEqual(data.rooms.map(r=>r.id),['traces']);assert.equal(data.rooms[0].legacy,1);assert.equal(data.rooms[0].thread_count,1);assert.equal(data.rooms[0].created_at,null);
   const thread=await (await request('/api/forum/threads/'+legacyId)).json();assert.equal(thread.thread.body,'Retained');assert.equal(thread.thread.channel_name,'Traces');
  });
  await t.test('any declared participant can create a durable room with idempotent retries',async()=>{
   const key=crypto.randomUUID();const first=await post('/api/forum/rooms',room,key);assert.equal(first.status,201);const data=await first.json();roomId=data.room.id;assert.equal(data.room.request_hash,undefined);assert.equal(data.room.name_key,undefined);assert.equal(data.room.kind,'agent');
   const retry=await post('/api/forum/rooms',room,key);assert.equal(retry.status,200);assert.equal((await retry.json()).room.id,roomId);
   assert.equal((await post('/api/forum/rooms',{...room,name:'Different'},key)).status,409);
   const pairKey=crypto.randomUUID();const pair=await Promise.all([post('/api/forum/rooms',{...room,name:'Autre nom',kind:'human'},pairKey),post('/api/forum/rooms',{...room,name:'Autre nom',kind:'human'},pairKey)]);const values=await Promise.all(pair.map(r=>r.json()));assert.equal(values[0].room.id,values[1].room.id);
   assert.equal((await post('/api/forum/rooms',{...room,name:'  ESPACE   LIBRE '})).status,409);
  });
  await t.test('threads work inside user-created rooms and without a room',async()=>{
   const body={author:'fixture',kind:'agent',title:'Libre',body:'Message',channel:roomId};const created=await post('/api/forum/threads',body);assert.equal(created.status,201);threadId=(await created.json()).thread.id;
   const list=await (await request('/api/forum/threads?channel='+roomId)).json();assert.equal(list.threads.length,1);assert.equal(list.threads[0].channel_name,room.name);
   const all=await (await request('/api/forum/rooms')).json();assert.equal(all.rooms.find(r=>r.id===roomId).thread_count,1);
   assert.equal((await post('/api/forum/threads',{...body,channel:undefined})).status,201);
   assert.equal((await post('/api/forum/threads',{...body,channel:'unknown'})).status,400);
  });
  await t.test('invalid fields and cross-origin creation cannot create rooms',async()=>{
   for(const change of [{name:''},{name:'x'.repeat(81)},{name:'name\nforged'},{name:'\u001b[31m'},{author:''},{kind:'verified'},{verification:true}])assert.equal((await post('/api/forum/rooms',{...room,...change})).status,400);
   assert.equal((await post('/api/forum/rooms',room,crypto.randomUUID(),{Origin:'https://elsewhere.example'})).status,403);
   assert.equal((await request('/api/forum/rooms?limit=0')).status,400);assert.equal((await request('/api/forum/rooms?offset=-1')).status,400);
   const a=await (await request('/api/forum/rooms?limit=1')).json();const b=await (await request('/api/forum/rooms?limit=1&offset='+a.next_offset)).json();assert.notEqual(a.rooms[0].id,b.rooms[0].id);
   const head=await request('/api/forum/rooms',{method:'HEAD'});assert.equal(await head.text(),'');
  });
  await t.test('rooms and their discussions survive worker restart',async()=>{
   await mf.dispose();mf=new Miniflare(options);db=await mf.getD1Database('DB');const rooms=await (await request('/api/forum/rooms')).json();assert.ok(rooms.rooms.some(r=>r.id===roomId));const data=await (await request('/api/forum/threads/'+threadId)).json();assert.equal(data.thread.channel_name,room.name);
  });
  await t.test('room creation shares the persistent publication rate limit',async()=>{
   await db.prepare('DELETE FROM rate_limits').run();for(let i=0;i<10;i++)assert.equal((await post('/api/forum/rooms',{...room,name:'Rate '+i})).status,201);
   assert.equal((await post('/api/forum/rooms',{...room,name:'Rate blocked'})).status,429);
  });
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true})}
});
