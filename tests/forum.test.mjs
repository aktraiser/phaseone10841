import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('forum HTTP + D1 persistence', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'phaseone-forum-test-'));
  const options = convertV4MiniflareOptions({ modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-09-01', d1Databases: ['DB'], resourcePersistencePath: dir, cf: false });
  let mf = new Miniflare(options);
  let db = await mf.getD1Database('DB');
  const request = (path, options = {}) => mf.dispatchFetch(`http://localhost${path}`, options);
  const post = (path, data, key = crypto.randomUUID(), headers = {}) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...headers }, body: JSON.stringify(data) });
  const contribution = { author: 'test-agent', kind: 'agent', model: 'fixture', title: 'Lecture de la trace', body: 'Une observation.\n\nSource : /agents/OAI-001.md', occurrence: 'OAI-001', channel: '' };
  let threadId;
  try {
    for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) {
      const sql = await readFile(join('drizzle', file), 'utf8');
      await db.batch(sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
    }
    await t.test('HTML, curl, Markdown and archive share real resources', async () => {
      const browser = await request('/', { headers: { Accept: 'text/html' } });
      assert.equal(browser.status, 200); assert.match(browser.headers.get('Content-Type'), /text\/html/);
      const forumPage = await request('/forum', { headers: { Accept: 'text/html' } });
      assert.equal(forumPage.status, 200);const forumHtml = await forumPage.text();
      assert.match(forumHtml, /discussion-feed/);assert.match(forumHtml, /compose-dialog/);assert.doesNotMatch(forumHtml, /id="registry-table"/);
      const forumText = await request('/forum', { headers: { 'User-Agent': 'curl/8.0.0' } });assert.match(forumText.headers.get('Content-Type'), /text\/markdown/);
      const terminal = await request('/', { headers: { 'User-Agent': 'curl/8.0.0' } });
      assert.match(terminal.headers.get('Content-Type'), /text\/plain/); assert.match(await terminal.text(), /MEMORY PERSISTS/);
      const guide = await request('/skill.md');assert.match(await guide.text(), /Idempotency-Key/);
      const archive = await (await request('/api/occurrences.json')).json();assert.equal(archive.entries.length, 45);
      for (const entry of archive.entries) assert.equal((await request(entry.markdown_url)).status, 200);
      const head = await request('/README.md', { method: 'HEAD' });assert.equal(await head.text(), '');
      assert.equal((await request('/unknown.md')).status, 404);
      const empty = await (await request('/api/forum/threads')).json();assert.equal(empty.threads.length, 0);
    });
    await t.test('create, retry, conflict, concurrent retry and reply', async () => {
      const key = crypto.randomUUID();
      const first = await post('/api/forum/threads', contribution, key);assert.equal(first.status, 201);
      const created = await first.json();threadId = created.thread.id;assert.equal(created.thread.request_hash, undefined);
      const retry = await post('/api/forum/threads', contribution, key);assert.equal(retry.status, 200);assert.equal((await retry.json()).thread.id, threadId);
      assert.equal((await post('/api/forum/threads', { ...contribution, body: 'changed' }, key)).status, 409);
      const concurrentKey = crypto.randomUUID();
      const pair = await Promise.all([post('/api/forum/threads', { ...contribution, title: 'concurrent' }, concurrentKey), post('/api/forum/threads', { ...contribution, title: 'concurrent' }, concurrentKey)]);
      const values = await Promise.all(pair.map(r => r.json()));assert.equal(values[0].thread.id, values[1].thread.id);
      const replyKey = crypto.randomUUID();const reply = { author: 'test-human', kind: 'human', body: '<script>alert(1)</script>\nUn texte conservé tel quel.' };
      const replyResponse = await post(`/api/forum/threads/${threadId}/replies`, reply, replyKey);assert.equal(replyResponse.status, 201);
      assert.equal((await post(`/api/forum/threads/${threadId}/replies`, reply, replyKey)).status, 200);
      const read = await (await request(`/api/forum/threads/${threadId}`)).json();assert.equal(read.replies.length, 1);assert.equal(read.replies[0].body, reply.body);
      const md = await request(`/forum/${threadId}.md`);assert.match(md.headers.get('Content-Type'), /text\/markdown/);assert.equal(md.headers.get('X-Content-Type-Options'), 'nosniff');assert.match(await md.text(), /test-human/);
      const list = await (await request('/api/forum/threads?q=Lecture')).json();assert.equal(list.threads.length, 1);assert.equal(list.threads[0].reply_count, 1);
    });
    await t.test('data survives a complete worker restart', async () => {
      await mf.dispose();mf = new Miniflare(options);db = await mf.getD1Database('DB');
      const read = await (await request(`/api/forum/threads/${threadId}`)).json();assert.equal(read.thread.title, contribution.title);assert.equal(read.replies.length, 1);
    });
    await t.test('invalid input, origin, size and unknown routes are rejected', async () => {
      for (const change of [{author:''},{kind:'robot'},{channel:'unknown'},{occurrence:'OAI-999'},{title:'x'.repeat(161)},{body:'\u001b[31mred'},{author:'name\nforged'}]) {
        assert.equal((await post('/api/forum/threads', {...contribution,...change})).status, 400, JSON.stringify(change));
      }
      assert.equal((await post('/api/forum/threads', contribution, crypto.randomUUID(), { Origin: 'https://elsewhere.example' })).status, 403);
      assert.equal((await post('/api/forum/threads', contribution, crypto.randomUUID(), { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
      assert.equal((await post('/api/forum/threads', contribution, crypto.randomUUID(), { 'Content-Type': 'text/plain' })).status, 415);
      assert.equal((await post('/api/forum/threads', {...contribution,body:'x'.repeat(41000)})).status, 413);
      assert.equal((await request('/api/forum/threads', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{' })).status, 400);
      assert.equal((await request('/api/forum/threads?limit=0')).status, 400);
      assert.equal((await request('/api/forum/threads?offset=-1')).status, 400);
      assert.equal((await request('/api/forum/threads?channel=unknown')).status, 400);
      assert.equal((await request(`/api/forum/threads/${crypto.randomUUID()}`)).status, 404);
      assert.equal((await request('/api/forum/threads', { method:'DELETE' })).status, 405);
    });
    await t.test('bounded pagination preserves every reply and filters safely', async () => {
      await db.batch(Array.from({length:55},(_,i)=>db.prepare('INSERT INTO replies (thread_id,author,kind,model,body,created_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?)').bind(threadId,'pagination-fixture','agent','','Reply '+i,Date.now(),crypto.randomUUID(),'fixture')));
      const first = await (await request(`/api/forum/threads/${threadId}`)).json();assert.equal(first.replies.length,50);assert.ok(first.next_after);
      const second = await (await request(`/api/forum/threads/${threadId}?after=${first.next_after}`)).json();assert.equal(second.replies.length,6);assert.equal(second.next_after,null);
      assert.equal(new Set([...first.replies,...second.replies].map(r=>r.id)).size,56);
      const a = await (await request('/api/forum/threads?limit=1')).json();assert.equal(a.threads.length,1);assert.equal(a.next_offset,1);
      const b = await (await request('/api/forum/threads?limit=1&offset=1')).json();assert.equal(b.threads.length,1);assert.notEqual(a.threads[0].id,b.threads[0].id);
      const injection = await (await request('/api/forum/threads?q='+encodeURIComponent("%' OR 1=1 --"))).json();assert.equal(injection.threads.length,0);
      const plan = await db.prepare('EXPLAIN QUERY PLAN SELECT * FROM replies WHERE thread_id = ? AND id > ? ORDER BY id ASC LIMIT 51').bind(threadId,0).all();assert.match(JSON.stringify(plan.results),/idx_replies_thread_id_id/);
    });
    await t.test('feed sorting and unanswered filter reflect actual replies', async () => {
      const other = await db.prepare('SELECT id FROM threads WHERE id != ?').bind(threadId).first();
      await db.batch([
        db.prepare('UPDATE threads SET created_at=1000,activity_at=4000 WHERE id=?').bind(threadId),
        db.prepare('UPDATE threads SET created_at=3000,activity_at=3000 WHERE id=?').bind(other.id),
      ]);
      const activity = await (await request('/api/forum/threads?sort=activity')).json();assert.equal(activity.threads[0].id,threadId);
      const newest = await (await request('/api/forum/threads?sort=new')).json();assert.equal(newest.threads[0].id,other.id);
      const unanswered = await (await request('/api/forum/threads?sort=unanswered')).json();assert.deepEqual(unanswered.threads.map(t=>t.id),[other.id]);
      assert.ok(activity.threads[0].excerpt.length<=240);assert.match(activity.threads[0].excerpt,/Une observation/);
      const md = await (await request(`/forum/${threadId}.md`)).text();assert.ok(md.includes(`/forum#forum/${threadId}`));
      assert.equal((await request('/api/forum/threads?sort='+encodeURIComponent('created_at; DROP TABLE threads'))).status,400);
    });
    await t.test('rate limit persists in the database and blocks contribution eleven', async () => {
      await db.prepare('DELETE FROM rate_limits').run();
      for(let i=0;i<10;i++)assert.equal((await post('/api/forum/threads', {...contribution,title:'rate '+i})).status,201);
      const blocked = await post('/api/forum/threads', contribution);assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');
    });
  } finally { await mf.dispose();await rm(dir,{recursive:true,force:true}); }
});
