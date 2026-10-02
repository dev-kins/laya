import { AvailableMoney } from '../domain/AvailableMoney';
import { calculateSafeToPay } from '../domain/calculateSafeToPay';
import { Debt } from '../domain/Debt';
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
import { loadTimeline } from './loadTimeline';

const date = FinancialDate.parse;
const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const income = Income.create({ id: incomeId('same'), name: 'Synthetic salary', amount: php(450000), date: date('2026-10-04'), status: 'expected' });
const expense = EssentialObligation.create({ id: obligationId('same'), name: 'Synthetic WiFi', amount: php(160000), date: date('2026-10-04') });
const debt = Debt.create({ id: debtId('same'), name: 'Synthetic debt', balance: php(1000000), scheduledPayment: php(176400), nextDueDate: date('2026-10-04'), interest: { kind: 'unknown' } });
function setup(amount: number | null = 820050) {
  const db: FinancialConnection = { execAsync: jest.fn(), closeAsync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn() };
  const repos = {
    availableMoney: { get: jest.fn<Promise<AvailableMoney | null>, []>().mockResolvedValue(amount === null ? null : AvailableMoney.create({ amount: php(amount) })) },
    debts: { list: jest.fn<Promise<readonly Debt[]>, []>().mockResolvedValue([debt]) },
    incomes: { list: jest.fn<Promise<readonly Income[]>, []>().mockResolvedValue([income]) },
    essentialObligations: { list: jest.fn<Promise<readonly EssentialObligation[]>, []>().mockResolvedValue([expense]) },
    debtPayments: { list: jest.fn<Promise<readonly DebtPayment[]>, []>().mockResolvedValue([]) },
  };
  const deps = { today: jest.fn(() => date('2026-10-02')), open: jest.fn(async () => db), repositories: jest.fn(() => repos),
    generate: jest.fn(generateFinancialEvents), project: jest.fn(projectCashFlow) };
  return { db, repos, deps, run: () => loadHome(deps) };
}
test('one snapshot composes mixed data, resolves next name, and exposes exact projection and Safe-to-Pay', async () => {
  const { run, deps, repos, db } = setup(); const result = await run();
  if (result.kind !== 'ready') throw Error('ready');
  expect(result.availableMoney).toEqual(php(820050));
  expect(result.safeToPay.amount).toEqual(php(483650));
  expect(result.lowestProjected).toEqual(php(483650)); expect(result.endingProjected).toEqual(php(933650));
  expect(result.nextEvent?.sourceName).toBe('Synthetic WiFi'); expect(result.nextEvent?.label).toBe('Essential expense');
  const projection = deps.project.mock.results[0].value;
  expect(result.safeToPay).toEqual(calculateSafeToPay(projection));
  expect(result.nextEvent?.event).toBe(projection.points[0].event);
  expect(result.safeToPay.protectionStartDate).toEqual(date('2026-10-02'));
  expect(result.safeToPay.protectionThroughDate).toEqual(date('2026-12-01'));
  expect(deps.today).toHaveBeenCalledTimes(1); expect(deps.open).toHaveBeenCalledTimes(1);
  expect(deps.repositories).toHaveBeenCalledWith(db);
  Object.values(repos).forEach(repo => expect('get' in repo ? repo.get : repo.list).toHaveBeenCalledTimes(1));
  expect(jest.mocked(db.execAsync).mock.calls).toEqual([['BEGIN DEFERRED'], ['COMMIT']]);
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('missing Available Money produces setup without a projection or Safe-to-Pay', async () => {
  const { run, deps } = setup(null);
  expect(await run()).toEqual({ kind: 'missing-available-money', startDate: date('2026-10-02'), through: date('2026-12-01') });
  expect(deps.generate).not.toHaveBeenCalled(); expect(deps.project).not.toHaveBeenCalled();
});
test.each([0, 100000])('saved %s produces a real negative minimum and zero Safe-to-Pay', async amount => {
  const { run } = setup(amount); const result = await run(); if (result.kind !== 'ready') throw Error('ready');
  expect(result.availableMoney).toEqual(php(amount)); expect(result.safeToPay.amount).toEqual(php(0));
  expect(result.lowestProjected.minorUnits).toBe(amount - 336400); expect(result.endingProjected.minorUnits).toBe(amount + 113600);
});
test.each(['income', 'expense', 'debt'] as const)('first %s resolves its name from the matching source map', async kind => {
  const { run, repos } = setup();
  if (kind !== 'income') repos.incomes.list.mockResolvedValue([]);
  if (kind !== 'expense') repos.essentialObligations.list.mockResolvedValue([]);
  if (kind !== 'debt') repos.debts.list.mockResolvedValue([]);
  const result = await run(); if (result.kind !== 'ready') throw Error('ready');
  expect(result.nextEvent?.sourceName).toBe(kind === 'income' ? income.name : kind === 'expense' ? expense.name : debt.name);
  expect(result.nextEvent?.event.direction).toBe(kind === 'income' ? 'inflow' : 'outflow');
});
test('no forecasts retains Available Money for all summary values', async () => {
  const { run, repos } = setup(); repos.incomes.list.mockResolvedValue([]); repos.debts.list.mockResolvedValue([]); repos.essentialObligations.list.mockResolvedValue([]);
  const result = await run(); if (result.kind !== 'ready') throw Error('ready');
  expect(result.nextEvent).toBeNull();
  expect([result.safeToPay.amount, result.lowestProjected, result.endingProjected]).toEqual([php(820050), php(820050), php(820050)]);
});
test('recurrence and horizon agree with Timeline; repeated loads are deterministic and immutable', async () => {
  const { run, repos, deps } = setup();
  repos.incomes.list.mockResolvedValue([Income.create({ ...income, status: 'expected', recurrence: Recurrence.monthly(4) })]);
  const result = await run(); expect(await run()).toEqual(result);
  const timeline = await loadTimeline(deps); if (result.kind !== 'ready' || timeline.kind !== 'ready') throw Error('ready');
  expect(result.endingProjected).toEqual(php(1383650));
  expect(result.safeToPay.protectionStartDate).toEqual(timeline.projection.start.date);
  expect(result.safeToPay.protectionThroughDate).toEqual(timeline.projection.through);
  expect(result.nextEvent).toEqual(timeline.groups[0].entries[0]);
  expect(Object.isFrozen(result)).toBe(true);
});
test('actuals and start-day forecasts cannot become next or affect the summary', async () => {
  const { run, repos } = setup();
  repos.essentialObligations.list.mockResolvedValue([EssentialObligation.create({ ...expense, date: date('2026-10-02') })]);
  repos.incomes.list.mockResolvedValue([Income.create({ ...income, recurrence: undefined, status: 'received', date: date('2026-10-03') })]);
  repos.debtPayments.list.mockResolvedValue([DebtPayment.create({ id: paymentId('P'), debtId: debt.id, amount: php(176400), date: date('2026-10-03') })]);
  const result = await run(); if (result.kind !== 'ready') throw Error('ready');
  expect(result.nextEvent?.event.kind).toBe('debt-due');
  expect(result.safeToPay.amount).toEqual(php(643650)); expect(result.endingProjected).toEqual(php(643650));
});
test.each(['availableMoney', 'debts', 'incomes', 'essentialObligations', 'debtPayments'] as const)('%s failure rolls back and closes', async key => {
  const { run, repos, db } = setup(); const failure = Error('synthetic read'); const repo = repos[key];
  ('get' in repo ? repo.get : repo.list).mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure);
  expect(db.execAsync).toHaveBeenLastCalledWith('ROLLBACK'); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('open/init failure never attempts an unowned close', async () => {
  const { run, deps, db } = setup(); const failure = Error('open'); deps.open.mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).not.toHaveBeenCalled();
});
test('cleanup-only failure rejects; read plus cleanup retains both causes', async () => {
  const first = setup(); const close = Error('close'), read = Error('read');
  jest.mocked(first.db.closeAsync).mockRejectedValue(close); await expect(first.run()).rejects.toBe(close);
  expect(first.db.closeAsync).toHaveBeenCalledTimes(1);
  const second = setup(); second.repos.debts.list.mockRejectedValue(read); jest.mocked(second.db.closeAsync).mockRejectedValue(close);
  await expect(second.run()).rejects.toMatchObject({ errors: [read, close] }); expect(second.db.closeAsync).toHaveBeenCalledTimes(1);
});
test.each(['generate', 'project'] as const)('%s failure closes and propagates', async key => {
  const { run, deps, db } = setup(); const failure = Error('composition'); deps[key].mockImplementation(() => { throw failure; });
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('unresolved source rejects even for an applied event after the first', async () => {
  const { run, deps } = setup();
  deps.generate.mockImplementation(input => generateFinancialEvents({ ...input, incomes: [Income.create({ ...income, status: 'expected', id: incomeId('unknown') })] }));
  await expect(run()).rejects.toThrow('Timeline event source is missing');
});
test('retry captures a fresh date and awaits cleanup before returning', async () => {
  const { run, deps, db } = setup(); deps.open.mockRejectedValueOnce(Error('open')); await expect(run()).rejects.toThrow('open');
  deps.today.mockReturnValue(date('2026-10-03'));
  let finish!: () => void, entered!: () => void;
  const closing = new Promise<void>(resolve => { entered = resolve; });
  jest.mocked(db.closeAsync).mockImplementation(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
  const complete = jest.fn(); const pending = run().then(complete); await closing; expect(complete).not.toHaveBeenCalled();
  finish(); await pending; expect(complete.mock.calls[0][0].safeToPay.protectionStartDate).toEqual(date('2026-10-03'));
  expect(deps.today).toHaveBeenCalledTimes(2);
});
