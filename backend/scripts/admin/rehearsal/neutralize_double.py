#!/usr/bin/env python3
"""TEST DOUBLE of neutralize.py for the rehearsal. It never calls a model and never spends money.

It answers every request the way a careful model would, deleting each sentence that the detector flagged, and then the real
guard of neutralize.py decides whether the edits are acceptable. Use it only through REGEN_NEUTRALIZE_SCRIPT in the rehearsal.
"""
import sys
from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ADMIN))
sys.path.insert(0, str(ADMIN / "editorial_runtime"))
import neutralize  # noqa: E402
import order_neutral as on  # noqa: E402
import speech_repair  # noqa: E402


def fake_caller(stage_dir):
    def call(system, request, request_id, validator):
        text = request["text"]
        spans = on.sentences(text)
        edits = []
        for finding in request["findings"]:
            start, end = spans[finding["sentence_index"]]
            before = text[start:end].strip()
            if before and text.count(before) == 1 and all(e["before"] != before for e in edits):
                edits.append({"before": before, "after": "", "reason": finding["kind"]})
        return {"edits": edits}
    return call


speech_repair.default_caller = fake_caller
raise SystemExit(neutralize.main())
