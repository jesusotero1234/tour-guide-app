import os, re, sys, json
from collections import defaultdict, deque
B = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'backend'))  # <repo>/backend
OUT = os.environ.get('REACH_OUT', os.path.dirname(os.path.abspath(__file__)))
EXTS = ('.ts', '.tsx', '.js', '.cjs', '.mjs')
SKIP_DIRS = {'node_modules', 'dist', 'dist-generation', 'tmp', 'output', 'data', 'logs', 'fixtures', '__pycache__'}
files = []
for top in ('src', 'scripts', 'prisma'):
    for root, dirs, fs in os.walk(os.path.join(B, top)):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in fs:
            if f.endswith(EXTS) or f.endswith('.json') and root.startswith(os.path.join(B, 'src')):
                files.append(os.path.relpath(os.path.join(root, f), B))
fileset = set(files)
lines = {f: sum(1 for _ in open(os.path.join(B, f), encoding='utf8', errors='ignore')) for f in files}

def strip_comments(s):
    # remove block comments and line comments (rough, avoid strings with // like URLs by requiring start-of-line or whitespace)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'(^|[\s;])//[^\n]*', r'\1', s)
    return s

PATS = [
    re.compile(r'''\bfrom\s*['"]([^'"]+)['"]'''),
    re.compile(r'''\bimport\s*['"]([^'"]+)['"]'''),
    re.compile(r'''\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)'''),
    re.compile(r'''\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)'''),
    re.compile(r'''\brequire\.resolve\s*\(\s*['"]([^'"]+)['"]\s*\)'''),
    re.compile(r'''\bjest\.(?:mock|requireActual|doMock)\s*\(\s*['"]([^'"]+)['"]'''),
]
def resolve(spec, frm):
    if spec.startswith('@/'):
        base = os.path.join(B, 'src', spec[2:])
    elif spec.startswith('.'):
        base = os.path.normpath(os.path.join(B, os.path.dirname(frm), spec))
    else:
        return None
    cands = [base] + [base + e for e in EXTS + ('.json',)] + [os.path.join(base, 'index' + e) for e in EXTS]
    # .js specifiers pointing at .ts sources
    if base.endswith('.js'):
        cands.append(base[:-3] + '.ts')
    for c in cands:
        r = os.path.relpath(c, B)
        if r in fileset and os.path.isfile(c):
            return r
    return '__UNRESOLVED__:' + spec

edges = defaultdict(set)
unresolved = []
for f in files:
    if f.endswith('.json'):
        continue
    src = strip_comments(open(os.path.join(B, f), encoding='utf8', errors='ignore').read())
    for p in PATS:
        for m in p.finditer(src):
            r = resolve(m.group(1), f)
            if r is None: continue
            if r.startswith('__UNRESOLVED__'):
                unresolved.append((f, m.group(1)))
            else:
                edges[f].add(r)

# Spawn / runtime-string edges (child_process with ts-node/tsx/dist-generation)
SPAWN = {
    'src/services/CodexTourProcess.ts': ['scripts/validation/narrative-user-canary-v8.ts', 'scripts/validation/narrative-blueprint-author-v8.ts'],
    'src/services/CodexTourGenerator.ts': ['scripts/validation/narrative-user-canary-v8.ts'],
    'src/infrastructure/poi/OverpassCoordinator.ts': ['src/infrastructure/poi/OverpassRequestWorker.ts'],
    'scripts/admin/deepseek-europe-prepare.cjs': ['scripts/validation/narrative-user-canary-v8.ts', 'scripts/admin/preparation_attempt.cjs'],
    'scripts/admin/deepseek-batch-prepare.cjs': ['scripts/validation/narrative-user-canary-v8.ts'],
    'scripts/admin/tour-audio-batch.cjs': ['scripts/admin/french-audio-replacement.cjs'],
}
spawn_edges = 0
for k, vs in SPAWN.items():
    for v in vs:
        assert v in fileset, v
        if v not in edges[k]:
            edges[k].add(v); spawn_edges += 1

def closure(entries, blocked=()):
    seen = set(); q = deque(e for e in entries if e in fileset)
    seen.update(q)
    while q:
        f = q.popleft()
        for n in edges.get(f, ()):
            if (f, n) in blocked: continue
            if n not in seen:
                seen.add(n); q.append(n)
    return seen

is_test = lambda f: bool(re.search(r'(\.test\.(ts|cjs|js)$|/__tests__/|scripts/admin/test_)', f))
SERVER = ['src/server.ts']
ADMIN = sorted(f for f in files if f.startswith('scripts/admin/') and not is_test(f))
# python admin scripts that run TS via ts-node -e
ADMIN_EXTRA = ['src/services/TourBlueprint.ts']  # phase_receipts.py:59-60
EUROPE = ['scripts/admin/deepseek-europe-prepare.cjs', 'scripts/admin/deepseek-europe-audio.cjs',
          'scripts/admin/prepare-europe-publication.cjs', 'scripts/admin/translate-europe-audio.cjs',
          'scripts/admin/preparation_attempt.cjs', 'src/services/TourBlueprint.ts']
