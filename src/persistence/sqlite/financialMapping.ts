import { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import { Recurrence } from '../../domain/Recurrence';
import type { SqlValue } from './connection';

// Persistence-internal rows are untrusted, regardless of driver generic types.
export type FinancialRow = Record<string, unknown>;

/** Only source-controlled column names may be passed here. Guard in SQLite,
 * BEFORE the bridge converts 64-bit integers to JavaScript numbers. The text
 * sentinel distinguishes invalid values from legitimate optional SQL NULLs.
 */
export function guardedInteger(column: string, minimum: 0 | 1 = 0): string {
  return `CASE WHEN ${column} IS NULL THEN NULL
    WHEN typeof(${column}) = 'integer' AND ${column} BETWEEN ${minimum} AND 9007199254740991
    THEN ${column} ELSE 'invalid-integer' END AS ${column}`;
}

export const recurrenceSelection = `recurrence_kind,
  ${guardedInteger('recurrence_day_1')}, ${guardedInteger('recurrence_day_2')}`;

export function storedName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new TypeError('Invalid stored name.');
  }
  return value; // Entity factory enforces nonempty and maximum length.
}

export function storedMoney(value: unknown, currency: unknown): Money {
  return Money.fromMinorUnits(value, currency);
}

export function storedDate(value: unknown): FinancialDate {
  return FinancialDate.parse(value);
}

export function storedRecurrence(row: FinancialRow): Recurrence | undefined {
  const kind = row.recurrence_kind;
  const first = row.recurrence_day_1;
  const second = row.recurrence_day_2;
  if (kind === null && first === null && second === null) return undefined;
  if (kind === 'monthly' && second === null) return Recurrence.monthly(first);
  // Do not let the domain factory sort corrupt storage into a valid rule.
  if (kind === 'twice-monthly' && typeof first === 'number' && typeof second === 'number' && first < second) {
    return Recurrence.twiceMonthly(first, second);
  }
  throw new TypeError('Invalid stored recurrence.');
}

export function recurrenceValues(value: Recurrence | undefined): readonly SqlValue[] {
  return value === undefined ? [null, null, null]
    : [value.kind, value.requestedDays[0], value.requestedDays[1] ?? null];
}
