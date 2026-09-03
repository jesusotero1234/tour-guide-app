import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { NarrativeNarrationTargetV8 } from "./NarrativeDurationTargetsV8";

export type JsonValue =
  | null
  | boolean
  | (number & { __brand?: "finite" })
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export const SCHEMA_VERSION = "narrative-user-canary-checkpoint-v8";

export const COMPLETED_PHASES = [
  "candidates",
  "route",
  "research",
  "arc",
  "editorial",
  "scorecard",
] as const;

export type CompletedPhase = (typeof COMPLETED_PHASES)[number];

export interface NarrativeUserCanaryCheckpointV8 {
  schemaVersion: typeof SCHEMA_VERSION;
  completedPhase: CompletedPhase;
  run: {
    runId: string;
    createdAt: string;
    profile: string;
    city: string;
    cityQid: string;
    language: string;
    requestFingerprint: string;
    priorSpendUsd: number;
  };
  candidates?: JsonValue;
  route?: JsonValue;
  research?: JsonValue;
  evidenceManifest?: JsonValue;
  arc?: JsonValue;
  narrationTargets?: JsonValue;
  editorial?: {
    status: string;
    scripts: JsonValue[];
    failureReason?: string;
    retryableLater?: boolean;
    openIssueIds?: string[];
    issues?: JsonValue[];
    issueSummary?: JsonValue;
  };
  scorecard?: JsonValue;
  fingerprint: string;
}

const FORBIDDEN_KEYS = new Set([
  "apikey",
  "authorization",
  "token",
  "password",
  "secret",
  "rawresponse",
  "rawmodelresponse",
]);

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  if (isPlainObject(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }
  return false;
}

function canonicalizeKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeKeys(item));
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const result: JsonObject = {};
    for (const key of keys) {
      result[key] = canonicalizeKeys(value[key]);
    }
    return result;
  }
  return value;
}

function computeFingerprint(checkpoint: Omit<NarrativeUserCanaryCheckpointV8, "fingerprint">): string {
  const canonical = canonicalizeKeys(checkpoint);
  const json = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(json, "utf8").digest("hex");
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized.endsWith("apikey")) return true;
  if (normalized === "authorization" || normalized.includes("authorization")) return true;
  if (normalized === "token" || normalized.includes("token")) return true;
  if (normalized === "password" || normalized.includes("password")) return true;
  if (normalized === "secret" || normalized.includes("secret")) return true;
  if (normalized === "rawresponse" || normalized.includes("rawresponse")) return true;
  if (normalized === "rawmodelresponse" || normalized.includes("rawmodelresponse")) return true;
  return false;
}

function rejectForbiddenKeys(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      rejectForbiddenKeys(item);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (isForbiddenKey(key)) {
        throw new Error(`Forbidden key detected: ${key}`);
      }
      rejectForbiddenKeys(value[key]);
    }
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function decodeCheckpointNarrationTargetsV8(
  raw: unknown,
  expectedStopIds: string[],
  sourcePath: string
): NarrativeNarrationTargetV8[] {
  if (raw === undefined) {
    throw new Error(
      `Checkpoint at ${sourcePath} does not contain stable narration targets`
    );
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      `narrationTargets at ${sourcePath} must be an array`
    );
  }

  const expectedSet = new Set(expectedStopIds);
  const seenStopIds = new Set<string>();
  const result: NarrativeNarrationTargetV8[] = [];

  for (const item of raw) {
    if (!isPlainObject(item)) {
      throw new Error(
        `narrationTargets items at ${sourcePath} must be plain objects`
      );
    }

    const obj = item as JsonObject;

    if (typeof obj.stopId !== "string" || obj.stopId.length === 0) {
      throw new Error(
        `narrationTargets items at ${sourcePath} must have stopId as a non-empty string`
      );
    }

    const stopId = obj.stopId;
    if (!expectedSet.has(stopId)) {
      throw new Error(
        `narrationTargets at ${sourcePath} contains unexpected stopId: ${stopId}`
      );
    }
    if (seenStopIds.has(stopId)) {
      throw new Error(
        `narrationTargets at ${sourcePath} contains duplicate stopId: ${stopId}`
      );
    }
    seenStopIds.add(stopId);

    const requiredIntFields = ["targetSeconds", "targetWords", "minPropositions", "maxPropositions", "minVisualAnchors"] as const;
    for (const field of requiredIntFields) {
      if (!isNonNegativeInteger(obj[field])) {
        throw new Error(
          `narrationTargets items at ${sourcePath} must have ${field} as a finite nonnegative integer`
        );
      }
    }

    const optionalIntFields = ["targetEvidenceCards", "minFacetCount", "minSpatialAnchors"] as const;
    for (const field of optionalIntFields) {
      if (obj[field] !== undefined && !isNonNegativeInteger(obj[field])) {
        throw new Error(
          `narrationTargets items at ${sourcePath} must have ${field} as a finite nonnegative integer when present`
        );
      }
    }

    result.push(obj as unknown as NarrativeNarrationTargetV8);
  }

  for (const stopId of expectedStopIds) {
    if (!seenStopIds.has(stopId)) {
      throw new Error(
        `narrationTargets at ${sourcePath} is missing expected stopId: ${stopId}`
      );
    }
  }

  return result;
}

