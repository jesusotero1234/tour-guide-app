import json
import subprocess
import sys
import unittest
from pathlib import Path

ADMIN = Path(__file__).resolve().parent
sys.path.insert(0, str(ADMIN))
import speech_repair as sr
from utils.speech import gate


class Recorder:
    """Stands in for DeepSeek: returns canned answers in order and records the requests it received."""
    def __init__(self, *answers):
        self.answers, self.requests = list(answers), []

    def __call__(self, system, data, request_id, validator):
        self.requests.append((system, data, request_id))
        answer = self.answers.pop(0)
        return None if answer is None else {"sentences": answer}


def piece(text):
    return {"pieceId": "p1", "spokenText": text}


class MarkingAndGuard(unittest.TestCase):
    def test_marks_whole_tokens_and_merges_digit_runs(self):
        sentence = "Llegó en 1248, con 3 amigos."
        spans = sr.mark_spans(sentence, [v for v in gate(sentence, "es")])
        self.assertEqual([sentence[s:e] for s, e in spans], ["1248", "3"])
        self.assertEqual(sr.marked(sentence, spans), "Llegó en ⟦1248⟧, con ⟦3⟧ amigos.")

    def test_a_german_ordinal_dot_inside_the_sentence_is_marked_with_the_numeral_but_a_final_dot_is_not(self):
        inside = "Ludwig VII. baute hier."
        spans = sr.mark_spans(inside, gate(inside, "de"), "de")
        self.assertEqual([inside[s:e] for s, e in spans], ["VII."])
        self.assertIsNone(sr.guard(inside, spans, "Ludwig der Siebte baute hier.", "de"))
        final = "Er folgte Ludwig VII."
        spans = sr.mark_spans(final, gate(final, "de"), "de")
        self.assertEqual([final[s:e] for s, e in spans], ["VII"])
        self.assertEqual([inside[s:e] for s, e in sr.mark_spans(inside, gate(inside, "de"))], ["VII"])   # other languages keep the old behaviour

    def test_guard_accepts_only_a_rewrite_of_the_marked_tokens(self):
        original = "Llegó en 1248, con 3 amigos."
        spans = sr.mark_spans(original, gate(original, "es"))
        ok = "Llegó en mil doscientos cuarenta y ocho, con tres amigos."
        self.assertIsNone(sr.guard(original, spans, ok, "es"))
        self.assertIn("outside", sr.guard(original, spans, ok.replace("Llegó", "Llegaron"), "es"))
        self.assertIn("outside", sr.guard(original, spans, ok.replace(",", ";"), "es"))
        self.assertIn("digits", sr.guard(original, spans, "Llegó en mil 248, con tres amigos.", "es"))
        self.assertIn("deleted", sr.guard(original, spans, "Llegó en  , con tres amigos.", "es"))
        self.assertIn("outside", sr.guard(original, spans, "Llegó en , con tres amigos.", "es"))
        self.assertIn("marks", sr.guard(original, spans, "Llegó en ⟦mil⟧, con tres amigos.", "es"))
        self.assertIn("digits", sr.guard(original, spans, "Llegó en veinte (1), con tres amigos.", "es"))


