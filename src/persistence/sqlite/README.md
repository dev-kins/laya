# SQLite foundation (infrastructure only)

`openLayaDatabase()` asynchronously opens `laya.db` on an owned connection,
enables and verifies `foreign_keys`, requests WAL, and finishes migrations before
returning. Future repositories receive this connection. Open once per application
lifecycle; explicit closing is primarily for tests/development or shutdown.
Startup failures propagate and release the connection, never delete/reset data.
The module is not wired into `App.tsx` or `index.ts` in this task.

Migrations are contiguous from version 1, tracked by `PRAGMA user_version`.
Each migration and version write commits atomically under `BEGIN EXCLUSIVE`.
On failure only that migration rolls back; earlier committed migrations remain.
The version is read under the transaction lock. Newer schemas are rejected.
Run only at startup before exposing the connection; migration functions must not
manage transactions or versions. Released migrations must never be edited.
Explicit transactions retain connection-local foreign keys; Expo 57's
`withExclusiveTransactionAsync` opens a separate connection.

Version 1 creates only `infrastructure_probe`: text id, integer minor units,
explicit currency, and canonical financial-date text. It is a synthetic persistence
fixture, not a product entity. Numeric type/range and PHP currency have SQL CHECK
constraints; complete date validation occurs through FinancialDate. Future product
schema design must deliberately retire this fixture via a new migration.

## Integer boundary

SQLite INTEGER is signed 64-bit, wider than JavaScript's safe-integer range.
The read adapter uses SQLite `typeof` and range checks before returning a numeric
column. Invalid storage yields NULL and is rejected by `Money.fromMinorUnits`.
Currency and dates are also reconstructed through public domain factories.
Money validation cannot recover precision already lost by a native conversion.
No bigint storage/bindings are introduced.

Observed on Node 24.13.1 / SQLite 3.51.2: SQL stores `9007199254740993` exactly
(verified with CAST AS TEXT); Node's default numeric read rejects it. The guarded
adapter rejects it safely. This is NOT an observation of Expo's native bridge.
The native harness separately classifies raw reads as driver-rejected or unsafe
numbers; neither is relied on for adapter safety.

## Validation

- `npm test`: existing tests, explicitly labeled unit doubles, and real host SQLite.
- `npm test -- --runTestsByPath src/persistence/sqlite/sqlite.host.test.ts`: real
  file-backed host integration using Node's built-in SQLite (use Node 24.13.1+).
  Node emits an experimental SQLite warning. No additional test package is used.
- `npm run typecheck`, `npm run lint`, `git diff --check`: standard checks.

The shared integration harness checks WAL/foreign keys, five signed Money/date
round trips including safe-integer limits, close/reopen persistence, migration
version skipping, failed DDL/data rollback, retry after reopen, newer-version
rejection, and malformed/unsafe stored values. Only disposable synthetic databases
may be passed to it. Host integration cannot prove Expo APIs or Android behavior.

For an Android device/emulator with an SDK-57-compatible Expo Go/development build,
temporarily select the opt-in native entry (from the repository root):

```powershell
npm pkg set main=src/persistence/sqlite/native-validation.entry.ts
npx expo start --android --clear
# After stopping Metro, restore the normal entry even if validation failed:
npm pkg set main=index.ts
```

Confirm `LAYA_NATIVE_SQLITE_PASS` in the native/Metro console and record device/OS
and driver classification. A failure is not a pass. The entry renders no UI and
uses a uniquely named synthetic database, closing and deleting only that fixture.
Normal application entry files remain unchanged. Metro bundling alone is not
native validation. This workspace has no configured adb/Android SDK; the native
harness has not been executed here.

## Pre-beta privacy gates

Development databases contain synthetic data only. Encryption at rest is NOT
implemented or claimed. Encryption and Android cloud-backup/device-transfer behavior
remain separate pre-beta decision gates. Do not use real user financial data until
those decisions are explicitly reviewed. No backup, export, or recovery feature
is implemented here.
