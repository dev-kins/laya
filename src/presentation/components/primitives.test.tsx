import { render, screen, userEvent } from '@testing-library/react-native';

import { Button, StatusIndicator, type StatusTone } from './primitives';

test.each(['primary', 'secondary'] as const)('%s button exposes its role and activates', async (variant) => {
  const onPress = jest.fn();
  const user = userEvent.setup();
  await render(<Button label="Continue" variant={variant} onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Continue' });
  expect(button).toBeEnabled();
  await user.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each(['primary', 'secondary'] as const)('%s disabled button is announced and cannot activate', async (variant) => {
  const onPress = jest.fn();
  const user = userEvent.setup();
  await render(<Button label="Continue" variant={variant} disabled onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Continue', disabled: true });
  expect(button).toBeDisabled();
  await user.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test.each<[StatusTone, string]>([
  ['positive', 'Covered'], ['warning', 'Tight'], ['danger', 'At risk'], ['unknown', 'Unknown'],
])('%s status communicates its meaning in text', async (status, meaning) => {
  await render(<StatusIndicator status={status} />);
  expect(screen.getByText(meaning)).toBeOnTheScreen();
});