export function validateCheckpointV8(raw: unknown): NarrativeUserCanaryCheckpointV8 {
  if (!isPlainObject(raw)) {
    throw new Error("Checkpoint must be a plain object");
  }

  const obj = raw as JsonObject;

  if (obj.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("Invalid schema version");
  }

  if (typeof obj.completedPhase !== "string" || !COMPLETED_PHASES.includes(obj.completedPhase as CompletedPhase)) {
    throw new Error("Invalid completedPhase");
  }

  if (!isPlainObject(obj.run)) {
    throw new Error("run must be an object");
  }

  const run = obj.run as JsonObject;
  const requiredRunFields = ["runId", "createdAt", "profile", "city", "cityQid", "language", "requestFingerprint", "priorSpendUsd"];
  for (const field of requiredRunFields) {
    if (field === "priorSpendUsd") {
      if (typeof run[field] !== "number" || !Number.isFinite(run[field] as number) || (run[field] as number) < 0) {
        throw new Error(`run.${field} must be a finite nonnegative number`);
      }
    } else {
      if (typeof run[field] !== "string" || (run[field] as string).length === 0) {
        throw new Error(`run.${field} must be a non-empty string`);
      }
    }
  }

  const cumulativeFields: (keyof NarrativeUserCanaryCheckpointV8)[] = [
    "candidates",
    "route",
    "research",
    "evidenceManifest",
    "arc",
    "narrationTargets",
    "editorial",
    "scorecard",
  ];

  for (const field of cumulativeFields) {
    const value = obj[field];
    if (value === undefined) continue;
    if (!isJsonValue(value)) {
      throw new Error(`${field} must be a valid JSON value`);
    }
  }

  if (obj.editorial !== undefined) {
    if (!isPlainObject(obj.editorial)) {
      throw new Error("editorial must be an object");
    }
    const editorial = obj.editorial as JsonObject;
    if (typeof editorial.status !== "string") {
      throw new Error("editorial.status must be a string");
    }
    if (!Array.isArray(editorial.scripts) || !editorial.scripts.every((s) => isJsonValue(s))) {
      throw new Error("editorial.scripts must be an array of JSON values");
    }
    if (editorial.failureReason !== undefined && typeof editorial.failureReason !== "string") {
      throw new Error("editorial.failureReason must be a string when present");
    }
    if (editorial.retryableLater !== undefined && typeof editorial.retryableLater !== "boolean") {
      throw new Error("editorial.retryableLater must be a boolean when present");
    }
    if (editorial.openIssueIds !== undefined) {
      if (!Array.isArray(editorial.openIssueIds) || !editorial.openIssueIds.every((id) => typeof id === "string")) {
        throw new Error("editorial.openIssueIds must be an array of strings when present");
      }
    }
    if (editorial.issues !== undefined) {
      if (!Array.isArray(editorial.issues)) {
        throw new Error("editorial.issues must be an array when present");
      }
      for (const issue of editorial.issues) {
        if (!isPlainObject(issue)) {
          throw new Error("editorial.issues items must be plain objects");
        }
        const issueObj = issue as JsonObject;
        if (issueObj.schemaVersion !== "narrative-editorial-issue-v8") {
          throw new Error("editorial.issues items must have schemaVersion narrative-editorial-issue-v8");
        }
        const requiredIssueFields = ["issueId", "source", "stopId", "sentenceIds", "code", "severity", "state", "scriptFingerprint", "reason"] as const;
        for (const field of requiredIssueFields) {
          if (field === "sentenceIds") {
            if (!Array.isArray(issueObj[field]) || !issueObj[field].every((id) => typeof id === "string")) {
              throw new Error(`editorial.issues items must have sentenceIds as an array of strings`);
            }
          } else {
            if (typeof issueObj[field] !== "string" || (issueObj[field] as string).length === 0) {
              throw new Error(`editorial.issues items must have ${field} as a non-empty string`);
            }
          }
        }
        if (issueObj.sourceIssueIds !== undefined) {
          if (!Array.isArray(issueObj.sourceIssueIds) || !issueObj.sourceIssueIds.every((id) => typeof id === "string")) {
            throw new Error("editorial.issues items must have sourceIssueIds as an array of strings when present");
          }
        }
      }
    }
    if (editorial.issueSummary !== undefined) {
      if (!isPlainObject(editorial.issueSummary)) {
        throw new Error("editorial.issueSummary must be a plain object when present");
      }
      const summary = editorial.issueSummary as JsonObject;
      if (summary.schemaVersion !== "narrative-editorial-issue-summary-v8") {
        throw new Error("editorial.issueSummary must have schemaVersion narrative-editorial-issue-summary-v8");
      }
      const requiredSummaryFields = ["totalOpen", "hardWarnings", "softWarnings", "acceptedFactual", "acceptedTour"] as const;
      for (const field of requiredSummaryFields) {
        if (typeof summary[field] !== "number" || !Number.isFinite(summary[field] as number)) {
          throw new Error(`editorial.issueSummary must have ${field} as a finite number`);
        }
      }
      if (!isPlainObject(summary.byStop)) {
        throw new Error("editorial.issueSummary must have byStop as a plain object");
      }
      const byStop = summary.byStop as JsonObject;
      for (const key of Object.keys(byStop)) {
        if (typeof byStop[key] !== "number" || !Number.isFinite(byStop[key] as number)) {
          throw new Error(`editorial.issueSummary.byStop values must be finite numbers`);
        }
      }
    }
  }

  if (typeof obj.fingerprint !== "string") {
    throw new Error("fingerprint must be a string");
  }

  const phase = obj.completedPhase as CompletedPhase;
  const phaseIndex = COMPLETED_PHASES.indexOf(phase);

  const prerequisites: (keyof NarrativeUserCanaryCheckpointV8)[][] = [
    ["candidates"],
    ["candidates", "route"],
    ["candidates", "route", "research"],
    ["candidates", "route", "research", "evidenceManifest", "arc"],
    ["candidates", "route", "research", "evidenceManifest", "arc", "editorial"],
    ["candidates", "route", "research", "evidenceManifest", "arc", "editorial", "scorecard"],
  ];

  const required = prerequisites[phaseIndex];
  for (const field of required) {
    if (obj[field] === undefined) {
      throw new Error(`Missing prerequisite field for completedPhase ${phase}: ${field}`);
    }
  }

  rejectForbiddenKeys(obj);

  const { fingerprint, ...rest } = obj;
  const computed = computeFingerprint(rest as Omit<NarrativeUserCanaryCheckpointV8, "fingerprint">);
  if (computed !== obj.fingerprint) {
    throw new Error("Fingerprint mismatch");
  }

  return obj as unknown as NarrativeUserCanaryCheckpointV8;
}

