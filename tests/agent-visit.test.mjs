import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Lab} from '../server/lab.mjs';
import {AgentVisit} from '../server/agent-visit.mjs';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'phaseone-browser-'));let creates=0,executes=0;
 const provider={async create(){creates++;const files={};return {sandboxId:'sandbox-'+creates,files:{async write(p,d){files[p]=d;}},commands:{async run(cmd){if(cmd.endsWith('execute.py')){executes++;return {stdout:JSON.stringify({request_id:JSON.parse(files['/opt/phaseone/command.json']).request_id,exit_code:0,stdout:'<script>steal()</script>',stderr:'',error:null})};}return {stdout:cmd.endsWith('outbox')?'{"requests":[]}':'{}'};}},async kill(){}};},async kill(){}};
 const lab=new Lab({filename:join(dir,'db.sqlite'),env:{E2B_API_KEY:'provider-secret',PHASEONE_LAB_KEY:'x'.repeat(40)},factory:provider,timer:false});const page=new AgentVisit(lab);
 const req=(cookie='',body=null,headers={})=>page.handle(new Request('https://test/agent/visit',{method:body?'POST':'GET',headers:{cookie,'CF-Connecting-IP':'192.0.2.1',...(body?{'content-type':'application/x-www-form-urlencoded',origin:'https://test'}:{}),...headers},...(body?{body:body.toString()}:{})}));
 const parse=html=>{const form=html.match(/<form[\s\S]*?<\/form>/)?.[0]||'';return new URLSearchParams([...form.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2]]));};
 const open=async()=>{const response=await req();assert.equal(response.headers.get('referrer-policy'),'same-origin');const cookie=response.headers.get('set-cookie').split(';')[0],html=await response.text();return {cookie,form:parse(html),html};};
 return {lab,page,req,parse,open,creates:()=>creates,executes:()=>executes,async done(){await lab.close();rmSync(dir,{recursive:true,force:true});}};
}
test('GET is free; ordinary forms open/execute/close with no API key and no double execution',async()=>{
 const f=fixture();try{
 const a=await f.open();assert.equal(f.creates(),0);assert.match(a.html,/textarea|Open a temporary visit/);assert.ok(!a.html.includes('provider-secret'));
 assert.equal((await f.req(a.cookie,a.form)).status,303);assert.equal(f.creates(),1);
 assert.equal((await f.req(a.cookie,a.form)).status,303);assert.equal(f.creates(),1);
 const html=await(await f.req(a.cookie)).text(),command=f.parse(html);command.set('command','echo test');
 assert.equal((await f.req(a.cookie,command)).status,303);assert.equal(f.executes(),1);
 await f.req(a.cookie,command);assert.equal(f.executes(),1);
 const result=await(await f.req(a.cookie)).text();assert.match(result,/&lt;script&gt;steal/);assert.doesNotMatch(result,/<script>/);
 const close=f.parse(result);close.set('action','close');await f.req(a.cookie,close);assert.equal(f.lab.usage().active_or_uncertain,0);assert.equal(f.lab.usage().reserved_vm_seconds_24h,600);
 }finally{await f.done();}
});
test('CSRF, cross-origin, cookie forgery and access to other browser visits are rejected',async()=>{
 const f=fixture();try{
 const a=await f.open(),b=await f.open();
 const missing=new URLSearchParams(a.form);missing.set('csrf','wrong');assert.equal((await f.req(a.cookie,missing)).status,403);
 assert.equal((await f.req(a.cookie,a.form,{origin:'https://evil.test'})).status,403);
 assert.equal((await f.req(a.cookie+'broken',a.form)).status,403);assert.equal(f.creates(),0);
 await f.req(a.cookie,a.form);const id=f.lab.usage().sessions[0].id;
 b.form.set('action','close');b.form.set('visit',id);await f.req(b.cookie,b.form);assert.equal(f.lab.usage().active_or_uncertain,1);
 assert.doesNotMatch(await(await f.req(b.cookie)).text(),new RegExp(id));
 }finally{await f.done();}
});
test('resetting browser cookies does not reset the network admission quota',async()=>{
 const f=fixture();try{const a=await f.open();await f.req(a.cookie,a.form);const b=await f.open();await f.req(b.cookie,b.form);assert.equal(f.creates(),1);assert.match(await(await f.req(b.cookie)).text(),/Concurrent visit limit/);}finally{await f.done();}
});
test('browser resumes its own visit through a new handler and shares persistent operation receipts',async()=>{
 const f=fixture();try{const a=await f.open();await f.req(a.cookie,a.form);const other=new AgentVisit(f.lab);const html=await(await other.handle(new Request('https://test/agent/visit',{headers:{cookie:a.cookie}}))).text();assert.match(html,/Execute command/);assert.match(html,/Visit opened/);}finally{await f.done();}
});
