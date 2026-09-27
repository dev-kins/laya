import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { createAddExpenseOperation } from '../src/application/addExpense';
import { listExpenses } from '../src/application/listExpenses';
import { onboardingService } from '../src/application/onboarding';
import { EssentialObligation } from '../src/domain/EssentialObligation';
import { FinancialDate } from '../src/domain/FinancialDate';
import { obligationId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import { Recurrence } from '../src/domain/Recurrence';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/listExpenses', () => ({ listExpenses: jest.fn() }));
jest.mock('../src/application/addExpense', () => ({ createAddExpenseOperation: jest.fn() }));
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
const read = jest.mocked(listExpenses);
const original = EssentialObligation.create({ id: obligationId('A'), name: 'Synthetic expense', amount: Money.fromMinorUnits(1058478, 'PHP'), date: FinancialDate.parse('2026-10-04') });
const next = EssentialObligation.create({ id: obligationId('B'), name: 'Second synthetic expense', amount: Money.zero('PHP'),
  date: FinancialDate.parse('2026-09-27') });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  read.mockReset().mockResolvedValue([original]);
  jest.mocked(createAddExpenseOperation).mockReturnValue(jest.fn().mockResolvedValue(next));
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
});
async function openOverview() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'View my expenses' }));
}
async function fillAndSave() {
  await fireEvent.changeText(screen.getByLabelText('Expense name'), next.name);
  await fireEvent.changeText(screen.getByLabelText('Amount (PHP)'), '0');
  await fireEvent.changeText(screen.getByLabelText('Expense date'), '2026-09-27');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(screen.getByRole('header', { name: 'Gastos saved' })).toBeOnTheScreen();
}

test('loading never flashes empty, and empty read offers the real Add Expense flow', async () => {
  const pending = deferred<readonly EssentialObligation[]>();
  read.mockReturnValue(pending.promise);
  await openOverview();
  expect(screen.getByText('Opening your recorded expenses…')).toBeOnTheScreen();
  expect(screen.queryByText('Wala pang gastusing nakatala.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add expense' })).toBeNull();
  await act(async () => pending.resolve([]));
  expect(screen.getByText('Wala pang gastusing nakatala.')).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
  expect(screen.getByRole('header', { name: 'Magdagdag ng gastusin' })).toBeOnTheScreen();
});
test('records show exact amount, calendar date and recorded facts without invented recurrence or totals', async () => {
  read.mockResolvedValue([original, next]);
  await openOverview();
  expect(screen.getByRole('header', { name: 'Mga Gastusin' })).toBeOnTheScreen();
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(screen.getByText('₱10,584.78')).toBeOnTheScreen();
  expect(screen.getByText('Oct 4, 2026')).toBeOnTheScreen();
  expect(screen.getByText('Sep 27, 2026')).toBeOnTheScreen();
  expect(screen.getByLabelText(/Synthetic expense. 10,584.78 Philippine pesos. Oct 4, 2026/)).toBeOnTheScreen();
  expect(screen.getByText('₱0.00')).toBeOnTheScreen();
  expect(screen.queryByText(/Monthly on day|Twice monthly/)).toBeNull();
  expect(screen.queryByText(/Total expenses/i)).toBeNull();
  expect(screen.queryByText(/^(Expected|Received|Paid|Unpaid|Covered|At risk)$/)).toBeNull();
  expect(screen.queryByRole('button', { name: original.name })).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});

test('recorded recurrence is shown without generating extra records or extra occurrences', async () => {
  const recurring = EssentialObligation.create({ ...original, recurrence: Recurrence.twiceMonthly(30, 31) });
  read.mockResolvedValue([recurring, next]);
  await openOverview();
  expect(screen.getAllByText('Twice monthly on days 30 and 31. Each missing day uses the last day in shorter months; both scheduled days are retained.')).toHaveLength(1);
  expect(screen.getByLabelText(/Second synthetic expense. 0.00 Philippine pesos. Sep 27, 2026/).props.accessibilityLabel).not.toMatch(/monthly/i);
});

test('long name and maximum safe amount are exposed without truncation', async () => {
  const expense = EssentialObligation.create({ ...original, name: 'Synthetic '.repeat(20).trim(),
    amount: Money.fromMinorUnits(Number.MAX_SAFE_INTEGER, 'PHP') });
  read.mockResolvedValue([expense]);
  await openOverview();
  expect(screen.getByText(expense.name)).toBeOnTheScreen();
  expect(screen.getByText('₱90,071,992,547,409.91')).toBeOnTheScreen();
  expect(screen.getByLabelText(/90,071,992,547,409.91 Philippine pesos/)).toBeOnTheScreen();
});

test('error is neither empty nor raw SQL; Retry starts a new read with a loading state', async () => {
  read.mockRejectedValueOnce(new Error('SELECT private expense row stack trace'));
  await openOverview();
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t read your expenses on this device. Please try again.');
  expect(screen.queryByText(/SELECT private/)).toBeNull();
  expect(screen.queryByText('Wala pang gastusing nakatala.')).toBeNull();
  const retry = deferred<readonly EssentialObligation[]>();
  read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getByText('Opening your recorded expenses…')).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => retry.resolve([original]));
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull();
});
test('save from overview returns to the existing overview and refreshes new data', async () => {
  read.mockResolvedValueOnce([original]).mockResolvedValueOnce([original, next]);
  await openOverview();
  await fireEvent.press(screen.getByRole('button', { name: 'Add expense' }));
  await fillAndSave();
  await fireEvent.press(screen.getByRole('button', { name: 'View my expenses' }));
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Gastos saved')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('save from hub can open overview even without a previous overview route', async () => {
  read.mockResolvedValue([next]);
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'Essential expense — Add expense' }));
  await fillAndSave();
  await fireEvent.press(screen.getByRole('button', { name: 'View my expenses' }));
  expect(screen.getByRole('header', { name: 'Mga Gastusin' })).toBeOnTheScreen();
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('tab refocus clears stale data, handles failure, and ignores a late superseded read', async () => {
  await render(<App />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  await fireEvent.press(screen.getByRole('button', { name: 'View my expenses' }));
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  const late = deferred<readonly EssentialObligation[]>();
  read.mockReturnValueOnce(late.promise);
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  expect(screen.getByText('Opening your recorded expenses…')).toBeOnTheScreen();
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
