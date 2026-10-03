import importlib.util
import json
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest.mock import patch

ADMIN = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('batch_speech', ADMIN / 'deepseek-batch-text.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)

FAKE_CLI = textwrap.dedent('''
    import json, re, sys
    with open(sys.argv[0] + ".calls", "a") as log: log.write("call\\n")
    data = json.load(sys.stdin)
    rows = []
    for piece in data["pieces"]:
        text = piece["text"]
        spoken = text.replace("1248", "mil doscientos cuarenta y ocho")
        found = [{"kind": "DIGIT", "match": d, "start": 0, "end": 1, "sentenceIndex": 0} for d in re.findall(r"\\d", spoken)]
        rows.append({"pieceId": piece["pieceId"], "spokenText": spoken, "changes": [["1248", "mil doscientos cuarenta y ocho"]] if "1248" in text else [],
                     "violations": found, "warnings": []})
    json.dump({"speechVersion": "speech-1", "pieces": rows}, sys.stdout)
''')


class Recorder:
    def __init__(self, *answers):
        self.answers, self.requests = list(answers), []

    def __call__(self, system, data, request_id, validator):
        self.requests.append(data)
        answer = self.answers.pop(0)
        return None if answer is None else {'sentences': answer}


class SpeechStage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / 'city'
        (self.directory / 'final').mkdir(parents=True)
        self.cli = Path(self.temp.name) / 'fake_cli.py'
        self.cli.write_text(FAKE_CLI)
        for name, value in (('SPEECH_CLI', self.cli), ('SPEECH_PYTHON', Path(sys.executable))):
            patcher = patch.object(batch, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.pieces = [{'pieceId': 'welcome', 'name': 'W', 'text': 'Bienvenidos.'}, {'pieceId': 'Q1', 'name': 'A', 'text': 'Llegó en 1248.'}]
        (self.directory / 'final/es.json').write_text(json.dumps({'language': 'es', 'pieces': self.pieces}))

    def calls(self):
        log = Path(str(self.cli) + '.calls')
        return len(log.read_text().splitlines()) if log.exists() else 0

    def test_writes_spoken_text_bound_to_the_final_file(self):
        result = batch.speech_stage(self.directory, 'es', self.pieces, 'ES')
        saved = json.loads((self.directory / 'final/es.speech.json').read_text())
        self.assertEqual(saved, result)
        self.assertEqual(saved['speechVersion'], 'speech-1')
        self.assertEqual(saved['finalSha256'], batch.q.sha_file(self.directory / 'final/es.json'))
        self.assertEqual([(r['pieceId'], r['status']) for r in saved['pieces']], [('welcome', 'clean'), ('Q1', 'clean')])
        self.assertEqual(saved['pieces'][1]['spokenText'], 'Llegó en mil doscientos cuarenta y ocho.')

    def test_unresolved_residue_is_reported_not_hidden(self):
        pieces = [{'pieceId': 'Q1', 'name': 'A', 'text': 'Via Roma 3.'}]
        result = batch.speech_stage(self.directory, 'es', pieces, 'ES')
        self.assertEqual(result['pieces'][0]['status'], 'residue')
        self.assertEqual(result['pieces'][0]['spokenText'], 'Via Roma 3.')

    def test_is_idempotent_and_recomputes_only_when_the_final_text_changes(self):
        batch.speech_stage(self.directory, 'es', self.pieces, 'ES')
        batch.speech_stage(self.directory, 'es', self.pieces, 'ES')
        self.assertEqual(self.calls(), 1)
        (self.directory / 'final/es.json').write_text(json.dumps({'language': 'es', 'pieces': self.pieces, 'changed': True}))
        batch.speech_stage(self.directory, 'es', self.pieces, 'ES')
        self.assertEqual(self.calls(), 2)

    def test_billable_repair_runs_only_when_asked_and_keeps_the_guard(self):
        pieces = [{'pieceId': 'Q1', 'name': 'A', 'text': 'Via Roma 3 es antigua.'}]
        batch.speech_stage(self.directory, 'es', pieces, 'ES')                     # no repair: no caller is ever created
        self.assertEqual(json.loads((self.directory / 'final/es.speech.json').read_text())['pieces'][0]['status'], 'residue')
        import speech_repair
        with patch.object(speech_repair, 'default_caller', return_value=Recorder([{'i': 0, 'spoken': 'Via Roma tres es antigua.'}])) as caller:
            result = batch.speech_stage(self.directory, 'es', pieces, 'ES', repair=True)
        caller.assert_called_once()
        row = result['pieces'][0]
        self.assertEqual((row['status'], row['spokenText']), ('ok', 'Via Roma tres es antigua.'))
        self.assertEqual(row['llmRepairs'][0]['before'], 'Via Roma 3 es antigua.')
        with patch.object(speech_repair, 'default_caller', return_value=Recorder([{'i': 0, 'spoken': 'Via Roma 3 es vieja.'}], None)):
            (self.directory / 'final/es.speech.json').unlink()
            refused = batch.speech_stage(self.directory, 'es', pieces, 'ES', repair=True)
        self.assertEqual(refused['pieces'][0]['status'], 'needs_manual')

    def test_translation_prompts_keep_digits_for_the_screen_text(self):
        source = (ADMIN / 'deepseek-batch-text.py').read_text()
        self.assertIn('keep every number and date exactly as', source)
        self.assertNotIn('numbers spelled out', source)




class OrderFreeText(unittest.TestCase):
    def test_the_master_is_checked_for_references_to_the_order_in_route_order(self):
        clean = [{'pieceId': 'welcome', 'name': 'Bienvenida', 'text': 'Valencia es antigua y generosa con quien la camina despacio.'},
                 {'pieceId': 'Q1', 'name': 'Torres de Serranos', 'text': 'Se levantaron en el siglo catorce. Aún hoy impresionan.'},
                 {'pieceId': 'Q2', 'name': 'Plaza de la Virgen', 'text': 'Fue foro romano. Hoy es el corazón de la ciudad.'}]
        self.assertEqual(batch.order_findings(clean), [])
        dirty = [dict(p) for p in clean]
        dirty[0]['text'] += ' Empezamos en las Torres de Serranos.'
        dirty[1]['text'] += ' La siguiente parada es la Plaza de la Virgen.'
        dirty[2]['text'] += ' Terminamos aquí el recorrido.'
        found = batch.order_findings(dirty)
        self.assertEqual([(f['pieceId'], f['kind']) for f in found], [('welcome', 'START'), ('Q1', 'NEXT_STOP'), ('Q2', 'FINISH')])

    def test_naming_the_successor_in_the_last_sentence_counts_even_without_a_formula(self):
        pieces = [{'pieceId': 'welcome', 'name': 'B', 'text': 'Texto.'}, {'pieceId': 'Q1', 'name': 'A', 'text': 'Historia. Desde aquí se ve la Plaza de la Virgen.'},
                  {'pieceId': 'Q2', 'name': 'Plaza de la Virgen', 'text': 'Historia final del lugar.'}]
        self.assertEqual([f['kind'] for f in batch.order_findings(pieces)], ['NEXT_STOP'])

    def test_prompts_are_bound_to_the_city_and_an_unbound_city_is_not_resumed(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / 'combined-prompt.md').write_text('prompt')
            lock, path = batch.bind_text_inputs(directory, {'a': 1})
            self.assertEqual(set(lock), {'inputsSha256', 'promptSha256', 'editorialPromptsSha256'})
            path.write_text(json.dumps(lock))
            self.assertEqual(batch.bind_text_inputs(directory, {'a': 1})[0], lock)             # same prompts: resumable
            with self.assertRaisesRegex(AssertionError, 'changed'):
                batch.bind_text_inputs(directory, {'a': 2})
            path.write_text(json.dumps({k: v for k, v in lock.items() if k != 'editorialPromptsSha256'}))
            with self.assertRaisesRegex(AssertionError, 'predates'):
                batch.bind_text_inputs(directory, {'a': 1})

    def test_the_editorial_prompts_no_longer_ask_to_keep_the_order(self):
        text = (ADMIN / 'editorial_runtime/prompts.py').read_text(encoding='utf-8')
        for old in ('Conserva el orden de la ruta y las transiciones', 'Conserva navegación, nombres de próximas paradas', 'Una transición corriente'):
            self.assertNotIn(old, text)
        self.assertIn('cualquier orden', text)
        self.assertNotIn('nextPieceId', (ADMIN / 'deepseek-batch-text.py').read_text().split('def build_case')[1].split('def ')[0])


if __name__ == '__main__':
    unittest.main()
