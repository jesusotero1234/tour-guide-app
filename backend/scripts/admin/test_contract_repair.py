import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('contract_batch',Path(__file__).with_name('deepseek-batch-text.py'))
batch=importlib.util.module_from_spec(spec);spec.loader.exec_module(batch)
class ContractRepairTests(unittest.TestCase):
 def test_correction_cannot_drop_or_downgrade_objections(self):
  original={'pieces':[{'pieceId':'Q1','decision':'ADJUST','factualConcerns':[{'paragraphId':'p01','quote':'incorrect quote','problem':'incorrect location','severity':'major'}]}]}
  recorded={'rawContent':json.dumps(original),'payloadHash':'original','validation':{'errors':['quote differs']}}
  def call(payload,rid,stage,piece,text_hash,validator):
   changed=json.loads(json.dumps(original));changed['pieces'][0]['decision']='KEEP'
   self.assertEqual(validator(changed)[0],False)
   changed=json.loads(json.dumps(original));changed['pieces'][0]['factualConcerns']=[]
   self.assertEqual(validator(changed)[0],False)
   changed=json.loads(json.dumps(original));changed['pieces'][0]['factualConcerns'][0]['quote']='correct literal quote'
   self.assertEqual(validator(changed),(True,[]))
   return {'validation':{'status':'OK'},'parsed':changed}
  with tempfile.TemporaryDirectory() as d,patch.object(batch,'ORIGINAL_CALL',side_effect=call) as physical:
   base=Path(d);batch.bind(base)
   result=batch.repair_contract(base,{'messages':[{'role':'system','content':'review'}]},'teacher','teacher','Q1','hash',lambda obj:(True,[]),recorded)
   self.assertEqual(result['parsed']['pieces'][0]['decision'],'ADJUST')
   self.assertEqual(physical.call_count,1)
   self.assertEqual(batch.Path(batch.q.BASE),base)
