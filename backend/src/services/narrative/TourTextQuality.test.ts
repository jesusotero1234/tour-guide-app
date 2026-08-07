import { auditTourText, buildTourIntroduction, buildTourNarrativePlan } from './TourTextQuality';

function stop(position: number, name: string, seed: string) {
  const sentences = Array.from({ length: 12 }, (_, index) => (
    `${seed} detalle ${index} explica un aspecto concreto de ${name} mediante hechos visibles y contexto propio de esta parada.`
  ));
  return {
    id: `stop-${position}`,
    position,
    name,
    description: sentences.join(' '),
    metadata: { narrationMeta: { claimCheck: { criticalFailCount: 0, verifiedRate: 0.9 } } },
  };
}

describe('TourTextQuality', () => {
  it('builds one tour-level welcome and assigns a distinct role to each stop', () => {
    const plan = buildTourNarrativePlan({
      city: 'Madrid',
      theme: 'history',
      language: 'es',
      placeNames: ['Palacio Real', 'Plaza Mayor', 'Puerta de Alcalá'],
    });
    const introduction = buildTourIntroduction({
      city: 'Madrid',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      firstStopName: 'Palacio Real',
      plan,
    });

    expect(introduction).toMatch(/Bienvenido/);
    expect(plan.stopRoles.map((item) => item.role)).toHaveLength(3);
    expect(new Set(plan.stopRoles.map((item) => item.openingArchetype)).size).toBe(3);
    expect(plan.stopRoles[0].role).toContain('presentar el punto de partida');
    expect(plan.stopRoles[0].role).not.toContain('corte');
  });

  it.each(['es', 'en', 'fr', 'de', 'it'])('builds a localized 100-150 word introduction for %s', (language) => {
    const plan = buildTourNarrativePlan({
      city: 'Madrid',
      theme: 'history',
      language,
      placeNames: ['Palacio Real', 'Plaza Mayor', 'Puerta de Alcalá'],
    });
    const introduction = buildTourIntroduction({
      city: 'Madrid',
      theme: 'history',
      language,
      durationMinutes: 120,
      firstStopName: 'Palacio Real',
      plan,
    });
    const wordCount = introduction.trim().split(/\s+/).length;

    expect(wordCount).toBeGreaterThanOrEqual(100);
    expect(wordCount).toBeLessThanOrEqual(150);
  });

  it('rejects a welcome repeated at a stop', () => {
    const places = [stop(0, 'Palacio Real', 'corte'), stop(1, 'Plaza Mayor', 'mercado')];
    places[1].description = `Bienvenido otra vez. ${places[1].description}`;
    const result = auditTourText({
      introduction: 'Bienvenido a Madrid. '.repeat(8),
      language: 'es',
      places,
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toContain('welcome_outside_introduction');
    expect(result.affectedStopPositions).toContain(1);
  });

  it('identifies repeated phrases across stops for targeted repair', () => {
    const repeated = 'esta frase concreta vuelve sin aportar nada';
    const places = [stop(0, 'Palacio Real', 'corte'), stop(1, 'Plaza Mayor', 'mercado')];
    places[0].description += ` ${repeated}.`;
    places[1].description += ` ${repeated}.`;
    const result = auditTourText({
      introduction: 'Bienvenido a este recorrido por Madrid. Durante las próximas dos horas seguiremos una pregunta concreta mientras caminamos por siete lugares diferentes. Cada parada aportará una pista propia y un detalle que puedes observar. Empezamos juntos en el primer punto y avanzaremos a tu ritmo hasta completar una respuesta sobre la ciudad y su historia.',
      language: 'es',
      places,
    });

    expect(result.reasons).toContain('repeated_cross_stop_phrase');
    expect(result.affectedStopPositions).toEqual([1]);
  });
});
