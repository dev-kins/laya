import type { SQLiteConnection } from './connection';

export const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';

/** Missing or malformed values are incomplete. Only the exact text "1" is complete. */
export function createOnboardingRepository(db: SQLiteConnection) {
  return {
    async isComplete(): Promise<boolean> {
      const row = await db.getFirstAsync<{ value: unknown }>(
        'SELECT value FROM app_preferences WHERE key = ?', ONBOARDING_COMPLETED_KEY,
      );
      return row?.value === '1';
    },
    async markComplete(): Promise<void> {
      await db.runAsync(
        'INSERT INTO app_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ONBOARDING_COMPLETED_KEY, '1',
      );
    },
  };
}
