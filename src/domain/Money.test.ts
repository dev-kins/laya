import { Money } from './Money';

const php = (value: number): Money => Money.fromMinorUnits(value, 'PHP');
const max = Number.MAX_SAFE_INTEGER;
const min = Number.MIN_SAFE_INTEGER;

describe('Money', () => {
  test.each([0, 176425, -176425, max, min])('constructs signed safe centavos: %s', (value) => {
    const money = php(value);
    expect(money.minorUnits).toBe(value);
    expect(money.currency).toBe('PHP');
  });

  test('provides zero and normalizes negative zero', () => {
    expect(Money.zero('PHP').equals(php(0))).toBe(true);
    expect(php(-0).minorUnits).toBe(0);
    expect(Money.parse('-0.00', 'PHP').minorUnits).toBe(0);
  });

  test.each([NaN, Infinity, -Infinity, 0.1, -0.1, max + 1, min - 1, '100', null, undefined])(
    'rejects invalid minor units: %s', (value) => {
      expect(() => Money.fromMinorUnits(value, 'PHP')).toThrow(RangeError);
    },
  );

  test.each(['USD', 'php', '', null, undefined])('rejects unsupported currency: %s', (currency) => {
    expect(() => Money.fromMinorUnits(100, currency)).toThrow('Unsupported currency');
    expect(() => Money.parse('1.00', currency)).toThrow('Unsupported currency');
  });

  test.each([
    ['1764.25', 176425], ['1764', 176400], ['0.01', 1], ['0.1', 10],
    ['-1764.25', -176425], ['-0.01', -1], ['  1764.25\t\n', 176425],
    ['001.02', 102], ['0', 0], ['90071992547409.91', max], ['-90071992547409.91', min],
  ])('parses decimal text %s exactly', (text, expected) => {
    expect(Money.parse(text, 'PHP').minorUnits).toBe(expected);
  });

  test.each([
    '', ' ', '.', '-', '+1', '.25', '1.', '1.234', '0.001', '-1.234',
    '1,764.25', '1,76.25', '1 764.25', '1e3', '0x10', 'NaN', 'Infinity',
    'PHP 1.00', '₱1.00', '1..2', '--1', '1\n2', '１.００',
  ])('rejects malformed or overprecise decimal text %s', (text) => {
    expect(() => Money.parse(text, 'PHP')).toThrow(RangeError);
  });

  test.each([1, null, undefined])('rejects non-text decimal input: %s', (value) => {
    expect(() => Money.parse(value, 'PHP')).toThrow(TypeError);
  });

  test.each(['90071992547409.92', '-90071992547409.92', '999999999999999999999999999']) (
    'rejects decimal overflow: %s', (text) => {
      expect(() => Money.parse(text, 'PHP')).toThrow(RangeError);
    },
  );

  test.each([
    [-1, 0, -1], [0, 0, 0], [1, 0, 1], [min, max, -1], [max, min, 1],
  ])('compares %s to %s', (left, right, expected) => {
    expect(php(left).compare(php(right))).toBe(expected);
    expect(php(left).equals(php(right))).toBe(expected === 0);
  });

  test.each([
    [100, 25, 125], [100, -150, -50], [-100, -25, -125], [0, 0, 0],
    [max - 1, 1, max], [min + 1, -1, min], [max, min, 0], [min, 1, min + 1],
  ])('adds %s and %s exactly', (left, right, expected) => {
    expect(php(left).add(php(right)).minorUnits).toBe(expected);
  });

  test.each([
    [100, 25, 75], [100, 150, -50], [-100, -25, -75], [0, 0, 0],
    [max - 1, -1, max], [min + 1, 1, min], [max, max, 0], [min, min, 0],
  ])('subtracts %s minus %s exactly', (left, right, expected) => {
    expect(php(left).subtract(php(right)).minorUnits).toBe(expected);
  });

  test.each([[max, 1], [min, -1], [max, max], [min, min]])(
    'rejects addition overflow: %s plus %s', (left, right) => {
      expect(() => php(left).add(php(right))).toThrow(RangeError);
    },
  );

  test.each([[max, -1], [min, 1], [max, min], [min, max]])(
    'rejects subtraction overflow: %s minus %s', (left, right) => {
      expect(() => php(left).subtract(php(right))).toThrow(RangeError);
    },
  );

  test.each(['add', 'subtract', 'compare', 'equals'] as const)('%s rejects mismatched currency', (operation) => {
    // Simulates an untrusted caller bypassing the TypeScript boundary.
    const foreign = { minorUnits: 100, currency: 'USD' } as unknown as Money;
    expect(() => php(100)[operation](foreign)).toThrow('Currency mismatch');
  });

  test.each(['add', 'subtract', 'compare', 'equals'] as const)('%s validates incoming minor units', (operation) => {
    const invalid = { minorUnits: 0.5, currency: 'PHP' } as unknown as Money;
    expect(() => php(100)[operation](invalid)).toThrow(RangeError);
  });

  test('cannot be mutated and arithmetic preserves both operands', () => {
    const left = php(100);
    const right = php(25);
    expect(Reflect.set(left, 'minorUnits', 999)).toBe(false);
    expect(Reflect.set(left, 'currency', 'USD')).toBe(false);
    expect(left.add(right).minorUnits).toBe(125);
    expect(left.subtract(right).minorUnits).toBe(75);
    expect(left.minorUnits).toBe(100);
    expect(right.minorUnits).toBe(25);
  });
});
