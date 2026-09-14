#!/usr/bin/env python3
"""Start the qualified, existing sibling Lima lab; no cloud provisioning or model calls."""
import argparse, json, os, secrets, subprocess, tarfile, urllib.request, time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('action',choices=['start','status','stop']);a=p.parse_args()
root=Path(__file__).resolve().parent.parent;workspace=root.parent
lima=workspace/'firecracker-sdk/local/tools/bin/limactl';lima_home=workspace/'.fc-lima'
local=root/'lab/.local';local.mkdir(exist_ok=True,mode=0o700);os.umask(0o077)
env={**os.environ,'LIMA_HOME':str(lima_home)}
def run(*args):return subprocess.run([str(lima),*args],env=env,check=True,timeout=120)
key_file=local/'key'
if a.action=='start' and not key_file.exists():key_file.write_text(secrets.token_urlsafe(32)+'\n');key_file.chmod(0o600)
def healthy():
    if not key_file.exists():return False
    try:
        request=urllib.request.Request('http://127.0.0.1:18081/health',headers={'Authorization':'Bearer '+key_file.read_text().strip()})
        with urllib.request.urlopen(request,timeout=2) as r:return json.load(r).get('backend')=='firecracker'
    except Exception:return False
if a.action=='status':print(json.dumps({'ready':healthy(),'mode':'controlled-local','public':False}));raise SystemExit()
if not lima.is_file():raise SystemExit('Existing sibling Lima installation not found; use the Linux instructions in lab/README.md')
if a.action=='stop':
    run('shell','dasein-kvm','--','bash','-lc',r'''set -eu
f="$HOME/phaseone-lab-20260914/server.pid"
if test -f "$f"; then
 p=$(cat "$f")
 if test -r "/proc/$p/cmdline" && tr '\0' ' ' < "/proc/$p/cmdline" | grep -q 'phaseone-lab-20260914/lab/server.py'; then kill "$p"; fi
fi
''')
    pid_file=local/'tunnel.pid'
    if pid_file.exists():
        pid=int(pid_file.read_text())
        # A stale PID must not cause an unrelated process to be killed.
        result=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True)
        if '127.0.0.1:18081:127.0.0.1:18081' in result.stdout:os.kill(pid,15)
    print('PHASEONE controller stopped; shared Lima VM left running.');raise SystemExit()
if healthy():print('PHASEONE local lab already ready.');raise SystemExit()
run('start','dasein-kvm','--tty=false')
archive=local/'source.tar'
with tarfile.open(archive,'w') as t:
    for directory in ('lab','public'):
        for f in (root/directory).rglob('*'):
            if f.is_file() and '.local' not in f.parts and '__pycache__' not in f.parts:t.add(f,arcname=str(f.relative_to(root)))
run('copy',str(archive),'dasein-kvm:/tmp/phaseone-lab-source.tar')
run('copy',str(key_file),'dasein-kvm:/tmp/phaseone-lab-key')
run('shell','dasein-kvm','--','bash','-lc',r'''set -eu
umask 077
base="$HOME/phaseone-lab-20260914"
mkdir -p "$base"
cd "$base"
if test -f server.pid && kill -0 "$(cat server.pid)" 2>/dev/null; then
 echo 'Controller already present; stop it before updating.' >&2
 exit 1
fi
tar -xf /tmp/phaseone-lab-source.tar
install -m 600 /tmp/phaseone-lab-key key
rm /tmp/phaseone-lab-key
if ! test -f rootfs.ext4; then python3 lab/build-image.py "$HOME/fc/assets/rootfs-v2.ext4" "$base/rootfs.ext4"; fi
python3 lab/check-image.py "$base/rootfs.ext4"
export PHASEONE_LAB_MODE=controlled PHASEONE_LAB_STATE="$base/state" PHASEONE_LAB_PORT=18081
export PHASEONE_LAB_KEY="$(cat key)"
export FIRECRACKER_BIN="$HOME/fc/assets/firecracker" KERNEL_PATH="$HOME/fc/assets/vmlinux" ROOTFS_PATH="$base/rootfs.ext4"
nohup python3 "$base/lab/server.py" > server.log 2>&1 < /dev/null &
echo $! > server.pid
''')
with open(local/'tunnel.log','ab') as log:
    tunnel=subprocess.Popen(['ssh','-F',str(lima_home/'dasein-kvm/ssh.config'),'-o','ControlMaster=no','-o','ControlPath=none','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-N','-L','127.0.0.1:18081:127.0.0.1:18081','lima-dasein-kvm'],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
(local/'tunnel.pid').write_text(str(tunnel.pid))
for _ in range(40):
    if healthy():
        print('PHASEONE local lab ready on 127.0.0.1:18081. No microVM or model call starts until requested.');break
    if tunnel.poll() is not None:raise SystemExit('Tunnel failed; inspect lab/.local/tunnel.log')
    time.sleep(.25)
else:
    tunnel.terminate();raise SystemExit('Controller not ready; inspect the Linux server.log')
(local/'mcp.json').write_text(json.dumps({'mcpServers':{'phaseone-lab':{'command':'python3','args':[str(root/'lab/local-mcp.py')]}}},indent=2)+'\n')
