import type { Language } from '@/types/api';

export interface SeoCity { slug: string; name: string; countryCode: string; names: Record<Language, string>; }
export interface SeoRouteDefinition { id: string; city: string; locale: Language; slug: string; group: string; title?: string; description?: string; summary?: string; }

/** Exact public paths only: never retain arbitrary user-provided slugs in analytics. */
export function isSeoPagePath(path: string): boolean {
  const parts = path.split('/');
  return parts[0] === '' && ['es', 'en', 'fr', 'de', 'it'].includes(parts[1])
    && SEO_CITIES.some(city => city.slug === parts[2])
    && (parts.length === 3 || parts.length === 5 && parts[3] === 'rutas'
      && SEO_ROUTE_DEFINITIONS.some(route => route.locale === parts[1] && route.city === parts[2] && route.slug === parts[4]));
}

// Published inventory audited on 2026-09-20. UUIDs and slugs remain stable.
// New tours are added deliberately; live admission is checked again for every page.
export const SEO_CITIES: readonly SeoCity[] = [
  {
    "slug": "madrid",
    "name": "Madrid",
    "countryCode": "ES",
    "names": {
      "es": "Madrid",
      "en": "Madrid",
      "fr": "Madrid",
      "de": "Madrid",
      "it": "Madrid"
    }
  },
  {
    "slug": "alicante",
    "name": "Alicante",
    "countryCode": "ES",
    "names": {
      "es": "Alicante",
      "en": "Alicante",
      "fr": "Alicante",
      "de": "Alicante",
      "it": "Alicante"
    }
  },
  {
    "slug": "barcelona",
    "name": "Barcelona",
    "countryCode": "ES",
    "names": {
      "es": "Barcelona",
      "en": "Barcelona",
      "fr": "Barcelone",
      "de": "Barcelona",
      "it": "Barcellona"
    }
  },
  {
    "slug": "castellon-de-la-plana",
    "name": "Castellón de la Plana",
    "countryCode": "ES",
    "names": {
      "es": "Castellón de la Plana",
      "en": "Castellón de la Plana",
      "fr": "Castellón de la Plana",
      "de": "Castellón de la Plana",
      "it": "Castellón de la Plana"
    }
  },
  {
    "slug": "las-palmas-de-gran-canaria",
    "name": "Las Palmas de Gran Canaria",
    "countryCode": "ES",
    "names": {
      "es": "Las Palmas de Gran Canaria",
      "en": "Las Palmas de Gran Canaria",
      "fr": "Las Palmas de Gran Canaria",
      "de": "Las Palmas de Gran Canaria",
      "it": "Las Palmas de Gran Canaria"
    }
  },
  {
    "slug": "murcia",
    "name": "Murcia",
    "countryCode": "ES",
    "names": {
      "es": "Murcia",
      "en": "Murcia",
      "fr": "Murcia",
      "de": "Murcia",
      "it": "Murcia"
    }
  },
  {
    "slug": "malaga",
    "name": "Málaga",
    "countryCode": "ES",
    "names": {
      "es": "Málaga",
      "en": "Málaga",
      "fr": "Malaga",
      "de": "Málaga",
      "it": "Malaga"
    }
  },
  {
    "slug": "palma",
    "name": "Palma",
    "countryCode": "ES",
    "names": {
      "es": "Palma",
      "en": "Palma",
      "fr": "Palma",
      "de": "Palma",
      "it": "Palma"
    }
  },
  {
    "slug": "sevilla",
    "name": "Sevilla",
    "countryCode": "ES",
    "names": {
      "es": "Sevilla",
      "en": "Seville",
      "fr": "Séville",
      "de": "Sevilla",
      "it": "Siviglia"
    }
  },
  {
    "slug": "valencia",
    "name": "Valencia",
    "countryCode": "ES",
    "names": {
      "es": "Valencia",
      "en": "Valencia",
      "fr": "Valence",
      "de": "Valencia",
      "it": "Valencia"
    }
  },
  {
    "slug": "zaragoza",
    "name": "Zaragoza",
    "countryCode": "ES",
    "names": {
      "es": "Zaragoza",
      "en": "Zaragoza",
      "fr": "Zaragoza",
      "de": "Zaragoza",
      "it": "Zaragoza"
    }
  },
  {
    "slug": "berlin",
    "name": "Berlín",
    "countryCode": "DE",
    "names": {
      "es": "Berlín",
      "en": "Berlin",
      "fr": "Berlin",
      "de": "Berlin",
      "it": "Berlino"
    }
  },
  {
    "slug": "bologna",
    "name": "Bolonia",
    "countryCode": "IT",
    "names": {
      "es": "Bolonia",
      "en": "Bologna",
      "fr": "Bologne",
      "de": "Bologna",
      "it": "Bologna"
    }
  },
  {
    "slug": "bordeaux",
    "name": "Burdeos",
    "countryCode": "FR",
    "names": {
      "es": "Burdeos",
      "en": "Bordeaux",
      "fr": "Bordeaux",
      "de": "Bordeaux",
      "it": "Bordeaux"
    }
  },
  {
    "slug": "cologne",
    "name": "Colonia",
    "countryCode": "DE",
    "names": {
      "es": "Colonia",
      "en": "Cologne",
      "fr": "Cologne",
      "de": "Köln",
      "it": "Colonia"
    }
  },
  {
    "slug": "dresden",
    "name": "Dresde",
    "countryCode": "DE",
    "names": {
      "es": "Dresde",
      "en": "Dresden",
      "fr": "Dresde",
      "de": "Dresden",
      "it": "Dresda"
    }
  },
  {
    "slug": "dusseldorf",
    "name": "Düsseldorf",
    "countryCode": "DE",
    "names": {
      "es": "Düsseldorf",
      "en": "Düsseldorf",
      "fr": "Düsseldorf",
      "de": "Düsseldorf",
      "it": "Düsseldorf"
    }
  },
  {
    "slug": "firenze",
    "name": "Florencia",
    "countryCode": "IT",
    "names": {
      "es": "Florencia",
      "en": "Florence",
      "fr": "Florence",
      "de": "Florenz",
      "it": "Firenze"
    }
  },
  {
    "slug": "frankfurt",
    "name": "Fráncfort del Meno",
    "countryCode": "DE",
    "names": {
      "es": "Fráncfort del Meno",
      "en": "Frankfurt",
      "fr": "Francfort-sur-le-Main",
      "de": "Frankfurt am Main",
      "it": "Francoforte sul Meno"
    }
  },
  {
    "slug": "hamburg",
    "name": "Hamburgo",
    "countryCode": "DE",
    "names": {
      "es": "Hamburgo",
      "en": "Hamburg",
      "fr": "Hambourg",
      "de": "Hamburg",
      "it": "Amburgo"
    }
  },
  {
    "slug": "leipzig",
    "name": "Leipzig",
    "countryCode": "DE",
    "names": {
      "es": "Leipzig",
      "en": "Leipzig",
      "fr": "Leipzig",
      "de": "Leipzig",
      "it": "Lipsia"
    }
  },
  {
    "slug": "lille",
    "name": "Lille",
    "countryCode": "FR",
    "names": {
      "es": "Lille",
      "en": "Lille",
      "fr": "Lille",
      "de": "Lille",
      "it": "Lille"
    }
  },
  {
    "slug": "lyon",
    "name": "Lyon",
    "countryCode": "FR",
    "names": {
      "es": "Lyon",
      "en": "Lyon",
      "fr": "Lyon",
      "de": "Lyon",
      "it": "Lyon"
    }
  },
  {
    "slug": "marseille",
    "name": "Marsella",
    "countryCode": "FR",
    "names": {
      "es": "Marsella",
      "en": "Marseille",
      "fr": "Marseille",
      "de": "Marseille",
      "it": "Marsiglia"
    }
  },
  {
    "slug": "milan",
    "name": "Milán",
    "countryCode": "IT",
    "names": {
      "es": "Milán",
      "en": "Milan",
      "fr": "Milan",
      "de": "Mailand",
      "it": "Milano"
    }
  },
  {
    "slug": "montpellier",
    "name": "Montpellier",
    "countryCode": "FR",
    "names": {
      "es": "Montpellier",
      "en": "Montpellier",
      "fr": "Montpellier",
      "de": "Montpellier",
      "it": "Montpellier"
    }
  },
  {
    "slug": "munich",
    "name": "Múnich",
    "countryCode": "DE",
    "names": {
      "es": "Múnich",
      "en": "Munich",
      "fr": "Munich",
      "de": "München",
      "it": "Monaco di Baviera"
    }
  },
  {
    "slug": "nantes",
    "name": "Nantes",
    "countryCode": "FR",
    "names": {
      "es": "Nantes",
      "en": "Nantes",
      "fr": "Nantes",
      "de": "Nantes",
      "it": "Nantes"
    }
  },
  {
    "slug": "napoli",
    "name": "Nápoles",
    "countryCode": "IT",
    "names": {
      "es": "Nápoles",
      "en": "Naples",
      "fr": "Naples",
      "de": "Neapel",
      "it": "Napoli"
    }
  },
  {
    "slug": "nice",
    "name": "Niza",
    "countryCode": "FR",
    "names": {
      "es": "Niza",
      "en": "Nice",
      "fr": "Nice",
      "de": "Nizza",
      "it": "Nizza"
    }
  },
  {
    "slug": "nuremberg",
    "name": "Núremberg",
    "countryCode": "DE",
    "names": {
      "es": "Núremberg",
      "en": "Nuremberg",
      "fr": "Nuremberg",
      "de": "Nürnberg",
      "it": "Norimberga"
    }
  },
  {
    "slug": "palermo",
    "name": "Palermo",
    "countryCode": "IT",
    "names": {
      "es": "Palermo",
      "en": "Palermo",
      "fr": "Palermo",
      "de": "Palermo",
      "it": "Palermo"
    }
  },
  {
    "slug": "paris",
    "name": "París",
    "countryCode": "FR",
    "names": {
      "es": "París",
      "en": "Paris",
      "fr": "Paris",
      "de": "Paris",
      "it": "Parigi"
    }
  },
  {
    "slug": "pisa",
    "name": "Pisa",
    "countryCode": "IT",
    "names": {
      "es": "Pisa",
      "en": "Pisa",
      "fr": "Pisa",
      "de": "Pisa",
      "it": "Pisa"
    }
  },
  {
    "slug": "roma",
    "name": "Roma",
    "countryCode": "IT",
    "names": {
      "es": "Roma",
      "en": "Rome",
      "fr": "Rome",
      "de": "Rom",
      "it": "Roma"
    }
  },
  {
    "slug": "strasbourg",
    "name": "Estrasburgo",
    "countryCode": "FR",
    "names": {
      "es": "Estrasburgo",
      "en": "Strasbourg",
      "fr": "Strasbourg",
      "de": "Straßburg",
      "it": "Strasburgo"
    }
  },
  {
    "slug": "stuttgart",
    "name": "Stuttgart",
    "countryCode": "DE",
    "names": {
      "es": "Stuttgart",
      "en": "Stuttgart",
      "fr": "Stuttgart",
      "de": "Stuttgart",
      "it": "Stoccarda"
    }
  },
  {
    "slug": "torino",
    "name": "Turín",
    "countryCode": "IT",
    "names": {
      "es": "Turín",
      "en": "Turin",
      "fr": "Turin",
      "de": "Turin",
      "it": "Torino"
    }
  },
  {
    "slug": "toulouse",
    "name": "Toulouse",
    "countryCode": "FR",
    "names": {
      "es": "Toulouse",
      "en": "Toulouse",
      "fr": "Toulouse",
      "de": "Toulouse",
      "it": "Tolosa"
    }
  },
  {
    "slug": "venezia",
    "name": "Venecia",
    "countryCode": "IT",
    "names": {
      "es": "Venecia",
      "en": "Venice",
      "fr": "Venise",
      "de": "Venedig",
      "it": "Venezia"
    }
  },
  {
    "slug": "verona",
    "name": "Verona",
    "countryCode": "IT",
    "names": {
      "es": "Verona",
      "en": "Verona",
      "fr": "Verona",
      "de": "Verona",
      "it": "Verona"
    }
  }
];

