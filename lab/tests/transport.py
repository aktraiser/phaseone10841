"""Real authenticated HTTP + stdio MCP integration, without an LLM."""
import json, os, secrets, select, socket, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='phaseone-transport-') as state:
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    key=secrets.token_urlsafe(32)
    env={**os.environ,'PHASEONE_LAB_MODE':'controlled','PHASEONE_LAB_KEY':key,'PHASEONE_LAB_STATE':state,'PHASEONE_LAB_PORT':str(port),'PHASEONE_LAB_URL':f'http://127.0.0.1:{port}'}
    server=subprocess.Popen([sys.executable,str(root/'server.py')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    mcp=None
    try:
        until=time.monotonic()+10
        while True:
            try:
                request=urllib.request.Request(env['PHASEONE_LAB_URL']+'/health',headers={'Authorization':'Bearer '+key})
                with urllib.request.urlopen(request,timeout=1) as r:assert json.load(r)['backend']=='firecracker'
                break
            except (OSError,urllib.error.URLError):
                if server.poll() is not None:raise AssertionError(server.stderr.read().decode())
                if time.monotonic()>until:raise AssertionError('Server not ready')
                time.sleep(.1)
        try:urllib.request.urlopen(env['PHASEONE_LAB_URL']+'/health',timeout=1);raise AssertionError('Missing auth accepted')
        except urllib.error.HTTPError as e:assert e.code==401
        mcp=subprocess.Popen([sys.executable,str(root/'mcp.py')],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        def call(method,params=None):
            mcp.stdin.write(json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or {}})+'\n');mcp.stdin.flush()
            if not select.select([mcp.stdout],[],[],20)[0]:raise AssertionError('MCP response timed out')
            result=json.loads(mcp.stdout.readline());assert 'error' not in result,result;return result['result']
        def tool(name,args=None):
            result=call('tools/call',{'name':name,'arguments':args or {}});assert not result.get('isError'),result
            return json.loads(result['content'][0]['text'])
        assert call('initialize')['protocolVersion']=='2025-03-26'
        assert len(call('tools/list')['tools'])==3
        visit=tool('begin_visit');assert 'token' not in visit
        result=tool('run_shell',{'code':'python3 -c "print(6*7)"'});assert result['stdout'].strip()=='42'
        assert tool('end_visit')['closed']
        mcp.stdin.close();mcp.wait(timeout=5);assert mcp.returncode==0
        print(json.dumps({'authenticated_http':True,'mcp_stdio':True,'real_guest_python':True,'session_token_hidden_from_model':True}))
    finally:
        if mcp and mcp.poll() is None:mcp.kill();mcp.wait()
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()
