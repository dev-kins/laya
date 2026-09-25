import { FinancialDate } from './FinancialDate';

export interface Occurrence {
  readonly date: FinancialDate;
  readonly requestedDay: number;
}

type RequestedDays = readonly [number] | readonly [number, number];

function validateDay(day: unknown): asserts day is number {
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError('Requested day must be an integer from 1 to 31.');
  }
}

/** V1 calendar schedules only. Requested days are anchors, never clamped in place. */
export class Recurrence {
  private constructor(
    public readonly kind: 'monthly' | 'twice-monthly',
    public readonly requestedDays: RequestedDays,
  ) {
    Object.freeze(requestedDays);
    Object.freeze(this);
  }

  static monthly(day: unknown): Recurrence {
    validateDay(day);
    return new Recurrence('monthly', [day]);
  }

  static twiceMonthly(first: unknown, second: unknown): Recurrence {
    validateDay(first);
    validateDay(second);
    if (first === second) throw new RangeError('Twice-monthly requested days must be distinct.');
    return new Recurrence('twice-monthly', first < second ? [first, second] : [second, first]);
  }

  /** Inclusive range. Clamp independently each month; same-date collisions remain
   * distinct and ordered by requested day. No clock, timezone, or random identity.
   */
  occurrences(from: FinancialDate, through: FinancialDate): readonly Occurrence[] {
    const start = FinancialDate.fromParts(from.year, from.month, from.day);
    const end = FinancialDate.fromParts(through.year, through.month, through.day);
    if (start.compare(end) > 0) throw new RangeError('Range start must not be after its end.');

    const firstMonth = (start.year - 1) * 12 + start.month - 1;
    const lastMonth = (end.year - 1) * 12 + end.month - 1;
    const result: Occurrence[] = [];
    // Bounded by the supported calendar, without constructing a date past 9999.
    for (let index = firstMonth; index <= lastMonth; index += 1) {
      const year = Math.floor(index / 12) + 1;
      const month = index % 12 + 1;
      const length = FinancialDate.daysInMonth(year, month);
      for (const requestedDay of this.requestedDays) {
        const date = FinancialDate.fromParts(year, month, Math.min(requestedDay, length));
        if (date.compare(start) >= 0 && date.compare(end) <= 0) {
          result.push(Object.freeze({ date, requestedDay }));
        }
      }
    }
    return Object.freeze(result);
  }
}
