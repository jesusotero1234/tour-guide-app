import axios from 'axios';
import { WikimediaService } from './wikimediaService';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WikimediaService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('prefers a valid thumbnail URL over the original oversized image', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        query: {
          pages: {
            '1': {
              pageid: 1,
              ns: 6,
              title: 'File:Las Meninas.jpg',
              imageinfo: [{
                url: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Las_Meninas.jpg',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Las_Meninas.jpg/1200px-Las_Meninas.jpg',
                width: 26065,
                height: 30000,
                thumbwidth: 1041,
                thumbheight: 1200,
                size: 123456,
                globalusage: [{ wiki: 'enwiki', title: 'Las Meninas' }],
                extmetadata: {
                  ImageDescription: { value: 'A well described painting from the Prado Museum.' },
                  Categories: { value: 'Quality images' },
                },
              }],
            },
          },
        },
      },
    } as any);

    mockedAxios.head.mockResolvedValue({
      headers: { 'content-type': 'image/jpeg' },
      status: 200,
    } as any);

    const service = new WikimediaService();
    const imageUrl = await service.fetchImageForPlace('Museo del Prado', 'Madrid', 'Spain');

    expect(imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Las_Meninas.jpg/1200px-Las_Meninas.jpg');
    expect(mockedAxios.head).toHaveBeenCalledWith(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Las_Meninas.jpg/1200px-Las_Meninas.jpg',
      expect.objectContaining({ timeout: 10000 })
    );
  });

  it('falls back to the next candidate when the first image URL is unusable', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        query: {
          pages: {
            '1': {
              pageid: 1,
              ns: 6,
              title: 'File:Broken image.jpg',
              imageinfo: [{
                url: 'https://upload.wikimedia.org/wikipedia/commons/broken.jpg',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/broken.jpg',
                width: 2400,
                height: 1600,
                globalusage: [{ wiki: 'enwiki', title: 'Broken page' }],
                extmetadata: {
                  ImageDescription: { value: 'Broken but relevant image.' },
                },
              }],
            },
            '2': {
              pageid: 2,
              ns: 6,
              title: 'File:Working image.jpg',
              imageinfo: [{
                url: 'https://upload.wikimedia.org/wikipedia/commons/working.jpg',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/working.jpg',
                width: 2200,
                height: 1500,
                globalusage: [{ wiki: 'enwiki', title: 'Working page' }],
                extmetadata: {
                  ImageDescription: { value: 'Working image with enough description text.' },
                },
              }],
            },
          },
        },
      },
    } as any);

    mockedAxios.head
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ headers: { 'content-type': 'image/jpeg' }, status: 200 } as any);

    const service = new WikimediaService();
    const imageUrl = await service.fetchImageForPlace('Museo del Prado', 'Madrid', 'Spain');

    expect(imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/working.jpg');
    expect(mockedAxios.head).toHaveBeenCalledTimes(2);
  });

  it('prefers a Wikidata P18 image before Commons search results', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          entities: [{
            id: 'Q123',
            claims: {
              P18: [{
                mainsnak: {
                  datavalue: {
                    value: 'Prado exterior.jpg',
                  },
                },
              }],
            },
          }],
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          query: {
            pages: {
              '1': {
                pageid: 1,
                ns: 6,
                title: 'File:Prado exterior.jpg',
                imageinfo: [{
                  url: 'https://upload.wikimedia.org/wikipedia/commons/prado-exterior.jpg',
                  thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/prado-exterior.jpg',
                  width: 2400,
                  height: 1600,
                  extmetadata: {
                    ImageDescription: { value: 'Exterior of the Museo del Prado in Madrid.' },
                  },
                }],
              },
            },
          },
        },
      } as any);

    mockedAxios.head.mockResolvedValue({
      headers: { 'content-type': 'image/jpeg' },
      status: 200,
    } as any);

    const service = new WikimediaService();
    const imageUrl = await service.fetchImageForPlace('Museo del Prado', 'Madrid', 'Spain', {
      wikidata: 'Q123',
    });

    expect(imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/prado-exterior.jpg');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('falls back to the tagged Wikipedia page image when Wikidata has no usable image', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          entities: [{
            id: 'Q123',
            claims: {},
          }],
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          query: {
            pages: {
              '42': {
                title: 'Museo del Prado',
                thumbnail: {
                  source: 'https://upload.wikimedia.org/wikipedia/en/thumb/prado-page.jpg',
                  width: 900,
                  height: 600,
                },
              },
            },
          },
        },
      } as any);

    mockedAxios.head.mockResolvedValue({
      headers: { 'content-type': 'image/jpeg' },
      status: 200,
    } as any);

    const service = new WikimediaService();
    const imageUrl = await service.fetchImageForPlace('Museo del Prado', 'Madrid', 'Spain', {
      wikidata: 'Q123',
      wikipedia: 'es:Museo_del_Prado',
    });

    expect(imageUrl).toBe('https://upload.wikimedia.org/wikipedia/en/thumb/prado-page.jpg');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('penalizes irrelevant artwork results for museum places when a building image exists', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        query: {
          pages: {
            '1': {
              pageid: 1,
              ns: 6,
              title: 'File:Las Meninas at Prado.jpg',
              imageinfo: [{
                url: 'https://upload.wikimedia.org/wikipedia/commons/las-meninas.jpg',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/las-meninas.jpg',
                width: 5000,
                height: 4000,
                globalusage: Array.from({ length: 8 }, (_, index) => ({ wiki: `wiki-${index}`, title: 'Las Meninas' })),
                extmetadata: {
                  ImageDescription: { value: 'Painting from the museum collection, oil on canvas.' },
                  Categories: { value: 'Paintings in the Museo del Prado' },
                  ObjectName: { value: 'Las Meninas' },
                },
              }],
            },
            '2': {
              pageid: 2,
              ns: 6,
              title: 'File:Museo del Prado facade.jpg',
              imageinfo: [{
                url: 'https://upload.wikimedia.org/wikipedia/commons/prado-facade.jpg',
                thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/prado-facade.jpg',
                width: 2200,
                height: 1400,
                globalusage: [{ wiki: 'eswiki', title: 'Museo del Prado' }],
                extmetadata: {
                  ImageDescription: { value: 'Main facade of Museo del Prado in Madrid, Spain.' },
                  Categories: { value: 'Museo del Prado exterior' },
                  ObjectName: { value: 'Museo del Prado facade' },
                },
              }],
            },
          },
        },
      },
    } as any);

    mockedAxios.head.mockResolvedValue({
      headers: { 'content-type': 'image/jpeg' },
      status: 200,
    } as any);

    const service = new WikimediaService();
    const imageUrl = await service.fetchImageForPlace('Museo del Prado', 'Madrid', 'Spain', {
      category: 'museum',
      osmTags: { tourism: 'museum', name: 'Museo del Prado' },
    });

    expect(imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/prado-facade.jpg');
  });
});
