import { readFileSync } from 'fs';
import { join } from 'path';

interface CoreEvaluationArtifactV6 {
  schemaVersion: 'editorial-core-workbench-v6';
  status: string;
  caseId: string;
  resolution: {
    runs: Array<{
      value: {
        classifications: Array<{
          canonicalId: string;
          classification: 'required' | 'optional';
        }>;
      } | null;
    }>;
    coreResult: {
      status: 'approved';
      core: { requirements: Array<{ canonicalId: string }> };
    } | { status: 'core_review_required' } | null;
  } | null;
}

interface CoreEvaluationTargetV6 {
  stops: Array<{ qid: string; name: string }>;
}

function argumentValue(flag: string): string | undefined {
  const exact = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function evaluateEditorialCoreV6(): void {
  const requestedArtifact = argumentValue('--artifact');
  if (!requestedArtifact) throw new Error('--artifact is required');
  const artifactPath = join(process.cwd(), requestedArtifact);
  const artifact = readJson<CoreEvaluationArtifactV6>(artifactPath);
  if (artifact.schemaVersion !== 'editorial-core-workbench-v6'
    || !artifact.resolution || artifact.resolution.runs.length !== 3
    || artifact.resolution.runs.some((run) => !run.value)) {
    throw new Error('Core artifact does not contain three valid frozen audits');
  }
  const targetPath = join(__dirname, '..', '..', 'fixtures', 'oracle', `${artifact.caseId}.json`);
  const target = readJson<CoreEvaluationTargetV6>(targetPath);
  const requiredSets = artifact.resolution.runs.map((run) => new Set(
    run.value!.classifications.filter((item) => item.classification === 'required')
      .map((item) => item.canonicalId)
  ));
  const signatures = requiredSets.map((set) => [...set].sort().join(','));
  const auditCoverage = requiredSets.map((requiredIds, index) => {
    const covered = target.stops.filter((stop) => requiredIds.has(stop.qid));
    return {
      audit: index + 1,
      coreSize: requiredIds.size,
      anchorCoverage: `${covered.length}/${target.stops.length}`,
      missingAnchors: target.stops.filter((stop) => !requiredIds.has(stop.qid)).map((stop) => stop.name),
    };
  });
  const result = {
    caseId: artifact.caseId,
    artifactStatus: artifact.status,
    auditCoverage,
    gates: {
      exactConsensus: signatures.every((signature) => signature === signatures[0]),
      nonEmptyCore: requiredSets.every((set) => set.size >= 1),
      maximumEight: requiredSets.every((set) => set.size <= 8),
      allAnchorsCovered: requiredSets.every((set) => (
        target.stops.every((stop) => set.has(stop.qid))
      )),
    },
  };
  const passed = Object.values(result.gates).every(Boolean);
  console.log(JSON.stringify({ ...result, gates: { ...result.gates, passed } }, null, 2));
  if (!passed) process.exitCode = 1;
}

if (require.main === module) {
  try {
    evaluateEditorialCoreV6();
  } catch (error) {
    console.error('[evaluate-editorial-core-v6] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
