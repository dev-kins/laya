test('executes a pure TypeScript function', () => {
  const normalizeLabel = (label: string): string => label.trim().toLowerCase();

  expect(normalizeLabel('  LAYA  ')).toBe('laya');
});
