#!/usr/bin/env python3
"""Refuse to silently reuse a rootfs built with different guest code or archives."""
import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parent
image=Path(sys.argv[1]);manifest=json.loads(image.with_suffix(image.suffix+'.manifest.json').read_text())
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
if digest(image)!=manifest['image_sha256']:raise SystemExit('Rootfs hash mismatch')
for name,value in manifest['guest_files'].items():
    if digest(root/name)!=value:raise SystemExit('Guest changed; build a new rootfs: '+name)
if digest(root/'wire.py')!=manifest['wire_sha256']:raise SystemExit('Guest protocol changed; build a new rootfs')
archive=root.parent/'public'
current={str(f.relative_to(archive)):digest(f) for f in sorted(archive.rglob('*')) if f.is_file() and f.suffix in ('.md','.json')}
if current!=manifest['archive_files']:raise SystemExit('Archives changed; build a new rootfs')
print('Rootfs, guest code and archive manifest match.')
