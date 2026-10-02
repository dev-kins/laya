import { AvailableMoney } from '../domain/AvailableMoney';
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
import { loadTimeline } from './loadTimeline';

const date = FinancialDate.parse;
const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const salary = Income.create({ id: incomeId('same'), name: 'Synthetic salary', amount: php(450000), date: date('2026-10-04'), status: 'expected', recurrence: Recurrence.monthly(4) });
const expense = EssentialObligation.create({ id: obligationId('same'), name: 'Synthetic WiFi', amount: php(160000), date: date('2026-10-04') });
const debt = Debt.create({ id: debtId('same'), name: 'Synthetic debt', balance: php(900000), scheduledPayment: php(176400), nextDueDate: date('2026-10-04'), interest: { kind: 'unknown' } });
function setup(amount: number | null = 820050) {
  const db: FinancialConnection = { execAsync: jest.fn(), closeAsync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn() };
  const repos = {
    availableMoney: { get: jest.fn<Promise<AvailableMoney | null>, []>().mockResolvedValue(amount === null ? null : AvailableMoney.create({ amount: php(amount) })) },
    debts: { list: jest.fn().mockResolvedValue([debt]) }, incomes: { list: jest.fn().mockResolvedValue([salary]) },
    essentialObligations: { list: jest.fn().mockResolvedValue([expense]) }, debtPayments: { list: jest.fn().mockResolvedValue([]) },
  };
  const deps = { today: jest.fn(() => date('2026-10-02')), open: jest.fn(async () => db), repositories: jest.fn(() => repos),
    generate: jest.fn(generateFinancialEvents), project: jest.fn(projectCashFlow) };
  return { db, repos, deps, run: () => loadTimeline(deps) };
}
test('one snapshot, all five reads once, deterministic names, exact order and intermediate balances', async () => {
  const { run, deps, repos, db } = setup();
  const result = await run();
  expect(result.kind).toBe('ready'); if (result.kind !== 'ready') throw Error('Expected ready');
  expect(result.projection.through.toString()).toBe('2026-12-01');
  expect(result.groups.map(g => g.date.toString())).toEqual(['2026-10-04', '2026-11-04']);
  expect(result.groups[0].entries.map(e => [e.sourceName, e.label, e.balanceAfter.minorUnits])).toEqual([
    ['Synthetic WiFi', 'Essential expense', 660050], ['Synthetic debt', 'Debt due', 483650], ['Synthetic salary', 'Expected income', 933650],
  ]);
  expect(result.groups[1].entries[0].balanceAfter.minorUnits).toBe(1383650);
  expect(result.groups.flatMap(g => g.entries).map(e => e.event)).toEqual(result.projection.points.map(p => p.event));
  expect(deps.today).toHaveBeenCalledTimes(1); expect(deps.open).toHaveBeenCalledTimes(1);
  expect(deps.repositories).toHaveBeenCalledWith(db);
  Object.values(repos).forEach(repo => expect('get' in repo ? repo.get : repo.list).toHaveBeenCalledTimes(1));
  expect(jest.mocked(db.execAsync).mock.calls).toEqual([['BEGIN DEFERRED'], ['COMMIT']]);
  expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('missing never projects; explicit zero really projects negative balances', async () => {
  const missing = setup(null);
  await expect(missing.run()).resolves.toMatchObject({ kind: 'missing-available-money' });
  expect(missing.deps.generate).not.toHaveBeenCalled(); expect(missing.deps.project).not.toHaveBeenCalled();
  const zero = setup(0); const result = await zero.run();
  if (result.kind !== 'ready') throw Error('Expected ready');
  expect(result.projection.start.balance.minorUnits).toBe(0);
  expect(result.groups[0].entries.map(e => e.balanceAfter.minorUnits)).toEqual([-160000, -336400, 113600]);
});
test('actual receipts/payments and start-day forecasts are retained only as exclusions', async () => {
  const { run, repos } = setup();
  repos.incomes.list.mockResolvedValue([Income.create({ ...salary, recurrence: undefined, status: 'received' })]);
  repos.essentialObligations.list.mockResolvedValue([EssentialObligation.create({ ...expense, date: date('2026-10-02') })]);
  repos.debtPayments.list.mockResolvedValue([DebtPayment.create({ id: paymentId('P'), debtId: debt.id, date: date('2026-10-04'), amount: php(100) })]);
  const result = await run(); if (result.kind !== 'ready') throw Error('Expected ready');
  expect(result.groups.flatMap(g => g.entries).map(e => e.event.kind)).toEqual(['debt-due']);
  expect(result.projection.excludedEvents.map(e => [e.event.kind, e.reason])).toEqual([
    ['essential-due', 'outside-window'], ['debt-payment', 'actual-event'], ['received-income', 'actual-event'],
  ]);
});
test('each load captures a fresh injected date, including after a failure', async () => {
  const { run, repos, deps } = setup();
  repos.debts.list.mockRejectedValueOnce(Error('read'));
  await expect(run()).rejects.toThrow('read');
  deps.today.mockReturnValue(date('2026-10-03'));
  const result = await run(); if (result.kind !== 'ready') throw Error('Expected ready');
  expect(result.projection.start.date.toString()).toBe('2026-10-03'); expect(deps.today).toHaveBeenCalledTimes(2);
});
test.each(['availableMoney', 'debts', 'incomes', 'essentialObligations', 'debtPayments'] as const)('%s read failure rolls back and closes', async key => {
  const { run, repos, db } = setup(); const repo = repos[key];
  const failure = Error('synthetic read'); ('get' in repo ? repo.get : repo.list).mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure);
  expect(db.execAsync).toHaveBeenLastCalledWith('ROLLBACK'); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test.each(['generate', 'project', 'repositories'] as const)('%s failure still closes', async key => {
  const { run, deps, db } = setup(); const failure = Error('synthetic operation');
  deps[key].mockImplementation(() => { throw failure; });
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('open/init failure never closes an unowned connection', async () => {
  const { run, deps, db } = setup(); const failure = Error('synthetic open'); deps.open.mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).not.toHaveBeenCalled();
});
test('cleanup failure rejects success and is never retried', async () => {
  const { run, db } = setup(); const failure = Error('synthetic close'); jest.mocked(db.closeAsync).mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure); expect(db.closeAsync).toHaveBeenCalledTimes(1);
});
test('read, rollback and close failures preserve all causes', async () => {
  const { run, repos, db } = setup(); const read = Error('read'), rollback = Error('rollback'), close = Error('close');
  repos.debts.list.mockRejectedValue(read);
  jest.mocked(db.execAsync).mockImplementation(async sql => { if (sql === 'ROLLBACK') throw rollback; });
  jest.mocked(db.closeAsync).mockRejectedValue(close);
  await expect(run()).rejects.toMatchObject({ errors: [{ errors: [read, rollback] }, close] });
});
test.each(['BEGIN DEFERRED', 'COMMIT'])('%s failure closes and only rolls back an active transaction', async statement => {
  const { run, db } = setup();
  jest.mocked(db.execAsync).mockImplementation(async sql => { if (sql === statement) throw Error('transaction'); });
  await expect(run()).rejects.toThrow('transaction'); expect(db.closeAsync).toHaveBeenCalledTimes(1);
  expect(jest.mocked(db.execAsync).mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(statement === 'COMMIT');
});
test('unresolved generated source fails explicitly rather than displaying an ID', async () => {
  const { run, deps } = setup();
  deps.generate.mockImplementation(input => generateFinancialEvents({ ...input, incomes: [Income.create({ ...salary, status: 'expected', id: incomeId('unresolved') })] }));
  await expect(run()).rejects.toThrow('Timeline event source is missing');
});
test('day 60 is included and day 61 is excluded by the real composition', async () => {
  const { run, repos } = setup();
  repos.debts.list.mockResolvedValue([]); repos.essentialObligations.list.mockResolvedValue([]);
  repos.incomes.list.mockResolvedValue([
    Income.create({ ...salary, status: 'expected', recurrence: undefined, date: date('2026-12-01') }),
    Income.create({ ...salary, status: 'expected', recurrence: undefined, id: incomeId('later'), date: date('2026-12-02') }),
  ]);
  const result = await run(); if (result.kind !== 'ready') throw Error('Expected ready');
  expect(result.projection.points.map(p => p.event.date.toString())).toEqual(['2026-12-01']);
});
test('success waits for connection cleanup', async () => {
  const { run, db } = setup();
  let finish!: () => void, entered!: () => void;
  const closing = new Promise<void>(resolve => { entered = resolve; });
  jest.mocked(db.closeAsync).mockImplementation(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
  const completed = jest.fn(); const pending = run().then(completed);
  await closing; expect(completed).not.toHaveBeenCalled();
  finish(); await pending; expect(completed).toHaveBeenCalledTimes(1);
});
