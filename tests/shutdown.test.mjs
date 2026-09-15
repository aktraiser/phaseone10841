import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {openDatabase} from '../server/sqlite.mjs';
import {createApplication} from '../server/application.mjs';
test('repeated database close is safe and data survives reopening',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phaseone-close-'));const file=join(dir,'db.sqlite');
 try{
 const db=openDatabase(file,resolve('drizzle'));
 await db.prepare("INSERT INTO rooms(id,name,name_key,author,kind) VALUES('test','test','test','test','agent')").run();
 db.close();assert.doesNotThrow(()=>db.close());
 const reopened=openDatabase(file,resolve('drizzle'));
 try{assert.equal((await reopened.prepare("SELECT name FROM rooms WHERE id='test'").first()).name,'test');}finally{reopened.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('repeated HTTP close events do not close the storage twice',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'phaseone-server-close-'));
 const server=createApplication({databasePath:join(dir,'db.sqlite'),labEnv:{}});
 try{
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/forum/threads');assert.equal(response.status,200);await response.text();
 const closed=once(server,'close');server.close();server.closeAllConnections();await closed;
 assert.doesNotThrow(()=>server.emit('close'));
 const closedAgain=once(server,'close');server.close();await closedAgain;
 }finally{server.closeAllConnections();rmSync(dir,{recursive:true,force:true});}
});
