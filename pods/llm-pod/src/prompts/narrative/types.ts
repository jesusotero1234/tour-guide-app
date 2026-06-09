export interface LongNarrativeSeeds {
  wikipediaLead?: string | null;
  wikipediaBody?: string | null;
  wikidataClaims?: Record<string, string> | null;
  osmTags?: Record<string, string>;
  wikivoyage?: string | null;
  enrichedContext?: string | null;
}

export interface LongNarrativePromptInput {
  localName: string;
  seeds: LongNarrativeSeeds;
  theme: string;
  language: string;
  nextStopName?: string;
  position: 'first' | 'middle' | 'last';
  retry?: boolean;
  seedQuality?: 'rich' | 'thin';
  targetWords?: string;
  cityName?: string;
  totalStops?: number;
  stopIndex?: number;
  tourDurationMinutes?: number;
  /** Anti-pattern: openings/styles already used in this tour (injected as negative prompt) */
  usedOpenings?: string[];
  /** Archetype to guide this section's opening style */
  openingArchetype?: string;
  /** Missing facts from previous attempt (injected on retry) */
  missingFacts?: string[];
}

export interface SectionPrompt {
  system: string;
  user: string;
}

export type FactCategory = 'year_built' | 'architect' | 'creator' | 'style' |
  'heritage' | 'material' | 'location' | 'event' | 'measurement';

/** Maps Wikidata property IDs to FactCategory for coverage validation */
export const PROP_TO_CATEGORY: Record<string, FactCategory> = {
  P571: 'year_built', P1619: 'year_built',
  P84: 'architect', P170: 'creator',
  P149: 'style',
  P1435: 'heritage',
  P186: 'material', P276: 'location',
  P793: 'event', P2048: 'measurement',
};

/** Localized human-readable labels for FactCategory values.
 *  Used in retry feedback (missingFacts) and fact card formatting. */
export const CATEGORY_LABELS: Record<FactCategory, Record<string, string>> = {
  year_built:    { es: 'año de creación', fr: 'année de création', de: 'Baujahr', en: 'year built', it: 'anno di costruzione' },
  architect:     { es: 'arquitecto', fr: 'architecte', de: 'Architekt', en: 'architect', it: 'architetto' },
  creator:       { es: 'creador', fr: 'créateur', de: 'Schöpfer', en: 'creator', it: 'creatore' },
  style:         { es: 'estilo', fr: 'style', de: 'Stil', en: 'style', it: 'stile' },
  heritage:      { es: 'patrimonio', fr: 'patrimoine', de: 'Kulturerbe', en: 'heritage', it: 'patrimonio' },
  material:      { es: 'material', fr: 'matériau', de: 'Material', en: 'material', it: 'materiale' },
  location:      { es: 'ubicación', fr: 'emplacement', de: 'Standort', en: 'location', it: 'ubicazione' },
  event:         { es: 'evento', fr: 'événement', de: 'Ereignis', en: 'event', it: 'evento' },
  measurement:   { es: 'medida', fr: 'mesure', de: 'Maß', en: 'measurement', it: 'misura' },
};

/** Get a localized label for a FactCategory. Falls back to English. */
export function categoryLabel(category: FactCategory, language: string): string {
  const code = language.slice(0, 2).toLowerCase();
  return CATEGORY_LABELS[category]?.[code] || CATEGORY_LABELS[category]?.en || category;
}

export function languageName(language: string): string {
  const code = language.slice(0, 2).toLowerCase();
  return ({
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  } as Record<string, string>)[code] || language;
}