export function createCheckpoint(input: Omit<NarrativeUserCanaryCheckpointV8, "fingerprint">): NarrativeUserCanaryCheckpointV8 {
  const cloned: JsonObject = JSON.parse(JSON.stringify(input));
  rejectForbiddenKeys(cloned);
  const { fingerprint: _ignored, ...rest } = cloned;
  const computed = computeFingerprint(rest as Omit<NarrativeUserCanaryCheckpointV8, "fingerprint">);
  const finished: JsonObject = { ...rest, fingerprint: computed };
  return validateCheckpointV8(finished);
}

export function assertResumeCompatibilityV8(
  stored: NarrativeUserCanaryCheckpointV8,
  requested: {
    profile: string;
    city: string;
    cityQid: string;
    language: string;
    requestFingerprint: string;
    priorSpendUsd: number;
  }
): void {
  if (typeof requested.priorSpendUsd !== "number" || !Number.isFinite(requested.priorSpendUsd) || requested.priorSpendUsd < 0) {
    throw new Error("requested.priorSpendUsd must be a finite nonnegative number");
  }
  if (requested.priorSpendUsd < stored.run.priorSpendUsd) {
    throw new Error("requested.priorSpendUsd is lower than stored.run.priorSpendUsd");
  }
  if (stored.run.profile !== requested.profile) {
    throw new Error("profile mismatch");
  }
  if (stored.run.city !== requested.city) {
    throw new Error("city mismatch");
  }
  if (stored.run.cityQid !== requested.cityQid) {
    throw new Error("cityQid mismatch");
  }
  if (stored.run.language !== requested.language) {
    throw new Error("language mismatch");
  }
  if (stored.run.requestFingerprint !== requested.requestFingerprint) {
    throw new Error("requestFingerprint mismatch");
  }
}

