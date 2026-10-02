import { act, render, screen, userEvent } from '@testing-library/react-native';

import App from '../App';
import appConfig from '../app.json';
import { onboardingService } from '../src/application/onboarding';
import { readAvailableMoney, saveAvailableMoney } from '../src/application/availableMoney';
import { openLayaDatabase } from '../src/persistence/sqlite/database';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/loadHome');
jest.mock('../src/application/loadPlan');
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
jest.mock('../src/application/availableMoney', () => ({ readAvailableMoney: jest.fn(), saveAvailableMoney: jest.fn() }));
jest.mock('../src/persistence/sqlite/database', () => ({ openLayaDatabase: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
  jest.mocked(readAvailableMoney).mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});
async function openProfile() {
  const user = userEvent.setup();
  const rendered = await render(<App />);
  await user.press(screen.getByRole('tab', { name: 'Profile' }));
  return { user, rendered };
}

test('Profile renders local information immediately with two real actions and no financial read', async () => {
  await openProfile();
  for (const name of ['Your Laya', 'Financial setup', 'How Laya calculates', 'Guidance', 'Privacy & data', 'About Laya']) {
    expect(screen.getByRole('header', { name })).toBeOnTheScreen();
  }
  expect(screen.getByRole('tab', { name: 'Profile', selected: true })).toBeOnTheScreen();
  expect(screen.getAllByRole('tab')).toHaveLength(5);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Available Money' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Review how Laya works' })).toBeEnabled();
  expect(screen.getByText('V1 currency · Philippine Peso (PHP)')).toBeOnTheScreen();
  expect(screen.getByText(`Version ${appConfig.expo.version}`)).toBeOnTheScreen();
  expect(screen.getByText(/Laya helps you see upcoming financial obligations/)).toBeOnTheScreen();
  expect(readAvailableMoney).not.toHaveBeenCalled();
  expect(openLayaDatabase).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
});

test('calculation explanations preserve zero floor, exact calendar horizon and alternative strategy semantics', async () => {
  await openProfile();
  expect(screen.getByText(/without the recorded projection falling below PHP 0/)).toHaveTextContent(/that does not remove the shortfall/);
  expect(screen.getByText(/60 calendar days from the local date when loaded/)).toHaveTextContent(/from tomorrow through day 60, inclusive/);
  expect(screen.getByText('Snowball orders smaller reported balances first.')).toBeOnTheScreen();
  expect(screen.getByText(/Avalanche orders known interest/)).toHaveTextContent(/unknown rates after known rates/);
  expect(screen.getByText(/Avalanche orders known interest/)).toHaveTextContent(/nominal annualized comparison rate/);
  expect(screen.getByText(/Laya Adaptive puts positive reported balances/)).toHaveTextContent(/individually fit within Safe-to-Pay/);
  expect(screen.getByText(/Laya Adaptive puts positive reported balances/)).toHaveTextContent(/combined balances exceed that amount/);
  expect(screen.getByText(/alternative planning views/)).toHaveTextContent(/do not execute payments or change recorded balances/);
  expect(screen.queryByText(/\b(best|recommended|optimal|smartest)\b/i)).toBeNull();
});

test('privacy and disclaimer make precise V1 claims without account identity or unsupported settings', async () => {
  await openProfile();
  const privacy = screen.getByText(/Your financial records are stored locally on this device/);
  expect(privacy).toHaveTextContent(/does not require a Laya cloud account, connect to bank accounts, or automatically sync/);
  expect(screen.getByText(/Calculations depend on the records you enter/)).toHaveTextContent(/not financial advice, a bank-verified balance or a guarantee/);
  expect(screen.queryByText(/can never leave|subscription|membership|@|account ID/i)).toBeNull();
  for (const name of [/sign in/i, /sign up/i, /log out/i, /delete/i, /reset/i, /backup/i, /restore/i,
    /export/i, /import/i, /sync/i, /bank/i, /notification/i, /theme/i, /currency/i]) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
  expect(screen.queryByRole('image')).toBeNull();
});

test('Available Money opens the existing Add editor and Profile remains reachable', async () => {
  const { user } = await openProfile();
  await user.press(screen.getByRole('button', { name: 'Available Money' }));
  expect(screen.getByRole('header', { name: 'Available money' })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Add', selected: true })).toBeOnTheScreen();
  expect(readAvailableMoney).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Available money (PHP)')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Back to Add' }));
  await user.press(screen.getByRole('tab', { name: 'Profile' }));
  expect(screen.getByRole('header', { name: 'Your Laya' })).toBeOnTheScreen();
  expect(saveAvailableMoney).not.toHaveBeenCalled();
});

test('review reuses onboarding, exits to Profile, and never opens storage or writes completion', async () => {
  const { user } = await openProfile();
  await user.press(screen.getByRole('button', { name: 'Review how Laya works' }));
  expect(screen.getByRole('header', { name: 'Review how Laya works' })).toBeOnTheScreen();
  expect(screen.getByText('Your path out of debt.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  expect(screen.queryByText(/Saving your progress/)).toBeNull();
  await user.press(screen.getByRole('button', { name: 'Done reviewing' }));
  expect(screen.getByRole('header', { name: 'Your Laya' })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Profile', selected: true })).toBeOnTheScreen();
  expect(onboardingService.isComplete).toHaveBeenCalledTimes(1);
  expect(onboardingService.complete).not.toHaveBeenCalled();
  // No database connection means review cannot change financial records either.
  expect(openLayaDatabase).not.toHaveBeenCalled();
  expect(readAvailableMoney).not.toHaveBeenCalled();
  expect(saveAvailableMoney).not.toHaveBeenCalled();
});

test('a completed installation still bypasses first launch after review and remount', async () => {
  const { user, rendered } = await openProfile();
  await user.press(screen.getByRole('button', { name: 'Review how Laya works' }));
  await user.press(screen.getByRole('button', { name: 'Done reviewing' }));
  await rendered.unmount();
  await render(<App />);
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  expect(onboardingService.isComplete).toHaveBeenCalledTimes(2);
  expect(onboardingService.complete).not.toHaveBeenCalled();
  expect(openLayaDatabase).not.toHaveBeenCalled();
});

test('Profile and review text retain scaling and wrapping with named accessible controls', async () => {
  const { user } = await openProfile();
  for (const text of screen.getAllByText(/Your Laya|Financial setup|The money you currently|V1 currency|Safe-to-Pay estimates|Home, Timeline and Plan|Snowball orders|Avalanche orders|Laya Adaptive puts|Your financial records|Laya helps you|Calculations depend|Available Money|Review how Laya works/)) {
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.numberOfLines).toBeUndefined();
  }
  expect(screen.getByRole('button', { name: 'Available Money' })).toHaveStyle({ minHeight: 48 });
  expect(screen.getByRole('button', { name: 'Review how Laya works' })).toHaveStyle({ minHeight: 48 });
  await user.press(screen.getByRole('button', { name: 'Review how Laya works' }));
  expect(screen.getByRole('button', { name: 'Done reviewing' })).toHaveStyle({ minHeight: 48 });
  expect(screen.getByText('Your path out of debt.').props.allowFontScaling).not.toBe(false);
  expect(screen.getByText('Your path out of debt.').props.numberOfLines).toBeUndefined();
});
