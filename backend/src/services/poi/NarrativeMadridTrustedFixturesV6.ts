import {
  NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6,
  NarrativeRouteBriefV6,
  narrativeFingerprintV6,
} from './NarrativeContractsV6';
import { NarrativeDossierV6, NarrativeSufficiencyRoleV6 } from './NarrativeDossierV6';
import {
  NarrativeMadridDocumentsV6,
  NarrativeMadridReferenceV6,
} from './NarrativeMadridCorpusV6';
import { NarrativeArcV6 } from './NarrativeEditorialWorkflowV6';
import { classifyNarrativeSourceAuthorityV6 } from './NarrativeSourcesV6';

function cleanMarkdown(value: string): string {
  return value.replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/[*_`]/gu, '').replace(/\s+/gu, ' ').trim();
}

export function extractApprovedMadridScriptV6(markdown: string): string {
  const body = markdown.split(/^## Guion\s*$/m)[1]?.split(/^## /m)[0];
  if (!body?.trim()) throw new Error('approved Madrid script has no Guion section');
  return body.replace(/\s+/gu, ' ').trim();
}

function roleFor(text: string, index: number): NarrativeSufficiencyRoleV6 {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  if (/visible|fachada|altura|vano|torre|planta|material|mira|observ/.test(normalized)) {
    return 'visible_observation';
  }
  if (/funcion|uso|viv|corte|gobierno|mercado|servicio|municipal/.test(normalized)) {
    return 'human_agency_or_lived_function';
  }
  if (/contraste|frente a|pero|tension|conflicto|descart|no se|diferencia/.test(normalized)) {
    return 'tension_or_contrast';
  }
  if (/\b(?:1[0-9]{3}|20[0-9]{2})\b|constru|transform|cambio|incendio|traslad/.test(normalized)) {
    return 'chronology_or_transformation';
  }
  const fallback: NarrativeSufficiencyRoleV6[] = [
    'distinctive_trait', 'chronology_or_transformation', 'human_agency_or_lived_function',
    'tension_or_contrast', 'visible_observation',
  ];
  return fallback[index % fallback.length];
}

function parseTrustedDossier(
  stopId: string,
  markdown: string,
  fingerprint: string
): NarrativeDossierV6 {
  const sources = [...markdown.matchAll(
    /^\|\s*(S\d+)\s*\|\s*([^|]+)\|\s*[^|]+\|\s*(https:\/\/[^ |]+)[^|]*\|/gmu
  )].map((match) => ({
    sourceId: match[1],
    finalUrl: match[3],
    title: cleanMarkdown(match[2]),
    capturedAt: '2026-08-11T00:00:00.000Z',
    fingerprint: narrativeFingerprintV6({ stopId, sourceId: match[1], url: match[3] }),
    authority: classifyNarrativeSourceAuthorityV6(match[3]),
  }));
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  const passages: NarrativeDossierV6['passages'] = [];
  const propositions = [...markdown.matchAll(
    /^###\s+(P\d+)\s+—[^\n]*\n([\s\S]*?)(?=^###\s+P\d+|^##\s+|(?![\s\S]))/gmu
  )].map((match, index) => {
    const block = match[2];
    const textBlock = block.match(/- \*\*Texto:\*\*\s*([\s\S]*?)(?=\n- \*\*)/u)?.[1] ?? '';
    const text = cleanMarkdown(textBlock);
    const propositionSourceIds = [...new Set(
      (block.match(/\bS\d+\b/gu) ?? []).filter((sourceId) => sourceIds.has(sourceId))
    )];
    const quotes = [...block.matchAll(/«([^»]{5,500})»/gu)].map((quote) => quote[1]);
    const passageIds = quotes.map((quote, quoteIndex) => {
      const passageId = `${match[1]}-E${quoteIndex + 1}`;
      passages.push({
        passageId,
        sourceId: propositionSourceIds[quoteIndex % Math.max(propositionSourceIds.length, 1)]
          ?? sources[0]?.sourceId ?? 'trusted-human-source',
        quote,
      });
      return passageId;
    });
    return {
      propositionId: match[1],
      text,
      role: roleFor(`${text} ${block}`, index),
      certainty: /media|discut|interpret/i.test(block) ? 'medium' as const : 'high' as const,
      interpretation: /interpretaci|síntesis editorial|sintesis editorial/i.test(block)
        ? 'debatable' as const : 'direct' as const,
      sourceIds: propositionSourceIds,
      passageIds,
    };
  });
  const numbersSection = markdown.split(/^## Nombres y números autorizados[^\n]*$/m)[1]
    ?.split(/^## /m)[0] ?? '';
  const authorizedNumbers = [...new Set(numbersSection.match(/\b\d[\d.,]*\b/gu) ?? [])];
  const authorizedNames = [...new Set([...numbersSection.matchAll(/^\|\s*([^|]+)\|/gmu)]
    .map((match) => cleanMarkdown(match[1]))
    .filter((name) => name !== 'Elemento' && name !== '---'))];
  const limitsSection = markdown.split(/^## Pistas descartadas o restringidas\s*$/m)[1]
    ?.split(/^## /m)[0] ?? '';
  const limits = [...limitsSection.matchAll(/^-\s+(.+)$/gmu)].map((match) => cleanMarkdown(match[1]));
  const authoritySources = sources.filter((source) => source.authority.tier !== 'discovery_only');
  const dossierWithoutFingerprint = {
    stopId,
    language: 'es',
    sources,
    passages,
    propositions,
    authorizedNames,
    authorizedNumbers,
    discrepancies: [],
    limits,
    sufficiency: {
      isSufficient: true,
      missingRoles: [],
      authoritySourceCount: authoritySources.length,
      independentPublisherCount: new Set(
        authoritySources.map((source) => source.authority.publisherKey)
      ).size,
    },
  };
  return { ...dossierWithoutFingerprint, fingerprint };
}

export function buildTrustedMadridDossiersV6(
  manifest: NarrativeMadridReferenceV6,
  documents: NarrativeMadridDocumentsV6
): NarrativeDossierV6[] {
  return manifest.stops.map((stop) => parseTrustedDossier(
    stop.stopId, documents[stop.stopId].dossier, stop.dossier.sha256
  ));
}

export function buildMadridNarrativeRouteBriefV6(
  manifest: NarrativeMadridReferenceV6
): NarrativeRouteBriefV6 {
  const brief = {
    schemaVersion: NARRATIVE_ROUTE_BRIEF_SCHEMA_VERSION_V6,
    caseId: manifest.caseId,
    city: manifest.city,
    country: manifest.country,
    language: manifest.language,
    theme: manifest.theme,
    durationMinutes: manifest.durationMinutes,
    stops: manifest.stops.map((stop, index) => ({
      stopId: stop.stopId,
      position: index,
      name: stop.name,
      narrativeRole: stop.contribution,
      wikidataId: stop.wikidataId,
      wikidataUrl: `https://www.wikidata.org/wiki/${stop.wikidataId}`,
      wikipediaUrl: null,
      coordinates: stop.coordinates,
      previousStopId: manifest.stops[index - 1]?.stopId ?? null,
      nextStopId: manifest.stops[index + 1]?.stopId ?? null,
    })),
  };
  return { ...brief, fingerprint: narrativeFingerprintV6(brief) };
}

export function buildMadridNarrativeArcV6(manifest: NarrativeMadridReferenceV6): NarrativeArcV6 {
  return {
    promise: manifest.promise,
    centralQuestion: manifest.centralQuestion,
    stops: manifest.stops.map((stop, index) => ({
      stopId: stop.stopId,
      contribution: stop.contribution,
      bridge: manifest.stops[index + 1]
        ? `Preparar ${manifest.stops[index + 1].name}`
        : 'Resolver la promesa y la pregunta central del recorrido',
    })),
  };
}
