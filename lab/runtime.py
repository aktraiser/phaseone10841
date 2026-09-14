"""Controlled Linux/KVM laboratory. No host-shell execution fallback."""
import hashlib, json, os, platform, secrets, signal, socket, subprocess, tempfile, threading, time
from pathlib import Path
from channel import Channel, valid_path
from wire import send, receive

class Visitor:
    def __init__(self, manager):
        self.manager = manager
        self.id = 'visitor-' + secrets.token_hex(8)
        self.token = secrets.token_urlsafe(32)
        self.created = time.time(); self.deadline = time.monotonic() + manager.ttl
        self.directory = Path(tempfile.mkdtemp(prefix='ph-', dir=manager.jobs))
        self.socket = self.directory / 'v.sock'
        self.lock = threading.Lock(); self.log_lock = threading.Lock()
        self.closed = False; self.calls = 0; self.channel_calls = 0
        self.bridge = None; self.process = None; self.log_file = None
        self.trace = manager.traces / (self.id + '.jsonl')
        config = {
            'boot-source': {'kernel_image_path': str(manager.kernel), 'boot_args': 'console=ttyS0 keep_bootcon reboot=k panic=1 pci=off ro root=/dev/vda init=/sbin/phaseone-init'},
            'drives': [{'drive_id': 'rootfs', 'path_on_host': str(manager.image), 'is_root_device': True, 'is_read_only': True}],
            'machine-config': {'vcpu_count': 1, 'mem_size_mib': 256},
            'vsock': {'guest_cid': 3, 'uds_path': str(self.socket)},
        }
        try:
            (self.directory / 'config.json').write_text(json.dumps(config))
            self.bridge = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.bridge.bind(str(self.socket) + '_5001'); self.bridge.listen(8); self.bridge.settimeout(.5)
            self.log_file = open(self.directory / 'console.log', 'wb')
            self.process = subprocess.Popen(['/usr/bin/timeout', '--signal=TERM', '--kill-after=2s', str(manager.ttl) + 's', str(manager.firecracker), '--no-api', '--config-file', str(self.directory / 'config.json')], stdin=subprocess.DEVNULL, stdout=self.log_file, stderr=subprocess.STDOUT, start_new_session=True)
            threading.Thread(target=self.serve_channel, daemon=True).start()
            until = min(self.deadline, time.monotonic() + 15)
            while True:
                if self.process.poll() is not None: raise RuntimeError('Firecracker exited during boot; inspect private console log')
                try:
                    if self.exchange({'op':'ping'}, timeout=.25).get('ready'): break
                except (OSError, ValueError):
                    if time.monotonic() >= until: raise RuntimeError('Guest boot timed out')
                    time.sleep(.05)
            self.event('start', {'rootfs_sha256': manager.image_hash, 'kernel_sha256': manager.kernel_hash, 'ttl_seconds': manager.ttl, 'network_interfaces': 0, 'vcpu': 1, 'memory_mib': 256})
            self.sync()
        except BaseException:
            self.close('boot_failed'); raise

    def event(self, kind, data):
        with self.log_lock:
            with open(self.trace, 'a') as f: f.write(json.dumps({'time':time.time(), 'visitor':self.id, 'event':kind, 'data':data}, ensure_ascii=True) + '\n')

    def exchange(self, request, timeout=35):
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout); sock.connect(str(self.socket)); sock.sendall(b'CONNECT 5000\n')
            line = bytearray()
            while not line.endswith(b'\n'):
                chunk = sock.recv(1)
                if not chunk or len(line) > 100: raise ValueError('Invalid vsock handshake')
                line.extend(chunk)
            if not line.startswith(b'OK '): raise ValueError('Guest not ready')
            send(sock, request); return receive(sock)

    def sync(self):
        snapshot = self.manager.channel.snapshot()
        result = self.exchange({'op':'sync', **snapshot})
        if not result.get('ok'): raise RuntimeError('Guest snapshot rejected')
        self.event('channel_snapshot', {**snapshot, 'files': [{k:v for k,v in f.items() if k!='content'} for f in snapshot['files']]})

    def execute(self, code, timeout_ms=20000):
        if not isinstance(code,str) or len(code.encode()) > 65536: raise ValueError('code must be a string up to 64 KiB')
        if type(timeout_ms) is not int or not 1 <= timeout_ms <= 30000: raise ValueError('timeout_ms must be 1..30000')
        if not self.lock.acquire(blocking=False): raise ValueError('A command is already running')
        try:
            if self.closed or time.monotonic() >= self.deadline: raise ValueError('Visit expired')
            if self.calls >= 64: raise ValueError('Visit command budget exhausted')
            self.calls += 1
            self.sync()
            rid = secrets.token_hex(16)
            self.event('command', {'request_id':rid,'code':code,'timeout_ms':timeout_ms})
            result = self.exchange({'op':'exec','protocol':1,'request_id':rid,'code':code,'timeout_ms':timeout_ms,'max_output_bytes':131072})
            if result.get('request_id') != rid: raise RuntimeError('Invalid guest response correlation')
            self.event('result', result)
            return result
        finally: self.lock.release()

    def serve_channel(self):
        while not self.closed:
            try: conn, _ = self.bridge.accept()
            except socket.timeout: continue
            except OSError: break
            with conn:
                conn.settimeout(5)
                try:
                    if self.closed or time.monotonic() >= self.deadline: raise ValueError('Visit expired')
                    self.channel_calls += 1
                    if self.channel_calls > 512: raise ValueError('Channel operation budget exhausted')
                    req = receive(conn); op = req.get('op')
                    if op == 'publish':
                        result = self.manager.channel.publish(self.id, req.get('path'), req.get('content'), req.get('request_id'))
                    elif op in ('list', 'read'):
                        snap = self.manager.channel.snapshot()
                        if op == 'list': result = {'revision':snap['revision'], 'files':[{k:v for k,v in x.items() if k!='content'} for x in snap['files']]}
                        else:
                            path = valid_path(req.get('path')); version = req.get('version')
                            if version is not None and type(version) is not int: raise ValueError('Invalid version')
                            with self.manager.channel.lock:
                                row = self.manager.channel.db.execute('SELECT content,id FROM versions WHERE path=? AND (? IS NULL OR id=?) ORDER BY id DESC LIMIT 1', (path,version,version)).fetchone()
                            if not row: raise ValueError('Not found')
                            result = {'content':row[0], 'id':row[1], 'path':path}
                    else: raise ValueError('Unknown channel operation')
                    self.event('channel_operation', {'request':req,'response':result})
                    send(conn,result)
                except (OSError,ValueError,TypeError,KeyError) as e:
                    try: send(conn,{'error':str(e)})
                    except OSError: pass

    def close(self, reason='ended'):
        if self.closed: return
        self.closed = True
        if self.process and self.process.poll() is None:
            try: os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            self.process.wait()
        if self.bridge: self.bridge.close()
        if self.log_file: self.log_file.close()
        self.event('end', {'reason':reason})
        # Only runtime files are ephemeral; controller traces and channel versions remain.
        import shutil
        if reason != 'boot_failed': shutil.rmtree(self.directory, ignore_errors=True)

