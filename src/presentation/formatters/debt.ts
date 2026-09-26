import type { Interest } from '../../domain/Debt';
import type { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import type { Recurrence } from '../../domain/Recurrence';

/** Display-only decimal placement. Never divide money/rates using floating point. */
function hundredths(integer: number): { whole: string; fraction: string } {
  const digits = String(integer).padStart(3, '0');
  return { whole: digits.slice(0, -2), fraction: digits.slice(-2) };
}

export function formatPHP(money: Money): string {
  const { minorUnits } = Money.fromMinorUnits(money.minorUnits, money.currency);
  const negative = minorUnits < 0;
  const { whole, fraction } = hundredths(negative ? -minorUnits : minorUnits);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}₱${grouped}.${fraction}`;
}

export function formatInterest(interest: Interest): string {
  if (interest.kind === 'unknown') return 'Interest rate not entered';
  if (!Number.isSafeInteger(interest.basisPoints) || interest.basisPoints < 0) throw new RangeError('Invalid interest rate.');
  const { whole, fraction } = hundredths(interest.basisPoints);
  const significantFraction = fraction.replace(/0+$/, '');
  const percentage = whole + (significantFraction ? `.${significantFraction}` : '');
  return `${percentage}% ${interest.period === 'annual' ? 'annually' : 'monthly'}`;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatFinancialDate(date: FinancialDate): string {
  return `${months[date.month - 1]} ${date.day}, ${String(date.year).padStart(4, '0')}`;
}

export function formatRecurrence(recurrence: Recurrence): string {
  const days = recurrence.requestedDays;
  const label = recurrence.kind === 'monthly' ? `Monthly on day ${days[0]}`
    : `Twice monthly on days ${days[0]} and ${days[1]}`;
  if (!days.some(day => day > 28)) return label;
  return `${label}. ${recurrence.kind === 'monthly'
    ? 'Uses the last day in shorter months.'
    : 'Each missing day uses the last day in shorter months; both scheduled days are retained.'}`;
}
