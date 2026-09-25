export type Currency = 'PHP';

const MAX_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

function validateCurrency(currency: unknown): asserts currency is Currency {
  if (currency !== 'PHP') {
    throw new RangeError('Unsupported currency.');
  }
}

function validateMinorUnits(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new RangeError('Minor units must be a safe integer.');
  }
}

/** Signed PHP centavos. All instances are immutable, including at runtime. */
export class Money {
  private constructor(
    public readonly minorUnits: number,
    public readonly currency: Currency,
  ) {
    Object.freeze(this);
  }

  static fromMinorUnits(minorUnits: unknown, currency: unknown): Money {
    validateCurrency(currency);
    validateMinorUnits(minorUnits);
    return new Money(minorUnits === 0 ? 0 : minorUnits, currency);
  }

  static zero(currency: Currency): Money {
    return Money.fromMinorUnits(0, currency);
  }

  /** Trims whitespace; accepts minus and leading zeros, but no grouping or rounding. */
  static parse(text: unknown, currency: unknown): Money {
    validateCurrency(currency);
    if (typeof text !== 'string') {
      throw new TypeError('Decimal input must be text.');
    }
    const input = text.trim();
    if (!/^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(input)) {
      throw new RangeError('Invalid decimal input.');
    }
    const negative = input.startsWith('-');
    const unsigned = negative ? input.slice(1) : input;
    const [whole, fraction = ''] = unsigned.split('.');
    const magnitude = BigInt(whole + fraction.padEnd(2, '0'));
    return Money.fromExactMinorUnits(negative ? -magnitude : magnitude, currency);
  }

  private static fromExactMinorUnits(value: bigint, currency: Currency): Money {
    if (value < -MAX_MINOR_UNITS || value > MAX_MINOR_UNITS) {
      throw new RangeError('Money exceeds the safe-integer range.');
    }
    return Money.fromMinorUnits(Number(value), currency);
  }

  private validateOperand(other: Money): void {
    if (other.currency !== this.currency) {
      throw new RangeError('Currency mismatch.');
    }
    validateCurrency(other.currency);
    validateMinorUnits(other.minorUnits);
  }

  equals(other: Money): boolean {
    return this.compare(other) === 0;
  }

  compare(other: Money): -1 | 0 | 1 {
    this.validateOperand(other);
    return this.minorUnits < other.minorUnits ? -1 : this.minorUnits > other.minorUnits ? 1 : 0;
  }

  add(other: Money): Money {
    this.validateOperand(other);
    return Money.fromExactMinorUnits(BigInt(this.minorUnits) + BigInt(other.minorUnits), this.currency);
  }

  subtract(other: Money): Money {
    this.validateOperand(other);
    return Money.fromExactMinorUnits(BigInt(this.minorUnits) - BigInt(other.minorUnits), this.currency);
  }
}
