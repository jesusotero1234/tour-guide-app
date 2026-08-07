import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { EditorialCandidateSource } from './EditorialCandidate';
import {
  assessEditorialEvidenceReadinessV4,
  buildEditorialEntitiesV4,
  canonicalEntityIdV4,
  selectEditorialFactPackV4,
} from './EditorialEntityV4';

function source(input: Partial<EditorialCandidateSource> & Pick<EnrichedPoi, 'name' | 'lat' | 'lng' | 'tags'>): EditorialCandidateSource {
  return {
    osmType: 'node', osmId: 1, fameScore: 50, ...input,
    enriched: input.enriched ?? {
      nameTranslations: {}, description: null, wikipediaLead: null, wikipediaBody: null,
      wikidataClaims: null, osmTags: {}, wikivoyage: null, descriptionLanguage: null, attribution: {},
    },
  };
}

function readySource(id: string, name: string, lat: number, lng: number, osmId: number): EditorialCandidateSource {
  return source({
    osmId, name, lat, lng, tags: { wikidata: id, historic: 'monument' },
    enriched: {
      nameTranslations: { es: name }, description: null, wikipediaLead: null,
      wikipediaBody: 'Construido en el siglo XVIII, el lugar transformó la historia urbana de la capital. Su fachada de piedra conserva columnas visibles desde la plaza.',
      wikidataClaims: { inception: '1782-00-00', architect: 'Arquitecto' }, osmTags: {},
      wikivoyage: null, descriptionLanguage: 'es', attribution: {},
    },
  });
}

describe('editorial entities v4', () => {
  it('merges only the same canonical identity', () => {
    const entities = buildEditorialEntitiesV4([
      readySource('Q1', 'Uno', 40.4, -3.7, 1),
      readySource('Q1', 'Uno duplicado', 40.40001, -3.7, 2),
    ], 'es');

    expect(entities).toHaveLength(1);
    expect(entities[0].sourceIds).toEqual(['node:1', 'node:2']);
  });

  it('keeps nearby QIDs separate and marks only a visit conflict', () => {
    const entities = buildEditorialEntitiesV4([
      readySource('Q1537446', 'Plaza de Cibeles', 40.41917, -3.69306, 1),
      readySource('Q2736564', 'Fuente de Cibeles', 40.41933, -3.69309, 2),
      readySource('Q1849031', 'Palacio de Cibeles', 40.41861, -3.69167, 3),
    ], 'es');

    expect(entities).toHaveLength(3);
    expect(entities[0].canonicalId).not.toBe(entities[1].canonicalId);
    const plaza = entities.find((item) => item.canonicalId === 'Q1537446');
    const fountain = entities.find((item) => item.canonicalId === 'Q2736564');
    const palace = entities.find((item) => item.canonicalId === 'Q1849031');
    expect(plaza?.visitConflictGroup).toBe(fountain?.visitConflictGroup);
    expect(plaza?.visitConflictGroup).not.toBeNull();
    expect(palace?.visitConflictGroup).toBeNull();
  });

  it('uses public recognition without merging distinct identities', () => {
    const famous = readySource('Q1', 'Famous', 40.4, -3.7, 1);
    famous.fame = { sitelinks: 127 };
    famous.fameScore = 10;

    const entity = buildEditorialEntitiesV4([famous], 'es')[0];
    expect(entity.fameScore).toBe(10);
    expect(entity.recognitionScore).toBe(70);
  });

  it('does not chain a dense street into one transitive visit conflict', () => {
    const entities = buildEditorialEntitiesV4([
      readySource('Q1', 'One', 40.4, -3.7, 1),
      readySource('Q2', 'Two', 40.4007, -3.7, 2),
      readySource('Q3', 'Three', 40.4014, -3.7, 3),
    ], 'es');
    const [one, two, three] = ['Q1', 'Q2', 'Q3'].map((id) => (
      entities.find((entity) => entity.canonicalId === id)!
    ));

    expect(one.visitConflictGroup).toBe(two.visitConflictGroup);
    expect(three.visitConflictGroup).not.toBe(one.visitConflictGroup);
  });

  it('uses Wikipedia and then OSM as stable fallbacks', () => {
    expect(canonicalEntityIdV4(source({
      osmId: 7, name: 'One', lat: 1, lng: 1, tags: { wikipedia: 'es:Uno' },
    }))).toBe('wikipedia:es:Uno');
    expect(canonicalEntityIdV4(source({
      osmType: 'way', osmId: 8, name: 'Two', lat: 1, lng: 1, tags: {},
    }))).toBe('osm:way:8');
  });

  it('limits the fact pack and reports missing historical context', () => {
    const facts = Array.from({ length: 8 }, (_, index) => ({
      id: `o${index}`, source: 'osm' as const, sourceId: 'node:1', kind: 'observable' as const,
      value: `stone: ${index}`, observable: true,
    }));
    const pack = selectEditorialFactPackV4(facts);
    expect(pack.length).toBeLessThanOrEqual(5);
    expect(assessEditorialEvidenceReadinessV4(pack)).toEqual({
      ready: false, observableCount: 1, contextCount: 0, historicalSpecificCount: 0,
      missing: ['context', 'historical_specific'],
    });
  });
});
