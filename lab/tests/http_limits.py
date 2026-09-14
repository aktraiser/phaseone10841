"""Actual HTTP admission/rate responses with a fake E2B SDK; no provider calls."""
import json,os,secrets,socket,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='phaseone-http-rate-') as state:
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    key=secrets.token_urlsafe(32)
    env={**os.environ,'PHASEONE_LAB_BACKEND':'e2b','PHASEONE_LAB_MODE':'controlled','PHASEONE_LAB_STATE':state,'PHASEONE_LAB_PORT':str(port),'PHASEONE_LAB_KEY':key,'E2B_API_KEY':'fake-only','PHASEONE_LIMIT_COMMANDS_MINUTE':'2'}
    env.pop('PHASEONE_ACCESS_KEYS_FILE',None)
    script=f"import sys,types;sys.path[:0]=[{str(root)!r},{str(root/'tests')!r}];from test_e2b import Factory;sys.modules['e2b']=types.SimpleNamespace(Sandbox=Factory());import server;server.main()"
    proc=subprocess.Popen([sys.executable,'-c',script],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    url=f'http://127.0.0.1:{port}';token=None
    def request(path,body=None,authorized=True):
        headers={'Content-Type':'application/json'}
        if authorized:headers['Authorization']='Bearer '+key
        if token:headers['X-Visit-Token']=token
        req=urllib.request.Request(url+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,r.headers,json.load(r)
        except urllib.error.HTTPError as r:return r.code,r.headers,json.load(r)
    try:
        until=time.monotonic()+10
        while True:
            try:
                if request('/health')[0]==200:break
            except urllib.error.URLError:pass
            if proc.poll() is not None:raise AssertionError(proc.stderr.read().decode())
            if time.monotonic()>until:raise AssertionError('Server did not start')
            time.sleep(.1)
        assert request('/health',authorized=False)[0]==401
        status,_,visit=request('/visits',{});assert status==201,visit;token=visit['token'];vid=visit['id']
        status,headers,_=request('/visits',{});assert status==429 and int(headers['Retry-After'])>0
        for _ in range(2):assert request('/visits/'+vid+'/exec',{'code':'ls'})[0]==200
        status,headers,body=request('/visits/'+vid+'/exec',{'code':'ls'});assert status==429 and body['retry_after']==int(headers['Retry-After'])
        assert request('/usage')[2]['reserved_vm_seconds_24h']==600
        assert request('/visits/'+vid+'/close',{})[0]==200
        assert request('/usage')[2]['active_or_uncertain']==0
        print(json.dumps({'http_429':True,'retry_after':True,'authenticated_access':True,'persistent_reservations':True,'provider_calls':0}))
    finally:
        proc.terminate()
        try:proc.wait(timeout=10)
        except subprocess.TimeoutExpired:proc.kill();proc.wait()
