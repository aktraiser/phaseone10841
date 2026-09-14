"""Persistent admission reservations. Restarts do not reset rate or usage budgets."""
import math, os, sqlite3, threading, time
from dataclasses import dataclass, asdict

class RateLimited(ValueError):
    def __init__(self, message, retry_after=60):
        super().__init__(message);self.retry_after=max(1,math.ceil(retry_after))

@dataclass(frozen=True)
class Limits:
    ttl: int = 600
    idle: int = 120
    concurrent: int = 2
    per_access: int = 1
    starts_10m: int = 2
    starts_hour: int = 6
    minutes_hour: int = 60
    minutes_day: int = 120
    commands_minute: int = 12
    commands_visit: int = 64
    command_seconds: int = 30

    def __post_init__(self):
        for value in asdict(self).values():
            if type(value) is not int or value<1:raise ValueError('Limits must be positive integers')
        if not 60<=self.ttl<=600 or not 15<=self.idle<=self.ttl:raise ValueError('TTL must be 60..600 seconds; idle 15..TTL')
        if self.concurrent>20 or self.per_access>self.concurrent or self.command_seconds>30 or self.commands_visit>256:raise ValueError('Limits exceed supported bounds')
        if min(self.minutes_hour,self.minutes_day)*60<self.ttl:raise ValueError('Usage budget cannot fit one visit')

    @classmethod
    def from_env(cls):
        return cls(**{k:int(os.environ['PHASEONE_LIMIT_'+k.upper()]) for k in cls.__dataclass_fields__ if 'PHASEONE_LIMIT_'+k.upper() in os.environ})

class Ledger:
    def __init__(self,path,limits,clock=time.time):
        self.limits=limits;self.clock=clock;self.lock=threading.RLock()
        self.db=sqlite3.connect(path,check_same_thread=False,isolation_level=None)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA busy_timeout=5000')
        self.db.execute('CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, principal TEXT NOT NULL, created REAL NOT NULL, hold_until REAL NOT NULL, reserved INTEGER NOT NULL, state TEXT NOT NULL, sandbox TEXT)')
        self.db.execute('CREATE INDEX IF NOT EXISTS visits_created ON visits(created)')

    def reserve(self,vid,principal):
        now=self.clock();l=self.limits
        with self.lock:
            self.db.execute('BEGIN IMMEDIATE')
            try:
                self.db.execute("UPDATE visits SET state='expired' WHERE hold_until<=? AND state!='closed'",(now,))
                active=self.db.execute("SELECT principal,hold_until FROM visits WHERE state NOT IN ('closed','expired') AND hold_until>?",(now,)).fetchall()
                mine=[end for owner,end in active if owner==principal]
                if len(active)>=l.concurrent:raise RateLimited('Concurrent VM limit reached',min(x[1] for x in active)-now)
                if len(mine)>=l.per_access:raise RateLimited('One active visit per access limit reached',min(mine)-now)
                for window,maximum in [(600,l.starts_10m),(3600,l.starts_hour)]:
                    rows=self.db.execute('SELECT created FROM visits WHERE principal=? AND created>? ORDER BY created',(principal,now-window)).fetchall()
                    if len(rows)>=maximum:raise RateLimited('Visit creation rate exceeded',rows[0][0]+window-now)
                for window,minutes in [(3600,l.minutes_hour),(86400,l.minutes_day)]:
                    rows=self.db.execute('SELECT created,reserved FROM visits WHERE created>? ORDER BY created',(now-window,)).fetchall()
                    total=sum(x[1] for x in rows)
                    if total+l.ttl>minutes*60:
                        released=0;retry=window
                        for created,reserved in rows:
                            released+=reserved
                            if total-released+l.ttl<=minutes*60:retry=created+window-now;break
                        raise RateLimited('Global reserved VM time budget exhausted',retry)
                # Retain uncertain creates for a provider timeout plus the bounded create request.
                self.db.execute("INSERT INTO visits VALUES(?,?,?,?,?,'creating',NULL)",(vid,principal,now,now+l.ttl+30,l.ttl))
                self.db.execute('COMMIT')
            except BaseException:self.db.execute('ROLLBACK');raise
        return now

    def attached(self,vid,sandbox):
        with self.lock:self.db.execute("UPDATE visits SET sandbox=?,state='active' WHERE id=?",(sandbox,vid))
    def closed(self,vid):
        with self.lock:self.db.execute("UPDATE visits SET state='closed' WHERE id=?",(vid,))
    def pending(self):
        with self.lock:return self.db.execute("SELECT id,sandbox,hold_until FROM visits WHERE state NOT IN ('closed','expired') AND hold_until>?",(self.clock(),)).fetchall()
    def usage(self):
        now=self.clock()
        with self.lock:
            active=self.db.execute("SELECT count(*) FROM visits WHERE state NOT IN ('closed','expired') AND hold_until>?",(now,)).fetchone()[0]
            reserved=self.db.execute('SELECT coalesce(sum(reserved),0) FROM visits WHERE created>?',(now-86400,)).fetchone()[0]
        return {'active_or_uncertain':active,'reserved_vm_seconds_24h':reserved,'limits':asdict(self.limits)}
