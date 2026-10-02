import { calculateSafeToPay, type SafeToPayResult } from '../domain/calculateSafeToPay';
import type { Money } from '../domain/Money';
import { loadTimeline, type TimelineEntry, type TimelineResult } from './loadTimeline';

export type HomeResult = Extract<TimelineResult, { kind: 'missing-available-money' }> | Readonly<{
  kind: 'ready';
  safeToPay: SafeToPayResult;
  availableMoney: Money;
  nextEvent: TimelineEntry | null;
  lowestProjected: Money;
  endingProjected: Money;
}>;

/** Reuse the bounded Timeline composition unchanged, then derive Home's summary.
 * Its overrides include the injected local date provider and repository boundary.
 */
export async function loadHome(overrides: Parameters<typeof loadTimeline>[0] = {}): Promise<HomeResult> {
  const timeline = await loadTimeline(overrides);
  if (timeline.kind === 'missing-available-money') return timeline;
  const { projection } = timeline;
  return Object.freeze({
    kind: 'ready',
    safeToPay: calculateSafeToPay(projection),
    availableMoney: projection.start.balance,
    // Timeline groups preserve exact projection order and already resolve names.
    nextEvent: timeline.groups[0]?.entries[0] ?? null,
    lowestProjected: projection.minimumProjectedBalance,
    endingProjected: projection.endingBalance,
  });
}
