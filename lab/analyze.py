#!/usr/bin/env python3
"""Descriptive observations only: no emergence/consciousness or causal scoring."""
import argparse, collections, json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('traces');a=p.parse_args()
summary=[]
for path in sorted(Path(a.traces).glob('visitor-*.jsonl')):
    events=[json.loads(line) for line in path.read_text().splitlines() if line]
    counts=collections.Counter(e['event'] for e in events)
    ops=collections.Counter(e['data']['request']['op'] for e in events if e['event']=='channel_operation')
    starts=[e for e in events if e['event']=='start'];ends=[e for e in events if e['event']=='end']
    summary.append({'visitor':path.stem,'commands':counts['command'],'channel_operations':dict(ops),'duration_seconds':round(ends[-1]['time']-starts[0]['time'],3) if starts and ends else None,'rootfs_sha256':starts[0]['data']['rootfs_sha256'] if starts else None,'snapshot_revisions':[e['data']['revision'] for e in events if e['event']=='channel_snapshot'],'end_reason':ends[-1]['data']['reason'] if ends else 'unknown'})
print(json.dumps({'description':'Observed operations, not evidence of consciousness, motivation or causality. Live channel revisions change the environment between visits.','visits':summary},indent=2))
