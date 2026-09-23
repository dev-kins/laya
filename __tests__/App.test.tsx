import { render, screen } from '@testing-library/react-native';

import App from '../App';

test('renders the existing starter message', async () => {
  await render(<App />);

  expect(
    screen.getByText('Open up App.tsx to start working on your app!'),
  ).toBeOnTheScreen();
});
