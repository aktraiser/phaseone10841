import sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from channel import Channel
class ChannelTests(unittest.TestCase):
    def test_versions_paths_and_restart(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'db.sqlite';c=Channel(path)
            a=c.publish('one','questions/001','Why?', 'a'*16)
            self.assertTrue(c.publish('one','questions/001','Why?', 'a'*16)['replayed'])
            for name in ['../escape','/absolute','a//b','a/./b','a/../../b']:
                with self.assertRaises(ValueError):c.publish('one',name,'bad','b'*16)
            with self.assertRaises(ValueError):c.publish('one','questions','bad','b'*16)
            with self.assertRaises(ValueError):c.publish('one','questions/001','changed','a'*16)
            b=c.publish('two','questions/001','Another version','a'*16)
            self.assertGreater(b['id'],a['id']);c.db.close()
            c=Channel(path);self.assertEqual(c.snapshot()['files'][0]['content'],'Another version')
            self.assertEqual(c.db.execute('SELECT count(*) FROM versions').fetchone()[0],2)
            c.db.close()
    def test_limits(self):
        with tempfile.TemporaryDirectory() as d:
            c=Channel(Path(d)/'db.sqlite')
            with self.assertRaises(ValueError):c.publish('one','a','x'*32769,'a'*16)
            with self.assertRaises(ValueError):c.publish('one','a','x','short')
            c.db.close()
if __name__=='__main__':unittest.main()
