import {
  NarrativeConcurrencyV6,
  NarrativeModelProfileNameV6,
  resolveNarrativeModelProfileV6,
} from './NarrativeModelProfilesV6';

export class NarrativeSemaphoreV6 {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('narrative semaphore limit must be a positive integer');
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

export interface NarrativeSchedulerV6 {
  readonly profile: NarrativeModelProfileNameV6;
  readonly limits: NarrativeConcurrencyV6;
  researchStop<T>(task: () => Promise<T>): Promise<T>;
  search<T>(task: () => Promise<T>): Promise<T>;
  capture<T>(task: () => Promise<T>): Promise<T>;
  curate<T>(task: () => Promise<T>): Promise<T>;
  editorialStop<T>(task: () => Promise<T>): Promise<T>;
  write<T>(task: () => Promise<T>): Promise<T>;
  auditStop<T>(task: () => Promise<T>): Promise<T>;
  adjudicate<T>(task: () => Promise<T>): Promise<T>;
  globalAudit<T>(task: () => Promise<T>): Promise<T>;
}

export function createNarrativeSchedulerV6(
  profileName?: NarrativeModelProfileNameV6 | string
): NarrativeSchedulerV6 {
  const profile = resolveNarrativeModelProfileV6(profileName);
  const limits = profile.concurrency;
  const semaphores = {
    researchStop: new NarrativeSemaphoreV6(limits.researchStops),
    search: new NarrativeSemaphoreV6(limits.searches),
    capture: new NarrativeSemaphoreV6(limits.captures),
    curate: new NarrativeSemaphoreV6(limits.curations),
    editorialStop: new NarrativeSemaphoreV6(limits.editorialStops),
    write: new NarrativeSemaphoreV6(limits.writers),
    auditStop: new NarrativeSemaphoreV6(limits.auditStops),
    adjudicate: new NarrativeSemaphoreV6(limits.adjudications),
    globalAudit: new NarrativeSemaphoreV6(limits.globalAudits),
  };
  return {
    profile: profile.name,
    limits,
    researchStop: (task) => semaphores.researchStop.run(task),
    search: (task) => semaphores.search.run(task),
    capture: (task) => semaphores.capture.run(task),
    curate: (task) => semaphores.curate.run(task),
    editorialStop: (task) => semaphores.editorialStop.run(task),
    write: (task) => semaphores.write.run(task),
    auditStop: (task) => semaphores.auditStop.run(task),
    adjudicate: (task) => semaphores.adjudicate.run(task),
    globalAudit: (task) => semaphores.globalAudit.run(task),
  };
}
