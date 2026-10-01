// Display names and search aliases for catalogue destinations. Unknown cities keep
// their stored name; these labels never change generation/reuse identity.
export type CityNames = Record<'es' | 'en' | 'fr' | 'de' | 'it', string>;
const cities: Array<{ countryCode: string; names: CityNames }> = [
  { countryCode: 'ES', names: { es: 'Madrid', en: 'Madrid', fr: 'Madrid', de: 'Madrid', it: 'Madrid' } },
  { countryCode: 'ES', names: { es: 'Barcelona', en: 'Barcelona', fr: 'Barcelone', de: 'Barcelona', it: 'Barcellona' } },
  { countryCode: 'ES', names: { es: 'Toledo', en: 'Toledo', fr: 'Tolède', de: 'Toledo', it: 'Toledo' } },
  { countryCode: 'ES', names: { es: 'Valencia', en: 'Valencia', fr: 'Valence', de: 'Valencia', it: 'Valencia' } },
  { countryCode: 'ES', names: { es: 'Málaga', en: 'Málaga', fr: 'Malaga', de: 'Málaga', it: 'Malaga' } },
  { countryCode: 'ES', names: { es: 'Sevilla', en: 'Seville', fr: 'Séville', de: 'Sevilla', it: 'Siviglia' } },
  { countryCode: 'ES', names: { es: 'Córdoba', en: 'Córdoba', fr: 'Cordoue', de: 'Córdoba', it: 'Cordova' } },
  { countryCode: 'ES', names: { es: 'Granada', en: 'Granada', fr: 'Grenade', de: 'Granada', it: 'Granada' } },
  { countryCode: 'ES', names: { es: 'San Sebastián', en: 'San Sebastián', fr: 'Saint-Sébastien', de: 'San Sebastián', it: 'San Sebastián' } },
  { countryCode: 'FR', names: { es: 'París', en: 'Paris', fr: 'Paris', de: 'Paris', it: 'Parigi' } },
  { countryCode: 'FR', names: { es: 'Toulouse', en: 'Toulouse', fr: 'Toulouse', de: 'Toulouse', it: 'Tolosa' } },
  { countryCode: 'FR', names: { es: 'Lyon', en: 'Lyon', fr: 'Lyon', de: 'Lyon', it: 'Lyon' } },
  { countryCode: 'FR', names: { es: 'Marsella', en: 'Marseille', fr: 'Marseille', de: 'Marseille', it: 'Marsiglia' } },
  { countryCode: 'FR', names: { es: 'Lille', en: 'Lille', fr: 'Lille', de: 'Lille', it: 'Lille' } },
  { countryCode: 'FR', names: { es: 'Niza', en: 'Nice', fr: 'Nice', de: 'Nizza', it: 'Nizza' } },
  { countryCode: 'FR', names: { es: 'Burdeos', en: 'Bordeaux', fr: 'Bordeaux', de: 'Bordeaux', it: 'Bordeaux' } },
  { countryCode: 'FR', names: { es: 'Estrasburgo', en: 'Strasbourg', fr: 'Strasbourg', de: 'Straßburg', it: 'Strasburgo' } },
  { countryCode: 'FR', names: { es: 'Nantes', en: 'Nantes', fr: 'Nantes', de: 'Nantes', it: 'Nantes' } },
  { countryCode: 'FR', names: { es: 'Montpellier', en: 'Montpellier', fr: 'Montpellier', de: 'Montpellier', it: 'Montpellier' } },
  { countryCode: 'DE', names: { es: 'Berlín', en: 'Berlin', fr: 'Berlin', de: 'Berlin', it: 'Berlino' } },
  { countryCode: 'DE', names: { es: 'Múnich', en: 'Munich', fr: 'Munich', de: 'München', it: 'Monaco di Baviera' } },
  { countryCode: 'DE', names: { es: 'Hamburgo', en: 'Hamburg', fr: 'Hambourg', de: 'Hamburg', it: 'Amburgo' } },
  { countryCode: 'DE', names: { es: 'Fráncfort del Meno', en: 'Frankfurt', fr: 'Francfort-sur-le-Main', de: 'Frankfurt am Main', it: 'Francoforte sul Meno' } },
  { countryCode: 'DE', names: { es: 'Colonia', en: 'Cologne', fr: 'Cologne', de: 'Köln', it: 'Colonia' } },
  { countryCode: 'DE', names: { es: 'Düsseldorf', en: 'Düsseldorf', fr: 'Düsseldorf', de: 'Düsseldorf', it: 'Düsseldorf' } },
  { countryCode: 'DE', names: { es: 'Dresde', en: 'Dresden', fr: 'Dresde', de: 'Dresden', it: 'Dresda' } },
  { countryCode: 'DE', names: { es: 'Núremberg', en: 'Nuremberg', fr: 'Nuremberg', de: 'Nürnberg', it: 'Norimberga' } },
  { countryCode: 'DE', names: { es: 'Stuttgart', en: 'Stuttgart', fr: 'Stuttgart', de: 'Stuttgart', it: 'Stoccarda' } },
  { countryCode: 'DE', names: { es: 'Leipzig', en: 'Leipzig', fr: 'Leipzig', de: 'Leipzig', it: 'Lipsia' } },
  { countryCode: 'IT', names: { es: 'Roma', en: 'Rome', fr: 'Rome', de: 'Rom', it: 'Roma' } },
  { countryCode: 'IT', names: { es: 'Florencia', en: 'Florence', fr: 'Florence', de: 'Florenz', it: 'Firenze' } },
  { countryCode: 'IT', names: { es: 'Venecia', en: 'Venice', fr: 'Venise', de: 'Venedig', it: 'Venezia' } },
  { countryCode: 'IT', names: { es: 'Nápoles', en: 'Naples', fr: 'Naples', de: 'Neapel', it: 'Napoli' } },
  { countryCode: 'IT', names: { es: 'Milán', en: 'Milan', fr: 'Milan', de: 'Mailand', it: 'Milano' } },
  { countryCode: 'IT', names: { es: 'Turín', en: 'Turin', fr: 'Turin', de: 'Turin', it: 'Torino' } },
  { countryCode: 'IT', names: { es: 'Palermo', en: 'Palermo', fr: 'Palermo', de: 'Palermo', it: 'Palermo' } },
  { countryCode: 'IT', names: { es: 'Bolonia', en: 'Bologna', fr: 'Bologne', de: 'Bologna', it: 'Bologna' } },
  { countryCode: 'IT', names: { es: 'Pisa', en: 'Pisa', fr: 'Pisa', de: 'Pisa', it: 'Pisa' } },
  { countryCode: 'IT', names: { es: 'Verona', en: 'Verona', fr: 'Verona', de: 'Verona', it: 'Verona' } },
  { countryCode: 'NL', names: { es: 'Ámsterdam', en: 'Amsterdam', fr: 'Amsterdam', de: 'Amsterdam', it: 'Amsterdam' } },
  { countryCode: 'PT', names: { es: 'Lisboa', en: 'Lisbon', fr: 'Lisbonne', de: 'Lissabon', it: 'Lisbona' } },
  { countryCode: 'GB', names: { es: 'Londres', en: 'London', fr: 'Londres', de: 'London', it: 'Londra' } },
  { countryCode: 'AT', names: { es: 'Viena', en: 'Vienna', fr: 'Vienne', de: 'Wien', it: 'Vienna' } },
  { countryCode: 'CZ', names: { es: 'Praga', en: 'Prague', fr: 'Prague', de: 'Prag', it: 'Praga' } },
];

const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function getCityNames(city: string, countryCode: string): CityNames | undefined {
  return cities.find(entry => entry.countryCode === countryCode?.toUpperCase()
    && Object.values(entry.names).some(name => normalize(name) === normalize(city)))?.names;
}

export function citySearchAliases(query: string): Array<{ countryCode: string; names: string[] }> {
  const term = normalize(query);
  if (!term) return [];
  return cities.filter(entry => Object.values(entry.names).some(name => normalize(name).includes(term)))
    .map(entry => ({ countryCode: entry.countryCode,
      names: [...new Set(Object.values(entry.names).flatMap(name => [name, normalize(name)]))] }));
}
