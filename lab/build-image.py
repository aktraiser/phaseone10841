#!/usr/bin/env python3
"""Build a separate PHASEONE rootfs from an operator-trusted ext4 Python image."""
import argparse, hashlib, os, pathlib, shutil, subprocess, tempfile
p=argparse.ArgumentParser();p.add_argument('base_image');p.add_argument('output');a=p.parse_args()
base=pathlib.Path(a.base_image).resolve();output=pathlib.Path(a.output).resolve()
if output.exists():raise SystemExit('Output exists; choose a new image path')
root=pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='phaseone-image-') as tmp:
    staging=pathlib.Path(tmp)/'root';staging.mkdir()
    # debugfs paths are operator-controlled; disallow its quoting/control syntax.
    if any(c in str(staging) for c in ('"','\n','\\')):raise SystemExit('Unsupported temporary path')
    result = subprocess.run(['debugfs','-R',f'rdump / "{staging}"',str(base)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
    unexpected=[line for line in result.stderr.splitlines() if line and not line.startswith('debugfs ') and 'while changing ownership of ' not in line]
    if unexpected:raise SystemExit('Image extraction failed: '+ '\n'.join(unexpected[:10]))
    if 'while changing ownership of ' in result.stderr:print('Image extracted without preserving original ownership (unprivileged builder).')
    for name in ['archive','channel','workspace','tools','opt/phaseone','proc','sys','dev','tmp']:(staging/name).mkdir(parents=True,exist_ok=True)
    for src,dest in [(root/'guest/broker.py','opt/phaseone/broker.py'),(root/'wire.py','opt/phaseone/wire.py'),(root/'guest/phase.py','tools/phase'),(root/'guest/init.sh','sbin/phaseone-init'),(root/'guest/README.txt','README')]:
        shutil.copyfile(src,staging/dest);(staging/dest).chmod(0o755 if dest in ('tools/phase','sbin/phaseone-init') else 0o644)
    (staging/'etc/phaseone-guest').write_text('protocol=1\n')
    archive=root.parent/'public'
    for src in archive.rglob('*'):
        if src.is_file() and src.suffix in ('.md','.json'):
            dest=staging/'archive'/src.relative_to(archive);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest);dest.chmod(0o444)
    for dest in staging.rglob('*'):
        if not dest.is_symlink() and dest.is_file():dest.chmod(dest.stat().st_mode & ~0o6000)
    with open(output,'xb') as f:f.truncate(384*1024*1024)
    subprocess.run(['mkfs.ext4','-q','-F','-O','^metadata_csum_seed','-d',str(staging),str(output)],check=True)
output.chmod(0o444)
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1048576),b''):h.update(block)
    return h.hexdigest()
import json
manifest={'base_sha256':digest(base),'image_sha256':digest(output),'guest_files':{str(f.relative_to(root)):digest(f) for f in sorted((root/'guest').glob('*')) if f.is_file()},'wire_sha256':digest(root/'wire.py'),'archive_files':{str(f.relative_to(archive)):digest(f) for f in sorted(archive.rglob('*')) if f.is_file() and f.suffix in ('.md','.json')}}
output.with_suffix(output.suffix+'.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'image':str(output),'sha256':manifest['image_sha256']}))
