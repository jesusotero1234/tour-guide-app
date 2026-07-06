import { OrchestrationService } from './orchestrationService';
import { TourRepository } from '../domain/repositories/TourRepository';
import { AudioAssetRepository } from '../domain/repositories/AudioAssetRepository';
import { AudioStorage } from '../domain/storage/AudioStorage';
import { CityQualityNotAvailableError } from '../domain/errors/CityQualityNotAvailableError';
import { PostgresTourQualityReviewQueueRepository } from '../infrastructure/postgres/PostgresTourQualityReviewQueueRepository';
import { prismaClient } from '../infrastructure/db/prismaClient';
import * as PoiEnrichmentPipeline from './poi/PoiEnrichmentPipeline';

function createService(reviewQueueRepository?: Pick<PostgresTourQualityReviewQueueRepository, 'enqueue'>): OrchestrationService {
  const tourRepository: TourRepository = {
    save: jest.fn(),
    findById: jest.fn(),
    listRecent: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue([]),
  };

  const audioAssetRepository: AudioAssetRepository = {
    findByPlaceId: jest.fn(),
    save: jest.fn(),
  };

  const audioStorage: AudioStorage = {
    save: jest.fn(),
  };

  return new OrchestrationService(
    tourRepository,
    audioAssetRepository,
    audioStorage,
    reviewQueueRepository || { enqueue: jest.fn() }
  );
}

function richNarration(name: string): string {
  return [
    `${name} se presenta como una parada donde la escala del espacio, el movimiento de la gente y la forma urbana ayudan a leer la ciudad con mucha mas claridad de la que parece a simple vista. Al caminar alrededor, aparecen detalles suficientes para construir una narracion rica sin inventar datos ajenos al lugar.`,
    `Los datos publicos disponibles no obligan a exagerar, pero si permiten observar el punto con atencion y entenderlo como parte de una secuencia historica y civica mas amplia dentro de Madrid. La parada funciona como una pieza de orientacion, memoria urbana y lectura del entorno, no como una simple referencia aislada dentro del mapa.`,
    `En este recorrido importa porque conecta memoria urbana, uso cotidiano y orientacion a pie, dando contexto real antes de continuar hacia la siguiente parada. La descripcion puede apoyarse en el ambiente, en la relacion entre edificios y espacio abierto, y en la forma en que los visitantes perciben la ciudad mientras avanzan entre una escena y otra del trayecto. Tambien permite sostener una experiencia de audio con suficiente densidad, pausas naturales y observaciones utiles para quien camina.`
  ].join(' ');
}

