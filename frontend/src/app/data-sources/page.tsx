import { Header } from '@/components/layout/Header';
import Link from 'next/link';

interface DataSource {
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  description: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    name: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org',
    license: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
    description:
      'POI names, coordinates, categories, and bounding boxes. Map data is © OpenStreetMap contributors.',
  },
  {
    name: 'Nominatim',
    url: 'https://nominatim.openstreetmap.org',
    license: 'ODbL 1.0 (data) / GPLv2+ (software)',
    licenseUrl: 'https://nominatim.org/release-docs/develop/api/Overview/',
    description:
      'City geocoding — resolves city names to canonical OSM records with bounding boxes.',
  },
  {
    name: 'Overpass API',
    url: 'https://overpass-api.de',
    license: 'ODbL 1.0 (data)',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
    description:
      'POI queries by theme and bounding box. Powered by OpenStreetMap data.',
  },
  {
    name: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    description:
      'Short factual descriptions for points of interest, fetched via the Wikipedia API in the tour language.',
  },
  {
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    license: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    description:
      'Multilingual place names and notability signals, linked from OSM via wikidata= tags.',
  },
  {
    name: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org',
    license: 'Mixed / file-specific',
    licenseUrl: 'https://commons.wikimedia.org/wiki/Commons:Licensing',
    description:
      'Place imagery may be sourced from Wikimedia Commons. Each file can carry its own license and attribution requirements.',
  },
];

export default function DataSourcesPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-serif font-bold text-darkBrown mb-2">
          Data Sources
        </h1>
        <p className="text-darkBrown/70 mb-8">
          This application uses open geographic and encyclopaedic data. All sources are
          credited below with their applicable licenses.
        </p>

        <div className="space-y-6">
          {DATA_SOURCES.map((source) => (
            <div
              key={source.name}
              className="rounded-2xl border border-darkBrown/12 bg-surface-elevated p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold text-darkBrown hover:text-mutedGold transition-colors"
                  >
                    {source.name} ↗
                  </a>
                  <p className="mt-1 text-sm text-darkBrown/70">{source.description}</p>
                </div>
                <span className="shrink-0">
                  <a
                    href={source.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-medium bg-mutedGold/20 text-darkBrown border border-darkBrown/20 rounded px-2 py-1 hover:bg-mutedGold/40 transition-colors"
                  >
                    {source.license}
                  </a>
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-xs text-darkBrown/50">
          <Link href="/" className="underline hover:text-darkBrown">
            ← Back to tour generator
          </Link>
        </p>
      </main>
    </div>
  );
}
