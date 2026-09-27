import { AvailableMoney } from './AvailableMoney';
import { Money } from './Money';

test.each([['0', 0], ['8200', 820000], ['8200.5', 820050], ['8200.50', 820050], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])
('available money preserves exact %s', (text, expected) => {
  const amount = Money.parse(String(text), 'PHP');
  const snapshot = AvailableMoney.create({ amount });
  expect(snapshot.amount.minorUnits).toBe(expected);
  expect(snapshot.amount.currency).toBe('PHP');
  expect(snapshot.amount).not.toBe(amount);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.amount)).toBe(true);
  expect(() => Object.assign(snapshot, { amount: Money.zero('PHP') })).toThrow();
});
test('negative and structurally similar non-Money inputs are rejected', () => {
  expect(() => AvailableMoney.create({ amount: Money.fromMinorUnits(-1, 'PHP') })).toThrow();
  expect(() => AvailableMoney.create({ amount: { minorUnits: 1, currency: 'PHP' } as Money })).toThrow('Amount must be Money');
});
test.each([{ minorUnits: Number.MAX_SAFE_INTEGER + 1 }, { currency: 'USD' }])('forged Money is revalidated %#', patch => {
  const amount = Object.assign(Object.create(Money.prototype), { minorUnits: 1, currency: 'PHP' }, patch) as Money;
  expect(() => AvailableMoney.create({ amount })).toThrow();
});
