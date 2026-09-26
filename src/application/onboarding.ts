import { openLayaDatabase } from '../persistence/sqlite/database';
import { createOnboardingRepository } from '../persistence/sqlite/onboarding';

// Two bounded operations for now: launch check and completion. No unused database
// connection is retained by the synthetic main app or a React component.
async function withRepository<T>(operation: (repository: ReturnType<typeof createOnboardingRepository>) => Promise<T>): Promise<T> {
  const db = await openLayaDatabase();
  let result: T;
  try {
    result = await operation(createOnboardingRepository(db));
  } catch (error) {
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([error, closeError], 'Preference operation and close failed.');
    }
    throw error;
  }
  await db.closeAsync();
  return result;
}

export const onboardingService = {
  isComplete: () => withRepository((repository) => repository.isComplete()),
  complete: () => withRepository((repository) => repository.markComplete()),
};
