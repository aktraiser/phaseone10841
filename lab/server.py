#!/usr/bin/env python3
"""Private loopback laboratory API. Use an SSH tunnel; not a public tenant service."""
import hmac, json, os, signal, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from runtime import Manager

def main():
    os.umask(0o077)
    key=os.environ.get('PHASEONE_LAB_KEY','')
    if len(key)<32: raise SystemExit('Set a private PHASEONE_LAB_KEY of at least 32 characters')
    if os.environ.get('PHASEONE_LAB_MODE')!='controlled': raise SystemExit('Set PHASEONE_LAB_MODE=controlled; public multi-tenant isolation is not qualified')
    manager=Manager(firecracker=os.environ['FIRECRACKER_BIN'],kernel=os.environ['KERNEL_PATH'],image=os.environ['ROOTFS_PATH'],state=os.environ['PHASEONE_LAB_STATE'])
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):self.handle_request()
        def do_POST(self):self.handle_request()
        def handle_request(self):
            self.connection.settimeout(40)
            if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+key):return self.reply(401,{'error':'Unauthorized'})
            try:
                if self.headers.get('Transfer-Encoding'):raise ValueError('Chunked requests unsupported')
                size=int(self.headers.get('Content-Length','0'))
                if not 0<=size<=400000:raise ValueError('Request too large')
                body=json.loads(self.rfile.read(size)) if size else {}
                if not isinstance(body,dict):raise ValueError('Expected JSON object')
                if self.command=='GET' and self.path=='/health':return self.reply(200,{'backend':'firecracker','mode':'controlled','network_interfaces':0,'ttl_seconds':manager.ttl})
                if self.command=='GET' and self.path=='/channel':return self.reply(200,manager.channel.snapshot())
                if self.command=='POST' and self.path=='/visits':
                    v=manager.create();return self.reply(201,{'id':v.id,'token':v.token,'expires_at':v.created+manager.ttl,'instructions':'Read /README. No publication is required.'})
                parts=self.path.strip('/').split('/')
                if self.command=='POST' and len(parts)==3 and parts[0]=='visits':
                    v=manager.get(parts[1],self.headers.get('X-Visit-Token',''))
                    if parts[2]=='exec':return self.reply(200,v.execute(body.get('code'),body.get('timeout_ms',20000)))
                    if parts[2]=='close':v.close();return self.reply(200,{'closed':True})
                return self.reply(404,{'error':'Not found'})
            except (ValueError,TypeError,KeyError) as e:self.reply(400,{'error':str(e)})
            except Exception as e:
                print(type(e).__name__+': '+str(e),flush=True)
                self.reply(503,{'error':'Lab unavailable; inspect private controller logs'})
        def reply(self,status,value):
            data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    server=ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PHASEONE_LAB_PORT','18081'))),Handler)
    def stop(*_):threading.Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    print('PHASEONE controlled Firecracker lab on 127.0.0.1:'+str(server.server_port),flush=True)
    try:server.serve_forever()
    finally:server.server_close();manager.close()
if __name__=='__main__':main()
