import { FinancialDate } from '../domain/FinancialDate';
import { deviceLocalFinancialDate, timelineThrough } from './timelineCalendar';

test.each([
  ['2026-10-02', '2026-12-01'], ['2026-01-01', '2026-03-02'],
  ['2028-01-01', '2028-03-01'], ['2026-12-15', '2027-02-13'],
  ['0001-01-01', '0001-03-02'], ['9999-11-01', '9999-12-31'],
])('60 calendar days after %s is %s', (start, end) => {
  expect(timelineThrough(FinancialDate.parse(start)).toString()).toBe(end);
});
test('calendar overflow rejects', () => {
  expect(() => timelineThrough(FinancialDate.parse('9999-11-02'))).toThrow();
});
test('clock reads local components once without UTC conversion', () => {
  const local = { getFullYear: jest.fn(() => 2026), getMonth: jest.fn(() => 9), getDate: jest.fn(() => 2) };
  const clock = jest.spyOn(globalThis, 'Date').mockImplementation(() => local as unknown as Date);
  try {
    expect(deviceLocalFinancialDate().toString()).toBe('2026-10-02');
    expect(clock).toHaveBeenCalledTimes(1);
    Object.values(local).forEach(method => expect(method).toHaveBeenCalledTimes(1));
  } finally { clock.mockRestore(); }
});
