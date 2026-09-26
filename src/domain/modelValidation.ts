import { FinancialDate } from './FinancialDate';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

export function nameText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 200) {
    throw new RangeError('Name must contain 1-200 characters after trimming.');
  }
  return value.trim();
}

export function nonNegativeMoney(value: Money): Money {
  if (!(value instanceof Money)) throw new TypeError('Amount must be Money.');
  const copy = Money.fromMinorUnits(value.minorUnits, value.currency);
  if (copy.minorUnits < 0) throw new RangeError('Amount must not be negative.');
  return copy;
}

export function calendarDate(value: FinancialDate): FinancialDate {
  if (!(value instanceof FinancialDate)) throw new TypeError('Date must be FinancialDate.');
  return FinancialDate.fromParts(value.year, value.month, value.day);
}

export function scheduleRule(value: Recurrence): Recurrence {
  if (!(value instanceof Recurrence)) throw new TypeError('Schedule must be Recurrence.');
  if (value.kind === 'monthly' && value.requestedDays.length === 1) return Recurrence.monthly(value.requestedDays[0]);
  if (value.kind === 'twice-monthly' && value.requestedDays.length === 2 && value.requestedDays[0] < value.requestedDays[1]) {
    return Recurrence.twiceMonthly(value.requestedDays[0], value.requestedDays[1]);
  }
  throw new RangeError('Invalid recurrence representation.');
}
