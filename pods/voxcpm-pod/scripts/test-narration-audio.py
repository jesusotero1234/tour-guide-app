"""CPU regression checks for finished narration volume and ending."""
from pathlib import Path
import sys
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from utils.narration_audio import finish_narration


class NarrationAudioTests(unittest.TestCase):
    def test_quiet_speech_is_amplified_without_mutating_input(self):
        source = np.full(24000, 0.1, dtype=np.float32)
        result = finish_narration(source, 24000)
        np.testing.assert_allclose(result[:23760], 0.4)
        np.testing.assert_allclose(source, 0.1)

    def test_peaks_are_bounded_for_quiet_and_loud_narration(self):
        for peak in (0.3, 0.8, 1.5):
            with self.subTest(peak=peak):
                source = np.tile(np.array([peak, -peak], dtype=np.float32), 12000)
                result = finish_narration(source, 24000)
                self.assertLessEqual(float(np.max(np.abs(result))), 0.950001)
                self.assertAlmostEqual(float(result[0]), 0.95, places=6)

    def test_only_last_ten_ms_fade_and_tail_is_silent(self):
        source = np.full(24000, 0.5, dtype=np.float32)
        for rate in (24000, 48000):
            with self.subTest(rate=rate):
                result = finish_narration(source, rate)
                self.assertEqual(len(result), len(source) + round(rate * 0.9))
                np.testing.assert_allclose(result[:len(source) - round(rate * 0.01)], 0.95)
                self.assertEqual(result[len(source) - 1], 0)
                self.assertTrue(np.all(result[len(source):] == 0))

    def test_invalid_and_silent_audio_is_rejected(self):
        for audio in (np.array([]), np.zeros(50), np.array([np.nan]), np.array([np.inf]), np.ones((2, 2))):
            with self.assertRaises(ValueError):
                finish_narration(audio, 24000)
        with self.assertRaises(ValueError):
            finish_narration(np.ones(50), 0)


if __name__ == "__main__":
    unittest.main()
