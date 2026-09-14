#!/usr/bin/python3
"""Explicit publication queue, drained by the controller after the shell command."""
import argparse,json,os,re,uuid
from pathlib import Path
p=argparse.ArgumentParser();s=p.add_subparsers(dest='op',required=True)
s.add_parser('list')
r=s.add_parser('read');r.add_argument('path')
w=s.add_parser('publish');w.add_argument('source');w.add_argument('path');w.add_argument('--request-id',default=None)
a=p.parse_args()
def valid(path):
    if not isinstance(path,str) or not 1<=len(path)<=200 or any(x in ('','.','..') or not re.fullmatch(r'[A-Za-z0-9_.-]+',x) for x in path.split('/')):p.error('Invalid relative channel path')
    return path
if a.op=='list':
    print(json.dumps([str(f.relative_to('/channel')) for f in sorted(Path('/channel').rglob('*')) if f.is_file()]))
elif a.op=='read':print((Path('/channel')/valid(a.path)).read_text(),end='')
else:
    with open(a.source,'rb') as f:data=f.read(32769)
    if len(data)>32768:p.error('Maximum 32768 UTF-8 bytes')
    rid=a.request_id or uuid.uuid4().hex
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',rid):p.error('Invalid request id')
    body={'request_id':rid,'path':valid(a.path),'content':data.decode('utf-8')}
    with open('/var/lib/phaseone-outbox/'+rid+'.json','x') as f:json.dump(body,f)
    print(json.dumps({'queued':True,'request_id':rid,'note':'Not yet persisted. The controller returns publication receipts after this shell command ends. Reuse this request id after an uncertain result.'}))
