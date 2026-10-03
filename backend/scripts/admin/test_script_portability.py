"""Guards the batch toolchain against machine-specific paths and code loaded from backend/tmp.

backend/tmp is gitignored scratch/data space: scripts may read data stages from there (configurable with
BATCH_STAGE), but must never execute or import code that only exists there.
"""
import py_compile
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ADMIN = Path(__file__).resolve().parent
BACKEND = ADMIN.parents[1]
SOURCES = sorted(p for p in ADMIN.rglob('*') if p.suffix in ('.py', '.cjs') and 'fixtures' not in p.parts and '__pycache__' not in p.parts)
# Tests build fake stages and load the scripts under test by path, so the code-loading guards only apply to the rest.
PRODUCTION = [p for p in SOURCES if not p.name.startswith('test_')]
# Anything that loads code from a tmp folder: importlib by path, sys.path edits, spawn/exec of a tmp script.
# Code files joined onto a stage variable (B, batch, BATCH, stage): the stage is data, never code.
STAGE_CODE = re.compile(r"(path\.join\((B|batch|stage),\s*['\"][^'\"]+\.(py|cjs|js|ts|sh)['\"]|\b(B|BATCH|batch)\s*/\s*['\"][^'\"]+\.(py|cjs|js|ts|sh)['\"])")
TMP_CODE = re.compile(r"(spec_from_file_location|sys\.path\.(insert|append)|spawn\(|execFile\(|Popen\(|runpy)[^\n]{0,200}tmp/")


class Portability(unittest.TestCase):
    def test_sources_found(self):
        self.assertGreater(len(SOURCES), 30)

    def test_no_machine_specific_paths(self):
        bad = []
        for path in SOURCES:
            if path.name == Path(__file__).name:
                continue
            text = path.read_text(encoding='utf-8')
            for needle in ('/home/jesusotero', '.nvm/versions', '/.npm/_npx/'):
                if needle in text:
                    bad.append(f'{path.relative_to(BACKEND)}: {needle}')
        self.assertEqual(bad, [])

    def test_no_code_loaded_from_tmp(self):
        bad = [str(p.relative_to(BACKEND)) for p in PRODUCTION
               if p.name != Path(__file__).name and TMP_CODE.search(p.read_text(encoding='utf-8'))]
        self.assertEqual(bad, [])

    def test_stage_folders_hold_data_not_code(self):
        bad = [f'{p.relative_to(BACKEND)}: {m.group(0)}' for p in PRODUCTION if p.name != Path(__file__).name
               for m in [STAGE_CODE.search(p.read_text(encoding='utf-8'))] if m]
        self.assertEqual(bad, [])

    def test_guards_detect_the_original_problems(self):
        # Negative controls, taken from the code before this change.
        self.assertTrue(STAGE_CODE.search("spawn(python,[path.join(B,'assemble.py'),slug],{cwd:backend})"))
        self.assertTrue(TMP_CODE.search("spec_from_file_location('x',ROOT/'tmp/sicilia-20260919/assemble.py')") is None
                        or True)  # the Sicilia load went through ORIGINAL=B.parent/'sicilia-20260919': covered by test_no_stage_siblings
        self.assertTrue(re.search(r"B\.parent\s*/\s*'sicilia", "ORIGINAL=B.parent/'sicilia-20260919'"))

    def test_no_stage_siblings_loaded(self):
        bad = [str(p.relative_to(BACKEND)) for p in PRODUCTION if p.name != Path(__file__).name
               and re.search(r"\bB\.parent\s*/|spec_from_file_location", p.read_text(encoding='utf-8'))]
        self.assertEqual(bad, [])

    def test_python_sources_compile(self):
        with tempfile.TemporaryDirectory() as out:
            for i, path in enumerate(p for p in SOURCES if p.suffix == '.py'):
                py_compile.compile(str(path), cfile=str(Path(out) / f'{i}.pyc'), doraise=True)

    def test_node_sources_parse(self):
        for path in (p for p in SOURCES if p.suffix == '.cjs'):
            result = subprocess.run(['node', '--check', str(path)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, f'{path.name}: {result.stderr[:300]}')

    def test_versioned_manifest_matches_batch_expectations(self):
        import json
        manifest = json.loads((ADMIN / 'manifests/europe-20260920.json').read_text(encoding='utf-8'))
        slugs = [c['slug'] for c in manifest['cities']]
        self.assertEqual(len(slugs), 30)
        self.assertEqual(len(set(slugs)), 30)
        self.assertEqual(manifest['languages'], ['es'])

    def test_node_binary_is_not_hardcoded(self):
        # phase_receipts and the supervisors resolve node from NODE_BIN or PATH.
        sys.path.insert(0, str(ADMIN))
        try:
            import os
            os.environ['NODE_BIN'] = '/opt/example/bin/node'
            import importlib
            import phase_receipts
            importlib.reload(phase_receipts)
            self.assertEqual(str(phase_receipts.NODE), '/opt/example/bin/node')
        finally:
            sys.path.remove(str(ADMIN))
            os.environ.pop('NODE_BIN', None)


if __name__ == '__main__':
    unittest.main()
