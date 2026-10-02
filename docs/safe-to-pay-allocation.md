# Proposed extra-payment allocation — Task #025

**Safe-to-Pay is a hard ceiling for proposed extra-payment allocation.**

**Proposed allocations are not executed payments and do not modify reported debt balances.**

**Unused Safe-to-Pay capacity remains unallocated when recorded debt balances are exhausted.**

## API and inputs

`allocateSafeToPay({ orderedDebts, safeToPay }): SafeToPayAllocationResult` is a
pure synchronous domain function. Inputs are an explicitly ordered collection of
validated Debt entities and an upstream `SafeToPayResult`. The sole budget is
`safeToPay.amount`, not Available Money, income, projected ending balance, or a
separately computed minimum. The allocator does not generate events, rerun
projection, calculate Safe-to-Pay, or select a strategy.

The frozen result contains:

- `allocations`: frozen positive-amount entries, each with the original `debt`
  reference, proposed extra-payment `amount: Money`, and `coverage: 'full' | 'partial'`.
- `totalAllocated: Money` and `remainingSafeToPay: Money`.
- `protectionStartDate` and `protectionThroughDate`, validated immutable copies
  of the supplied calendar dates with identical values. No horizon is extended
  or defaulted, and no clock is read.

## Sequential allocation

Caller order is authoritative. For each positive reported balance, allocate the
smaller of remaining capacity and that balance. Equal or greater remaining
capacity yields `full` coverage of that reported snapshot; less yields `partial`
coverage. Subtract the allocation from remaining capacity. Stop allocating when
capacity reaches zero or the order ends. Changing input order can change which
debts receive allocations; identical ordered input produces identical content.

No zero-value entries are emitted. Zero Safe-to-Pay produces empty allocations
and zero totals/remainder. An empty order leaves the entire budget unallocated.
Zero-balance records consume nothing and are skipped without changing the caller's
order or declaring them paid, settled, complete, or closed. Excess capacity stays
unallocated; it is not overpaid, redirected, or converted to savings.

For PHP 3,000 capacity with A = PHP 1,500 and B = PHP 2,000, the proposal is
A = PHP 1,500 full and B = PHP 1,500 partial, total PHP 3,000, remainder PHP 0.
For PHP 10,000 capacity with A = PHP 2,000 and B = PHP 3,000, both are full,
total PHP 5,000, remainder PHP 5,000. Full describes coverage of the reported
balance only; it is not evidence of payment or a guarantee of lender settlement.

## Exactness and validation

Existing Money comparison/subtraction preserves integer PHP centavos. There is
no floating-point percentage calculation, rounding, currency conversion, or
raw number monetary arithmetic. Every allocation is positive and no greater
than its reported balance. Total allocated cannot exceed the original budget.
`totalAllocated + remainingSafeToPay` equals that budget exactly.

Remaining capacity only decreases within `[0, budget]`. Total is derived as
`budget.subtract(remainingSafeToPay)`, so summing potentially enormous reported
balances is unnecessary. Multiple valid balances may have a combined value above
MAX_SAFE_INTEGER without causing an unnecessary overflow in this bounded result.

Before any allocation, the entire debt collection is checked for Debt instances,
duplicate IDs, and valid nonnegative PHP Money balances, including entries beyond
the point where capacity would be exhausted. Duplicate IDs reject explicitly,
including repeated references and zero-balance records; no partial result is
returned. Debt objects are not reconstructed. Other Debt fields remain governed
by the validated entity contract, not a new raw-data ingestion API.

Safe-to-Pay Money and FinancialDates are revalidated using existing helpers.
Negative/unsafe/fractional amounts, unsupported currency, raw substitutes, and
reversed windows reject. Equal-date windows are valid. Validation does not
reconstruct or certify the upstream projection or establish data freshness.

## Ordering composition

Ordering remains separate from allocation. Callers can supply:

- Snowball: `orderDebtsForStrategy({ strategy: 'snowball', debts }).orderedDebts`.
- Avalanche: `orderDebtsForStrategy({ strategy: 'avalanche', debts }).orderedDebts`.
- Adaptive: `orderDebtsForLayaAdaptive({ debts, safeToPay }).orderedEntries.map(entry => entry.debt)`.

The allocator neither imports these engines nor inspects their strategy or
category metadata. Any valid caller-supplied order is supported unchanged.
Task #024 classification is individual: A = PHP 1,500 and B = PHP 2,000 both
qualify at PHP 3,000. Task #025 allocation is cumulative: A receives PHP 1,500
full, then B receives PHP 1,500 partial. Classification never reserves capacity.

## Limits and immutability

Scheduled payments are not added to proposed extras. Scheduled obligations were
already considered upstream to the extent recorded in the projection; adding
them here would double-count protection. Due dates, recurrence, names, providers,
and interest do not reorder the supplied debts. DebtPayment history is not an
input, is not subtracted, and does not cancel scheduled dues.

Debt.balance remains a user-reported snapshot. No new balance is calculated or
returned, no debt is marked complete, and no DebtPayment record is created.
No payment is executed, no allocation is persisted, and no lender transaction is
implied. The proposal cannot establish actual settlement amounts or data accuracy.
There is no payoff date, future interest, amortization, savings claim, automatic
strategy selection, or assertion of optimality or the best financial decision.

The result, allocation collection, entries, Money values, and dates are immutable.
Original Debt references are retained. Caller arrays, Debt objects, Money inputs,
and SafeToPayResult are not mutated or frozen by the allocator.

## Validation and scope

Focused synthetic tests cover budget/balance boundaries, centavos, zero records,
full and partial allocation, exhaustion and unused capacity, safe limits and
conservation invariants, order dependence, all three ordering compositions,
Adaptive classification versus cumulative allocation, duplicates before
allocation, malformed consumed values, window preservation, and immutability.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.
No existing domain engine, UI, navigation, application, persistence, migration,
repository, or dependency changes are required. Android export is unnecessary
for this pure domain task.
