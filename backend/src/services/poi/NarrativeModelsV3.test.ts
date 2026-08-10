import {
  NARRATIVE_PLAN_SYSTEM_PROMPT_V3,
  NARRATIVE_PROSE_SYSTEM_PROMPT_V3,
  narrativePlanGeneratorPromptFingerprintV3,
  narrativeProseGeneratorPromptFingerprintV3,
} from './NarrativePilotWriterV3';
import {
  NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V3,
  NARRATIVE_GROUNDING_CRITIC_SYSTEM_PROMPT_V3,
  narrativeFinalCriticPromptFingerprintV3,
  narrativeGroundingCriticPromptFingerprintV3,
} from './NarrativePilotGemmaV3';

describe('Narrative model contracts V3', () => {
  it('asks the writer for total scene length without brittle per-block quotas', () => {
    expect(NARRATIVE_PLAN_SYSTEM_PROMPT_V3).toContain('pueden quedar sin claims');
    expect(NARRATIVE_PLAN_SYSTEM_PROMPT_V3).toContain('una sola vez');
    expect(NARRATIVE_PROSE_SYSTEM_PROMPT_V3).toContain('220 a 260 palabras');
    expect(NARRATIVE_PROSE_SYSTEM_PROMPT_V3).toContain('transición la añade el código');
    expect(NARRATIVE_PROSE_SYSTEM_PROMPT_V3).not.toMatch(/42|45|tokens por bloque/);
  });

  it('asks critics only for findings and bounded scores', () => {
    const prompts = `${NARRATIVE_GROUNDING_CRITIC_SYSTEM_PROMPT_V3} ${NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V3}`;
    expect(prompts).toContain('No inventes hallazgos');
    expect(prompts).not.toMatch(/premiumReadiness|repairInstructions|verdict/);
  });

  it('fingerprints four independent prompt/schema pairs', () => {
    const fingerprints = [
      narrativePlanGeneratorPromptFingerprintV3(),
      narrativeProseGeneratorPromptFingerprintV3(),
      narrativeGroundingCriticPromptFingerprintV3(),
      narrativeFinalCriticPromptFingerprintV3(),
    ];
    expect(fingerprints.every((value) => /^[a-f0-9]{64}$/.test(value))).toBe(true);
    expect(new Set(fingerprints).size).toBe(4);
  });
});
