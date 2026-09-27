import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { createAddExpenseOperation } from '../src/application/addExpense';
import { emptyExpenseForm, parseExpenseForm, type ExpenseForm } from '../src/application/expenseForm';
import { EssentialObligation } from '../src/domain/EssentialObligation';
import { obligationId } from '../src/domain/identifiers';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/addExpense', () => ({ createAddExpenseOperation: jest.fn() }));
const save = jest.fn<Promise<EssentialObligation>, [ExpenseForm]>();
const saved = EssentialObligation.create({ ...parseExpenseForm({ ...emptyExpenseForm, name: 'Synthetic', amount: '1', date: '2026-10-04' }), id: obligationId('synthetic') });
beforeEach(() => {
  save.mockReset().mockImplementation(async form => EssentialObligation.create({ ...parseExpenseForm(form), id: obligationId('synthetic') }));
  jest.mocked(createAddExpenseOperation).mockReturnValue(save);
});
async function openForm() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  await fireEvent.press(screen.getByRole('button', { name: 'Essential expense — Add expense' }));
}
async function fillMinimum() {
  await fireEvent.changeText(screen.getByLabelText('Expense name'), 'Synthetic expense');
  await fireEvent.changeText(screen.getByLabelText('Amount (PHP)'), '25000.50');
  await fireEvent.changeText(screen.getByLabelText('Expense date'), '2026-10-04');
}
test('hub enables Essential Expense and opens the one-time form', async () => {
  await openForm();
  expect(screen.getByRole('header', { name: 'Magdagdag ng gastusin' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'No repeating schedule', checked: true })).toBeOnTheScreen();
});

test('required fields have friendly errors which clear on editing', async () => {
  await openForm();
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(screen.getByText('Enter an expense name of 1–200 characters.')).toBeOnTheScreen();
  expect(screen.getByText('Enter a valid calendar date using YYYY-MM-DD.')).toBeOnTheScreen();
  expect(screen.getByText('Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.')).toBeOnTheScreen();
  expect(screen.queryByText('Gastos saved')).toBeNull();
  await fillMinimum();
  expect(screen.queryByText('Enter an expense name of 1–200 characters.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(screen.getByRole('header', { name: 'Gastos saved' })).toBeOnTheScreen();
});
test('pending save disables actions, prevents double submission, then shows success and Done returns to hub', async () => {
  let resolve!: (value: EssentialObligation) => void;
  save.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await openForm(); await fillMinimum();
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(screen.getByRole('button', { name: 'Saving expense…', busy: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back to Add' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Saving expense…' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Gastos saved')).toBeNull();
  await act(async () => resolve(saved));
  expect(screen.getByRole('header', { name: 'Gastos saved' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
  expect(screen.queryByText('Gastos saved')).toBeNull();
});
test('storage failure preserves entries and hides raw errors; retry succeeds', async () => {
  save.mockRejectedValueOnce(new Error('SQL expenses private stack trace'));
  await openForm(); await fillMinimum();

  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(screen.getByText('We couldn’t save this expense on your device. Your entries are still here. Please try again.')).toBeOnTheScreen();
  expect(screen.queryByText(/SQL expenses/)).toBeNull();
  expect(screen.getByLabelText('Expense name')).toHaveDisplayValue('Synthetic expense');
  expect(screen.getByLabelText('Amount (PHP)')).toHaveDisplayValue('25000.50');
  expect(screen.getByLabelText('Expense date')).toHaveDisplayValue('2026-10-04');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  expect(screen.getByText('Gastos saved')).toBeOnTheScreen();
});
test('twice-monthly text is submitted exactly', async () => {
  await openForm(); await fillMinimum();
  await fireEvent.press(screen.getByRole('radio', { name: 'Twice a month' }));
  expect(screen.getByRole('radio', { name: 'Twice a month', checked: true })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('First day'), '30');
  await fireEvent.changeText(screen.getByLabelText('Second day'), '31');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ amount: '25000.50', date: '2026-10-04',
    recurrence: 'twice-monthly', firstDay: '30', secondDay: '31' }));
  expect(screen.getByText('Gastos saved')).toBeOnTheScreen();
});

test('monthly day 31 can be cleared to a one-time obligation', async () => {
  await openForm(); await fillMinimum();
  await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
  expect(screen.getByRole('radio', { name: 'Monthly', checked: true })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Day of month'), '31');
  await fireEvent.press(screen.getByRole('radio', { name: 'No repeating schedule' }));
  expect(screen.queryByLabelText('Day of month')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  const result = await save.mock.results[0].value;
  expect(result.recurrence).toBeUndefined();
});
