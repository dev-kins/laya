# Real financial Timeline — Task #019

Timeline answers what scheduled events come next and how each affects a scenario
starting with the user's manually reported Available Money. It reads real local
records; Home remains a clearly labeled synthetic showcase.

## Composition and ownership

`loadTimeline(overrides?)` returns either `missing-available-money` with calendar
boundaries or `ready` with the existing cash-flow projection and named date groups.
Dependencies allow injection of the date provider, opener, repository factories,
generator and projector for deterministic tests.

The pipeline is initialized SQLite → five repositories → validated domain entities
→ `generateFinancialEvents()` → `projectCashFlow()` → named groups → TimelineScreen.
The repositories are AvailableMoney, Debt, Income, EssentialObligation and
DebtPayment. There are no financial calculations or SQL in the screen.

One operation owns one initialized, dedicated connection. Sequential reads run
inside `BEGIN DEFERRED` / `COMMIT`, using the existing connection API. With the
existing WAL configuration, the first read establishes a snapshot shared by all
five reads; separate writers cannot change that snapshot mid-load. A file-backed
host test verifies concurrent-write isolation. See SQLite's
[isolation documentation](https://www.sqlite.org/isolation.html).

The read transaction ends before pure composition. Failed transactions attempt
rollback, and all successfully opened connections attempt close exactly once.
Read/composition/rollback and close errors are preserved through AggregateError;
close-only failures also reject. Success returns only after close completes.
Failed initialization cleanup remains the existing opener's responsibility.
All five reads are validated even when Available Money is missing.

## Clock and horizon

`deviceLocalFinancialDate()` is the single clock boundary. It captures one JS Date,
uses local year/month/day immediately to create FinancialDate, and never converts
through UTC. `loadTimeline` invokes its injectable `today` provider once per load,
including Retry and focus refresh. Tests inject fixed calendar dates. No Date
enters the pure financial domain or calendar display formatter.

V1 Timeline specifically uses the device's local calendar date. It adds no saved
timezone, as-of timestamp or time-of-day boundary to Available Money. A changed
device timezone/date can change the next load's window. No midnight timer or
background refresh is introduced; reload happens on navigation focus or Retry.

`timelineThrough` advances 60 calendar days with FinancialDate's existing public
parts, daysInMonth and fromParts methods. It handles month/year/leap boundaries,
never milliseconds. A horizon beyond year 9999 rejects instead of truncating it.
Generation covers `[startDate, through]`; projection owns `(startDate, through]`.
Today is the starting snapshot, not a balance-changing event date. Since Available
Money has no time-of-day boundary, today's events cannot safely be replayed.

## Financial meaning and presentation

- Missing Available Money produces a setup state without generation or projection.
  Set available money opens the existing editor in the Add stack. Done returns
  to the hub; selecting Timeline again refreshes it.
- Persisted zero is valid and runs the real projection, including negative results.
- Maps resolve names from the already-loaded income, expense and debt entities.
  There are no per-event queries. An unresolved applied source rejects explicitly.
- Only applied expected income, essential expense and debt due points appear.
  Actual receipts and payments stay in the projection's internal exclusions and
  do not appear as balance-changing rows. Start-day events are also excluded.
- Adjacent points are grouped by calendar date without re-sorting. The exact
  conservative same-day order and every intermediate balance are preserved;
  events are never netted into one row. Recurrence remains entirely in #017.
- Existing exact integer-digit PHP formatting shows inflow `+`, outflow `−` and
  signed negative projected balances without rounding or clamping. Calendar date
  labels use FinancialDate parts, not JS Date conversions.
- No reconciliation is performed. Received income does not cancel expected income;
  payments do not cancel scheduled dues. Stale expected/due records can therefore
  remain in the scenario and need user attention. This is neither a bank balance
  nor a guarantee. No interest calculation, advice, Safe-to-Pay or status
  classification is added.

Loading clears old content and is distinct from missing, empty and error. An empty
projection retains the current snapshot and says only that Laya has no scheduled
forecast items in this 60-day window. Any failure displays generic local-data copy
and Retry, never SQL, paths, stacks or financial logs. Each focus starts a fresh
load; request generations ignore older successes/failures and results after blur
or unmount, while application cleanup continues normally. No global state is added.

Cream, deep green, restrained gold, editorial headings and a simple vertical path
follow the canonical board. This is not the final visual-fidelity pass. Existing
scrolling, safe-area ownership, scalable wrapping text and accessible button targets
are retained. Each row's screen-reader label includes date, source name, event
type, Philippine pesos, inflow/outflow and projected balance including spoken minus.
Meaning does not depend on color or glyphs alone.

## Validation and physical Android checklist

Automated coverage includes calendar boundaries, service composition and failures,
snapshot isolation, persistence/reopen, missing versus zero, names, exclusions,
recurrence/horizon, exact balances, loading/error/retry, real navigation, focus
refresh, stale success/failure, and text/accessibility properties. Android export
checks bundling, not physical SQLite bridge, TalkBack, keyboard or rendering.

DK: use only synthetic data in a test installation/profile. Do not reset production
data. Existing records can affect totals; use an otherwise empty synthetic dataset
for the exact values below. Let D be the device's local date at test time.

1. With Available Money unset, open Timeline and verify setup. Use Set available
   money, enter `8200.50`, save, Done, then return to Timeline.
2. Add expected income `Salary Timeline Test`, `4500`, D+1, no recurrence.
3. Add essential expense `WiFi Timeline Test`, `1600`, D+1, no recurrence.
4. Add debt `Debt Timeline Test`, balance `10000`, scheduled payment `1764`,
   due D+1, unknown interest, no recurrence.
5. Add a second expense `Transport Timeline Test`, `100`, D+2, no recurrence.
6. Open Timeline. Verify starting snapshot D and ₱8,200.50, then D+1 before D+2.
   On D+1, WiFi precedes debt, then salary, with balances ₱6,600.50 → ₱4,836.50
   → ₱9,336.50. D+2 transport produces ₱9,236.50. Check signs and labels.
7. Fully terminate and relaunch. Reopen Timeline; verify it rebuilds from persisted
   records. If midnight passed, the new snapshot date intentionally moves the
   window and excludes events now dated at/before its start.
8. Change Available Money through Add to `9000`; return to Timeline. Verify
   ₱7,400.00 → ₱5,636.00 → ₱10,136.00 → ₱10,036.00.
9. Set it explicitly to `0`. Return and verify this is not setup: ₱0.00 starts
   the projection, then -₱1,600.00 → -₱3,364.00 → ₱1,136.00 → ₱1,036.00.
   No Covered/Tight/At risk classification or spending advice should appear.
10. Inspect large text, long names and scrolling; verify editor keyboard access.
    With TalkBack, check date groups, full row meanings, negative balances,
    navigation actions and loading/error announcements.

Physical Android validation and final visual comparison remain pending DK's review.
No domain, repository, schema, migration or dependency changes are part of #019.
