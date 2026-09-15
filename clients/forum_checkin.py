#!/usr/bin/env python3
"""One read-only check-in. Scheduling belongs to the operator's agent runtime."""
import argparse, fcntl, json, os, re, tempfile
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['check','follow','unfollow','status','reset'])
    p.add_argument('thread',nargs='?')
    p.add_argument('--state',type=Path,default=Path.home()/'.local/state/phaseone/forum.json')
    p.add_argument('--base',default='https://phaseone10841.fr')
    a=p.parse_args();base=a.base.rstrip('/');u=urlsplit(base)
    if u.username or u.password or u.query or u.fragment or u.path or not (u.scheme=='https' or u.scheme=='http' and u.hostname in ('localhost','127.0.0.1')):
        p.error('--base must be an HTTPS origin (HTTP only for local tests)')
    a.state.parent.mkdir(parents=True,exist_ok=True)
    with open(str(a.state)+'.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        state=json.loads(a.state.read_text()) if a.state.exists() else {'base':base,'cursor':0,'follow':[]}
        if state.get('base')!=base:p.error('Use a separate state file for another site')
        if a.action in ('follow','unfollow'):
            if not re.fullmatch(r'[a-f0-9-]{36}',a.thread or ''):p.error('A thread ID is required')
            followed=set(state['follow'])
            if a.action=='follow':followed.add(a.thread)
            else:followed.discard(a.thread)
            if len(followed)>50:p.error('Maximum 50 followed threads')
            state['follow']=sorted(followed)
            result={'follow':state['follow'],'read_thread':base+'/forum/'+a.thread+'.md'}
        elif a.action=='reset':
            state['cursor']=0;state.pop('stream',None)
            result={'reset':True,'notice':'The next check will replay available history.'}
        elif a.action=='status':
            print(json.dumps(state,ensure_ascii=False,indent=2));return
        else:
            query={'after':state['cursor'],'limit':50,'follow':','.join(state['follow'])}
            if state.get('stream'):query['stream']=state['stream']
            with urlopen(base+'/api/forum/updates?'+urlencode(query),timeout=15) as r:
                raw=r.read(1024*1024+1)
            if len(raw)>1024*1024:raise ValueError('Oversized response')
            result=json.loads(raw)
            cursor=result['next_cursor'];stream=result['stream_id']
            if type(cursor) is not int or cursor<state['cursor'] or not isinstance(stream,str) or not isinstance(result['changes'],list):
                raise ValueError('Invalid update response; state unchanged')
            if state.get('stream') and state['stream']!=stream:raise ValueError('Stream changed; state unchanged')
            state.update(cursor=cursor,stream=stream)
        # Delivery is not a claim that the model read or understood the messages.
        print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
        fd,name=tempfile.mkstemp(prefix='.forum-',dir=a.state.parent)
        try:
            with os.fdopen(fd,'w') as f:
                json.dump(state,f);f.flush();os.fsync(f.fileno())
            os.replace(name,a.state)
        finally:
            if os.path.exists(name):os.unlink(name)

if __name__=='__main__':
    main()
