import { resolveWikidataEntityV8 } from './WikidataIdentityV8';

describe('resolveWikidataEntityV8', () => {
  const resolvedAt = '2024-01-01T00:00:00.000Z';

  it('resolves direct identity with valid revision', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      }
    };
    const result = resolveWikidataEntityV8(response, 'Q117786961', resolvedAt);
    expect(result).toEqual({
      status: 'resolved',
      identity: {
        requestedId: 'Q117786961',
        canonicalId: 'Q117786961',
        redirectChain: ['Q117786961'],
        resolvedAt,
        revision: { revisionId: 12345, timestamp: '2024-01-01T00:00:00Z' }
      },
      entity: {
        id: 'Q117786961',
        lastrevid: 12345,
        modified: '2024-01-01T00:00:00Z'
      }
    });
  });

  it('resolves entity under old key with redirects and valid revision', () => {
    const response = {
      entities: {
        Q9055843: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      },
      redirects: [{ from: 'Q9055843', to: 'Q117786961' }]
    };
    const result = resolveWikidataEntityV8(response, 'Q9055843', resolvedAt);
    expect(result).toEqual({
      status: 'resolved',
      identity: {
        requestedId: 'Q9055843',
        canonicalId: 'Q117786961',
        redirectChain: ['Q9055843', 'Q117786961'],
        resolvedAt,
        revision: { revisionId: 12345, timestamp: '2024-01-01T00:00:00Z' }
      },
      entity: {
        id: 'Q117786961',
        lastrevid: 12345,
        modified: '2024-01-01T00:00:00Z'
      }
    });
  });

  it('resolves top-level redirects array with final entity keyed by canonical id', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      },
      redirects: [{ from: 'Q9055843', to: 'Q117786961' }]
    };
    const result = resolveWikidataEntityV8(response, 'Q9055843', resolvedAt);
    expect(result).toEqual({
      status: 'resolved',
      identity: {
        requestedId: 'Q9055843',
        canonicalId: 'Q117786961',
        redirectChain: ['Q9055843', 'Q117786961'],
        resolvedAt,
        revision: { revisionId: 12345, timestamp: '2024-01-01T00:00:00Z' }
      },
      entity: {
        id: 'Q117786961',
        lastrevid: 12345,
        modified: '2024-01-01T00:00:00Z'
      }
    });
  });

  it('resolves array entities format and chain A->B->C', () => {
    const response = {
      entities: [
        {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      ],
      redirects: [
        { from: 'Q1', to: 'Q2' },
        { from: 'Q2', to: 'Q117786961' }
      ]
    };
    const result = resolveWikidataEntityV8(response, 'Q1', resolvedAt);
    expect(result).toEqual({
      status: 'resolved',
      identity: {
        requestedId: 'Q1',
        canonicalId: 'Q117786961',
        redirectChain: ['Q1', 'Q2', 'Q117786961'],
        resolvedAt,
        revision: { revisionId: 12345, timestamp: '2024-01-01T00:00:00Z' }
      },
      entity: {
        id: 'Q117786961',
        lastrevid: 12345,
        modified: '2024-01-01T00:00:00Z'
      }
    });
  });

  it('rejects unexplained id mismatch', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q99999999',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      }
    };
    expect(() => resolveWikidataEntityV8(response, 'Q117786961', resolvedAt)).toThrow('Unconfirmed Wikidata identity mismatch');
  });

  it('rejects missing requested entry', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      }
    };
    expect(() => resolveWikidataEntityV8(response, 'Q9055843', resolvedAt)).toThrow('Wikidata entity Q9055843 omitted or identity mismatch');
  });

  it('rejects API error', () => {
    const response = {
      error: 'Not Found'
    };
    expect(() => resolveWikidataEntityV8(response, 'Q117786961', resolvedAt)).toThrow('Wikidata request failed');
  });

  it('rejects conflicting edges', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      },
      redirects: [
        { from: 'Q1', to: 'Q2' },
        { from: 'Q1', to: 'Q3' }
      ]
    };
    expect(() => resolveWikidataEntityV8(response, 'Q1', resolvedAt)).toThrow('Conflicting Wikidata redirects');
  });

  it('rejects cycles', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      },
      redirects: [
        { from: 'Q1', to: 'Q2' },
        { from: 'Q2', to: 'Q1' }
      ]
    };
    expect(() => resolveWikidataEntityV8(response, 'Q1', resolvedAt)).toThrow('Cyclic Wikidata redirect');
  });

  it('rejects >8 redirect hops', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      },
      redirects: [
        { from: 'Q1', to: 'Q2' },
        { from: 'Q2', to: 'Q3' },
        { from: 'Q3', to: 'Q4' },
        { from: 'Q4', to: 'Q5' },
        { from: 'Q5', to: 'Q6' },
        { from: 'Q6', to: 'Q7' },
        { from: 'Q7', to: 'Q8' },
        { from: 'Q8', to: 'Q9' },
        { from: 'Q9', to: 'Q10' }
      ]
    };
    expect(() => resolveWikidataEntityV8(response, 'Q1', resolvedAt)).toThrow('Wikidata redirect limit exceeded');
  });

  it('rejects redirected target without valid revision', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961'
        }
      },
      redirects: [{ from: 'Q9055843', to: 'Q117786961' }]
    };
    expect(() => resolveWikidataEntityV8(response, 'Q9055843', resolvedAt)).toThrow('Wikidata redirected entity lacks revision');
  });

  it('returns missing for explicit missing true', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          missing: true
        }
      }
    };
    const result = resolveWikidataEntityV8(response, 'Q117786961', resolvedAt);
    expect(result).toEqual({
      status: 'missing',
      identity: {
        requestedId: 'Q117786961',
        canonicalId: 'Q117786961',
        redirectChain: ['Q117786961'],
        resolvedAt,
        revision: null
      }
    });
  });

  it('returns missing for explicit empty-string missing', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          missing: ''
        }
      }
    };
    const result = resolveWikidataEntityV8(response, 'Q117786961', resolvedAt);
    expect(result).toEqual({
      status: 'missing',
      identity: {
        requestedId: 'Q117786961',
        canonicalId: 'Q117786961',
        redirectChain: ['Q117786961'],
        resolvedAt,
        revision: null
      }
    });
  });

  it('returns missing for explicit 1 missing', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          missing: 1
        }
      }
    };
    const result = resolveWikidataEntityV8(response, 'Q117786961', resolvedAt);
    expect(result).toEqual({
      status: 'missing',
      identity: {
        requestedId: 'Q117786961',
        canonicalId: 'Q117786961',
        redirectChain: ['Q117786961'],
        resolvedAt,
        revision: null
      }
    });
  });

  it('rejects invalid missing false', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          missing: false,
          lastrevid: 12345,
          modified: '2024-01-01T00:00:00Z'
        }
      }
    };
    expect(() => resolveWikidataEntityV8(response, 'Q117786961', resolvedAt)).toThrow('Invalid Wikidata missing marker');
  });

  it('allows redirected target to be explicitly missing without revision', () => {
    const response = {
      entities: {
        Q117786961: {
          id: 'Q117786961',
          missing: true
        }
      },
      redirects: [{ from: 'Q9055843', to: 'Q117786961' }]
    };
    const result = resolveWikidataEntityV8(response, 'Q9055843', resolvedAt);
    expect(result).toEqual({
      status: 'missing',
      identity: {
        requestedId: 'Q9055843',
        canonicalId: 'Q117786961',
        redirectChain: ['Q9055843', 'Q117786961'],
        resolvedAt,
        revision: null
      }
    });
  });
});
