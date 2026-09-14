"""Operator-supplied guest setup. No network dependency installation."""
import json,os,stat,subprocess,sys
from pathlib import Path
bundle=json.loads(Path('/opt/phaseone/bundle.json').read_text())
for directory in ('/archive','/channel','/workspace','/tools','/var/lib/phaseone-outbox'):
    Path(directory).mkdir(parents=True,exist_ok=True)
for path,content in bundle.items():
    p=Path(path)
    if not (path.startswith('/archive/') or path.startswith('/opt/phaseone/') or path in ('/tools/phase','/README')):raise ValueError('Unexpected setup path')
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content);p.chmod(0o755 if path=='/tools/phase' else 0o444)
# Fail preparation if the template cannot isolate the command child.
subprocess.run([sys.executable, '-c', "import sys; sys.path.insert(0, '/opt/phaseone'); from execute import isolate_network; isolate_network()"], check=True)
# An unprivileged workload never receives sudo/setuid capabilities from the base image.
subprocess.run(['find','/usr','/bin','/sbin','-xdev','-type','f','-perm','/6000','-exec','chmod','a-s','{}','+'],check=True)
subprocess.run(['mount','-t','tmpfs','-o','size=64m,nosuid,nodev,uid=65534,gid=65534,mode=0700','tmpfs','/workspace'],check=True)
Path('/opt/phaseone').chmod(0o755)
Path('/var/lib/phaseone-outbox').chmod(0o700);os.chown('/var/lib/phaseone-outbox',65534,65534)
Path('/opt/phaseone/ready').touch()
Path('/opt/phaseone/bundle.json').unlink()
print('{"ready":true}')
