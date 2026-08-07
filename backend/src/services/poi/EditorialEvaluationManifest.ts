import { readFileSync } from 'fs';
import { dirname, join } from 'path';

export type EditorialEvaluationScope = 'calibration' | 'holdout';

export interface EditorialOracleAnchor {
  qid: string;
  name: string;
  narrativeRole?: string;
  contributionCode?: string;
}

export interface EditorialEvaluationOracle {
  city: string;
  theme: string;
  language: string;
  durationMinutes: number;
  purpose: string;
  stops: EditorialOracleAnchor[];
}

export interface EditorialEvaluationCase {
  id: string;
  scope: EditorialEvaluationScope;
  city: string;
  theme: string;
  language: string;
  durationMinutes: number;
  oracleFile: string;
}

export interface EditorialEvaluationManifest {
  schemaVersion: 'route-editorial-evaluation-v2';
  cases: EditorialEvaluationCase[];
}

export interface LoadedEditorialEvaluationCase extends EditorialEvaluationCase {
  oracle: EditorialEvaluationOracle;
}

export interface LoadEditorialEvaluationOptions {
  scope?: EditorialEvaluationScope;
  allowHoldout?: boolean;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadEditorialEvaluationCases(
  manifestPath: string,
  options: LoadEditorialEvaluationOptions = {}
): LoadedEditorialEvaluationCase[] {
  const scope = options.scope ?? 'calibration';
  if (scope === 'holdout' && options.allowHoldout !== true) {
    throw new Error('Holdout fixtures require explicit allowHoldout authorization');
  }

  const manifest = readJson<EditorialEvaluationManifest>(manifestPath);
  if (manifest.schemaVersion !== 'route-editorial-evaluation-v2' || !Array.isArray(manifest.cases)) {
    throw new Error('Invalid editorial evaluation manifest');
  }

  return manifest.cases
    .filter((evaluationCase) => evaluationCase.scope === scope)
    .map((evaluationCase) => {
      const oracle = readJson<EditorialEvaluationOracle>(join(dirname(manifestPath), evaluationCase.oracleFile));
      if (oracle.city !== evaluationCase.city
        || oracle.theme !== evaluationCase.theme
        || oracle.language !== evaluationCase.language
        || oracle.durationMinutes !== evaluationCase.durationMinutes) {
        throw new Error(`Oracle metadata does not match manifest case ${evaluationCase.id}`);
      }
      return { ...evaluationCase, oracle };
    });
}
