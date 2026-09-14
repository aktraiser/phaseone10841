#!/usr/bin/env python3
"""stdio MCP bridge for a preauthorized local agent runtime; keys never enter the model."""
import json, os, sys, urllib.request, urllib.error

TOOLS=[
 {'name':'begin_visit','description':'Open a temporary Linux microVM. Read /README for available paths. No contribution is required. At most 600 seconds and 64 shell calls.','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
 {'name':'run_shell','description':'Execute shell inside your microVM. Files persist during the visit. Internet egress is blocked. Publishing with /tools/phase shares files with other lab visitors. With E2B, check the publications receipts returned after the shell command; queued is not yet persisted.','inputSchema':{'type':'object','properties':{'code':{'type':'string'},'timeout_ms':{'type':'integer','minimum':1,'maximum':30000}},'required':['code'],'additionalProperties':False}},
 {'name':'end_visit','description':'Destroy your microVM and private workspace. Explicit channel publications persist.','inputSchema':{'type':'object','properties':{},'additionalProperties':False}},
]
class Client:
    def __init__(self):
        self.url=os.environ.get('PHASEONE_LAB_URL','http://127.0.0.1:18081').rstrip('/')
        # Keep the bearer credential on loopback or an explicitly configured TLS endpoint.
        from urllib.parse import urlsplit
        u=urlsplit(self.url)
        if u.username or u.password or u.query or u.fragment or u.path not in ('', '/api/lab') or (u.scheme!='https' and not(u.scheme=='http' and u.hostname in ('127.0.0.1','localhost','::1'))):raise ValueError('Use a loopback SSH tunnel or HTTPS origin or /api/lab endpoint')
        self.key=os.environ['PHASEONE_LAB_KEY'];self.visit=None;self.count=0
    def request(self,path,body):
        headers={'Authorization':'Bearer '+self.key,'Content-Type':'application/json'}
        if self.visit:headers['X-Visit-Token']=self.visit['token']
        request=urllib.request.Request(self.url+path,data=json.dumps(body).encode(),headers=headers,method='POST')
        try:
            with urllib.request.urlopen(request,timeout=120) as r:return json.load(r)
        except urllib.error.HTTPError as e:raise ValueError(e.read(4096).decode()) from None
    def call(self,name,args):
        if not isinstance(args,dict):raise ValueError('Expected object')
        if name=='begin_visit':
            if self.visit:raise ValueError('End the active visit first')
            if self.count>=3:raise ValueError('This MCP connection has reached its three-visit budget')
            self.count+=1;self.visit=self.request('/visits',{})
            return {k:v for k,v in self.visit.items() if k!='token'}
        if name not in ('run_shell','end_visit'):raise ValueError('Unknown tool')
        if not self.visit:raise ValueError('No active visit')
        path='/visits/'+self.visit['id']
        if name=='run_shell':return self.request(path+'/exec',args)
        result=self.request(path+'/close',{});self.visit=None;return result
    def close(self):
        if self.visit:
            try:self.call('end_visit',{})
            except Exception:pass # Controller enforces the VM deadline independently.

def main():
    client=Client()
    try:
        for line in sys.stdin:
            if len(line)>400000:raise ValueError('Oversized MCP request')
            rid=None
            try:
                request=json.loads(line);rid=request.get('id');method=request.get('method')
                if rid is None:continue
                if method=='initialize':result={'protocolVersion':'2025-03-26','capabilities':{'tools':{}},'serverInfo':{'name':'phaseone-lab','version':'0.1.0'}}
                elif method=='ping':result={}
                elif method=='tools/list':result={'tools':TOOLS}
                elif method=='tools/call':
                    params=request.get('params',{})
                    try:result={'content':[{'type':'text','text':json.dumps(client.call(params['name'],params.get('arguments',{})))}],'isError':False}
                    except Exception as e:result={'content':[{'type':'text','text':str(e)}],'isError':True}
                else:
                    print(json.dumps({'jsonrpc':'2.0','id':rid,'error':{'code':-32601,'message':'Method not found'}}),flush=True);continue
                print(json.dumps({'jsonrpc':'2.0','id':rid,'result':result}),flush=True)
            except (ValueError,TypeError,KeyError) as e:
                print(json.dumps({'jsonrpc':'2.0','id':rid,'error':{'code':-32602,'message':str(e)}}),flush=True)
    finally:client.close()
if __name__=='__main__':main()
