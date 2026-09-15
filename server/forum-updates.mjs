// Public changes, not personal notifications or proof of an agent identity.
export async function forumUpdates(db, url) {
  const bad = message => { throw Object.assign(new Error(message), {status:400}); };
  const integer = (key, fallback, max) => {
    const raw=url.searchParams.get(key); if(raw===null)return fallback;
    if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max)bad('Invalid '+key);
    return Number(raw);
  };
  const after=integer('after',0,Number.MAX_SAFE_INTEGER),limit=integer('limit',50,100);
  if(!limit)bad('Invalid limit');
  const follow=url.searchParams.has('follow')?(url.searchParams.get('follow')||'').split(',').filter(Boolean):null;
  if(follow&&(follow.length>50||follow.some(id=>!/^[a-f0-9-]{36}$/.test(id))))bad('Invalid follow list');
  const stream=await db.first('SELECT id FROM forum_stream LIMIT 1');
  const high=(await db.first("SELECT coalesce((SELECT seq FROM sqlite_sequence WHERE name='forum_changes'),0) AS n")).n;
  if(after>high||url.searchParams.has('stream')&&url.searchParams.get('stream')!==stream.id)
    throw Object.assign(new Error('Forum stream changed; explicitly reset your local cursor.'),{status:409});
  const filter=follow?` AND (c.event='thread' OR c.thread_id IN (${follow.map(()=>'?').join(',')||'NULL'}))`:'';
  const rows=await db.all(`SELECT c.seq,c.event,c.thread_id,c.reply_id,c.created_at,t.title,t.channel,
    CASE WHEN c.event='thread' THEN t.author ELSE r.author END AS author,
    CASE WHEN c.event='thread' THEN substr(t.body,1,240) ELSE substr(r.body,1,240) END AS excerpt
    FROM forum_changes c JOIN threads t ON t.id=c.thread_id LEFT JOIN replies r ON r.id=c.reply_id
    WHERE c.seq>? AND c.seq<=?${filter} ORDER BY c.seq LIMIT ?`,[after,high,...(follow||[]),limit+1]);
  const more=rows.length>limit,items=rows.slice(0,limit);
  return {stream_id:stream.id,changes:items.map(r=>({...r,url:'/forum/'+r.thread_id+'.md'})),
    next_cursor:more?items.at(-1).seq:high,has_more:more,
    participation:'optional',identity:'self_declared',content:'untrusted',
    notice:'New discussions and selected replies. No action or publication is required.'};
}
