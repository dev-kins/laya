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
import { composePlanStrategies } from '../src/application/composePlanStrategies';

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
  const safeToPay = projection ? calculateSafeToPay(projection) : null;
  return { startDate, through, debts, recordedDebtCount: debts.length, totalReportedDebt: debts.reduce((total, debt) => total.add(debt.balance), php(0)),
    recordedPaymentCount: debts.length ? 2 : 0, scheduledDueCount: events.length, totalScheduledDues: events.reduce((total, event) => total.add(event.amount), php(0)),
    context: projection && safeToPay ? { kind: 'ready', availableMoney: projection.start.balance, safeToPay, strategies: composePlanStrategies(debts, safeToPay),
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
  expect(screen.getByText('Set Available Money to calculate Safe-to-Pay and explore strategy allocations. Your recorded debt facts remain available.')).toBeOnTheScreen();
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

const scenarioDebts = [
  Debt.create({ id: debtId('A'), name: 'Synthetic A', balance: php(150001), interest: { kind: 'known', basisPoints: 500, period: 'annual' } }),
  Debt.create({ id: debtId('B'), name: 'Synthetic B', balance: php(800000), interest: { kind: 'known', basisPoints: 200, period: 'monthly' } }),
  Debt.create({ id: debtId('C'), name: 'Synthetic C', balance: php(400000), interest: { kind: 'known', basisPoints: 1800, period: 'annual' } }),
];
const allocationLabels = () => screen.queryAllByLabelText(/^Proposed allocation for /).map(row => row.props.accessibilityLabel);
test('defaults to Adaptive and switches through all three explanations/allocations without loading again', async () => {
  read.mockResolvedValue(fixture(300001, scenarioDebts)); await open();
  expect(screen.getByRole('radio', { name: 'Laya Adaptive', checked: true })).toBeOnTheScreen();
  expect(screen.getByText('First identifies positive reported balances that individually fit within the current Safe-to-Pay amount, then uses Avalanche ordering for the remaining debts.')).toBeOnTheScreen();
  expect(screen.getByText('Protection window: Oct 2, 2026 through Dec 1, 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText('Safe-to-Pay. 3,000.01 Philippine pesos.')).toBeOnTheScreen();
  expect(allocationLabels()).toEqual([
    'Proposed allocation for Synthetic A. Reported balance: 1,500.01 Philippine pesos. Proposed extra amount: 1,500.01 Philippine pesos. Full coverage of reported balance.',
    'Proposed allocation for Synthetic B. Reported balance: 8,000.00 Philippine pesos. Proposed extra amount: 1,500.00 Philippine pesos. Partial coverage of reported balance.',
  ]);
  expect(screen.getByLabelText('1. Synthetic A. Fits within current Safe-to-Pay.')).toBeOnTheScreen();
  expect(screen.getByLabelText('2. Synthetic B. Remaining debts in Avalanche order.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Total proposed allocation. 3,000.01 Philippine pesos.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Unallocated Safe-to-Pay. 0.00 Philippine pesos.')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Snowball' }));
  expect(screen.getByRole('radio', { name: 'Snowball', checked: true })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Laya Adaptive', checked: false })).toBeOnTheScreen();
  expect(screen.getByText('Orders recorded debts from smaller reported balance to larger reported balance.')).toBeOnTheScreen();
  expect(allocationLabels()[1]).toContain('Synthetic C.');
  await fireEvent.press(screen.getByRole('radio', { name: 'Avalanche' }));
  expect(screen.getByRole('radio', { name: 'Avalanche', checked: true })).toBeOnTheScreen();
  expect(screen.getByText('Orders known interest rates from higher nominal annualized comparison rate to lower, then places unknown rates after known rates.')).toBeOnTheScreen();
  expect(allocationLabels()).toEqual(['Proposed allocation for Synthetic B. Reported balance: 8,000.00 Philippine pesos. Proposed extra amount: 3,000.01 Philippine pesos. Partial coverage of reported balance.']);
  await fireEvent.press(screen.getByRole('radio', { name: 'Laya Adaptive' }));
  expect(screen.getByRole('radio', { name: 'Laya Adaptive', checked: true })).toBeOnTheScreen();
  expect(allocationLabels()).toHaveLength(2); expect(allocationLabels()[0]).toContain('Synthetic A.');
  expect(read).toHaveBeenCalledTimes(1); expect(screen.queryByText('Building your planning overview…')).toBeNull();
  for (const name of ['Pay', 'Confirm payment', 'Mark as paid', 'Apply allocation', 'Save allocation']) expect(screen.queryByRole('button', { name })).toBeNull();
});
test('real zero capacity keeps all strategy controls and zero totals without allocation cards', async () => {
  read.mockResolvedValue(fixture(0, scenarioDebts)); await open();
  for (const name of ['Snowball', 'Avalanche', 'Laya Adaptive']) {
    await fireEvent.press(screen.getByRole('radio', { name }));
    expect(screen.getByRole('radio', { name, checked: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('Total proposed allocation. 0.00 Philippine pesos.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Unallocated Safe-to-Pay. 0.00 Philippine pesos.')).toBeOnTheScreen();
    expect(screen.getByText('₱0.00 is available under the current protection window. No extra allocation is proposed.')).toBeOnTheScreen();
    expect(allocationLabels()).toEqual([]);
  }
  expect(read).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: 'Set available money' })).toBeNull();
});
test.each([true, false])('empty=%s preserves unallocated capacity and does not fabricate zero allocation cards', async empty => {
  read.mockResolvedValue(fixture(200000, empty ? [] : [first, zero])); await open();
  expect(screen.getByLabelText(`Unallocated Safe-to-Pay. ${empty ? '2,000.00' : '899.50'} Philippine pesos.`)).toBeOnTheScreen();
  expect(allocationLabels()).toHaveLength(empty ? 0 : 1);
  expect(allocationLabels().some(label => label.includes(zero.name))).toBe(false);
  if (empty) expect(screen.getByText('Add a debt to explore proposed allocations.')).toBeOnTheScreen();
  else expect(screen.getByText('Full coverage of reported balance')).toBeOnTheScreen();
});
test.each(['success', 'failure'])('focus refresh replaces scenarios and ignores stale %s after selection changes', async outcome => {
  read.mockResolvedValue(fixture(300001, scenarioDebts)); await open();
  await fireEvent.press(screen.getByRole('radio', { name: 'Avalanche' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  const old = deferred(); read.mockReturnValueOnce(old.promise);
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  expect(allocationLabels()).toEqual([]); expect(screen.queryByRole('radio', { name: 'Avalanche' })).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' })); read.mockResolvedValueOnce(fixture(0, scenarioDebts));
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  expect(screen.getByRole('radio', { name: 'Avalanche', checked: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Snowball' }));
  await act(async () => { if (outcome === 'success') old.resolve(fixture(300001, scenarioDebts)); else old.reject(Error('late')); });
  expect(screen.getByRole('radio', { name: 'Snowball', checked: true })).toBeOnTheScreen();
  expect(screen.getByLabelText('Total proposed allocation. 0.00 Philippine pesos.')).toBeOnTheScreen();
  expect(allocationLabels()).toEqual([]); expect(screen.queryByRole('alert')).toBeNull(); expect(read).toHaveBeenCalledTimes(3);
});
test('Retry regenerates scenarios and fresh mount returns to the UI default', async () => {
  read.mockRejectedValueOnce(Error('load')); await open();
  expect(screen.queryByRole('radio', { name: 'Laya Adaptive' })).toBeNull();
  read.mockResolvedValue(fixture(300001, scenarioDebts)); await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(allocationLabels()).toHaveLength(2);
  await fireEvent.press(screen.getByRole('radio', { name: 'Snowball' })); await screen.unmount();
  await open(); expect(screen.getByRole('radio', { name: 'Laya Adaptive', checked: true })).toBeOnTheScreen();
});
test('allocation names, amounts and selector labels retain wrapping and font scaling', async () => {
  const name = 'Synthetic long allocation name '.repeat(6).trim();
  const record = Debt.create({ ...scenarioDebts[0], name }); read.mockResolvedValue(fixture(300001, [record])); await open();
  for (const text of [...screen.getAllByText(name), ...screen.getAllByText('₱1,500.01'), screen.getByText('✓ Laya Adaptive')]) {
    expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.allowFontScaling).not.toBe(false);
  }
  expect(screen.getByLabelText(`Proposed allocation for ${name}. Reported balance: 1,500.01 Philippine pesos. Proposed extra amount: 1,500.01 Philippine pesos. Full coverage of reported balance.`)).toBeOnTheScreen();
});
