import { NavigationContainer } from '@react-navigation/native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

import { parseAvailableMoney, readAvailableMoney, saveAvailableMoney } from '../src/application/availableMoney';
import type { AvailableMoney } from '../src/domain/AvailableMoney';
import { AddNavigator } from '../src/presentation/navigation/AddNavigator';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/availableMoney', () => ({
  ...jest.requireActual('../src/application/availableMoney'), readAvailableMoney: jest.fn(), saveAvailableMoney: jest.fn(),
}));
const read = jest.mocked(readAvailableMoney);
const save = jest.mocked(saveAvailableMoney);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => {
  read.mockReset().mockResolvedValue(null);
  save.mockReset().mockImplementation(async text => parseAvailableMoney(text));
});
async function open() {
  await render(<NavigationContainer><AddNavigator /></NavigationContainer>);
  expect(screen.getByRole('button', { name: 'Set available money' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Set available money' }));
}

test('loading is distinct from missing and saved zero', async () => {
  const pending = deferred<AvailableMoney | null>(); read.mockReturnValue(pending.promise);
  await open();
  expect(screen.getByText('Opening available money…').props.accessibilityState).toMatchObject({ busy: true });
  expect(screen.queryByText('Not set')).toBeNull();
  expect(screen.queryByLabelText('Available money (PHP)')).toBeNull();
  await act(async () => pending.resolve(null));
  expect(screen.getByText('Not set')).toBeOnTheScreen();
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue('');
  expect(screen.queryByText('₱0.00')).toBeNull();
  expect(screen.getByText('Laya does not connect to your bank or e-wallet in V1.')).toBeOnTheScreen();
});
test.each([['0', '0.00', '₱0.00'], ['8200.50', '8200.50', '₱8,200.50'],
  ['90071992547409.91', '90071992547409.91', '₱90,071,992,547,409.91']])
('existing %s is exactly prepopulated and accessible', async (text, editable, displayed) => {
  read.mockResolvedValue(parseAvailableMoney(text));
  await open();
  expect(screen.queryByText('Not set')).toBeNull();
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue(editable);
  expect(screen.getByText(displayed)).toBeOnTheScreen();
  expect(screen.getByLabelText(`Current reported available money: ${displayed.replace('₱', '')} Philippine pesos`)).toBeOnTheScreen();
});
test.each(['', '-1', '8200.999', '90071992547409.92'])('invalid amount %s stays on form', async text => {
  await open();
  await fireEvent.changeText(screen.getByLabelText('Available money (PHP)'), text);
  await fireEvent.press(screen.getByRole('button', { name: 'Save available money' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.');
  expect(screen.queryByText('Available money updated')).toBeNull();
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue(text);
});
test('busy save blocks another tap and success waits for the operation', async () => {
  const pending = deferred<AvailableMoney>(); save.mockReturnValue(pending.promise);
  await open();
  await fireEvent.changeText(screen.getByLabelText('Available money (PHP)'), '8200.50');
  const user = userEvent.setup();
  await user.press(screen.getByRole('button', { name: 'Save available money' }));
  expect(screen.getByRole('button', { name: 'Saving available money…', busy: true })).toBeDisabled();
  expect(screen.getByLabelText('Available money (PHP)')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Back to Add' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Saving available money…' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('8200.50');
  expect(screen.queryByText('Available money updated')).toBeNull();
  await act(async () => pending.resolve(parseAvailableMoney('8200.50')));
  expect(screen.getByRole('header', { name: 'Available money updated' })).toBeOnTheScreen();
  expect(screen.getByLabelText('8,200.50 Philippine pesos')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('header', { name: 'Idagdag sa Laya' })).toBeOnTheScreen();
});
test('save failure retains edited input; retry replaces value and next visit reloads', async () => {
  read.mockResolvedValueOnce(parseAvailableMoney('8200.50')).mockResolvedValueOnce(parseAvailableMoney('6750.25'));
  save.mockRejectedValueOnce(new Error('SQL private row stack trace'));
  await open();
  await fireEvent.changeText(screen.getByLabelText('Available money (PHP)'), '6750.25');
  await fireEvent.press(screen.getByRole('button', { name: 'Save available money' }));
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t save available money on your device. Your entry is still here. Please try again.');
  expect(screen.queryByText(/SQL private/)).toBeNull();
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue('6750.25');
  await fireEvent.press(screen.getByRole('button', { name: 'Save available money' }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByText('₱6,750.25')).toBeOnTheScreen();
  expect(screen.queryByText('₱8,200.50')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Set available money' }));
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue('6750.25');
  expect(read).toHaveBeenCalledTimes(2);
});
test('failed read hides input and missing state, and Retry loads without exposing raw error', async () => {
  read.mockRejectedValueOnce(new Error('SELECT private amount'));
  await open();
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t read available money on this device. Please try again.');
  expect(screen.queryByText(/SELECT private/)).toBeNull();
  expect(screen.queryByText('Not set')).toBeNull();
  expect(screen.queryByLabelText('Available money (PHP)')).toBeNull();
  const retry = deferred<AvailableMoney | null>(); read.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(screen.getByText('Opening available money…')).toBeOnTheScreen();
  await act(async () => retry.resolve(parseAvailableMoney('0')));
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue('0.00');
  expect(screen.queryByText('Not set')).toBeNull();
});
test('late read from a previous editor cannot overwrite a new visit', async () => {
  const late = deferred<AvailableMoney | null>(); read.mockReturnValueOnce(late.promise);
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Add' }));
  read.mockResolvedValueOnce(parseAvailableMoney('6750.25'));
  await fireEvent.press(screen.getByRole('button', { name: 'Set available money' }));
  await act(async () => late.resolve(parseAvailableMoney('8200.50')));
  expect(screen.getByLabelText('Available money (PHP)')).toHaveDisplayValue('6750.25');
});
