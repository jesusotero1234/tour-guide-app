import { evaluateStopContentReadiness, evaluateTourContentReadiness } from './contentReadiness';

describe('contentReadiness', () => {
  it('rejects obvious one-line fallback narration', () => {
    const result = evaluateStopContentReadiness({ name: 'Puerta del Sol', description: 'Visit Puerta del Sol.' });

    expect(result.ready).toBe(false);
    expect(result.fallbackLike).toBe(true);
    expect(result.reasons).toContain('fallback_like');
  });

  it('rejects multilingual template fragments inside otherwise long narration', () => {
    const description = [
      "You've arrived at Sagrada Família es un heritage en Barcelona. Take in the structure and its immediate surroundings.",
      Array(180).fill('histoire').join(' '),
      'From here, continue toward Hospital de Sant Pau. Notice how the urban landscape shifts around you.',
    ].join('\n\n');

    const result = evaluateStopContentReadiness({ name: 'Sagrada Família', description });

    expect(result.fallbackLike).toBe(true);
    expect(result.reasons).toContain('fallback_like');
  });

  it('accepts a rich multi-paragraph narration', () => {
    const description = [
      'Llegamos a la Plaza Mayor, una de esas escenas urbanas donde la ciudad parece reunirse en capas: soportales, balcones, piedra y un flujo constante de gente cruzando el espacio con ritmos muy distintos según la hora del dia.',
      'Los registros publicos no agotan toda la historia del lugar, pero si permiten entenderlo como una plaza civica de enorme peso en la memoria de Madrid. Su escala y su organizacion ayudan a leer como la ciudad ha usado este vacio central para comercio, ceremonia y vida cotidiana.',
      'En este recorrido importa porque no es solo un monumento para mirar. Es una pieza que conecta movimiento, encuentro y representacion urbana. Antes de seguir, vale la pena observar como todo alrededor parece ordenarse a partir de este espacio abierto.'
    ].join('\n\n');

    const result = evaluateStopContentReadiness({ name: 'Plaza Mayor', description });

    expect(result.ready).toBe(true);
    expect(result.paragraphCount).toBe(3);
    expect(result.wordCount).toBeGreaterThanOrEqual(90);
  });

  it('rejects tours with fallback stops even if other stops are rich', () => {
    const rich = [
      'Llegamos al Museo del Prado y la escala del edificio ya marca el tono de la caminata. La piedra clara, la composicion de la fachada y la secuencia de accesos hacen visible una idea de ciudad que quiso presentarse con autoridad cultural.',
      'La documentacion publica del museo permite hablar con seguridad de su peso institucional y de su papel en la historia artistica de Madrid. No hace falta exagerar para entender que aqui se condensa una parte esencial de la relacion entre coleccion, estado y espacio urbano.',
      'Para este paseo, el Prado importa porque convierte el arte en una forma de leer la ciudad. No es una parada aislada: ayuda a enlazar edificios, paseos y decisiones historicas sobre como Madrid quiso mostrarse al mundo.'
    ].join('\n\n');

    const result = evaluateTourContentReadiness([
      { name: 'Museo del Prado', description: rich },
      { name: 'Puerta del Sol', description: 'Visit Puerta del Sol.' },
      { name: 'Plaza Mayor', description: rich },
    ]);

    expect(result.ready).toBe(false);
    expect(result.fallbackStopCount).toBe(1);
    expect(result.reasons).toContain('fallback_stop_present');
  });
});