TESTS = sorted(f for f in files if is_test(f))
# experiments / other declared entry points (package.json scripts, validation, audit, prisma seed)
OTHER = sorted(f for f in files if (f.startswith('scripts/') and not f.startswith('scripts/admin/') and not is_test(f)) or f == 'prisma/seed.ts')

A = closure(SERVER)
# pilot-essential: server minus dev routes and generation job service
blocked = {('src/server.ts', 'src/api/routes/tours.ts'), ('src/server.ts', 'src/api/routes/concepts.ts'),
           ('src/server.ts', 'src/api/routes/passes.ts'), ('src/server.ts', 'src/services/generationJobServiceInstance.ts')}
PILOT = closure(SERVER, blocked)
A_nospawn_edges = {(k, v) for k, vs in SPAWN.items() for v in vs}
A_static = closure(SERVER, A_nospawn_edges)
P_all = closure(ADMIN + ADMIN_EXTRA)
P_eu = closure(EUROPE)
Bset = P_all - A
T = closure(TESTS)
Cset = T - A - P_all
O = closure(OTHER)
reach_any = A | P_all | T
Dset = set(files) - reach_any
D_exp = Dset & O
D_orphan = Dset - O
# also: production-generation core = union of server(static w/o dev?) no; report
src_files = [f for f in files if f.startswith('src/')]

def group(fs):
    g = defaultdict(list)
    for f in sorted(fs):
        g[os.path.dirname(f)].append(f)
    return g
def stats(fs, prefix=''):
    g = group(fs)
    return {d: (len(v), sum(lines[x] for x in v)) for d, v in sorted(g.items())}
def write(name, fs, header):
    p = os.path.join(OUT, name)
    with open(p, 'w') as o:
        o.write('# ' + header + '\n')
        o.write('# files=%d lines=%d\n' % (len(fs), sum(lines[x] for x in fs)))
        for d, v in sorted(group(fs).items()):
            o.write('\n## %s  (%d files, %d lines)\n' % (d, len(v), sum(lines[x] for x in v)))
            for x in v: o.write('%s\t%d\n' % (x, lines[x]))
    return p

write('reachability-a-server.txt', A, '(a) reachable from src/server.ts (static imports + spawn edges)')
write('reachability-a-pilot-essential.txt', PILOT, 'server.ts closure excluding /tours,/cities,/passes routes and generationJobServiceInstance (pilot-mode needed set)')
write('reachability-b-pipeline-only.txt', Bset, '(b) reachable from scripts/admin (production batch pipeline) but NOT from server.ts')
write('reachability-b-europe-chain.txt', P_eu, 'closure of Europe chain entries (deepseek-europe-prepare/audio, prepare-europe-publication, translate-europe-audio, preparation_attempt, TourBlueprint via phase_receipts)')
write('reachability-c-tests-only.txt', Cset, '(c) reachable ONLY from tests')
write('reachability-d-unreachable.txt', Dset, '(d) unreachable from server.ts, scripts/admin and tests')
write('reachability-d1-experiments-only.txt', D_exp, '(d1) subset of (d) reachable from non-admin scripts (validation/audit/prisma seed)')
write('reachability-d2-orphans.txt', D_orphan, '(d2) subset of (d) not reachable from any entry incl. experiments')
with open(os.path.join(OUT, 'reachability-unresolved.txt'), 'w') as o:
    for f, s in unresolved: o.write('%s\t%s\n' % (f, s))

def summary(name, fs, only_src=False):
    fs2 = [f for f in fs if (f.startswith('src/') or not only_src)]
    print('%-28s files=%4d lines=%6d' % (name, len(fs2), sum(lines[x] for x in fs2)))
print('total files', len(files), 'lines', sum(lines.values()), 'src files', len(src_files), 'src lines', sum(lines[f] for f in src_files))
print('spawn edges added', spawn_edges, 'unresolved', len(unresolved))
for n, s in [('A server', A), ('A server static-only', A_static), ('PILOT essential', PILOT), ('P admin all', P_all), ('P europe chain', P_eu), ('B pipeline-only', Bset), ('T tests closure', T), ('C tests-only', Cset), ('D unreachable', Dset), ('D1 experiments', D_exp), ('D2 orphans', D_orphan)]:
    summary(n, s)
print('\n-- per-dir (src+scripts) [A | B | C | D(D1/D2)] files/lines')
dirs = sorted(set(os.path.dirname(f) for f in files))
def cnt(s, d):
    v = [f for f in s if os.path.dirname(f) == d]; return '%d/%d' % (len(v), sum(lines[x] for x in v))
