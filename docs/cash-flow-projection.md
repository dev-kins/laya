# Deterministic cash-flow projection

A projection is a deterministic scenario derived from the supplied starting
balance and scheduled future events. It is not a bank balance, guarantee, or
financial recommendation.

`projectCashFlow({ startingBalance, startDate, through, events })` returns an
immutable `CashFlowProjection`. Inputs are existing Money, FinancialDate, and
validated immutable FinancialEvent instances, not raw JSON/storage rows. All
arguments are required. The module has no clock, timezone, network, global state,
persistence, UI, or default horizon. It does not generate events itself.

## Starting snapshot and window

The nonnegative PHP starting balance is the money the user reports as currently
available for their financial plan at the supplied startDate snapshot boundary.
Zero is valid. The existing validation helper copies/revalidates Money, rejecting
negative amounts, invalid currency, unsafe minor units, or raw substitutes.
Nothing is derived from income, debt balances, expenses, payments, or accounts.

The projection window is **(startDate, through]**. Only dates strictly later than
startDate and no later than through can participate. The caller chooses both
FinancialDates; reversed ranges reject. Equal dates produce no applied points.
The existing timezone-free Gregorian date contract is retained; no timestamps,
date shifting, calendar defaults, or timezone conversion are introduced.

AvailableMoney has no as-of time. The engine therefore cannot determine which
start-day events are already reflected in the manual snapshot. Excluding all
startDate events is the explicit V1 boundary convention: it avoids guessing their
relationship to that snapshot. It does not prove they happened or were paid, or
guarantee that excluding remaining same-day obligations is financially cautious.

Synthetic example: PHP 8,200 on October 2, with an October 2 expense of PHP 500,
an October 3 expense of PHP 1,600, and October 4 expected income of PHP 4,500,
produces points at PHP 6,600 and PHP 11,100. The October 2 event is excluded.

## Forecast policy and audit

| Event kind in the window | Treatment |
| --- | --- |
| expected-income | Add amount using Money.add |
| essential-due | Subtract amount using Money.subtract |
| debt-due | Subtract amount using Money.subtract |
| received-income | Exclude from arithmetic as an actual fact |
| debt-payment | Exclude from arithmetic as an actual fact |

Actual receipts and payments may already be included in the current reported
money. Applying them again risks double-counting. They are valid inputs and do
not cause rejection merely because they exist.

`excludedEvents` contains frozen `{ event, reason }` entries:

- `outside-window`: before/on startDate or after through, regardless of kind.
- `actual-event`: received-income or debt-payment strictly inside the window.

Range exclusion takes precedence. An actual event outside the window is reported
once as outside-window; its kind still identifies it as an actual. Out-of-range
entries are audit information only, not participants in the projection window.
They do not affect balances, points, or minima. No synthetic zero-change points
are created for actuals. Audit data is returned to the caller, never logged.

## Ordering, arithmetic, and result

All supplied events are passed to existing `sortFinancialEvents` **before**
filtering. Duplicate identities reject even when duplicated events would be
excluded by date or kind. Events are never merged, deduplicated, or netted.

Existing order remains date, essential-due, debt-due, debt-payment,
received-income, expected-income, then case-sensitive source and occurrence key.
The applied points and excluded entries each preserve this deterministic order.
Caller array order has no effect.

Same-day applied outflows precede expected inflows. With PHP 1,000, an expense of
PHP 800 and expected income of PHP 2,000 produce PHP 200 then PHP 2,200. The
intermediate balance is retained; this is an ordering convention without
timestamps, not payment advice or priority.

The result contains:

- `start: { date, balance }`: the immutable snapshot point.
- `through`: the explicit inclusive end date.
- `points: { event, balanceAfter }[]`: one point per applied forecast event.
- `excludedEvents`: the audit entries described above.
- `endingBalance`: the final balance, value-equivalent to startingBalance when
  no forecast events are applied.
- `minimumProjectedBalance`: the minimum of start and every applied point.
- `minimumBalanceDate`: the date of the first occurrence of that minimum in
  deterministic order. Start wins ties with later points; later equal minima
  never replace the first date.

There are no synthetic daily points. Negative projected balances are valid:
PHP 500 minus PHP 800 is PHP -300. A later recovery does not erase that minimum.
There is no separate fallsBelowZero property because a negative
minimumProjectedBalance already expresses that numerical fact. No status label
or interpretation is attached to it.

All arithmetic uses existing Money methods, preserving exact integer centavos
and PHP identity. Every intermediate result must fit the signed safe-integer
range. Positive or negative overflow rejects the entire call through Money's
existing error, even if a subsequent event could restore a valid balance. No
rounding, clamping, saturation, or alternate numeric representation is used.

Result, start, arrays, points, and exclusion entries are frozen. Nested Money,
FinancialDate, and FinancialEvent values are immutable domain values. Supplied
arrays and values are not mutated or frozen by the engine. Repeated equivalent
inputs produce equivalent results without requiring new reference identities.

## Reconciliation limitations

Expected and received income on the same date can both be supplied. Expected
income is applied; received income is audit-only. This prevents arithmetic
double-counting of actual receipts against the current Available Money snapshot,
but it is NOT reconciliation. The expected forecast may itself be stale if the
user has already received it without updating/remediating their expected record.

Likewise a debt due is applied while an actual payment is excluded. The due may
already have been satisfied and still be stale. There is no inferred satisfaction
from amount, date, debt ID, proximity, or any other matching heuristic. These are
known V1 limitations requiring explicit future reconciliation semantics.

## Layer boundaries and future Timeline

Task #017 independently generates FinancialEvents from validated entities.
Task #018 consumes those events plus Money and an explicit date boundary. Higher
application layers may compose the two and load persisted AvailableMoney later.
AvailableMoney, its storage, and the event generator remain unchanged. No date,
timestamp, freshness flag, account, or persistence dependency is added here.

Task #019 may present these derived points and audit exclusions in Timeline under
a separate specification. This task adds no Timeline UI, other screens,
navigation, database access, migrations, repositories, or saved projections.
It computes no Safe-to-Pay, protected/discretionary/spendable money, reserve,
affordability, Covered/Tight/At-risk statuses, thresholds, advice, warnings,
recommendations, or debt strategies.

## Validation

Focused synthetic tests cover date boundaries, all five event kinds, exclusion
precedence, same-day intermediate balances, zero/negative/recovery scenarios,
first-minimum tie behavior, safe-integer limits and intermediate overflow,
coexistence without reconciliation, duplicates before filtering, immutable and
deterministic outputs, calendar bounds, external composition with Task #017, and
absence of clock/timezone/randomness dependencies.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.
Android export is not required for this pure module with no runtime-entry or UI
changes. Tests do not claim native device verification.
