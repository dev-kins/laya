import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { createAddDebtOperation } from '../src/application/addDebt';
import { emptyDebtForm, parseDebtForm, type DebtForm } from '../src/application/debtForm';
import { Debt } from '../src/domain/Debt';
import { debtId } from '../src/domain/identifiers';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/addDebt', () => ({ createAddDebtOperation: jest.fn() }));
const save = jest.fn<Promise<Debt>, [DebtForm]>();
const saved = Debt.create({ ...parseDebtForm({ ...emptyDebtForm, name: 'Synthetic', balance: '1', interestChoice: 'unknown' }), id: debtId('synthetic') });
beforeEach(() => {
  save.mockReset().mockImplementation(async form => Debt.create({ ...parseDebtForm(form), id: debtId('synthetic') }));
  jest.mocked(createAddDebtOperation).mockReturnValue(save);
});
async function openForm() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'Utang — Add a debt' }));
}
async function fillMinimum() {
  await fireEvent.changeText(screen.getByLabelText('Debt name'), 'Synthetic debt');
  await fireEvent.changeText(screen.getByLabelText('Current balance (PHP)'), '10584.78');
  await fireEvent.press(screen.getByRole('radio', { name: 'I don’t know the rate' }));
}
test('hub enables Debt, disables the other destinations, and opens the form', async () => {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Utang — Add a debt' })).toBeEnabled();
  for (const name of ['Kita / Income — Coming next', 'Essential expense / Pangunahing gastusin — Coming next']) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name }));
    expect(screen.queryByRole('header', { name: 'Add a debt' })).toBeNull();
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Utang — Add a debt' }));
  expect(screen.getByRole('header', { name: 'Add a debt' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'No repeating schedule', checked: true })).toBeOnTheScreen();
});
test('required fields have friendly errors which clear on editing', async () => {
  await openForm();
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(screen.getByText('Enter a debt name of 1–200 characters.')).toBeOnTheScreen();
  expect(screen.getByText('Choose whether you know the interest rate.')).toBeOnTheScreen();
  expect(screen.queryByText('Utang saved')).toBeNull();
  await fillMinimum();
  expect(screen.queryByText('Enter a debt name of 1–200 characters.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(screen.getByRole('header', { name: 'Utang saved' })).toBeOnTheScreen();
});
test('pending save disables actions, prevents double submission, then shows success and Done returns to hub', async () => {
  let resolve!: (value: Debt) => void;
  save.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await openForm(); await fillMinimum();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(screen.getByRole('button', { name: 'Saving debt…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back to Add' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Saving debt…' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Utang saved')).toBeNull();
  await act(async () => resolve(saved));
  expect(screen.getByRole('header', { name: 'Utang saved' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
  expect(screen.queryByText('Utang saved')).toBeNull();
});
test('storage failure preserves entries and hides raw errors; retry succeeds', async () => {
  save.mockRejectedValueOnce(new Error('SQL debts private stack trace'));
  await openForm(); await fillMinimum();
  await fireEvent.changeText(screen.getByLabelText('Provider (optional)'), 'Synthetic provider');
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(screen.getByText('We couldn’t save this debt on your device. Your entries are still here. Please try again.')).toBeOnTheScreen();
  expect(screen.queryByText(/SQL debts/)).toBeNull();
  expect(screen.getByLabelText('Debt name')).toHaveDisplayValue('Synthetic debt');
  expect(screen.getByLabelText('Current balance (PHP)')).toHaveDisplayValue('10584.78');
  expect(screen.getByLabelText('Provider (optional)')).toHaveDisplayValue('Synthetic provider');
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(screen.getByText('Utang saved')).toBeOnTheScreen();
});
test('known monthly zero interest and independent recurrence are submitted as text', async () => {
  await openForm(); await fillMinimum();
  await fireEvent.press(screen.getByRole('radio', { name: 'I know the rate' }));
  await fireEvent.changeText(screen.getByLabelText('Interest rate (%)'), '0');
  await fireEvent.press(screen.getByRole('radio', { name: /^Monthly$/ }));
  expect(screen.getByRole('radio', { name: /^Monthly$/, checked: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Twice a month' }));
  await fireEvent.changeText(screen.getByLabelText('First day'), '30');
  await fireEvent.changeText(screen.getByLabelText('Second day'), '31');
  await fireEvent.press(screen.getByRole('button', { name: 'Save debt' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ interestChoice: 'known', interestRate: '0', interestPeriod: 'monthly',
    recurrence: 'twice-monthly', firstDay: '30', secondDay: '31', scheduledPayment: '', nextDueDate: '' }));
  expect(screen.getByText('Utang saved')).toBeOnTheScreen();
});
