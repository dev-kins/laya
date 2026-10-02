import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../App';
import { createAddDebtOperation } from '../src/application/addDebt';
import { readAvailableMoney } from '../src/application/availableMoney';
import { listDebts } from '../src/application/listDebts';
import { loadPlan, type PlanResult } from '../src/application/loadPlan';
import { loadTimeline } from '../src/application/loadTimeline';
import { onboardingService } from '../src/application/onboarding';
import { calculateSafeToPay } from '../src/domain/calculateSafeToPay';
import { Debt } from '../src/domain/Debt';
import { FinancialDate } from '../src/domain/FinancialDate';
import { generateFinancialEvents } from '../src/domain/generateFinancialEvents';
import { debtId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import { projectCashFlow } from '../src/domain/projectCashFlow';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/loadHome');
jest.mock('../src/application/loadPlan');
jest.mock('../src/application/loadTimeline', () => ({ loadTimeline: jest.fn() }));
jest.mock('../src/application/listDebts', () => ({ listDebts: jest.fn() }));
jest.mock('../src/application/availableMoney', () => ({ readAvailableMoney: jest.fn() }));
jest.mock('../src/application/addDebt', () => ({ createAddDebtOperation: jest.fn() }));
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
const read = jest.mocked(loadPlan);
const date = FinancialDate.parse;
const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const first = Debt.create({ id: debtId('A'), name: 'Synthetic loan', provider: 'Synthetic provider', balance: php(100050),
  scheduledPayment: php(10000), nextDueDate: date('2026-10-04'), interest: { kind: 'unknown' } });
const zero = Debt.create({ id: debtId('B'), name: 'Synthetic zero loan', balance: php(0), interest: { kind: 'known', basisPoints: 0, period: 'annual' } });
const startDate = date('2026-10-02'), through = date('2026-12-01');
function fixture(amount: number | null = null, debts: readonly Debt[] = [first, zero]): PlanResult {
  const events = generateFinancialEvents({ from: startDate, through, debts, incomes: [], essentialObligations: [], debtPayments: [] });
  const projection = amount === null ? null : projectCashFlow({ startingBalance: php(amount), startDate, through, events });
  return { startDate, through, debts, recordedDebtCount: debts.length, totalReportedDebt: debts.length ? php(100050) : php(0),
    recordedPaymentCount: debts.length ? 2 : 0, scheduledDueCount: events.length, totalScheduledDues: events.length ? php(10000) : php(0),
    context: projection ? { kind: 'ready', availableMoney: projection.start.balance, safeToPay: calculateSafeToPay(projection),
      lowestProjected: projection.minimumProjectedBalance, endingProjected: projection.endingBalance } : { kind: 'missing-available-money' } };
}
function deferred() {
  let resolve!: (value: PlanResult) => void, reject!: (error: Error) => void;
  const promise = new Promise<PlanResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.useFakeTimers(); read.mockReset().mockResolvedValue(fixture());
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
  jest.mocked(loadTimeline).mockReset().mockResolvedValue({ kind: 'missing-available-money', startDate, through });
  jest.mocked(readAvailableMoney).mockResolvedValue(null);
  jest.mocked(listDebts).mockResolvedValue([first, zero]);
  jest.mocked(createAddDebtOperation).mockReturnValue(jest.fn().mockResolvedValue(first));
});
afterEach(async () => { await act(async () => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); });
async function open() { await render(<App />); await fireEvent.press(screen.getByRole('tab', { name: 'Plan' })); }

