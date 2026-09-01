import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';

describe('narrative v8 evidence fixtures', () => {
  it('builds the real complete tier C shape with distinct route and entity identities', () => {
    const fixture = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-history-stop-03',
      entityQid: 'Q3849447',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [{
        sourceId: 'established-source',
        publisherKey: 'established.example',
        authorityTier: 'established_source',
      }],
    });

    expect(fixture.routeStopId).toBe('malaga-history-stop-03');
    expect(fixture.entityQid).toBe('Q3849447');
    expect(fixture.routeStopId).not.toBe(fixture.entityQid);
    expect(fixture.dossier.stopId).toBe('Q3849447');
    expect(fixture.dossier.sufficiency.isSufficient).toBe(false);
    expect(fixture.gates.minimumEvidenceReady).toBe(true);
    expect(fixture.gates.writerReady).toBe(true);
    expect(fixture.tier).toBe('C');
  });

  it('builds the real complete tier A shape with two distinct primary-authority publishers', () => {
    const fixture = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-history-stop-01',
      entityQid: 'Q3849447',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        {
          sourceId: 'primary-source-1',
          publisherKey: 'primary.example',
          authorityTier: 'primary_authority',
        },
        {
          sourceId: 'primary-source-2',
          publisherKey: 'primary2.example',
          authorityTier: 'primary_authority',
        },
      ],
    });

    expect(fixture.routeStopId).toBe('malaga-history-stop-01');
    expect(fixture.entityQid).toBe('Q3849447');
    expect(fixture.routeStopId).not.toBe(fixture.entityQid);
    expect(fixture.dossier.stopId).toBe('Q3849447');
    expect(fixture.dossier.sufficiency.isSufficient).toBe(true);
    expect(fixture.gates.minimumEvidenceReady).toBe(true);
    expect(fixture.gates.writerReady).toBe(true);
    expect(fixture.tier).toBe('A');
  });

  it('builds the real complete tier B shape with one primary-authority publisher', () => {
    const fixture = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-history-stop-02',
      entityQid: 'Q3849447',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [{
        sourceId: 'primary-source',
        publisherKey: 'primary.example',
        authorityTier: 'primary_authority',
      }],
    });

    expect(fixture.routeStopId).toBe('malaga-history-stop-02');
    expect(fixture.entityQid).toBe('Q3849447');
    expect(fixture.routeStopId).not.toBe(fixture.entityQid);
    expect(fixture.dossier.stopId).toBe('Q3849447');
    expect(fixture.dossier.sufficiency.isSufficient).toBe(false);
    expect(fixture.gates.minimumEvidenceReady).toBe(true);
    expect(fixture.gates.writerReady).toBe(true);
    expect(fixture.tier).toBe('B');
  });

  it('builds the real partial tier C shape with four roles and two established publishers', () => {
    const fixture = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-history-stop-04',
      entityQid: 'Q3849447',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'distinctive_trait',
      ],
      sources: [
        {
          sourceId: 'established-source-1',
          publisherKey: 'established.example',
          authorityTier: 'established_source',
        },
        {
          sourceId: 'established-source-2',
          publisherKey: 'established2.example',
          authorityTier: 'established_source',
        },
      ],
    });

    expect(fixture.routeStopId).toBe('malaga-history-stop-04');
    expect(fixture.entityQid).toBe('Q3849447');
    expect(fixture.routeStopId).not.toBe(fixture.entityQid);
    expect(fixture.dossier.stopId).toBe('Q3849447');
    expect(fixture.dossier.sufficiency.isSufficient).toBe(false);
    expect(fixture.gates.minimumEvidenceReady).toBe(true);
    expect(fixture.gates.writerReady).toBe(false);
    expect(fixture.gates.missingWriterRoles).toContain('tension_or_contrast');
    expect(fixture.tier).toBe('C');
  });

  it('builds the real tier D shape missing visible_observation', () => {
    const fixture = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-history-stop-05',
      entityQid: 'Q3849447',
      includedRoles: [
        'chronology_or_transformation',
        'distinctive_trait',
      ],
      sources: [{
        sourceId: 'tertiary-source',
        publisherKey: 'tertiary.example',
        authorityTier: 'established_source',
      }],
    });

    expect(fixture.routeStopId).toBe('malaga-history-stop-05');
    expect(fixture.entityQid).toBe('Q3849447');
    expect(fixture.routeStopId).not.toBe(fixture.entityQid);
    expect(fixture.dossier.stopId).toBe('Q3849447');
    expect(fixture.dossier.sufficiency.isSufficient).toBe(false);
    expect(fixture.gates.minimumEvidenceReady).toBe(false);
    expect(fixture.gates.writerReady).toBe(false);
    expect(fixture.tier).toBe('D');
  });
});
