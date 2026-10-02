import { AvailableMoney } from '../domain/AvailableMoney';
import { Debt, type DebtInput } from '../domain/Debt';
import { DebtPayment } from '../domain/DebtPayment';
import { EssentialObligation } from '../domain/EssentialObligation';
import { FinancialDate } from '../domain/FinancialDate';
import { generateFinancialEvents } from '../domain/generateFinancialEvents';
import { debtId, incomeId, obligationId, paymentId } from '../domain/identifiers';
import { Income } from '../domain/Income';
import { Money } from '../domain/Money';
import { projectCashFlow } from '../domain/projectCashFlow';
import { Recurrence } from '../domain/Recurrence';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { loadHome } from './loadHome';
import { loadPlan } from './loadPlan';
import { loadTimeline } from './loadTimeline';

const date = FinancialDate.parse;
const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const debt = (patch: Partial<DebtInput> = {}) => Debt.create({ id: debtId('A'), name: 'Synthetic debt', balance: php(1058478),
  interest: { kind: 'unknown' }, ...patch });
function setup(amount: number | null = null) {
  const db: FinancialConnection = { execAsync: jest.fn(), closeAsync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn() };
  const repos = {
    availableMoney: { get: jest.fn<Promise<AvailableMoney | null>, []>().mockResolvedValue(amount === null ? null : AvailableMoney.create({ amount: php(amount) })) },
    debts: { list: jest.fn<Promise<readonly Debt[]>, []>().mockResolvedValue([]) },
    incomes: { list: jest.fn<Promise<readonly Income[]>, []>().mockResolvedValue([]) },
    essentialObligations: { list: jest.fn<Promise<readonly EssentialObligation[]>, []>().mockResolvedValue([]) },
    debtPayments: { list: jest.fn<Promise<readonly DebtPayment[]>, []>().mockResolvedValue([]) },
  };
  const deps = { today: jest.fn(() => date('2026-10-02')), open: jest.fn(async () => db), repositories: jest.fn(() => repos),
    generate: jest.fn(generateFinancialEvents), project: jest.fn(projectCashFlow) };
  return { db, repos, deps, run: () => loadPlan(deps) };
}
test('no debts is valid without money; one bounded snapshot reads each repository once', async () => {
  const { run, deps, repos, db } = setup(); const result = await run();
  expect(result).toEqual({ startDate: date('2026-10-02'), through: date('2026-12-01'), debts: [], recordedDebtCount: 0,
    totalReportedDebt: php(0), scheduledDueCount: 0, totalScheduledDues: php(0), recordedPaymentCount: 0, context: { kind: 'missing-available-money' } });
  expect(deps.today).toHaveBeenCalledTimes(1); expect(deps.open).toHaveBeenCalledTimes(1);
  expect(deps.repositories).toHaveBeenCalledWith(db); expect(deps.project).not.toHaveBeenCalled();
  Object.values(repos).forEach(repo => expect('get' in repo ? repo.get : repo.list).toHaveBeenCalledTimes(1));
  expect(jest.mocked(db.execAsync).mock.calls).toEqual([['BEGIN DEFERRED'], ['COMMIT']]); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test.each([0, 1, 1058478, Number.MAX_SAFE_INTEGER])('one recorded balance %s is exact and counted, including zero', async amount => {
  const { run, repos } = setup(); const record = debt({ balance: php(amount) }); repos.debts.list.mockResolvedValue([record]);
  const result = await run(); expect(result.totalReportedDebt).toEqual(php(amount)); expect(result.recordedDebtCount).toBe(1);
  expect(result.debts[0]).toBe(record);
});
test('multiple debts retain repository order, unknown and known zero interest; totals ignore payment history', async () => {
  const { run, repos } = setup();
  const records = [debt({ id: debtId('Z'), balance: php(1) }), debt({ id: debtId('A'), balance: php(1058478), interest: { kind: 'known', basisPoints: 0, period: 'monthly' } }), debt({ id: debtId('b'), balance: php(0) })];
  repos.debts.list.mockResolvedValue(records);
  repos.debtPayments.list.mockResolvedValue([
    DebtPayment.create({ id: paymentId('past'), debtId: records[0].id, amount: php(5000000), date: date('2020-01-01') }),
    DebtPayment.create({ id: paymentId('future'), debtId: records[1].id, amount: php(1), date: date('2027-01-01') }),
  ]);
  const result = await run(); expect(result.debts).toEqual(records); expect(result.debts).not.toBe(records);
  expect(result.recordedDebtCount).toBe(3); expect(result.totalReportedDebt).toEqual(php(1058479)); expect(result.recordedPaymentCount).toBe(2);
  expect(result.debts.map(d => d.interest.kind)).toEqual(['unknown', 'known', 'unknown']);
  expect(Object.isFrozen(records)).toBe(false); expect(Object.isFrozen(result.debts)).toBe(true);
});
test('reported total overflow rejects and preserves simultaneous cleanup failure', async () => {
  const { run, repos, db } = setup(); repos.debts.list.mockResolvedValue([debt({ balance: php(Number.MAX_SAFE_INTEGER) }), debt({ id: debtId('B'), balance: php(1) })]);
  const close = Error('close'); jest.mocked(db.closeAsync).mockRejectedValue(close);
  await expect(run()).rejects.toMatchObject({ errors: [expect.objectContaining({ message: 'Money exceeds the safe-integer range.' }), close] });
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test.each([null, 0])('scheduled dues retain exclusive start/inclusive end with available %s', async amount => {
  const { run, repos } = setup(amount);
  repos.debts.list.mockResolvedValue(['2026-10-02', '2026-10-03', '2026-12-01', '2026-12-02'].map((day, index) => debt({ id: debtId(String(index)), balance: php(0), scheduledPayment: php(101), nextDueDate: date(day) })));
  const result = await run(); expect(result.scheduledDueCount).toBe(2); expect(result.totalScheduledDues).toEqual(php(202));
  expect(result.recordedDebtCount).toBe(4);
});
test('only debt-due forecasts count; income, expenses, payments and zero schedules do not', async () => {
  const { run, repos } = setup(820050); const day = date('2026-10-04');
  repos.debts.list.mockResolvedValue([debt({ scheduledPayment: php(176400), nextDueDate: day }), debt({ id: debtId('zero'), scheduledPayment: php(0), nextDueDate: day })]);
  repos.incomes.list.mockResolvedValue([Income.create({ id: incomeId('I'), name: 'Synthetic income', amount: php(450000), date: day, status: 'expected' }),
    Income.create({ id: incomeId('R'), name: 'Synthetic receipt', amount: php(450000), date: day, status: 'received' })]);
  repos.essentialObligations.list.mockResolvedValue([EssentialObligation.create({ id: obligationId('E'), name: 'Synthetic expense', amount: php(160000), date: day })]);
  repos.debtPayments.list.mockResolvedValue([DebtPayment.create({ id: paymentId('P'), debtId: debtId('A'), amount: php(176400), date: day })]);
  const result = await run(); expect(result.scheduledDueCount).toBe(1); expect(result.totalScheduledDues).toEqual(php(176400));
  expect(result.recordedPaymentCount).toBe(1); expect(result.totalReportedDebt).toEqual(php(2116956));
  expect(result.context).toMatchObject({ kind: 'ready', availableMoney: php(820050), lowestProjected: php(483650), endingProjected: php(933650), safeToPay: { amount: php(483650) } });
});
test.each([Recurrence.monthly(31), Recurrence.twiceMonthly(30, 31)])('recurrence inherits exception replacement and February clamping: %s', async recurrence => {
  const { run, deps, repos } = setup(); deps.today.mockReturnValue(date('2026-01-01'));
  repos.debts.list.mockResolvedValue([debt({ nextDueDate: date('2026-01-20'), scheduledPayment: php(101), recurrence })]);
  const result = await run(); const count = recurrence.kind === 'monthly' ? 2 : 3;
  expect(result.through).toEqual(date('2026-03-02')); expect(result.scheduledDueCount).toBe(count);
  expect(result.totalScheduledDues).toEqual(php(count === 2 ? 202 : 303));
  const events: ReturnType<typeof generateFinancialEvents> = deps.generate.mock.results[0].value;
  expect(events.map(e => e.date.toString())).toEqual(count === 2 ? ['2026-01-20', '2026-02-28'] : ['2026-01-20', '2026-02-28', '2026-02-28']);
});
test('scheduled total reaches safe maximum exactly, then rejects excess without clamping', async () => {
  const { run, repos, db } = setup();
  const first = debt({ balance: php(0), scheduledPayment: php(Number.MAX_SAFE_INTEGER), nextDueDate: date('2026-10-03') });
  repos.debts.list.mockResolvedValue([first]); expect((await run()).totalScheduledDues).toEqual(php(Number.MAX_SAFE_INTEGER));
  repos.debts.list.mockResolvedValue([first, debt({ id: debtId('B'), balance: php(0), scheduledPayment: php(1), nextDueDate: date('2026-10-04') })]);
  await expect(run()).rejects.toThrow('Money exceeds the safe-integer range'); expect(db.closeAsync).toHaveBeenCalledTimes(2);
});
test('saved zero builds a negative projection; context agrees with Home and Timeline', async () => {
  const { run, repos, deps } = setup(0); repos.debts.list.mockResolvedValue([debt({ scheduledPayment: php(100), nextDueDate: date('2026-10-04') })]);
  const result = await run(), home = await loadHome(deps), timeline = await loadTimeline(deps);
  if (result.context.kind !== 'ready' || home.kind !== 'ready' || timeline.kind !== 'ready') throw Error('ready');
  expect(result.context.availableMoney).toEqual(php(0)); expect(result.context.safeToPay.amount).toEqual(php(0));
  expect(result.context.lowestProjected).toEqual(php(-100)); expect(result.context.endingProjected).toEqual(php(-100));
  expect(result.context.safeToPay).toEqual(home.safeToPay); expect(result.through).toEqual(timeline.projection.through);
  expect(result.startDate).toEqual(timeline.projection.start.date);
  expect(await run()).toEqual(result); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.context)).toBe(true);
});
test.each(['availableMoney', 'debts', 'incomes', 'essentialObligations', 'debtPayments'] as const)('%s read failure rolls back, preserves error and closes', async key => {
  const { run, repos, db } = setup(); const repo = repos[key], failure = Error('read');
  ('get' in repo ? repo.get : repo.list).mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure); expect(db.execAsync).toHaveBeenLastCalledWith('ROLLBACK'); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('init/open failure does not close an unowned connection; retry captures a fresh date', async () => {
  const { run, deps, db } = setup(); const failure = Error('init'); deps.open.mockRejectedValueOnce(failure);
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).not.toHaveBeenCalled();
  deps.today.mockReturnValue(date('2026-10-03')); expect((await run()).startDate).toEqual(date('2026-10-03')); expect(deps.today).toHaveBeenCalledTimes(2);
});
test('cleanup-only failure rejects success and is not retried', async () => {
  const { run, db } = setup(); const failure = Error('close'); jest.mocked(db.closeAsync).mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('operation, rollback and cleanup failures retain all causes', async () => {
  const { run, repos, db } = setup(); const read = Error('read'), rollback = Error('rollback'), close = Error('close');
  repos.debts.list.mockRejectedValue(read); jest.mocked(db.execAsync).mockImplementation(async sql => { if (sql === 'ROLLBACK') throw rollback; });
  jest.mocked(db.closeAsync).mockRejectedValue(close);
  await expect(run()).rejects.toMatchObject({ errors: [{ errors: [read, rollback] }, close] });
});
test.each(['generate', 'project'] as const)('%s failure still closes', async key => {
  const { run, deps, db } = setup(0); const failure = Error('compose'); deps[key].mockImplementation(() => { throw failure; });
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('result waits for the owned connection to close', async () => {
  const { run, db } = setup(); let finish!: () => void, entered!: () => void;
  const closing = new Promise<void>(resolve => { entered = resolve; });
  jest.mocked(db.closeAsync).mockImplementation(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
  const complete = jest.fn(); const pending = run().then(complete); await closing; expect(complete).not.toHaveBeenCalled();
  finish(); await pending; expect(complete).toHaveBeenCalledTimes(1);
});