export const SEO_ROUTE_DEFINITIONS: readonly SeoRouteDefinition[] = [
  {
    "id": "5b393fef-f58b-5e42-861e-b3baafbb3a8a",
    "city": "madrid",
    "locale": "es",
    "slug": "madrid-esencial",
    "group": "madrid-general"
  },
  {
    "id": "169a5a4c-3748-51e9-8aa6-5f96df1eb8f4",
    "city": "madrid",
    "locale": "en",
    "slug": "madrid-highlights",
    "group": "madrid-general"
  },
  {
    "id": "ed34f2b3-218f-51f5-8652-274d450be418",
    "city": "madrid",
    "locale": "fr",
    "slug": "madrid-incontournables",
    "group": "madrid-general"
  },
  {
    "id": "3390a35c-794a-5d2f-839c-f458bae09e86",
    "city": "madrid",
    "locale": "de",
    "slug": "madrid-rundgang",
    "group": "madrid-general"
  },
  {
    "id": "d16e669c-b7a6-577e-8d50-5275bc4c6cbf",
    "city": "madrid",
    "locale": "it",
    "slug": "madrid-essenziale",
    "group": "madrid-general"
  },
  {
    "id": "bdfc7fda-3643-5a06-ae6a-23a09489fc1e",
    "city": "madrid",
    "locale": "es",
    "slug": "madrid-de-los-austrias",
    "group": "madrid-thematic",
    "title": "Madrid de los Austrias: una villa se convierte en corte"
  },
  {
    "id": "a06a198b-fdff-59bd-8bba-db22b36c7caa",
    "city": "alicante",
    "locale": "es",
    "slug": "alicante-esencial",
    "group": "alicante-general"
  },
  {
    "id": "8943bbd7-43e6-5c00-8128-b097c959423a",
    "city": "alicante",
    "locale": "en",
    "slug": "alicante-highlights",
    "group": "alicante-general"
  },
  {
    "id": "e70476cc-a421-557e-8ee8-90f1e1a9c15f",
    "city": "alicante",
    "locale": "fr",
    "slug": "alicante-incontournables",
    "group": "alicante-general"
  },
  {
    "id": "619ea940-e35a-5d57-8a23-a5e5e604903b",
    "city": "alicante",
    "locale": "de",
    "slug": "alicante-rundgang",
    "group": "alicante-general"
  },
  {
    "id": "0d89948e-aa7c-5305-8e40-4937cef404b7",
    "city": "alicante",
    "locale": "it",
    "slug": "alicante-essenziale",
    "group": "alicante-general"
  },
  {
    "id": "7118b026-d7ba-5f5f-b08a-f4ea5b1779c2",
    "city": "alicante",
    "locale": "es",
    "slug": "alicante-1938-1939",
    "group": "alicante-thematic",
    "title": "Alicante, 1938–1939: la ciudad y la última salida"
  },
  {
    "id": "64b9fb35-cfb5-59e1-8028-fe173a9564b2",
    "city": "barcelona",
    "locale": "es",
    "slug": "barcelona-esencial",
    "group": "barcelona-general"
  },
  {
    "id": "30bd5f58-cbaa-5be5-8a87-9901975d5d71",
    "city": "barcelona",
    "locale": "en",
    "slug": "barcelona-highlights",
    "group": "barcelona-general"
  },
  {
    "id": "f4572bd1-cd5e-5b41-814c-026b2e2ee28a",
    "city": "barcelona",
    "locale": "fr",
    "slug": "barcelona-incontournables",
    "group": "barcelona-general"
  },
  {
    "id": "6e68f80c-9874-53c8-8847-a36b8960ad7f",
    "city": "barcelona",
    "locale": "de",
    "slug": "barcelona-rundgang",
    "group": "barcelona-general"
  },
  {
    "id": "437866f4-2c83-5412-884e-3cab70a352ad",
    "city": "barcelona",
    "locale": "it",
    "slug": "barcelona-essenziale",
    "group": "barcelona-general"
  },
  {
    "id": "43a1a6af-c6a5-59f1-920c-e6ee63f97283",
    "city": "barcelona",
    "locale": "es",
    "slug": "barcelona-y-el-mar",
    "group": "barcelona-thematic",
    "title": "Barcelona y el mar: oficios, comercio y galeras"
  },
  {
    "id": "0be24ddf-eefe-5180-89b1-3cce2f95ed20",
    "city": "castellon-de-la-plana",
    "locale": "es",
    "slug": "castellon-de-la-plana-esencial",
    "group": "castellon-de-la-plana-general"
  },
  {
    "id": "7d59e8e9-853f-50fa-8efa-64fec44da86b",
    "city": "castellon-de-la-plana",
    "locale": "en",
    "slug": "castellon-de-la-plana-highlights",
    "group": "castellon-de-la-plana-general"
  },
  {
    "id": "720e4a07-a626-5f0f-85d2-ec6c5c21ce5e",
    "city": "castellon-de-la-plana",
    "locale": "fr",
    "slug": "castellon-de-la-plana-incontournables",
    "group": "castellon-de-la-plana-general"
  },
  {
    "id": "33d4eac1-30ff-5428-82b2-26672a412868",
    "city": "castellon-de-la-plana",
    "locale": "de",
    "slug": "castellon-de-la-plana-rundgang",
    "group": "castellon-de-la-plana-general"
  },
  {
    "id": "23600e30-7550-56fc-8b21-4f4e5a5b5eff",
    "city": "castellon-de-la-plana",
    "locale": "it",
    "slug": "castellon-de-la-plana-essenziale",
    "group": "castellon-de-la-plana-general"
  },
  {
    "id": "875b2849-be3b-5718-a515-5e7bfda2ebdf",
    "city": "castellon-de-la-plana",
    "locale": "es",
    "slug": "castellon-mercados-y-campanas",
    "group": "castellon-de-la-plana-thematic",
    "title": "Castellón: mercados, campanas y decisiones de la villa"
  },
  {
    "id": "06dbd9b3-85d8-5ab0-8fa7-43a5a78ec42f",
    "city": "las-palmas-de-gran-canaria",
    "locale": "es",
    "slug": "las-palmas-de-gran-canaria-esencial",
    "group": "las-palmas-de-gran-canaria-general"
  },
  {
    "id": "a1a6b765-4645-542e-8c54-80018af61898",
    "city": "las-palmas-de-gran-canaria",
    "locale": "en",
    "slug": "las-palmas-de-gran-canaria-highlights",
    "group": "las-palmas-de-gran-canaria-general"
  },
  {
    "id": "0d4c71f1-a0b2-5294-894e-1eb91b8c855f",
    "city": "las-palmas-de-gran-canaria",
    "locale": "fr",
    "slug": "las-palmas-de-gran-canaria-incontournables",
    "group": "las-palmas-de-gran-canaria-general"
  },
  {
    "id": "6aa14aee-e4dc-55e0-8111-7d05f6c27db3",
    "city": "las-palmas-de-gran-canaria",
    "locale": "de",
    "slug": "las-palmas-de-gran-canaria-rundgang",
    "group": "las-palmas-de-gran-canaria-general"
  },
  {
    "id": "bc9055c2-d5ee-545d-8d13-c22609a4e9d8",
    "city": "las-palmas-de-gran-canaria",
    "locale": "it",
    "slug": "las-palmas-de-gran-canaria-essenziale",
    "group": "las-palmas-de-gran-canaria-general"
  },
  {
    "id": "7d234182-304b-5e97-adac-2f1e8e29d557",
    "city": "las-palmas-de-gran-canaria",
    "locale": "es",
    "slug": "las-palmas-bajo-ataque",
    "group": "las-palmas-de-gran-canaria-thematic",
    "title": "Las Palmas bajo ataque: murallas, castillos y reconstrucción"
  },
  {
    "id": "ee796d29-c061-50b5-8749-e25441a8a845",
    "city": "murcia",
    "locale": "es",
    "slug": "murcia-esencial",
    "group": "murcia-general"
  },
  {
    "id": "8f3634fb-ccef-5feb-8752-d023e8fc4655",
    "city": "murcia",
    "locale": "en",
    "slug": "murcia-highlights",
    "group": "murcia-general"
  },
  {
    "id": "676311ae-9d2e-5968-88f8-1a713bd3fa15",
    "city": "murcia",
    "locale": "fr",
    "slug": "murcia-incontournables",
    "group": "murcia-general"
  },
  {
    "id": "12e3c471-3796-5963-8302-bce0ee62f890",
    "city": "murcia",
    "locale": "de",
    "slug": "murcia-rundgang",
    "group": "murcia-general"
  },
  {
    "id": "2137fa1c-8bd0-5f37-823c-19bb56db629d",
    "city": "murcia",
    "locale": "it",
    "slug": "murcia-essenziale",
    "group": "murcia-general"
  },
  {
    "id": "1a0982ad-a9e4-5c8e-a59e-4669c50a8f27",
    "city": "murcia",
    "locale": "es",
    "slug": "murcia-ciudad-reconstruida",
    "group": "murcia-thematic",
    "title": "Murcia: la ciudad que hubo que rehacer"
  },
  {
    "id": "307add2e-dc2a-53cf-8573-2f66a8e56d6f",
    "city": "malaga",
    "locale": "es",
    "slug": "malaga-esencial",
    "group": "malaga-general"
  },
  {
    "id": "d51cf985-d1ff-5435-8119-376129a3d2a0",
    "city": "malaga",
    "locale": "en",
    "slug": "malaga-highlights",
    "group": "malaga-general"
  },
  {
    "id": "cf1c30d5-cd98-5f8d-8a40-c51eda46fc8e",
    "city": "malaga",
    "locale": "fr",
    "slug": "malaga-incontournables",
    "group": "malaga-general"
  },
  {
    "id": "b26dc06a-ba34-55a1-8232-c92c2042270d",
    "city": "malaga",
    "locale": "de",
    "slug": "malaga-rundgang",
    "group": "malaga-general"
  },
  {
    "id": "842b7e78-7f49-592a-8f46-6c71a4bbaa1e",
    "city": "malaga",
    "locale": "it",
    "slug": "malaga-essenziale",
    "group": "malaga-general"
  },
  {
    "id": "5e6f2dde-cc9d-5828-a61d-4e86cbbeb40a",
    "city": "malaga",
    "locale": "es",
    "slug": "malaga-ciudad-escondida",
    "group": "malaga-thematic",
    "title": "Málaga: recuperar una ciudad escondida"
  },
  {
    "id": "e63f0172-cf23-548a-89cf-7545d2ce6333",
    "city": "palma",
    "locale": "es",
    "slug": "palma-esencial",
    "group": "palma-general"
  },
  {
    "id": "d082c4b1-6a98-51cb-8bc2-ef130e170bd6",
    "city": "palma",
    "locale": "en",
    "slug": "palma-highlights",
    "group": "palma-general"
  },
  {
    "id": "9c774a8b-dc21-5e46-83bc-1c3a354b2103",
    "city": "palma",
    "locale": "fr",
    "slug": "palma-incontournables",
    "group": "palma-general"
  },
  {
    "id": "4581a3f1-18ce-5569-8b59-4f2674800952",
    "city": "palma",
    "locale": "de",
    "slug": "palma-rundgang",
    "group": "palma-general"
  },
  {
    "id": "595be93d-5f3a-55c2-8e42-81bfd539fba6",
    "city": "palma",
    "locale": "it",
    "slug": "palma-essenziale",
    "group": "palma-general"
  },
  {
    "id": "80d2b65f-f6e1-52b8-8fa0-0c245bb931e2",
    "city": "palma",
    "locale": "es",
    "slug": "palma-reyes-y-mercaderes",
    "group": "palma-thematic",
    "title": "Palma de reyes y mercaderes"
  },
  {
    "id": "f19adc02-7d66-57dd-8c73-20f82a6ead79",
    "city": "sevilla",
    "locale": "es",
    "slug": "sevilla-esencial",
    "group": "sevilla-general"
  },
  {
    "id": "438ee8ab-1e07-5f1f-8989-1e162986dd09",
    "city": "sevilla",
    "locale": "en",
    "slug": "sevilla-highlights",
    "group": "sevilla-general"
  },
  {
    "id": "9e53b38f-6ce6-500a-80f1-1168bb04f5b5",
    "city": "sevilla",
    "locale": "fr",
    "slug": "sevilla-incontournables",
    "group": "sevilla-general"
  },
  {
    "id": "0b0f1ad7-f817-581b-80eb-daba8a95bedf",
    "city": "sevilla",
    "locale": "de",
    "slug": "sevilla-rundgang",
    "group": "sevilla-general"
  },
  {
    "id": "51572a89-d913-5daa-8b99-af2bb7eebfd7",
    "city": "sevilla",
    "locale": "it",
    "slug": "sevilla-essenziale",
    "group": "sevilla-general"
  },
  {
    "id": "3012a558-4840-5eaf-a0ba-bbe9823b5693",
    "city": "sevilla",
    "locale": "es",
    "slug": "sevilla-puerto-de-indias",
    "group": "sevilla-thematic",
    "title": "Sevilla, puerto de Indias: aprender a navegar y organizar el comercio"
  },
  {
    "id": "63271cc7-7cff-5a72-839a-ddc06900ff4e",
    "city": "valencia",
    "locale": "es",
    "slug": "valencia-esencial",
    "group": "valencia-general"
  },
  {
    "id": "4c884b86-5939-5730-8eee-b1ba136eba76",
    "city": "valencia",
    "locale": "en",
    "slug": "valencia-highlights",
    "group": "valencia-general"
  },
  {
    "id": "de8435e5-33c4-518f-8026-1669cb25b5c5",
    "city": "valencia",
    "locale": "fr",
    "slug": "valencia-incontournables",
    "group": "valencia-general"
  },
  {
    "id": "2fffab81-b408-5460-84fb-84dfac77740c",
    "city": "valencia",
    "locale": "de",
    "slug": "valencia-rundgang",
    "group": "valencia-general"
  },
  {
    "id": "31539637-fd43-54d1-881c-55e204d938fd",
    "city": "valencia",
    "locale": "it",
    "slug": "valencia-essenziale",
    "group": "valencia-general"
  },
  {
    "id": "3ecde97d-cafd-5f66-bcd8-c479a5de8733",
    "city": "valencia",
    "locale": "es",
    "slug": "valencia-edificios-y-oficios",
    "group": "valencia-thematic",
    "title": "Valencia: edificios que cambiaron de oficio"
  },
  {
    "id": "e87c1eac-b45a-5068-8c3a-e974746ab7d4",
    "city": "zaragoza",
    "locale": "es",
    "slug": "zaragoza-esencial",
    "group": "zaragoza-general"
  },
  {
    "id": "553bfde7-a7d3-55f1-8392-f6d658a0e78f",
    "city": "zaragoza",
    "locale": "en",
    "slug": "zaragoza-highlights",
    "group": "zaragoza-general"
  },
  {
    "id": "124f5c07-8508-53e8-8788-8109ba174cb9",
    "city": "zaragoza",
    "locale": "fr",
    "slug": "zaragoza-incontournables",
    "group": "zaragoza-general"
  },
  {
    "id": "246846f9-2783-55e7-8169-8f8d004dbb89",
    "city": "zaragoza",
    "locale": "de",
    "slug": "zaragoza-rundgang",
    "group": "zaragoza-general"
  },
  {
    "id": "6f8433e3-d912-50a0-83db-f924baa562fa",
    "city": "zaragoza",
    "locale": "it",
    "slug": "zaragoza-essenziale",
    "group": "zaragoza-general"
  },
  {
    "id": "bd9d17b5-9a58-5de4-8586-5b3d655d65da",
    "city": "zaragoza",
    "locale": "es",
    "slug": "caesaraugusta-ciudad-romana",
    "group": "zaragoza-thematic",
    "title": "Caesaraugusta: vivir en una ciudad romana"
  },
  {
    "id": "52da7110-088c-5025-afa7-93652f6adcc4",
    "city": "berlin",
    "locale": "es",
    "slug": "berlin-recorrido-historico",
    "group": "berlin-history",
    "title": "Berlín: recorrido histórico general"
  },
  {
    "id": "b5a0f0f7-e9ab-5f55-a430-5e1776858e3a",
    "city": "berlin",
    "locale": "en",
    "slug": "berlin-historical-walk",
    "group": "berlin-history",
    "title": "Berlin: historical walking tour"
  },
  {
    "id": "af9ff696-14ac-505b-ab13-24137e13755e",
    "city": "berlin",
    "locale": "fr",
    "slug": "berlin-parcours-historique",
    "group": "berlin-history",
    "title": "Berlin : parcours historique"
  },
  {
    "id": "5f60c76a-ff54-5c09-a801-7bfed58b4ce7",
    "city": "berlin",
    "locale": "de",
    "slug": "berlin-historischer-rundgang",
    "group": "berlin-history",
    "title": "Berlin: historischer Rundgang"
  },
  {
    "id": "a8bb21f9-8122-5682-a00a-b15541c67055",
    "city": "berlin",
    "locale": "it",
    "slug": "berlin-percorso-storico",
    "group": "berlin-history",
    "title": "Berlino: percorso storico"
  },
  {
    "id": "8c9cf057-c26a-5652-af3a-dda49196341e",
    "city": "bologna",
    "locale": "es",
    "slug": "bologna-recorrido-historico",
    "group": "bologna-history",
    "title": "Bolonia: recorrido histórico general"
  },
  {
    "id": "88e625e7-c282-5297-a49a-7476c64c7da7",
    "city": "bologna",
    "locale": "en",
    "slug": "bologna-historical-walk",
    "group": "bologna-history",
    "title": "Bologna: historical walking tour"
  },
  {
    "id": "cc3d2f72-1934-5a94-a037-a83266c17cb2",
    "city": "bologna",
    "locale": "fr",
    "slug": "bologna-parcours-historique",
    "group": "bologna-history",
    "title": "Bologne : parcours historique"
  },
  {
    "id": "46561d1c-e4a6-583a-ade8-2998e46ab896",
    "city": "bologna",
    "locale": "de",
    "slug": "bologna-historischer-rundgang",
    "group": "bologna-history",
    "title": "Bologna: historischer Rundgang"
  },
  {
    "id": "faec3897-dc17-5ae6-a0e8-c5c74fb4a873",
    "city": "bologna",
    "locale": "it",
    "slug": "bologna-percorso-storico",
    "group": "bologna-history",
    "title": "Bologna: percorso storico"
  },
  {
    "id": "f241f09a-f1b1-56cd-a9cf-60c7047f8940",
    "city": "bordeaux",
    "locale": "es",
    "slug": "bordeaux-recorrido-historico",
    "group": "bordeaux-history",
    "title": "Burdeos: recorrido histórico general"
  },
  {
    "id": "0c6b8702-7a1f-5a88-aa87-5c70db35053f",
    "city": "bordeaux",
    "locale": "en",
    "slug": "bordeaux-historical-walk",
    "group": "bordeaux-history",
    "title": "Bordeaux: historical walking tour"
  },
  {
    "id": "f75ca0c5-42e0-5d77-a89a-01ee74c09ed5",
    "city": "bordeaux",
    "locale": "fr",
    "slug": "bordeaux-parcours-historique",
    "group": "bordeaux-history",
    "title": "Bordeaux : parcours historique"
  },
  {
    "id": "9960884d-d1eb-5465-a010-e28a53343a1c",
    "city": "bordeaux",
    "locale": "de",
    "slug": "bordeaux-historischer-rundgang",
    "group": "bordeaux-history",
    "title": "Bordeaux: historischer Rundgang"
  },
  {
    "id": "e1a74f1c-8344-51fd-a1df-7cbcca1e30d5",
    "city": "bordeaux",
    "locale": "it",
    "slug": "bordeaux-percorso-storico",
    "group": "bordeaux-history",
    "title": "Bordeaux: percorso storico"
  },
  {
    "id": "813c161f-e8c2-5ab9-afd8-540c7365f986",
    "city": "cologne",
    "locale": "es",
    "slug": "cologne-recorrido-historico",
    "group": "cologne-history",
    "title": "Colonia: recorrido histórico general"
  },
  {
    "id": "7fd8f061-489f-59b0-a665-d32862e07880",
    "city": "cologne",
    "locale": "en",
    "slug": "cologne-historical-walk",
    "group": "cologne-history",
    "title": "Cologne: historical walking tour"
  },
  {
    "id": "edcab99d-d7cd-56af-af80-9b89807453e6",
    "city": "cologne",
    "locale": "fr",
    "slug": "cologne-parcours-historique",
    "group": "cologne-history",
    "title": "Cologne : parcours historique"
  },
  {
    "id": "87bc0ff9-1b0e-5636-a00a-0ad7b221c9f8",
    "city": "cologne",
    "locale": "de",
    "slug": "cologne-historischer-rundgang",
    "group": "cologne-history",
    "title": "Köln: historischer Rundgang"
  },
  {
    "id": "64e6a5a0-a8e0-550b-a78c-58ce844713b7",
    "city": "cologne",
    "locale": "it",
    "slug": "cologne-percorso-storico",
    "group": "cologne-history",
    "title": "Colonia: percorso storico"
  },
  {
    "id": "edcf1e39-0609-5c6c-a51e-d9f33b9859f6",
    "city": "dresden",
    "locale": "es",
    "slug": "dresden-recorrido-historico",
    "group": "dresden-history",
    "title": "Dresde: recorrido histórico general"
  },
  {
    "id": "e4a15fe5-b931-5063-a011-d025eaf115d3",
    "city": "dresden",
    "locale": "en",
    "slug": "dresden-historical-walk",
    "group": "dresden-history",
    "title": "Dresden: historical walking tour"
  },
  {
    "id": "8d640beb-225f-523d-a80d-9a388193826f",
    "city": "dresden",
    "locale": "fr",
    "slug": "dresden-parcours-historique",
    "group": "dresden-history",
    "title": "Dresde : parcours historique"
  },
  {
    "id": "0c1b7296-b3c9-59ed-a03a-e42a9ef56c31",
    "city": "dresden",
    "locale": "de",
    "slug": "dresden-historischer-rundgang",
    "group": "dresden-history",
    "title": "Dresden: historischer Rundgang"
  },
  {
    "id": "f700bc16-d658-58d8-a333-3aa0816c70df",
    "city": "dresden",
    "locale": "it",
    "slug": "dresden-percorso-storico",
    "group": "dresden-history",
    "title": "Dresda: percorso storico"
  },
  {
    "id": "eb53108a-9f8c-5504-a990-e5e00a75ba5e",
    "city": "dusseldorf",
    "locale": "es",
    "slug": "dusseldorf-recorrido-historico",
    "group": "dusseldorf-history",
    "title": "Düsseldorf: recorrido histórico general"
  },
  {
    "id": "cf822fb5-1cc8-59fa-a583-99b9f824c3f0",
    "city": "dusseldorf",
    "locale": "en",
    "slug": "dusseldorf-historical-walk",
    "group": "dusseldorf-history",
    "title": "Düsseldorf: historical walking tour"
  },
  {
    "id": "f689597f-c68a-594a-aadc-4c9c98b5b4f5",
    "city": "dusseldorf",
    "locale": "fr",
    "slug": "dusseldorf-parcours-historique",
    "group": "dusseldorf-history",
    "title": "Düsseldorf : parcours historique"
  },
  {
    "id": "f78649a9-ddd8-5ee0-a74e-267a5cf94321",
    "city": "dusseldorf",
    "locale": "de",
    "slug": "dusseldorf-historischer-rundgang",
    "group": "dusseldorf-history",
    "title": "Düsseldorf: historischer Rundgang"
  },
  {
    "id": "b5402de9-70a8-5ccc-a52f-67a40b27c1b5",
    "city": "dusseldorf",
    "locale": "it",
    "slug": "dusseldorf-percorso-storico",
    "group": "dusseldorf-history",
    "title": "Düsseldorf: percorso storico"
  },
  {
    "id": "3550d9b7-5315-585b-aa09-7183175cd0e3",
    "city": "firenze",
    "locale": "es",
    "slug": "firenze-recorrido-historico",
    "group": "firenze-history",
    "title": "Florencia: recorrido histórico general"
  },
  {
    "id": "4f6b93b0-b01d-517d-a6bb-14345faa8203",
    "city": "firenze",
    "locale": "en",
    "slug": "firenze-historical-walk",
    "group": "firenze-history",
    "title": "Florence: historical walking tour"
  },
  {
    "id": "430654f1-68c3-524b-a048-e9bd822b1047",
    "city": "firenze",
    "locale": "fr",
    "slug": "firenze-parcours-historique",
    "group": "firenze-history",
    "title": "Florence : parcours historique"
  },
  {
    "id": "2673cf9c-d101-5d58-a8fb-5559f9acfe15",
    "city": "firenze",
    "locale": "de",
    "slug": "firenze-historischer-rundgang",
    "group": "firenze-history",
    "title": "Florenz: historischer Rundgang"
  },
  {
    "id": "30f5a29f-8d6e-5302-a5f7-a715ce13f6aa",
    "city": "firenze",
    "locale": "it",
    "slug": "firenze-percorso-storico",
    "group": "firenze-history",
    "title": "Firenze: percorso storico"
  },
  {
    "id": "56fa5a12-4093-546b-a835-bb5444f129bc",
    "city": "frankfurt",
    "locale": "es",
    "slug": "frankfurt-recorrido-historico",
    "group": "frankfurt-history",
    "title": "Fráncfort del Meno: recorrido histórico general"
  },
  {
    "id": "04d2edf5-dcac-5cca-a238-a492b4f0b25a",
    "city": "frankfurt",
    "locale": "en",
    "slug": "frankfurt-historical-walk",
    "group": "frankfurt-history",
    "title": "Frankfurt: historical walking tour"
  },
  {
    "id": "e64502da-1eaf-57d7-a3ed-8c709a84e1ac",
    "city": "frankfurt",
    "locale": "fr",
    "slug": "frankfurt-parcours-historique",
    "group": "frankfurt-history",
    "title": "Francfort-sur-le-Main : parcours historique"
  },
  {
    "id": "200e0a54-361c-5f7a-a26b-37ecee836896",
    "city": "frankfurt",
    "locale": "de",
    "slug": "frankfurt-historischer-rundgang",
    "group": "frankfurt-history",
    "title": "Frankfurt am Main: historischer Rundgang"
  },
  {
    "id": "51729244-a728-5745-a8e0-7188bab7a418",
    "city": "frankfurt",
    "locale": "it",
    "slug": "frankfurt-percorso-storico",
    "group": "frankfurt-history",
    "title": "Francoforte sul Meno: percorso storico"
  },
  {
    "id": "962c3c8b-5cd4-5fc4-ae27-17be9ea8ad5a",
    "city": "hamburg",
    "locale": "es",
    "slug": "hamburg-recorrido-historico",
    "group": "hamburg-history",
    "title": "Hamburgo: recorrido histórico general"
  },
  {
    "id": "4d204003-09cc-5b09-aff3-8e7ef3274f65",
    "city": "hamburg",
    "locale": "en",
    "slug": "hamburg-historical-walk",
    "group": "hamburg-history",
    "title": "Hamburg: historical walking tour"
  },
  {
    "id": "0dcc7342-81e3-51f7-a1f9-a410f09d1336",
    "city": "hamburg",
    "locale": "fr",
    "slug": "hamburg-parcours-historique",
    "group": "hamburg-history",
    "title": "Hambourg : parcours historique"
  },
  {
    "id": "c497b537-9f67-5667-a4da-1b9aaac36e6a",
    "city": "hamburg",
    "locale": "de",
    "slug": "hamburg-historischer-rundgang",
    "group": "hamburg-history",
    "title": "Hamburg: historischer Rundgang"
  },
  {
    "id": "6b90eb81-2597-5264-a271-62f75fde05e7",
    "city": "hamburg",
    "locale": "it",
    "slug": "hamburg-percorso-storico",
    "group": "hamburg-history",
    "title": "Amburgo: percorso storico"
  },
  {
    "id": "c7e537c5-544c-5f0f-a20e-c56324ee9645",
    "city": "leipzig",
    "locale": "es",
    "slug": "leipzig-recorrido-historico",
    "group": "leipzig-history",
    "title": "Leipzig: recorrido histórico general"
  },
  {
    "id": "9b9c0e19-c133-5891-a455-80e3c477e5c8",
    "city": "leipzig",
    "locale": "en",
    "slug": "leipzig-historical-walk",
    "group": "leipzig-history",
    "title": "Leipzig: historical walking tour"
  },
  {
    "id": "ce4c5d6d-744f-5cf7-ab4f-4aee582cafe5",
    "city": "leipzig",
    "locale": "fr",
    "slug": "leipzig-parcours-historique",
    "group": "leipzig-history",
    "title": "Leipzig : parcours historique"
  },
  {
    "id": "0674acd3-be2e-5294-aa23-ed56f04f4f8b",
    "city": "leipzig",
    "locale": "de",
    "slug": "leipzig-historischer-rundgang",
    "group": "leipzig-history",
    "title": "Leipzig: historischer Rundgang"
  },
  {
    "id": "55a3cf64-a38c-5793-a6b5-a3f0c277635e",
    "city": "leipzig",
    "locale": "it",
    "slug": "leipzig-percorso-storico",
    "group": "leipzig-history",
    "title": "Lipsia: percorso storico"
  },
  {
    "id": "2e3c323e-8b38-51e9-a217-73dcec2d122d",
    "city": "lille",
    "locale": "es",
    "slug": "lille-recorrido-historico",
    "group": "lille-history",
    "title": "Lille: recorrido histórico general"
  },
  {
    "id": "f83e020a-3a23-5f4f-a89d-206807594d62",
    "city": "lille",
    "locale": "en",
    "slug": "lille-historical-walk",
    "group": "lille-history",
    "title": "Lille: historical walking tour"
  },
  {
    "id": "7a5eb5db-3b14-5250-a5a9-7866dce3d916",
    "city": "lille",
    "locale": "fr",
    "slug": "lille-parcours-historique",
    "group": "lille-history",
    "title": "Lille : parcours historique"
  },
  {
    "id": "0617a5c2-4629-5ddd-a172-5bb029f39a1c",
    "city": "lille",
    "locale": "de",
    "slug": "lille-historischer-rundgang",
    "group": "lille-history",
    "title": "Lille: historischer Rundgang"
  },
  {
    "id": "08537d5a-274c-5f1b-a190-e576f2cfd88d",
    "city": "lille",
    "locale": "it",
    "slug": "lille-percorso-storico",
    "group": "lille-history",
    "title": "Lille: percorso storico"
  },
  {
    "id": "ef0ca074-e262-53a5-ab43-c8261b1fd73b",
    "city": "lyon",
    "locale": "es",
    "slug": "lyon-recorrido-historico",
    "group": "lyon-history",
    "title": "Lyon: recorrido histórico general"
  },
  {
    "id": "54477fd5-57fe-5eb9-a1be-af5802c0042a",
    "city": "lyon",
    "locale": "en",
    "slug": "lyon-historical-walk",
    "group": "lyon-history",
    "title": "Lyon: historical walking tour"
  },
  {
    "id": "99d71293-f37d-5549-a7d2-ac45f1875175",
    "city": "lyon",
    "locale": "fr",
    "slug": "lyon-parcours-historique",
    "group": "lyon-history",
    "title": "Lyon : parcours historique"
  },
  {
    "id": "3e64a719-e078-5850-a6fd-0580380efd18",
    "city": "lyon",
    "locale": "de",
    "slug": "lyon-historischer-rundgang",
    "group": "lyon-history",
    "title": "Lyon: historischer Rundgang"
  },
  {
    "id": "93dd00dc-e570-508a-acd1-3b234bfa67c8",
    "city": "lyon",
    "locale": "it",
    "slug": "lyon-percorso-storico",
    "group": "lyon-history",
    "title": "Lyon: percorso storico"
  },
  {
    "id": "2291520f-ad6c-59c5-a562-7842307e1e20",
    "city": "marseille",
    "locale": "es",
    "slug": "marseille-recorrido-historico",
    "group": "marseille-history",
    "title": "Marsella: recorrido histórico general"
  },
  {
    "id": "a07a44eb-908f-5449-ad37-4cb4bd08faa8",
    "city": "marseille",
    "locale": "en",
    "slug": "marseille-historical-walk",
    "group": "marseille-history",
    "title": "Marseille: historical walking tour"
  },
  {
    "id": "1953e2cf-426b-5301-aa4c-2ac6f866a630",
    "city": "marseille",
    "locale": "fr",
    "slug": "marseille-parcours-historique",
    "group": "marseille-history",
    "title": "Marseille : parcours historique"
  },
  {
    "id": "a17c3ce5-ca23-583f-a88b-64bba0b0a280",
    "city": "marseille",
    "locale": "de",
    "slug": "marseille-historischer-rundgang",
    "group": "marseille-history",
    "title": "Marseille: historischer Rundgang"
  },
  {
    "id": "81033e84-0cf2-59e9-aa5b-ff041b41957a",
    "city": "marseille",
    "locale": "it",
    "slug": "marseille-percorso-storico",
    "group": "marseille-history",
    "title": "Marsiglia: percorso storico"
  },
  {
    "id": "6addf241-4110-58da-aa4c-4fbae4d803ce",
    "city": "milan",
    "locale": "es",
    "slug": "milan-recorrido-historico",
    "group": "milan-history",
    "title": "Milán: recorrido histórico general"
  },
  {
    "id": "fb85e86f-48f6-5325-a2da-74e5680b8be8",
    "city": "milan",
    "locale": "en",
    "slug": "milan-historical-walk",
    "group": "milan-history",
    "title": "Milan: historical walking tour"
  },
  {
    "id": "ecefdb0f-9cdf-5dad-a4cc-7f5b5878ccdf",
    "city": "milan",
    "locale": "fr",
    "slug": "milan-parcours-historique",
    "group": "milan-history",
    "title": "Milan : parcours historique"
  },
  {
    "id": "b2fef4d7-7b7a-5805-a4ac-872e05375b64",
    "city": "milan",
    "locale": "de",
    "slug": "milan-historischer-rundgang",
    "group": "milan-history",
    "title": "Mailand: historischer Rundgang"
  },
  {
    "id": "6736b4a3-6b31-5ba6-a2ef-1f98a57bf0e7",
    "city": "milan",
    "locale": "it",
    "slug": "milan-percorso-storico",
    "group": "milan-history",
    "title": "Milano: percorso storico"
  },
  {
    "id": "023fc79c-4835-57a2-a918-7228e19609e3",
    "city": "montpellier",
    "locale": "es",
    "slug": "montpellier-recorrido-historico",
    "group": "montpellier-history",
    "title": "Montpellier: recorrido histórico general"
  },
  {
    "id": "f9a42ac3-e1c8-5029-a40e-59c3229cf6a1",
    "city": "montpellier",
    "locale": "en",
    "slug": "montpellier-historical-walk",
    "group": "montpellier-history",
    "title": "Montpellier: historical walking tour"
  },
  {
    "id": "55b0e9fb-5711-5513-a5da-eb5ecf62c45e",
    "city": "montpellier",
    "locale": "fr",
    "slug": "montpellier-parcours-historique",
    "group": "montpellier-history",
    "title": "Montpellier : parcours historique"
  },
  {
    "id": "ecdf2fbb-bf58-5904-a52c-efdf6c1f06db",
    "city": "montpellier",
    "locale": "de",
    "slug": "montpellier-historischer-rundgang",
    "group": "montpellier-history",
    "title": "Montpellier: historischer Rundgang"
  },
  {
    "id": "c868a35b-2511-5241-a7ea-c00a86cc8d1e",
    "city": "montpellier",
    "locale": "it",
    "slug": "montpellier-percorso-storico",
    "group": "montpellier-history",
    "title": "Montpellier: percorso storico"
  },
  {
    "id": "27dd3215-ee13-5c6c-ac83-f5d0b86fff5e",
    "city": "munich",
    "locale": "es",
    "slug": "munich-recorrido-historico",
    "group": "munich-history",
    "title": "Múnich: recorrido histórico general"
  },
  {
    "id": "0a41b67f-db1d-52a2-a505-93a51ac010df",
    "city": "munich",
    "locale": "en",
    "slug": "munich-historical-walk",
    "group": "munich-history",
    "title": "Munich: historical walking tour"
  },
  {
    "id": "ad979e74-bb09-5980-a2c3-7fde81a6ebd8",
    "city": "munich",
    "locale": "fr",
    "slug": "munich-parcours-historique",
    "group": "munich-history",
    "title": "Munich : parcours historique"
  },
  {
    "id": "66ca2a62-9fd9-5792-abe2-e0112eadefcb",
    "city": "munich",
    "locale": "de",
    "slug": "munich-historischer-rundgang",
    "group": "munich-history",
    "title": "München: historischer Rundgang"
  },
  {
    "id": "96813f64-2d79-591a-a2a8-393ec34707c8",
    "city": "munich",
    "locale": "it",
    "slug": "munich-percorso-storico",
    "group": "munich-history",
    "title": "Monaco di Baviera: percorso storico"
  },
  {
    "id": "9ae40627-c686-5f86-abf8-31529e2a3421",
    "city": "nantes",
    "locale": "es",
    "slug": "nantes-recorrido-historico",
    "group": "nantes-history",
    "title": "Nantes: recorrido histórico general"
  },
  {
    "id": "965e96b5-910c-5159-a445-ea3032c7706a",
    "city": "nantes",
    "locale": "en",
    "slug": "nantes-historical-walk",
    "group": "nantes-history",
    "title": "Nantes: historical walking tour"
  },
  {
    "id": "460af9b3-4fb5-5930-a67a-54fe4770ebea",
    "city": "nantes",
    "locale": "fr",
    "slug": "nantes-parcours-historique",
    "group": "nantes-history",
    "title": "Nantes : parcours historique"
  },
  {
    "id": "6c54b69b-8f3d-5725-a222-a6468467acd7",
    "city": "nantes",
    "locale": "de",
    "slug": "nantes-historischer-rundgang",
    "group": "nantes-history",
    "title": "Nantes: historischer Rundgang"
  },
  {
    "id": "33cf389b-1446-50f7-a63e-0dc579b10416",
    "city": "nantes",
    "locale": "it",
    "slug": "nantes-percorso-storico",
    "group": "nantes-history",
    "title": "Nantes: percorso storico"
  },
  {
    "id": "9a5c498c-daf9-5c0e-a133-c265116f860c",
    "city": "napoli",
    "locale": "es",
    "slug": "napoli-recorrido-historico",
    "group": "napoli-history",
    "title": "Nápoles: recorrido histórico general"
  },
  {
    "id": "22a8887e-af81-5d49-aef3-2a5ccf9e97f3",
    "city": "napoli",
    "locale": "en",
    "slug": "napoli-historical-walk",
    "group": "napoli-history",
    "title": "Naples: historical walking tour"
  },
  {
    "id": "7a58e910-7269-59d6-a9a7-0f563f91fb5a",
    "city": "napoli",
    "locale": "fr",
    "slug": "napoli-parcours-historique",
    "group": "napoli-history",
    "title": "Naples : parcours historique"
  },
  {
    "id": "a0186d02-8363-5464-ae5f-4317c37e0ac5",
    "city": "napoli",
    "locale": "de",
    "slug": "napoli-historischer-rundgang",
    "group": "napoli-history",
    "title": "Neapel: historischer Rundgang"
  },
  {
    "id": "dd4f2c22-4e5c-5692-abdf-19a59faf8488",
    "city": "napoli",
    "locale": "it",
    "slug": "napoli-percorso-storico",
    "group": "napoli-history",
    "title": "Napoli: percorso storico"
  },
  {
    "id": "b975f087-81d5-59f3-a613-21bf670e9594",
    "city": "nice",
    "locale": "es",
    "slug": "nice-recorrido-historico",
    "group": "nice-history",
    "title": "Niza: recorrido histórico general"
  },
  {
    "id": "52c8782c-12bc-55c0-a9b6-8c4e6e04e3c2",
    "city": "nice",
    "locale": "en",
    "slug": "nice-historical-walk",
    "group": "nice-history",
    "title": "Nice: historical walking tour"
  },
  {
    "id": "5a19cdb6-dffe-5dd9-ac7a-696499e422a3",
    "city": "nice",
    "locale": "fr",
    "slug": "nice-parcours-historique",
    "group": "nice-history",
    "title": "Nice : parcours historique"
  },
  {
    "id": "6e85f81c-75a5-515f-ad0f-48cc877d482e",
    "city": "nice",
    "locale": "de",
    "slug": "nice-historischer-rundgang",
    "group": "nice-history",
    "title": "Nizza: historischer Rundgang"
  },
  {
    "id": "27a5917f-66d8-562c-a7f3-860a1256a949",
    "city": "nice",
    "locale": "it",
    "slug": "nice-percorso-storico",
    "group": "nice-history",
    "title": "Nizza: percorso storico"
  },
  {
    "id": "40d0877d-9a97-5b5a-af03-297ceda74582",
    "city": "nuremberg",
    "locale": "es",
    "slug": "nuremberg-recorrido-historico",
    "group": "nuremberg-history",
    "title": "Núremberg: recorrido histórico general"
  },
  {
    "id": "21b2fa84-3c85-580c-ad56-d0ed1ed7fc95",
    "city": "nuremberg",
    "locale": "en",
    "slug": "nuremberg-historical-walk",
    "group": "nuremberg-history",
    "title": "Nuremberg: historical walking tour"
  },
  {
    "id": "00f10103-5e89-5747-a364-8849901b04a6",
    "city": "nuremberg",
    "locale": "fr",
    "slug": "nuremberg-parcours-historique",
    "group": "nuremberg-history",
    "title": "Nuremberg : parcours historique"
  },
  {
    "id": "408511b9-c904-5beb-a0e7-0a35a3261bee",
    "city": "nuremberg",
    "locale": "de",
    "slug": "nuremberg-historischer-rundgang",
    "group": "nuremberg-history",
    "title": "Nürnberg: historischer Rundgang"
  },
  {
    "id": "62fc5cdc-f292-5396-a1e2-5371721ac09d",
    "city": "nuremberg",
    "locale": "it",
    "slug": "nuremberg-percorso-storico",
    "group": "nuremberg-history",
    "title": "Norimberga: percorso storico"
  },
  {
    "id": "2f12dd76-2b75-5b93-ae6f-8f91ba595164",
    "city": "palermo",
    "locale": "es",
    "slug": "palermo-recorrido-historico",
    "group": "palermo-history",
    "title": "Palermo: recorrido histórico general"
  },
  {
    "id": "1e75547b-a209-5c06-a6e3-9d6e04848ac1",
    "city": "palermo",
    "locale": "en",
    "slug": "palermo-historical-walk",
    "group": "palermo-history",
    "title": "Palermo: historical walking tour"
  },
  {
    "id": "ada6c4aa-8939-5e4a-af38-ba6d108c780a",
    "city": "palermo",
    "locale": "fr",
    "slug": "palermo-parcours-historique",
    "group": "palermo-history",
    "title": "Palermo : parcours historique"
  },
  {
    "id": "5e003d5b-5e26-52ed-a06a-c31f7b54f66a",
    "city": "palermo",
    "locale": "de",
    "slug": "palermo-historischer-rundgang",
    "group": "palermo-history",
    "title": "Palermo: historischer Rundgang"
  },
  {
    "id": "68a9b91a-b4e6-5241-ad14-59ca518cdab2",
    "city": "palermo",
    "locale": "it",
    "slug": "palermo-percorso-storico",
    "group": "palermo-history",
    "title": "Palermo: percorso storico"
  },
  {
    "id": "e89e1dea-3c0f-5a71-a22f-1d9c48793b84",
    "city": "paris",
    "locale": "es",
    "slug": "paris-recorrido-historico",
    "group": "paris-history",
    "title": "París: recorrido histórico general"
  },
  {
    "id": "ae5f1a21-71d9-55f8-a966-571f9a3dff5e",
    "city": "paris",
    "locale": "en",
    "slug": "paris-historical-walk",
    "group": "paris-history",
    "title": "Paris: historical walking tour"
  },
  {
    "id": "7934ae09-79aa-5ffd-a43d-b0fe2ef89da9",
    "city": "paris",
    "locale": "fr",
    "slug": "paris-parcours-historique",
    "group": "paris-history",
    "title": "Paris : parcours historique"
  },
  {
    "id": "01cd0c29-4683-5ae8-a1ec-cd651049b531",
    "city": "paris",
    "locale": "de",
    "slug": "paris-historischer-rundgang",
    "group": "paris-history",
    "title": "Paris: historischer Rundgang"
  },
  {
    "id": "fd671167-cd53-57b9-aac5-2bc794db356e",
    "city": "paris",
    "locale": "it",
    "slug": "paris-percorso-storico",
    "group": "paris-history",
    "title": "Parigi: percorso storico"
  },
  {
    "id": "f25922ad-ffc4-5df8-a27a-9b4c07270c50",
    "city": "paris",
    "locale": "es",
    "slug": "paris-iconos-torre-eiffel",
    "group": "paris-iconos",
    "title": "París imprescindible: del Arco del Triunfo a la Torre Eiffel"
  },
  {
    "id": "23623102-d07c-5e02-a8e2-b842f5cc62f4",
    "city": "paris",
    "locale": "en",
    "slug": "paris-landmarks-eiffel-tower",
    "group": "paris-iconos",
    "title": "Essential Paris: from the Arc de Triomphe to the Eiffel Tower"
  },
  {
    "id": "b8a06c15-2b56-5092-a31b-1d1255ba44c7",
    "city": "paris",
    "locale": "fr",
    "slug": "paris-incontournables-tour-eiffel",
    "group": "paris-iconos",
    "title": "Paris incontournable : de l'Arc de Triomphe à la Tour Eiffel"
  },
  {
    "id": "9d36780b-756e-5727-aa4c-932431332786",
    "city": "paris",
    "locale": "de",
    "slug": "paris-highlights-eiffelturm",
    "group": "paris-iconos",
    "title": "Unverzichtbares Paris: vom Triumphbogen zum Eiffelturm"
  },
  {
    "id": "ebc52bcf-6f2f-55f3-a4ce-201c350f999e",
    "city": "paris",
    "locale": "it",
    "slug": "parigi-imperdibile-torre-eiffel",
    "group": "paris-iconos",
    "title": "Parigi imperdibile: dall'Arco di Trionfo alla Torre Eiffel"
  },
  {
    "id": "2b06758c-0167-5697-a56b-c3730df35c85",
    "city": "paris",
    "locale": "es",
    "slug": "paris-montmartre-bohemio",
    "group": "paris-montmartre",
    "title": "Montmartre bohemio: artistas, cabarés y cine"
  },
  {
    "id": "90b55c53-a68e-530a-aa4d-a2f4c59cbd41",
    "city": "paris",
    "locale": "en",
    "slug": "paris-bohemian-montmartre",
    "group": "paris-montmartre",
    "title": "Bohemian Montmartre: Artists, Cabarets, and Cinema"
  },
  {
    "id": "b105bbe9-c825-5b5f-a58c-ac191cc62982",
    "city": "paris",
    "locale": "fr",
    "slug": "paris-montmartre-boheme",
    "group": "paris-montmartre",
    "title": "Montmartre bohème : artistes, cabarets et cinéma"
  },
  {
    "id": "3939389b-b12a-5224-a7c7-1b3a9e7300da",
    "city": "paris",
    "locale": "de",
    "slug": "paris-bohemisches-montmartre",
    "group": "paris-montmartre",
    "title": "Bohemisches Montmartre: Künstler, Kabaretts und Kino"
  },
  {
    "id": "63531b9f-8c67-52cf-a6bb-bb39cc3fe31c",
    "city": "paris",
    "locale": "it",
    "slug": "parigi-montmartre-bohemien",
    "group": "paris-montmartre",
    "title": "Montmartre bohémien: artisti, cabaret e cinema"
  },
  {
    "id": "61841ad3-7dc4-5742-adda-6d28058b25f5",
    "city": "paris",
    "locale": "es",
    "slug": "paris-sabores-marais",
    "group": "paris-marais",
    "title": "Sabores del Marais: mercados y cocina parisina"
  },
  {
    "id": "d15f6f0b-359c-5098-ac14-a2a393c91225",
    "city": "paris",
    "locale": "en",
    "slug": "paris-flavors-marais",
    "group": "paris-marais",
    "title": "Flavors of the Marais: Markets and Parisian Cooking"
  },
  {
    "id": "58aafdb3-790e-5527-a675-bf48ae3ecd53",
    "city": "paris",
    "locale": "fr",
    "slug": "paris-saveurs-marais",
    "group": "paris-marais",
    "title": "Saveurs du Marais : marchés et cuisine parisienne"
  },
  {
    "id": "dbbf385e-c2a3-5c33-a179-b358a7353289",
    "city": "paris",
    "locale": "de",
    "slug": "paris-aromen-marais",
    "group": "paris-marais",
    "title": "Aromen des Marais: Märkte und Pariser Küche"
  },
  {
    "id": "0d228a93-fd9b-527a-a911-9827721b12f7",
    "city": "paris",
    "locale": "it",
    "slug": "parigi-sapori-marais",
    "group": "paris-marais",
    "title": "Sapori del Marais: mercati e cucina parigina"
  },
  {
    "id": "c1e36c61-0dfb-540e-afbb-dd71e1e69a0f",
    "city": "pisa",
    "locale": "es",
    "slug": "pisa-recorrido-historico",
    "group": "pisa-history",
    "title": "Pisa: recorrido histórico general"
  },
  {
    "id": "813dcdbb-7da0-54be-aa45-e3695b1dd3cf",
    "city": "pisa",
    "locale": "en",
    "slug": "pisa-historical-walk",
    "group": "pisa-history",
    "title": "Pisa: historical walking tour"
  },
  {
    "id": "d63f0df4-ba0c-5635-a975-35ce2f8021e0",
    "city": "pisa",
    "locale": "fr",
    "slug": "pisa-parcours-historique",
    "group": "pisa-history",
    "title": "Pisa : parcours historique"
  },
  {
    "id": "3c22694f-85a3-58af-ad37-ace5e254823e",
    "city": "pisa",
    "locale": "de",
    "slug": "pisa-historischer-rundgang",
    "group": "pisa-history",
    "title": "Pisa: historischer Rundgang"
  },
  {
    "id": "5b3a2697-ccac-5f92-af70-26f85edefef0",
    "city": "pisa",
    "locale": "it",
    "slug": "pisa-percorso-storico",
    "group": "pisa-history",
    "title": "Pisa: percorso storico"
  },
  {
    "id": "98e94997-42d0-5ff3-a453-52e564a0cfc5",
    "city": "roma",
    "locale": "es",
    "slug": "roma-recorrido-historico",
    "group": "roma-history",
    "title": "Roma: recorrido histórico general"
  },
  {
    "id": "cf41438d-18e9-550e-acac-fcd9f1f0aea3",
    "city": "roma",
    "locale": "en",
    "slug": "roma-historical-walk",
    "group": "roma-history",
    "title": "Rome: historical walking tour"
  },
  {
    "id": "39d90dff-f0e5-5b62-a8ee-ecbf1349264e",
    "city": "roma",
    "locale": "fr",
    "slug": "roma-parcours-historique",
    "group": "roma-history",
    "title": "Rome : parcours historique"
  },
  {
    "id": "435c5fb3-7eee-5fcd-a107-ab73babfc072",
    "city": "roma",
    "locale": "de",
    "slug": "roma-historischer-rundgang",
    "group": "roma-history",
    "title": "Rom: historischer Rundgang"
  },
  {
    "id": "6d65d6c6-b6ec-52a9-af2d-1564882fbef1",
    "city": "roma",
    "locale": "it",
    "slug": "roma-percorso-storico",
    "group": "roma-history",
    "title": "Roma: percorso storico"
  },
  {
    "id": "7a309603-5bca-5e14-aee4-d522901406c6",
    "city": "strasbourg",
    "locale": "es",
    "slug": "strasbourg-recorrido-historico",
    "group": "strasbourg-history",
    "title": "Estrasburgo: recorrido histórico general"
  },
  {
    "id": "775bb49f-6b54-507f-acc0-2621fbe831b3",
    "city": "strasbourg",
    "locale": "en",
    "slug": "strasbourg-historical-walk",
    "group": "strasbourg-history",
    "title": "Strasbourg: historical walking tour"
  },
  {
    "id": "87c479be-9f2f-5301-a304-0d9061eaf140",
    "city": "strasbourg",
    "locale": "fr",
    "slug": "strasbourg-parcours-historique",
    "group": "strasbourg-history",
    "title": "Strasbourg : parcours historique"
  },
  {
    "id": "26ab4bac-423c-54e6-a9f4-b4ac4663b103",
    "city": "strasbourg",
    "locale": "de",
    "slug": "strasbourg-historischer-rundgang",
    "group": "strasbourg-history",
    "title": "Straßburg: historischer Rundgang"
  },
  {
    "id": "e81ae596-3584-5049-a2ec-2c0103ec22c3",
    "city": "strasbourg",
    "locale": "it",
    "slug": "strasbourg-percorso-storico",
    "group": "strasbourg-history",
    "title": "Strasburgo: percorso storico"
  },
  {
    "id": "ca4ebd59-3c73-577a-a270-03c1d57a6960",
    "city": "stuttgart",
    "locale": "es",
    "slug": "stuttgart-recorrido-historico",
    "group": "stuttgart-history",
    "title": "Stuttgart: recorrido histórico general"
  },
  {
    "id": "f1cc8bc6-6ca2-5ca0-ae92-2382b8932c1c",
    "city": "stuttgart",
    "locale": "en",
    "slug": "stuttgart-historical-walk",
    "group": "stuttgart-history",
    "title": "Stuttgart: historical walking tour"
  },
  {
    "id": "200eead2-8100-58d7-a5db-29f8b502b7a3",
    "city": "stuttgart",
    "locale": "fr",
    "slug": "stuttgart-parcours-historique",
    "group": "stuttgart-history",
    "title": "Stuttgart : parcours historique"
  },
  {
    "id": "714b516f-903c-58f5-a43d-bac8d28da9c6",
    "city": "stuttgart",
    "locale": "de",
    "slug": "stuttgart-historischer-rundgang",
    "group": "stuttgart-history",
    "title": "Stuttgart: historischer Rundgang"
  },
  {
    "id": "0a2d5312-2746-5728-a7f9-91f4b1e79923",
    "city": "stuttgart",
    "locale": "it",
    "slug": "stuttgart-percorso-storico",
    "group": "stuttgart-history",
    "title": "Stoccarda: percorso storico"
  },
  {
    "id": "85014d60-97da-5dca-a2d4-1b4b71778306",
    "city": "torino",
    "locale": "es",
    "slug": "torino-recorrido-historico",
    "group": "torino-history",
    "title": "Turín: recorrido histórico general"
  },
  {
    "id": "7abedc59-5a6f-5921-a093-15975db430fd",
    "city": "torino",
    "locale": "en",
    "slug": "torino-historical-walk",
    "group": "torino-history",
    "title": "Turin: historical walking tour"
  },
  {
    "id": "46f9f58a-98d4-5092-a843-2fb276816fb0",
    "city": "torino",
    "locale": "fr",
    "slug": "torino-parcours-historique",
    "group": "torino-history",
    "title": "Turin : parcours historique"
  },
  {
    "id": "6f94a744-731f-5c92-a414-ae7a3b1f2e3b",
    "city": "torino",
    "locale": "de",
    "slug": "torino-historischer-rundgang",
    "group": "torino-history",
    "title": "Turin: historischer Rundgang"
  },
  {
    "id": "06a501b0-ae42-5b25-a035-e27993e33ce5",
    "city": "torino",
    "locale": "it",
    "slug": "torino-percorso-storico",
    "group": "torino-history",
    "title": "Torino: percorso storico"
  },
  {
    "id": "30276f6e-5732-564e-ac04-9f55275e2c0a",
    "city": "toulouse",
    "locale": "es",
    "slug": "toulouse-recorrido-historico",
    "group": "toulouse-history",
    "title": "Toulouse: recorrido histórico general"
  },
  {
    "id": "f16185bf-2b75-5338-a85b-c9c7d5adfbdd",
    "city": "toulouse",
    "locale": "en",
    "slug": "toulouse-historical-walk",
    "group": "toulouse-history",
    "title": "Toulouse: historical walking tour"
  },
  {
    "id": "76b6f84b-a36a-58f9-adb6-88eb9e390002",
    "city": "toulouse",
    "locale": "fr",
    "slug": "toulouse-parcours-historique",
    "group": "toulouse-history",
    "title": "Toulouse : parcours historique"
  },
  {
    "id": "fb218847-7801-503d-aeb1-33fb32bc92da",
    "city": "toulouse",
    "locale": "de",
    "slug": "toulouse-historischer-rundgang",
    "group": "toulouse-history",
    "title": "Toulouse: historischer Rundgang"
  },
  {
    "id": "c7be3641-6e2d-5014-ac09-0ecbaac9045e",
    "city": "toulouse",
    "locale": "it",
    "slug": "toulouse-percorso-storico",
    "group": "toulouse-history",
    "title": "Tolosa: percorso storico"
  },
  {
    "id": "4c776052-db33-5f03-ab64-e430f92df3c2",
    "city": "venezia",
    "locale": "es",
    "slug": "venezia-recorrido-historico",
    "group": "venezia-history",
    "title": "Venecia: recorrido histórico general"
  },
  {
    "id": "16995a14-ac3d-557e-a917-4412412f31e8",
    "city": "venezia",
    "locale": "en",
    "slug": "venezia-historical-walk",
    "group": "venezia-history",
    "title": "Venice: historical walking tour"
  },
  {
    "id": "fc99ff7e-41d7-5535-aed8-880bd2024620",
    "city": "venezia",
    "locale": "fr",
    "slug": "venezia-parcours-historique",
    "group": "venezia-history",
    "title": "Venise : parcours historique"
  },
  {
    "id": "d51295ad-af86-5a2e-a87b-bbef722e8811",
    "city": "venezia",
    "locale": "de",
    "slug": "venezia-historischer-rundgang",
    "group": "venezia-history",
    "title": "Venedig: historischer Rundgang"
  },
  {
    "id": "44d19ea6-c60e-5b25-a743-d2d0c8a82cc6",
    "city": "venezia",
    "locale": "it",
    "slug": "venezia-percorso-storico",
    "group": "venezia-history",
    "title": "Venezia: percorso storico"
  },
  {
    "id": "a8afe6a2-66ce-5833-af77-b360850b45b1",
    "city": "verona",
    "locale": "es",
    "slug": "verona-recorrido-historico",
    "group": "verona-history",
    "title": "Verona: recorrido histórico general"
  },
  {
    "id": "46d91da2-3c2a-5aa0-a0e4-04a07b7fd7ce",
    "city": "verona",
    "locale": "en",
    "slug": "verona-historical-walk",
    "group": "verona-history",
    "title": "Verona: historical walking tour"
  },
  {
    "id": "aa3e7473-1c7f-5cbf-ac05-6c0ff79f4731",
    "city": "verona",
    "locale": "fr",
    "slug": "verona-parcours-historique",
    "group": "verona-history",
    "title": "Verona : parcours historique"
  },
  {
    "id": "5acadc55-df32-5810-a5b0-a04232bc388d",
    "city": "verona",
    "locale": "de",
    "slug": "verona-historischer-rundgang",
    "group": "verona-history",
    "title": "Verona: historischer Rundgang"
  },
  {
    "id": "4b2a865a-ac82-5c90-adc2-082965473126",
    "city": "verona",
    "locale": "it",
    "slug": "verona-percorso-storico",
    "group": "verona-history",
    "title": "Verona: percorso storico"
  }
];
