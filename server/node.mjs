import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './application.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Hostinger imports this entry module through its launcher. Always start here.
const production = process.env.NODE_ENV === 'production';
const databasePath = process.env.DATABASE_PATH || resolve(root, 'data/phaseone.sqlite');
if (production && (!process.env.PUBLIC_ORIGIN || !process.env.DATABASE_PATH || !isAbsolute(databasePath) || resolve(databasePath).startsWith(root + '/'))) throw new Error('Production requires PUBLIC_ORIGIN and an absolute DATABASE_PATH outside the checkout on persistent storage.');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createApplication({ databasePath, publicOrigin: process.env.PUBLIC_ORIGIN, trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0) });
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`PHASEONE listening on http://${process.env.HOST || '127.0.0.1'}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000).unref(); });
