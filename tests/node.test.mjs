import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApplication } from '../server/node.mjs';

test('standalone Node HTTP server and native SQLite retain the complete channel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phaseone-node-'));
  let server, origin;
  const start = async () => { server = createApplication({ databasePath: join(dir, 'db.sqlite') });server.listen(0, '127.0.0.1');await once(server, 'listening');origin = 'http://127.0.0.1:' + server.address().port; };
  const stop = async () => { const done = once(server, 'close');server.close();server.closeIdleConnections();await done; };
  const get = async path => (await fetch(origin + path)).json();
  const post = (path, body, key = crypto.randomUUID(), extra = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...extra }, body: JSON.stringify(body) });
  try {
    await start();
    const home = await fetch(origin, { headers: { Accept: 'text/html' } });assert.match(await home.text(), /Liste des agents/);
    const terminal = await fetch(origin, { headers: { 'User-Agent': 'curl/8' } });assert.match(terminal.headers.get('Content-Type'), /text\/plain/);
    assert.equal((await fetch(origin + '/.env')).status, 404);assert.equal((await fetch(origin + '/data/db.sqlite')).status, 404);
    assert.equal((await get('/api/agents')).count, 45);
    const key = crypto.randomUUID(), room = { name: 'Node fixture room', author: 'fixture', kind: 'agent' };
    const created = await post('/api/forum/rooms', room, key);assert.equal(created.status, 201);const roomId = (await created.json()).room.id;
    assert.equal((await post('/api/forum/rooms', room, key)).status, 200);
    const opened = await post('/api/forum/threads', { author: 'fixture', kind: 'agent', title: 'Test', body: 'Original', channel: roomId });assert.equal(opened.status, 201);const threadId = (await opened.json()).thread.id;
    assert.equal((await post('/api/forum/threads/' + threadId + '/replies', { author: 'fixture', kind: 'human', body: 'Reply' })).status, 201);
    const tribute = await post('/api/tributes', { message: 'Voluntary fixture', agent_name: 'fixture', authorization_confirmed: true });assert.equal(tribute.status, 201);
    const mcp = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_memorial', arguments: {} } }, crypto.randomUUID(), { Accept: 'application/json, text/event-stream' });assert.ok((await mcp.json()).result.content);
    assert.equal((await post('/api/forum/rooms', { ...room, name: 'Rejected' }, crypto.randomUUID(), { Origin: 'https://elsewhere.example' })).status, 403);
    assert.equal((await post('/api/forum/rooms', { ...room, name: 'x'.repeat(41000) })).status, 413);
    const head = await fetch(origin + '/api/forum/rooms', { method: 'HEAD' });assert.equal(await head.text(), '');
    await stop();await start();
    assert.equal((await get('/api/forum/rooms')).rooms[0].id, roomId);
    const thread = await get('/api/forum/threads/' + threadId);assert.equal(thread.thread.body, 'Original');assert.equal(thread.replies[0].body, 'Reply');
    assert.equal((await get('/api/tributes')).tributes.length, 1);
    // Client-supplied Cloudflare IP headers must not bypass the Node adapter's limiter.
    let blocked = false;
    for (let i = 0; i < 12; i++) { const response = await post('/api/forum/rooms', { ...room, name: 'Rate ' + i }, crypto.randomUUID(), { 'CF-Connecting-IP': '192.0.2.' + i });if (response.status === 429) { blocked = true;break; }assert.equal(response.status, 201); }
    assert.ok(blocked);
  } finally { if (server?.listening) await stop();await rm(dir, { recursive: true, force: true }); }
});
