import { Debt, type DebtInput, type Interest } from './Debt';
import { DebtPayment } from './DebtPayment';
import { EssentialObligation } from './EssentialObligation';
import { FinancialDate } from './FinancialDate';
import { Income, type IncomeInput } from './Income';
import { debtId, incomeId, obligationId, paymentId, type DebtId } from './identifiers';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const date = FinancialDate.parse('2026-10-19');
const baseDebt = (): DebtInput => ({ id: debtId('debt-1'), name: 'Sample loan', balance: php(100000), interest: { kind: 'unknown' } });
const baseIncome = () => ({ id: incomeId('income-1'), name: 'Salary', amount: php(490000), date, status: 'expected' as const });
const obligation = (amount = php(160000), recurrence?: Recurrence) => EssentialObligation.create({ id: obligationId('essential-1'), name: 'Internet', amount, date, recurrence });
const payment = (amount = php(10000)) => DebtPayment.create({ id: paymentId('payment-1'), debtId: debtId('debt-1'), amount, date });

describe('Debt', () => {
  test('preserves the reported balance independently of schedule/provider metadata', () => {
    const debt = Debt.create({ ...baseDebt(), name: '  Sample loan  ', provider: '  Sample creditor  ', scheduledPayment: php(176425), nextDueDate: date, recurrence: Recurrence.monthly(20) });
    expect(debt.name).toBe('Sample loan');
    expect(debt.provider).toBe('Sample creditor');
    expect(debt.balance.minorUnits).toBe(100000);
    expect(debt.scheduledPayment?.minorUnits).toBe(176425);
    // A next due date may be an exception to the recurring anchor; no inference or correction.
    expect(debt.nextDueDate?.toString()).toBe('2026-10-19');
    expect(debt.recurrence?.requestedDays).toEqual([20]);
  });
  test.each([0, Number.MAX_SAFE_INTEGER])('allows reported balance %s', (amount) => {
    expect(Debt.create({ ...baseDebt(), balance: php(amount) }).balance.minorUnits).toBe(amount);
  });
  test('rejects a negative balance or scheduled amount', () => {
    expect(() => Debt.create({ ...baseDebt(), balance: php(-1) })).toThrow();
    expect(() => Debt.create({ ...baseDebt(), scheduledPayment: php(-1) })).toThrow();
  });
  test('distinguishes unknown interest, known zero, and exact monthly/annual rates', () => {
    expect(Debt.create(baseDebt()).interest).toEqual({ kind: 'unknown' });
    for (const period of ['monthly', 'annual'] as const) {
      for (const basisPoints of [0, 125, 2400]) {
        expect(Debt.create({ ...baseDebt(), interest: { kind: 'known', basisPoints, period } }).interest)
          .toEqual({ kind: 'known', basisPoints, period });
      }
    }
  });
  test.each([
    null, undefined, { kind: 'none' }, { kind: 'unknown', basisPoints: 0 },
    { kind: 'unknown', period: 'annual' },
    ...[-1, 1.2, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '100', undefined].map((basisPoints) => ({ kind: 'known', basisPoints, period: 'annual' })),
    { kind: 'known', basisPoints: 100, period: 'weekly' },
  ])('rejects malformed/contradictory interest %#', (interest) => {
    expect(() => Debt.create({ ...baseDebt(), interest: interest as Interest })).toThrow();
  });
  test('preserves incomplete schedule information without fabricating defaults', () => {
    const unknown = Debt.create(baseDebt());
    expect(unknown.scheduledPayment).toBeUndefined();
    expect(unknown.nextDueDate).toBeUndefined();
    expect(unknown.recurrence).toBeUndefined();
    const amountOnly = Debt.create({ ...baseDebt(), scheduledPayment: php(0) });
    expect(amountOnly.scheduledPayment?.minorUnits).toBe(0);
    expect(amountOnly.nextDueDate).toBeUndefined();
    expect(Debt.create({ ...baseDebt(), nextDueDate: date }).scheduledPayment).toBeUndefined();
    expect(Debt.create({ ...baseDebt(), recurrence: Recurrence.monthly(31) }).nextDueDate).toBeUndefined();
  });
  test('rejects explicit null optional values', () => {
    for (const field of ['provider', 'scheduledPayment', 'nextDueDate', 'recurrence']) {
      expect(() => Debt.create({ ...baseDebt(), [field]: null })).toThrow();
    }
  });
  test('copies and freezes nested state without freezing or retaining input objects', () => {
    const interest = { kind: 'known' as const, basisPoints: 200, period: 'monthly' as const };
    const input = { ...baseDebt(), interest, recurrence: Recurrence.twiceMonthly(30, 31) };
    const debt = Debt.create(input);
    interest.basisPoints = 999;
    input.name = 'Changed input';
    expect(debt.name).toBe('Sample loan');
    expect(debt.interest).toEqual({ kind: 'known', basisPoints: 200, period: 'monthly' });
    expect(Reflect.set(debt, 'balance', php(0))).toBe(false);
    expect(Reflect.set(debt.balance, 'minorUnits', 0)).toBe(false);
    expect(Reflect.set(debt.interest, 'basisPoints', 0)).toBe(false);
    expect(Reflect.set(debt.recurrence!.requestedDays, '0', 1)).toBe(false);
  });
});

