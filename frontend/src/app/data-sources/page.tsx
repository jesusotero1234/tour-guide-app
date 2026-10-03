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

export default async function DataSourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = params.lang === 'fr' ? 'fr' : 'es';

  const t = {
    es: {
      heading: 'Fuentes de datos',
      notice1:
        'Esta aplicación utiliza datos geográficos y enciclopédicos abiertos. Los artículos y revisiones consultados están enlazados en cada parada del recorrido; esta lista de proveedores describe las herramientas y los datos, y no constituye prueba a nivel de frase para cada hecho individual.',
      notice2:
        'Los guiones adaptados por IA para los recorridos admitidos se ofrecen bajo CC BY-SA 4.0, con enlace a la licencia y los cambios indicados en la información del recorrido.',
      notice3:
        'Los créditos de Wikimedia Commons son específicos de cada archivo.',
      notice4:
        'Nominatim está desactivado en este piloto; el recorrido peatonal de FOSSGIS OSRM se guarda antes de revisarlo y las llamadas a teselas se realizan solo cuando se carga el mapa.',
    },
    fr: {
      heading: 'Sources de données',
      notice1:
        'Cette application utilise des données géographiques et encyclopédiques ouvertes. Les articles et révisions consultés sont liés à chaque étape du parcours ; cette liste de fournisseurs décrit les outils et les données, et ne constitue pas une preuve au niveau de la phrase pour chaque fait individuel.',
      notice2:
        'Les scripts adaptés par IA pour les parcours admis sont proposés sous CC BY-SA 4.0, avec lien vers la licence et les modifications indiquées dans les informations du parcours.',
      notice3:
        'Les crédits de Wikimedia Commons sont spécifiques à chaque fichier.',
      notice4:
        'Nominatim est désactivé pour ce pilote ; le parcours piéton de FOSSGIS OSRM est enregistré avant sa vérification et les appels de tuiles sont effectués uniquement lorsque la carte est chargée.',
    },
  };

  const strings = t[lang];

  return (
    <div className="min-h-screen bg-surface">
      <nav aria-label={lang === 'fr' ? 'Navigation' : 'Navegación'} className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">
        <Link href="/tours" className="inline-flex min-h-11 items-center text-sm text-darkBrown underline underline-offset-4">
          {lang === 'fr' ? '← Retour aux visites' : '← Volver a los tours'}
        </Link>
      </nav>
      <main className="max-w-3xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-serif font-bold text-darkBrown mb-2">
          {strings.heading}
        </h1>
        <p className="text-darkBrown/70 mb-4">{strings.notice1}</p>
        <p className="text-darkBrown/70 mb-4">
          {strings.notice2}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-darkBrown"
          >
            CC BY-SA 4.0
          </a>
        </p>
        <p className="text-darkBrown/70 mb-4">{strings.notice3}</p>
        <p className="text-darkBrown/70 mb-8">{strings.notice4}</p>

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

        <div className="mt-10">
          <Link href="/tours">{lang === 'fr' ? 'Retour aux visites' : 'Volver a los tours'}</Link>
        </div>
      </main>
    </div>
  );
}
