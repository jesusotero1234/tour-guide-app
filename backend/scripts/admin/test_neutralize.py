import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN = Path(__file__).resolve().parent
sys.path.insert(0, str(ADMIN))
import neutralize as nz

BODY = ("Las Torres de Serranos se levantaron a finales del siglo catorce para defender la entrada norte de la ciudad. "
        "Su fachada exterior es sobria y maciza, pensada para impresionar a quien llegaba por el camino. "
        "En la guerra de 1936 sirvieron de almacén de obras de arte, y esa función explica su buen estado actual. "
        "Hoy se pueden subir y desde lo alto se entiende la forma de la antigua muralla.")
ANNOUNCEMENT = "La siguiente parada es la Plaza de la Virgen, donde empezó todo."
STOP = BODY + " " + ANNOUNCEMENT


class Recorder:
    def __init__(self, *answers):
        self.answers, self.requests = list(answers), []

    def __call__(self, system, data, request_id, validator):
        self.requests.append((system, data, request_id))
        answer = self.answers.pop(0)
        return None if answer is None else {'edits': answer}


def cut(text=ANNOUNCEMENT, reason='NEXT_STOP'):
    return {'before': text, 'after': '', 'reason': reason}


class Edits(unittest.TestCase):
    def test_applies_edits_and_tidies_the_gaps(self):
        body, errors = nz.apply_edits(STOP, [cut()])
        self.assertEqual((body, errors), (BODY, []))

    def test_every_before_must_occur_exactly_once(self):
        self.assertIn('0 times', nz.apply_edits(STOP, [cut('no existe')])[1][0])
        self.assertIn('2 times', nz.apply_edits("Hola. Hola.", [{'before': 'Hola.', 'after': '', 'reason': 'START'}])[1][0])
        self.assertIn('non-empty', nz.apply_edits(STOP, [{'before': '', 'after': 'x', 'reason': 'START'}])[1][0])
        self.assertIn('non-empty', nz.apply_edits(STOP, [{'after': 'x'}])[1][0])

    def test_overlapping_edits_are_refused(self):
        errors = nz.apply_edits("Uno dos tres cuatro.", [{'before': 'dos tres', 'after': '', 'reason': 'START'}, {'before': 'tres cuatro', 'after': '', 'reason': 'START'}])[1]
        self.assertEqual(errors, ['edits overlap'])

    def test_french_spacing_before_double_punctuation_is_not_touched(self):
        text = "Quelle histoire ! Voici la raison : la porte. La prochaine étape est la tour."
        body, errors = nz.apply_edits(text, [{'before': 'La prochaine étape est la tour.', 'after': '', 'reason': 'NEXT_STOP'}])
        self.assertEqual((body, errors), ("Quelle histoire ! Voici la raison : la porte.", []))

    def test_paragraphs_survive_and_empty_ones_disappear(self):
        body, _ = nz.apply_edits("Primero.\n\nLa siguiente parada es X.\n\nTercero.", [cut("La siguiente parada es X.")])
        self.assertEqual(body, "Primero.\n\nTercero.")


