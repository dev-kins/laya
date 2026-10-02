import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { createAddDebtOperation } from '../src/application/addDebt';
import { listDebts } from '../src/application/listDebts';
import { onboardingService } from '../src/application/onboarding';
import { Debt } from '../src/domain/Debt';
import { FinancialDate } from '../src/domain/FinancialDate';
import { debtId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import { Recurrence } from '../src/domain/Recurrence';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/loadHome');
jest.mock('../src/application/listDebts', () => ({ listDebts: jest.fn() }));
jest.mock('../src/application/addDebt', () => ({ createAddDebtOperation: jest.fn() }));
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
const read = jest.mocked(listDebts);
const original = Debt.create({ id: debtId('A'), name: 'Synthetic loan', balance: Money.fromMinorUnits(1058478, 'PHP'), interest: { kind: 'unknown' } });
const next = Debt.create({ id: debtId('B'), name: 'Second synthetic loan', balance: Money.zero('PHP'),
  interest: { kind: 'known', basisPoints: 0, period: 'annual' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  read.mockReset().mockResolvedValue([original]);
  jest.mocked(createAddDebtOperation).mockReturnValue(jest.fn().mockResolvedValue(next));
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
});
async function openOverview() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'View my debts' }));
}
async function fillAndSave() {
  await fireEvent.changeText(screen.getByLabelText('Debt name'), next.name);
  await fireEvent.changeText(screen.getByLabelText('Current balance (PHP)'), '0');
  await fireEvent.press(screen.getByRole('radio', { name: 'I don’t know the rate' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(screen.getByRole('header', { name: 'Utang saved' })).toBeOnTheScreen();
}

test('loading never flashes empty, and empty read offers the real Add Debt flow', async () => {
  const pending = deferred<readonly Debt[]>();
  read.mockReturnValue(pending.promise);
  await openOverview();
  expect(screen.getByText('Opening your recorded debts…')).toBeOnTheScreen();
  expect(screen.queryByText('Wala pang utang na nakatala.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add a debt' })).toBeNull();
  await act(async () => pending.resolve([]));
  expect(screen.getByText('Wala pang utang na nakatala.')).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a debt' }));
  expect(screen.getByRole('header', { name: 'Add a debt' })).toBeOnTheScreen();
});
test('returned debt shows exact balance and unknown interest without invented optional values', async () => {
  await openOverview();
  expect(screen.getByRole('header', { name: 'Mga Utang' })).toBeOnTheScreen();
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(screen.getByText('₱10,584.78')).toBeOnTheScreen();
  expect(screen.getByText('Interest rate not entered')).toBeOnTheScreen();
  expect(screen.getByLabelText(/Synthetic loan\. Current reported balance: 10,584.78 Philippine pesos/)).toBeOnTheScreen();
  expect(screen.queryByText(/Regular payment/)).toBeNull();
  expect(screen.queryByText(/Next due date/)).toBeNull();
  expect(screen.queryByText('₱0.00')).toBeNull();
  expect(screen.queryByText(/Total Debt/i)).toBeNull();
  expect(screen.queryByRole('button', { name: original.name })).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
});
test('multiple debts show zero and all recorded optional facts', async () => {
  const full = Debt.create({ ...original, provider: 'Synthetic provider', scheduledPayment: Money.zero('PHP'),
    nextDueDate: FinancialDate.parse('2026-10-10'), recurrence: Recurrence.twiceMonthly(30, 31),
    interest: { kind: 'known', basisPoints: 125, period: 'monthly' } });
  read.mockResolvedValue([full, next]);
  await openOverview();
  expect(screen.getByText(full.name)).toBeOnTheScreen();
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(screen.getByText('Synthetic provider')).toBeOnTheScreen();
  expect(screen.getByText('Regular payment · ₱0.00')).toBeOnTheScreen();
  expect(screen.getByText('Next due date · Oct 10, 2026')).toBeOnTheScreen();
  expect(screen.getByText('Twice monthly on days 30 and 31. Each missing day uses the last day in shorter months; both scheduled days are retained.')).toBeOnTheScreen();
  expect(screen.getByText('1.25% monthly')).toBeOnTheScreen();
  expect(screen.getByText('0% annually')).toBeOnTheScreen();
  expect(screen.getByText('₱0.00')).toBeOnTheScreen();
});
test('long labels and maximum safe balance are exposed completely to accessibility', async () => {
  const debt = Debt.create({ ...original, name: 'Synthetic '.repeat(20).trim(), provider: 'Provider '.repeat(22).trim(),
    balance: Money.fromMinorUnits(Number.MAX_SAFE_INTEGER, 'PHP') });
  read.mockResolvedValue([debt]);
  await openOverview();
  expect(screen.getByText(debt.name)).toBeOnTheScreen();
  expect(screen.getByText(debt.provider!)).toBeOnTheScreen();
  expect(screen.getByText('₱90,071,992,547,409.91')).toBeOnTheScreen();
  expect(screen.getByLabelText(new RegExp('90,071,992,547,409.91 Philippine pesos'))).toBeOnTheScreen();
});
test('error is neither empty nor raw SQL; Retry starts a new read with a loading state', async () => {
  read.mockRejectedValueOnce(new Error('SELECT private debt row stack trace'));
  await openOverview();
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t read your debts on this device. Please try again.');
  expect(screen.queryByText(/SELECT private/)).toBeNull();
  expect(screen.queryByText('Wala pang utang na nakatala.')).toBeNull();
  const retry = deferred<readonly Debt[]>();
  read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getByText('Opening your recorded debts…')).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => retry.resolve([original]));
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(screen.queryByRole('alert')).toBeNull();
});
test('save from overview returns to the existing overview and refreshes new data', async () => {
  read.mockResolvedValueOnce([original]).mockResolvedValueOnce([original, next]);
  await openOverview();
  await fireEvent.press(screen.getByRole('button', { name: 'Add a debt' }));
  await fillAndSave();
  await fireEvent.press(screen.getByRole('button', { name: 'View my debts' }));
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Utang saved')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('save from hub can open overview even without a previous overview route', async () => {
  read.mockResolvedValue([next]);
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'Utang — Add a debt' }));
  await fillAndSave();
  await fireEvent.press(screen.getByRole('button', { name: 'View my debts' }));
  expect(screen.getByRole('header', { name: 'Mga Utang' })).toBeOnTheScreen();
  expect(screen.getByText(next.name)).toBeOnTheScreen();
  expect(read).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('tab refocus clears stale data, handles failure, and ignores a late superseded read', async () => {
  await render(<App />);
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  await fireEvent.press(screen.getByRole('button', { name: 'View my debts' }));
  expect(screen.getByText(original.name)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
  const late = deferred<readonly Debt[]>();
  read.mockReturnValueOnce(late.promise);
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  expect(screen.getByText('Opening your recorded debts…')).toBeOnTheScreen();
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
