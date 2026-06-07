'use client';

import { TourConcept } from '@/types/api';

interface ConceptPickerProps {
  concepts: TourConcept[];
  selectedConceptSlug: string | null;
  onSelect: (concept: TourConcept) => void;
}

const routeTypeLabels: Record<TourConcept['routeType'], string> = {
  historical: 'Historia urbana',
  architecture: 'Arquitectura',
  royal: 'Ruta real',
  religious: 'Madrid sagrado',
  markets: 'Vida local',
  literature: 'Literature',
  art: 'Arte y museos',
  general: 'Imprescindibles',
};

const confidenceLabels: Record<TourConcept['confidence'], string> = {
  high: 'Best route',
  medium: 'Ready concept',
  low: 'Experimental',
};

export function ConceptPicker({ concepts, selectedConceptSlug, onSelect }: ConceptPickerProps) {
  if (concepts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-mutedGold">
          Recommended experiences
        </p>
        <p className="mt-2 text-sm leading-6 text-darkBrown/75">
          Choose the kind of audio walk you want. We will build the route, narration, and audio around it.
        </p>
      </div>
      <div className="grid gap-3">
        {concepts.map((concept) => {
          const selected = selectedConceptSlug === concept.slug;
          return (
            <button
              key={concept.slug}
              type="button"
              onClick={() => onSelect(concept)}
              className={`rounded-2xl border p-4 text-left transition-colors ${selected ? 'border-darkBrown bg-darkBrown text-surface' : 'border-darkBrown/12 bg-surface hover:border-darkBrown/30'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={`text-xs font-medium uppercase tracking-[0.18em] ${selected ? 'text-mutedGold/90' : 'text-mutedGold'}`}>
                    {routeTypeLabels[concept.routeType]}
                  </p>
                  <h4 className={`mt-2 text-lg font-serif font-semibold ${selected ? 'text-surface' : 'text-darkBrown'}`}>
                    {concept.title}
                  </h4>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${selected ? 'border border-surface/15 bg-surface/10 text-surface' : 'border border-darkBrown/12 bg-surface-elevated text-darkBrown/70'}`}>
                  {confidenceLabels[concept.confidence]}
                </span>
              </div>
              <p className={`mt-3 text-sm leading-6 ${selected ? 'text-surface/85' : 'text-darkBrown/75'}`}>
                {concept.angle}
              </p>
              <div className={`mt-3 flex flex-wrap gap-2 text-xs ${selected ? 'text-surface/80' : 'text-darkBrown/70'}`}>
                <span className={`rounded-full px-3 py-1 ${selected ? 'border border-surface/15 bg-surface/10' : 'border border-darkBrown/12 bg-surface-elevated'}`}>
                  {concept.estimatedStops} stops
                </span>
                <span className={`rounded-full px-3 py-1 ${selected ? 'border border-surface/15 bg-surface/10' : 'border border-darkBrown/12 bg-surface-elevated'}`}>
                  {Math.round(concept.suggestedDurationMinutes / 60)}h suggested
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
