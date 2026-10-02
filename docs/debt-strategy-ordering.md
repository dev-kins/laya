# Debt strategy ordering — Task #023

`orderDebtsForStrategy({ strategy, debts }): DebtStrategyResult` is a pure,
synchronous domain function. The caller explicitly selects `snowball` or
`avalanche`. The result contains only `strategy` and `orderedDebts`, referencing
the supplied validated immutable Debt instances. There is no clock, locale,
storage, network, logging, application service, or UI integration.

## Ordering contracts

Snowball orders current reported `Debt.balance` ascending using Money comparison,
then Debt ID ascending in case-sensitive UTF-16 code-unit order. Interest, names,
providers, schedules, and input position do not break ties.

Avalanche places all known-interest debts before all unknown-interest debts.
Known debts sort by **Nominal annualized comparison rate** descending, then
reported balance ascending, then Debt ID ascending. Unknown debts sort by
reported balance ascending, then Debt ID ascending. **Unknown is never normalized
to zero. Known 0%, in either period, always precedes unknown interest.**

The approved Nominal annualized comparison rate exists only to produce
deterministic Avalanche ordering:

- Annual: comparison basis points = stored basis points.
- Monthly: comparison basis points = stored basis points multiplied by 12.

Thus 200 bp monthly (2400 comparison bp) ranks before 1800 bp annual.
100 bp monthly and 1200 bp annual tie; balance and ID resolve that tie.
Monthly and annual zero also tie as known rates.

This is ranking normalization only, not effective annual interest, APR/APY,
compounding, accrued interest, or a prediction. It does not change stored interest,
balances, future balances, payoff dates, or interest savings. The formula
`(1 + monthlyRate)^12 - 1` is not used.

Debt accepts nonnegative safe-integer basis points through MAX_SAFE_INTEGER.
Monthly multiplication can exceed that number range. The engine converts the
validated integer to BigInt **before** multiplication, and compares BigInts
directly without converting back to number. This retains exact ordering over the
entire existing Debt range without tightening its contract, rounding, percentage
arithmetic, or unsafe intermediates. The internal comparison rate is not returned
or persisted. Monetary ordering uses Money.compare, without summation/subtraction.

## Boundaries and limitations

Recorded debt balances are user-reported snapshots. Payment history is not
reconciled or subtracted. Zero-balance debts remain recorded debts: Snowball puts
them before positive balances, while Avalanche applies its normal rate/balance/ID
rules. Zero does not establish paid-off or completed status.

Scheduled payments, due dates, recurrence, and payment history do not participate.
Available Money, Safe-to-Pay, projections, income, obligations, and financial
events are not inputs. There is no allocation, payment amount recommendation,
payoff simulation, future-interest calculation, strategy recommendation, risk
weighting, or Laya Adaptive behavior. Plan remains unchanged.

The input contract is validated PHP Debt entities, not JSON or persistence rows.
The boundary rejects invalid strategy values, non-Debt entries, and duplicate
Debt IDs (including repeated references). It does not reconstruct Debt or repeat
all of Debt.create's validation; fabricated prototypes are not supported inputs.
Existing Debt/Money validation remains responsible for PHP and safe value ranges.

Empty input returns an empty frozen collection; a single debt retains its original
reference. Result and ordered collection are frozen. Input arrays are copied
before sorting and are neither mutated nor frozen by the engine. Debt objects
and nested values are unchanged. Explicit ID tie-breaking makes equivalent unique
debt sets order identically across input permutations and repeated calls, without
localeCompare or insertion-order dependence.

## Validation

Synthetic tests cover both strategies, empty/single/multiple debts, zero and
centavo balances, safe-integer boundaries, mixed periods, equal normalized rates,
known zero versus unknown, all tie-breaks, irrelevant metadata, permutations,
duplicates, invalid inputs, immutability, and exact rate comparisons beyond safe
number multiplication. Payment history and cash context are absent from the API.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`.
Android export is unnecessary: no runtime entry or presentation changes occur.
The original interest-period stop gate was resolved by explicit approval of the
nominal annualized ranking rule; no accrual or effective-rate policy is implied.
