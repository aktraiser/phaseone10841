"""Actual KVM qualification. No paid model calls; prescribed actions test mechanics only."""
import json, os, sys, tempfile, time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from runtime import Manager
with tempfile.TemporaryDirectory(prefix='phaseone-real-') as state:
    settings=dict(firecracker=os.environ['FIRECRACKER_BIN'],kernel=os.environ['KERNEL_PATH'],image=os.environ['ROOTFS_PATH'],state=state,ttl=30)
    m=Manager(**settings)
    try:
        a=m.create()
        def command(v,code):
            result=v.execute(code)
            assert result.get('exit_code')==0,result
            return result['stdout']
        assert '65534' in command(a,'id -u')
        assert 'Linux' in command(a,'uname -s')
        assert 'OAI-001' in command(a,'ls /archive/agents')
        assert a.execute('echo forbidden > /archive/forbidden')['exit_code']!=0
        assert a.execute('echo forbidden > /channel/forbidden')['exit_code']!=0
        assert command(a,'ls /sys/class/net').strip()=='lo'
        command(a,"printf 'private session file' > private.txt")
        assert command(a,'cat private.txt')=='private session file'
        command(a,"printf 'A question from an isolated VM' > question.txt")
        pub=json.loads(command(a,'phase publish question.txt questions/001 --request-id test-publication-0001'))
        assert pub['id']>0
        assert json.loads(command(a,'phase publish question.txt questions/001 --request-id test-publication-0001'))['replayed']
        assert 'A question' in command(a,'cat /channel/questions/001')
        b=m.create()
        assert b.execute('cat private.txt')['exit_code']!=0
        assert 'A question' in command(b,'cat /channel/questions/001')
        command(b,"printf 'A reply from another VM' > answer.txt; phase publish answer.txt answers/001")
        assert 'A reply' in command(a,'phase read answers/001')
        assert a.execute('sleep 2',timeout_ms=100)['error']=='timeout'
        assert command(a,'echo still-alive').strip()=='still-alive'
        a.close();b.close();m.close()
        m=Manager(**settings);c=m.create()
        assert 'A reply' in command(c,'cat /channel/answers/001')
        assert c.execute('cat private.txt')['exit_code']!=0
        c.deadline=time.monotonic()+.1
        time.sleep(.5)
        assert c.closed and c.process.poll() is not None
        assert not c.directory.exists()
        print(json.dumps({'real_firecracker':True,'persistent_workspace':True,'read_only_archive':True,'no_ip_nic':True,'cross_vm_channel':True,'controller_restart_persistence':True,'timeout_and_expiry':True,'rootfs_sha256':m.image_hash,'kernel_sha256':m.kernel_hash}))
    finally:m.close()
