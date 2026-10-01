import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

class GuardTests(unittest.TestCase):
 def test_killed_launcher_cannot_duplicate_live_worker(self):
  with tempfile.TemporaryDirectory() as temp:
   d=Path(temp);script=Path(__file__).with_name('phase_guard.py')
   worker="import pathlib,sys,time; p=pathlib.Path(sys.argv[1]); (p/'worker').write_text('started');time.sleep(1);(p/'done').write_text('done')"
   command=[sys.executable,str(script),str(d),'text',sys.executable,'-c',worker,str(d)]
   first=subprocess.Popen(command,start_new_session=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   try:
    end=time.monotonic()+3
    while not (d/'worker').exists() and time.monotonic()<end:time.sleep(.01)
    self.assertTrue((d/'worker').exists())
    first.kill();first.wait(timeout=3)
    second=subprocess.run(command,capture_output=True,text=True,timeout=3)
    self.assertEqual(second.returncode,75)
    end=time.monotonic()+3
    while not (d/'done').exists() and time.monotonic()<end:time.sleep(.01)
    self.assertTrue((d/'done').exists())
   finally:
    try:os.killpg(first.pid,signal.SIGTERM)
    except ProcessLookupError:pass
    first.wait(timeout=3)
