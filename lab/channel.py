"""Versioned, bounded shared text files. Guest paths never become host paths."""
import hashlib, json, re, sqlite3, threading, time
from pathlib import Path

MAX_FILE = 32768
MAX_FILES = 128
MAX_VERSIONS = 2048

def valid_path(path):
    if not isinstance(path, str) or not 1 <= len(path) <= 200:
        raise ValueError('Invalid channel path')
    parts = path.split('/')
    if len(parts) > 8 or any(p in ('', '.', '..') or not re.fullmatch(r'[A-Za-z0-9_.-]+', p) for p in parts):
        raise ValueError('Use a relative path with letters, digits, dot, underscore or hyphen')
    return path

class Channel:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS versions (id INTEGER PRIMARY KEY, path TEXT NOT NULL, content TEXT NOT NULL, sha256 TEXT NOT NULL, visitor TEXT NOT NULL, request_id TEXT NOT NULL, created REAL NOT NULL, UNIQUE(visitor, request_id))')
        self.db.commit()
        self.lock = threading.RLock()

    def publish(self, visitor, path, content, request_id):
        valid_path(path)
        if not isinstance(content, str) or len(content.encode()) > MAX_FILE or '\x00' in content:
            raise ValueError('Expected UTF-8 text up to 32768 bytes, without NUL')
        if not isinstance(request_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', request_id):
            raise ValueError('Invalid request_id')
        digest = hashlib.sha256(content.encode()).hexdigest()
        with self.lock:
            old = self.db.execute('SELECT id,path,sha256 FROM versions WHERE visitor=? AND request_id=?', (visitor, request_id)).fetchone()
            if old:
                if old[1:] != (path, digest):
                    raise ValueError('Idempotency conflict')
                return {'id': old[0], 'path': path, 'sha256': digest, 'replayed': True}
            names = [r[0] for r in self.db.execute('SELECT DISTINCT path FROM versions')]
            if any(p != path and (p.startswith(path + '/') or path.startswith(p + '/')) for p in names):
                raise ValueError('File/directory conflict')
            if path not in names and len(names) >= MAX_FILES:
                raise ValueError('Channel file capacity reached')
            if self.db.execute('SELECT count(*) FROM versions').fetchone()[0] >= MAX_VERSIONS:
                raise ValueError('Channel version capacity reached')
            row = self.db.execute('INSERT INTO versions(path,content,sha256,visitor,request_id,created) VALUES(?,?,?,?,?,?)', (path,content,digest,visitor,request_id,time.time()))
            self.db.commit()
            return {'id': row.lastrowid, 'path': path, 'sha256': digest, 'replayed': False}

    def snapshot(self):
        with self.lock:
            self.db.row_factory = sqlite3.Row
            rows = self.db.execute('SELECT * FROM versions WHERE id IN (SELECT max(id) FROM versions GROUP BY path) ORDER BY path').fetchall()
            files = [dict(r) for r in rows]
            self.db.row_factory = None
            for item in files:
                item.pop('request_id')
            fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
            return {'revision': max([x['id'] for x in files], default=0), 'sha256': fingerprint, 'files': files}