class RepairPiece(unittest.TestCase):
    def test_clean_pieces_make_no_request(self):
        recorder = Recorder()
        result = sr.repair_piece(piece("Todo en letras."), "es", recorder, "p1")
        self.assertEqual((result["status"], result["attempts"], recorder.requests), ("clean", 0, []))

    def test_repairs_only_the_flagged_sentences_and_keeps_every_separator(self):
        text = "Primera frase limpia.\n\nLa Via Roma 3 es antigua. Última frase."
        recorder = Recorder([{"i": 1, "spoken": "La Via Roma tres es antigua."}])
        result = sr.repair_piece(piece(text), "es", recorder, "p1")
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["spokenText"], "Primera frase limpia.\n\nLa Via Roma tres es antigua. Última frase.")
        self.assertEqual(len(recorder.requests), 1)
        sent = recorder.requests[0][1]
        self.assertEqual(sent["sentences"], [{"i": 1, "text": "La Via Roma ⟦3⟧ es antigua."}])
        self.assertEqual(result["llmRepairs"][0]["before"], "La Via Roma 3 es antigua.")
        self.assertEqual(result["llmRepairs"][0]["model"], "deepseek-v4-flash")
        self.assertEqual(gate(result["spokenText"], "es"), [])

    def test_a_refused_answer_is_retried_once_with_the_reason(self):
        recorder = Recorder([{"i": 0, "spoken": "La Via Roma tres es muy antigua."}], [{"i": 0, "spoken": "La Via Roma tres es antigua."}])
        result = sr.repair_piece(piece("La Via Roma 3 es antigua."), "es", recorder, "p1")
        self.assertEqual((result["status"], result["attempts"]), ("ok", 2))
        self.assertIn("previousAttemptFailed", recorder.requests[1][1])
        self.assertNotIn("previousAttemptFailed", recorder.requests[0][1])
        self.assertEqual(len(result["reasons"]), 1)

    def test_two_failures_leave_the_piece_for_manual_review_with_its_residue(self):
        bad = [{"i": 0, "spoken": "La Via Roma 3 es antigua."}]
        recorder = Recorder(bad, None)
        result = sr.repair_piece(piece("La Via Roma 3 es antigua."), "es", recorder, "p1")
        self.assertEqual((result["status"], result["attempts"]), ("needs_manual", 2))
        self.assertEqual(result["spokenText"], "La Via Roma 3 es antigua.")
        self.assertTrue(result["violations"])
        self.assertEqual(result["llmRepairs"], [])

    def test_a_partly_repaired_piece_is_needs_manual_but_keeps_what_was_fixed(self):
        text = "La Via Roma 3 es vieja. El Paseo 7 es nuevo."
        recorder = Recorder([{"i": 0, "spoken": "La Via Roma tres es vieja."}, {"i": 1, "spoken": "El Paseo 7 es nuevo."}],
                            [{"i": 1, "spoken": "El Paseo 7 es nuevo."}])
        result = sr.repair_piece(piece(text), "es", recorder, "p1")
        self.assertEqual(result["status"], "needs_manual")
        self.assertTrue(result["spokenText"].startswith("La Via Roma tres es vieja."))
        self.assertEqual(len(result["llmRepairs"]), 1)

    def test_the_system_prompt_names_the_language(self):
        recorder = Recorder([{"i": 0, "spoken": "Die Straße fünf."}])
        sr.repair_piece(piece("Die Straße 5."), "de", recorder, "p1")
        self.assertIn("alemán", recorder.requests[0][0])


class EstimateAndCli(unittest.TestCase):
    def test_estimate_counts_only_sentences_with_residue_and_makes_no_call(self):
        pieces = [piece("Limpia."), piece("Via Roma 3. Otra limpia. Calle 7 también."), piece("Nada.")]
        report = sr.estimate(pieces, "es")
        self.assertEqual((report["pieces"], report["piecesWithResidue"], report["sentences"]), (3, 1, 2))
        self.assertGreater(report["worstCaseUsd"], 0)
        self.assertLess(report["worstCaseUsd"], 0.01)

    def test_execute_requires_output_and_stage_and_never_runs_by_default(self):
        import tempfile
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "speech.json"
            source.write_text(json.dumps({"pieces": [piece("Via Roma 3.")]}))
            only = subprocess.run([sys.executable, str(ADMIN / "speech_repair.py"), "--lang", "es", "--in", str(source)], capture_output=True, text=True)
            self.assertNotEqual(only.returncode, 0)                    # a mode is mandatory
            refused = subprocess.run([sys.executable, str(ADMIN / "speech_repair.py"), "--lang", "es", "--in", str(source), "--execute"], capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)                 # --execute without --out/--stage
            estimate = subprocess.run([sys.executable, str(ADMIN / "speech_repair.py"), "--lang", "es", "--in", str(source), "--estimate"], capture_output=True, text=True)
            self.assertEqual(estimate.returncode, 0, estimate.stderr)
            self.assertEqual(json.loads(estimate.stdout)["piecesWithResidue"], 1)


if __name__ == "__main__":
    unittest.main()