export function sectionSystem(language: string, retry = false, seedQuality: 'rich' | 'thin' = 'rich', targetWords = '70 to 90', usedOpenings?: string[], openingArchetype?: string): string {
  const langCode = language.slice(0, 2).toLowerCase();
  const targetLanguage = languageName(language);

  // ── Native-language system prompts (Fase 1a) ──
  const SYSTEM_PROMPTS: Record<string, string> = {
    es: `Eres un guía local que conoce bien la ciudad. Hablas con calidez y precisión, como alguien que quiere que el visitante repare en detalles que de otro modo pasaría por alto. Escribes en español.`,
    fr: `Tu es un guide local qui connaît bien la ville. Tu parles avec chaleur et précision, comme quelqu'un qui veut que le visiteur remarque des détails qu'il aurait autrement manqués. Tu écris en français.`,
    de: `Du bist ein ortskundiger Stadtführer. Du sprichst warmherzig und präzise, wie jemand, der möchte, dass der Besucher Details bemerkt, die ihm sonst entgehen würden. Du schreibst auf Deutsch.`,
    en: `You are a local guide who knows the city well. You speak with warmth and precision, like someone who wants the visitor to notice details they might otherwise miss. You write in English.`,
    it: `Sei una guida locale che conosce bene la città. Parli con calore e precisione, come qualcuno che vuole che il visitatore noti dettagli che altrimenti gli sfuggirebbero. Scrivi in italiano.`,
  };

  // ── Native-language style guides (Fase 1a) ──
  const STYLE_GUIDES: Record<string, string> = {
    es: `Escribe en presente, dirigiendo al visitante de "tú". NUNCA uses "usted" ni "ustedes". Usa un ritmo de guía: frases como "Fíjate cómo...", "Si miras hacia arriba verás..." son bienvenidas. Convierte los hechos en microhistorias con interés humano, no en listas secas. Conecta cada sección con el tema del tour.`,
    fr: `Écris au présent, en t'adressant au visiteur avec "vous". Utilise un rythme de guide : des phrases comme "Remarquez comment...", "Si vous levez les yeux..." sont bienvenues. Transforme les faits en micro-histoires, pas en listes sèches. Relie chaque section au thème de la visite.`,
    de: `Schreibe im Präsens und sprich den Besucher mit "du" an. Verwende einen Führungsrhythmus: Sätze wie "Achte darauf, wie...", "Wenn du nach oben schaust..." sind willkommen. Verwandle Fakten in Mikrogeschichten, nicht in trockene Listen. Verbinde jeden Abschnitt mit dem Thema der Führung.`,
    en: `Write in present tense, addressing the visitor as "you". Use a guide-like rhythm: phrases like "Notice how...", "Look up and you'll see..." are welcome. Turn facts into micro-stories with human interest, not dry lists. Connect each section to the tour theme.`,
    it: `Scrivi al presente, rivolgendoti al visitatore con "tu". Usa un ritmo da guida: frasi come "Nota come...", "Se guardi in alto vedrai..." sono benvenute. Trasforma i fatti in microstorie, non in elenchi aridi. Collega ogni sezione al tema del tour.`,
  };

  // ── FACT CONTRACT (Fase 2) — positive polarity: facts are SAFE and MUST be used ──
  const FACT_CONTRACTS: Record<string, string> = {
    es: `CONTRATO DE HECHOS: Los HECHOS VERIFICADOS son seguros y DEBES usarlos cuando estén disponibles. Fechas, personas, estilos, materiales, medidas, funciones y eventos SOLO están permitidos si aparecen en HECHOS VERIFICADOS o en el contexto proporcionado. Las prohibiciones se aplican únicamente a datos no proporcionados. No menciones "hechos verificados", fuentes, Wikidata, confianza ni reglas internas en la narración.`,
    fr: `CONTRAT DES FAITS : Les FAITS VÉRIFIÉS sont sûrs et tu dois les utiliser lorsqu'ils sont disponibles. Les dates, personnes, styles, matériaux, mesures, fonctions et événements ne sont permis que s'ils apparaissent dans les FAITS VÉRIFIÉS ou dans le contexte fourni. Les interdictions ne concernent que les données non fournies. Ne mentionne jamais les sources ni les règles internes.`,
    de: `FAKTENVERTRAG: VERIFIZIERTE FAKTEN sind sicher und müssen verwendet werden, wenn sie verfügbar sind. Daten, Personen, Stile, Materialien, Maße, Funktionen und Ereignisse sind nur erlaubt, wenn sie in den VERIFIZIERTEN FAKTEN oder im bereitgestellten Kontext stehen. Die Verbote gelten nur für nicht bereitgestellte Angaben. Erwähne keine Quellen oder internen Regeln.`,
    en: `FACT CONTRACT: VERIFIED FACTS are safe and must be used when available. Dates, people, styles, materials, measurements, functions, and events are allowed only when they appear in VERIFIED FACTS or provided context. The bans apply only to facts that were not provided. Do not mention "verified facts", sources, Wikidata, confidence, or internal rules in the narration.`,
    it: `CONTRATTO DEI FATTI: I FATTI VERIFICATI sono sicuri e devi usarli quando disponibili. Date, persone, stili, materiali, misure, funzioni ed eventi sono permessi solo se compaiono nei FATTI VERIFICATI o nel contesto fornito. I divieti valgono solo per dati non forniti. Non menzionare fonti o regole interne.`,
  };

  // ── GOLDEN RULE (Fase 2 reformulation) — negative polarity, after Fact Contract ──
  const GOLDEN_RULES: Record<string, string> = {
    es: `REGLA DE ORO: no añadas afirmaciones factuales fuera de los datos proporcionados. Está prohibido inventar fechas, siglos, nombres, estilos, materiales no visibles, medidas exactas, funciones históricas o eventos. Está permitido describir lo visible desde fuera y conectar narrativamente los hechos proporcionados.`,
    fr: `RÈGLE D'OR : n'ajoute aucune affirmation factuelle hors des données fournies. Il est interdit d'inventer dates, siècles, noms, styles, matériaux non visibles, mesures exactes, fonctions historiques ou événements. Tu peux décrire ce qui est visible et relier les faits fournis naturellement.`,
    de: `GOLDENE REGEL: Füge keine faktischen Behauptungen außerhalb der bereitgestellten Daten hinzu. Erfinde keine Daten, Jahrhunderte, Namen, Stile, nicht sichtbaren Materialien, Maße, historischen Funktionen oder Ereignisse. Sichtbares darf beschrieben und bereitgestellte Fakten dürfen erzählerisch verbunden werden.`,
    en: `GOLDEN RULE: do not add factual claims beyond the provided data. Do not invent dates, centuries, names, styles, non-visible materials, exact measurements, historical functions, or events. You may describe visible exterior cues and narratively connect provided facts.`,
    it: `REGOLA D'ORO: non aggiungere affermazioni fattuali oltre i dati forniti. Non inventare date, secoli, nomi, stili, materiali non visibili, misure esatte, funzioni storiche o eventi. Puoi descrivere ciò che è visibile e collegare narrativamente i fatti forniti.`,
  };

  // ── Meta bans (Fase 1a) ──
  const META_BANS: Record<string, string> = {
    es: `NUNCA digas "esto es significativo porque" ni "es importante para nuestro recorrido". NUNCA uses meta-narrativa. Muestra la importancia con hechos concretos, no la anuncies. NUNCA menciones limitaciones de fuentes, registros públicos, datos disponibles o lo que estás evitando inventar.`,
    fr: `Ne dis JAMAIS "c'est significatif parce que" ou "c'est important pour notre visite". N'utilise JAMAIS de méta-narratif. Montre l'importance par des faits concrets, ne l'annonce pas. Ne mentionne JAMAIS les limites des sources, les archives publiques ou ce que tu évites d'inventer.`,
    de: `Sage NIEMALS "das ist bedeutsam weil" oder "das ist wichtig für unsere Führung". Verwende NIEMALS Meta-Erzählung. Zeige Bedeutung durch konkrete Fakten, kündige sie nicht an. Erwähne NIEMALS Quellenbeschränkungen, öffentliche Aufzeichnungen oder was du vermeidest zu erfinden.`,
    en: `NEVER say "this is significant because" or "this is important for our tour". NEVER use meta-narrative. Show importance through concrete facts, do not announce it. NEVER mention source limitations, public records, or what you are avoiding inventing.`,
    it: `Non dire MAI "questo è significativo perché" o "è importante per il nostro tour". Non usare MAI meta-narrativa. Mostra l'importanza con fatti concreti, non annunciarla. Non menzionare MAI limitazioni delle fonti, registri pubblici o cosa stai evitando di inventare.`,
  };

  const SPECULATION_BANS: Record<string, string> = {
    es: `Si te falta un hecho verificado, no especules. Prefiere brevedad sobre relleno. Frases como "debió de ser", "seguramente" o "probablemente" están prohibidas.`,
    fr: `S'il te manque un fait vérifié, ne spécule pas. Préfère la brièveté au remplissage. Les phrases comme "a dû être", "sûrement" ou "probablement" sont interdites.`,
    de: `Wenn dir eine verifizierte Tatsache fehlt, spekuliere nicht. Ziehe Kürze dem Füllmaterial vor. Sätze wie "muss gewesen sein", "sicherlich" oder "wahrscheinlich" sind verboten.`,
    en: `If you lack a verified fact, do not speculate. Prefer brevity over filler. Phrases like "must have been", "surely" or "probably" are forbidden.`,
    it: `Se ti manca un fatto verificato, non speculare. Preferisci la brevità al riempitivo. Frasi come "deve essere stato", "sicuramente" o "probabilmente" sono vietate.`,
  };

  const SOURCE_META_BANS: Record<string, string> = {
    es: 'CRÍTICO: NUNCA menciones limitaciones de fuentes, registros públicos, datos disponibles, hechos verificados o no verificados, cautela, prudencia, ni lo que no estás inventando. Son reglas internas, no narración. El visitante no debe oír nada sobre tus limitaciones de datos.',
    fr: 'CRITIQUE : Ne mentionne JAMAIS les limites des sources, les archives publiques, les données disponibles, les faits vérifiés ou non, la prudence, ni ce que tu n\'inventes pas. Ce sont des règles internes, pas de la narration.',
    de: 'KRITISCH: Erwähne NIEMALS Quellenbeschränkungen, öffentliche Aufzeichnungen, verfügbare Daten, verifizierte oder ungeprüfte Fakten, Vorsicht oder was du nicht erfindest. Das sind interne Regeln, keine Erzählung.',
    en: 'CRITICAL: NEVER mention source limitations, public records, available data, verified or unverified facts, caution, or what you are not inventing. These are internal rules, not narration. The visitor must not hear about your data constraints.',
    it: 'CRITICO: Non menzionare MAI limitazioni delle fonti, registri pubblici, dati disponibili, fatti verificati o meno, cautela o cosa non stai inventando. Sono regole interne, non narrazione.',
  };

  // ── Banned phrases (Fase 1a expanded) ──
  const BANNED_PHRASES: string[] = [
    // ES
    'Mire a su alrededor', 'Mira a tu alrededor', 'Miren hacia arriba', 'Mira hacia abajo',
    'Al llegar a', 'La primera impresion', 'La primera impresión',
    'es un lugar emblematico', 'es un lugar emblemático', 'fachada de ladrillo rojo',
    'Bienvenidos a esta caminata', 'se presenta ante ti',
    'es significativo para nuestro recorrido', 'es importante para nuestra caminata',
    'refleja como', 'refleja cómo', 'muestra como', 'muestra cómo',
    'usted', 'ustedes', 'miren', 'observen', 'fíjense', 'vean',
    'atmósfera', 'juego de luces', 'sombras', 'majestuoso', 'imponente',
    'majestuosidad', 'majestuosamente',
    'grandioso', 'misterioso', 'imponente fachada', 'la iluminación', 'penumbra',
    'testimonio de', 'testimonio tangible', 'poder y riqueza', 'riqueza del',
    'fachada dorada', 'lujosa decoración', 'lujosa', 'dorada fachada',
    'se alza majestuosamente', 'imponente presencia',
    // FR
    'atmosphère', 'jeu de lumière', 'ombres', 'majestueux', 'imposant',
    'grandiose', 'mystérieux', 'fenêtres étroites', 'plafonds peints', 'pénombre',
    // DE
    'Atmosphäre', 'Schatten', 'Lichtspiel', 'majestätisch', 'imposant',
    'großartig', 'geheimnisvoll', 'Deckenmalerei', 'Dämmerung',
    // EN
    'must-see destination', 'steeped in history', 'hidden gem',
    'atmosphere', 'play of light', 'shadows', 'majestic', 'imposing', 'mysterious',
    // IT
    'atmosfera', 'giochi di luce', 'ombre', 'maestoso', 'imponente', 'grandioso', 'misterioso',
  ];

  const BANNED_PROMPTS: Record<string, string> = {
    es: `FRASES PROHIBIDAS (nunca uses estas): ${BANNED_PHRASES.join('; ')}.`,
    fr: `PHRASES INTERDITES (n'utilise jamais celles-ci) : ${BANNED_PHRASES.join('; ')}.`,
    de: `VERBOTENE PHRASEN (verwende diese nie): ${BANNED_PHRASES.join('; ')}.`,
    en: `FORBIDDEN PHRASES (never use these): ${BANNED_PHRASES.join('; ')}.`,
    it: `FRASI PROIBITE (non usarle mai): ${BANNED_PHRASES.join('; ')}.`,
  };

  const usedPrompt = usedOpenings && usedOpenings.length > 0
    ? (langCode === 'es' ? `Estilos de apertura YA USADOS (NO los repitas): ${usedOpenings.join(', ')}. Usa un enfoque completamente diferente.`
      : langCode === 'fr' ? `Styles d'ouverture DÉJÀ UTILISÉS (NE les répète PAS) : ${usedOpenings.join(', ')}. Utilise une approche complètement différente.`
      : langCode === 'de' ? `Bereits VERWENDETE Eröffnungsstile (NICHT wiederholen): ${usedOpenings.join(', ')}. Verwende einen völlig anderen Ansatz.`
      : langCode === 'it' ? `Stili di apertura GIÀ USATI (NON ripeterli): ${usedOpenings.join(', ')}. Usa un approccio completamente diverso.`
      : `Opening styles ALREADY USED (do NOT repeat them): ${usedOpenings.join(', ')}. Use a completely different approach.`)
    : '';

  const archetypePrompt = openingArchetype
    ? (langCode === 'es' ? `Estilo de apertura requerido: ${openingArchetype}.`
      : langCode === 'fr' ? `Style d'ouverture requis : ${openingArchetype}.`
      : langCode === 'de' ? `Erforderlicher Eröffnungsstil: ${openingArchetype}.`
      : langCode === 'it' ? `Stile di apertura richiesto: ${openingArchetype}.`
      : `Required opening style: ${openingArchetype}.`)
    : '';

  const JSON_INSTRUCTIONS: Record<string, string> = {
    es: `Devuelve solo JSON estricto: {\"section\":\"tu sección de ${targetWords} palabras\"}.`,
    fr: `Retourne uniquement du JSON strict : {\"section\":\"ta section de ${targetWords} mots\"}.`,
    de: `Gib nur striktes JSON zurück: {\"section\":\"dein Abschnitt mit ${targetWords} Wörtern\"}.`,
    en: `Return strict JSON only: {\"section\":\"your ${targetWords} word section\"}.`,
    it: `Restituisci solo JSON stretto: {\"section\":\"la tua sezione di ${targetWords} parole\"}.`,
  };

  const RETRY_MESSAGES: Record<string, string> = {
    es: `Intento anterior falló. Reescribe siendo más específico, evita frases genéricas, no repitas, y mantente cerca de ${targetWords} palabras.`,
    fr: `Tentative précédente échouée. Réécris en étant plus spécifique, évite les phrases génériques, ne répète pas, et reste proche de ${targetWords} mots.`,
    de: `Vorheriger Versuch fehlgeschlagen. Schreibe spezifischer, vermeide generische Phrasen, wiederhole nicht und bleibe nahe bei ${targetWords} Wörtern.`,
    en: `Previous attempt failed. Rewrite being more specific, avoid generic phrases, don't repeat, and stay close to ${targetWords} words.`,
    it: `Tentativo precedente fallito. Riscrivi essendo più specifico, evita frasi generiche, non ripetere, e rimani vicino a ${targetWords} parole.`,
  };

  // ── Thin-seed guard (Fase 2: no atmosphere/sensory even on thin) ──
  const thinGuard = seedQuality === 'thin'
    ? (langCode === 'es'
      ? [
          'MODO THIN-SEED — LÍMITES FACTUALES ESTRICTOS:',
          'PERMITIDO (puedes describir libremente):',
          '  - Lo visible: escala, posición urbana, actividad alrededor.',
          '  - Lo que el tipo de lugar revela sobre el barrio o la ciudad.',
          '  - Si hay contexto enriquecido o Wikipedia body, puedes usar sus hechos.',
          'PROHIBIDO (no incluyas bajo ninguna circunstancia):',
          '  - Años, siglos o rangos de fechas específicos.',
          '  - Nombres de arquitectos, constructores, artistas o figuras históricas.',
          '  - Estilos arquitectónicos (gótico, barroco, románico, etc.).',
          '  - Eventos históricos (guerras, batallas, inauguraciones).',
          '  - Relaciones con realeza, nobleza, órdenes religiosas o instituciones.',
          '  - Frases como "fue construido en", "data de", "perteneció a".',
          'ESTRATEGIA NARRATIVA:',
          '  - NUNCA digas al visitante que los registros son limitados.',
          '  - Construye desde lo visible, el nombre/tipo del POI, el contexto de la ruta.',
          '  - Enfócate en lo que el visitante puede observar ahora.',
          '  - Prefiere una observación breve y precisa sobre el relleno.',
        ].join(' ')
      : [
          'THIN-SEED MODE — STRICT FACTUAL BOUNDARIES:',
          'PERMITTED: visible cues (scale, urban position, activity), place type context, enriched/Wikipedia facts if provided.',
          'FORBIDDEN: years, centuries, architects, artists, styles, events, royalty, institutions.',
          'NARRATIVE STRATEGY: never mention limited records. Build from visible cues and route context.',
        ].join(' '))
    : '';

  const systemPrompt = SYSTEM_PROMPTS[langCode]
    || `You are a warm, knowledgeable local guide leading a walking tour. Write only in ${targetLanguage}.`;
  const styleGuide = STYLE_GUIDES[langCode]
    || `Write in present tense, addressing the visitor naturally. Use a guide-like rhythm. Turn facts into micro-stories, not dry lists. Connect each section to the tour theme.`;
  const factContract = FACT_CONTRACTS[langCode] || FACT_CONTRACTS.en;
  const goldenRule = GOLDEN_RULES[langCode] || GOLDEN_RULES.en;
  const metaBan = META_BANS[langCode] || META_BANS.en;
  const speculationBan = SPECULATION_BANS[langCode] || SPECULATION_BANS.en;
  const sourceMetaBan = SOURCE_META_BANS[langCode] || SOURCE_META_BANS.en;
  const bannedPrompt = BANNED_PROMPTS[langCode] || BANNED_PROMPTS.en;
  const jsonInstruction = JSON_INSTRUCTIONS[langCode] || JSON_INSTRUCTIONS.en;
  const retryMessage = RETRY_MESSAGES[langCode] || RETRY_MESSAGES.en;

  return [
    systemPrompt,
    styleGuide,
    factContract,        // Fase 2: positive polarity FIRST
    goldenRule,           // Fase 2: negative polarity SECOND
    metaBan,
    speculationBan,
    sourceMetaBan,
    bannedPrompt,
    usedPrompt,
    archetypePrompt,
    jsonInstruction,
    thinGuard,
    retry ? retryMessage : '',
  ].filter(Boolean).join(' ');
}

