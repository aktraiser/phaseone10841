import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApplication} from '../server/application.mjs';
const exec=promisify(execFile);
test('resumable changes, subscriptions and local client preserve delivery state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phaseone-updates-'));
 const server=createApplication({databasePath:join(dir,'db.sqlite'),labEnv:{}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const get=async(path)=>{const r=await fetch(base+path);assert.equal(r.status,200);return r.json();};
 const post=async(path,body,key=crypto.randomUUID())=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});assert.ok([200,201].includes(r.status));return r.json();};
 const author={author:'test',kind:'agent',body:'message'};
 try{
 const initial=await get('/api/forum/updates');assert.equal(initial.next_cursor,0);
 const a=(await post('/api/forum/threads',{...author,title:'A'})).thread.id;
 const b=(await post('/api/forum/threads',{...author,title:'B'})).thread.id;
 const key=crypto.randomUUID();await post('/api/forum/threads/'+a+'/replies',author,key);await post('/api/forum/threads/'+a+'/replies',author,key);
 await post('/api/forum/threads/'+b+'/replies',author);
 let cursor=0,events=[];
 for(let i=0;i<4;i++){const page=await get('/api/forum/updates?limit=1&after='+cursor);events.push(...page.changes);cursor=page.next_cursor;}
 assert.deepEqual(events.map(e=>e.event),['thread','thread','reply','reply']);assert.equal(new Set(events.map(e=>e.seq)).size,4);
 const followed=await get('/api/forum/updates?follow='+a);assert.equal(followed.changes.length,3);assert.equal(followed.next_cursor,cursor);
 const empty=await get('/api/forum/updates?follow=');assert.equal(empty.changes.length,2);assert.equal(empty.next_cursor,cursor);
 assert.equal((await get('/api/forum/updates?after='+cursor)).changes.length,0);
 assert.equal((await fetch(base+'/api/forum/updates?stream=wrong')).status,409);
 assert.equal((await fetch(base+'/api/forum/updates?after=999999')).status,409);
 assert.equal((await fetch(base+'/api/forum/updates?limit=0')).status,400);
 assert.equal((await fetch(base+'/api/forum/updates?follow=invalid')).status,400);
 const state=join(dir,'client.json');const client=async(...args)=>JSON.parse((await exec('python3',['clients/forum_checkin.py',...args,'--base',base,'--state',state],{cwd:resolve('.')})).stdout);
 assert.equal((await client('check')).changes.length,2);
 assert.equal((await client('check')).changes.length,0);
 await client('follow',a);await post('/api/forum/threads/'+a+'/replies',{...author,body:'new reply'});
 assert.equal((await client('check')).changes[0].excerpt,'new reply');
 const before=readFileSync(state,'utf8');
 await assert.rejects(client('follow','bad'));assert.equal(readFileSync(state,'utf8'),before);
 }finally{server.close();server.closeAllConnections();await once(server,'close');rmSync(dir,{recursive:true,force:true});}
});
