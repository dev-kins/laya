import { act, render, screen, userEvent } from '@testing-library/react-native';

import App from '../App';
import { onboardingService } from '../src/application/onboarding';
import { loadTimeline } from '../src/application/loadTimeline';
import { FinancialDate } from '../src/domain/FinancialDate';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/loadHome');
jest.mock('../src/application/loadPlan');
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
jest.mock('../src/application/loadTimeline', () => ({ loadTimeline: jest.fn() }));
jest.mock('../src/application/availableMoney', () => ({ readAvailableMoney: jest.fn().mockResolvedValue(null) }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
  jest.mocked(loadTimeline).mockResolvedValue({ kind: 'missing-available-money', startDate: FinancialDate.parse('2026-10-02'), through: FinancialDate.parse('2026-12-01') });
});
afterEach(async () => {
  // React Navigation defers detaching the previous tab by 32ms.
  await act(async () => { jest.runOnlyPendingTimers(); });
  jest.useRealTimers();
});

test('renders real Home setup without synthetic financial values or classifications', async () => {
  await render(<App />);

  for (const name of ['Home', 'Timeline', 'Add', 'Plan', 'Profile']) {
    expect(screen.getByRole('tab', { name })).toBeOnTheScreen();
  }
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();

  expect(
    screen.getByText('Your financial outlook'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Start with what you have')).toBeOnTheScreen();
  expect(screen.queryByLabelText('2,350 Philippine pesos')).toBeNull();
  expect(screen.queryByText('Design preview · All figures are sample data.')).toBeNull();
  for (const label of ['Covered', 'Tight', 'At risk']) expect(screen.queryByText(label)).toBeNull();
});

test.each(['Timeline', 'Plan', 'Profile', 'Add'])('%s tab opens its route and returns to Home', async (name) => {
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('tab', { name }));
  expect(screen.getByRole('header', { name: name === 'Add' ? 'Idagdag sa Laya' : name })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name, selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Home', selected: false })).toBeOnTheScreen();
  expect(screen.queryByText('Your financial outlook')).not.toBeVisible();
  if (name === 'Add') {
    expect(screen.getByRole('button', { name: 'Utang — Add a debt' })).toBeEnabled();
  }
  if (name === 'Timeline') expect(screen.getByRole('button', { name: 'Set available money' })).toBeOnTheScreen();
  if (name === 'Plan') expect(screen.getByText('No debts recorded yet.')).toBeOnTheScreen();
  await user.press(screen.getByRole('tab', { name: 'Home' }));
  expect(screen.getByText('Your financial outlook')).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
});

test('setup action opens the existing Available Money editor', async () => {
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('button', { name: 'Set available money' }));
  expect(screen.getByRole('header', { name: 'Available money' })).toBeOnTheScreen();
});
