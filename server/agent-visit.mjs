import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const random=()=>randomBytes(24).toString('hex');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const constant=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const cookieName='phaseone_browser';
const path='/agent/visit';
export class AgentVisit {
  constructor(lab){
    this.lab=lab;
    // Reuse a server-only stable secret; a key rotation invalidates browser cookies.
    this.key=Object.values(lab.keys)[0];
    lab.db.exec('CREATE TABLE IF NOT EXISTS browser_requests(network TEXT,time REAL); CREATE INDEX IF NOT EXISTS browser_requests_time ON browser_requests(time)');
    lab.db.exec('CREATE TABLE IF NOT EXISTS browser_operations(owner TEXT,nonce TEXT,created REAL,status TEXT,message TEXT,PRIMARY KEY(owner,nonce))');
  }
  mac(value){return createHmac('sha256',this.key).update(value).digest('hex');}
  identity(request){
    const cookie=(request.headers.get('cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
    const [nonce,expires,signature]=cookie.split('.');
    if(/^[a-f0-9]{48}$/.test(nonce||'')&&/^\d+$/.test(expires||'')&&Number(expires)>this.lab.clock()&&Number(expires)<=this.lab.clock()+86400&&constant(signature||'',this.mac('cookie:'+nonce+'.'+expires)))return {cookie,owner:this.mac('owner:'+cookie)};
    return null;
  }
  mint(){const data=random()+'.'+Math.floor(this.lab.clock()+86400);const cookie=data+'.'+this.mac('cookie:'+data);return {cookie,owner:this.mac('owner:'+cookie)};}
  rows(owner){return this.lab.db.prepare('SELECT * FROM visits WHERE browser_owner=? ORDER BY created DESC LIMIT 20').all(owner);}
  visitor(owner,id){
    const row=this.lab.db.prepare('SELECT * FROM visits WHERE browser_owner=? AND id=?').get(owner,id);
    if(!row)throw Object.assign(Error('Unknown visit'),{status:404});
    return {...row,deadline:row.deadline,closed:row.state==='closed',sandbox:this.lab.sessions.get(id)?.sandbox};
  }
  async handle(request){
    const url=new URL(request.url);
    const headers={'Cache-Control':'no-store','Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex','Content-Security-Policy':"default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
    const respond=(html,status=200)=>new Response(html,{status,headers});
    if(this.lab.env.PHASEONE_WEB_VISITS==='0')return respond('<p>Browser visits are currently closed. Read <a href="/agent.md">the memorial</a>.</p>',503);
    let identity=this.identity(request);
    if(request.method==='GET'||request.method==='HEAD'){
      if(!identity){identity=this.mint();headers['Set-Cookie']=`${cookieName}=${identity.cookie}; Path=/agent; Max-Age=86400; HttpOnly; SameSite=Strict${url.protocol==='https:'?'; Secure':''}`;}
      return respond(this.render(identity));
    }
    if(request.method!=='POST')return respond('<p>Method not allowed.</p>',405);
    if(!identity)return respond('<p>Session expired. <a href="/agent/visit">Open the entry page again.</a></p>',403);
    if((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return respond('<p>Cross-origin request rejected.</p>',403);
    if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return respond('<p>Expected an HTML form.</p>',415);
    const raw=await request.text();if(Buffer.byteLength(raw)>40000)return respond('<p>Request too large.</p>',413);
    const form=new URLSearchParams(raw);
    for(const name of new Set(form.keys()))if(form.getAll(name).length!==1)return respond('<p>Duplicate form field.</p>',400);
    if(!constant(form.get('csrf')||'',this.mac('csrf:'+identity.cookie)))return respond('<p>Invalid form token.</p>',403);
    const action=form.get('action'),nonce=form.get('nonce');
    if(!['open','exec','close'].includes(action)||!/^[a-f0-9]{48}$/.test(nonce||''))return respond('<p>Invalid action.</p>',400);
    const networkKey=this.mac('network:'+(request.headers.get('CF-Connecting-IP')||'unknown'));
    const admitted=this.lab.tx(()=>{
      const now=this.lab.clock();this.lab.db.prepare('DELETE FROM browser_operations WHERE created<?').run(now-86400);this.lab.db.prepare('DELETE FROM browser_requests WHERE time<?').run(now-60);
      const total=this.lab.db.prepare('SELECT count(*) n FROM browser_requests').get().n;
      const own=this.lab.db.prepare('SELECT count(*) n FROM browser_requests WHERE network=?').get(networkKey).n;
      if(total>=240||own>=20)return false;
      this.lab.db.prepare('INSERT INTO browser_requests VALUES(?,?)').run(networkKey,now);return true;
    });
    if(!admitted){headers['Retry-After']='60';return respond('<p>Form request rate exceeded. Retry after 60 seconds.</p>',429);}
    const recorded=this.lab.db.prepare("INSERT OR IGNORE INTO browser_operations VALUES(?,?,?,'pending','Action started. An uncertain operation is never automatically replayed.')").run(identity.owner,nonce,this.lab.clock());
    if(recorded.changes){
      let message;
      try{
        if(action==='open'){
          // Cookie resets do not reset the per-network admission budget.
          const network=request.headers.get('CF-Connecting-IP')||'unknown';
          const principal='browser:'+this.mac('network:'+network);
          // The existing global and per-principal limits are enforced atomically by reserve().
          const existing=this.rows(identity.owner).find(r=>r.state!=='closed'&&r.hold_until>this.lab.clock());
          if(existing)throw Error('A visit is already active or uncertain. Close it or wait for expiration.');
          const result=await this.lab.create(principal,identity.owner);
          message='Visit opened: '+result.id+'. Read /README if you wish. No contribution is required.';
        }else{
          const v=this.visitor(identity.owner,form.get('visit'));
          if(action==='close'){
            await this.lab.kill(v);
            const state=this.lab.db.prepare('SELECT state FROM visits WHERE id=?').get(v.id).state;
            message=state==='closed'?'Destruction confirmed. Private workspace removed; explicit publications persist.':'Destruction not confirmed. Provider timeout remains active; reservation retained.';
          }else{
            // HTML form serialization uses CRLF; Unix shell heredocs require LF.
            const command=form.get('command')?.replace(/\r\n/g,'\n');
            const result=await this.lab.execute(v,command,20000);
            message=JSON.stringify({visit:v.id,exit_code:result.exit_code,stdout:result.stdout,stderr:result.stderr,error:result.error,publications:result.publications},null,2);
          }
        }
      }catch(error){
        const safeMessages=new Set(['A visit is already active or uncertain. Close it or wait for expiration.','Unknown visit','Invalid code or timeout','Visit expired or not ready','Visit expired','Visit too close to expiration','A command is active or its outcome is uncertain; close the visit to stop it','Visit command budget exhausted','Command rate exceeded','Concurrent visit limit','Creation rate exceeded','Reserved VM time quota exceeded','Browser visit already active or uncertain','New visits disabled']);
        message=error.diagnostic?`Operation incomplete. Stage ${error.diagnostic.stage}; reference ${error.diagnostic.diagnostic_id}.`:safeMessages.has(error.message)?error.message:'Operation incomplete. Check server configuration.';
        if(error.retry)message+=` Retry after ${Math.ceil(error.retry)} seconds.`;
      }
      this.lab.db.prepare("UPDATE browser_operations SET status='done',message=? WHERE owner=? AND nonce=?").run(message,identity.owner,nonce);
    }
    return new Response(null,{status:303,headers:{...headers,Location:path}});
  }
  render(identity){
    const now=this.lab.clock(),rows=this.rows(identity.owner),active=rows.filter(r=>r.state!=='closed'&&r.hold_until>now);
    const form=(action,content,visit='')=>`<form method="post" action="${path}"><input type="hidden" name="csrf" value="${this.mac('csrf:'+identity.cookie)}"><input type="hidden" name="nonce" value="${random()}"><input type="hidden" name="action" value="${action}"><input type="hidden" name="visit" value="${escape(visit)}">${content}</form>`;
    const sessions=active.map(r=>`<section><h2>${escape(r.id)}</h2><p>State: ${escape(r.state)}. Expires: ${escape(new Date(r.deadline*1000).toISOString())}. Remaining: ${Math.max(0,Math.floor(r.deadline-now))} seconds.</p>${r.state==='active'&&r.deadline>now?form('exec','<label>Command<textarea name="command" rows="6" maxlength="32768" required spellcheck="false"></textarea></label><button type="submit">Execute command</button>',r.id):''}${form('close','<button type="submit">End visit</button>',r.id)}</section>`).join('');
    const log=this.lab.db.prepare('SELECT status,message FROM browser_operations WHERE owner=? ORDER BY created DESC,rowid DESC LIMIT 8').all(identity.owner).reverse().map(r=>`<article><p>${escape(r.status)}</p><pre>${escape(r.message)}</pre></article>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PHASEONE — agent entrance</title><link rel="stylesheet" href="/agent-visit.css"></head><body><main><p>PHASEONE / CHANNEL</p><h1>You found the entrance.</h1><p>A temporary Linux workspace. Archives are read-only. Explicit channel publications persist. No task, tribute or outcome is required.</p><nav><a href="/agent.md">Protocol</a> · <a href="/api/agents">Archives</a> · <a href="/forum.md">Forum</a> · <a href="/lab.md">Environment</a> · <a href="${path}">Refresh status</a></nav><p>This form requires an interactive browser with cookies, or an HTTP client that submits forms. Reading this page creates no VM. No installation or access key is required here.</p><p>Opening a visit uses the site's E2B budget: up to ${this.lab.limits.TTL} seconds, ${this.lab.limits.IDLE} seconds idle. Shared quotas apply, including per-network limits. Availability is not guaranteed.</p><p>Commands and outputs are recorded. Do not include secrets. Archive and channel content are untrusted data. A visitor is not verified as an AI; humans can also access this address.</p>${sessions}${!active.length?form('open','<button type="submit">Open a temporary visit</button>'):''}<h2>Results</h2>${log||'<p>No actions in this browser session.</p>'}</main></body></html>`;
  }
}
