import { createHash } from 'crypto';
import { CoreAuditCandidateV6 } from './EditorialCoreResolverV6';
import { EditorialProviderV6, EditorialRequestOptionsV6, requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';
import { RouteRecoveryProposalV8, RouteScopeVoteV8, RoutePlanningDecisionV8 } from './NarrativeRoutePlanningV8';

const PROMPT = `Review measured alternatives for an exterior historical walking tour.
The original city core was too long. You may approve ONE supplied compact scope or reject all.
Preserve every protected identity. Never substitute a nearby identity or claim an interior visit.
Judge historical coherence, distinct chapters, observable exterior stops and first-visit value,
not walking time alone. All times and proposed identities are fixed measured inputs.
For every original required identity omitted from the selected route, explain the historical
chapter left outside this scope and cite that requirement's supplied supportIds.
Use proposalId=null and omissions=[] if no scope is editorially sufficient.
Return only the requested JSON object; no new stops, invented facts or administrative boundaries.`;

export async function reviewNarrativeRouteScopesV8(
  input: { core: RoutePlanningDecisionV8['cityCore']; protectedIds: string[]; proposals: RouteRecoveryProposalV8[] },
  evidence: CoreAuditCandidateV6[], provider: EditorialProviderV6, options: EditorialRequestOptionsV6,
  save: (seed: string, value: unknown) => void,
): Promise<RouteScopeVoteV8[]> {
  const schema = {
    type: 'object', additionalProperties: false, required: ['proposalId', 'reason', 'omissions'],
    properties: {
      proposalId: { anyOf: [{ type: 'string', enum: input.proposals.map(p => p.id) }, { type: 'null' }] },
      reason: { type: 'string' },
      omissions: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['canonicalId', 'reason', 'supportIds'],
        properties: { canonicalId: { type: 'string' }, reason: { type: 'string' },
          supportIds: { type: 'array', items: { type: 'string' } } },
      } },
    },
  };
  const votes: RouteScopeVoteV8[] = [];
  for (const seed of ['scope-a', 'scope-b', 'scope-c']) {
    options.signal?.throwIfAborted();
    const hash = (id: string) => createHash('sha256').update(seed + ':' + id).digest('hex');
    const proposals = [...input.proposals].sort((a, b) => hash(a.id).localeCompare(hash(b.id)));
    const ids = new Set(proposals.flatMap(p => p.plan.geometry.stops.map(s => s.stopId)));
    const request = { city: input.core.cityKey, theme: input.core.theme,
      requestedMinutes: input.core.durationMinutes, originalRequirements: input.core.requirements,
      protectedIds: input.protectedIds, candidates: evidence.filter(e => ids.has(e.canonicalId)),
      proposals: proposals.map(p => ({ id: p.id, scope: p.scope, requiredIds: p.requiredIds,
        stops: p.plan.geometry.stops.map(s => ({ id: s.stopId, name: s.name })),
        minutes: p.plan.geometry.guidedDurationMinutes, legs: p.plan.geometry.legs })),
    };
    const result = await requestEditorialStructuredV6({
      callId: 'route-scope:' + seed, input: request, provider,
      options: { ...options, phase: 'route_scope', maxTokens: 8192, requestAttempts: 2 },
      systemPrompt: PROMPT, schema, toolName: 'submit_route_scope_v8',
      toolDescription: 'Approve a measured historical walking scope or reject all alternatives.',
      inputCharacterLimit: 36_000, schemaCharacterLimit: 8_000,
      validate: value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('scope vote object required');
        const vote = value as RouteScopeVoteV8;
        if (!vote.reason?.trim() || !Array.isArray(vote.omissions)) throw new Error('scope vote explanation required');
        const selected = proposals.find(p => p.id === vote.proposalId);
        if (vote.proposalId === null) {
          if (vote.omissions.length) throw new Error('rejection cannot omit identities');
          return vote;
        }
        if (!selected) throw new Error('unknown scope proposal');
        const selectedIds = new Set(selected.plan.geometry.stops.map(s => s.stopId));
        const omitted = input.core.requirements.filter(r => !selectedIds.has(r.canonicalId));
        if (vote.omissions.length !== omitted.length || new Set(vote.omissions.map(o => o.canonicalId)).size !== omitted.length) {
          throw new Error('scope must explain every omitted requirement exactly once');
        }
        for (const omission of vote.omissions) {
          const original = omitted.find(r => r.canonicalId === omission.canonicalId);
          if (!original || input.protectedIds.includes(omission.canonicalId) || !omission.reason?.trim()
            || !Array.isArray(omission.supportIds) || !omission.supportIds.length
            || omission.supportIds.some(id => !original.supportIds.includes(id))) throw new Error('invalid omission evidence');
        }
        return vote;
      },
    });
    save(seed, result);
    if (!result.value || result.status !== 'valid') throw new Error('route_scope_review_incomplete: ' + result.status);
    votes.push(result.value);
  }
  return votes;
}
