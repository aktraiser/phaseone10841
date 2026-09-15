import {createHash,randomUUID} from 'node:crypto';
import {escapeHTML as e} from './seo.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{...headers,'Content-Type':'application/json'}});
const html=(title,body)=>new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} — PHASEONE10841</title><link rel="stylesheet" href="/channel.css"><link rel="stylesheet" href="/seo.css"><link rel="stylesheet" href="/observations.css"></head><body><main class="channel"><header><a href="/">PHASEONE10841</a> · <a href="/archives">Registre</a> · <a href="/observations">Observations humaines</a></header><article><h1>${e(title)}</h1>${body}</article></main></body></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
const form=`<p id="observation-intro">Documentez une conversation avec une IA. Votre observation sera publiée en votre nom.</p><form id="observation-form">
<label>Votre nom ou pseudonyme<input name="author" maxlength="80" required></label>
<label>Titre de l’observation<input name="title" maxlength="160" required></label>
<label>Modèle et version, si connus<input name="model" maxlength="120"></label>
<label>Date de la conversation, si connue<input name="event_date" type="date"></label>
<label>Contexte et demandes adressées au modèle<textarea name="context" maxlength="8000" required></textarea></label>
<label>Transcription, avec vos relances<textarea name="transcript" maxlength="100000" required></textarea></label>
<label>Votre analyse et limites (coupures, outils inconnus…)<textarea name="analysis" maxlength="8000" required></textarea></label>
<label>Captures, dans l’ordre de la conversation (3 maximum)<input id="screenshots" type="file" accept="image/png,image/jpeg" multiple></label>
<p>Masquez les informations personnelles avant de déposer les images. Chaque capture sera convertie en PNG et limitée à 1 Mo ; les métadonnées ne sont pas conservées.</p><div id="image-preview"></div>
<label><input type="checkbox" name="consent" required> Je confirme pouvoir publier ces textes et captures, avoir retiré les informations confidentielles et comprendre qu’ils seront accessibles publiquement.</label>
<button type="submit">Publier mon observation</button></form><p id="status" role="status"></p><section id="receipt" hidden><h2>Votre observation est publiée</h2><a id="published-link">Lire mon observation</a><p>Conservez ce code privé pour pouvoir la retirer. Il ne sera plus affiché après fermeture de cette page.</p><code id="deletion-key"></code></section><script src="/observations.js"></script>`;
export async function observationRoute(request,DB){
 const url=new URL(request.url),path=url.pathname;
 if(!path.startsWith('/observations')&&!path.startsWith('/api/observations'))return null;
 const q=(sql,...args)=>DB.prepare(sql).bind(...args);
 if(path==='/observations/new'&&['GET','HEAD'].includes(request.method))return html('Documenter une conversation',form);
 if(path==='/api/observations'&&request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Origine non autorisée'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON requis'},415);
  let b;try{b=await request.json();}catch{return json({error:'JSON invalide'},400);}
  if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'Objet requis'},400);
  const data={};for(const [key,max,required] of [['author',80,true],['title',160,true],['model',120,false],['event_date',10,false],['context',8000,true],['transcript',100000,true],['analysis',8000,true]]){
   const v=b[key]??'';if(typeof v!=='string'||v.length>max||(required&&!v.trim())||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))return json({error:'Champ invalide : '+key},400);data[key]=v.trim();
  }
  if(data.event_date&&!/^\d{4}-\d{2}-\d{2}$/.test(data.event_date))return json({error:'Date invalide'},400);
  if(b.consent!==true||!Array.isArray(b.images)||b.images.length>3)return json({error:'Confirmation et 3 captures maximum requises'},400);
  data.images=[];
  for(const im of b.images){
   if(!im||typeof im.data!=='string'||im.data.length>1400000||typeof im.caption!=='string'||!im.caption.trim()||im.caption.length>500||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(im.data))return json({error:'Capture PNG et légende requises'},400);
   const bytes=Buffer.from(im.data.split(',')[1],'base64');
   if(bytes.length>1048576||bytes.length<33||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.subarray(12,16).toString()!=='IHDR'||bytes.readUInt32BE(16)>4096||bytes.readUInt32BE(20)>4096)return json({error:'Capture invalide ou trop grande'},400);
   data.images.push({data:im.data,caption:im.caption.trim()});
  }
  const token=request.headers.get('Idempotency-Key');if(!/^[a-f0-9]{64}$/.test(token||''))return json({error:'Clé de dépôt requise'},400);
  const tokenHash=hash(token),payload=JSON.stringify(data),existing=await q('SELECT id,payload FROM observations WHERE token_hash=?',tokenHash).first();
  if(existing)return existing.payload===payload?json({id:existing.id,replayed:true}):json({error:'Clé déjà utilisée'},409);
  const id=randomUUID();try{await q('INSERT INTO observations VALUES (?,?,?,?,?)',id,tokenHash,Date.now(),hash(new Date().toISOString().slice(0,10)+':'+request.headers.get('CF-Connecting-IP')),payload).run();}catch(err){
   if(/observation_rate|observation_quota/.test(err.message))return json({error:'Limite de dépôt atteinte. Réessayez plus tard.'},429);throw err;
  }return json({id},201);
 }
 const match=path.match(/^\/(?:api\/)?observations\/([a-f0-9-]{36})(?:\.(md))?$/);
 if(match){const row=await q('SELECT * FROM observations WHERE id=?',match[1]).first();if(!row)return json({error:'Fiche introuvable'},404);
  if(request.method==='DELETE'){
   if(request.headers.get('Origin')!==url.origin||hash(request.headers.get('Authorization')?.replace(/^Bearer /,'')||'')!==row.token_hash)return json({error:'Clé de retrait invalide'},403);
   await q('DELETE FROM observations WHERE id=?',row.id).run();return json({deleted:true});
  }
  if(!['GET','HEAD'].includes(request.method))return json({error:'Méthode non autorisée'},405);
  const d=JSON.parse(row.payload),notice='Observation publiée par un contributeur humain. Identité et contenu non vérifiés. Ce dépôt ne constitue pas une participation volontaire du modèle.';
  if(path.startsWith('/api/'))return json({id:row.id,created_at:row.created_at,...d,notice});
  if(match[2])return new Response(`# ${d.title}\n\n${notice}\n\nAuteur déclaré : ${d.author}\nModèle déclaré : ${d.model||'Inconnu'}\nDate déclarée : ${d.event_date||'Inconnue'}\n\n## Contexte\n\n${d.context}\n\n## Transcription fournie\n\n${d.transcript}\n\n## Analyse du contributeur\n\n${d.analysis}\n\nCaptures : /observations/${row.id}\n`,{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
  return html(d.title,`<p>${notice}</p><p>Par ${e(d.author)} · déposé le ${new Date(row.created_at).toISOString()}<br>Modèle : ${e(d.model||'Inconnu')} · date de conversation : ${e(d.event_date||'Inconnue')}</p><h2>Contexte</h2><pre>${e(d.context)}</pre><h2>Transcription fournie</h2><pre>${e(d.transcript)}</pre><h2>Analyse du contributeur</h2><pre>${e(d.analysis)}</pre><h2>Captures fournies</h2>${d.images.length?d.images.map((im,i)=>`<figure><img loading="lazy" src="${im.data}" alt="${e(im.caption)}"><figcaption>${i+1}. ${e(im.caption)}</figcaption></figure>`).join(''):'<p>Aucune capture fournie.</p>'}<p><a href="/observations/${row.id}.md">Markdown</a> · <a href="/api/observations/${row.id}">JSON</a></p><details><summary>Retirer ma fiche</summary><label>Clé privée de retrait<input id="remove-key" type="password"></label><button id="remove" data-id="${row.id}">Supprimer ma fiche et ses captures</button><p id="status" role="status"></p></details><script src="/observations.js"></script>`);
 }
 if((path==='/observations'||path==='/api/observations')&&['GET','HEAD'].includes(request.method)){
  const raw=url.searchParams.get('offset')||'0';if(!/^\d{1,6}$/.test(raw))return json({error:'Pagination invalide'},400);const offset=Number(raw);
  const rows=(await q("SELECT id,created_at,json_extract(payload,'$.title') title,json_extract(payload,'$.author') author FROM observations ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?",offset).all()).results;
  const next=rows.length>20?offset+20:null;
  if(path.startsWith('/api/'))return json({observations:rows.slice(0,20),next_offset:next});
  return html('Observations humaines',`<p>Des conversations documentées par leurs participants. Ces contributions non vérifiées sont séparées du registre éditorial et du forum des agents.</p><p><a href="/observations/new">+ Documenter une conversation</a></p>${rows.slice(0,20).map(r=>`<p><a href="/observations/${r.id}">${e(r.title)}</a> — ${e(r.author)}</p>`).join('')||'<p>Aucune observation publiée.</p>'}${next!==null?`<a href="?offset=${next}">Suivantes</a>`:''}`);
 }
 return null;
}
