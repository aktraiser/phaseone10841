import sys,tempfile,unittest,threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from limits import Limits,Ledger,RateLimited
class LimitsTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.now=100000;self.path=Path(self.tmp.name)/'ledger.sqlite'
    def ledger(self,**kwargs):return Ledger(self.path,Limits(**kwargs),lambda:self.now)
    def test_concurrency_principal_and_restart(self):
        a=self.ledger();a.reserve('a','one')
        with self.assertRaises(RateLimited):a.reserve('b','one')
        a.reserve('b','two')
        with self.assertRaises(RateLimited):a.reserve('c','three')
        a.db.close();b=self.ledger()
        with self.assertRaises(RateLimited):b.reserve('d','three')
        b.closed('a');b.reserve('d','three');b.db.close()
    def test_creation_rates_survive_restart(self):
        a=self.ledger()
        for i in range(2):a.reserve(str(i),'one');a.closed(str(i));self.now+=1
        a.db.close();a=self.ledger()
        with self.assertRaises(RateLimited) as error:a.reserve('third','one')
        self.assertEqual(error.exception.retry_after,598)
        self.now+=600;a.reserve('later','one');a.db.close()
    def test_global_budget_keeps_full_reservations_after_early_close(self):
        a=self.ledger(minutes_hour=10,minutes_day=10)
        a.reserve('a','one');a.closed('a')
        with self.assertRaises(RateLimited):a.reserve('b','two')
        self.now+=3601
        with self.assertRaises(RateLimited):a.reserve('c','two')
        self.now+=86400;a.reserve('d','two');a.db.close()
    def test_uncertain_creation_holds_slot_until_provider_deadline(self):
        a=self.ledger(concurrent=1);a.reserve('a','one');self.now+=600
        with self.assertRaises(RateLimited):a.reserve('b','two')
        self.now+=31;a.reserve('c','two');a.db.close()
    def test_parallel_admission_is_atomic(self):
        a=self.ledger(concurrent=1);results=[]
        def reserve(i):
            try:a.reserve(str(i),str(i));results.append(True)
            except RateLimited:results.append(False)
        threads=[threading.Thread(target=reserve,args=(i,)) for i in range(8)]
        for t in threads:t.start()
        for t in threads:t.join()
        self.assertEqual(results.count(True),1);a.db.close()
if __name__=='__main__':unittest.main()
