import json,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from e2b_runtime import E2BManager
from limits import Limits,RateLimited
class Files:
    def __init__(self):self.data={}
    def write(self,path,data,**kwargs):self.data[path]=data
class Sandbox:
    def __init__(self):
        self.sandbox_id='sandbox-test';self.files=Files();self.commands=self;self.killed=False;self.fail_kill=False;self.outbox=[]
    def run(self,code,**kwargs):
        assert kwargs['user']=='root'
        if 'execute.py' in code:
            req=json.loads(self.files.data['/opt/phaseone/command.json']);result={**req,'exit_code':0,'stdout':'ok','stderr':'','error':None}
        elif 'outbox' in code:result={'requests':self.outbox}
        elif ' ack' in code:self.outbox=[];result={'ok':True}
        else:result={'ok':True}
        return SimpleNamespace(stdout=json.dumps(result))
    def kill(self,**kwargs):
        if self.fail_kill:raise RuntimeError('provider unavailable')
        self.killed=True;return True
class Factory:
    def __init__(self):self.created=[];self.killed=[];self.fail=False
    def create(self,**kwargs):
        self.created.append(kwargs)
        if self.fail:raise TimeoutError('uncertain create')
        self.last=Sandbox();return self.last
    def kill(self,sandbox,**kwargs):self.killed.append(sandbox);return True
class E2BTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.now=100000;self.factory=Factory()
        self.manager=E2BManager(state=self.tmp.name,api_key='test-credential',factory=self.factory,reaper=False,clock=lambda:self.now,monotonic=lambda:self.now)
        self.addCleanup(self.manager.close)
    def test_provider_lifetime_egress_and_secret_boundaries(self):
        v=self.manager.create('one');opts=self.factory.created[0]
        self.assertEqual(opts['timeout'],600);self.assertIs(opts['allow_internet_access'],False);self.assertIs(opts['secure'],True)
        self.assertNotIn('envs',opts);self.assertNotIn('test-credential',json.dumps(v.sandbox.files.data))
        self.assertEqual(v.execute('ls')['stdout'],'ok')
        with self.assertRaises(ValueError):self.manager.get(v.id,v.token,'another-access')
        v.close();self.assertTrue(v.sandbox.killed)
    def test_idle_and_hard_deadline(self):
        v=self.manager.create();self.now+=121;self.manager.tick();self.assertTrue(v.closed)
        self.now+=600;w=self.manager.create();w.lock.acquire()
        self.now+=601;self.manager.tick();w.lock.release();self.assertTrue(w.closed)
    def test_command_rate_and_count(self):
        v=self.manager.create()
        for _ in range(12):v.execute('ls')
        with self.assertRaises(RateLimited):v.execute('ls')
        self.now+=61;v.execute('ls');v.calls=64
        with self.assertRaises(RateLimited):v.execute('ls')
    def test_only_explicit_outbox_is_persisted(self):
        v=self.manager.create();v.sandbox.files.data['/workspace/private.txt']='private'
        v.sandbox.outbox=[{'path':'questions/001','content':'question','request_id':'a'*16}]
        response=v.execute('phase publish question.txt questions/001')
        self.assertEqual(response['publications'][0]['path'],'questions/001')
        self.assertEqual(len(self.manager.channel.snapshot()['files']),1)
        self.assertEqual(v.sandbox.outbox,[])
    def test_failed_kill_keeps_capacity_and_restart_reconciles(self):
        v=self.manager.create();v.sandbox.fail_kill=True;v.close()
        self.assertEqual(self.manager.ledger.usage()['active_or_uncertain'],1)
        self.manager.reconcile();self.assertEqual(self.factory.killed,['sandbox-test'])
        self.assertEqual(self.manager.ledger.usage()['active_or_uncertain'],0)
    def test_uncertain_create_is_not_retried_or_refunded(self):
        self.factory.fail=True
        with self.assertRaises(TimeoutError):self.manager.create()
        self.assertEqual(len(self.factory.created),1)
        self.assertEqual(self.manager.ledger.usage()['reserved_vm_seconds_24h'],600)
        with self.assertRaises(RateLimited):self.manager.create()
    def test_duplicate_controller_is_rejected(self):
        with self.assertRaises(RuntimeError):E2BManager(state=self.tmp.name,api_key='test',factory=self.factory,reaper=False)
if __name__=='__main__':unittest.main()