class Manager:
    def __init__(self, *, firecracker, kernel, image, state, ttl=600, capacity=2, jobs='/tmp'):
        if platform.system() != 'Linux' or not os.access('/dev/kvm', os.R_OK|os.W_OK): raise RuntimeError('Linux and accessible /dev/kvm required; no host fallback')
        if not 10 <= ttl <= 600 or not 1 <= capacity <= 2: raise ValueError('Invalid lab limits')
        self.firecracker=Path(firecracker).resolve();self.kernel=Path(kernel).resolve();self.image=Path(image).resolve()
        for p in (self.firecracker,self.kernel,self.image):
            if not p.is_file(): raise ValueError('Missing operator-managed asset: ' + str(p))
        if not os.access(self.firecracker,os.X_OK): raise ValueError('Firecracker is not executable')
        if not Path('/usr/bin/timeout').is_file(): raise RuntimeError('coreutils timeout required')
        self.state=Path(state).resolve();self.state.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.traces=self.state/'traces';self.traces.mkdir(exist_ok=True,mode=0o700)
        self.jobs=Path(jobs).resolve();self.ttl=ttl;self.capacity=capacity
        self.image_hash=self.hash(self.image);self.kernel_hash=self.hash(self.kernel)
        self.channel=Channel(self.state/'channel.sqlite');self.visitors={};self.lock=threading.RLock();self.stopped=False
        threading.Thread(target=self.reap, daemon=True).start()

    @staticmethod
    def hash(path):
        h=hashlib.sha256()
        with open(path,'rb') as f:
            for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
        return h.hexdigest()

    def create(self):
        with self.lock:
            if self.stopped: raise ValueError('Controller stopped')
            if sum(not v.closed for v in self.visitors.values())>=self.capacity: raise ValueError('Lab capacity reached')
            # Bound retained session metadata too. Closed traces remain on disk.
            self.visitors={k:v for k,v in self.visitors.items() if not v.closed}
            visitor=Visitor(self);self.visitors[visitor.id]=visitor;return visitor

    def get(self, vid, token):
        with self.lock: visitor=self.visitors.get(vid)
        if not visitor or not secrets.compare_digest(visitor.token,token): raise ValueError('Unknown visit')
        return visitor

    def reap(self):
        while not self.stopped:
            with self.lock: visitors=list(self.visitors.values())
            for v in visitors:
                if not v.closed and (time.monotonic()>=v.deadline or v.process.poll() is not None): v.close('expired')
            time.sleep(.25)

    def close(self):
        self.stopped=True
        with self.lock:
            for v in self.visitors.values():v.close('controller_stopped')
