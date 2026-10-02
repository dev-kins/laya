# Deterministic financial event generation

`generateFinancialEvents({ from, through, debts, incomes, essentialObligations,
debtPayments })` accepts validated domain entities and returns a frozen
`readonly FinancialEvent[]`. All arrays and both FinancialDate boundaries are
required; empty arrays are valid. It has no default horizon, clock, timezone,
randomness, persistence, logging, or monetary arithmetic.

FinancialEvent generation describes supplied financial facts and expectations.
It does NOT determine whether the user can afford something.

## Range and dates

The caller supplies an inclusive range; `from > through` rejects, including with
empty entity arrays. Dates retain the existing timezone-free proleptic Gregorian
FinancialDate contract, canonical YYYY-MM-DD, years 0001–9999. No timestamps or
device/Asia-Manila clock are read. Calendar comparison uses FinancialDate.

For recurring expected income and essential obligations, the supplied entity date
is a lower bound. Expansion calls existing `Recurrence.occurrences()` from the
later of that anchor and `from` through the inclusive end. The anchor is not an
extra event when it differs from a recurrence slot. No pre-anchor event is made.
There is no inferred end date beyond the caller's horizon.

## Entity rules

| Input | Events |
| --- | --- |
| Expected income without recurrence | One expected-income on its supplied date, if in range |
| Expected income with recurrence | Expected-income for each recurrence slot at/after its anchor in range |
| Received income | One received-income on its supplied receipt date, if in range; the existing model prohibits recurrence |
| Essential obligation without recurrence | One essential-due on its supplied date, if in range |
| Essential obligation with recurrence | Essential-due for each slot at/after its anchor in range |
| Debt | Requires both scheduledPayment and nextDueDate; explicit due plus later recurrence as below |
| Debt payment | One debt-payment fact on its supplied date, if in range; source identity is the payment ID |

Valid zero income, essential amounts, and scheduled debt payments produce no
events. They remain valid entities; FinancialEvent's positive-amount invariant
is unchanged. DebtPayment is already strictly positive. Every emitted amount
retains its exact supplied PHP minor units, including Number.MAX_SAFE_INTEGER.

## Debt cycle replacement — approved Task #017 policy

**An explicit next due date replaces the debt's normal recurring occurrence(s)
for that calendar month. Normal recurrence resumes in the following month.**

The explicit nextDueDate represents exactly one debt-due event, included only
when in range. This applies with or without recurrence, and whether the date
matches the requested schedule. All other slots in that calendar month are
suppressed, including later slots and twice-monthly collisions. From the next
calendar month, the full original recurrence resumes, still bounded by the
requested range. A range starting after the explicit date does not reset this
cycle rule or manufacture a replacement event at `from`.

Synthetic examples:

- October 10, 15, or 20 with monthly(15): that explicit October date, November 15,
  December 15. No additional October occurrence.
- January 30 with monthly(31): January 30, February 28 (29 in a leap year),
  March 31. No January 31 event.
- October 19 with twiceMonthly(4, 19): October 19, November 4/19, December 4/19.
  No October 4 or duplicate October 19 event.

This is scheduling semantics only. It does not mean the debt or earlier
occurrences were paid, overdue debt was forgiven, the balance was reconciled,
scheduled payment changed, or interest was calculated. Missing schedule data is
never inferred from balance, interest, recurrence alone, or payment history.
Balance (even zero or less than scheduledPayment) never caps or suppresses an
otherwise eligible event. Known/unknown interest has no effect.

## Recurrence, identity, ordering

Month lengths and clamping remain exclusively in Recurrence. Each slot retains
its original requestedDay in the key `requested-day:<day>`. For example, 30 and
31 can both clamp to February 28 and remain distinct events. The next month uses
the original requested days. One-time events and explicit debt next-due events
use `one-time`; an explicit debt event is one obligation even when normal slots
would collide there.

Existing FinancialEvent identity combines kind, source ID, actual date, and
occurrence key. Keys do not depend on range, array index, names, or random IDs.
Repeated calls and overlapping ranges preserve identities for unchanged inputs.
Identity stability does not imply reconciliation across later entity edits.

The final result uses existing `sortFinancialEvents`: date, then essential-due,
debt-due, debt-payment, received-income, expected-income, then case-sensitive
UTF-16 source/occurrence-key order. This is conservative ordering, not advice or
financial priority. Input order has no effect; inputs are not mutated or frozen
by the generator. Output and event-owned values are immutable.

Duplicate generated identities throw through the existing sorter, including
conflicting amounts. Nothing is silently deduplicated. Duplicate source records
that emit no in-range events do not themselves trigger this event-identity check.
The API assumes validated entities; it is not a raw DTO ingestion or repository
integrity validator.

## Reconciliation limitations and Task #018

**Expected and received records may describe the same real-world income. Both
can appear here. Task #018 must not blindly count them as independent guaranteed
cash.** No matching by name, amount, date, or other heuristic is performed.

Similarly, debt-due and actual debt-payment events can coexist, even for the same
debt/date. They are not automatically two independent payable outflows. No payment
is applied to balances or linked to satisfying a scheduled occurrence here.

Historical events outside the range are excluded, never shifted to `from`.
Recurring future slots can still appear normally. This does not establish that
historical obligations are paid; unpaid overdue state, arrears, missed income,
and rolled-forward bills need explicit future semantics.

AvailableMoney is not accepted, read, or converted into an event. No starting,
running, ending, or minimum balance is calculated. There is no Safe-to-Pay,
affordability, risk classification, interest calculation, or advice. Future
projection must separately resolve reconciliation and the dated starting-money
boundary. Task #017 adds no SQLite aggregation, schema, repository, UI, navigation,
or runtime entry changes.

## Validation

`src/domain/generateFinancialEvents.test.ts` uses synthetic data for inclusive and
reversed ranges, date bounds, recurring anchors, debt cycle replacement, month-end
and leap-year behavior, collisions, zero filtering, safe monetary limits,
coexistence, ordering, duplicates, immutability, repeated/shuffled inputs,
overlapping ranges, and prohibited clock/randomness/arithmetic dependencies.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.
Android export is not required for this pure module with no runtime/UI changes.
