import { Debt, type DebtInput, type Interest } from './Debt';
import { FinancialDate } from './FinancialDate';
import { debtId } from './identifiers';
import { Money } from './Money';
import { orderDebtsForStrategy, type DebtStrategy } from './orderDebtsForStrategy';
import { Recurrence } from './Recurrence';

const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const known = (basisPoints: number, period: 'monthly' | 'annual' = 'annual'): Interest => ({ kind: 'known', basisPoints, period });
const debt = (id: string, balance: number, interest: Interest = { kind: 'unknown' }, patch: Partial<DebtInput> = {}) =>
  Debt.create({ id: debtId(id), name: 'Synthetic debt', balance: php(balance), interest, ...patch });
const ids = (strategy: DebtStrategy, debts: readonly Debt[]) => orderDebtsForStrategy({ strategy, debts }).orderedDebts.map(d => d.id);
function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]));
}

describe.each(['snowball', 'avalanche'] as const)('%s shared contract', strategy => {
  test('empty result is frozen and retains the selected strategy', () => {
    const result = orderDebtsForStrategy({ strategy, debts: [] });
    expect(result).toEqual({ strategy, orderedDebts: [] });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.orderedDebts)).toBe(true);
  });
  test.each([0, 1, Number.MAX_SAFE_INTEGER])('single balance %s retains the original Debt instance', balance => {
    const record = debt('only', balance, known(0, 'monthly'));
    expect(orderDebtsForStrategy({ strategy, debts: [record] }).orderedDebts[0]).toBe(record);
  });
  test.each(['same instance', 'different instance'])('duplicate identity rejects: %s', mode => {
    const first = debt('same', 100);
    expect(() => ids(strategy, [first, mode === 'same instance' ? first : debt('same', 200, known(300))])).toThrow('Duplicate debt identity');
  });
  test.each([null, undefined, {}, { id: 'raw', balance: 100 }])('rejects non-Debt entry %# even alone', entry => {
    expect(() => ids(strategy, [entry as unknown as Debt])).toThrow('Strategy entries must be Debt instances');
  });
  test('preserves caller array and entity references, freezes only owned result, repeats deterministically', () => {
    const a = debt('a', 10, known(200, 'monthly')), b = debt('b', 20, known(100));
    const input = [b, a], before = [...input]; const serialized = JSON.stringify(input);
    const result = orderDebtsForStrategy({ strategy, debts: input });
    expect(result.orderedDebts).toEqual([a, b]); expect(result.orderedDebts[0]).toBe(a);
    expect(result.orderedDebts).not.toBe(input); expect(input).toEqual(before);
    expect(JSON.stringify(input)).toBe(serialized); expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.orderedDebts)).toBe(true);
    expect(Reflect.set(result, 'strategy', 'invalid')).toBe(false);
    expect(Reflect.set(result.orderedDebts, '0', b)).toBe(false);
    expect(orderDebtsForStrategy({ strategy, debts: Object.freeze(input) })).toEqual(result);
  });
  test('ties use case-sensitive UTF-16 ID ordering, independent of locale and input position', () => {
    const records = ['é', 'a', 'Z', 'A'].map(id => debt(id, 100, known(100)));
    for (const permutation of permutations(records)) expect(ids(strategy, permutation)).toEqual(['A', 'Z', 'a', 'é']);
  });
  test('names, providers, dates, scheduled amounts and recurrence cannot break ties', () => {
    const a = debt('a', 100, known(100), { name: 'Zulu', provider: 'Zulu', scheduledPayment: php(999),
      nextDueDate: FinancialDate.parse('2099-12-31'), recurrence: Recurrence.monthly(31) });
    const b = debt('b', 100, known(100), { name: 'Alpha', provider: 'Alpha', scheduledPayment: php(0),
      nextDueDate: FinancialDate.parse('2000-01-01'), recurrence: Recurrence.twiceMonthly(4, 19) });
    expect(ids(strategy, [b, a])).toEqual(['a', 'b']);
  });
});

test.each(['', 'adaptive', 'Snowball', null, undefined, 1])('invalid strategy rejects explicitly %#', strategy => {
  expect(() => orderDebtsForStrategy({ strategy: strategy as DebtStrategy, debts: [] })).toThrow('Invalid debt strategy');
});

