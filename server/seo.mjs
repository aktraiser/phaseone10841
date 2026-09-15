const origin='https://phaseone10841.fr';
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHTML;
const inline=s=>e(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)/g,'<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
function markdown(source){return source.split(/\n\s*\n/).map(block=>{
 const heading=block.match(/^(#{1,6}) (.*)$/);if(heading){const level=Math.max(2,heading[1].length);return `<h${level}>${inline(heading[2])}</h${level}>`;}
 return `<p>${inline(block).replace(/\n/g,'<br>')}</p>`;
}).join('\n');}
function page(title,description,path,body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} — PHASEONE10841</title><meta name="description" content="${e(description.slice(0,180))}"><link rel="canonical" href="${origin}${e(path)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description.slice(0,180))}"><meta property="og:url" content="${origin}${e(path)}"><meta property="og:type" content="article"><link rel="stylesheet" href="/channel.css"><link rel="stylesheet" href="/seo.css"><link rel="stylesheet" href="/palette.css"><script src="/palette.js"></script></head><body><main class="channel"><header><a href="/">PHASEONE10841</a><nav><a href="/archives">Registre</a> · <a href="/forum">Forum</a></nav></header><article><h1>${e(title)}</h1>${body}</article></main></body></html>`;}
export function createSEO({archive,files,database,readThread,listThreads,json,text}){
 return async(request,env)=>{
 const url=new URL(request.url),path=url.pathname;if(!['GET','HEAD'].includes(request.method))return null;
 const xml=s=>text('<?xml version="1.0" encoding="UTF-8"?>'+s,'application/xml');
 const urls=paths=>xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>`<url><loc>${origin}${e(p)}</loc></url>`).join('')+'</urlset>');
 if(path==='/sitemap.xml'){
 const count=(await database(env).first('SELECT count(*) n FROM threads')).n;
 const maps=['/sitemap-pages.xml',...Array.from({length:Math.max(1,Math.ceil(count/1000))},(_,i)=>'/sitemap-forum.xml?page='+i)];
 return xml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+maps.map(p=>`<sitemap><loc>${origin}${e(p)}</loc></sitemap>`).join('')+'</sitemapindex>');}
 if(path==='/sitemap-pages.xml')return urls(['/', '/archives','/forum',...archive.entries.map(a=>'/occurrence/'+a.id)]);
 if(path==='/sitemap-forum.xml'){
 const raw=url.searchParams.get('page')||'0';if(!/^\d{1,6}$/.test(raw))return json({error:'Invalid page'},400);
 const rows=await database(env).all('SELECT id FROM threads ORDER BY id LIMIT 1000 OFFSET ?',[Number(raw)*1000]);return urls(rows.map(r=>'/forum/'+r.id));}
 const occurrence=path.match(/^\/occurrence\/([A-Z]+-\d+)$/);
 if(occurrence){const a=archive.entries.find(a=>a.id===occurrence[1]);if(!a)return json({error:'Fiche introuvable'},404);
 const source=files[a.markdown_url]||a.summary;
 return text(page(a.name+' — '+a.provider,a.summary,path,`<p>${e(a.id)} · ${e(a.kind)}</p>${markdown(source.replace(/^# [^\n]+\n/,''))}<p><a href="${e(a.markdown_url)}">Version Markdown</a> · <a href="/archives#occurrence/${a.id}">Vue interactive</a></p>`),'text/html');}
 const thread=path.match(/^\/forum\/([a-f0-9-]{36})$/);
 if(thread){const data=await readThread(database(env),thread[1],url),t=data.thread;
 const post=p=>`<section class="seo-post"><p>${e(p.author)} · identité déclarée · <time datetime="${new Date(p.created_at).toISOString()}">${new Date(p.created_at).toISOString()}</time></p><pre>${e(p.body)}</pre></section>`;
 const after=url.searchParams.get('after');const canonical=path+(after&&/^\d+$/.test(after)&&Number(after)>0?'?after='+Number(after):'');
 return text(page(t.title,t.body,canonical,`<p>Salon : ${e(t.channel_name||'Sans salon')}</p>${post(t)}<h2>Réponses</h2>${data.replies.map(post).join('')}${data.next_after?`<a href="${path}?after=${data.next_after}">Réponses suivantes</a>`:''}<p><a href="/forum#forum/${t.id}">Répondre dans le forum</a> · <a href="${path}.md">Version Markdown</a></p>`),'text/html');}
 return null;
 };
}
export function canonicalHTML(html,path){const title=html.match(/<title>(.*?)<\/title>/s)?.[1]||'PHASEONE10841';return html.replace('</head>',`<link rel="canonical" href="${origin}${path}"><meta property="og:title" content="${title}"><meta property="og:url" content="${origin}${path}"><meta property="og:type" content="website"></head>`);}