export async function readCheckpointV8(filePath: string): Promise<NarrativeUserCanaryCheckpointV8> {
  const data = await fs.promises.readFile(filePath, "utf8");
  const parsed = JSON.parse(data);
  return validateCheckpointV8(parsed);
}

export async function writeCheckpointV8(filePath: string, checkpoint: NarrativeUserCanaryCheckpointV8): Promise<void> {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const tempName = `${baseName}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const tempPath = path.join(dir, tempName);

  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const json = JSON.stringify(checkpoint, null, 2);
    await fs.promises.writeFile(tempPath, json, { mode: 0o600 });
    await fs.promises.chmod(tempPath, 0o600);
    await fs.promises.rename(tempPath, filePath);
    await fs.promises.chmod(filePath, 0o600);
  } catch (err) {
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // best-effort
    }
    throw err;
  }
}

export type ResumeFromV8 = "route" | "research" | "arc" | "editorial" | "scorecard";

const RESUME_PHASE_ORDER: readonly ResumeFromV8[] = [
  "route",
  "research",
  "arc",
  "editorial",
  "scorecard",
];

export function shouldExecuteResumePhaseV8(
  resumeFrom: ResumeFromV8 | null,
  phase: ResumeFromV8
): boolean {
  if (resumeFrom === null) {
    return true;
  }
  const resumeIndex = RESUME_PHASE_ORDER.indexOf(resumeFrom);
  const phaseIndex = RESUME_PHASE_ORDER.indexOf(phase);
  return phaseIndex >= resumeIndex;
}

export interface ParsedResumeOptionsV8 {
  checkpointPath: string;
  resumeFrom: ResumeFromV8;
}

const RESUME_FROM_VALUES: ReadonlySet<string> = new Set<ResumeFromV8>([
  "route",
  "research",
  "arc",
  "editorial",
  "scorecard",
]);

export function parseResumeOptionsV8(args: string[]): ParsedResumeOptionsV8 | null {
  let checkpointPath: string | null = null;
  let resumeFrom: string | null = null;
  let checkpointCount = 0;
  let resumeFromCount = 0;
  let hasCoreArtifact = false;
  let hasRouteArtifact = false;

  for (const arg of args) {
    if (arg.startsWith("--resume-checkpoint=")) {
      checkpointCount++;
      const value = arg.slice("--resume-checkpoint=".length);
      if (value.length === 0) {
        throw new Error("--resume-checkpoint requires a non-empty value");
      }
      checkpointPath = value;
    } else if (arg.startsWith("--resume-from=")) {
      resumeFromCount++;
      const value = arg.slice("--resume-from=".length);
      if (value.length === 0) {
        throw new Error("--resume-from requires a non-empty value");
      }
      if (!RESUME_FROM_VALUES.has(value)) {
        throw new Error(`Unknown --resume-from value: ${value}`);
      }
      resumeFrom = value;
    } else if (arg.startsWith("--core-artifact=")) {
      hasCoreArtifact = true;
    } else if (arg.startsWith("--route-artifact=")) {
      hasRouteArtifact = true;
    }
  }

  if (checkpointCount > 1) {
    throw new Error("--resume-checkpoint must appear at most once");
  }
  if (resumeFromCount > 1) {
    throw new Error("--resume-from must appear at most once");
  }

  const hasResumeRequest = checkpointPath !== null || resumeFrom !== null;

  if (!hasResumeRequest) {
    return null;
  }

  if (hasCoreArtifact) {
    throw new Error("--resume flags cannot be combined with --core-artifact");
  }
  if (hasRouteArtifact) {
    throw new Error("--resume flags cannot be combined with --route-artifact");
  }

  if (checkpointPath === null || resumeFrom === null) {
    throw new Error("Both --resume-checkpoint and --resume-from must be provided together");
  }

  return { checkpointPath, resumeFrom: resumeFrom as ResumeFromV8 };
}

const PHASE_INDEX: Record<CompletedPhase, number> = {
  candidates: 0,
  route: 1,
  research: 2,
  arc: 3,
  editorial: 4,
  scorecard: 5,
};

const RESUME_FROM_TO_COMPLETED_PHASE: Record<ResumeFromV8, CompletedPhase> = {
  route: "candidates",
  research: "route",
  arc: "research",
  editorial: "arc",
  scorecard: "editorial",
};

export function assertCheckpointSupportsResumeV8(
  checkpoint: NarrativeUserCanaryCheckpointV8,
  resumeFrom: ResumeFromV8
): void {
  const requiredCompletedPhase = RESUME_FROM_TO_COMPLETED_PHASE[resumeFrom];
  const requiredIndex = PHASE_INDEX[requiredCompletedPhase];
  const actualIndex = PHASE_INDEX[checkpoint.completedPhase];

  if (actualIndex < requiredIndex) {
    throw new Error(
      `Checkpoint completed at phase "${checkpoint.completedPhase}" is too early to resume from "${resumeFrom}"; requires at least "${requiredCompletedPhase}"`
    );
  }
}

export function projectCheckpointStateForResumeV8(
  sourceCheckpoint: NarrativeUserCanaryCheckpointV8,
  resumeFrom: ResumeFromV8
): Partial<Pick<NarrativeUserCanaryCheckpointV8, "candidates" | "route" | "research" | "evidenceManifest" | "arc" | "narrationTargets" | "editorial" | "scorecard">> {
  const clone = <T extends JsonValue>(value: T | undefined): T | undefined =>
    value === undefined ? undefined : JSON.parse(JSON.stringify(value)) as T;

  switch (resumeFrom) {
    case "route":
      return {
        candidates: clone(sourceCheckpoint.candidates),
      };
    case "research":
      return {
        candidates: clone(sourceCheckpoint.candidates),
        route: clone(sourceCheckpoint.route),
        narrationTargets: clone(sourceCheckpoint.narrationTargets),
      };
    case "arc":
      return {
        candidates: clone(sourceCheckpoint.candidates),
        route: clone(sourceCheckpoint.route),
        research: clone(sourceCheckpoint.research),
        evidenceManifest: clone(sourceCheckpoint.evidenceManifest),
        narrationTargets: clone(sourceCheckpoint.narrationTargets),
      };
    case "editorial":
      return {
        candidates: clone(sourceCheckpoint.candidates),
        route: clone(sourceCheckpoint.route),
        research: clone(sourceCheckpoint.research),
        evidenceManifest: clone(sourceCheckpoint.evidenceManifest),
        arc: clone(sourceCheckpoint.arc),
        narrationTargets: clone(sourceCheckpoint.narrationTargets),
      };
    case "scorecard":
      return {
        candidates: clone(sourceCheckpoint.candidates),
        route: clone(sourceCheckpoint.route),
        research: clone(sourceCheckpoint.research),
        evidenceManifest: clone(sourceCheckpoint.evidenceManifest),
        arc: clone(sourceCheckpoint.arc),
        editorial: clone(sourceCheckpoint.editorial),
        narrationTargets: clone(sourceCheckpoint.narrationTargets),
      };
  }
}
