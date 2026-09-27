import { Money } from '../../domain/Money';
import { formatMoneyInput } from './financial';

test.each([['0', '0.00'], ['8200.5', '8200.50'], ['6750.25', '6750.25'],
  ['90071992547409.91', '90071992547409.91'], ['-90071992547409.91', '-90071992547409.91']])
('editable decimal %s stays exact and round trips', (text, expected) => {
  const money = Money.parse(text, 'PHP');
  expect(formatMoneyInput(money)).toBe(expected);
  expect(Money.parse(formatMoneyInput(money), 'PHP').equals(money)).toBe(true);
});
