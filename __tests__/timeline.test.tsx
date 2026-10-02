import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../App';
import { readAvailableMoney, saveAvailableMoney } from '../src/application/availableMoney';
import { loadTimeline, type TimelineResult } from '../src/application/loadTimeline';
import { onboardingService } from '../src/application/onboarding';
import { AvailableMoney } from '../src/domain/AvailableMoney';
import { FinancialDate } from '../src/domain/FinancialDate';
import { FinancialEvent } from '../src/domain/FinancialEvent';
import { debtId, incomeId, obligationId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import { projectCashFlow } from '../src/domain/projectCashFlow';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/loadTimeline', () => ({ loadTimeline: jest.fn() }));
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
jest.mock('../src/application/availableMoney', () => ({ readAvailableMoney: jest.fn(), saveAvailableMoney: jest.fn() }));
const read = jest.mocked(loadTimeline);
const date = FinancialDate.parse;
const php = (n: number) => Money.fromMinorUnits(n, 'PHP');
const missing: TimelineResult = { kind: 'missing-available-money', startDate: date('2026-10-02'), through: date('2026-12-01') };
function ready(amount = 0, populated = true): TimelineResult {
  const events = populated ? [
    FinancialEvent.create({ occurrenceKey: 'once', sourceId: obligationId('expense'), kind: 'essential-due', date: date('2026-10-04'), amount: php(160000) }),
    FinancialEvent.create({ occurrenceKey: 'once', sourceId: debtId('debt'), kind: 'debt-due', date: date('2026-10-04'), amount: php(176400) }),
    FinancialEvent.create({ occurrenceKey: 'once', sourceId: incomeId('income'), kind: 'expected-income', date: date('2026-10-04'), amount: php(450000) }),
  ] : [];
  const projection = projectCashFlow({ startingBalance: php(amount), startDate: date('2026-10-02'), through: date('2026-12-01'), events });
  return { kind: 'ready', projection, groups: populated ? [{ date: date('2026-10-04'), entries: projection.points.map(point => ({ ...point,
    sourceName: point.event.kind === 'essential-due' ? 'Synthetic WiFi' : point.event.kind === 'debt-due' ? 'Synthetic debt' : 'Synthetic salary',
    label: point.event.kind === 'essential-due' ? 'Essential expense' : point.event.kind === 'debt-due' ? 'Debt due' : 'Expected income',
  })) }] : [] };
}
function deferred() {
  let resolve!: (value: TimelineResult) => void, reject!: (error: Error) => void;
  const promise = new Promise<TimelineResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  read.mockReset().mockResolvedValue(ready());
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
  jest.mocked(readAvailableMoney).mockResolvedValue(null);
  jest.mocked(saveAvailableMoney).mockResolvedValue(AvailableMoney.create({ amount: php(0) }));
});
async function open() { await render(<App />); await fireEvent.press(screen.getByRole('tab', { name: 'Timeline' })); }

test('loading does not flash missing or empty; setup opens existing editor and return refreshes', async () => {
  const pending = deferred(); read.mockReturnValueOnce(pending.promise);
  await open();
  expect(screen.getByText('Building your timeline…')).toBeOnTheScreen();
  expect(screen.queryByText('Start with what you have')).toBeNull();
  expect(screen.queryByText('No scheduled items in this window')).toBeNull();
  await act(async () => pending.resolve(missing));
  await fireEvent.press(screen.getByRole('button', { name: 'Set available money' }));
  expect(screen.getByRole('header', { name: 'Available money' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Available money (PHP)'), '0');
  await fireEvent.press(screen.getByRole('button', { name: 'Save available money' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Timeline' }));
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByText('₱0.00')).toBeOnTheScreen();
  expect(screen.queryByText('Start with what you have')).toBeNull();
});
test('grouping preserves expense/debt/income order, signs, exact balances and spoken meaning', async () => {
  await open();
  expect(screen.getAllByRole('header', { name: 'Oct 4, 2026' })).toHaveLength(1);
  for (const text of ['−₱1,600.00', '−₱1,764.00', '+₱4,500.00', '-₱1,600.00', '-₱3,364.00', '₱1,136.00']) expect(screen.getByText(text)).toBeOnTheScreen();
  const rows = screen.getAllByLabelText(/Projected balance .*Philippine pesos/);
  expect(rows.map(row => row.props.accessibilityLabel)).toEqual([
    'Oct 4, 2026. Synthetic WiFi. Essential expense. 1,600.00 Philippine pesos outflow. Projected balance minus 1,600.00 Philippine pesos.',
    'Oct 4, 2026. Synthetic debt. Debt due. 1,764.00 Philippine pesos outflow. Projected balance minus 3,364.00 Philippine pesos.',
    'Oct 4, 2026. Synthetic salary. Expected income. 4,500.00 Philippine pesos inflow. Projected balance 1,136.00 Philippine pesos.',
  ]);
  expect(screen.getByLabelText(/Starting snapshot.*Oct 2, 2026.*0.00 Philippine pesos/)).toBeOnTheScreen();
  expect(screen.queryByText(/^(Covered|Tight|At risk|Safe|Unsafe)$/)).toBeNull();
});
test('empty window retains the starting snapshot and does not imply no real obligations', async () => {
  read.mockResolvedValue(ready(820050, false)); await open();
  expect(screen.getByText('₱8,200.50')).toBeOnTheScreen();
  expect(screen.getByText('No scheduled items in this window')).toBeOnTheScreen();
  expect(screen.getByText('Laya has no upcoming forecast events recorded for these 60 days.')).toBeOnTheScreen();
});
test('generic error hides raw detail; Retry clears error and starts a fresh load', async () => {
  read.mockRejectedValueOnce(Error('SELECT sensitive synthetic stack')); await open();
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t build your timeline from the data on this device. Please try again.');
  expect(screen.queryByText(/SELECT/)).toBeNull();
  const retry = deferred(); read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText('Building your timeline…')).toBeOnTheScreen();
  await act(async () => retry.resolve(ready())); expect(read).toHaveBeenCalledTimes(2);
});
test.each(['success', 'failure'])('focus refresh hides stale content and ignores late %s', async outcome => {
  await open(); await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  const old = deferred(); read.mockReturnValueOnce(old.promise);
  await fireEvent.press(screen.getByRole('tab', { name: 'Timeline' }));
  expect(screen.queryByText('Synthetic WiFi')).toBeNull();
  expect(screen.getByText('Building your timeline…')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  read.mockResolvedValueOnce(ready(820050, false));
  await fireEvent.press(screen.getByRole('tab', { name: 'Timeline' }));
  await act(async () => { if (outcome === 'success') old.resolve(missing); else old.reject(Error('late')); });
  expect(screen.getByText('₱8,200.50')).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByText('Start with what you have')).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
});
test('long source names retain scaling and wrapping', async () => {
  const value = ready(); if (value.kind !== 'ready') throw Error('ready');
  const name = 'Synthetic long name '.repeat(15).trim();
  read.mockResolvedValue({ ...value, groups: value.groups.map(group => ({ ...group, entries: group.entries.slice(0, 1).map(entry => ({ ...entry, sourceName: name })) })) });
  await open(); const text = screen.getByText(name);
  expect(text.props.numberOfLines).toBeUndefined(); expect(text.props.allowFontScaling).not.toBe(false);
  expect(screen.getByLabelText(new RegExp(name))).toBeOnTheScreen();
});