class Guard(unittest.TestCase):
    def test_accepts_the_removal_of_the_announcement(self):
        body, errors = nz.guard(STOP, [cut()], 'es', 'stop', next_name='Plaza de la Virgen')
        self.assertEqual((body, errors), (BODY, []))

    def test_a_reference_that_survives_is_refused(self):
        _, errors = nz.guard(STOP, [{'before': 'donde empezó todo', 'after': 'donde nació', 'reason': 'NEXT_STOP'}], 'es', 'stop', next_name='Plaza de la Virgen')
        self.assertTrue(any('order are still present' in e for e in errors), errors)

    def test_replacing_one_announcement_with_another_is_refused(self):
        _, errors = nz.guard(STOP, [{'before': ANNOUNCEMENT, 'after': 'Ahora vamos hacia la Plaza de la Virgen.', 'reason': 'NEXT_STOP'}], 'es', 'stop')
        self.assertTrue(any('still present' in e for e in errors))

    def test_too_many_characters_changed(self):
        sentences = [f"Frase única número {i} con contenido histórico verificable." for i in range(40)]
        text = " ".join(sentences) + " " + ANNOUNCEMENT
        big = {'before': " ".join(sentences[:12]), 'after': 'Resumen.', 'reason': 'NEXT_STOP'}
        _, errors = nz.guard(text, [cut(), big], 'es', 'stop')
        self.assertTrue(any('characters were removed' in e for e in errors), errors)

    def test_losing_sentences_is_refused(self):
        sentences = [f"Frase número {i} con bastante contenido histórico verificable." for i in range(10)]
        text = " ".join(sentences) + " La siguiente parada es X."
        edits = [{'before': " ".join(sentences[:3]), 'after': '', 'reason': 'NEXT_STOP'}, cut("La siguiente parada es X.")]
        _, errors = nz.guard(text, edits, 'es', 'stop')
        self.assertTrue(any('sentences were kept' in e for e in errors), errors)

    def test_an_emptied_text_or_last_paragraph_is_refused(self):
        _, errors = nz.guard("La siguiente parada es X.", [cut("La siguiente parada es X.")], 'es', 'stop')
        self.assertTrue(any('empty' in e for e in errors))

    def test_an_itinerary_introduction_may_be_rewritten_but_not_lose_its_stops(self):
        intro = ("Bienvenido a Valencia, una ciudad que cambió de oficio. Empezamos en el Palacio de la Generalidad, que fue sede de reuniones. "
                 "Seguiremos por las Torres de Serranos, que fueron puerta y cárcel. Terminaremos en el Palacio de Dos Aguas, residencia hecha museo. "
                 "Acompáñanos a descubrirlo.")
        names = ["Palacio de la Generalidad", "Torres de Serranos", "Palacio de Dos Aguas"]
        good = [{"before": "Empezamos en el Palacio de la Generalidad, que fue sede de reuniones.", "after": "El Palacio de la Generalidad fue sede de reuniones.", "reason": "START"},
                {"before": "Seguiremos por las Torres de Serranos, que fueron puerta y cárcel.", "after": "Las Torres de Serranos fueron puerta y cárcel.", "reason": "NEXT_STOP"},
                {"before": "Terminaremos en el Palacio de Dos Aguas, residencia hecha museo.", "after": "El Palacio de Dos Aguas es una residencia hecha museo.", "reason": "FINISH"}]
        body, errors = nz.guard(intro, good, 'es', 'introduction', names)
        self.assertEqual(errors, [], errors)
        self.assertIn("Las Torres de Serranos fueron puerta", body)
        # one stop may lose its full name in a teaser; two lost is a rewrite that dropped content
        one = [{"before": "Seguiremos por las Torres de Serranos, que fueron puerta y cárcel.", "after": "", "reason": "NEXT_STOP"}] + [good[0], good[2]]
        self.assertEqual(nz.guard(intro, one, 'es', 'introduction', names)[1], [])
        two = one + []
        two[0] = {"before": "Seguiremos por las Torres de Serranos, que fueron puerta y cárcel.", "after": "", "reason": "NEXT_STOP"}
        two[2] = {"before": "Terminaremos en el Palacio de Dos Aguas, residencia hecha museo.", "after": "", "reason": "FINISH"}
        _, errors = nz.guard(intro, two, 'es', 'introduction', names)
        self.assertTrue(any("no longer names" in e for e in errors), errors)
        # a stop keeps the strict rule: the same amount of rewriting is refused there
        _, errors = nz.guard(intro, good, 'es', 'stop', names)
        self.assertTrue(errors)

    def test_a_fragment_quoted_with_different_spacing_is_still_found_once(self):
        original = "Primera frase.\n\nSeguiremos por las Torres de Serranos, que fueron puerta.  Última frase."
        body, errors = nz.apply_edits(original, [{"before": "Seguiremos por las Torres de Serranos, que fueron puerta.", "after": "Las Torres de Serranos fueron puerta."}])
        self.assertEqual(errors, [])
        self.assertIn("Las Torres de Serranos fueron puerta.", body)
        _, errors = nz.apply_edits("Hola mundo. Hola mundo.", [{"before": "Hola   mundo.", "after": ""}])
        self.assertTrue(errors, "an ambiguous fragment is still refused")
        _, errors = nz.apply_edits("Hola mundo.", [{"before": "Adiós mundo.", "after": ""}])
        self.assertTrue(errors, "and a fragment that is not there")

    def test_the_bare_name_of_the_next_stop_is_accepted_only_on_the_last_attempt_and_reported(self):
        text = BODY + " Muy cerca queda la Plaza de la Virgen."
        _, errors, soft = nz.guard_detail(text, [], 'es', 'stop', ['Plaza de la Virgen'], 'Plaza de la Virgen')
        self.assertTrue(errors and not soft)
        _, errors, soft = nz.guard_detail(text, [], 'es', 'stop', ['Plaza de la Virgen'], 'Plaza de la Virgen', lenient_next_name=True)
        self.assertEqual(errors, [])
        self.assertEqual([f['match'] for f in soft], ['Plaza de la Virgen'])
        # a real announcement is never softened
        _, errors, _ = nz.guard_detail(BODY + " La siguiente parada es la Plaza de la Virgen.", [], 'es', 'stop', ['Plaza de la Virgen'], 'Plaza de la Virgen', lenient_next_name=True)
        self.assertTrue(errors)

    def test_introduction_start_and_last_stop_finish(self):
        intro = "Valencia nació como colonia romana en el año ciento treinta y ocho antes de Cristo y ha cambiado mucho desde entonces. Empezamos en las Torres de Serranos."
        _, errors = nz.guard(intro, [cut("Empezamos en las Torres de Serranos.", 'START')], 'es', 'introduction')
        self.assertEqual(errors, [])
        last = BODY + " Terminamos aquí el recorrido."
        body, errors = nz.guard(last, [cut("Terminamos aquí el recorrido.", 'FINISH')], 'es', 'last_stop')
        self.assertEqual((body, errors), (BODY, []))
        _, errors = nz.guard(last, [], 'es', 'last_stop')
        self.assertTrue(any('FINISH' in e for e in errors))


