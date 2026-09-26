import { render, screen, userEvent } from '@testing-library/react-native';

import App from '../App';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

test('renders a clearly labeled synthetic visual showcase', async () => {
  await render(<App />);

  expect(
    screen.getByText('Magandang araw'),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText('2,350 Philippine pesos')).toBeOnTheScreen();
  expect(screen.getByText('Design preview · All figures are sample data.')).toBeOnTheScreen();
  for (const label of ['Covered', 'Tight', 'At risk']) expect(screen.getByText(label)).toBeOnTheScreen();
});

test('primary action explains the preview without product behavior', async () => {
  const user = userEvent.setup();
  await render(<App />);
  await user.press(screen.getByRole('button', { name: 'Plan my next peso' }));
  expect(screen.getByText('This is a design preview. Your plan will begin here in a future version.')).toBeOnTheScreen();
});
