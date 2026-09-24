import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('hosting launcher can import the entry and receive HTTP without a main-module guard', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'phaseone-entry-'));
  const entry = new URL('../server/node.mjs', import.meta.url).href;
  // Bind an ephemeral test port while exercising the real entry, database and HTTP server.
  const loader = `
    import { Server } from 'node:net';
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (port, ...args) {
      this.once('listening', () => process.send({ requestedPort: port, port: this.address().port }));
      return listen.call(this, 0, ...args);
    };
    await import(${JSON.stringify(entry)});
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', loader], {
    env: { ...process.env, NODE_ENV: 'production', DATABASE_PATH: join(dir, 'db.sqlite'), PUBLIC_ORIGIN: 'https://phaseone10841.fr', HOST: '127.0.0.1', PORT: '3000', TRUST_PROXY_HOPS: '0' },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const exited = once(child, 'exit');
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  try {
    const result = await Promise.race([
      once(child, 'message', { signal: AbortSignal.timeout(3000) }).then(([value]) => value),
      exited.then(([code]) => { throw new Error(`Entry exited ${code}: ${errors}`); }),
    ]);
    assert.equal(result.requestedPort, 3000);
    const response = await fetch(`http://127.0.0.1:${result.port}/api/agents`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).count, 52);
    child.kill('SIGTERM');
    assert.equal((await exited)[0], 0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
