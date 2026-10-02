import { render, screen, userEvent } from '@testing-library/react-native';

import App from '../App';
import { onboardingService } from '../src/application/onboarding';
import { loadTimeline } from '../src/application/loadTimeline';
import { FinancialDate } from '../src/domain/FinancialDate';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/application/onboarding', () => ({ onboardingService: { isComplete: jest.fn(), complete: jest.fn() } }));
jest.mock('../src/application/loadTimeline', () => ({ loadTimeline: jest.fn() }));

beforeEach(() => {
  jest.mocked(onboardingService.isComplete).mockResolvedValue(true);
  jest.mocked(loadTimeline).mockResolvedValue({ kind: 'missing-available-money', startDate: FinancialDate.parse('2026-10-02'), through: FinancialDate.parse('2026-12-01') });
});

test('renders a clearly labeled synthetic visual showcase', async () => {
  await render(<App />);

  for (const name of ['Home', 'Timeline', 'Add', 'Plan', 'Profile']) {
    expect(screen.getByRole('tab', { name })).toBeOnTheScreen();
  }
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();

  expect(
    screen.getByText('Magandang araw'),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('2,350 Philippine pesos')).toBeOnTheScreen();
  expect(screen.getByText('Design preview · All figures are sample data.')).toBeOnTheScreen();
  for (const label of ['Covered', 'Tight', 'At risk']) expect(screen.getByText(label)).toBeOnTheScreen();
});

test.each(['Timeline', 'Plan', 'Profile', 'Add'])('%s tab opens its route and returns to Home', async (name) => {
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('tab', { name }));
  expect(screen.getByRole('header', { name: name === 'Add' ? 'Idagdag sa Laya' : name })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name, selected: true })).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Home', selected: false })).toBeOnTheScreen();
  expect(screen.queryByText('Magandang araw')).not.toBeVisible();
  if (name === 'Add') {
    expect(screen.getByRole('button', { name: 'Utang — Add a debt' })).toBeEnabled();
  }
  if (name === 'Timeline') expect(screen.getByRole('button', { name: 'Set available money' })).toBeOnTheScreen();
  await user.press(screen.getByRole('tab', { name: 'Home' }));
  expect(screen.getByText('Magandang araw')).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
});

test('primary action explains the preview without product behavior', async () => {
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('button', { name: 'Plan my next peso' }));
  expect(screen.getByText('This is a design preview. Your plan will begin here in a future version.')).toBeOnTheScreen();
});