test('Snowball sorts reported balances exactly, including centavos, zero and safe-integer neighbors', () => {
  const records = [debt('max', Number.MAX_SAFE_INTEGER), debt('lower-max', Number.MAX_SAFE_INTEGER - 1),
    debt('A', 800000), debt('B', 150000), debt('C', 400000), debt('cent', 1), debt('zero', 0), debt('cent2', 2)];
  expect(ids('snowball', records)).toEqual(['zero', 'cent', 'cent2', 'B', 'C', 'A', 'lower-max', 'max']);
});
test('Snowball ignores known, unknown and mixed-period interest even for tied balances', () => {
  const records = [debt('c', 100, known(Number.MAX_SAFE_INTEGER, 'monthly')), debt('b', 100, known(0)), debt('a', 100), debt('d', 99)];
  for (const permutation of permutations(records)) expect(ids('snowball', permutation)).toEqual(['d', 'a', 'b', 'c']);
});
test('Avalanche puts all known rates before unknown, with known zero ahead of unknown zero balance', () => {
  const records = [debt('unknown', 0), debt('known-zero', 100, known(0)), debt('annual', 50, known(1800)), debt('monthly', 200, known(200, 'monthly'))];
  for (const permutation of permutations(records)) expect(ids('avalanche', permutation)).toEqual(['monthly', 'annual', 'known-zero', 'unknown']);
});
test('Avalanche unknown debts use balance then ID, including zero', () => {
  const records = [debt('b', 1), debt('large', 2), debt('a', 1), debt('zero', 0)];
  for (const permutation of permutations(records)) expect(ids('avalanche', permutation)).toEqual(['zero', 'a', 'b', 'large']);
});
test.each([0, 100])('equal normalized rates %s monthly use balance then ID across periods', monthly => {
  const records = [debt('b', 10, known(monthly, 'monthly')), debt('a', 10, known(monthly * 12)),
    debt('large', 11, known(monthly * 12)), debt('zero', 0, known(monthly, 'monthly'))];
  for (const permutation of permutations(records)) expect(ids('avalanche', permutation)).toEqual(['zero', 'a', 'b', 'large']);
});
test('Avalanche compares exact basis-point differences without compounding', () => {
  expect(ids('avalanche', [debt('monthly', 0, known(100, 'monthly')), debt('annual-lower', 0, known(1199)),
    debt('annual-higher', 100, known(1201))])).toEqual(['annual-higher', 'monthly', 'annual-lower']);
});
test('Avalanche retains exact monthly ordering beyond safe number intermediates', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(ids('avalanche', [debt('a-lower', 0, known(max - 1, 'monthly')), debt('z-higher', max, known(max, 'monthly'))]))
    .toEqual(['z-higher', 'a-lower']);
});
test('Avalanche compares annual maximum against monthly rates straddling the safe product boundary', () => {
  // floor(MAX_SAFE_INTEGER / 12) = 750599937895082; its product is MAX - 7.
  const records = [debt('below', 0, known(750599937895082, 'monthly')),
    debt('annual', 0, known(Number.MAX_SAFE_INTEGER)), debt('above', 100, known(750599937895083, 'monthly'))];
  for (const permutation of permutations(records)) expect(ids('avalanche', permutation)).toEqual(['above', 'annual', 'below']);
});
test('Avalanche compares neighboring annual safe-integer rates exactly', () => {
  expect(ids('avalanche', [debt('a', 0, known(Number.MAX_SAFE_INTEGER - 1)), debt('z', 1, known(Number.MAX_SAFE_INTEGER))])).toEqual(['z', 'a']);
});
test('equal mixed-period rates near the safe boundary still fall through to balance and ID', () => {
  expect(ids('avalanche', [debt('b', 1, known(750599937895082, 'monthly')),
    debt('a', 1, known(9007199254740984)), debt('zero', 0, known(9007199254740984))])).toEqual(['zero', 'a', 'b']);
});
test('ordering reads no clock, random source or locale comparator', () => {
  const records = [debt('b', 10, known(100, 'monthly')), debt('a', 10, known(1200))];
  const clock = jest.spyOn(globalThis, 'Date').mockImplementation(() => { throw Error('clock'); });
  const random = jest.spyOn(Math, 'random').mockImplementation(() => { throw Error('random'); });
  const locale = jest.spyOn(String.prototype, 'localeCompare').mockImplementation(() => { throw Error('locale'); });
  try {
    expect(ids('snowball', records)).toEqual(['a', 'b']);
    expect(ids('avalanche', records)).toEqual(['a', 'b']);
    expect(clock).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled(); expect(locale).not.toHaveBeenCalled();
  } finally { clock.mockRestore(); random.mockRestore(); locale.mockRestore(); }
});
