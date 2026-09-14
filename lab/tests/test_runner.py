import importlib.util,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
spec=importlib.util.spec_from_file_location('runner',Path(__file__).resolve().parents[1]/'run-agent.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class RunnerTests(unittest.TestCase):
    def test_function_ids_and_errors(self):
        class Fake:
            def call(self,name,args):
                if name=='bad':raise ValueError('unknown')
                return {'stdout':'x'*17000}
        content={'role':'model','parts':[{'functionCall':{'name':'run_shell','id':'a','args':{'code':'ls'}},'thoughtSignature':'opaque'},{'functionCall':{'name':'bad','id':'b'}}]}
        result=runner.follow_calls(Fake(),content)
        self.assertEqual(result[0]['functionResponse']['id'],'a')
        self.assertIn('truncated',result[0]['functionResponse']['response']['stdout'])
        self.assertEqual(result[1]['functionResponse']['response'],{'error':'unknown'})
        self.assertEqual(content['parts'][0]['thoughtSignature'],'opaque')
if __name__=='__main__':unittest.main()