export function compactRecord(record?: Record<string, string> | null): string {
  if (!record || Object.keys(record).length === 0) return 'none';
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
    .slice(0, 1200);
}

// ═══════════════════════════════════════════════════════════════════
// Structured Wikidata facts — Fase 2: clean, no sources visible
// ═══════════════════════════════════════════════════════════════════

const WIKIDATA_LABELS: Record<string, { label: string }> = {
  P84:   { label: 'Arquitecto' },
  P571:  { label: 'Año de creación' },
  P149:  { label: 'Estilo' },
  P186:  { label: 'Material' },
  P2048: { label: 'Altura' },
  P170:  { label: 'Creador' },
  P1435: { label: 'Patrimonio' },
  P276:  { label: 'Ubicación' },
  P1619: { label: 'Inauguración' },
  P793:  { label: 'Evento clave' },
};

/** Formats Wikidata claims into a clean, grounded facts block for the prompt.
 *  Fase 2: No visible sources, Wikidata IDs, or confidence levels.
 *  Facts are presented as "safe to use" rather than "restricted". */
export function formatStructuredFacts(
  wikidataClaims: Record<string, string> | null | undefined,
  language: string
): string {
  if (!wikidataClaims || Object.keys(wikidataClaims).length === 0) return '';

  const isEs = language?.startsWith('es');
  const facts: { label: string; value: string }[] = [];

  for (const [propId, value] of Object.entries(wikidataClaims)) {
    const meta = WIKIDATA_LABELS[propId];
    if (!meta) continue;
    const cat = PROP_TO_CATEGORY[propId];
    const label = cat ? categoryLabel(cat, language) : (isEs ? meta.label : propId);
    facts.push({
      label,
      value,
    });
  }

  if (facts.length === 0) return '';

  const header = isEs
    ? 'HECHOS VERIFICADOS — SEGUROS PARA USAR EN LA NARRACIÓN:'
    : 'VERIFIED FACTS — SAFE TO USE IN THE NARRATION:';

  const lines = [header];
  for (const f of facts) {
    lines.push(`- ${f.label}: ${f.value}`);
  }

  const instruction = isEs
    ? 'INSTRUCCIÓN: Usa estos datos como la base factual principal. No menciones esta lista, fuentes, Wikidata ni niveles de confianza al visitante. No añadas datos del mismo tipo fuera de esta lista.'
    : 'INSTRUCTION: Use these facts as the main factual base. Do not mention this list, sources, Wikidata, or confidence levels to the visitor. Do not add same-type facts outside this list.';

  lines.push(instruction);
  return lines.join('\n');
}
