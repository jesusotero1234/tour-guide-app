import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import { analyzeNarrativeTourStyleV8, buildNarrativeMechanicalStyleAuditIssuesV8 } from './NarrativeTourStyleV8';

function script(stopId: string, sentences: string[]): NarrativeScriptV6 {
  const narrativeSentences = sentences.map((text, index) => ({
    sentenceId: `${stopId}-sentence-${index + 1}`,
    stopId,
    index,
    text,
  }));
  return {
    stopId,
    text: sentences.join(' '),
    sentences: narrativeSentences,
    fingerprint: stopId.padEnd(64, '0').slice(0, 64),
  };
}

describe('NarrativeTourStyleV8', () => {
  it('flags cloned openings and known abstractions repeated across stops', () => {
    const report = analyzeNarrativeTourStyleV8([
      script('stop-a', [
        'Observa ahora la fachada y sus capas históricas.',
        'No solo muestra poder: ayuda a entender la transformación de la memoria urbana.',
      ]),
      script('stop-b', [
        'Observa ahora la fachada y sus capas de piedra.',
        'No solo ordena la plaza: ayuda a entender la transformación de la memoria colectiva.',
      ]),
    ]);

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'repeated_opening', classification: 'mechanical_repetition' }),
      expect.objectContaining({ category: 'overused_abstraction', phrase: 'capas' }),
      expect.objectContaining({ category: 'overused_abstraction', phrase: 'memoria' }),
      expect.objectContaining({ category: 'overused_abstraction', phrase: 'transformación' }),
      expect.objectContaining({ category: 'overused_abstraction', phrase: 'ayuda a entender' }),
      expect.objectContaining({ category: 'overused_abstraction', phrase: 'no solo' }),
    ]));
  });

  it('records an explicitly allowed recurring motif without failing publication style', () => {
    const report = analyzeNarrativeTourStyleV8([
      script('stop-a', ['Aquí la memoria conserva una huella obrera diferente.']),
      script('stop-b', ['En esta plaza la memoria introduce el conflicto político.']),
    ], {
      intentionalMotifs: ['memoria'],
    });

    expect(report.passed).toBe(true);
    expect(report.issues).toContainEqual(expect.objectContaining({
      category: 'overused_abstraction',
      phrase: 'memoria',
      classification: 'intentional_motif',
    }));
  });

  it('does not treat repeated capitalized place names as accidental n-gram repetition', () => {
    const report = analyzeNarrativeTourStyleV8([
      script('stop-a', ['Desde el arco aparece la Plaza Mayor de Madrid, escenario de ceremonias públicas.']),
      script('stop-b', ['Al terminar el mercado dejamos atrás la Plaza Mayor de Madrid y avanzamos al palacio.']),
    ]);

    expect(report.issues.filter((issue) => issue.category === 'repeated_ngram')).toEqual([]);
  });

  it('reports duplicated arc contributions separately from prose repetition', () => {
    const report = analyzeNarrativeTourStyleV8([
      script('stop-a', ['Primera escena única.']),
      script('stop-b', ['Segunda escena diferente.']),
      script('stop-c', ['Tercera escena singular.']),
    ], {
      contributionsByStopId: {
        'stop-a': 'Explica el origen del poder real.',
        'stop-b': 'Explica el origen del poder real.',
        'stop-c': 'Contrasta el poder civil con el religioso.',
      },
    });

    expect(report.contributions.distinct).toBe(false);
    expect(report.contributions.duplicates).toEqual([
      {
        contribution: 'Explica el origen del poder real.',
        stopIds: ['stop-a', 'stop-b'],
      },
    ]);
    expect(report.passed).toBe(false);
  });

  it('converts deterministic mechanical style findings into localized tour-audit issues', () => {
    const scripts = [
      script('stop-a', [
        'Observa ahora la fachada y sus capas históricas.',
        'No solo muestra poder: ayuda a entender la transformación de la memoria urbana.',
      ]),
      script('stop-b', [
        'Observa ahora la fachada y sus capas de piedra.',
        'No solo ordena la plaza: ayuda a entender la transformación de la memoria colectiva.',
      ]),
    ];
    const report = analyzeNarrativeTourStyleV8(scripts);
    const issues = buildNarrativeMechanicalStyleAuditIssuesV8(scripts, report);

    const mechanicalIssue = issues.find((issue) => issue.issueId.startsWith('mechanical-style:'));
    expect(mechanicalIssue).toBeDefined();
    expect(mechanicalIssue?.severity).toBe('soft');
    expect(mechanicalIssue?.classification).toBe('mechanical_repetition');
    expect(mechanicalIssue?.stopId).toBe('stop-b');
    expect(mechanicalIssue?.sentenceId).toBe('stop-b-sentence-1');
    expect(mechanicalIssue?.phrase).toBe('observa ahora la fachada');

    const intentionalMotifScripts = [
      script('stop-a', ['Aquí la memoria conserva una huella obrera diferente.']),
      script('stop-b', ['En esta plaza la memoria introduce el conflicto político.']),
    ];
    const intentionalReport = analyzeNarrativeTourStyleV8(intentionalMotifScripts, {
      intentionalMotifs: ['memoria'],
    });
    const intentionalIssues = buildNarrativeMechanicalStyleAuditIssuesV8(intentionalMotifScripts, intentionalReport);
    expect(intentionalIssues).toEqual([]);
  });
});