describe('Income and essentials', () => {
  test('expected recurring income is not a receipt', () => {
    const income = Income.create({ ...baseIncome(), status: 'expected', recurrence: Recurrence.twiceMonthly(4, 19) });
    expect(income.status).toBe('expected');
    expect(income.date.equals(date)).toBe(true);
    expect(income.amount.minorUnits).toBe(490000);
    expect(income.recurrence?.requestedDays).toEqual([4, 19]);
  });
  test('received income is a single actual dated receipt', () => {
    const income = Income.create({ ...baseIncome(), status: 'received' });
    expect(income.status).toBe('received');
    expect(income.recurrence).toBeUndefined();
    expect(() => Income.create({ ...baseIncome(), status: 'received', recurrence: Recurrence.monthly(19) } as unknown as IncomeInput)).toThrow('single actual receipt');
    expect(() => Income.create({ ...baseIncome(), status: 'paid' } as unknown as IncomeInput)).toThrow();
  });
  test.each([0, Number.MAX_SAFE_INTEGER])('allows non-negative income and essential amount %s', (amount) => {
    expect(Income.create({ ...baseIncome(), amount: php(amount) }).amount.minorUnits).toBe(amount);
    expect(obligation(php(amount)).amount.minorUnits).toBe(amount);
  });
  test('rejects negative income and essential amounts', () => {
    expect(() => Income.create({ ...baseIncome(), amount: php(-1) })).toThrow();
    expect(() => obligation(php(-1))).toThrow();
  });
  test('one-time and recurring essentials remain non-debt obligations', () => {
    const oneTime = obligation();
    expect(oneTime.recurrence).toBeUndefined();
    expect(oneTime).not.toBeInstanceOf(Debt);
    expect(oneTime.date.toString()).toBe('2026-10-19');
    expect(obligation(php(160000), Recurrence.monthly(20)).recurrence?.requestedDays).toEqual([20]);
  });
});

describe('DebtPayment', () => {
  test.each([1, 5000, 10000, 20000, Number.MAX_SAFE_INTEGER])('retains partial/extra positive historical payment %s', (amount) => {
    const result = payment(php(amount));
    expect(result.amount.minorUnits).toBe(amount);
    expect(result.id).toBe('payment-1');
    expect(result.debtId).toBe('debt-1');
  });
  test('early payment does not mutate debt; history may exceed the current snapshot', () => {
    const debt = Debt.create({ ...baseDebt(), balance: php(0), scheduledPayment: php(10000), nextDueDate: FinancialDate.parse('2026-10-20') });
    const actual = payment(php(20000));
    expect(actual.date.compare(debt.nextDueDate!)).toBe(-1);
    expect(actual.amount.minorUnits).toBe(20000);
    expect(debt.balance.minorUnits).toBe(0);
    expect(debt.scheduledPayment?.minorUnits).toBe(10000);
  });
  test.each([0, -1, Number.MIN_SAFE_INTEGER])('rejects payment %s', (amount) => {
    expect(() => payment(php(amount))).toThrow();
  });
});

