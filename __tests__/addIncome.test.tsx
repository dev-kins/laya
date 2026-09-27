import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { createAddIncomeOperation } from '../src/application/addIncome';
import { emptyIncomeForm, parseIncomeForm, type IncomeForm } from '../src/application/incomeForm';
import { Income } from '../src/domain/Income';
import { incomeId } from '../src/domain/identifiers';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/addIncome', () => ({ createAddIncomeOperation: jest.fn() }));
const save = jest.fn<Promise<Income>, [IncomeForm]>();
const saved = Income.create({ ...parseIncomeForm({ ...emptyIncomeForm, name: 'Synthetic', amount: '1', status: 'expected', date: '2026-10-04' }), id: incomeId('synthetic') });
beforeEach(() => {
  save.mockReset().mockImplementation(async form => Income.create({ ...parseIncomeForm(form), id: incomeId('synthetic') }));
  jest.mocked(createAddIncomeOperation).mockReturnValue(save);
});
async function openForm() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'Kita — Add income' }));
}
async function fillMinimum() {
  await fireEvent.changeText(screen.getByLabelText('Income name'), 'Synthetic income');
  await fireEvent.changeText(screen.getByLabelText('Amount (PHP)'), '25000.50');
  await fireEvent.changeText(screen.getByLabelText('Income date'), '2026-10-04');
  await fireEvent.press(screen.getByRole('radio', { name: 'Expected' }));
}
test('Kita is enabled and opens an explicitly unselected status form', async () => {
  await openForm();
  expect(screen.getByRole('header', { name: 'Magdagdag ng kita' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Expected', checked: false })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Received', checked: false })).toBeOnTheScreen();
  expect(screen.queryByText('Repeats (optional)')).toBeNull();
});

test('required fields have friendly errors which clear on editing', async () => {
  await openForm();
  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(screen.getByText('Enter an income name of 1–200 characters.')).toBeOnTheScreen();
  expect(screen.getByText('Choose Expected or Received.')).toBeOnTheScreen();
  expect(screen.getByText('Enter a valid calendar date using YYYY-MM-DD.')).toBeOnTheScreen();
  expect(screen.getByText('Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.')).toBeOnTheScreen();
  expect(screen.queryByText('Kita saved')).toBeNull();
  await fillMinimum();
  expect(screen.queryByText('Enter an income name of 1–200 characters.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(screen.getByRole('header', { name: 'Kita saved' })).toBeOnTheScreen();
});
test('pending save disables actions, prevents double submission, then shows success and Done returns to hub', async () => {
  let resolve!: (value: Income) => void;
  save.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await openForm(); await fillMinimum();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Save income' }));
  expect(screen.getByRole('button', { name: 'Saving income…', busy: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back to Add' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Saving income…' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Kita saved')).toBeNull();
  await act(async () => resolve(saved));
  expect(screen.getByRole('header', { name: 'Kita saved' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
  expect(screen.queryByText('Kita saved')).toBeNull();
});
test('storage failure preserves entries and hides raw errors; retry succeeds', async () => {
  save.mockRejectedValueOnce(new Error('SQL incomes private stack trace'));
  await openForm(); await fillMinimum();

  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(screen.getByText('We couldn’t save this income on your device. Your entries are still here. Please try again.')).toBeOnTheScreen();
  expect(screen.queryByText(/SQL incomes/)).toBeNull();
  expect(screen.getByLabelText('Income name')).toHaveDisplayValue('Synthetic income');
  expect(screen.getByLabelText('Amount (PHP)')).toHaveDisplayValue('25000.50');
  expect(screen.getByLabelText('Income date')).toHaveDisplayValue('2026-10-04');
  expect(screen.getByRole('radio', { name: 'Expected', checked: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(screen.getByText('Kita saved')).toBeOnTheScreen();
});
test('expected twice-monthly text is submitted exactly', async () => {
  await openForm(); await fillMinimum();
  await fireEvent.press(screen.getByRole('radio', { name: 'Twice a month' }));
  await fireEvent.changeText(screen.getByLabelText('First day'), '30');
  await fireEvent.changeText(screen.getByLabelText('Second day'), '31');
  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ amount: '25000.50', date: '2026-10-04', status: 'expected',
    recurrence: 'twice-monthly', firstDay: '30', secondDay: '31' }));
  expect(screen.getByText('Kita saved')).toBeOnTheScreen();
});

test('Received clears recurrence and switching back does not revive it', async () => {
  await openForm(); await fillMinimum();
  await fireEvent.press(screen.getByRole('radio', { name: 'Twice a month' }));
  await fireEvent.changeText(screen.getByLabelText('First day'), '30');
  await fireEvent.changeText(screen.getByLabelText('Second day'), '31');
  await fireEvent.press(screen.getByRole('radio', { name: 'Received' }));
  expect(screen.queryByLabelText('First day')).toBeNull();
  expect(screen.queryByRole('radio', { name: 'Monthly' })).toBeNull();
  expect(screen.getByRole('radio', { name: 'Received', checked: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Expected' }));
  expect(screen.getByRole('radio', { name: 'Does not repeat', checked: true })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Twice a month' }));
  expect(screen.getByLabelText('First day')).toHaveDisplayValue('');
  expect(screen.getByLabelText('Second day')).toHaveDisplayValue('');
  await fireEvent.press(screen.getByRole('radio', { name: 'Received' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save income' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ status: 'received', recurrence: 'none', firstDay: '', secondDay: '' }));
  const result = await save.mock.results[0].value;
  expect(result.recurrence).toBeUndefined();
});
