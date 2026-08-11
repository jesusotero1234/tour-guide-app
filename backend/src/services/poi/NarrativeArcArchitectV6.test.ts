import { buildNarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { validateNarrativeArcV6 } from './NarrativeArcArchitectV6';
import candidates from '../../../fixtures/candidates/toledo-history.json';
import oracle from '../../../fixtures/oracle/toledo-history-es-120.json';
import sources from '../../../fixtures/sources/toledo-history-es.json';

describe('narrative v6 arc architect', () => {
  const route = buildNarrativeRouteBriefV6({ candidates, oracle, sources, country: 'España' });

  it('requires one exclusive contribution and bridge for every route stop', () => {
    const arc = validateNarrativeArcV6({
      promise: 'Comprender cómo Toledo reutilizó sus lugares de poder.',
      centralQuestion: '¿Cómo cambió cada espacio?',
      stops: route.stops.map((stop) => ({
        stopId: stop.stopId,
        contribution: `Función exclusiva de ${stop.name}`,
        bridge: stop.nextStopId ? `Prepara ${stop.nextStopId}` : 'Resuelve la pregunta central',
      })),
    }, route, route.stops.map((stop) => ({ stopId: stop.stopId } as NarrativeDossierV6)));

    expect(arc.stops).toHaveLength(6);
    expect(() => validateNarrativeArcV6({
      ...arc, stops: arc.stops.slice(1),
    }, route, route.stops.map((stop) => ({ stopId: stop.stopId } as NarrativeDossierV6))))
      .toThrow('arc must cover every route stop exactly once');
  });
});
