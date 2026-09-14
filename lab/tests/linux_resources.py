import json, pathlib, subprocess, sys
root=pathlib.Path('/opt/phaseone');root.mkdir(parents=True,exist_ok=True)
source=pathlib.Path('/source')
# This local test concerns resource limits only. Docker itself has no network.
# Do not alter the production namespace preflight to fit Docker's dormant tunnels.
code=(source/'execute.py').read_text()+'\n\ndef isolate_network():\n    pass  # LOCAL RESOURCE TEST ONLY\n'
(root/'bundle.json').write_text(json.dumps({'/opt/phaseone/execute.py':code}))
subprocess.run([sys.executable,str(source/'setup.py')],check=True)
sys.path.insert(0,str(root));from execute import execute
checks={
'memory':"python3 -c 'a=bytearray(300*1024*1024)'",
'disk':'''python3 - <<'P'
import errno,os,pathlib
for directory,cap in [('/workspace',64),('/tmp',32),('/var/tmp',32),('/dev/shm',16),('/var/lib/phaseone-outbox',8)]:
    info=os.statvfs(directory)
    assert info.f_blocks*info.f_frsize <= cap*1024*1024
    assert info.f_files <= 4096
p=pathlib.Path('/tmp/fill');p.mkdir()
try:
    try:
        for i in range(40):
            (p/str(i)).write_bytes(b'x'*(1024*1024))
    except OSError as e:
        assert e.errno==errno.ENOSPC, e
        print('disk quota blocks writes')
    else:raise AssertionError('disk quota absent')
finally:
    for f in p.iterdir():f.unlink()
    p.rmdir()
P''',
'output':"python3 -c 'print(\"x\"*100000)'",
}
for name,command in checks.items():
    r=execute({'protocol':1,'request_id':name,'code':command,'timeout_ms':10000,'max_output_bytes':8192})
    if name=='memory':assert 'MemoryError' in r['stderr'],r
    if name=='disk':assert r['exit_code']==0 and 'blocks writes' in r['stdout'],r
    if name=='output':assert r['error']=='output limit exceeded',r
    print(name+': PASS')
