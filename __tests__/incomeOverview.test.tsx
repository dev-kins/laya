import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { createAddIncomeOperation } from '../src/application/addIncome';
import { listIncome } from '../src/application/listIncome';
import { onboardingService } from '../src/application/onboarding';
import { Income } from '../src/domain/Income';
import { FinancialDate } from '../src/domain/FinancialDate';
import { incomeId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import { Recurrence } from '../src/domain/Recurrence';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/listIncome', () => ({ listIncome: jest.fn() }));
jest.mock('../src/application/addIncome', () => ({ createAddIncomeOperation: jest.fn() }));
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
const read = jest.mocked(listIncome);
const original = Income.create({ id: incomeId('A'), name: 'Synthetic income', amount: Money.fromMinorUnits(1058478, 'PHP'), status: 'expected', date: FinancialDate.parse('2026-10-04') });
const next = Income.create({ id: incomeId('B'), name: 'Second synthetic income', amount: Money.zero('PHP'),
  status: 'received', date: FinancialDate.parse('2026-09-27') });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  read.mockReset().mockResolvedValue([original]);
  jest.mocked(createAddIncomeOperation).mockReturnValue(jest.fn().mockResolvedValue(next));
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
});
async function openOverview() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'View my income' }));
}
async function fillAndSave() {
  await fireEvent.changeText(screen.getByLabelText('Income name'), next.name);
  await fireEvent.changeText(screen.getByLabelText('Amount (PHP)'), '0');
  await fireEvent.changeText(screen.getByLabelText('Income date'), '2026-09-27');
  await fireEvent.press(screen.getByRole('radio', { name: 'Received' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(screen.getByRole('header', { name: 'Kita saved' })).toBeOnTheScreen();
}

test('loading never flashes empty, and empty read offers the real Add Income flow', async () => {
  const pending = deferred<readonly Income[]>();
  read.mockReturnValue(pending.promise);
  await openOverview();
  expect(screen.getByText('Opening your recorded income…')).toBeOnTheScreen();
  expect(screen.queryByText('Wala pang kitang nakatala.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add income' })).toBeNull();
  await act(async () => pending.resolve([]));
  expect(screen.getByText('Wala pang kitang nakatala.')).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Add income' }));
  expect(screen.getByRole('header', { name: 'Magdagdag ng kita' })).toBeOnTheScreen();
});
test('records show exact amount, calendar date and text status without invented recurrence or totals', async () => {
  read.mockResolvedValue([original, next]);
  await openOverview();
  expect(screen.getByRole('header', { name: 'Mga Kita' })).toBeOnTheScreen();
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(screen.getByText('₱10,584.78')).toBeOnTheScreen();
  expect(screen.getByText('Expected · Oct 4, 2026')).toBeOnTheScreen();
  expect(screen.getByText('Received · Sep 27, 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText(/Synthetic income. 10,584.78 Philippine pesos. Expected. Oct 4, 2026/)).toBeOnTheScreen();
  expect(screen.getByText('₱0.00')).toBeOnTheScreen();
  expect(screen.queryByText(/Monthly on day|Twice monthly/)).toBeNull();
  expect(screen.queryByText(/Total Income/i)).toBeNull();
  expect(screen.queryByRole('button', { name: original.name })).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});

test('expected recurrence is shown without generating receipts or extra occurrences', async () => {
  const recurring = Income.create({ ...original, status: 'expected', recurrence: Recurrence.twiceMonthly(30, 31) });
  read.mockResolvedValue([recurring, next]);
  await openOverview();
  expect(screen.getAllByText('Twice monthly on days 30 and 31. Each missing day uses the last day in shorter months; both scheduled days are retained.')).toHaveLength(1);
  expect(screen.getByLabelText(/Second synthetic income. 0.00 Philippine pesos. Received. Sep 27, 2026/).props.accessibilityLabel).not.toMatch(/monthly/i);
  expect(screen.getAllByText(/Expected ·/)).toHaveLength(1);
  expect(screen.getAllByText(/Received ·/)).toHaveLength(1);
});

test('long name and maximum safe amount are exposed without truncation', async () => {
  const income = Income.create({ ...original, status: 'expected', name: 'Synthetic '.repeat(20).trim(),
    amount: Money.fromMinorUnits(Number.MAX_SAFE_INTEGER, 'PHP') });
  read.mockResolvedValue([income]);
  await openOverview();
  expect(screen.getByText(income.name)).toBeOnTheScreen();
  expect(screen.getByText('₱90,071,992,547,409.91')).toBeOnTheScreen();
  expect(screen.getByLabelText(/90,071,992,547,409.91 Philippine pesos/)).toBeOnTheScreen();
});

test('error is neither empty nor raw SQL; Retry starts a new read with a loading state', async () => {
  read.mockRejectedValueOnce(new Error('SELECT private income row stack trace'));
  await openOverview();
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t read your income on this device. Please try again.');
  expect(screen.queryByText(/SELECT private/)).toBeNull();
  expect(screen.queryByText('Wala pang kitang nakatala.')).toBeNull();
  const retry = deferred<readonly Income[]>();
  read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getByText('Opening your recorded income…')).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => retry.resolve([original]));
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull();
});
test('save from overview returns to the existing overview and refreshes new data', async () => {
  read.mockResolvedValueOnce([original]).mockResolvedValueOnce([original, next]);
  await openOverview();
  await fireEvent.press(screen.getByRole('button', { name: 'Add income' }));
  await fillAndSave();
  await fireEvent.press(screen.getByRole('button', { name: 'View my income' }));
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Kita saved')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('save from hub can open overview even without a previous overview route', async () => {
  read.mockResolvedValue([next]);
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'Kita — Add income' }));
  await fillAndSave();
  await fireEvent.press(screen.getByRole('button', { name: 'View my income' }));
  expect(screen.getByRole('header', { name: 'Mga Kita' })).toBeOnTheScreen();
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('tab refocus clears stale data, handles failure, and ignores a late superseded read', async () => {
  await render(<App />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  await fireEvent.press(screen.getByRole('button', { name: 'View my income' }));
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  const late = deferred<readonly Income[]>();
  read.mockReturnValueOnce(late.promise);
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  expect(screen.getByText('Opening your recorded income…')).toBeOnTheScreen();
  expect(screen.queryByText(original.name)).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  read.mockRejectedValueOnce(new Error('synthetic read failure'));
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  expect(screen.getByRole('alert')).toBeOnTheScreen();
  await act(async () => late.resolve([original]));
  expect(screen.getByRole('alert')).toBeOnTheScreen();
  expect(screen.queryByText(original.name)).toBeNull();
  expect(read).toHaveBeenCalledTimes(3);
});
