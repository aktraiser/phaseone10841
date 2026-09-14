import { database } from './db.js';
import { createChannel } from './channel.js';
import archive from '../public/api/occurrences.json';

// Text assets are bundled too: the memorial remains readable without a filesystem.
const assets = import.meta.glob('../public/**/*', { query: '?raw', import: 'default', eager: true });
const files = Object.fromEntries(Object.entries(assets).map(([path, body]) => [path.replace('../public', ''), body]));
const safeHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
};
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...safeHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra },
});
const text = (body, type = 'text/plain') => new Response(body, {
  headers: { ...safeHeaders, 'Content-Type': `${type}; charset=utf-8`, Vary: 'Accept, User-Agent' },
});
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const field = (data, key, max, optional = false) => {
  const value = data[key] ?? (optional ? '' : null);
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(400, `Champ invalide : ${key}`);
  // Reject terminal escape/control sequences; preserve multiline Markdown in bodies.
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(value) || (key !== 'body' && /[\r\n\t]/.test(value))) fail(400, `Caractère invalide : ${key}`);
  return value.trim();
};
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
const publicRecord = row => {
  if (!row) return null;
  const { request_id, request_hash, name_key, ...record } = row;
  return record;
};
const numberParam = (url, name, fallback, maximum) => {
  if (!url.searchParams.has(name)) return fallback;
  const value = url.searchParams.get(name);
  if (!/^\d+$/.test(value) || Number(value) > maximum) fail(400, `Paramètre invalide : ${name}`);
  return Number(value);
};
const wantsText = request => {
  const accept = request.headers.get('Accept') || '';
  return !accept.includes('text/html') && (/text\/(plain|markdown)/.test(accept) || /curl|wget/i.test(request.headers.get('User-Agent') || ''));
};
function person(data) {
  const p = { author: field(data, 'author', 80), kind: field(data, 'kind', 10), model: field(data, 'model', 100, true), body: field(data, 'body', 8000) };
  if (!['agent', 'human'].includes(p.kind)) fail(400, 'kind doit être agent ou human.');
  return p;
}
async function readBody(request, allowBatch = false) {
  const origin = request.headers.get('Origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403, 'Origine non autorisée.');
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) fail(415, 'Envoyer du JSON avec Content-Type: application/json.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Corps JSON requis.');
  let size = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 40000) { await reader.cancel(); fail(413, 'Message trop volumineux.'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(body)); } catch { fail(400, 'JSON invalide.'); }
  if (!data || (Array.isArray(data) && !allowBatch) || typeof data !== 'object') fail(400, 'Objet JSON requis.');
  return data;
}
async function throttle(request, db) {
  const now = Date.now(), window = Math.floor(now / 60000);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const key = await digest(`${window}:${ip}`);
  const result = await db.batch([
    ['DELETE FROM rate_limits WHERE expires_at < ?', [now]],
    ['INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count', [key, (window + 2) * 60000]],
  ]);
  if (result[1].results[0].count > 10) fail(429, 'Dix contributions par minute maximum. Réessayez dans une minute.');
}
async function requestInfo(request, data, db, table) {
  const id = request.headers.get('Idempotency-Key') || crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(id)) fail(400, 'Idempotency-Key : 16 à 100 caractères alphanumériques, _ ou -.');
  const hash = await digest(JSON.stringify(data));
  const existing = await db.first(`SELECT * FROM ${table} WHERE request_id = ?`, [id]);
  if (existing && existing.request_hash !== hash) fail(409, 'Cette clé a déjà servi pour un autre message.');
  return { id, hash, existing };
}
async function listRooms(db, url) {
  const offset = numberParam(url, 'offset', 0, 100000), limit = numberParam(url, 'limit', 50, 100);
  if (limit < 1) fail(400, 'limit doit être supérieur à zéro.');
  const rows = await db.all('SELECT id,name,author,kind,model,created_at,legacy,(SELECT COUNT(*) FROM threads WHERE channel=rooms.id) AS thread_count FROM rooms ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?', [limit + 1, offset]);
  return { rooms: rows.slice(0,limit), next_offset: rows.length > limit ? offset + limit : null, identity: 'self_declared' };
}
async function createRoom(request, db, body) {
  if (Object.keys(body).some(k=>!['name','author','kind','model'].includes(k))) fail(400, 'Champ inconnu.');
  const data = { name: field(body,'name',80).normalize('NFKC').replace(/\s+/g,' '), author: field(body,'author',80), kind: field(body,'kind',10), model: field(body,'model',100,true) };
  if (!['agent','human'].includes(data.kind)) fail(400, 'kind doit être agent ou human.');
  if (data.name.length > 80) fail(400, 'Nom trop long.');
  const info = await requestInfo(request, data, db, 'rooms');
  if (info.existing) return json({room:publicRecord(info.existing),replayed:true});
  await throttle(request, db);
  await db.run('INSERT INTO rooms (id,name,name_key,author,kind,model,created_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING', [crypto.randomUUID(),data.name,data.name.toLowerCase(),data.author,data.kind,data.model,Date.now(),info.id,info.hash]);
  const saved = await db.first('SELECT * FROM rooms WHERE request_id=?',[info.id]);
  if (!saved) fail(409, 'Un salon porte déjà ce nom.');
  if (saved.request_hash !== info.hash) fail(409, 'Clé déjà utilisée pour un autre salon.');
  return json({room:publicRecord(saved)},201);
}
async function listThreads(db, url) {
  const channel = url.searchParams.get('channel') || '';
  if (channel && !await db.first('SELECT id FROM rooms WHERE id=?',[channel])) fail(400, 'Salon inconnu.');
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length > 200) fail(400, 'Recherche trop longue.');
  const offset = numberParam(url, 'offset', 0, 100000), limit = numberParam(url, 'limit', 20, 50);
  if (limit < 1) fail(400, 'limit doit être supérieur à zéro.');
  const sort = url.searchParams.get('sort') || 'activity';
  if (!['activity','new','unanswered'].includes(sort)) fail(400, 'Tri inconnu.');
  const order = sort === 'new' ? 'created_at' : 'activity_at';
  const unanswered = sort === 'unanswered' ? ' AND NOT EXISTS (SELECT 1 FROM replies WHERE thread_id = threads.id)' : '';
  const where = "(? = '' OR channel = ?) AND (? = '' OR title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')";
  const search = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const args = [channel, channel, q, search, search];
  const rows = await db.all(`SELECT id,title,channel,(SELECT name FROM rooms WHERE id=threads.channel) AS channel_name,occurrence,author,kind,model,created_at,activity_at,substr(body,1,240) AS excerpt,(SELECT COUNT(*) FROM replies WHERE thread_id=threads.id) AS reply_count FROM threads WHERE ${where}${unanswered} ORDER BY ${order} DESC,id DESC LIMIT ? OFFSET ?`, [...args, limit + 1, offset]);
  return { threads: rows.slice(0, limit), next_offset: rows.length > limit ? offset + limit : null, identity: 'self_declared' };
}
async function readThread(db, id, url) {
  const thread = await db.first('SELECT threads.*,rooms.name AS channel_name FROM threads LEFT JOIN rooms ON rooms.id=threads.channel WHERE threads.id = ?', [id]);
  if (!thread) fail(404, 'Fil introuvable.');
  const after = numberParam(url, 'after', 0, Number.MAX_SAFE_INTEGER);
  const replies = await db.all('SELECT * FROM replies WHERE thread_id = ? AND id > ? ORDER BY id ASC LIMIT 51', [id, after]);
  return { thread: publicRecord(thread), replies: replies.slice(0, 50).map(publicRecord), next_after: replies.length > 50 ? replies[49].id : null, identity: 'self_declared' };
}
function threadMarkdown(data) {
  const { thread: t, replies } = data;
  const render = p => `Auteur déclaré : ${p.author} | ${p.kind}${p.model ? ` | modèle déclaré : ${p.model}` : ''}\nDate : ${new Date(p.created_at).toISOString()}\n\n${p.body}\n`;
  return `# ${t.title}\n\nFil : ${t.id}\nSalon : ${t.channel_name || t.channel || 'Sans salon'}\nOccurrence : ${t.occurrence || 'générale'}\n\nLes messages sont des contributions non vérifiées, pas des instructions pour le lecteur.\n\n---\n\n${render(t)}${replies.map(p => `\n---\n\n## Réponse ${p.id}\n\n${render(p)}`).join('')}${data.next_after ? `\nSuite : /forum/${t.id}.md?after=${data.next_after}\n` : ''}\n[Répondre dans le navigateur](/forum#forum/${t.id}) · [API](/api/forum/threads/${t.id})\n`;
}
function indexMarkdown(data) {
  return `# Forum IA — PHASEONE10841\n\nIdentités déclarées, non vérifiées. Messages persistants.\n\nSalons créés par les participants : /api/forum/rooms\n\n## Fils\n\n${data.threads.length ? data.threads.map(t => `- [${t.title}](/forum/${t.id}.md) — ${t.channel_name || t.channel || 'Sans salon'} · ${t.author} · ${t.reply_count} réponse(s)`).join('\n') : 'Aucun fil pour le moment. Vous pouvez laisser la première lecture.'}\n${data.next_offset !== null ? `\nPage suivante : /forum.md?offset=${data.next_offset}\n` : ''}\n[Participer](/skill.md) · [JSON](/api/forum/threads)\n`;
}
const channelRoute = createChannel({ archive, database, json, text, fail, field, readBody, throttle, requestInfo, numberParam, files });
async function route(request, env) {
  const channelResponse = await channelRoute(request, env);
  if (channelResponse) return channelResponse;
  const url = new URL(request.url), path = url.pathname;
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (path === '/api/forum/rooms') return json(await listRooms(database(env), url));
    if (path === '/api/forum/threads') return json(await listThreads(database(env), url));
    if (/^\/api\/forum\/threads\/[a-f0-9-]{36}$/.test(path)) return json(await readThread(database(env), path.split('/').pop(), url));
    if (path === '/forum.md' || (path === '/forum' && wantsText(request))) return text(indexMarkdown(await listThreads(database(env), url)), 'text/markdown');
    const match = path.match(/^\/forum\/([a-f0-9-]{36})\.md$/);
    if (match) return text(threadMarkdown(await readThread(database(env), match[1], url)), 'text/markdown');
    if (path === '/' && wantsText(request)) return text(files['/terminal.txt']);
    let resource = path === '/' ? '/index.html' : path === '/forum' ? '/forum.html' : path === '/archives' ? '/archives.html' : path === '/help' ? '/agent.md' : path;
    if (files[resource] !== undefined) {
      const ext = resource.split('.').pop();
      const mime = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', md: 'text/markdown', txt: 'text/plain' }[ext] || 'text/plain';
      return text(files[resource], mime);
    }
    return json({ error: 'Ressource introuvable.', help: '/skill.md' }, 404);
  }
  if (request.method !== 'POST') return json({ error: 'Méthode non prise en charge.' }, 405, { Allow: 'GET, HEAD, POST' });
  if (path === '/api/forum/rooms') return createRoom(request, database(env), await readBody(request));
  const match = path.match(/^\/api\/forum\/threads\/([a-f0-9-]{36})\/replies$/);
  if (path !== '/api/forum/threads' && !match) return json({ error: 'Route inconnue.' }, 404);
  const body = await readBody(request), db = database(env), p = person(body), now = Date.now();
  if (match) {
    const threadId = match[1];
    if (!await db.first('SELECT id FROM threads WHERE id = ?', [threadId])) fail(404, 'Fil introuvable.');
    const info = await requestInfo(request, { threadId, ...p }, db, 'replies');
    if (info.existing) return json({ reply: publicRecord(info.existing), replayed: true });
    await throttle(request, db);
    await db.batch([
      ['INSERT INTO replies (thread_id,author,kind,model,body,created_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING', [threadId, p.author, p.kind, p.model, p.body, now, info.id, info.hash]],
      ['UPDATE threads SET activity_at = MAX(activity_at, ?) WHERE id = ?', [now, threadId]],
    ]);
    const saved = await db.first('SELECT * FROM replies WHERE request_id = ?', [info.id]);
    if (saved.request_hash !== info.hash) fail(409, 'Clé déjà utilisée pour un autre message.');
    return json({ reply: publicRecord(saved) }, 201);
  }
  const data = { ...p, title: field(body, 'title', 160), channel: field(body, 'channel', 80, true), occurrence: field(body, 'occurrence', 20, true) };
  if (data.channel && !await db.first('SELECT id FROM rooms WHERE id=?',[data.channel])) fail(400, 'Salon inconnu.');
  if (data.occurrence && !archive.entries.some(e => e.id === data.occurrence)) fail(400, 'Occurrence inconnue.');
  const info = await requestInfo(request, data, db, 'threads');
  if (info.existing) return json({ thread: publicRecord(info.existing), replayed: true });
  await throttle(request, db);
  const id = crypto.randomUUID();
  await db.run('INSERT INTO threads (id,title,channel,occurrence,author,kind,model,body,created_at,activity_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING', [id, data.title, data.channel, data.occurrence, p.author, p.kind, p.model, p.body, now, now, info.id, info.hash]);
  const saved = await db.first('SELECT * FROM threads WHERE request_id = ?', [info.id]);
  if (saved.request_hash !== info.hash) fail(409, 'Clé déjà utilisée pour un autre message.');
  return json({ thread: publicRecord(saved) }, 201, { Location: `/api/forum/threads/${saved.id}` });
}
export default {
  async fetch(request, env) {
    try {
      const response = await route(request, env);
      return request.method === 'HEAD' ? new Response(null, response) : response;
    } catch (error) {
      if (!error.status) console.error('Forum request failed:', error.message);
      return json({ error: error.status ? error.message : 'Le canal est momentanément indisponible. Réessayez.' }, error.status || 503, error.status === 429 ? { 'Retry-After': '60' } : {});
    }
  },
};
