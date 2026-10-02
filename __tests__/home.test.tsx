import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../App';
import { readAvailableMoney, saveAvailableMoney } from '../src/application/availableMoney';
import { loadHome, type HomeResult } from '../src/application/loadHome';
import { loadTimeline } from '../src/application/loadTimeline';
import { onboardingService } from '../src/application/onboarding';
import { AvailableMoney } from '../src/domain/AvailableMoney';
import { calculateSafeToPay } from '../src/domain/calculateSafeToPay';
import { FinancialDate } from '../src/domain/FinancialDate';
import { FinancialEvent } from '../src/domain/FinancialEvent';
import { debtId, incomeId, obligationId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import { projectCashFlow } from '../src/domain/projectCashFlow';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/loadHome');
jest.mock('../src/application/loadTimeline', () => ({ loadTimeline: jest.fn() }));
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
jest.mock('../src/application/availableMoney', () => ({ readAvailableMoney: jest.fn(), saveAvailableMoney: jest.fn() }));
const read = jest.mocked(loadHome);
const date = FinancialDate.parse;
const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const missing: HomeResult = { kind: 'missing-available-money', startDate: date('2026-10-02'), through: date('2026-12-01') };
function ready(starting = 820050, kind: 'income' | 'expense' | 'debt' | 'none' = 'expense', name = 'Synthetic upcoming') : HomeResult {
  const common = { date: date('2026-10-04'), occurrenceKey: 'one-time', amount: php(160000) };
  const event = kind === 'none' ? null : kind === 'income'
    ? FinancialEvent.create({ ...common, kind: 'expected-income', sourceId: incomeId('I') })
    : kind === 'expense' ? FinancialEvent.create({ ...common, kind: 'essential-due', sourceId: obligationId('E') })
      : FinancialEvent.create({ ...common, kind: 'debt-due', sourceId: debtId('D') });
  const projection = projectCashFlow({ startingBalance: php(starting), startDate: date('2026-10-02'), through: date('2026-12-01'), events: event ? [event] : [] });
  return { kind: 'ready', availableMoney: projection.start.balance, safeToPay: calculateSafeToPay(projection),
    nextEvent: event ? { ...projection.points[0], sourceName: name, label: kind === 'income' ? 'Expected income' : kind === 'expense' ? 'Essential expense' : 'Debt due' } : null,
    lowestProjected: projection.minimumProjectedBalance, endingProjected: projection.endingBalance };
}
function deferred() {
  let resolve!: (value: HomeResult) => void, reject!: (error: Error) => void;
  const promise = new Promise<HomeResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.useFakeTimers();
  read.mockReset().mockResolvedValue(ready());
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
  jest.mocked(loadTimeline).mockReset().mockResolvedValue(missing);
  jest.mocked(readAvailableMoney).mockResolvedValue(null);
  jest.mocked(saveAvailableMoney).mockResolvedValue(AvailableMoney.create({ amount: php(0) }));
});
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});
test('loading flashes neither values nor setup, then missing opens the existing editor and refreshes on return', async () => {
  const pending = deferred(); read.mockReturnValueOnce(pending.promise); await render(<App />);
  expect(screen.getByText('Building your financial outlook…')).toBeOnTheScreen();
  expect(screen.queryByText('₱0.00')).toBeNull(); expect(screen.queryByText('Safe-to-Pay')).toBeNull();
  expect(screen.queryByText('Start with what you have')).toBeNull();
  await act(async () => pending.resolve(missing));
  expect(screen.queryByText('Safe-to-Pay')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Set available money' }));
  expect(screen.getByRole('header', { name: 'Available money' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Available money (PHP)'), '0');
  await fireEvent.press(screen.getByRole('button', { name: 'Save available money' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
  read.mockResolvedValueOnce(ready(0));
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText(/^Available now. 0.00 Philippine pesos/)).toBeOnTheScreen();
});
test('populated Home distinguishes exact Safe-to-Pay and Available Money and shows the protection window', async () => {
  await render(<App />);
  expect(screen.getByLabelText('Safe-to-Pay. 6,600.50 Philippine pesos. Based on recorded financial information over the next 60 days, from Oct 2, 2026 through Dec 1, 2026. A planning estimate, not a guarantee.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Available now. 8,200.50 Philippine pesos. Manually reported money.')).toBeOnTheScreen();
  expect(screen.getByText('Based on the financial information you’ve recorded for the next 60 days.')).toBeOnTheScreen();
  expect(screen.getByText('Starting Oct 2, 2026 · Through Dec 1, 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText('Lowest projected. 6,600.50 Philippine pesos.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Ending projected. 6,600.50 Philippine pesos.')).toBeOnTheScreen();
  for (const text of ['Covered', 'Tight', 'At risk', 'Safe', 'Unsafe', '₱2,350']) expect(screen.queryByText(text)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Update available money' }));
  expect(screen.getByRole('header', { name: 'Available money' })).toBeOnTheScreen();
});
test.each([['income', 'Expected income', '+', 'inflow'], ['expense', 'Essential expense', '−', 'outflow'], ['debt', 'Debt due', '−', 'outflow']] as const)(
  'upcoming %s shows date, name, type, sign and spoken direction', async (kind, label, sign, direction) => {
    read.mockResolvedValue(ready(820050, kind)); await render(<App />);
    expect(screen.getByText('Synthetic upcoming')).toBeOnTheScreen();
    expect(screen.getByText(`${sign}₱1,600.00`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`Oct 4, 2026. Synthetic upcoming. ${label}. 1,600.00 Philippine pesos ${direction}.`)).toBeOnTheScreen();
  },
);
test('explicit zero remains populated and negative outlook is displayed without classification', async () => {
  read.mockResolvedValue(ready(0)); await render(<App />);
  expect(screen.getByLabelText(/^Safe-to-Pay. 0.00 Philippine pesos/)).toBeOnTheScreen();
  expect(screen.getByLabelText(/^Available now. 0.00 Philippine pesos/)).toBeOnTheScreen();
  expect(screen.getByLabelText('Lowest projected. minus 1,600.00 Philippine pesos.')).toBeOnTheScreen();
  expect(screen.getByLabelText('Ending projected. minus 1,600.00 Philippine pesos.')).toBeOnTheScreen();
  expect(screen.getAllByText('-₱1,600.00')).toHaveLength(2);
  expect(screen.queryByText('Start with what you have')).toBeNull();
  expect(screen.queryByText(/^(At risk|Danger|Unsafe|Warning)$/i)).toBeNull();
});
test('no-event Home keeps summary values and opens the real Timeline tab', async () => {
  read.mockResolvedValue(ready(820050, 'none')); await render(<App />);
  expect(screen.getByText('No scheduled items recorded in Laya for the next 60 days.')).toBeOnTheScreen();
  for (const label of ['Safe-to-Pay', 'Available now', 'Lowest projected', 'Ending projected']) {
    expect(screen.getByLabelText(new RegExp(`^${label}. 8,200.50 Philippine pesos`))).toBeOnTheScreen();
  }
  await fireEvent.press(screen.getByRole('button', { name: 'View timeline' }));
  expect(screen.getByRole('tab', { name: 'Timeline', selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Timeline' })).toBeOnTheScreen();
  expect(loadTimeline).toHaveBeenCalledTimes(1);
});
test('generic failure hides raw details; Retry starts a fresh loading state', async () => {
  read.mockRejectedValueOnce(Error('SELECT synthetic private stack path')); await render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t build your financial outlook from the data on this device. Please try again.');
  expect(screen.queryByText(/SELECT/)).toBeNull(); expect(screen.queryByText('Safe-to-Pay')).toBeNull();
  const retry = deferred(); read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getByText('Building your financial outlook…')).toBeOnTheScreen(); expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => retry.resolve(ready())); expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Safe-to-Pay')).toBeOnTheScreen();
});
test.each(['success', 'failure'])('focus refresh clears previous data and ignores late %s', async outcome => {
  await render(<App />); await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  const old = deferred(); read.mockReturnValueOnce(old.promise);
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  expect(screen.queryByText('Safe-to-Pay')).toBeNull(); expect(screen.getByText('Building your financial outlook…')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  read.mockResolvedValueOnce(ready(0)); await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  await act(async () => { if (outcome === 'success') old.resolve(missing); else old.reject(Error('late')); });
  expect(screen.getByLabelText(/^Safe-to-Pay. 0.00 Philippine pesos/)).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByText('Start with what you have')).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
});
test('late unmounted load cannot affect a new Home', async () => {
  const old = deferred(); read.mockReturnValueOnce(old.promise); const first = await render(<App />); await first.unmount();
  await render(<App />); await act(async () => old.resolve(missing));
  expect(screen.getByText('Safe-to-Pay')).toBeOnTheScreen(); expect(screen.queryByText('Start with what you have')).toBeNull();
});
test('large exact values and long names preserve wrapping and scaling', async () => {
  const name = 'Synthetic long name '.repeat(10).trim();
  read.mockResolvedValue(ready(Number.MAX_SAFE_INTEGER, 'expense', name)); await render(<App />);
  for (const value of [name, '₱90,071,992,547,409.91', '₱90,071,992,545,809.91']) {
    for (const text of screen.getAllByText(value)) {
      expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.allowFontScaling).not.toBe(false);
    }
  }
  expect(screen.getByLabelText(/^Safe-to-Pay. 90,071,992,545,809.91 Philippine pesos/)).toBeOnTheScreen();
});
