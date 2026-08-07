import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { EditorialCandidate } from './EditorialCandidate';
import {
  areSameEditorialIdentityV3,
  assessEditorialEvidenceReadinessV3,
  buildEditorialSitesV3,
} from './EditorialSiteV3';

function entity(entityId: string, localName: string, lat: number, lng: number) {
  return { entityId, localName, coordinates: { lat, lng }, sourceId: entityId };
}

const baseCandidate: EditorialCandidate = {
  canonicalId: 'Q1537446',
  clusterId: 'cluster:Q1537446+Q1849031',
  memberCanonicalIds: ['Q1537446', 'Q1849031'],
  localName: 'Plaza de Cibeles',
  category: 'square_civic',
  coordinates: { lat: 40.41917, lng: -3.69306 },
  fameScore: 80,
  themeScore: 80,
  firstVisitScore: 80,
  evidenceScore: 50,
  observableScore: 50,
  tier: 'strong',
  eligibleRoles: ['modern-city'],
  evidenceFacts: [{
    id: 'Q1537446:osm:place', source: 'osm', sourceId: 'node:1', kind: 'observable',
    value: 'place: square', observable: true,
  }],
};

function source(input: Partial<EnrichedPoi> & Pick<EnrichedPoi, 'name' | 'lat' | 'lng' | 'tags'>): EnrichedPoi {
  return {
    osmType: 'node',
    osmId: 1,
    ...input,
    enriched: input.enriched ?? {
      nameTranslations: {}, description: null, wikipediaLead: null, wikipediaBody: null,
      wikidataClaims: null, osmTags: {}, wikivoyage: null, descriptionLanguage: null, attribution: {},
    },
  };
}

describe('editorial visit sites v3', () => {
  it('does not equate nearby plaza, fountain and palace identities', () => {
    const plaza = entity('Q1537446', 'Plaza de Cibeles', 40.41917, -3.69306);
    const fountain = entity('Q2736564', 'Fuente de Cibeles', 40.41933, -3.69309);
    const palace = entity('Q1849031', 'Palacio de Cibeles', 40.41861, -3.69167);

    expect(areSameEditorialIdentityV3(plaza, fountain)).toBe(false);
    expect(areSameEditorialIdentityV3(plaza, palace)).toBe(false);
  });

  it('bundles distinct nearby entities into one visit site and adds historical context', () => {
    const sources = [
      source({ name: 'Plaza de Cibeles', lat: 40.41917, lng: -3.69306, tags: { wikidata: 'Q1537446', place: 'square' } }),
      source({
        name: 'Fuente de Cibeles', lat: 40.41933, lng: -3.69309,
        tags: { wikidata: 'Q2736564', wikipedia: 'es:Fuente de Cibeles', amenity: 'fountain' },
        enriched: {
          nameTranslations: { es: 'Fuente de Cibeles' }, description: null, wikipediaLead: null,
          wikipediaBody: 'Fue concebida dentro de un plan de remodelación urbana del siglo XVIII por iniciativa del rey Carlos III. La fuente muestra a la diosa en un carro tirado por leones.',
          wikidataClaims: { inception: '1782-00-00', architect: 'Ventura Rodríguez' }, osmTags: {},
          wikivoyage: null, descriptionLanguage: 'es', attribution: {},
        },
      }),
      source({ name: 'Palacio de Cibeles', lat: 40.41861, lng: -3.69167, tags: { wikidata: 'Q1849031', historic: 'monument' } }),
    ];

    const site = buildEditorialSitesV3([baseCandidate], sources, 'es')[0];

    expect(site.entityIds).toEqual(expect.arrayContaining(['Q1537446', 'Q1849031', 'Q2736564']));
    expect(site.evidenceFacts.some((fact) => fact.value.includes('remodelación urbana'))).toBe(true);
    expect(site.readiness.ready).toBe(true);
  });

  it('reports evidence gaps instead of fabricating readiness', () => {
    expect(assessEditorialEvidenceReadinessV3(baseCandidate.evidenceFacts)).toEqual({
      ready: false,
      observableCount: 1,
      contextCount: 0,
      historicalSpecificCount: 0,
      missing: ['context', 'historical_specific'],
    });
  });
});
