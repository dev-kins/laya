/** Timezone-free proleptic Gregorian calendar date, limited to years 0001-9999.
 * The future clock/application layer supplies the financial timezone (V1: Asia/Manila).
 */
export class FinancialDate {
  private constructor(
    public readonly year: number,
    public readonly month: number,
    public readonly day: number,
  ) {
    Object.freeze(this);
  }

  static fromParts(year: number, month: number, day: number): FinancialDate {
    const length = FinancialDate.daysInMonth(year, month);
    if (!Number.isInteger(day) || day < 1 || day > length) {
      throw new RangeError('Invalid day for the calendar month.');
    }
    return new FinancialDate(year, month, day);
  }

  /** Gregorian month length; validates the same supported calendar boundaries. */
  static daysInMonth(year: number, month: number): number {
    if (!Number.isInteger(year) || year < 1 || year > 9999) {
      throw new RangeError('Year must be an integer from 1 to 9999.');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError('Month must be an integer from 1 to 12.');
    }
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return monthLengths[month - 1];
  }

  /** Accepts only canonical YYYY-MM-DD, with no whitespace or timestamp suffix. */
  static parse(text: unknown): FinancialDate {
    if (typeof text !== 'string' || text.length !== 10 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) {
      throw new RangeError('Financial date must use YYYY-MM-DD.');
    }
    return FinancialDate.fromParts(Number(text.slice(0, 4)), Number(text.slice(5, 7)), Number(text.slice(8, 10)));
  }

  toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }

  equals(other: FinancialDate): boolean {
    return this.compare(other) === 0;
  }

  compare(other: FinancialDate): -1 | 0 | 1 {
    const validated = FinancialDate.fromParts(other.year, other.month, other.day);
    const left = this.toString();
    const right = validated.toString();
    return left < right ? -1 : left > right ? 1 : 0;
  }
}
