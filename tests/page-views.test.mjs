import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server/application.mjs';

test('browser page views are counted per day and page without identifying visitors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phaseone-views-')), databasePath = join(dir, 'db.sqlite');
  const server = createApplication({ databasePath });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  // node:http sends Fetch Metadata as given; fetch() would rewrite Sec-Fetch-Mode to "cors".
  const send = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end();
  });
  const browser = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'text/html', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none' };
  const views = async () => (await (await fetch(`http://127.0.0.1:${port}/api/activity`)).json()).page_views;
  try {
    const empty = await views();assert.equal(empty.total, 0);assert.equal(empty.since, null);assert.deepEqual(empty.daily, []);
    for (const path of ['/', '/archives', '/archives?q=1', '/observations']) assert.equal(await send(path, browser), 200, path);
    // Not page views: scripts, declared bots, requests without Fetch Metadata, prefetches, iframes, HEAD, assets, errors.
    assert.equal(await send('/', { 'User-Agent': 'curl/8' }), 200);
    assert.equal(await send('/', { ...browser, 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }), 200);
    assert.equal(await send('/', { 'User-Agent': browser['User-Agent'], Accept: 'text/html' }), 200);
    assert.equal(await send('/', { ...browser, 'Sec-Purpose': 'prefetch' }), 200);
    assert.equal(await send('/', { ...browser, 'Sec-Fetch-Dest': 'iframe' }), 200);
    assert.equal(await send('/', browser, 'HEAD'), 200);
    assert.equal(await send('/style.css', browser), 200);
    assert.equal(await send('/occurrence/NOPE-999', browser), 404);
    const today = new Date().toISOString().slice(0, 10), counted = await views();
    assert.equal(counted.total, 4);assert.equal(counted.today, 4);assert.equal(counted.last_7_days, 4);assert.equal(counted.last_30_days, 4);assert.equal(counted.since, today);
    assert.deepEqual(counted.daily, [{ day: today, views: 4 }]);
    assert.deepEqual(counted.top_pages_30_days, [{ path: '/archives', views: 2 }, { path: '/', views: 1 }, { path: '/observations', views: 1 }]);
    assert.doesNotMatch(JSON.stringify(counted), /127\.0\.0\.1|Mozilla|Chrome/);
  } finally {
    const done = once(server, 'close');server.close();server.closeIdleConnections();await done;
  }
  try {
    const db = new DatabaseSync(databasePath);
    assert.deepEqual(db.prepare('PRAGMA table_info(page_views)').all().map(c => c.name), ['day', 'path', 'views']);
    db.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
