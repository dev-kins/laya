import { act, render, screen, userEvent } from '@testing-library/react-native';

import App from '../App';
import { onboardingService } from '../src/application/onboarding';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
const read = jest.mocked(onboardingService.isComplete);
const save = jest.mocked(onboardingService.complete);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => { read.mockReset().mockResolvedValue(false); save.mockReset().mockResolvedValue(); });

test('first launch shows only initialization until the stored state resolves', async () => {
  const pending = deferred<boolean>();
  read.mockReturnValue(pending.promise);
  await render(<App />);
  expect(read).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Opening your local data…')).toBeOnTheScreen();
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  await act(async () => { pending.resolve(false); });
  expect(screen.getByRole('button', { name: 'Get Started' })).toBeEnabled();
  expect(screen.getByText('Your path out of debt.')).toBeOnTheScreen();
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
});

test('completion waits for durable success and prevents duplicate submission', async () => {
  const pending = deferred<void>();
  save.mockReturnValue(pending.promise);
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('button', { name: 'Get Started' }));
  expect(screen.getByRole('button', { name: 'Get Started' })).toBeDisabled();
  await user.press(screen.getByRole('button', { name: 'Get Started' }));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  await act(async () => { pending.resolve(); });
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
});

test('returning launch goes directly to Home after the stored check', async () => {
  const pending = deferred<boolean>();
  read.mockReturnValue(pending.promise);
  await render(<App />);
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  await act(async () => { pending.resolve(true); });
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
  expect(save).not.toHaveBeenCalled();
});

test('startup failure shows an accessible retry without entering either route', async () => {
  read.mockRejectedValueOnce(new Error('synthetic private details'));
  const user = userEvent.setup();
  await render(<App />);
  expect(screen.getByRole('alert')).toHaveTextContent('Laya couldn’t open your local data. Please try again.');
  expect(screen.queryByText('synthetic private details')).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Try again' }));
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Get Started' })).toBeOnTheScreen();
});

test('save failure stays on onboarding and successful retry enters Home', async () => {
  save.mockRejectedValueOnce(new Error('synthetic disk failure'));
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('button', { name: 'Get Started' }));
  expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t save your progress. Please try Get Started again.');
  expect(screen.getByRole('button', { name: 'Get Started' })).toBeEnabled();
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Get Started' }));
  expect(save).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
});

test('a late startup result after unmount does not affect a new launch', async () => {
  const pending = deferred<boolean>();
  read.mockReturnValueOnce(pending.promise);
  const first = await render(<App />);
  await first.unmount();
  await render(<App />);
  await act(async () => { pending.resolve(true); });
  expect(screen.getByRole('button', { name: 'Get Started' })).toBeOnTheScreen();
  expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull();
});
