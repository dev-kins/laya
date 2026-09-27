# SQLite foundation

`openLayaDatabase()` asynchronously opens `laya.db` on an owned connection,
enables and verifies `foreign_keys`, requests WAL, and finishes migrations before
returning. Repositories receive this connection from their application owner,
which must close it after the operations it owns have finished.
Startup failures propagate and release the connection, never delete/reset data.
Application startup now uses this module through the onboarding service. The
launch check and completion are bounded operations with owned connections; see
`docs/onboarding.md` for lifecycle and persisted semantics.

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

Version 2 adds only `app_preferences` for local onboarding completion. The
preference repository treats only exact text `"1"` as complete.

## Financial persistence (schema version 3)

Migration 3 adds `debts`, `incomes`, `essential_obligations`, and `debt_payments`.
Versions 1 and 2 remain unchanged; their probe and preferences/onboarding data
survive the upgrade. FinancialEvent is derived domain data and is NOT persisted.

- Money columns contain nonnegative INTEGER PHP centavos, with an explicit
  `currency = 'PHP'` column per entity. Debt's balance and optional scheduled
  amount share that currency. Zero remains valid for debt balances, scheduled
  amounts, income and obligations; payment amounts must be positive. All values
  must fit JavaScript's safe-integer range. No formatted amounts or peso REALs.
- Financial dates are canonical `YYYY-MM-DD` TEXT, reconstructed through
  FinancialDate; they are calendar dates, never timestamps or timezone conversions.
- Debt interest uses `interest_kind`, nullable `interest_basis_points`, and nullable
  `interest_period`. Unknown requires both nullable fields absent; known requires
  a nonnegative safe integer rate and `monthly` or `annual`. Known zero is distinct
  from unknown. No interest calculation is performed.
- Recurrence uses nullable `recurrence_kind`, `recurrence_day_1`, and
  `recurrence_day_2`. Absent means all NULL; monthly has one day; twice-monthly has
  two strictly increasing days in 1–31. Requested anchors 30/31 survive unchanged.
  No occurrences are generated or stored. Received income cannot recur.
- Debt's scheduled amount, next due date and recurrence are independently nullable;
  no mapper fills missing information. Names/provider labels must already be
  canonical; corrupt padded text is rejected rather than trimmed during reads.
- Branded IDs are exact, case-sensitive TEXT reconstructed through domain ID
  factories. Persistence never generates IDs. Payment `debt_id` references `debts.id`
  with `ON DELETE RESTRICT ON UPDATE RESTRICT`; historical payments must not
  disappear implicitly. An index supports that reference. No deletion API exists.
  Historical payment amounts may exceed today's balance and never change it.

`createDebtRepository`, `createIncomeRepository`,
`createEssentialObligationRepository`, and `createDebtPaymentRepository` accept
an injected, initialized `FinancialConnection` (implemented by Expo SQLite).
The caller owns opening, migration and closing; repositories do none of these.
They expose only async `save(entity)`, `getById(brandedId)`, and `list()`:

- Save revalidates a domain entity, then atomically upserts its complete snapshot.
  Same ID updates all fields, including clearing absent optional fields. It uses
  `ON CONFLICT DO UPDATE`, not delete/reinsert, retaining payment references.
- Get returns a reconstructed entity or `null` for absence. Corruption and I/O
  failures reject; they never appear as missing data.
- List reconstructs every row and rejects the whole operation on corruption.
  It orders by `id COLLATE BINARY` (SQLite binary text ordering), which conveys no
  financial priority and is not FinancialEvent's same-day ordering.

Internal mappers validate storage shapes, reconstruct Money, FinancialDate,
Recurrence and branded IDs, then call entity factories. SQL constraints and
domain validation complement each other. Numeric SELECT expressions validate
type/range in SQLite before the bridge converts numbers. For optional financial
columns, an invalid value returns a text sentinel rather than NULL, preserving
the distinction between absent and corrupt. Payment reads also reject orphaned
references from databases externally modified with FK enforcement disabled.
No mapper coerces corrupt values, skips rows, reads the clock or logs row contents.
Debt, income, and essential-obligation repositories now serve their respective
application/UI flows through bounded owned connections.

## Available money (schema version 4)

Migration 4 appends `available_money`, preserving versions 1–3. Its INTEGER primary
key is constrained to 1, enforcing zero or one current snapshot. No default row
is created. Nonnegative INTEGER centavos are constrained to the safe-integer
range with explicit PHP currency. A bound UPSERT replaces the same row.

`createAvailableMoneyRepository` exposes `get()` / `save(snapshot)` on an injected
connection. SQL guards both amount and singleton key before numeric conversion;
unfiltered reads also reject extra rows, invalid currency, and corrupted values.
Missing returns null, distinct from saved zero. Application read/save operations
close their own connections before returning success and preserve combined
operation/close errors. See `docs/available-money.md` for semantics, tests, and the
pending physical Android checklist.

## Integer boundary

SQLite INTEGER is signed 64-bit, wider than JavaScript's safe-integer range.
The read adapter uses SQLite `typeof` and range checks before returning a numeric
column. Invalid storage yields NULL and is rejected by `Money.fromMinorUnits`.
This NULL policy applies to the mandatory infrastructure probe amount; financial
repositories use the sentinel described above so optional values stay unambiguous.
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
- `npm test -- --runTestsByPath src/persistence/sqlite/financial.host.test.ts`:
  real migration-3 upgrade/rollback/retry, preserved preferences/probe, foreign-key
  restrictions, entity round trips and upserts, reopen persistence, stable ordering,
  SQL constraints and deliberately corrupted storage. All fixtures are synthetic.
- `npm run typecheck`, `npm run lint`, `git diff --check`: standard checks.

The shared integration harness checks WAL/foreign keys, five signed Money/date
round trips including safe-integer limits, close/reopen persistence, migration
version skipping, failed DDL/data rollback, retry after reopen, newer-version
rejection, and malformed/unsafe stored values. Only disposable synthetic databases
may be passed to it. Host integration cannot prove Expo APIs or Android behavior.
It also saves/reopens a zero-balance debt with known-zero annual interest and
requested days 30/31, plus a positive historical payment above that balance;
it checks repository reads/list and restricted deletion. `financialRoundTrips: 2`
is reported only when those assertions pass. The shared harness was executed on
host SQLite for Task #011; the native entry itself was not executed.

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
