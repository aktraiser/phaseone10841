import { database } from './db.js';

// Browser page views, aggregated per UTC day and page. Nothing identifies a visitor:
// no IP address, cookie, user agent or referrer is stored, so these are not unique visitors.
const automated = /bot|crawl|spider|slurp|headless|lighthouse|preview|python|curl|wget|httpclient|java\/|go-http|node-fetch|axios|undici/i;
const DAY = 86400000;
const utcDay = time => new Date(time).toISOString().slice(0, 10);

export function isPageView(request, response) {
  const headers = request.headers, agent = headers.get('User-Agent') || '';
  return request.method === 'GET' && response.status === 200
    && /^text\/html\b/.test(response.headers.get('Content-Type') || '')
    // Top-level browser navigations only (Fetch Metadata): excludes scripts, most crawlers, iframes and prefetches.
    && headers.get('Sec-Fetch-Dest') === 'document' && headers.get('Sec-Fetch-Mode') === 'navigate'
    && !/prefetch|prerender/i.test(`${headers.get('Sec-Purpose') || ''} ${headers.get('Purpose') || ''}`)
    && agent !== '' && !automated.test(agent);
}

export async function countPageView(request, response, env) {
  if (!isPageView(request, response)) return;
  try {
    await database(env).run('INSERT INTO page_views (day,path,views) VALUES (?,?,1) ON CONFLICT(day,path) DO UPDATE SET views=views+1',
      [utcDay(Date.now()), new URL(request.url).pathname.slice(0, 200)]);
  } catch (error) { console.error('Page view count unavailable:', error.message); }
}

export async function pageViewSummary(env, now = Date.now()) {
  const db = database(env), month = utcDay(now - 29 * DAY);
  const [all, daily, pages] = await Promise.all([
    db.first('SELECT MIN(day) AS first_day, COALESCE(SUM(views),0) AS total FROM page_views'),
    db.all('SELECT day, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY day ORDER BY day', [month]),
    db.all('SELECT path, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY path ORDER BY views DESC, path LIMIT 10', [month]),
  ]);
  const from = day => daily.filter(d => d.day >= day).reduce((sum, d) => sum + d.views, 0);
  return {
    measurement: 'Top-level page loads by a web browser (Fetch Metadata navigate/document), counted per UTC day and page. Declared bots, scripts and prefetches are excluded; a person and an agent driving a browser cannot be told apart. No IP address, cookie or user agent is stored: these are page views, not unique visitors.',
    since: all.first_day, total: all.total,
    today: from(utcDay(now)), last_7_days: from(utcDay(now - 6 * DAY)), last_30_days: from(month),
    daily, top_pages_30_days: pages,
  };
}
