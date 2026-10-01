import json
from pathlib import Path
import tempfile
import unittest
import phase_receipts as receipts

class ReceiptTests(unittest.TestCase):
 def test_presence_is_not_completion_and_changed_route_is_rejected(self):
  with tempfile.TemporaryDirectory() as temp:
   d=Path(temp);(d/'final').mkdir();(d/'final/es.json').write_text('{}')
   self.assertFalse(receipts.verify(d,'text'))
   (d/'receipts').mkdir();artifact=d/'final/es.json'
   receipt={'version':1,'stage':'text','directory':str(d),'files':{str(artifact):receipts.sha(artifact)}}
   (d/'receipts/text.json').write_text(json.dumps(receipt));self.assertTrue(receipts.verify(d,'text'))
   artifact.write_text('{"pieces":[{"pieceId":"foreign-route"}]}');self.assertFalse(receipts.verify(d,'text'))
   artifact.write_text('{broken');self.assertFalse(receipts.verify(d,'text'))
 def test_foreign_receipt_cannot_move_to_another_city(self):
  with tempfile.TemporaryDirectory() as temp:
   d=Path(temp);(d/'receipts').mkdir();a=d/'artifact';a.write_text('same')
   (d/'receipts/prepare.json').write_text(json.dumps({'version':1,'stage':'prepare','directory':'/another/city','files':{str(a):receipts.sha(a)}}))
   self.assertFalse(receipts.verify(d,'prepare'))
