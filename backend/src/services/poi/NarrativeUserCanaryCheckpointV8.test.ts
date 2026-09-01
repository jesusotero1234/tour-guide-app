import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createCheckpoint,
  validateCheckpointV8,
  assertResumeCompatibilityV8,
  readCheckpointV8,
  writeCheckpointV8,
  parseResumeOptionsV8,
  assertCheckpointSupportsResumeV8,
  shouldExecuteResumePhaseV8,
  projectCheckpointStateForResumeV8,
  SCHEMA_VERSION,
} from "./NarrativeUserCanaryCheckpointV8";
import type { NarrativeEditorialIssueV8, NarrativeEditorialIssueSummaryV8 } from "./NarrativeEditorialIssuePolicyV8";

describe("NarrativeUserCanaryCheckpointV8", () => {
  const baseRun = {
    runId: "run-123",
    createdAt: "2023-10-27T10:00:00Z",
    profile: "standard",
    city: "Paris",
    cityQid: "Q1787",
    language: "en",
    requestFingerprint: "fp-abc",
    priorSpendUsd: 0.5,
  };

  const baseCandidates = { id: "c1", name: "Eiffel Tower" };
  const baseRoute = { stops: ["Eiffel Tower", "Louvre"] };
  const baseResearch = { sources: ["wiki"] };
  const baseEvidenceManifest = { items: ["img1"] };
  const baseArc = { theme: "History" };
  const baseEditorial = { status: "ok", scripts: ["script1"] };
  const baseScorecard = { score: 90 };

  const sampleIssue: NarrativeEditorialIssueV8 = {
    schemaVersion: "narrative-editorial-issue-v8",
    issueId: "issue-1",
    source: "deterministic",
    stopId: "stop-1",
    sentenceIds: ["stop-1-S1"],
    code: "distorted",
    severity: "hard",
    state: "open",
    scriptFingerprint: "fp-script-1",
    reason: "Test reason",
  };

  const sampleSummary: NarrativeEditorialIssueSummaryV8 = {
    schemaVersion: "narrative-editorial-issue-summary-v8",
    totalOpen: 1,
    hardWarnings: 1,
    softWarnings: 0,
    acceptedFactual: 0,
    acceptedTour: 0,
    byStop: { "stop-1": 1 },
  };

  function buildInput(
    completedPhase: string,
    overrides: Record<string, unknown> = {}
  ) {
    const input: Record<string, unknown> = {
      schemaVersion: SCHEMA_VERSION,
      completedPhase,
      run: { ...baseRun },
      ...overrides,
    };
    if (completedPhase === "candidates") {
      input.candidates = baseCandidates;
    } else if (completedPhase === "route") {
      input.candidates = baseCandidates;
      input.route = baseRoute;
    } else if (completedPhase === "research") {
      input.candidates = baseCandidates;
      input.route = baseRoute;
      input.research = baseResearch;
    } else if (completedPhase === "arc") {
      input.candidates = baseCandidates;
      input.route = baseRoute;
      input.research = baseResearch;
      input.evidenceManifest = baseEvidenceManifest;
      input.arc = baseArc;
    } else if (completedPhase === "editorial") {
      input.candidates = baseCandidates;
      input.route = baseRoute;
      input.research = baseResearch;
      input.evidenceManifest = baseEvidenceManifest;
      input.arc = baseArc;
      input.editorial = baseEditorial;
    } else if (completedPhase === "scorecard") {
      input.candidates = baseCandidates;
      input.route = baseRoute;
      input.research = baseResearch;
      input.evidenceManifest = baseEvidenceManifest;
      input.arc = baseArc;
      input.editorial = baseEditorial;
      input.scorecard = baseScorecard;
    }
    return input;
  }

  describe("createCheckpoint", () => {
    it("creates a valid checkpoint with fingerprint", () => {
      const input = buildInput("scorecard");
      const result = createCheckpoint(input as any);
      expect(result.schemaVersion).toBe(SCHEMA_VERSION);
      expect(result.completedPhase).toBe("scorecard");
      expect(typeof result.fingerprint).toBe("string");
      expect(result.fingerprint).toHaveLength(64);
    });

    it("is deterministic under different object key insertion order", () => {
      const inputA = buildInput("scorecard");
      const resultA = createCheckpoint(inputA as any);

      // Create input B with different key order
      const inputB: Record<string, unknown> = {
        scorecard: baseScorecard,
        editorial: baseEditorial,
        arc: baseArc,
        evidenceManifest: baseEvidenceManifest,
        research: baseResearch,
        route: baseRoute,
        candidates: baseCandidates,
        run: { ...baseRun },
        completedPhase: "scorecard",
        schemaVersion: SCHEMA_VERSION,
      };
      const resultB = createCheckpoint(inputB as any);

      expect(resultA.fingerprint).toBe(resultB.fingerprint);
    });

    it("supports create/write/read round trip", async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "checkpoint-test-"));
      try {
        const input = buildInput("scorecard");
        const checkpoint = createCheckpoint(input as any);
        const filePath = path.join(tmpDir, "checkpoint.json");

        await writeCheckpointV8(filePath, checkpoint);
        const readBack = await readCheckpointV8(filePath);

        expect(readBack).toEqual(checkpoint);
        expect(readBack.fingerprint).toBe(checkpoint.fingerprint);
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("does not mutate input object", () => {
      const input = buildInput("scorecard");
      const inputSnapshot = JSON.parse(JSON.stringify(input));
      createCheckpoint(input as any);
      expect(input).toEqual(inputSnapshot);
    });
  });

  describe("validateCheckpointV8", () => {
    it("rejects tampered fingerprint", () => {
      const input = buildInput("scorecard");
      const checkpoint = createCheckpoint(input as any);
      const tampered = { ...checkpoint, fingerprint: "invalid-fingerprint" };
      expect(() => validateCheckpointV8(tampered)).toThrow("Fingerprint mismatch");
    });

    it("rejects invalid schema version", () => {
      const input = buildInput("scorecard");
      const invalid = { ...input, schemaVersion: "wrong-version" };
      expect(() => validateCheckpointV8(invalid)).toThrow("Invalid schema version");
    });

    it("rejects missing cumulative prerequisites", () => {
      // scorecard phase requires all previous fields
      const input = buildInput("scorecard");
      const missing = { ...input };
      delete (missing as any).candidates;
      expect(() => createCheckpoint(missing as any)).toThrow(
        "Missing prerequisite field for completedPhase scorecard: candidates"
      );
    });

    it("rejects empty run metadata", () => {
      const input = buildInput("scorecard");
      const invalid = { ...input, run: { ...baseRun, runId: "" } };
      expect(() => validateCheckpointV8(invalid)).toThrow(
        "run.runId must be a non-empty string"
      );
    });

    it("rejects nonfinite priorSpendUsd", () => {
      const input = buildInput("scorecard");
      const invalid = { ...input, run: { ...baseRun, priorSpendUsd: Infinity } };
      expect(() => validateCheckpointV8(invalid)).toThrow(
        "run.priorSpendUsd must be a finite nonnegative number"
      );
    });

    it("rejects negative priorSpendUsd", () => {
      const input = buildInput("scorecard");
      const invalid = { ...input, run: { ...baseRun, priorSpendUsd: -1 } };
      expect(() => validateCheckpointV8(invalid)).toThrow(
        "run.priorSpendUsd must be a finite nonnegative number"
      );
    });

    it("rejects forbidden nested key openRouterApiKey", () => {
      const input = buildInput("scorecard");
      const invalid = {
        ...input,
        candidates: { ...baseCandidates, openRouterApiKey: "secret-key" },
      };
      expect(() => createCheckpoint(invalid as any)).toThrow(
        "Forbidden key detected: openRouterApiKey"
      );
    });

    it("rejects forbidden nested key raw_model_response", () => {
      const input = buildInput("scorecard");
      const invalid = {
        ...input,
        research: { ...baseResearch, raw_model_response: "data" },
      };
      expect(() => createCheckpoint(invalid as any)).toThrow(
        "Forbidden key detected: raw_model_response"
      );
    });
  });

  describe("assertResumeCompatibilityV8", () => {
    const stored = createCheckpoint(buildInput("scorecard") as any);
    const validRequested = {
      profile: baseRun.profile,
      city: baseRun.city,
      cityQid: baseRun.cityQid,
      language: baseRun.language,
      requestFingerprint: baseRun.requestFingerprint,
      priorSpendUsd: baseRun.priorSpendUsd,
    };

    it("succeeds with matching metadata", () => {
      expect(() => assertResumeCompatibilityV8(stored, validRequested)).not.toThrow();
    });

    it("rejects profile mismatch", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, { ...validRequested, profile: "other" })
      ).toThrow("profile mismatch");
    });

    it("rejects city mismatch", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, { ...validRequested, city: "London" })
      ).toThrow("city mismatch");
    });

    it("rejects cityQid mismatch", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, { ...validRequested, cityQid: "Q999" })
      ).toThrow("cityQid mismatch");
    });

    it("rejects language mismatch", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, { ...validRequested, language: "fr" })
      ).toThrow("language mismatch");
    });

    it("rejects requestFingerprint mismatch", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, {
          ...validRequested,
          requestFingerprint: "fp-xyz",
        })
      ).toThrow("requestFingerprint mismatch");
    });

    it("rejects invalid requested spend (nonfinite)", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, {
          ...validRequested,
          priorSpendUsd: NaN,
        })
      ).toThrow("requested.priorSpendUsd must be a finite nonnegative number");
    });

    it("rejects requested spend lower than stored", () => {
      expect(() =>
        assertResumeCompatibilityV8(stored, {
          ...validRequested,
          priorSpendUsd: 0.1,
        })
      ).toThrow("requested.priorSpendUsd is lower than stored.run.priorSpendUsd");
    });
  });

  describe("writeCheckpointV8", () => {
    it("creates nested directories, writes atomically with mode 0600, and leaves no sibling temp files", async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "checkpoint-write-test-"));
      try {
        const nestedDir = path.join(tmpDir, "nested", "deep");
        const filePath = path.join(nestedDir, "checkpoint.json");
        const checkpoint = createCheckpoint(buildInput("scorecard") as any);

        await writeCheckpointV8(filePath, checkpoint);

        // Verify file exists and has correct content
        const stats = await fs.promises.stat(filePath);
        expect(stats.mode & 0o777).toBe(0o600);

        const content = await fs.promises.readFile(filePath, "utf8");
        const parsed = JSON.parse(content);
        expect(parsed.fingerprint).toBe(checkpoint.fingerprint);

        // Verify no sibling temp files remain
        const dirContents = await fs.promises.readdir(nestedDir);
        expect(dirContents).toEqual(["checkpoint.json"]);
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("parseResumeOptionsV8", () => {
    it("returns null when neither flag exists", () => {
      expect(parseResumeOptionsV8([])).toBeNull();
      expect(parseResumeOptionsV8(["--other-flag"])).toBeNull();
    });

    it("parses valid resume options", () => {
      const result = parseResumeOptionsV8([
        "--resume-checkpoint=/tmp/cp.json",
        "--resume-from=route",
      ]);
      expect(result).toEqual({
        checkpointPath: "/tmp/cp.json",
        resumeFrom: "route",
      });
    });

    it("throws when only --resume-checkpoint is provided", () => {
      expect(() =>
        parseResumeOptionsV8(["--resume-checkpoint=/tmp/cp.json"])
      ).toThrow("Both --resume-checkpoint and --resume-from must be provided together");
    });

    it("throws when only --resume-from is provided", () => {
      expect(() =>
        parseResumeOptionsV8(["--resume-from=route"])
      ).toThrow("Both --resume-checkpoint and --resume-from must be provided together");
    });

    it("throws when --resume-checkpoint value is empty", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=",
          "--resume-from=route",
        ])
      ).toThrow("--resume-checkpoint requires a non-empty value");
    });

    it("throws when --resume-from value is empty", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=/tmp/cp.json",
          "--resume-from=",
        ])
      ).toThrow("--resume-from requires a non-empty value");
    });

    it("throws when --resume-from is unknown", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=/tmp/cp.json",
          "--resume-from=invalid",
        ])
      ).toThrow("Unknown --resume-from value: invalid");
    });

    it("throws when --resume-checkpoint appears more than once", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=/tmp/cp1.json",
          "--resume-checkpoint=/tmp/cp2.json",
          "--resume-from=route",
        ])
      ).toThrow("--resume-checkpoint must appear at most once");
    });

    it("throws when --resume-from appears more than once", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=/tmp/cp.json",
          "--resume-from=route",
          "--resume-from=research",
        ])
      ).toThrow("--resume-from must appear at most once");
    });

    it("throws when resume flags are combined with --core-artifact", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=/tmp/cp.json",
          "--resume-from=route",
          "--core-artifact=/tmp/artifact.json",
        ])
      ).toThrow("--resume flags cannot be combined with --core-artifact");
    });

    it("throws when resume flags are combined with --route-artifact", () => {
      expect(() =>
        parseResumeOptionsV8([
          "--resume-checkpoint=/tmp/cp.json",
          "--resume-from=route",
          "--route-artifact=/tmp/artifact.json",
        ])
      ).toThrow("--resume flags cannot be combined with --route-artifact");
    });

    it("returns null when only --core-artifact is provided", () => {
      expect(
        parseResumeOptionsV8(["--core-artifact=/tmp/artifact.json"])
      ).toBeNull();
    });

    it("returns null when only --route-artifact is provided", () => {
      expect(
        parseResumeOptionsV8(["--route-artifact=/tmp/artifact.json"])
      ).toBeNull();
    });

    it("returns null when both artifact flags are provided without resume flags", () => {
      expect(
        parseResumeOptionsV8([
          "--core-artifact=/tmp/core.json",
          "--route-artifact=/tmp/route.json",
        ])
      ).toBeNull();
    });
  });

  describe("shouldExecuteResumePhaseV8", () => {
    const resumePhases: ("route" | "research" | "arc" | "editorial" | "scorecard")[] = [
      "route",
      "research",
      "arc",
      "editorial",
      "scorecard",
    ];

    it("returns true for every phase when resumeFrom is null", () => {
      for (const phase of resumePhases) {
        expect(shouldExecuteResumePhaseV8(null, phase)).toBe(true);
      }
    });

    it("returns true for the resume phase and every later phase, false for earlier phases", () => {
      for (const resumeFrom of resumePhases) {
        for (const phase of resumePhases) {
          const expected = resumePhases.indexOf(phase) >= resumePhases.indexOf(resumeFrom);
          expect(shouldExecuteResumePhaseV8(resumeFrom, phase)).toBe(expected);
        }
      }
    });
  });

  describe("projectCheckpointStateForResumeV8", () => {
    const scorecardCheckpoint = createCheckpoint(buildInput("scorecard") as any);

    it("preserves only candidates when resuming from route", () => {
      const projected = projectCheckpointStateForResumeV8(scorecardCheckpoint, "route");
      expect(projected.candidates).toEqual(baseCandidates);
      expect(projected.route).toBeUndefined();
      expect(projected.research).toBeUndefined();
      expect(projected.evidenceManifest).toBeUndefined();
      expect(projected.arc).toBeUndefined();
      expect(projected.editorial).toBeUndefined();
      expect(projected.scorecard).toBeUndefined();
    });

    it("preserves candidates and route when resuming from research", () => {
      const projected = projectCheckpointStateForResumeV8(scorecardCheckpoint, "research");
      expect(projected.candidates).toEqual(baseCandidates);
      expect(projected.route).toEqual(baseRoute);
      expect(projected.research).toBeUndefined();
      expect(projected.evidenceManifest).toBeUndefined();
      expect(projected.arc).toBeUndefined();
      expect(projected.editorial).toBeUndefined();
      expect(projected.scorecard).toBeUndefined();
    });

    it("preserves candidates, route, research, and evidenceManifest when resuming from arc", () => {
      const projected = projectCheckpointStateForResumeV8(scorecardCheckpoint, "arc");
      expect(projected.candidates).toEqual(baseCandidates);
      expect(projected.route).toEqual(baseRoute);
      expect(projected.research).toEqual(baseResearch);
      expect(projected.evidenceManifest).toEqual(baseEvidenceManifest);
      expect(projected.arc).toBeUndefined();
      expect(projected.editorial).toBeUndefined();
      expect(projected.scorecard).toBeUndefined();
    });

    it("preserves through arc but clears editorial and scorecard when resuming from editorial", () => {
      const projected = projectCheckpointStateForResumeV8(scorecardCheckpoint, "editorial");
      expect(projected.candidates).toEqual(baseCandidates);
      expect(projected.route).toEqual(baseRoute);
      expect(projected.research).toEqual(baseResearch);
      expect(projected.evidenceManifest).toEqual(baseEvidenceManifest);
      expect(projected.arc).toEqual(baseArc);
      expect(projected.editorial).toBeUndefined();
      expect(projected.scorecard).toBeUndefined();
    });

    it("preserves through editorial but clears scorecard when resuming from scorecard", () => {
      const projected = projectCheckpointStateForResumeV8(scorecardCheckpoint, "scorecard");
      expect(projected.candidates).toEqual(baseCandidates);
      expect(projected.route).toEqual(baseRoute);
      expect(projected.research).toEqual(baseResearch);
      expect(projected.evidenceManifest).toEqual(baseEvidenceManifest);
      expect(projected.arc).toEqual(baseArc);
      expect(projected.editorial).toEqual(baseEditorial);
      expect(projected.scorecard).toBeUndefined();
    });

    it("returns deep clones without mutating the source checkpoint", () => {
      const projected = projectCheckpointStateForResumeV8(scorecardCheckpoint, "scorecard");
      expect(projected).not.toBe(scorecardCheckpoint);

      const projectedCandidates = projected.candidates as Record<string, unknown>;
      const projectedRoute = projected.route as Record<string, unknown>;
      const projectedResearch = projected.research as Record<string, unknown>;
      const projectedEvidenceManifest = projected.evidenceManifest as Record<string, unknown>;
      const projectedArc = projected.arc as Record<string, unknown>;
      const projectedEditorial = projected.editorial as Record<string, unknown>;

      projectedCandidates.id = "mutated";
      projectedRoute.stops = ["mutated"];
      projectedResearch.sources = ["mutated"];
      projectedEvidenceManifest.items = ["mutated"];
      projectedArc.theme = "mutated";
      projectedEditorial.status = "mutated";

      expect(scorecardCheckpoint.candidates).toEqual(baseCandidates);
      expect(scorecardCheckpoint.route).toEqual(baseRoute);
      expect(scorecardCheckpoint.research).toEqual(baseResearch);
      expect(scorecardCheckpoint.evidenceManifest).toEqual(baseEvidenceManifest);
      expect(scorecardCheckpoint.arc).toEqual(baseArc);
      expect(scorecardCheckpoint.editorial).toEqual(baseEditorial);
    });
  });

  describe("editorial issue state persistence", () => {
    it("round-trips issue state through create/write/read", async () => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "checkpoint-issue-test-"));
      try {
        const editorialWithIssues = {
          ...baseEditorial,
          openIssueIds: ["issue-1"],
          issues: [sampleIssue],
          issueSummary: sampleSummary,
        };
        const input = buildInput("scorecard");
        input.editorial = editorialWithIssues;
        const checkpoint = createCheckpoint(input as any);
        const filePath = path.join(tmpDir, "checkpoint.json");

        await writeCheckpointV8(filePath, checkpoint);
        const readBack = await readCheckpointV8(filePath);

        expect(readBack.editorial?.openIssueIds).toEqual(["issue-1"]);
        expect(readBack.editorial?.issues).toEqual([sampleIssue]);
        expect(readBack.editorial?.issueSummary).toEqual(sampleSummary);
        expect(readBack.fingerprint).toBe(checkpoint.fingerprint);
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("detects fingerprint mismatch when issue state is mutated after creation", () => {
      const editorialWithIssues = {
        ...baseEditorial,
        openIssueIds: ["issue-1"],
        issues: [sampleIssue],
        issueSummary: sampleSummary,
      };
      const input = buildInput("scorecard");
      input.editorial = editorialWithIssues;
      const checkpoint = createCheckpoint(input as any);

      const mutated = JSON.parse(JSON.stringify(checkpoint)) as any;
      mutated.editorial.issues[0].reason = "mutated reason";

      expect(() => validateCheckpointV8(mutated)).toThrow("Fingerprint mismatch");
    });

    it("rejects invalid issue records", () => {
      const editorialWithInvalidIssue = {
        ...baseEditorial,
        openIssueIds: ["issue-1"],
        issues: [{ ...sampleIssue, issueId: 123 }],
        issueSummary: sampleSummary,
      };
      const input = buildInput("scorecard");
      input.editorial = editorialWithInvalidIssue;
      expect(() => createCheckpoint(input as any)).toThrow(
        "editorial.issues items must have issueId as a non-empty string"
      );
    });

    it("rejects invalid issue summary", () => {
      const editorialWithInvalidSummary = {
        ...baseEditorial,
        openIssueIds: ["issue-1"],
        issues: [sampleIssue],
        issueSummary: { ...sampleSummary, totalOpen: "1" },
      };
      const input = buildInput("scorecard");
      input.editorial = editorialWithInvalidSummary;
      expect(() => createCheckpoint(input as any)).toThrow(
        "editorial.issueSummary must have totalOpen as a finite number"
      );
    });

    it("rejects invalid openIssueIds", () => {
      const editorialWithInvalidOpenIds = {
        ...baseEditorial,
        openIssueIds: [123],
        issues: [sampleIssue],
        issueSummary: sampleSummary,
      };
      const input = buildInput("scorecard");
      input.editorial = editorialWithInvalidOpenIds;
      expect(() => createCheckpoint(input as any)).toThrow(
        "editorial.openIssueIds must be an array of strings when present"
      );
    });

    it("accepts legacy checkpoint without issue fields", () => {
      const input = buildInput("scorecard");
      const checkpoint = createCheckpoint(input as any);
      expect(checkpoint.editorial?.openIssueIds).toBeUndefined();
      expect(checkpoint.editorial?.issues).toBeUndefined();
      expect(checkpoint.editorial?.issueSummary).toBeUndefined();
      expect(typeof checkpoint.fingerprint).toBe("string");
      expect(checkpoint.fingerprint).toHaveLength(64);
    });
  });

  describe("assertCheckpointSupportsResumeV8", () => {
    const checkpoints: Record<string, ReturnType<typeof createCheckpoint>> = {
      candidates: createCheckpoint(buildInput("candidates") as any),
      route: createCheckpoint(buildInput("route") as any),
      research: createCheckpoint(buildInput("research") as any),
      arc: createCheckpoint(buildInput("arc") as any),
      editorial: createCheckpoint(buildInput("editorial") as any),
      scorecard: createCheckpoint(buildInput("scorecard") as any),
    };

    it("accepts resume from route with checkpoint at candidates or later", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.candidates, "route")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.route, "route")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.research, "route")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.arc, "route")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.editorial, "route")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.scorecard, "route")).not.toThrow();
    });

    it("accepts resume from research with checkpoint at route or later", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.route, "research")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.research, "research")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.arc, "research")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.editorial, "research")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.scorecard, "research")).not.toThrow();
    });

    it("accepts resume from arc with checkpoint at research or later", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.research, "arc")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.arc, "arc")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.editorial, "arc")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.scorecard, "arc")).not.toThrow();
    });

    it("accepts resume from editorial with checkpoint at arc or later", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.arc, "editorial")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.editorial, "editorial")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.scorecard, "editorial")).not.toThrow();
    });

    it("accepts resume from scorecard with checkpoint at editorial or later", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.editorial, "scorecard")).not.toThrow();
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.scorecard, "scorecard")).not.toThrow();
    });

    it("rejects resume from route with checkpoint at candidates only when too early is not applicable (candidates is required)", () => {
      // candidates is the required phase for route, so it should pass
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.candidates, "route")).not.toThrow();
    });

    it("rejects resume from research with checkpoint at candidates", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.candidates, "research")).toThrow(
        'Checkpoint completed at phase "candidates" is too early to resume from "research"; requires at least "route"'
      );
    });

    it("rejects resume from arc with checkpoint at route", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.route, "arc")).toThrow(
        'Checkpoint completed at phase "route" is too early to resume from "arc"; requires at least "research"'
      );
    });

    it("rejects resume from arc with checkpoint at candidates", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.candidates, "arc")).toThrow(
        'Checkpoint completed at phase "candidates" is too early to resume from "arc"; requires at least "research"'
      );
    });

    it("rejects resume from editorial with checkpoint at research", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.research, "editorial")).toThrow(
        'Checkpoint completed at phase "research" is too early to resume from "editorial"; requires at least "arc"'
      );
    });

    it("rejects resume from editorial with checkpoint at route", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.route, "editorial")).toThrow(
        'Checkpoint completed at phase "route" is too early to resume from "editorial"; requires at least "arc"'
      );
    });

    it("rejects resume from editorial with checkpoint at candidates", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.candidates, "editorial")).toThrow(
        'Checkpoint completed at phase "candidates" is too early to resume from "editorial"; requires at least "arc"'
      );
    });

    it("rejects resume from scorecard with checkpoint at arc", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.arc, "scorecard")).toThrow(
        'Checkpoint completed at phase "arc" is too early to resume from "scorecard"; requires at least "editorial"'
      );
    });

    it("rejects resume from scorecard with checkpoint at research", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.research, "scorecard")).toThrow(
        'Checkpoint completed at phase "research" is too early to resume from "scorecard"; requires at least "editorial"'
      );
    });

    it("rejects resume from scorecard with checkpoint at route", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.route, "scorecard")).toThrow(
        'Checkpoint completed at phase "route" is too early to resume from "scorecard"; requires at least "editorial"'
      );
    });

    it("rejects resume from scorecard with checkpoint at candidates", () => {
      expect(() => assertCheckpointSupportsResumeV8(checkpoints.candidates, "scorecard")).toThrow(
        'Checkpoint completed at phase "candidates" is too early to resume from "scorecard"; requires at least "editorial"'
      );
    });
  });
});