for d in dirs:
    print('%-45s A=%-10s B=%-10s C=%-10s D=%-10s D1=%-10s D2=%-10s' % (d, cnt(A, d), cnt(Bset, d), cnt(Cset, d), cnt(Dset, d), cnt(D_exp, d), cnt(D_orphan, d)))
json.dump({'edges': {k: sorted(v) for k, v in edges.items()}}, open(os.path.join(OUT, 'reachability-graph.json'), 'w'))

# ---- refinement: split categories into test files vs non-test sources
C_src = {f for f in Cset if not is_test(f)}
C_tst = {f for f in Cset if is_test(f)}
write('reachability-c-tests-only-sources.txt', C_src, '(c) NON-TEST source files reachable only from tests (dead production code kept alive by tests)')
write('reachability-c-test-files-for-dead-code.txt', C_tst, 'test files that are themselves only reachable as test entries AND whose subject is not in A/B (i.e. test files in C)')
# Test files that only exercise dead code: test files whose every non-test import target is in C_src
dead_tests = set()
for t in TESTS:
    deps = {d for d in edges.get(t, ()) if not is_test(d)}
    if deps and deps <= C_src: dead_tests.add(t)
write('reachability-c-tests-exercising-only-dead-code.txt', dead_tests, 'test files whose all non-test imports are in (c)-sources')
print('\nC_src', len(C_src), sum(lines[x] for x in C_src), 'C_test files', len(C_tst), sum(lines[x] for x in C_tst))
print('tests total', len(TESTS), sum(lines[x] for x in TESTS), 'tests exercising only dead code', len(dead_tests), sum(lines[x] for x in dead_tests))
print('\n-- per-dir non-test sources: A | Bonly | C_src | D')
for d in dirs:
    nt = lambda s: {f for f in s if os.path.dirname(f) == d and not is_test(f)}
    a, b, c, dd = nt(A), nt(Bset), nt(C_src), nt(Dset)
    if a or b or c or dd:
        print('%-42s A=%3d/%6d B=%3d/%5d C=%3d/%6d D=%3d/%5d' % (d, len(a), sum(lines[x] for x in a), len(b), sum(lines[x] for x in b), len(c), sum(lines[x] for x in c), len(dd), sum(lines[x] for x in dd)))
# production-generation union (non-test) = A ∪ P_all
U = {f for f in (A | P_all) if not is_test(f)}
print('\nproduction union A∪P (non-test)', len(U), sum(lines[x] for x in U))
print('src non-test total', len([f for f in src_files if not is_test(f)]), sum(lines[f] for f in src_files if not is_test(f)))
print('A ∩ P', len(A & P_all), 'P_eu - A', len(P_eu - A))

print('\nC_src also reachable from experiments:', len(C_src & O), sum(lines[x] for x in C_src & O), ' C_src purely test-only:', len(C_src - O), sum(lines[x] for x in C_src - O))
write('reachability-c-sources-not-used-by-experiments.txt', C_src - O, '(c) sources not reachable from any scripts/validation experiment either (pure test-only)')
for key in ['src/services/orchestrationService.ts', 'src/services/CodexTourGenerator.ts', 'src/services/CodexTourProcess.ts', 'src/services/MultilingualTourGenerator.ts', 'src/services/GenerationJobService.ts', 'src/services/LocalVoxCpmRenderer.ts', 'src/services/TourAudioService.ts']:
    print(key, 'A' if key in A else '-', 'Astatic' if key in A_static else '-', 'PILOT' if key in PILOT else '-', 'P' if key in P_all else '-', 'EU' if key in P_eu else '-', lines.get(key))
print('\nspawn-only additions to A (A - A_static):')
for f in sorted(A - A_static): print('  ', f, lines[f])
print('\nB (pipeline-only) list:')
for f in sorted(Bset): print('  ', f, lines[f])
print('\nP_eu - A:', sorted(P_eu - A))

PROD = PILOT | P_eu
DEV_ONLY = (A | P_all) - PROD
print('\nPROD (pilot-essential ∪ europe chain):', len(PROD), sum(lines[x] for x in PROD))
print('DEV/legacy-only within A∪P (not pilot, not europe chain):', len(DEV_ONLY), sum(lines[x] for x in DEV_ONLY))
write('reachability-prod-core.txt', PROD, 'production core = pilot-mode server closure ∪ Europe batch chain closure')
write('reachability-dev-legacy-only.txt', DEV_ONLY, 'reachable from server.ts or scripts/admin but only via dev routes (/tours,/cities,/passes, GenerationJobService) or non-Europe admin scripts')
for d, (n, l) in stats(DEV_ONLY).items(): print('  %-40s %3d %6d' % (d, n, l))
print('legacy markers in DEV_ONLY:', [f for f in DEV_ONLY if re.search(r'orchestration|Llm|llm|Concept|Codex|Multilingual|GenerationJob', f)])
