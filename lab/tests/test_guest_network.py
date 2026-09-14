import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('e2b_supervisor',Path(__file__).resolve().parents[1]/'e2b_guest/execute.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class GuestNetworkTests(unittest.TestCase):
    def test_namespace_and_no_new_privileges_are_required(self):
        libc=Mock();libc.unshare.return_value=0;libc.prctl.return_value=0
        with patch.object(module.ctypes,'CDLL',return_value=libc),patch.object(module.socket,'if_nameindex',return_value=[(1,'lo')]):
            module.isolate_network()
        libc.unshare.assert_called_once_with(0x40000000)
        libc.prctl.assert_called_once_with(38,1,0,0,0)
    def test_unavailable_isolation_fails_closed(self):
        libc=Mock();libc.unshare.return_value=-1
        with patch.object(module.ctypes,'CDLL',return_value=libc):
            with self.assertRaises(OSError):module.isolate_network()
        libc.prctl.assert_not_called()
    def test_unexpected_external_interface_fails_closed(self):
        libc=Mock();libc.unshare.return_value=0
        with patch.object(module.ctypes,'CDLL',return_value=libc),patch.object(module.socket,'if_nameindex',return_value=[(2,'eth0')]):
            with self.assertRaises(RuntimeError):module.isolate_network()
