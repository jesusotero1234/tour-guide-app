#!/usr/bin/env python3
import importlib.util
import sys
import unittest
from pathlib import Path

POD = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("whisper_check", POD / "scripts/speech-whisper-check.py")
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class WordsAndWer(unittest.TestCase):
    def test_both_sides_are_normalised_so_digits_and_romans_match_their_words(self):
        spoken = "Jaime primero llegó en mil doscientos cuarenta y ocho."
        heard = "Jaime I llegó en 1248"                       # what Whisper writes
        self.assertEqual(check.words(spoken, "es"), check.words(heard, "es"))
        self.assertEqual(check.compare(spoken, heard, "es")["wordErrorRate"], 0)

    def test_accents_case_and_punctuation_do_not_count(self):
        self.assertEqual(check.compare("El Árbol, grande.", "el arbol grande", "es")["wordEdits"], 0)

    def test_word_error_rate_counts_substitutions_insertions_and_deletions(self):
        result = check.compare("la torre alta de la ciudad", "la torre baja la ciudad vieja", "es")
        self.assertEqual((result["wordEdits"], result["expectedWords"]), (3, 6))
        self.assertEqual(result["wordErrorRate"], 0.5)
        # Several alignments cost the same; whichever is reported, it must name exactly the words that differ.
        self.assertEqual({d["expected"] for d in result["differences"]} - {""}, {"alta", "de"})
        self.assertEqual({d["heard"] for d in result["differences"]} - {""}, {"baja", "vieja"})

    def test_german_ordinals_match_both_ways(self):
        self.assertEqual(check.compare("im neunzehnten Jahrhundert", "im 19. Jahrhundert", "de")["wordEdits"], 0)


class Sampling(unittest.TestCase):
    pieces = [{"pieceId": f"p{i}", "audio": f"a{i}.mp3", "spokenText": "hola mundo"} for i in range(400)]

    def test_flagged_pieces_are_always_checked_and_the_rest_by_a_stable_fraction(self):
        pieces = [dict(p, flagged=(i % 100 == 0)) for i, p in enumerate(self.pieces)]
        chosen = check.choose(pieces, 0.05)
        self.assertTrue(all(p["pieceId"] in {c["pieceId"] for c in chosen} for p in pieces if p["flagged"]))
        self.assertTrue(400 * 0.02 < len(chosen) < 400 * 0.12)
        self.assertEqual(check.choose(list(reversed(pieces)), 0.05).__len__(), len(chosen))
        self.assertEqual({p["pieceId"] for p in check.choose(pieces, 0.05)}, {p["pieceId"] for p in chosen})

    def test_run_builds_the_listening_queue_with_a_fake_transcriber(self):
        manifest = {"language": "es", "pieces": [
            {"pieceId": "ok", "audio": "ok.mp3", "spokenText": "la torre alta", "flagged": True},
            {"pieceId": "bad", "audio": "bad.mp3", "spokenText": "la torre alta de la ciudad vieja", "flagged": True}]}
        heard = {"ok.mp3": "La torre alta.", "bad.mp3": "la torre baja"}
        report = check.run(manifest, lambda audio, lang: heard[audio], fraction=0, threshold=0.15)
        self.assertEqual((report["checked"], report["ofPieces"]), (2, 2))
        self.assertEqual(report["listeningQueue"], ["bad"])
        self.assertGreater(report["meanWordErrorRate"], 0.2)


if __name__ == "__main__":
    unittest.main()
