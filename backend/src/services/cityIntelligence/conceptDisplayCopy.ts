export interface ConceptDisplayCopy {
  title: string;
  subtitle: string;
  label: string;
}

const MADRID_COPY: Record<string, ConceptDisplayCopy> = {
  'madrid-art': {
    title: 'El Paseo del Arte Sin Prisa',
    subtitle: 'Museos, esculturas y colecciones para mirar Madrid con otros ojos.',
    label: 'Arte y museos',
  },
  'madrid-religious': {
    title: 'Cupulas, Santos y Poder',
    subtitle: 'Un recorrido por iglesias, catedrales y simbolos sagrados de la ciudad.',
    label: 'Madrid sagrado',
  },
  'madrid-historical': {
    title: 'Kilometro Cero y Memoria de Madrid',
    subtitle: 'Plazas, instituciones y lugares donde la historia urbana se vuelve visible.',
    label: 'Historia urbana',
  },
  'madrid-markets': {
    title: 'Plazas, Mercados y Vida de Barrio',
    subtitle: 'Un paseo por los espacios donde Madrid compra, charla y se encuentra.',
    label: 'Vida local',
  },
};

const ROUTE_TYPE_LABELS: Record<string, { title: (city: string) => string; subtitle: (city: string) => string; label: string }> = {
  art: {
    title: (city) => `${city} Entre Arte y Museos`,
    subtitle: (city) => `Un paseo sonoro por las colecciones y paradas culturales de ${city}.`,
    label: 'Arte y museos',
  },
  religious: {
    title: (city) => `${city} Sagrada`,
    subtitle: (city) => `Iglesias, catedrales y espacios de memoria espiritual en ${city}.`,
    label: 'Patrimonio religioso',
  },
  historical: {
    title: (city) => `${city}: Historia Viva`,
    subtitle: (city) => `Un recorrido por plazas, instituciones y huellas urbanas de ${city}.`,
    label: 'Historia urbana',
  },
  markets: {
    title: (city) => `${city} de Plazas y Vida Local`,
    subtitle: (city) => `Mercados, plazas y espacios donde la ciudad se encuentra cada dia.`,
    label: 'Vida local',
  },
  architecture: {
    title: (city) => `${city} en Piedra, Luz y Fachadas`,
    subtitle: (city) => `Edificios y espacios que dejan leer la ciudad a traves de su forma.`,
    label: 'Arquitectura',
  },
  general: {
    title: (city) => `${city} Esencial`,
    subtitle: (city) => `Una primera caminata para orientarse con audio por los lugares clave.`,
    label: 'Imprescindibles',
  },
};

function normalize(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

export function getConceptDisplayCopy(params: {
  city: string;
  routeType?: string;
  slug?: string;
}): ConceptDisplayCopy {
  const slug = normalize(params.slug);
  if (slug && MADRID_COPY[slug]) {
    return MADRID_COPY[slug];
  }

  const routeType = normalize(params.routeType);
  const fallback = ROUTE_TYPE_LABELS[routeType] || ROUTE_TYPE_LABELS.general;
  return {
    title: fallback.title(params.city),
    subtitle: fallback.subtitle(params.city),
    label: fallback.label,
  };
}
