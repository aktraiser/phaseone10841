"""Trusted root-side bounded guest file operations; never executes submitted code."""
import json,os,re,shutil,stat,sys
from pathlib import Path
root=Path('/opt/phaseone')
def valid(path):
    if not isinstance(path,str) or not 1<=len(path)<=200 or any(x in ('','.','..') or not re.fullmatch(r'[A-Za-z0-9_.-]+',x) for x in path.split('/')):raise ValueError('Invalid path')
    return path
op=sys.argv[1]
if op=='sync':
    snapshot=json.loads((root/'snapshot.json').read_text())
    for child in Path('/channel').iterdir():
        if child.is_dir():shutil.rmtree(child)
        else:child.unlink()
    for item in snapshot['files']:
        p=Path('/channel')/valid(item['path']);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(item['content']);p.chmod(0o444)
    print(json.dumps({'ok':True,'revision':snapshot['revision']}))
elif op=='outbox':
    result=[]
    for p in sorted(Path('/var/lib/phaseone-outbox').iterdir())[:32]:
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}\.json',p.name):continue
        try:
            fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
            with os.fdopen(fd,'rb') as f:
                info=os.fstat(f.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_size>200000:continue
                data=f.read(200001)
            if len(data)>200000:continue
            item=json.loads(data)
            if not isinstance(item,dict) or item.get('request_id')!=p.stem:continue
            result.append(item)
        except (OSError,ValueError):continue
    print(json.dumps({'requests':result}))
elif op=='ack':
    for rid in json.loads((root/'ack.json').read_text()):
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',rid):raise ValueError('Invalid request id')
        (Path('/var/lib/phaseone-outbox')/(rid+'.json')).unlink(missing_ok=True)
    print('{"ok":true}')
else:raise ValueError('Unknown operation')
