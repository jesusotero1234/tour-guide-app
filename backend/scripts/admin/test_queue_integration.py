"""Real child processes and durable state, accelerated only through clock intervals."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

HERE=Path(__file__).parent
DRIVER=r'''
import sys,json,fcntl
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import importlib.util
spec=importlib.util.spec_from_file_location('s',Path(sys.argv[1])/'deepseek-europe-supervise.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
s.B=Path(sys.argv[2]);s.POLL_SECONDS=.03;s.RECOVERY_DELAYS=(.15,.2,.3);s.update_index=lambda:None
s.overpass_control.read_status=lambda:{'phase':'test'}
s.command=lambda stage,slug:[sys.executable,str(s.B/'work.py'),str(s.B/slug),stage]
s.output_ready=lambda stage,slug:(s.B/slug/(stage+'.done')).exists()
s.phase_receipts.create=lambda *args:None
with (s.B/'queue.lock').open('a+') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 previous=json.loads((s.B/'queue-status.json').read_text()) if (s.B/'queue-status.json').exists() else {}
 parallel=(s.B/'parallel-mode').exists()
 if parallel:s.LIMITS={'prepare':2,'text':4,'audio':1}
 slugs=['a','b']+(['c'] if (s.B/'c').is_dir() else [])
 s.run_queue(slugs,previous,**({'audio_at_end':True,'independent_sources':True} if parallel else {}))
'''
WORKER=r'''
import sys,json,time,os
from pathlib import Path
p=Path(sys.argv[1]);stage=sys.argv[2];counter=p/(stage+'.count');n=int(counter.read_text())+1 if counter.exists() else 1;counter.write_text(str(n))
def event(kind):
 fd=os.open(p.parent/'events.jsonl',os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
 try:os.write(fd,(json.dumps({'city':p.name,'stage':stage,'event':kind,'time':time.monotonic()})+'\n').encode())
 finally:os.close(fd)
event('start')
if stage=='prepare' and p.name=='a' and not (p.parent/'no-source-fail').exists() and (n==1 or (p.parent/'always-fail').exists()):
 failure='query_unknown' if (p.parent/'city-timeout').exists() else 'service_wait'
 if (p.parent/'coordinated').exists():
  (p/'prepare-result.json').write_text(json.dumps({'type':'source_wait','message':'waiting for shared gate','sourceFailure':{'coordinated':True,'type':'source_wait','queryHash':'pending','retryNotBefore':'2000-01-01T00:00:00Z','attempts':0}}));event('waiting');raise SystemExit(1)
 (p/'prepare-result.json').write_text(json.dumps({'type':failure,'message':'local simulated source failure','sourceFailure':{'queryHash':'pending','retryNotBefore':'2000-01-01T00:00:00Z'}}));event('error');raise SystemExit(1)
if stage=='text' and p.name=='a' and (p.parent/'editorial-fail').exists():
 (p/'text-result.json').write_text(json.dumps({'type':'editorial_objection','message':'factual issue retained'}));raise SystemExit(1)
time.sleep(.4 if stage=='text' and p.name=='b' and (p.parent/'slow-text').exists() else .12 if (p.parent/'parallel-mode').exists() else .04)
(p/(stage+'.done')).write_text('done')
event('done')
'''
class IntegrationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.b=Path(self.tmp.name)
  for s in ['a','b']:(self.b/s).mkdir()
  (self.b/'work.py').write_text(WORKER);(self.b/'driver.py').write_text(DRIVER)
  self.children=[];self.addCleanup(self.stop_all)
 def stop_all(self):
  for p in self.children:
   if p.poll() is None:p.terminate()
   p.wait(timeout=5)
   if p.stderr:p.stderr.close()
 def start(self):
  p=subprocess.Popen([sys.executable,str(self.b/'driver.py'),str(HERE.resolve()),str(self.b)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
  self.children.append(p);return p
 def state(self):
  try:return json.loads((self.b/'queue-status.json').read_text())
  except (OSError,ValueError):return {}
 def wait_for(self,condition):
  deadline=time.monotonic()+5
  while time.monotonic()<deadline:
   if condition():return
   time.sleep(.01)
  self.fail('local process condition timed out: '+str(self.state()))
 def test_service_returns_without_user_restart(self):
  p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  self.assertEqual((self.b/'a/prepare.count').read_text(),'2')
  self.assertEqual(self.state()['phase'],'completed')
  self.assertEqual(json.loads((self.b/'a/source-recovery.json').read_text())['windowsUsed'],1)
 def test_shared_wait_releases_slot_without_allocating_legacy_windows(self):
  (self.b/'parallel-mode').touch();(self.b/'coordinated').touch()
  saved={'windowsUsed':2,'queryHash':'pending','retryNotBefore':'2000-01-01T00:00:00Z'}
  (self.b/'a/source-recovery.json').write_text(json.dumps(saved))
  p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  self.assertEqual((self.b/'a/prepare.count').read_text(),'2')
  self.assertEqual(json.loads((self.b/'a/source-recovery.json').read_text()),saved)
  self.assertEqual(self.state()['cities']['a']['audio']['phase'],'completed')
  self.assertEqual(self.state()['cities']['b']['audio']['phase'],'completed')
 def test_restart_during_wait_and_duplicate_lock(self):
  p=self.start();self.wait_for(lambda:self.state().get('phase')=='waiting_sources')
  other=self.start();self.assertNotEqual(other.wait(timeout=5),0)
  p.terminate();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  q=self.start();self.assertEqual(q.wait(timeout=5),0,q.stderr.read())
  self.assertEqual((self.b/'a/prepare.count').read_text(),'2')
  self.assertEqual((self.b/'a/audio.count').read_text(),'1')
 def test_exhaustion_blocks_provider_without_fresh_city_retry_burst(self):
  (self.b/'always-fail').touch();p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  self.assertEqual((self.b/'a/prepare.count').read_text(),'4')
  self.assertFalse((self.b/'b/prepare.count').exists())
  self.assertEqual(self.state()['cities']['a']['prepare']['reason'],'source_recovery_exhausted')
 def test_editorial_failure_isolated(self):
  (self.b/'editorial-fail').touch();p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  self.assertEqual(self.state()['cities']['a']['text']['reason'],'editorial_objection')
  self.assertEqual(self.state()['cities']['b']['audio']['phase'],'completed')
 def events(self):
  return [json.loads(line) for line in (self.b/'events.jsonl').read_text().splitlines()]
 def test_parallel_preparations_and_audio_waits_for_last_text(self):
  for name in ['parallel-mode','no-source-fail','slow-text']:(self.b/name).touch()
  p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  events=self.events()
  prepare_starts=[e['time'] for e in events if e['stage']=='prepare' and e['event']=='start']
  prepare_ends=[e['time'] for e in events if e['stage']=='prepare' and e['event']=='done']
  self.assertLess(max(prepare_starts),min(prepare_ends),'preparations must overlap')
  last_text=max(e['time'] for e in events if e['stage']=='text' and e['event']=='done')
  first_audio=min(e['time'] for e in events if e['stage']=='audio' and e['event']=='start')
  self.assertLess(last_text,first_audio)
  audio_events=[e for e in events if e['stage']=='audio']
  self.assertEqual([e['event'] for e in audio_events],['start','done','start','done'])
 def test_parallel_city_timeout_does_not_block_other_city_or_reset_windows(self):
  for name in ['parallel-mode','city-timeout','always-fail']:(self.b/name).touch()
  (self.b/'a/source-recovery.json').write_text(json.dumps({'windowsUsed':2,'queryHash':'pending','serviceConfirmed':True}))
  prior={'phase':'paused','preparationBlocked':{'city':'a','reason':'query_unknown'},'cities':{}}
  (self.b/'queue-status.json').write_text(json.dumps(prior))
  p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  self.assertEqual((self.b/'a/prepare.count').read_text(),'2')
  self.assertEqual(json.loads((self.b/'a/source-recovery.json').read_text())['windowsUsed'],3)
  self.assertEqual(self.state()['cities']['a']['prepare']['reason'],'source_recovery_exhausted')
  self.assertEqual(self.state()['cities']['b']['audio']['phase'],'completed')
  events=self.events()
  last_failure=max(e['time'] for e in events if e['stage']=='prepare' and e['event']=='error')
  first_audio=min(e['time'] for e in events if e['stage']=='audio' and e['event']=='start')
  self.assertLess(last_failure,first_audio)
 def test_parallel_mode_still_honors_provider_service_wait(self):
  for name in ['parallel-mode','always-fail']:(self.b/name).touch()
  (self.b/'c').mkdir()
  p=self.start();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  self.assertFalse((self.b/'c/prepare.count').exists())
  self.assertEqual(self.state()['cities']['c']['prepare']['reason'],'provider_recovery_exhausted')
 def test_parallel_restart_preserves_completed_text_and_audio_barrier(self):
  for name in ['parallel-mode','no-source-fail','slow-text']:(self.b/name).touch()
  p=self.start()
  self.wait_for(lambda:self.state().get('cities',{}).get('a',{}).get('text',{}).get('phase')=='ready')
  self.assertFalse((self.b/'a/audio.count').exists())
  p.terminate();self.assertEqual(p.wait(timeout=5),0,p.stderr.read())
  q=self.start();self.assertEqual(q.wait(timeout=5),0,q.stderr.read())
  self.assertEqual((self.b/'a/text.count').read_text(),'1')
  self.assertEqual((self.b/'a/audio.count').read_text(),'1')
  self.assertEqual(self.state()['phase'],'completed')
