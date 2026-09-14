import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../dist/server/index.js';
import { openDatabase } from './sqlite.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function originValue(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path.');
  return url.origin;
}
function requestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = []; let size = 0, tooLarge = false;
    request.on('data', chunk => { size += chunk.length; if (size > 40000) { tooLarge = true; chunks.length = 0; } else if (!tooLarge) chunks.push(chunk); });
    request.on('end', () => tooLarge ? reject(Object.assign(new Error('Request body too large'), { status: 413 })) : resolveBody(size ? Buffer.concat(chunks) : undefined));
    request.on('error', reject);
  });
}
export function createApplication({ databasePath, publicOrigin, trustProxyHops = 0, migrationsDirectory = resolve(root, 'drizzle') }) {
  const canonicalOrigin = originValue(publicOrigin);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) throw new Error('Invalid TRUST_PROXY_HOPS');
  const DB = openDatabase(databasePath, migrationsDirectory);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const body = await requestBody(incoming);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const chain = [...String(incoming.headers['x-forwarded-for'] || '').split(',').map(v => v.trim()).filter(Boolean), incoming.socket.remoteAddress || ''];
      const candidate = chain[Math.max(0, chain.length - 1 - trustProxyHops)];
      headers.set('CF-Connecting-IP', isIP(candidate) ? candidate : incoming.socket.remoteAddress || 'unknown');
      const origin = canonicalOrigin || `http://127.0.0.1:${server.address().port}`;
      // Prefix the trusted origin: an absolute-form request target must not override it.
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) throw Object.assign(new Error('Invalid request target'), { status: 400 });
      const request = new Request(origin + incoming.url, { method: incoming.method, headers, ...(!['GET','HEAD'].includes(incoming.method) && body ? { body } : {}) });
      const response = await app.fetch(request, { DB });
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      if (!outgoing.headersSent) outgoing.writeHead(error.status || 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      outgoing.end(JSON.stringify({ error: error.status ? error.message : 'Service unavailable.' }));
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  server.on('close', () => DB.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const production = process.env.NODE_ENV === 'production';
  const databasePath = process.env.DATABASE_PATH || resolve(root, 'data/phaseone.sqlite');
  if (production && (!process.env.PUBLIC_ORIGIN || !process.env.DATABASE_PATH || !isAbsolute(databasePath) || resolve(databasePath).startsWith(root + '/'))) throw new Error('Production requires PUBLIC_ORIGIN and an absolute DATABASE_PATH outside the checkout on persistent storage.');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createApplication({ databasePath, publicOrigin: process.env.PUBLIC_ORIGIN, trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0) });
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`PHASEONE listening on http://${process.env.HOST || '127.0.0.1'}:${port}`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); server.closeIdleConnections(); setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000).unref(); });
}
