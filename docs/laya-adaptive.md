# Laya Adaptive V1 — Task #024

**Clearable within Safe-to-Pay is an ordering classification, not a payment allocation.**

**Multiple debts may each be classified as clearable even when their combined balances exceed Safe-to-Pay. Actual allocation is a separate future operation.**

## API and boundary

`orderDebtsForLayaAdaptive({ debts, safeToPay }): LayaAdaptiveResult` consumes
validated Debt entities and an existing `SafeToPayResult`. It returns a frozen
`orderedEntries` collection of frozen `{ debt, category }` entries. Each entry
retains the original immutable Debt reference. Categories are factual metadata,
not advice or payment instructions:

- `clearable-within-safe-to-pay`: Group A.
- `remaining-avalanche-order`: Group B, including zero-balance records.

Safe-to-Pay is upstream protected capacity, not total Available Money. Adaptive
does not calculate a new safe amount, scan events, or rerun projection. It accepts
neither AvailableMoney, CashFlowProjection, income, essential obligations,
FinancialEvents, nor DebtPayments. The supplied protection window is validated
without changing either date or imposing a horizon; no clock is consulted.
The caller retains the original SafeToPayResult for window context.

Existing helpers revalidate nonnegative PHP Money and both FinancialDates;
reversed windows reject, while equal dates remain valid. Malformed amounts,
unsafe units, unsupported currency, and raw value substitutes reject rather than
being clamped or normalized. This boundary does not certify the upstream
projection or freshness of a structurally supplied result. Its contract is a
domain-produced SafeToPayResult. Existing Debt instance/duplicate validation is
reused, without reconstructing Debt or changing its invariants.

## Deterministic hierarchy

Group A contains exactly debts whose reported balance is **positive and less
than or equal to Safe-to-Pay**. Equality qualifies; one centavo above does not.
Each comparison uses the same unchanged capacity through Money.compare. No debts
are summed and no capacity is subtracted. Within A, reported balance ascending
then case-sensitive UTF-16 code-unit ID ascending determines order; interest is
ignored.

Group B contains every remaining debt and follows the exact Task #023 Avalanche
contract: known interest first, nominal annualized comparison rate descending,
then reported balance ascending, then ID ascending. Unknown interest follows all
known rates, ordered by balance then ID. Known 0% is never confused with unknown.

The implementation first calls the existing Avalanche engine for all debts,
which validates identities across both future groups. Partitioning preserves B's
order, and the existing Snowball engine orders A. No comparator is duplicated or
newly exposed, and Task #023's implementation/public behavior is unchanged.

The **Nominal annualized comparison rate** remains annual basis points unchanged
or monthly basis points times 12, using the existing exact BigInt comparison.
Equal normalized rates across periods fall through to balance and ID. This is
ranking normalization only, not effective annual interest, APR/APY, compounding,
interest accrual, or a future balance calculation. Stored interest is untouched.

With Safe-to-Pay zero, no positive balance qualifies and all records follow
Avalanche. Zero-balance debts always remain in B, even with positive capacity;
they are not marked paid, complete, settled, or removed. Their position within B
is determined by Avalanche, with no extra zero-balance priority rule.

For synthetic debts A = PHP 1,500 at 5% annual, B = PHP 8,000 at 24% annual,
C = PHP 4,000 at 18% annual, and Safe-to-Pay PHP 3,000:

| Strategy | Order |
| --- | --- |
| Snowball | A, C, B |
| Avalanche | B, C, A |
| Adaptive | A, B, C |

For A = PHP 1,500 and B = PHP 2,000 at that same PHP 3,000 capacity, **both**
are Group A despite exceeding capacity in combination. The result never claims
they can both be paid from that capacity.

## Limits and integrity

Balances remain user-reported current snapshots. Historical payments are not
subtracted or reconciled, and no completion or schedule satisfaction is inferred.
Names/providers, scheduled payments, due dates, and recurrence do not affect
ordering. Scheduled obligations are protected upstream to the extent recorded
in the projection; adding urgency here would risk counting them again. Adaptive
does not verify the completeness or freshness of those upstream records.

There are no weighted scores, hidden heuristics, allocation/payment amounts,
leftover cash, payoff dates, amortization, interest savings, strategy rankings,
or recommendations. Choosing to invoke Adaptive does not establish it as better
than Snowball or Avalanche. Presentation wording and integration remain future work.

Duplicate IDs reject even across groups; non-Debt entries reject. Empty input
returns a frozen empty ordering. A single debt is classified by the same rules.
Inputs are neither mutated nor frozen by this function. Returned entries,
collection, and result are frozen. Explicit tie-breaking makes permutations and
repeated equivalent calls deterministic, independent of insertion order or locale.

## Validation and scope

Focused synthetic tests cover all classification boundaries, non-cumulative
capacity, differences from both existing strategies, Group A and B tie-breaking,
unknown/known-zero and mixed-period rates, safe-integer boundaries, duplicates,
invalid Safe-to-Pay, supplied windows, input immutability, permutations, and direct
composition with real projection/Safe-to-Pay output. Existing engine tests remain
unchanged. No money addition/subtraction or time/random/locale dependency is used.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.
No UI, navigation, application, persistence, repository, migration, dependency,
or runtime-entry changes are made. Android export is unnecessary for this pure
domain task. Task #025 allocation is not implemented here.
