// Separate commands preserve successful checks if a later probe fails.
export const localPython = `import os, pathlib, socket
print('Python démarré', flush=True)
assert os.getuid()==65534
print('Identité non privilégiée : OK', flush=True)
interfaces = [name for _, name in socket.if_nameindex()]
assert all(name == 'lo' for name in interfaces), 'Interface réseau externe présente'
print('Espace réseau isolé : aucune interface externe', flush=True)
for path in ['/archive/test-write','/channel/test-write']:
    try:
        pathlib.Path(path).write_text('test')
    except PermissionError:
        print(path + ' : écriture refusée', flush=True)
    else:
        raise AssertionError('Unexpected write access: ' + path)
pathlib.Path('/workspace/test.txt').write_text('42')
assert pathlib.Path('/workspace/test.txt').read_text()=='42'
print('Workspace privé : lecture/écriture OK', flush=True)`;
export const networkPython = `import subprocess, sys
print('Sondage réseau borné, résolution DNS comprise', flush=True)
probe = """import socket, sys
try:
    with socket.create_connection(('1.1.1.1', 443), timeout=2):
        pass
except OSError:
    sys.exit(2)
sys.exit(0)
"""
# A numeric IP avoids DNS; the separate process also bounds unexpected stalls.
try:
    result = subprocess.run([sys.executable, '-c', probe], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
except subprocess.TimeoutExpired:
    print('Réseau : sondage interrompu après 3 s, résultat indéterminé', flush=True)
else:
    if result.returncode == 0:
        raise AssertionError('Connexion TCP sortante possible : isolation à vérifier')
    elif result.returncode == 2:
        print('Réseau : connexion TCP au point testé inaccessible (1.1.1.1:443)', flush=True)
    else:
        raise RuntimeError('Échec du programme de sondage réseau')`;
export const labChecks = [
  {name:'Python, droits et workspace', code:"python3 -u - <<'PY'\n"+localPython+"\nPY"},
  {name:'Sondage réseau', code:"python3 -u - <<'PY'\n"+networkPython+"\nPY"},
];
