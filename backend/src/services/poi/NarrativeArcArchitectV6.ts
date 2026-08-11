import {
  EditorialCallResultV6,
  EditorialPostV6,
  requestEditorialStructuredV6,
} from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { DEEPSEEK_NARRATIVE_MODEL_V6 } from './NarrativeEditorialAgentsV6';
import { NarrativeArcV6 } from './NarrativeEditorialWorkflowV6';

export interface NarrativeArcArchitectV6 {
  build(input: { route: NarrativeRouteBriefV6; dossiers: NarrativeDossierV6[] }): Promise<{
    arc: NarrativeArcV6;
    diagnostic?: EditorialCallResultV6<NarrativeArcV6>;
  }>;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function validateNarrativeArcV6(
  value: unknown,
  route: NarrativeRouteBriefV6,
  dossiers: NarrativeDossierV6[]
): NarrativeArcV6 {
  if (dossiers.some((dossier) => !route.stops.some((stop) => stop.stopId === dossier.stopId))) {
    throw new Error('arc received a dossier outside the route');
  }
  const root = objectValue(value, 'arc response');
  if (typeof root.promise !== 'string' || !root.promise.trim()
    || typeof root.centralQuestion !== 'string' || !root.centralQuestion.trim()
    || !Array.isArray(root.stops)) throw new Error('arc response is malformed');
  const stops = root.stops.map((raw, index) => {
    const stop = objectValue(raw, `arc stop ${index}`);
    if (typeof stop.stopId !== 'string' || typeof stop.contribution !== 'string'
      || !stop.contribution.trim() || typeof stop.bridge !== 'string' || !stop.bridge.trim()) {
      throw new Error(`arc stop ${index} is malformed`);
    }
    return { stopId: stop.stopId, contribution: stop.contribution, bridge: stop.bridge };
  });
  const expected = route.stops.map((stop) => stop.stopId);
  const observed = stops.map((stop) => stop.stopId);
  if (observed.length !== expected.length || new Set(observed).size !== expected.length
    || expected.some((stopId) => !observed.includes(stopId))) {
    throw new Error('arc must cover every route stop exactly once');
  }
  if (dossiers.length !== route.stops.length
    || expected.some((stopId) => !dossiers.some((dossier) => dossier.stopId === stopId))) {
    throw new Error('arc cannot be built before every dossier is sufficient');
  }
  return { promise: root.promise.trim(), centralQuestion: root.centralQuestion.trim(), stops };
}

export function createDeepSeekNarrativeArcArchitectV6(options: {
  apiKey?: string;
  post?: EditorialPostV6;
}): NarrativeArcArchitectV6 {
  return {
    async build(input) {
      if (input.dossiers.some((dossier) => !dossier.sufficiency.isSufficient)) {
        throw new Error('arc cannot be built from an insufficient dossier');
      }
      const result = await requestEditorialStructuredV6({
        callId: `narrative-v6-arc-${input.route.caseId}`,
        input,
        provider: { kind: 'deepseek', model: DEEPSEEK_NARRATIVE_MODEL_V6 },
        options: {
          apiKey: options.apiKey, post: options.post, temperature: 0,
          maxTokens: 4_000, requestAttempts: 1,
        },
        systemPrompt: [
          'Construye la columna vertebral de una audioguía solo cuando todos los dossiers sean suficientes.',
          'Formula una promesa y pregunta central para el tour completo.',
          'Da a cada parada una contribución exclusiva y un puente hacia la siguiente;',
          'el último puente debe resolver el arco. No añadas hechos fuera de los dossiers.',
        ].join(' '),
        schema: {
          type: 'object', additionalProperties: false,
          required: ['promise', 'centralQuestion', 'stops'],
          properties: {
            promise: { type: 'string' }, centralQuestion: { type: 'string' },
            stops: { type: 'array', items: {
              type: 'object', additionalProperties: false,
              required: ['stopId', 'contribution', 'bridge'],
              properties: {
                stopId: { type: 'string' }, contribution: { type: 'string' }, bridge: { type: 'string' },
              },
            } },
          },
        },
        toolName: 'build_narrative_arc_v6',
        toolDescription: 'Devuelve la columna vertebral del tour.',
        inputCharacterLimit: 160_000,
        schemaCharacterLimit: 10_000,
        validate: (value) => validateNarrativeArcV6(value, input.route, input.dossiers),
      });
      if (result.status !== 'valid' || !result.value) {
        throw new Error(`arc architect failed with status ${result.status}`);
      }
      return { arc: result.value, diagnostic: result };
    },
  };
}
