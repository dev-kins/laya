import { FinancialDate } from '../domain/FinancialDate';
import { calendarDate } from '../domain/modelValidation';

/** The only Timeline clock boundary. Never convert a local date through UTC. */
export function deviceLocalFinancialDate(): FinancialDate {
  const now = new Date();
  return FinancialDate.fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Fixed product horizon, using calendar parts rather than elapsed milliseconds. */
export function timelineThrough(start: FinancialDate): FinancialDate {
  let current = calendarDate(start);
  for (let day = 0; day < 60; day++) {
    const { year, month } = current;
    current = current.day < FinancialDate.daysInMonth(year, month)
      ? FinancialDate.fromParts(year, month, current.day + 1)
      : month < 12 ? FinancialDate.fromParts(year, month + 1, 1)
        : FinancialDate.fromParts(year + 1, 1, 1);
  }
  return current;
}
