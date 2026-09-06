"""Regression checks for paragraph boundaries in narrated text."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from utils.sanitize import chunk_text, sanitize_text


class ParagraphBoundariesTest(unittest.TestCase):
    def test_blank_lines_survive_cleanup(self):
        for source in (
            "Uno.\n\nDos.",
            "Uno.\n \t\n  Dos.",
            "Uno.\r\n\r\nDos.",
        ):
            with self.subTest(source=source):
                self.assertEqual(sanitize_text(source), "Uno.\n\nDos.")

    def test_line_wrap_is_not_a_paragraph(self):
        self.assertEqual(
            sanitize_text("Una frase\nen dos líneas."),
            "Una frase en dos líneas.",
        )

    def test_splitting_keeps_words_and_paragraph_end(self):
        text = sanitize_text("Uno aquí. Dos aquí.\n\nTres aquí.")
        chunks = chunk_text(text, max_chars=12)
        self.assertEqual(" ".join(c.text for c in chunks).split(), text.split())
        self.assertEqual(
            [(c.text, c.boundary) for c in chunks],
            [("Uno aquí.", "sentence"), ("Dos aquí.", "paragraph"), ("Tres aquí.", "sentence")],
        )


if __name__ == "__main__":
    unittest.main()
