import importlib.util
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('batch', Path(__file__).with_name('deepseek-batch-text.py'))
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.network = patch.object(batch.q.urllib.request, 'urlopen',
                                    side_effect=AssertionError('unexpected network call'))
        self.network.start()
        self.addCleanup(self.network.stop)


class RecoveryTests(OfflineTests):
    def test_complete_sequence_only(self):
        raw = '{"pieceId":"Q1"}\n{"pieceId":"Q2"}'
        self.assertEqual(len(batch.complete_json_envelope(raw)['pieces']), 2)
        self.assertEqual(batch.complete_json_envelope('{"translations":{"p":"testo"}}}')['translations']['p'], 'testo')
        for value in [raw + '\n{', raw + ' commentary', '```json\n' + raw + '\n```', 'null', None]:
            self.assertIsNone(batch.complete_json_envelope(value))

    def test_recovery_keeps_context_and_validates_every_piece(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'city'
            pieces = [dict(pieceId=pid, name=pid, text='Historical text.',
                           paragraphs=batch.c.paragraphs('Historical text.')) for pid in ['Q1', 'Q2']]
            case = dict(pieces=pieces, routeOrder=['Q1', 'Q2'])
            texts = {p['pieceId']: p['text'] for p in pieces}
            batch.save(directory / 'editorial/cases/city/reviewer-raw.json',
                       {'validation': {'status': 'INCOMPLETE', 'type': 'contract_invalid'},
                        'attempts': [{'status': 'HTTP_OK', 'finishReason': 'stop'}]})
            seen = []

            def invoke(city, stage, system, data, validator):
                if stage == 'reviewer':
                    return None
                tour = data['tour']
                self.assertEqual(len(tour['pieces']), 1)
                self.assertEqual([p['pieceId'] for p in tour['routeContext']], ['Q1', 'Q2'])
                p = tour['pieces'][0]; seen.append(p['pieceId'])
                result = {'pieces': [dict(pieceId=p['pieceId'], coveredParagraphIds=['p01'],
                                         verdict='SIMILAR', reason='Reviewed', issues=[], lostUsefulDetails=[])]}
                self.assertEqual(validator(result), (True, []))
                return result

            batch.bind(directory / 'editorial')
            with patch.object(batch.editorial, 'invoke', side_effect=invoke):
                result = batch.review_master(directory, 'reviewer', case, texts)
            self.assertEqual(seen, ['Q1', 'Q2'])
            self.assertEqual(len(result['pieces']), 2)
            self.assertEqual(Path(batch.q.BASE), directory / 'editorial')


class ManualMasterTests(OfflineTests):
    def fixture(self, directory):
        texts = {'Q1': 'Entonces fue un desafío para los ciudadanos.', 'Q2': 'Otro lugar permanece intacto.'}
        case = {'pieces': [dict(pieceId=pid, name=pid, text=text, paragraphs=batch.c.paragraphs(text),
            targetWords=20, evidence={'passages': [dict(passageId='source-1', quote='Es war ein Affront für die Bürger.')]})
            for pid, text in texts.items()], 'targetWords': 40}
        review = {'pieces': [dict(pieceId=pid, coveredParagraphIds=['p01'], verdict='SIMILAR',
            reason='Revisado', issues=[], lostUsefulDetails=[]) for pid in texts]}
        decision = {'pendingPieceIds': ['Q1']}
        plan = dict(caseSha256=batch.digest(case), textsSha256=batch.digest(texts),
            selectionSha256=batch.digest(decision), changes=[dict(pieceId='Q1',
                oldText='un desafío', newText='una afrenta', reason='Conservar el significado de Affront.',
                evidence=[dict(passageId='source-1', quote='ein Affront für die Bürger')])])
        batch.save(directory / 'editorial/manual-corrections.json', plan)
        return case, texts, review, decision, plan

    def test_reviews_only_changed_piece_and_preserves_unchanged_review(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'city'
            case, texts, review, decision, plan = self.fixture(directory)
            assessed = {'pieces': [{**review['pieces'][0], 'verdict': 'IMPROVED'}]}
            with patch.object(batch, 'review_master', return_value=assessed) as check:
                updated, combined = batch.correct_master_from_sources(directory, case, texts, review, decision)
            self.assertEqual(updated['Q1'], 'Entonces fue una afrenta para los ciudadanos.')
            self.assertEqual(updated['Q2'], texts['Q2'])
            self.assertEqual(combined['pieces'][1], review['pieces'][1])
            subset = check.call_args.args[2]
            self.assertEqual([p['pieceId'] for p in subset['pieces']], ['Q1'])
            self.assertEqual(len(subset['routeContext']), 2)
            self.assertEqual(batch.c.validate_review(combined, case, updated), (True, []))
            self.assertEqual(batch.load(directory / 'editorial/manual-recovery-v1/applied.json')['plan'], plan)

    def test_stale_bindings_or_unsupported_edits_fail_before_review(self):
        mutations = [lambda p: p.update(caseSha256='stale'), lambda p: p.update(textsSha256='stale'),
                     lambda p: p.update(selectionSha256='stale'),
                     lambda p: p['changes'][0].update(pieceId='Q2'),
                     lambda p: p['changes'][0].update(oldText='not in text'),
                     lambda p: p['changes'][0]['evidence'][0].update(quote='invented assertion'),
                     lambda p: p['changes'].append(copy.deepcopy(p['changes'][0]))]
        for mutate in mutations:
            with tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary) / 'city'
                case, texts, review, decision, plan = self.fixture(directory)
                mutate(plan); batch.save(directory / 'editorial/manual-corrections.json', plan)
                with patch.object(batch, 'review_master') as check, self.assertRaises((AssertionError, ValueError)):
                    batch.correct_master_from_sources(directory, case, texts, review, decision)
                check.assert_not_called()
                self.assertFalse((directory / 'editorial/manual-recovery-v1/applied.json').exists())

    def test_correction_cannot_bypass_new_factual_issue(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'city'
            case, texts, review, decision, _ = self.fixture(directory)
            row = {**review['pieces'][0], 'verdict': 'IMPROVED', 'issues': [dict(kind='FACTUAL',
                severity='minor', origin='NEW', paragraphId='p01', quote='una afrenta',
                explanation='Still requires review', evidence=[])]}
            with patch.object(batch, 'review_master', return_value={'pieces': [row]}):
                updated, combined = batch.correct_master_from_sources(directory, case, texts, review, decision)
            self.assertEqual(batch.editorial.selection(case, updated, combined)['status'], 'CORRECTION_REQUIRED')

    def test_incomplete_review_does_not_apply_or_publish(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'city'
            case, texts, review, decision, _ = self.fixture(directory)
            with patch.object(batch, 'review_master', return_value=None), self.assertRaises(ValueError):
                batch.correct_master_from_sources(directory, case, texts, review, decision)
            self.assertFalse((directory / 'editorial/manual-recovery-v1/applied.json').exists())
            self.assertEqual(Path(batch.q.BASE), directory / 'editorial')


class EvidenceRecoveryTests(OfflineTests):
    source = ('La Cappella Sistina (in latino Sacellum Sixtinum), dedicata a Santa Maria Assunta in Cielo, '
              'è la principale cappella del Palazzo Apostolico, nonché uno dei più famosi tesori culturali '
              'e artistici della Città del Vaticano, inserita nel percorso dei Musei Vaticani.')
    quote = ('La Cappella Sistina ... è la principale cappella del Palazzo Apostolico ... '
             'inserita nel percorso dei Musei Vaticani.')

    def test_repeated_literal_is_extended_without_changing_its_source(self):
        source = 'El cuerpo es obra de Guarino Guarini. Después, Guarino Guarini inició la construcción.'
        expanded = batch.citations.disambiguate_repeated_literal('Guarino Guarini', source)
        self.assertIsNotNone(expanded)
        self.assertEqual(source.count(expanded), 1)
        self.assertIn('Guarino Guarini', expanded)
        self.assertIsNone(batch.citations.disambiguate_repeated_literal('nombre ausente', source))

    def test_ellipsis_resolves_exact_span_with_existing_normalization(self):
        self.assertEqual(batch.expand_evidence_ellipsis(self.quote, self.source), self.source)
        source = 'Preámbulo. La “capilla”\n\tdel Palacio, abierta en 1936. Epílogo.'
        self.assertEqual(batch.expand_evidence_ellipsis('la "capilla" ... abierta en 1936.', source),
                         'La “capilla”\n\tdel Palacio, abierta en 1936.')

    def test_ellipsis_cannot_change_fact_reorder_or_join_ambiguous_fragments(self):
        for quote, source in [
            ('abierta en 1939 ... capilla principal', 'abierta en 1936, una capilla principal'),
            ('capilla principal ... abierta en 1936', 'abierta en 1936, una capilla principal'),
            ('capilla ... principal', 'capilla hermosa y capilla principal'),
            ('... capilla principal', 'una capilla principal'),
            ('capilla principal ...', 'una capilla principal'),
            ('capilla ... principal', 'capilla exterior sin el otro fragmento'),
            ('capilla principal', 'una iglesia principal'),
            ('capilla ... capilla', 'una capilla principal'),
            ('aaaa ... final', 'aaaaa y final'),
        ]:
            with self.subTest(quote=quote, source=source):
                self.assertIsNone(batch.expand_evidence_ellipsis(quote, source))

    def test_cached_whole_review_is_revalidated_with_audit_and_raw_bytes_preserved(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / 'roma'
            text = 'La visita llega ante la Cappella Sistina.'
            piece = dict(pieceId='tour-welcome', text=text, paragraphs=batch.c.paragraphs(text),
                         evidence={'passages': [dict(passageId='Q2943:p1', sourceId='Q2943:source', quote=self.source)]})
            case, texts = {'pieces': [piece]}, {'tour-welcome': text}
            review = {'pieces': [dict(pieceId='tour-welcome', coveredParagraphIds=['p01'], verdict='SIMILAR',
                reason='Comprobado.', lostUsefulDetails=[], issues=[dict(kind='FACTUAL', severity='major',
                origin='INHERITED', paragraphId='p01', quote=text, explanation='No se ve desde fuera.',
                evidence=[dict(passageId='Q2943:p1', quote=self.quote)])])]}
            context = copy.deepcopy(case)
            context['pieces'][0]['candidateParagraphs'] = batch.c.paragraphs(text)
            data = {'tour': context}
            payload = dict(model=batch.q.MODEL, thinking={'type': 'enabled'}, reasoning_effort='low',
                           max_tokens=32768, stream=False, messages=[
                               {'role': 'system', 'content': batch.prompts.REVIEWER},
                               {'role': 'user', 'content': json.dumps(data, ensure_ascii=False)}])
            text_hash = batch.q.sha_text(json.dumps(data, ensure_ascii=False, sort_keys=True))
            path = InterruptedRecoveryTests.record(directory / 'editorial', 'roma-reviewer', payload,
                                                   text_hash, 'HTTP_OK', review)
            original = path.read_bytes()
            with patch.object(batch.q, 'load_key', side_effect=AssertionError('cached result needs no API key')):
                for _ in range(2):
                    batch.bind(directory / 'editorial')
                    result = batch.review_master(directory, 'reviewer', case, texts)
            self.assertEqual(result['pieces'][0]['issues'][0]['evidence'][0]['quote'], self.source)
            self.assertEqual(batch.c.validate_review(result, case, texts), (True, []))
            self.assertEqual(path.read_bytes(), original)
            audit = batch.load(directory / 'editorial/reviewer-citation-adjustments-v2.json')
            self.assertEqual(len(audit), 1)
            self.assertEqual(audit[0]['before'], self.quote)
            self.assertEqual(audit[0]['sourceId'], 'Q2943:source')
            self.assertEqual(audit[0]['sourceSha256'], batch.q.sha_text(self.source))

    def test_fragments_cannot_be_assembled_from_another_passage(self):
        case = {'pieces': [dict(pieceId='Q1', evidence={'passages': [
            dict(passageId='p1', quote='La capilla antigua'), dict(passageId='p2', quote='el museo moderno')]})]}
        obj = {'pieces': [dict(pieceId='Q1', issues=[dict(evidence=[
            dict(passageId='p1', quote='La capilla ... el museo moderno')])])]}
        self.assertEqual(batch.normalize_review_evidence(obj, case), [])
        with self.assertRaises(ValueError):
            batch.c.evidence(obj['pieces'][0]['issues'][0]['evidence'], case['pieces'][0])


class InterruptedRecoveryTests(OfflineTests):
    payload = {'model': 'test', 'messages': [{'role': 'user', 'content': 'Frozen request'}]}

    @staticmethod
    def record(base, request_id, payload, text_hash, status='PENDING', parsed=None):
        identity = batch.q.sha_text(json.dumps({'payload': payload, 'textHash': text_hash},
                                             sort_keys=True, ensure_ascii=False))
        body = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(parsed)}}]} \
            if parsed is not None else None
        path = base / 'frozen/request-and-response' / (request_id + '.attempt-1.json')
        batch.save(path, {'payloadHash': identity, 'entry': dict(requestId=request_id, stage='reviewer',
                   piece='city', attempt=1, status=status, payloadHash=identity, textHash=text_hash), 'body': body})
        return path

    def call(self, validator=None, payload=None, text_hash='text-hash'):
        return batch.q.call(payload or self.payload, 'stage', 'reviewer', 'city', text_hash, validator)

    def test_pending_needs_explicit_opt_in(self):
        with tempfile.TemporaryDirectory() as temporary, patch.dict(os.environ, {}, clear=True):
            base = Path(temporary)
            batch.bind(base)
            path = self.record(base, 'stage', self.payload, 'text-hash')
            original = path.read_bytes()
            self.assertEqual(self.call()['validation']['status'], 'INTERRUPTED')
            self.assertEqual(path.read_bytes(), original)
            self.assertFalse((base / 'interrupted-recovery-v1').exists())

    def test_one_recovery_reuses_current_validator_and_preserves_original(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}), \
                patch.object(batch.q, 'load_key', return_value='test'), \
                patch.object(batch.q.urllib.request, 'urlopen') as request:
            base = Path(temporary)
            batch.bind(base)
            path = self.record(base, 'stage', self.payload, 'text-hash')
            original = path.read_bytes()
            request.return_value.__enter__.return_value.read.return_value = json.dumps({
                'choices': [{'finish_reason': 'stop', 'message': {'content': '{"pieces": []}'}}]}).encode()
            result = self.call(lambda obj: (True, []))
            self.assertEqual(result['validation']['status'], 'OK')
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(self.call(lambda obj: (False, ['new check']))['validation']['errors'], ['new check'])
                self.assertEqual(self.call(lambda obj: (True, []))['validation']['status'], 'OK')
            self.assertEqual(request.call_count, 1)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(len(list(base.rglob('*.attempt-*.json'))), 2)
            self.assertEqual([a['status'] for a in result['attempts']], ['PENDING', 'HTTP_OK'])
            self.assertEqual(Path(batch.q.BASE), base)

    def test_second_interruption_cannot_create_another_recovery(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}), \
                patch.object(batch.q, 'load_key', return_value='test'), \
                patch.object(batch.q.urllib.request, 'urlopen', side_effect=KeyboardInterrupt) as request:
            base = Path(temporary)
            batch.bind(base)
            self.record(base, 'stage', self.payload, 'text-hash')
            with self.assertRaises(KeyboardInterrupt):
                self.call()
            for _ in range(3):
                self.assertEqual(self.call()['validation']['status'], 'INTERRUPTED')
            self.assertEqual(request.call_count, 1)
            self.assertEqual(len(list(base.rglob('*.attempt-*.json'))), 2)

    def test_stale_original_payload_and_text_hash_never_recover(self):
        for payload, text_hash in [({'model': 'changed'}, 'text-hash'), (self.payload, 'changed')]:
            with self.subTest(payload=payload, text_hash=text_hash), tempfile.TemporaryDirectory() as temporary, \
                    patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}):
                base = Path(temporary)
                batch.bind(base)
                self.record(base, 'stage', self.payload, 'text-hash')
                self.assertEqual(self.call(payload=payload, text_hash=text_hash)['validation']['status'], 'STALE_CACHE')
                self.assertFalse((base / 'interrupted-recovery-v1').exists())

    def test_changed_recovery_binding_or_child_hash_is_rejected(self):
        for target in ('binding', 'child'):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as temporary, \
                    patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}), \
                    patch.object(batch.q, 'load_key', return_value='test'), \
                    patch.object(batch.q.urllib.request, 'urlopen', side_effect=KeyboardInterrupt) as request:
                base = Path(temporary)
                batch.bind(base)
                self.record(base, 'stage', self.payload, 'text-hash')
                with self.assertRaises(KeyboardInterrupt):
                    self.call()
                path = (base / 'frozen/request-and-response/stage.interrupted-recovery-v1.json' if target == 'binding'
                        else base / 'interrupted-recovery-v1/stage/frozen/request-and-response/stage.attempt-1.json')
                changed = batch.load(path)
                changed['payloadHash'] = 'different'
                batch.save(path, changed)
                self.assertEqual(self.call()['validation']['status'], 'STALE_CACHE')
                self.assertEqual(request.call_count, 1)

    def test_pending_low_writer_recovery_does_not_regenerate_max_writer(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}), \
                patch.object(batch.q, 'load_key', return_value='test'), \
                patch.object(batch.q.urllib.request, 'urlopen') as request:
            directory = Path(temporary) / 'munich'
            directory.mkdir()
            prompt = 'Frozen whole-tour writer prompt'
            (directory / 'combined-prompt.md').write_text(prompt)
            payload = dict(model=batch.q.MODEL, max_tokens=32768, stream=False,
                thinking={'type': 'enabled'}, reasoning_effort='max', messages=[{'role': 'user', 'content': prompt}])
            text_hash = batch.q.sha_text(prompt)
            path = self.record(directory / 'writer', 'whole-writer', payload, text_hash, 'HTTP_OK', {})
            truncated = batch.load(path)
            truncated['entry']['finishReason'] = 'length'
            truncated['body']['choices'][0]['finish_reason'] = 'length'
            batch.save(path, truncated)
            original = path.read_bytes()
            self.record(directory / 'writer', 'whole-writer-length-recovery',
                        {**payload, 'reasoning_effort': 'low'}, text_hash)
            content = '<<<STOP:Q1>>>\nTexto conservado.\n<<<END>>>\n<<<STOP:tour-welcome>>>\nBienvenida.\n<<<END>>>\n'
            request.return_value.__enter__.return_value.read.return_value = json.dumps({
                'choices': [{'finish_reason': 'stop', 'message': {'content': content}}]}).encode()
            inputs = {'materials': [{'stopId': 'Q1'}], 'welcome': {'stopId': 'tour-welcome'}}
            for _ in range(2):
                self.assertEqual(batch.write_master(directory, inputs), {'Q1': 'Texto conservado.', 'tour-welcome': 'Bienvenida.'})
            self.assertEqual(request.call_count, 1)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(len(list(directory.rglob('*.attempt-*.json'))), 3)

    def test_completed_invalid_and_http_errors_never_get_interrupted_recovery(self):
        for status, parsed in [('HTTP_400', None), ('HTTP_429', None), ('TRANSPORT_ERROR', None),
                               ('HTTP_OK', {'pieces': []})]:
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temporary, \
                    patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}):
                base = Path(temporary)
                batch.bind(base)
                self.record(base, 'stage', self.payload, 'text-hash', status, parsed)
                self.assertEqual(self.call(lambda obj: (False, ['invalid']))['validation']['status'], 'INCOMPLETE')
                self.assertFalse((base / 'interrupted-recovery-v1').exists())

    def test_successful_original_wins(self):
        with tempfile.TemporaryDirectory() as temporary, \
                patch.dict(os.environ, {'DEEPSEEK_RECOVER_INTERRUPTED': '1'}):
            base = Path(temporary)
            batch.bind(base)
            path = self.record(base, 'stage', self.payload, 'text-hash', 'HTTP_OK', {'pieces': []})
            original = path.read_bytes()
            self.assertEqual(self.call()['validation']['status'], 'OK')
            self.assertEqual(path.read_bytes(), original)
            self.assertFalse((base / 'interrupted-recovery-v1').exists())


if __name__ == '__main__':
    unittest.main()