class Piece(unittest.TestCase):
    def test_a_piece_without_references_needs_no_model(self):
        recorder = Recorder()
        record = nz.neutralize_piece({'pieceId': 'p1', 'text': BODY}, 'es', 'stop', recorder, 'r', next_name='Plaza de la Virgen')
        self.assertEqual((record['status'], record['attempts'], record['body'], recorder.requests), ('ok', 0, BODY, []))

    def test_success_records_the_edits_and_what_was_found(self):
        recorder = Recorder([cut()])
        record = nz.neutralize_piece({'pieceId': 'p1', 'text': STOP}, 'es', 'stop', recorder, 'r', place_name='Torres de Serranos',
                                     other_stops=['Plaza de la Virgen'], next_name='Plaza de la Virgen')
        self.assertEqual((record['status'], record['body'], record['attempts']), ('ok', BODY, 1))
        self.assertEqual(record['original'], STOP)
        self.assertEqual(record['edits'], [cut()])
        self.assertEqual(record['findingsBefore'][0]['kind'], 'NEXT_STOP')
        system, data, _ = recorder.requests[0]
        self.assertIn('español', system)
        self.assertEqual((data['role'], data['placeName'], data['text']), ('stop', 'Torres de Serranos', STOP))

    def test_a_refused_attempt_is_retried_once_with_the_reason_and_then_given_up(self):
        bad = [{'before': 'donde empezó todo', 'after': 'donde nació', 'reason': 'NEXT_STOP'}]
        recorder = Recorder(bad, [cut()])
        record = nz.neutralize_piece({'pieceId': 'p1', 'text': STOP}, 'es', 'stop', recorder, 'r', next_name='Plaza de la Virgen')
        self.assertEqual((record['status'], record['attempts']), ('ok', 2))
        self.assertIn('previousAttemptFailed', recorder.requests[1][1])
        failing = nz.neutralize_piece({'pieceId': 'p1', 'text': STOP}, 'es', 'stop', Recorder(bad, None, None), 'r', next_name='Plaza de la Virgen')
        self.assertEqual((failing['status'], failing['attempts'], failing['body']), ('needs_manual', 3, STOP))
        self.assertEqual(len(failing['reasons']), 3)


class Tour(unittest.TestCase):
    tour = {'pieces': [
        {'pieceId': 'intro', 'kind': 'introduction', 'name': 'Valencia', 'text': "Valencia es una ciudad con más de dos mil años de historia y mucho que contar. Empezamos en la Torre A."},
        {'pieceId': 'a', 'kind': 'stop', 'name': 'Torre A', 'text': BODY + " La siguiente parada es la Torre B."},
        {'pieceId': 'b', 'kind': 'stop', 'name': 'Torre B', 'text': BODY + " Terminamos aquí el recorrido."}]}

    def test_roles_and_successors_come_from_the_published_order(self):
        recorder = Recorder([cut("Empezamos en la Torre A.", 'START')], [cut("La siguiente parada es la Torre B.")], [cut("Terminamos aquí el recorrido.", 'FINISH')])
        result = nz.neutralize_tour(self.tour, 'es', recorder, 'v')
        self.assertEqual([p['role'] for p in result['pieces']], ['introduction', 'stop', 'last_stop'])
        self.assertEqual([p['status'] for p in result['pieces']], ['ok', 'ok', 'ok'])
        self.assertFalse(result['excluded'])
        self.assertEqual(recorder.requests[1][1]['otherStops'], ['Torre B'])
        self.assertEqual([r[2] for r in recorder.requests], ['v-intro-a1', 'v-a-a1', 'v-b-a1'])
        self.assertTrue(all(p['body'] == BODY or p['pieceId'] == 'intro' for p in result['pieces']))

    def test_one_piece_that_needs_manual_review_excludes_the_tour(self):
        recorder = Recorder([cut("Empezamos en la Torre A.", 'START')], None, None, None, [cut("Terminamos aquí el recorrido.", 'FINISH')])
        result = nz.neutralize_tour(self.tour, 'es', recorder, 'v')
        self.assertTrue(result['excluded'])
        self.assertEqual([p['status'] for p in result['pieces']], ['ok', 'needs_manual', 'ok'])

    def test_estimate_and_cli_never_call_the_model(self):
        report = nz.estimate([self.tour], 'es')
        self.assertEqual((report['pieces'], report['requests']), (3, 3))
        self.assertLess(report['worstCaseUsd'], 0.01)
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'tour.json'
            source.write_text(json.dumps(self.tour))
            run = lambda *a: subprocess.run([sys.executable, str(ADMIN / 'neutralize.py'), '--lang', 'es', '--in', str(source), *a], capture_output=True, text=True)
            self.assertEqual(json.loads(run('--estimate').stdout)['requests'], 3)
            self.assertNotEqual(run('--execute').returncode, 0)             # needs --out and --stage
            self.assertNotEqual(run().returncode, 0)                        # a mode is mandatory


if __name__ == '__main__':
    unittest.main()