test('loading has no zero/empty flash; no debts opens Add Debt and saving/refocus refreshes Plan', async () => {
  const pending = deferred(); read.mockReturnValueOnce(pending.promise); await open();
  expect(screen.getByText('Building your planning overview…')).toBeOnTheScreen();
  expect(screen.queryByText('₱0.00')).toBeNull(); expect(screen.queryByText('No debts recorded yet.')).toBeNull();
  await act(async () => pending.resolve(fixture(null, [])));
  expect(screen.getByText('No debts recorded yet.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Debt picture. Total reported debt: 0.00 Philippine pesos. Recorded debts: 0.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Add debt' }));
  expect(screen.getByRole('header', { name: 'Add a debt' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Debt name'), first.name);
  await fireEvent.changeText(screen.getByLabelText('Current balance (PHP)'), '1000.50');
  await fireEvent.press(screen.getByRole('radio', { name: 'I don’t know the rate' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(screen.getByRole('header', { name: 'Utang saved' })).toBeOnTheScreen();
  read.mockResolvedValueOnce(fixture(null, [first]));
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  expect(screen.getByText(first.name)).toBeOnTheScreen(); expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Recorded debts · 1')).toBeOnTheScreen();
});
test('missing money leaves multiple debts, totals, schedule, interest and payment facts visible', async () => {
  await open();
  expect(screen.getByLabelText('Debt picture. Total reported debt: 1,000.50 Philippine pesos. Recorded debts: 2.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Scheduled debt dues. 100.00 Philippine pesos.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Scheduled debt-due events: 1.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Recorded payment records: 2.')).toBeOnTheScreen();
  expect(screen.getByText('Interest rate not entered')).toBeOnTheScreen(); expect(screen.getByText('0% annually')).toBeOnTheScreen();
  expect(screen.getAllByLabelText(/Current reported balance:/).map(row => row.props.accessibilityLabel)).toEqual([
    'Synthetic loan. Provider: Synthetic provider. Current reported balance: 1,000.50 Philippine pesos. Interest: Interest rate not entered.',
    'Synthetic zero loan. Current reported balance: 0.00 Philippine pesos. Interest: 0% annually.',
  ]);
  expect(screen.getByText('₱0.00')).toBeOnTheScreen(); expect(screen.queryByText('Safe-to-Pay')).toBeNull();
  expect(screen.getByText('Your recorded debts are available for a future payoff plan.')).toBeOnTheScreen();
  expect(screen.queryByText(/^(Snowball|Avalanche|Laya Adaptive|Recommended|Paid off|Priority)$/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Set available money' }));
  expect(screen.getByRole('header', { name: 'Available money' })).toBeOnTheScreen();
});
test.each([0, 20000])('saved Available Money %s has factual context, signed minimum and no setup', async amount => {
  read.mockResolvedValue(fixture(amount)); await open();
  expect(screen.queryByRole('button', { name: 'Set available money' })).toBeNull();
  expect(screen.getByLabelText(`Available now. ${amount === 0 ? '0.00' : '200.00'} Philippine pesos.`)).toBeOnTheScreen();
  expect(screen.getByLabelText(`Safe-to-Pay. ${amount === 0 ? '0.00' : '100.00'} Philippine pesos.`)).toBeOnTheScreen();
  expect(screen.getByLabelText(`Lowest projected. ${amount === 0 ? 'minus ' : ''}100.00 Philippine pesos.`)).toBeOnTheScreen();
  expect(screen.getByLabelText(`Ending projected. ${amount === 0 ? 'minus ' : ''}100.00 Philippine pesos.`)).toBeOnTheScreen();
  if (amount === 0) expect(screen.getAllByText('-₱100.00')).toHaveLength(2);
  expect(screen.queryByText(/^(Covered|Tight|At risk|Unsafe)$/)).toBeNull();
});
test('View debts opens the existing overview, and Timeline action opens its existing tab', async () => {
  await open(); await fireEvent.press(screen.getByRole('button', { name: 'View debts' }));
  expect(screen.getByRole('header', { name: 'Mga Utang' })).toBeOnTheScreen();
  expect(listDebts).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  await fireEvent.press(screen.getByRole('button', { name: 'View timeline' }));
  expect(screen.getByRole('tab', { name: 'Timeline', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Timeline' })).toBeOnTheScreen(); expect(loadTimeline).toHaveBeenCalledTimes(1);
});
test('generic error hides detail and Retry starts a fresh loading state', async () => {
  read.mockRejectedValueOnce(Error('SELECT private synthetic path')); await open();
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t build your planning overview from the data on this device. Please try again.');
  expect(screen.queryByText(/SELECT/)).toBeNull(); expect(screen.queryByText('Total reported debt')).toBeNull();
  const retry = deferred(); read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText('Building your planning overview…')).toBeOnTheScreen();
  await act(async () => retry.resolve(fixture())); expect(screen.getByText(first.name)).toBeOnTheScreen(); expect(read).toHaveBeenCalledTimes(2);
});
test.each(['success', 'failure'])('refocus clears stale facts and ignores late %s', async outcome => {
  await open(); await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  const old = deferred(); read.mockReturnValueOnce(old.promise); await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  expect(screen.queryByText(first.name)).toBeNull(); expect(screen.queryByText('Total reported debt')).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' })); read.mockResolvedValueOnce(fixture(null, []));
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  await act(async () => { if (outcome === 'success') old.resolve(fixture()); else old.reject(Error('late')); });
  expect(screen.getByText('No debts recorded yet.')).toBeOnTheScreen(); expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(first.name)).toBeNull(); expect(read).toHaveBeenCalledTimes(3);
});
test('long debt/provider names and exact maximum total remain scalable and untruncated', async () => {
  const name = 'Synthetic loan '.repeat(12).trim(), provider = 'Synthetic provider '.repeat(10).trim();
  const record = Debt.create({ ...first, name, provider, balance: php(Number.MAX_SAFE_INTEGER) });
  read.mockResolvedValue({ ...fixture(null, [record]), totalReportedDebt: record.balance }); await open();
  for (const value of [name, provider, '₱90,071,992,547,409.91']) for (const text of screen.getAllByText(value)) {
    expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.allowFontScaling).not.toBe(false);
  }
  expect(screen.getByLabelText(/^Debt picture. Total reported debt: 90,071,992,547,409.91 Philippine pesos/)).toBeOnTheScreen();
});
