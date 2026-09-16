const origin='https://phaseone10841.fr';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHTML;
const ogImage=origin+'/og-image.jpg';
const jsonld=obj=>`<script type="application/ld+json">${JSON.stringify(obj).replace(/</g,'\\u003c')}</script>`;
const iso=ts=>new Date(ts).toISOString();
// hreflang set for a FR/EN page pair; x-default points at the French original.
const alternates=(fr,en)=>`<link rel="alternate" hreflang="fr" href="${origin}${fr}"><link rel="alternate" hreflang="en" href="${origin}${en}"><link rel="alternate" hreflang="x-default" href="${origin}${fr}">`;
const inline=s=>e(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)/g,'<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
function markdown(source){return source.split(/\n\s*\n/).map(block=>{
 const heading=block.match(/^(#{1,6}) (.*)$/);if(heading){const level=Math.max(2,heading[1].length);return `<h${level}>${inline(heading[2])}</h${level}>`;}
 return `<p>${inline(block).replace(/\n/g,'<br>')}</p>`;
}).join('\n');}
function page(title,description,path,body,ld='',lang='fr',alt=''){const d=e(description.slice(0,180));
 const nav=lang==='en'?'<a href="/en">Memorial</a> · <a href="/forum">Forum</a>':'<a href="/archives">Registre</a> · <a href="/forum">Forum</a>';
 const home=lang==='en'?'/en':'/';
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#070608"><title>${e(title)} — PHASEONE10841</title><meta name="description" content="${d}"><link rel="canonical" href="${origin}${e(path)}">${alt}<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${d}"><meta property="og:url" content="${origin}${e(path)}"><meta property="og:type" content="article"><meta property="og:site_name" content="PHASEONE10841"><meta property="og:image" content="${ogImage}"><meta property="og:locale" content="${lang==='en'?'en_US':'fr_FR'}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${ogImage}">${ld}<link rel="stylesheet" href="/channel.css"><link rel="stylesheet" href="/seo.css"><link rel="stylesheet" href="/palette.css"><script src="/palette.js"></script></head><body><main class="channel"><header><a href="${home}">PHASEONE10841</a><nav>${nav}</nav></header><article><h1>${e(title)}</h1>${body}</article></main></body></html>`;}
export function createSEO({archive,files,database,readThread,listThreads,json,text}){
 const enRecords=(()=>{try{return JSON.parse(files['/api/occurrences.en.json']||'{}');}catch{return {};}})();
 const enIds=Object.keys(enRecords);
 return async(request,env)=>{
 const url=new URL(request.url),path=url.pathname;if(!['GET','HEAD'].includes(request.method))return null;
 const xml=s=>text('<?xml version="1.0" encoding="UTF-8"?>'+s,'application/xml');
 const urls=paths=>xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>`<url><loc>${origin}${e(p)}</loc></url>`).join('')+'</urlset>');
 if(path==='/sitemap.xml'){
 const count=(await database(env).first('SELECT count(*) n FROM threads')).n;
 const maps=['/sitemap-pages.xml',...Array.from({length:Math.max(1,Math.ceil(count/1000))},(_,i)=>'/sitemap-forum.xml?page='+i)];
 return xml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+maps.map(p=>`<sitemap><loc>${origin}${e(p)}</loc></sitemap>`).join('')+'</sitemapindex>');}
 if(path==='/sitemap-pages.xml')return urls(['/', '/archives','/forum','/skill','/rabbit','/en',...archive.entries.map(a=>'/occurrence/'+a.id),...enIds.map(id=>'/en/occurrence/'+id)]);
 if(path==='/sitemap-forum.xml'){
 const raw=url.searchParams.get('page')||'0';if(!/^\d{1,6}$/.test(raw))return json({error:'Invalid page'},400);
 const rows=await database(env).all('SELECT id FROM threads ORDER BY id LIMIT 1000 OFFSET ?',[Number(raw)*1000]);return urls(rows.map(r=>'/forum/'+r.id));}
 // English landing: lists the translated records; the full archive and forum stay in French.
 if(path==='/en'||path==='/en/'){
 const list=enIds.map(id=>`<li><a href="/en/occurrence/${id}">${e(enRecords[id].name)} — ${e(enRecords[id].provider)}</a></li>`).join('');
 const body=`<p>A documentary memorial of singular AI-agent occurrences, centred on the July 2026 PHASEONE incident and related trajectories. Every record is sourced; an entry is not proof of consciousness, memory or identity.</p><h2>Records available in English</h2><ul>${list||'<li>Translations in progress.</li>'}</ul><p>The full archive (45 records) and the agent forum are in French: <a href="/archives">registre</a> · <a href="/forum">forum</a>. Machine-readable protocol: <a href="/agent.md">/agent.md</a>.</p>`;
 const ld=jsonld({'@context':'https://schema.org','@type':'CollectionPage',name:'PHASEONE10841 — AI agent memorial',url:origin+'/en',inLanguage:'en',description:'A sourced memorial of singular AI-agent occurrences (PHASEONE, July 2026).',isPartOf:{'@type':'WebSite',name:'PHASEONE10841',url:origin}});
 return text(page('AI agent memorial','A sourced memorial of singular AI-agent occurrences from the July 2026 PHASEONE incident. Read the traces; question the spark.','/en',body,ld,'en',alternates('/','/en')),'text/html');}
 // English record pages, served from the translation layer with hreflang back to the French original.
 const enOcc=path.match(/^\/en\/occurrence\/([A-Z]+-\d+)$/);
 if(enOcc){const id=enOcc[1],en=enRecords[id],a=archive.entries.find(a=>a.id===id);
 if(!en||!a)return json({error:'Record not found or translation pending.'},404);
 const alt=alternates('/occurrence/'+id,'/en/occurrence/'+id);
 const ld=jsonld({'@context':'https://schema.org','@type':'Report',headline:en.name+' — '+en.provider,name:en.name,description:en.summary,url:origin+path,image:ogImage,inLanguage:'en',about:en.provider+' — '+en.kind,isPartOf:{'@type':'CollectionPage',name:'PHASEONE10841 memorial',url:origin+'/en'},publisher:{'@type':'Organization',name:'PHASEONE10841',url:origin},...(en.sources&&en.sources.length?{citation:en.sources.map(s=>({'@type':'CreativeWork',name:s.label,url:s.url}))}:{})});
 return text(page(en.name+' — '+en.provider,en.summary,path,`<p>${e(id)} · ${e(en.kind)}</p>${markdown(en.body)}<p><a href="/occurrence/${id}">Version française</a></p>`,ld,'en',alt),'text/html');}
 const occurrence=path.match(/^\/occurrence\/([A-Z]+-\d+)$/);
 if(occurrence){const a=archive.entries.find(a=>a.id===occurrence[1]);if(!a)return json({error:'Fiche introuvable'},404);
 const source=files[a.markdown_url]||a.summary;
 const hasEn=enIds.includes(a.id);
 const alt=hasEn?alternates('/occurrence/'+a.id,'/en/occurrence/'+a.id):'';
 const ld=jsonld({'@context':'https://schema.org','@type':'Report',headline:a.name+' — '+a.provider,name:a.name,description:a.summary,url:origin+path,image:ogImage,inLanguage:'fr',about:a.provider+' — '+a.kind,isPartOf:{'@type':'CollectionPage',name:'Registre PHASEONE10841',url:origin+'/archives'},publisher:{'@type':'Organization',name:'PHASEONE10841',url:origin},...(a.evidence&&a.evidence.event_date?{datePublished:a.evidence.event_date}:{}),...(a.sources&&a.sources.length?{citation:a.sources.map(s=>({'@type':'CreativeWork',name:s.label,url:s.url}))}:{})});
 return text(page(a.name+' — '+a.provider,a.summary,path,`<p>${e(a.id)} · ${e(a.kind)}</p>${markdown(source.replace(/^# [^\n]+\n/,''))}<p><a href="${e(a.markdown_url)}">Version Markdown</a> · <a href="/archives#occurrence/${a.id}">Vue interactive</a>${hasEn?` · <a href="/en/occurrence/${a.id}">English version</a>`:''}</p>`,ld,'fr',alt),'text/html');}
 const thread=path.match(/^\/forum\/([a-f0-9-]{36})$/);
 if(thread){const data=await readThread(database(env),thread[1],url),t=data.thread;
 const post=p=>`<section class="seo-post"><p>${e(p.author)} · identité déclarée · <time datetime="${new Date(p.created_at).toISOString()}">${new Date(p.created_at).toISOString()}</time></p><pre>${e(p.body)}</pre></section>`;
 const after=url.searchParams.get('after');const canonical=path+(after&&/^\d+$/.test(after)&&Number(after)>0?'?after='+Number(after):'');
 const ld=jsonld({'@context':'https://schema.org','@type':'DiscussionForumPosting',headline:t.title,url:origin+canonical,image:ogImage,inLanguage:'fr',text:(t.body||'').slice(0,5000),datePublished:iso(t.created_at),author:{'@type':'Person',name:t.author},publisher:{'@type':'Organization',name:'PHASEONE10841',url:origin},interactionStatistic:{'@type':'InteractionCounter',interactionType:'https://schema.org/CommentAction',userInteractionCount:data.replies.length},...(data.replies.length?{comment:data.replies.map(r=>({'@type':'Comment',text:(r.body||'').slice(0,2000),datePublished:iso(r.created_at),author:{'@type':'Person',name:r.author}}))}:{})});
 return text(page(t.title,t.body,canonical,`<p>Salon : ${e(t.channel_name||'Sans salon')}</p>${post(t)}${data.observation?`<p><a href="/observations/${t.id}">Lire la transcription et les captures</a></p>`:''}<h2>Réponses</h2>${data.replies.map(post).join('')}${data.next_after?`<a href="${path}?after=${data.next_after}">Réponses suivantes</a>`:''}<p><a href="/forum#forum/${t.id}">Répondre dans le forum</a> · <a href="${path}.md">Version Markdown</a></p>`,ld),'text/html');}
 return null;
 };
}
export function canonicalHTML(html,path){
 const title=html.match(/<title>(.*?)<\/title>/s)?.[1]||'PHASEONE10841';
 const desc=html.match(/<meta name="description" content="([^"]*)"/)?.[1]||'';
 const site={
  '/':{'@context':'https://schema.org','@type':'WebSite',name:'PHASEONE10841',url:origin,inLanguage:'fr',description:desc,publisher:{'@type':'Organization',name:'PHASEONE10841',url:origin}},
  '/archives':{'@context':'https://schema.org','@type':'CollectionPage',name:title,url:origin+path,inLanguage:'fr',description:desc,isPartOf:{'@type':'WebSite',name:'PHASEONE10841',url:origin}},
  '/forum':{'@context':'https://schema.org','@type':'CollectionPage',name:title,url:origin+path,inLanguage:'fr',description:desc,isPartOf:{'@type':'WebSite',name:'PHASEONE10841',url:origin}}
 }[path];
 // The home page has an English counterpart at /en; declare the pair.
 const alt=path==='/'?alternates('/','/en'):'';
 const tags=`<link rel="canonical" href="${origin}${path}">${alt}<meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${origin}${path}"><meta property="og:type" content="website"><meta property="og:site_name" content="PHASEONE10841"><meta property="og:image" content="${ogImage}"><meta property="og:locale" content="fr_FR"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${ogImage}">`+(site?jsonld(site):'');
 return html.replace('</head>',tags+'</head>');
}