function richPlaces(tourId: string, count = 5) {
  const names = ['Museo del Prado', 'Puerta del Sol', 'Plaza Mayor', 'Fuente de Cibeles', 'Real Jardin Botanico'];
  return names.slice(0, count).map((name, index) => ({
    id: `place-${index + 1}`,
    tourId,
    name,
    description: richNarration(name),
    latitude: 40.4138 + index * 0.001,
    longitude: -3.6921 - index * 0.001,
    position: index,
    imageUrl: `https://example.com/${index + 1}.jpg`,
    audioUrl: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

function structuralPlaces(count = 5) {
  const names = [
    'Museo del Prado',
    'Puerta del Sol',
    'Plaza Mayor',
    'Fuente de Cibeles',
    'Real Jardin Botanico',
    'Templo de Debod',
    'Palacio Real',
    'Puerta de Alcala',
  ];
  const categories = ['square_civic', 'square_civic', 'square_civic', 'memorial', 'civic_power', 'memorial', 'civic_power', 'memorial'];

  return names.slice(0, count).map((name, index) => ({
    poi: {
      osmType: 'relation',
      osmId: index + 1,
      name,
      lat: 40.4138 + index * 0.001,
      lng: -3.6921 - index * 0.001,
      tags: { wikidata: `Q${index + 1}`, wikipedia: `es:${name.replace(/\s+/g, '_')}`, name },
      enriched: {
        nameTranslations: { es: name, en: name },
        description: 'Desc',
        wikipediaLead: 'Lead',
        wikipediaBody: 'Body',
        wikidataClaims: { inception: '1819' },
        osmTags: {},
        wikivoyage: null,
        descriptionLanguage: 'es',
        attribution: {},
      },
    },
    name,
    nameInTourLanguage: name,
    coordinates: { lat: 40.4138 + index * 0.001, lng: -3.6921 - index * 0.001 },
    importance_score: 10 - index,
    wikidataId: `Q${index + 1}`,
    fameScore: 40 - index,
    landmarkTier: index === 0 ? 'flagship' : 'major',
    category: categories[index] || 'monument',
    historyPlaceScore: 18 - (index * 0.2),
    historyPlaceKinds: ['event-place'],
    historyIsEventSiteLike: true,
    historyIsMuseumLike: false,
    estimatedDuration: 20,
  }));
}

describe('OrchestrationService confidence gate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function mockSuccessfulTail(service: OrchestrationService) {
    jest.spyOn(service as any, 'buildNarratedPlaces').mockImplementation(async (...args: any[]) => {
      const [places] = args;
      return places.map((place: any, index: number) => ({
      ...place,
      id: `place-${index + 1}`,
      description: richNarration(place.name || `Parada ${index + 1}`),
      descriptionSections: undefined,
      }));
    });
    jest.spyOn(service as any, 'fetchImagesForPlaces').mockImplementation(async (...args: any[]) => args[0]);
    jest.spyOn(service as any, 'generateAudio').mockImplementation(async (...args: any[]) => args[0]);
    jest.spyOn((service as any).tourRepository, 'save').mockImplementation(async (tour: any) => ({
      ...tour,
      id: 'tour-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      places: tour.places.map((place: any, index: number) => ({
        ...place,
        id: place.id || `place-${index + 1}`,
      })),
    }));
  }

  it('reuses an existing fully-generated tour with the same request key', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    const audioAssetRepository = (service as any).audioAssetRepository;
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourData');

    jest.spyOn(tourRepository, 'list').mockResolvedValue([{
      id: 'tour-existing',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
      metadata: {},
      places: richPlaces('tour-existing'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]);

    jest.spyOn(tourRepository, 'findById').mockResolvedValue({
      id: 'tour-existing',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
      metadata: {},
      places: richPlaces('tour-existing'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    jest.spyOn(audioAssetRepository, 'findByPlaceId').mockResolvedValue({
      id: 'audio-1',
      placeId: 'place-1',
      language: 'es',
      format: 'wav',
      storagePath: 'place-1-es.wav',
      audioUrl: 'http://localhost:3001/audio/place-1-es.wav',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.generateCompleteTour({
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
    });

    expect(result.id).toBe('tour-existing');
    expect(result.places[0].audioUrl).toBe('http://localhost:3001/audio/place-1-es.wav');
    expect(structuralSpy).not.toHaveBeenCalled();
  });

  it('reuses an existing fully-generated concept tour with the same concept slug', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    const audioAssetRepository = (service as any).audioAssetRepository;
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourFromConcept');

    jest.spyOn(prismaClient.tourConcept, 'findFirst').mockResolvedValue({
      slug: 'madrid-historical',
      title: 'Madrid Historical Highlights',
      routeType: 'historical',
      estimatedStops: 6,
      suggestedDurationMinutes: 120,
      anchorPoiIds: [],
      supportingPoiIds: [],
    } as any);

    jest.spyOn(tourRepository, 'list').mockResolvedValue([{
      id: 'tour-concept-existing',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      metadata: { conceptSlug: 'madrid-historical' },
      places: richPlaces('tour-concept-existing'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]);

    jest.spyOn(tourRepository, 'findById').mockResolvedValue({
      id: 'tour-concept-existing',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      metadata: { conceptSlug: 'madrid-historical' },
      places: richPlaces('tour-concept-existing'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    jest.spyOn(audioAssetRepository, 'findByPlaceId').mockResolvedValue({
      id: 'audio-1',
      placeId: 'place-1',
      language: 'es',
      format: 'wav',
      storagePath: 'place-1-es.wav',
      audioUrl: 'http://localhost:3001/audio/place-1-es.wav',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.generateTourFromConcept({
      conceptSlug: 'madrid-historical',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      language: 'es',
      durationMinutes: 120,
    });

    expect(result.id).toBe('tour-concept-existing');
    expect(result.places[0].audioUrl).toBe('http://localhost:3001/audio/place-1-es.wav');
    expect(structuralSpy).not.toHaveBeenCalled();
  });

  it('skips exact reuse when the cached tour content is weak', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    const audioAssetRepository = (service as any).audioAssetRepository;
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: [
        {
          poi: {
            osmType: 'relation',
            osmId: 1,
            name: 'Museo del Prado',
            lat: 40.4138,
            lng: -3.6921,
            tags: { wikidata: 'Q1', wikipedia: 'es:Museo_del_Prado', name: 'Museo del Prado' },
            enriched: {
              nameTranslations: { es: 'Museo del Prado' },
              description: 'Desc',
              wikipediaLead: 'Lead',
              wikipediaBody: 'Body',
              wikidataClaims: { inception: '1819' },
              osmTags: {},
              wikivoyage: null,
              descriptionLanguage: 'es',
              attribution: {},
            },
          },
          name: 'Museo del Prado',
          coordinates: { lat: 40.4138, lng: -3.6921 },
          importance_score: 10,
          category: 'museum',
          estimatedDuration: 20,
        },
      ],
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: { degraded: false, degradationReason: null, coverageRatio: 1 },
      confidenceInput: { input: { rawPoolSize: 10, wikidataTaggedCount: 10, sitelinksResolvedRatio: 1, maxSitelinks: 10 }, output: { shortlistSize: 1, routeDuplicateWikidataCount: 0, routeMaxCategoryShare: 1, routeFlagshipCount: 1, degraded: false, coverageRatio: 1, stopCount: 1 } },
    });
    jest.spyOn(service as any, 'buildNarratedPlaces').mockResolvedValue([
      {
        id: 'place-2',
        name: 'Museo del Prado',
        description: richNarration('Museo del Prado'),
        descriptionSections: { arrival: 'arrival', history: 'history', significance: 'significance' },
        coordinates: { lat: 40.4138, lng: -3.6921 },
        position: 0,
      },
    ]);
    jest.spyOn(service as any, 'fetchImagesForPlaces').mockImplementation(async (...args: any[]) => args[0]);
    jest.spyOn(service as any, 'generateAudio').mockImplementation(async (...args: any[]) => args[0]);
    jest.spyOn(tourRepository, 'save').mockImplementation(async (tour: any) => ({
      ...tour,
      id: 'tour-fresh',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      places: tour.places.map((place: any, index: number) => ({ ...place, id: `place-${index + 1}` })),
    }));

    jest.spyOn(tourRepository, 'list').mockResolvedValue([{
      id: 'tour-existing-bad',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
      metadata: {},
      places: [{
        id: 'place-1',
        tourId: 'tour-existing-bad',
        name: 'Museo del Prado',
        description: 'Visit Museo del Prado.',
        latitude: 40.4138,
        longitude: -3.6921,
        position: 0,
        imageUrl: 'https://example.com/prado.jpg',
        audioUrl: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]);
    jest.spyOn(tourRepository, 'findById').mockResolvedValue({
      id: 'tour-existing-bad',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
      metadata: {},
      places: [{
        id: 'place-1',
        tourId: 'tour-existing-bad',
        name: 'Museo del Prado',
        description: 'Visit Museo del Prado.',
        latitude: 40.4138,
        longitude: -3.6921,
        position: 0,
        imageUrl: 'https://example.com/prado.jpg',
        audioUrl: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    jest.spyOn(audioAssetRepository, 'findByPlaceId').mockResolvedValue({
      id: 'audio-1',
      placeId: 'place-1',
      language: 'es',
      format: 'wav',
      storagePath: 'place-1-es.wav',
      audioUrl: 'http://localhost:3001/audio/place-1-es.wav',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await service.generateCompleteTour({
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
    });

    expect(result.id).toBe('tour-fresh');
    expect(structuralSpy).toHaveBeenCalled();
  });

  it('persists a newly generated concept tour with concept metadata', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    mockSuccessfulTail(service);

    jest.spyOn(prismaClient.tourConcept, 'findFirst').mockResolvedValue({
      slug: 'madrid-historical',
      title: 'Madrid Historical Highlights',
      routeType: 'historical',
      estimatedStops: 6,
      suggestedDurationMinutes: 120,
      anchorPoiIds: [],
      supportingPoiIds: [],
    } as any);

    jest.spyOn((service as any).tourRepository, 'list').mockResolvedValue([]);
    jest.spyOn(service as any, 'generateStructuralTourFromConcept').mockResolvedValue([
      {
        poi: {
          osmType: 'relation',
          osmId: 1,
          name: 'Museo del Prado',
          lat: 40.4138,
          lng: -3.6921,
          tags: { wikidata: 'Q1', wikipedia: 'es:Museo_del_Prado', name: 'Museo del Prado' },
          enriched: {
            nameTranslations: { es: 'Museo del Prado' },
            description: 'Desc',
            wikipediaLead: 'Desc',
            wikipediaBody: 'Body',
            wikidataClaims: { inception: '1819' },
            osmTags: {},
            wikivoyage: null,
            descriptionLanguage: 'es',
            attribution: {},
          },
        },
        name: 'Museo del Prado',
        nameInTourLanguage: 'Museo del Prado',
        coordinates: { lat: 40.4138, lng: -3.6921 },
        importance_score: 10,
        fameScore: 20,
        landmarkTier: 'flagship',
        category: 'museum',
        estimatedDuration: 20,
      },
    ]);

    const saveSpy = jest.spyOn((service as any).tourRepository, 'save');

    await service.generateTourFromConcept({
      conceptSlug: 'madrid-historical',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      language: 'es',
      durationMinutes: 120,
    });

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      theme: 'history',
      metadata: expect.objectContaining({
        conceptSlug: 'madrid-historical',
        generationMode: 'from-concept',
      }),
    }));
  });

  it('repairs missing audio on an exact-language tour instead of creating a duplicate', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    const audioAssetRepository = (service as any).audioAssetRepository;
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourData');
    const saveSpy = jest.spyOn(tourRepository, 'save');
    const generateAudioSpy = jest.spyOn(service as any, 'generateAudio').mockImplementation(async (...args: any[]) => {
      const [places] = args;
      return places.map((place: any) => ({
        ...place,
        audioUrl: place.audioUrl || `http://localhost:3001/audio/${place.id}-es.wav`,
        coordinates: place.coordinates || { lat: place.latitude, lng: place.longitude },
      }));
    });

    const exactTour = {
      id: 'tour-existing',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
      metadata: {},
      places: richPlaces('tour-existing'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    jest.spyOn(tourRepository, 'list').mockResolvedValue([exactTour]);
    jest.spyOn(tourRepository, 'findById').mockResolvedValue(exactTour);
    jest.spyOn(audioAssetRepository, 'findByPlaceId')
      .mockResolvedValueOnce({
        id: 'audio-1',
        placeId: 'place-1',
        language: 'es',
        format: 'wav',
        storagePath: 'place-1-es.wav',
        audioUrl: 'http://localhost:3001/audio/place-1-es.wav',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .mockResolvedValue(null);

    const result = await service.generateCompleteTour({
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
    });

    expect(result.id).toBe('tour-existing');
    expect(result.places[0].audioUrl).toBe('http://localhost:3001/audio/place-1-es.wav');
    expect(result.places[1].audioUrl).toBe('http://localhost:3001/audio/place-2-es.wav');
    expect(structuralSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(generateAudioSpy).toHaveBeenCalled();
  });

  it('builds a localized tour from a metadata-rich base itinerary in another language', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourData');
    const buildNarratedPlacesSpy = jest.spyOn(service as any, 'buildNarratedPlaces').mockImplementation(async (...args: any[]) => {
      const [places] = args;
      return places.map((place: any, index: number) => ({
        ...place,
        description: richNarration(place.name || `Parada ${index + 1}`),
        descriptionSections: { intro: `Intro ${index + 1}` },
      }));
    });
    jest.spyOn(PoiEnrichmentPipeline, 'enrichShortlistedPois').mockResolvedValue([
      {
        osmType: 'relation',
        osmId: 1,
        name: 'Museo del Prado',
        lat: 40.4138,
        lng: -3.6921,
        tags: { name: 'Museo del Prado', wikidata: 'Q1', wikipedia: 'fr:Musée_du_Prado' },
        enriched: {
          nameTranslations: { es: 'Museo del Prado' },
          description: 'Desc',
          wikipediaLead: 'Desc',
          wikipediaBody: 'Body',
          wikidataClaims: null,
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'es',
          attribution: {},
        },
      } as any,
      {
        osmType: 'node',
        osmId: 2,
        name: 'Plaza Mayor',
        lat: 40.4155,
        lng: -3.7074,
        tags: { name: 'Plaza Mayor', wikidata: 'Q2', wikipedia: 'fr:Plaza_Mayor_de_Madrid' },
        enriched: {
          nameTranslations: { es: 'Plaza Mayor' },
          description: 'Desc',
          wikipediaLead: 'Desc',
          wikipediaBody: 'Body',
          wikidataClaims: null,
          osmTags: {},
          wikivoyage: null,
          descriptionLanguage: 'es',
          attribution: {},
        },
      } as any,
    ]);
    jest.spyOn(tourRepository, 'save').mockImplementation(async (tour: any) => ({
      ...tour,
      id: 'tour-localized',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      places: tour.places.map((place: any, index: number) => ({
        ...place,
        id: `localized-place-${index + 1}`,
        tourId: 'tour-localized',
      })),
    }));
    jest.spyOn(service as any, 'generateAudio').mockImplementation(async (...args: any[]) => {
      const [places] = args;
      return places.map((place: any) => ({
        ...place,
        audioUrl: `http://localhost:3001/audio/${place.id}-es.wav`,
      }));
    });
    jest.spyOn(tourRepository, 'list').mockResolvedValue([
      {
        id: 'tour-fr',
        city: 'Madrid',
        country: 'Spain',
        countryCode: 'ES',
        theme: 'history',
        language: 'fr',
        durationMinutes: 240,
        metadata: {},
        places: [
          {
            id: 'base-place-1',
            tourId: 'tour-fr',
            name: 'Musée du Prado',
            description: 'FR 1',
            latitude: 40.4138,
            longitude: -3.6921,
            position: 0,
            importanceScore: 9.5,
            imageUrl: 'https://example.com/prado.jpg',
            metadata: {
              sourcePoi: {
                osmType: 'relation',
                osmId: 1,
                wikidata: 'Q1',
                wikipedia: 'fr:Musée_du_Prado',
                osmName: 'Museo del Prado',
                localName: 'Musée du Prado',
                category: 'museum',
                landmarkTier: 'flagship',
                fameScore: 42,
                osmTags: { tourism: 'museum' },
              },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'base-place-2',
            tourId: 'tour-fr',
            name: 'Place Mayor',
            description: 'FR 2',
            latitude: 40.4155,
            longitude: -3.7074,
            position: 1,
            importanceScore: 8.7,
            imageUrl: 'https://example.com/plaza.jpg',
            metadata: {
              sourcePoi: {
                osmType: 'node',
                osmId: 2,
                wikidata: 'Q2',
                wikipedia: 'fr:Plaza_Mayor_de_Madrid',
                osmName: 'Plaza Mayor',
                localName: 'Place Mayor',
                category: 'square',
                landmarkTier: 'major',
                fameScore: 25,
                osmTags: { tourism: 'attraction' },
              },
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const result = await service.generateCompleteTour({
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
    });

    expect(result.id).toBe('tour-localized');
    expect(result.places).toHaveLength(2);
    expect(result.places[0].imageUrl).toBe('https://example.com/prado.jpg');
    expect(result.places[1].imageUrl).toBe('https://example.com/plaza.jpg');
    expect(result.places[0].audioUrl).toBe('http://localhost:3001/audio/localized-place-1-es.wav');
    expect(structuralSpy).not.toHaveBeenCalled();
    expect(buildNarratedPlacesSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Musée du Prado', category: 'museum' }),
        expect.objectContaining({ name: 'Place Mayor', category: 'square' }),
      ]),
      'Madrid',
      'history',
      'es',
      240,
    );
    expect(tourRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        generationMode: 'cross-language-localization',
        localizedFromTourId: 'tour-fr',
        localizedFromLanguage: 'fr',
      }),
      places: expect.arrayContaining([
        expect.objectContaining({
          imageUrl: 'https://example.com/prado.jpg',
          metadata: expect.objectContaining({ localizedFromPlaceId: 'base-place-1' }),
        }),
      ]),
    }));
  });

  it('builds audio narration text from ordered description sections when available', () => {
    const service = createService();

    expect((service as any).buildAudioNarrationText({
      description: 'fallback text',
      descriptionSections: {
        transition: 'Transition',
        significance: 'Significance',
        arrival: 'Arrival',
      },
    })).toBe('Arrival\n\nSignificance\n\nTransition');
  });

  it('falls back to description when audio sections are unavailable', () => {
    const service = createService();

    expect((service as any).buildAudioNarrationText({
      description: 'fallback text',
      descriptionSections: {},
    })).toBe('fallback text');
  });

  it('falls back to full generation when cross-language source metadata is missing', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    mockSuccessfulTail(service);
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: structuralPlaces(),
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: {
        degraded: false,
        degradationReason: null,
        coverageRatio: 1,
        estimatedTourMinutes: 240,
        requestedDuration: 240,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 10,
          wikidataTaggedCount: 5,
          sitelinksResolvedRatio: 1,
          maxSitelinks: 10,
        },
        output: {
          shortlistSize: 5,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 0.4,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 1,
          stopCount: 5,
        },
      },
    });
    jest.spyOn(tourRepository, 'list').mockResolvedValue([
      {
        id: 'tour-fr',
        city: 'Madrid',
        country: 'Spain',
        countryCode: 'ES',
        theme: 'history',
        language: 'fr',
        durationMinutes: 240,
        metadata: {},
        places: [{
          id: 'base-place-1',
          tourId: 'tour-fr',
          name: 'Musée du Prado',
          description: 'FR 1',
          latitude: 40.4138,
          longitude: -3.6921,
          position: 0,
          imageUrl: 'https://example.com/prado.jpg',
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const result = await service.generateCompleteTour({
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
    });

    expect(result.id).toBe('tour-1');
    expect(structuralSpy).toHaveBeenCalled();
    expect(tourRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ generationMode: 'full' }),
    }));
  });

  it('rejects before narration, images, DB, and audio in enforce mode', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TOUR_CONFIDENCE_GATE_MODE = 'enforce';

    const service = createService();
    const structuralSpy = jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: [],
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: {
        degraded: true,
        degradationReason: 'duration_below_requested',
        coverageRatio: 0.6,
        estimatedTourMinutes: 100,
        requestedDuration: 240,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 6,
          routeDuplicateWikidataCount: 1,
          routeMaxCategoryShare: 0.9,
          routeFlagshipCount: 0,
          degraded: true,
          coverageRatio: 0.6,
          stopCount: 6,
        },
      },
    });
    const narrationSpy = jest.spyOn(service as any, 'buildNarratedPlaces');
    const imageSpy = jest.spyOn(service as any, 'fetchImagesForPlaces');
    const audioSpy = jest.spyOn(service as any, 'generateAudio');

    await expect(service.generateCompleteTour({
      city: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      theme: 'history',
      language: 'en',
      durationMinutes: 240,
    })).rejects.toBeInstanceOf(CityQualityNotAvailableError);

    expect(structuralSpy).toHaveBeenCalled();
    expect(narrationSpy).not.toHaveBeenCalled();
    expect(imageSpy).not.toHaveBeenCalled();
    expect(audioSpy).not.toHaveBeenCalled();
  });

  it('rejects fallback-heavy generated narration before DB and audio', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;
    const structural = structuralPlaces(5);
    jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: structural,
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: {
        degraded: false,
        degradationReason: null,
        coverageRatio: 1,
        estimatedTourMinutes: 240,
        requestedDuration: 240,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 5,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 0.4,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 1,
          stopCount: 5,
        },
      },
    });
    jest.spyOn(service as any, 'buildNarratedPlaces').mockResolvedValue(
      structural.map((place) => ({
        ...place,
        description: [
          'Los datos disponibles lo describen con detalles como tourism=attraction.',
          Array(180).fill('historia').join(' '),
        ].join('\n\n'),
        narrationMeta: { fallback: 'grounded-template' },
      }))
    );
    jest.spyOn(service as any, 'fetchImagesForPlaces').mockImplementation(async (...args: any[]) => args[0]);
    const audioSpy = jest.spyOn(service as any, 'generateAudio');
    const saveSpy = jest.spyOn(tourRepository, 'save');

    await expect(service.generateCompleteTour({
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 240,
    })).rejects.toMatchObject({
      details: expect.objectContaining({
        stage: 'output',
        reasons: expect.arrayContaining(['fallback_stop_present']),
        signals: expect.objectContaining({ fallbackStopCount: 5 }),
      }),
    });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(audioSpy).not.toHaveBeenCalled();
  });

  it('persists shadow review queue events for unverified cities', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TOUR_CONFIDENCE_GATE_MODE = 'shadow';

    const reviewQueueRepository = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = createService(reviewQueueRepository);
    mockSuccessfulTail(service);

    jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: structuralPlaces(6),
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: {
        degraded: false,
        degradationReason: null,
        coverageRatio: 0.95,
        estimatedTourMinutes: 220,
        requestedDuration: 240,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 6,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 0.5,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 0.95,
          stopCount: 6,
        },
      },
    });

    const result = await service.generateCompleteTour({
      city: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      theme: 'history',
      language: 'en',
      durationMinutes: 240,
    });

    expect(reviewQueueRepository.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      city: 'Kyoto',
      countryCode: 'JP',
      theme: 'history',
      qualityStatus: 'shadow_passed',
      stopCount: 6,
      requestFingerprint: expect.any(String),
      confidence: expect.objectContaining({ passed: true, stage: 'output' }),
    }));
    expect(result.qualityStatus).toBe('shadow_evaluated');
  });

  it('marks enforced pass as auto_approved for unverified cities', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TOUR_CONFIDENCE_GATE_MODE = 'enforce';

    const reviewQueueRepository = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = createService(reviewQueueRepository);
    mockSuccessfulTail(service);
    jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: structuralPlaces(6),
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: {
        degraded: false,
        degradationReason: null,
        coverageRatio: 0.95,
        estimatedTourMinutes: 220,
        requestedDuration: 240,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 6,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 0.5,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 0.95,
          stopCount: 6,
        },
      },
    });

    const saveSpy = jest.spyOn((service as any).tourRepository, 'save');

    const result = await service.generateCompleteTour({
      city: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      theme: 'history',
      language: 'en',
      durationMinutes: 240,
    });

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ qualityStatus: 'auto_approved' }),
    }));
    expect(reviewQueueRepository.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      qualityStatus: 'auto_approved',
      stopCount: 6,
      confidence: expect.objectContaining({ passed: true, stage: 'output' }),
    }));
    expect(result.qualityStatus).toBe('auto_approved');
    expect(result.confidence?.passed).toBe(true);
  });

  it('persists rejected review queue events before enforce rejection', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TOUR_CONFIDENCE_GATE_MODE = 'enforce';

    const reviewQueueRepository = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = createService(reviewQueueRepository);

    jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: [],
      routeCandidates: structuralPlaces(8),
      routeDiagnostics: {
        degraded: true,
        degradationReason: 'duration_below_requested',
        coverageRatio: 0.6,
        estimatedTourMinutes: 100,
        requestedDuration: 240,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 6,
          routeDuplicateWikidataCount: 1,
          routeMaxCategoryShare: 0.9,
          routeFlagshipCount: 0,
          degraded: true,
          coverageRatio: 0.6,
          stopCount: 6,
        },
      },
    });

    await expect(service.generateCompleteTour({
      city: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      theme: 'history',
      language: 'en',
      durationMinutes: 240,
    })).rejects.toBeInstanceOf(CityQualityNotAvailableError);

    expect(reviewQueueRepository.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      qualityStatus: 'rejected',
      stopCount: 6,
      confidence: expect.objectContaining({ passed: false }),
    }));
  });

  it('applies category-collapse repair in enforce mode when repair passes', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TOUR_CONFIDENCE_GATE_MODE = 'enforce';
    process.env.TOUR_QUALITY_REPAIR_MODE = 'enforce';

    const reviewQueueRepository = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = createService(reviewQueueRepository);
    mockSuccessfulTail(service);

    const routeCandidates = [
      { name: 'Palace 1', coordinates: { lat: 40.4168, lng: -3.7038 }, category: 'palace_castle', importance_score: 10, landmarkTier: 'flagship', poi: { tags: { wikidata: 'Q1' } } },
      { name: 'Palace 2', coordinates: { lat: 40.4173, lng: -3.7040 }, category: 'palace_castle', importance_score: 9.8, landmarkTier: 'major', poi: { tags: { wikidata: 'Q2' } } },
      { name: 'Palace 3', coordinates: { lat: 40.4178, lng: -3.7042 }, category: 'palace_castle', importance_score: 9.7, landmarkTier: 'major', poi: { tags: { wikidata: 'Q3' } } },
      { name: 'Palace 4', coordinates: { lat: 40.4183, lng: -3.7044 }, category: 'palace_castle', importance_score: 9.6, landmarkTier: 'major', poi: { tags: { wikidata: 'Q4' } } },
      { name: 'Palace 5', coordinates: { lat: 40.4188, lng: -3.7046 }, category: 'palace_castle', importance_score: 9.5, landmarkTier: 'major', poi: { tags: { wikidata: 'Q5' } } },
      { name: 'Market', coordinates: { lat: 40.4193, lng: -3.7048 }, category: 'market', importance_score: 9.4, landmarkTier: 'major', poi: { tags: { wikidata: 'Q6' } } },
      { name: 'Museum', coordinates: { lat: 40.4198, lng: -3.7050 }, category: 'museum', importance_score: 9.3, landmarkTier: 'major', poi: { tags: { wikidata: 'Q7' } } },
      { name: 'Cathedral', coordinates: { lat: 40.4203, lng: -3.7052 }, category: 'religious', importance_score: 9.2, landmarkTier: 'major', poi: { tags: { wikidata: 'Q8' } } },
    ].map((place, index) => ({
      ...place,
      wikidataId: place.poi.tags.wikidata,
      historyPlaceScore: 18 - (index * 0.2),
      historyPlaceKinds: ['event-place'],
      historyIsEventSiteLike: true,
      historyIsMuseumLike: false,
    }));

    jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: routeCandidates.slice(0, 5),
      routeCandidates,
      routeDiagnostics: {
        degraded: false,
        degradationReason: null,
        coverageRatio: 0.95,
        estimatedTourMinutes: 57,
        requestedDuration: 60,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 8,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 1,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 0.95,
          stopCount: 5,
        },
      },
    });

    const narrationSpy = jest.spyOn(service as any, 'buildNarratedPlaces');

    const result = await service.generateCompleteTour({
      city: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      theme: 'history',
      language: 'en',
      durationMinutes: 60,
    });

    expect(narrationSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Market' }),
        expect.objectContaining({ name: 'Cathedral' }),
      ]),
      'Kyoto',
      'history',
      'en',
      60,
    );
    expect(reviewQueueRepository.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      qualityStatus: 'auto_repaired',
      confidence: expect.objectContaining({ passed: true }),
      stopCount: 5,
    }));
    expect(result.qualityStatus).toBe('auto_repaired');
    expect(result.repair).toEqual(expect.objectContaining({ attempted: true, applied: true }));
    expect(result.confidence?.passed).toBe(true);
  });

  it('rejects in enforce mode when category-collapse repair still fails', async () => {
    process.env.NODE_ENV = 'development';
    process.env.TOUR_CONFIDENCE_GATE_MODE = 'enforce';
    process.env.TOUR_QUALITY_REPAIR_MODE = 'enforce';

    const reviewQueueRepository = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const service = createService(reviewQueueRepository);

    const routeCandidates = [
      { name: 'Palace 1', coordinates: { lat: 40.4168, lng: -3.7038 }, category: 'palace_castle', importance_score: 10, landmarkTier: 'flagship', poi: { tags: { wikidata: 'Q1' } } },
      { name: 'Palace 2', coordinates: { lat: 40.4173, lng: -3.7040 }, category: 'palace_castle', importance_score: 9.8, landmarkTier: 'major', poi: { tags: { wikidata: 'Q2' } } },
      { name: 'Palace 3', coordinates: { lat: 40.4178, lng: -3.7042 }, category: 'palace_castle', importance_score: 9.7, landmarkTier: 'major', poi: { tags: { wikidata: 'Q3' } } },
      { name: 'Palace 4', coordinates: { lat: 40.4183, lng: -3.7044 }, category: 'palace_castle', importance_score: 9.6, landmarkTier: 'major', poi: { tags: { wikidata: 'Q4' } } },
      { name: 'Palace 5', coordinates: { lat: 40.4188, lng: -3.7046 }, category: 'palace_castle', importance_score: 9.5, landmarkTier: 'major', poi: { tags: { wikidata: 'Q5' } } },
    ].map((place, index) => ({
      ...place,
      wikidataId: place.poi.tags.wikidata,
      historyPlaceScore: 18 - (index * 0.2),
      historyPlaceKinds: ['event-place'],
      historyIsEventSiteLike: true,
      historyIsMuseumLike: false,
    }));

    jest.spyOn(service as any, 'generateStructuralTourData').mockResolvedValue({
      places: routeCandidates,
      routeCandidates,
      routeDiagnostics: {
        degraded: false,
        degradationReason: null,
        coverageRatio: 0.95,
        estimatedTourMinutes: 57,
        requestedDuration: 60,
      },
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 5,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 1,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 0.95,
          stopCount: 5,
        },
      },
    });

    await expect(service.generateCompleteTour({
      city: 'Kyoto',
      country: 'Japan',
      countryCode: 'JP',
      theme: 'history',
      language: 'en',
      durationMinutes: 60,
    })).rejects.toBeInstanceOf(CityQualityNotAvailableError);

    expect(reviewQueueRepository.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      qualityStatus: 'rejected',
      confidence: expect.objectContaining({ passed: false }),
      stopCount: 5,
    }));
  });

  it('lists only ready tours for browse and dedupes by concept slug', async () => {
    process.env.NODE_ENV = 'development';

    const service = createService();
    const tourRepository = (service as any).tourRepository;

    const olderMarkets = {
      id: 'tour-markets-old',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'food',
      language: 'es',
      durationMinutes: 120,
      metadata: { conceptSlug: 'madrid-markets' },
      places: richPlaces('tour-markets-old', 6).map((place) => ({ ...place, audioUrl: `https://audio/${place.id}.wav` })),
      createdAt: '2026-05-30T10:00:00.000Z',
      updatedAt: '2026-05-30T10:00:00.000Z',
    };
    const newerMarkets = {
      id: 'tour-markets-new',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'food',
      language: 'es',
      durationMinutes: 120,
      metadata: { conceptSlug: 'madrid-markets' },
      places: richPlaces('tour-markets-new', 6).map((place) => ({ ...place, audioUrl: `https://audio/${place.id}.wav` })),
      createdAt: '2026-05-31T10:00:00.000Z',
      updatedAt: '2026-05-31T10:00:00.000Z',
    };
    const weakHistorical = {
      id: 'tour-history-weak',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      metadata: { conceptSlug: 'madrid-historical' },
      places: richPlaces('tour-history-weak', 6).map((place, index) => ({
        ...place,
        description: index === 0 ? 'Visit Museo del Prado.' : 'Texto corto.',
        audioUrl: `https://audio/${place.id}.wav`,
      })),
      createdAt: '2026-05-31T09:00:00.000Z',
      updatedAt: '2026-05-31T09:00:00.000Z',
    };
    const shortReligious = {
      id: 'tour-religious-short',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      metadata: { conceptSlug: 'madrid-religious' },
      places: richPlaces('tour-religious-short', 4).map((place) => ({ ...place, audioUrl: `https://audio/${place.id}.wav` })),
      createdAt: '2026-05-31T08:00:00.000Z',
      updatedAt: '2026-05-31T08:00:00.000Z',
    };

    jest.spyOn(tourRepository, 'list').mockResolvedValue([
      olderMarkets as any,
      newerMarkets as any,
      weakHistorical as any,
      shortReligious as any,
    ]);
    jest.spyOn(tourRepository, 'findById').mockImplementation(async (...args: unknown[]) => {
      const [id] = args;
      const tours = [olderMarkets, newerMarkets, weakHistorical, shortReligious];
      return tours.find((tour) => tour.id === id) as any;
    });

    const result = await service.listTours({ city: 'Madrid', countryCode: 'ES', language: 'es', readyOnly: true });

    expect(result.data.tours).toHaveLength(1);
    expect(result.data.tours[0]).toEqual(expect.objectContaining({
      id: 'tour-markets-new',
      title: 'Plazas, Mercados y Vida de Barrio',
    }));
  });
});
