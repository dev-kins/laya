import { registerRootComponent } from 'expo';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { openLayaDatabase } from './database';
import { validateSQLite } from './validation';

// Opt-in developer entry only. It renders no UI and is not imported by index.ts.
registerRootComponent(() => null);

async function run(): Promise<void> {
  if (!__DEV__ || !['android', 'ios'].includes(Platform.OS)) {
    throw new Error('SQLite native validation requires an Android/iOS development runtime.');
  }
  const filename = `laya-synthetic-validation-${Date.now()}-${Math.random().toString(16).slice(2)}.db`;
  try {
    const result = await validateSQLite(() => openLayaDatabase(filename));
    // Only validation status/driver classification; never log financial rows.
    console.info('LAYA_NATIVE_SQLITE_PASS', result);
  } finally {
    // Generated fixture filename only. Never delete laya.db on startup failure.
    await deleteDatabaseAsync(filename);
  }
}

void run().catch(() => {
  console.error('LAYA_NATIVE_SQLITE_FAIL');
  throw new Error('Native SQLite validation failed; inspect the synthetic harness.');
});