describe('shared domain boundaries', () => {
  test.each(['', ' ', '\n', ' padded', 'padded ', 'x'.repeat(129), null, 12])('rejects invalid identifier %#', (id) => {
    for (const parse of [debtId, incomeId, obligationId, paymentId]) expect(() => parse(id)).toThrow();
  });
  test('IDs are supplied serializable strings with distinct TypeScript brands', () => {
    expect(JSON.stringify(debtId('a'))).toBe('"a"');
    expect(debtId('x'.repeat(128))).toHaveLength(128);
    // @ts-expect-error Income IDs cannot accidentally be used as Debt IDs.
    const invalid: DebtId = incomeId('same-text');
    expect(invalid).toBe('same-text'); // Brands intentionally have no runtime payload.
    expect(() => Debt.create({ ...baseDebt(), id: '' as DebtId })).toThrow();
    expect(() => DebtPayment.create({ id: paymentId('p'), debtId: '' as DebtId, amount: php(1), date })).toThrow();
  });
  test.each(['', '\t ', 'x'.repeat(201), null])('rejects invalid names/provider %#', (name) => {
    expect(() => Debt.create({ ...baseDebt(), name: name as string })).toThrow();
    expect(() => Debt.create({ ...baseDebt(), provider: name as string })).toThrow();
    expect(() => Income.create({ ...baseIncome(), name: name as string })).toThrow();
    expect(() => EssentialObligation.create({ id: obligationId('e'), name: name as string, amount: php(0), date })).toThrow();
  });
  test('trims only surrounding name whitespace, preserving internal spelling', () => {
    expect(Debt.create({ ...baseDebt(), name: '  A  B é  ' }).name).toBe('A  B é');
    expect(Debt.create({ ...baseDebt(), name: 'x'.repeat(200) }).name).toHaveLength(200);
  });
  test.each([
    { minorUnits: 1, currency: 'USD' }, { minorUnits: 0.1, currency: 'PHP' },
    { minorUnits: Number.MAX_SAFE_INTEGER + 1, currency: 'PHP' },
  ])('revalidates currency and safe integer values at entity boundaries %#', (fields) => {
    const malformed = Object.create(Money.prototype) as Money;
    Object.defineProperties(malformed, { minorUnits: { value: fields.minorUnits }, currency: { value: fields.currency } });
    expect(() => Debt.create({ ...baseDebt(), balance: malformed })).toThrow();
    expect(() => Debt.create({ ...baseDebt(), scheduledPayment: malformed })).toThrow();
    expect(() => Income.create({ ...baseIncome(), amount: malformed })).toThrow();
    expect(() => obligation(malformed)).toThrow();
    expect(() => payment(malformed)).toThrow();
  });
  test('rejects raw Money/date/schedule substitutes and malformed recurrence', () => {
    expect(() => payment({ minorUnits: 1, currency: 'PHP' } as Money)).toThrow();
    expect(() => Income.create({ ...baseIncome(), date: '2026-10-19' as unknown as FinancialDate })).toThrow();
    expect(() => Debt.create({ ...baseDebt(), recurrence: { kind: 'weekly' } as unknown as Recurrence })).toThrow();
    const malformed = Object.create(Recurrence.prototype) as Recurrence;
    Object.defineProperties(malformed, { kind: { value: 'twice-monthly' }, requestedDays: { value: [4, 4] } });
    expect(() => Debt.create({ ...baseDebt(), recurrence: malformed })).toThrow();
  });
  test('freezes income, essential, payment, and nested calendar/money values', () => {
    for (const entity of [Income.create(baseIncome()), obligation(), payment()]) {
      expect(Object.isFrozen(entity)).toBe(true);
      expect(Reflect.set(entity, 'id', 'changed')).toBe(false);
      expect(Reflect.set(entity.amount, 'minorUnits', 123)).toBe(false);
      expect(Reflect.set(entity.date, 'day', 1)).toBe(false);
    }
  });
  test('construction never reads a clock or generates random identity', () => {
    const clock = jest.spyOn(globalThis, 'Date').mockImplementation(() => { throw new Error('clock'); });
    const random = jest.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random'); });
    try {
      Debt.create(baseDebt()); Income.create(baseIncome()); obligation(); payment();
      expect(clock).not.toHaveBeenCalled(); expect(random).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); random.mockRestore(); }
  });
});
