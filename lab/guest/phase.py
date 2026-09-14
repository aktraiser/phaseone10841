#!/usr/local/bin/python3
"""Guest-only channel primitives. No model credentials, no IP networking."""
import argparse, json, socket, sys, uuid
sys.path.insert(0, '/opt/phaseone')
from wire import send, receive

p = argparse.ArgumentParser(description='Read the live channel or explicitly publish a UTF-8 file. Nothing is published automatically.')
s = p.add_subparsers(dest='op', required=True)
s.add_parser('list')
r = s.add_parser('read'); r.add_argument('path'); r.add_argument('--version', type=int)
w = s.add_parser('publish'); w.add_argument('source'); w.add_argument('path'); w.add_argument('--request-id', default=None)
a = p.parse_args()
request = {'op': a.op}
if a.op == 'publish':
    with open(a.source, 'rb') as f: content = f.read(32769)
    if len(content) > 32768: p.error('File exceeds 32768 bytes')
    request.update(path=a.path, content=content.decode('utf-8'), request_id=a.request_id or uuid.uuid4().hex)
    print('request_id=' + request['request_id'], file=sys.stderr)
elif a.op == 'read':
    request.update(path=a.path, version=a.version)
with socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM) as sock:
    sock.settimeout(10)
    sock.connect((2, 5001))
    send(sock, request)
    result = receive(sock)
if result.get('error'):
    print(result['error'], file=sys.stderr); sys.exit(1)
if a.op == 'read': print(result['content'], end='')
else: print(json.dumps(result, ensure_ascii=False, indent=2))
