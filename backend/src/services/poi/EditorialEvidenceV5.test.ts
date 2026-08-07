import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { EditorialCandidateSource } from './EditorialCandidate';
import {
  buildEditorialEntitiesV5,
  canonicalEntityIdV5,
  selectRouteConditionedFactPackV5,
} from './EditorialEvidenceV5';

function source(
  input: Partial<EditorialCandidateSource> & Pick<EnrichedPoi, 'name' | 'lat' | 'lng' | 'tags'>
): EditorialCandidateSource {
  return {
    osmType: 'node', osmId: 1, fameScore: 50, ...input,
    enriched: input.enriched ?? {
      nameTranslations: {}, description: null, wikipediaLead: null, wikipediaBody: null,
      wikidataClaims: null, osmTags: {}, wikivoyage: null, descriptionLanguage: null,
      attribution: {},
    },
  };
}

function readySource(
  id: string,
  name: string,
  lat: number,
  lng: number,
  osmId: number,
  context = 'Construido en 1782, el lugar cambió la vida política de la ciudad.'
): EditorialCandidateSource {
  return source({
    osmId, name, lat, lng,
    tags: { wikidata: id, historic: 'monument', material: 'stone' },
    enriched: {
      nameTranslations: { es: name }, description: null, wikipediaLead: null,
      wikipediaBody: `${context} Su fachada de piedra conserva columnas visibles desde la plaza.`,
      wikidataClaims: { inception: '1782-00-00', architect: 'Arquitecto' },
      osmTags: {}, wikivoyage: null, descriptionLanguage: 'es', attribution: {},
    },
  });
}

describe('editorial evidence v5', () => {
  it('merges repeated sources only when they have the same QID', () => {
    const withoutQidA = source({
      osmId: 3, name: 'Uno', lat: 40.4, lng: -3.7, tags: { wikipedia: 'es:Uno' },
    });
    const withoutQidB = source({
      osmId: 4, name: 'Uno duplicado', lat: 40.40001, lng: -3.7,
      tags: { wikipedia: 'es:Uno' },
    });

    expect(buildEditorialEntitiesV5([
      readySource('Q1', 'Uno', 40.4, -3.7, 1),
      readySource('Q1', 'Uno duplicado', 40.40001, -3.7, 2),
      withoutQidA,
      withoutQidB,
    ], 'es')).toHaveLength(3);
    expect(canonicalEntityIdV5(withoutQidA)).toBe('osm:node:3');
    expect(canonicalEntityIdV5(withoutQidB)).toBe('osm:node:4');
  });

  it('uses proximity only as a visit conflict and never borrows evidence', () => {
    const weak = source({
      osmId: 1, name: 'Plaza', lat: 40.41917, lng: -3.69306,
      tags: { wikidata: 'Q10', place: 'square' },
    });
    const strong = readySource('Q20', 'Fuente', 40.41933, -3.69309, 2);
    const entities = buildEditorialEntitiesV5([weak, strong], 'es');
    const plaza = entities.find((entity) => entity.canonicalId === 'Q10')!;
    const fountain = entities.find((entity) => entity.canonicalId === 'Q20')!;

    expect(plaza.visitConflictGroup).toBe(fountain.visitConflictGroup);
    expect(plaza.readiness.ready).toBe(false);
    expect(fountain.readiness.ready).toBe(true);
    expect(plaza.evidenceFacts.every((fact) => fact.id.startsWith('Q10:'))).toBe(true);
    expect(plaza.evidenceFacts.some((fact) => fact.value.includes('1782'))).toBe(false);
  });

  it('keeps at most twelve own facts and selects four route-conditioned facts deterministically', () => {
    const focal = readySource(
      'Q1', 'Palacio', 40.4, -3.7, 1,
      'La revuelta de 1808 convirtió el palacio en símbolo del poder municipal.'
    );
    focal.enriched.wikidataClaims = {
      inception: '1782-00-00', architect: 'Ventura Rodríguez', namedAfter: 'La Corona',
      heritageDesignation: 'Bien de Interés Cultural', architecturalStyle: 'Neoclásico',
    };
    focal.tags = {
      ...focal.tags, architect: 'Ventura Rodríguez', building: 'palace', height: '24',
      heritage: '2', roof: 'slate', start_date: '1782', surface: 'stone',
    };
    const other = readySource(
      'Q2', 'Catedral', 40.41, -3.7, 2,
      'La catedral neoclásica fue construida en 1782 junto a la plaza.'
    );
    const [palace, cathedral] = buildEditorialEntitiesV5([focal, other], 'es');

    expect(palace.evidenceFacts).toHaveLength(12);
    const first = selectRouteConditionedFactPackV5(palace, [palace, cathedral]);
    const second = selectRouteConditionedFactPackV5(palace, [cathedral, palace]);
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(first.some((fact) => fact.kind === 'observable')).toBe(true);
    expect(first.some((fact) => fact.kind === 'claim' && fact.value.startsWith('inception:'))).toBe(true);
    expect(first.some((fact) => fact.value.includes('revuelta de 1808'))).toBe(true);
    expect(first.every((fact) => palace.evidenceFacts.some((own) => own.id === fact.id))).toBe(true);
  });
});
