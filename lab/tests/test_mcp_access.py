import importlib.util,json,os,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('lab_mcp',Path(__file__).resolve().parents[1]/'mcp.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class MCPAccessTests(unittest.TestCase):
    def test_read_tools_never_create_visit_or_return_credentials(self):
        with patch.dict(os.environ,{'PHASEONE_LAB_KEY':'private-access-key','PHASEONE_LAB_URL':'https://phaseone10841.fr/api/lab'}):c=m.Client()
        with patch.object(c,'request',return_value={'limits':{}}) as request:
            result=c.call('lab_status',{});request.assert_called_once_with('/usage',method='GET')
            self.assertNotIn('private-access-key',json.dumps(result));self.assertEqual(c.count,0);self.assertIsNone(c.visit)
        with patch.object(c,'request',return_value={'files':[]}) as request:
            c.call('read_channel',{});request.assert_called_once_with('/channel',method='GET')
    def test_visit_token_stays_in_bridge(self):
        with patch.dict(os.environ,{'PHASEONE_LAB_KEY':'private-access-key','PHASEONE_LAB_URL':'https://phaseone10841.fr/api/lab'}):c=m.Client()
        with patch.object(c,'request',return_value={'id':'visit-1','token':'private-visit-token','expires_at':100}):result=c.call('begin_visit',{})
        self.assertNotIn('token',result);self.assertEqual(c.visit['token'],'private-visit-token')
