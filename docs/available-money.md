# Available money

Available Money is **the money the user currently has available to use for their
financial plan**. It is a manually reported aggregate PHP amount. Laya neither
knows individual account amounts nor verifies the user's report.

Available Money is NOT bank synchronization, account aggregation, a transaction
ledger, a calculated balance, or Safe-to-Pay. There are no accounts, transfers,
history, remote calls, or automatic adjustments from income, debt, expenses, or
payments. Home remains synthetic and Timeline is unchanged.

## Domain and input

`AvailableMoney.create({ amount })` revalidates and copies existing `Money`, then
freezes the snapshot. PHP zero is valid; negative values, invalid Money objects,
and unsafe integers reject. The maximum is 9007199254740991 centavos. No rounding
or monetary arithmetic occurs.

The application parses text using existing `Money.parse(text, 'PHP')`: surrounding
whitespace follows that parser, and one or two fractional digits are exact. Blank,
currency symbols, grouping commas, excess precision, negatives, and unsafe values
reject. `formatMoneyInput` places the decimal point in integer digit strings for
exact editable prepopulation, including the safe-integer maximum. It is a display
formatter, not another parser.

No snapshot is `null`, distinct from a snapshot containing zero. Missing data
renders “Not set” and an empty field. Explicit zero renders PHP 0.00 and editable
`0.00`; it is never substituted for absence.

## SQLite and ownership

Migration 4 adds `available_money`; migrations 1–3 are unchanged. Existing probe,
onboarding, debt, income, essential-obligation, and payment records survive.
The existing migration transaction atomically commits the table and user_version;
failure rolls back and supports retry.

- `singleton_id`: INTEGER PRIMARY KEY NOT NULL, constrained to 1.
- `amount_minor_units`: INTEGER NOT NULL, SQL typeof integer and range
  0 through 9007199254740991.
- `currency`: TEXT NOT NULL, exactly PHP.

There is no default row. These constraints allow zero or one current snapshot.
`createAvailableMoneyRepository(db)` exposes only `get()` and `save(snapshot)`.
Save revalidates the domain object and uses one bound SQL UPSERT at key 1, atomically
creating or replacing the current value. There is no history or deletion API.

Read guards the monetary type/range in SQLite before bridge conversion; invalid
values become a text sentinel and reject through the mapper. The singleton key
is also guarded before conversion. Reading up to two unfiltered rows detects
externally corrupted extra rows or invalid keys rather than hiding them. Invalid
currency and I/O failures reject; none are reported as missing or normalized.

`readAvailableMoney` and `saveAvailableMoney` each own a bounded initialized
connection: open, repository operation, close, then return. Save parses before
opening. Repositories never open or close connections. An operation failure still
closes; operation plus cleanup failure produces an AggregateError retaining both.
A cleanup-only failure rejects, so UI success requires completed cleanup. If the
write committed before cleanup failed, retrying replaces the same singleton.

## Screen and navigation

Add Hub offers a restrained “Set available money” entry into the existing Add
stack. The hub does not read/display an amount. No bottom tab is added.

Each editor visit reads once. Loading, read failure, missing, and existing values
are distinct. Read failure hides the form and offers Retry without exposing raw
errors. Leaving and reopening reloads persistence; switching tabs within the same
mounted editor preserves unsaved input. Late responses after unmount are ignored.

A synchronous guard prevents duplicate saves. Saving disables editing/back/save,
blocks route removal, and exposes busy semantics. Failure preserves input and
allows another save. Success shows the exact saved amount, “Available money
updated,” a future-planning explanation, and Done back to Add.

The screen reuses Laya tokens and existing financial controls: visible/accessibly
named amount field, spoken Philippine-peso values, textual errors, loading/status
announcements, font scaling, adequate touch targets, safe areas, and a scrollable
keyboard-avoiding layout. Native layout and screen-reader review remain pending.

## Future boundary and privacy

No as-of date or timestamp is needed to store this manual input, so none is added.
This does **not** establish a dated opening balance or prove freshness. Future
projection work must explicitly decide the effective starting date, freshness,
and reconciliation with dated income/payments before consuming it. There are no
clock reads, event generation, projections, or Safe-to-Pay calculations here.

The amount is sensitive local SQLite data. No amount, raw row, or SQL error is
logged, sent to analytics, or transmitted. Existing encryption/backup decision
gates remain unchanged; this task adds no export, deletion, or recovery workflow.
All test/documentation examples are synthetic.

## Validation and physical Android checklist

Domain, application lifecycle, real file-backed host SQLite, formatter, and
component behavior tests cover boundaries, migration rollback/retry, replacement,
reopen persistence, corruption, failures, exact prepopulation, and duplicate saves.
Run `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, and
`npx expo export --platform android`. Host SQLite and bundling do not verify the
native bridge or physical app persistence.

DK must confirm this feature on Android using synthetic data:

1. Open Add → Set available money. On a database without a snapshot, verify
   “Not set” and an empty input. Save `8200.50` and verify success.
2. Fully terminate and relaunch the app. Reopen Available money and verify
   PHP 8,200.50 and exact editable `8200.50` are restored.
3. Replace with `6750.25`. Save, fully terminate, relaunch, and reopen. Verify
   PHP 6,750.25 is current and the previous value is not another current snapshot.
4. Replace with `0`, save, terminate, and relaunch. Verify PHP 0.00 / editable
   `0.00` survives and is distinct from “Not set.”
5. Check keyboard reachability, enlarged text, TalkBack labels, back/Done,
   invalid-input feedback, and preservation of the existing three verticals.

Physical Android verification of Available Money is pending DK confirmation.
