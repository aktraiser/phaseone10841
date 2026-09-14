"""Explicitly authorized E2B qualification; creates billed sandboxes, never calls a model."""
import argparse,json,os,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from e2b_runtime import E2BManager
from limits import Limits
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--allow-e2b-charges',action='store_true');a=p.parse_args()
if not a.allow_e2b_charges:p.error('Pass --allow-e2b-charges to authorize real sandbox usage')
with tempfile.TemporaryDirectory(prefix='phaseone-e2b-check-') as state:
    m=E2BManager(state=state,api_key=os.environ['E2B_API_KEY'],template=os.environ.get('E2B_TEMPLATE','base'),limits=Limits(ttl=120,idle=60,commands_minute=60))
    try:
        v=m.create('first')
        def run(visitor,code):
            result=visitor.execute(code);assert result['exit_code']==0,result;return result
        assert run(v,'id -u')['stdout'].strip()=='65534'
        assert v.execute('echo wrong > /archive/overwrite')['exit_code']!=0
        assert v.execute('echo wrong > /channel/overwrite')['exit_code']!=0
        assert v.execute("python3 -c \"import urllib.request; urllib.request.urlopen('https://example.com',timeout=2)\"")['exit_code']!=0
        run(v,"printf 'private' > private.txt")
        assert run(v,'cat private.txt')['stdout']=='private'
        result=run(v,"printf 'isolated publication test' > public.txt; phase publish public.txt tests/e2b --request-id e2b-test-request-0001")
        assert result['publications'][0]['id']>0,result
        w=m.create('second')
        assert run(w,'cat /channel/tests/e2b')['stdout']=='isolated publication test'
        assert w.execute('cat private.txt')['exit_code']!=0
        v.close();w.close()
        assert m.ledger.usage()['active_or_uncertain']==0
        print(json.dumps({'real_e2b':True,'private_workspace':True,'explicit_publication':True,'read_only_archives':True,'egress_blocked':True,'destruction_confirmed':True}))
    finally:m.close()
