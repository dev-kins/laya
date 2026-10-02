# Safe-to-Pay engine — Task #020

**Safe-to-Pay is calculated only from the financial information currently
recorded in Laya and the supplied projection window. Missing, outdated,
or incorrect income and obligations can change the result.**

**It is a deterministic planning estimate, not a bank balance, guarantee,
or financial recommendation.**

## Definition and API

V1 defines Safe-to-Pay as the maximum amount that could be removed from the user's
Available Money at projection start without causing the supplied projected scenario
to fall below PHP 0 during its protection window, with a zero floor when the
scenario already falls negative.

`calculateSafeToPay(projection: CashFlowProjection): SafeToPayResult` returns a
frozen object containing `amount: Money`, `protectionStartDate: FinancialDate`
and `protectionThroughDate: FinancialDate`. It consumes an existing domain-produced
projection, not entities or events. It neither generates events nor reruns projection.

The formula is `max(PHP 0, projection.minimumProjectedBalance)`.
For balances B0 (the starting snapshot), B1, ... Bn, removing X at start shifts
every balance to B0-X, B1-X, ... Bn-X. Every adjusted balance remains nonnegative
exactly when X <= min(B0...Bn). Thus the maximum nonnegative removable amount is
the minimum, floored to zero by V1 policy. If that minimum is already negative,
no nonnegative removal can repair the scenario; the returned zero does not imply
that the original scenario stays nonnegative.

## Money and window semantics

| Supplied scenario | Safe-to-Pay |
| --- | --- |
| Starts PHP 10,000; later balances 8,000, 5,000, 10,000, 9,000 | PHP 5,000 |
| Starts PHP 4,000; future expected income adds 5,000 | PHP 4,000 |
| Starts PHP 0; future expected income adds 25,000 | PHP 0 |
| Minimum exactly PHP 0 | PHP 0 |
| Starts PHP 1,000; future obligation 1,500 | PHP 0 |
| Starts PHP 8,200; no applied events | PHP 8,200 |

Starting money participates in the minimum. Future income cannot manufacture money
removable now, and scheduled obligations can reduce it. A later recovery does not
erase an earlier negative balance. No-event behavior means only that no recorded
forecast in the supplied window reduces the starting amount; it does not establish
that the user has no real future obligations.

All amounts use existing signed integer-centavo PHP Money. Comparisons and copies
preserve exact centavos, including PHP 0.01, and validate safe-integer bounds.
No monetary addition/subtraction is needed in this engine, so it introduces no
intermediate overflow. Negative minimums, including MIN_SAFE_INTEGER, return zero;
valid positive minimums through MAX_SAFE_INTEGER remain exact. There is no rounding,
peso-number arithmetic, currency conversion or clamp other than the specified floor.

The result inherits `projection.start.date` and `projection.through`. There is no
clock or fixed horizon here. Timeline currently constructs 60 calendar days for
normal product use; the engine also accepts shorter, longer or equal-date windows.
It inherits `(startDate, through]` applied-event semantics, including exclusion of
start-day events, while protecting the starting snapshot itself.

## Trust, inheritance and limits

The input contract is a CashFlowProjection produced by `projectCashFlow`, not raw
JSON. Narrow runtime checks revalidate/copy the consumed Money and calendar dates,
require nonnegative starting money, an ordered window, and a minimum no greater
than the start. Invalid currency, unsafe units and raw value substitutes reject.
The function does not scan points, inspect exclusions, recompute minima, validate
all projection fields or certify a forged projection's internal consistency.
Upstream projection remains responsible for that correctness.

Expected income, essential dues and debt dues are applied upstream; received income
and actual debt payments are excluded upstream. Safe-to-Pay inherits the conservative
same-day ordering and intermediate minimum unchanged. Coexisting expected/received
records and due/payment records are not reconciled. A stale expected income can
overstate a scenario, and a stale scheduled due can still reduce it even after
payment. No matching, cancellation or balance reconciliation is added.

Results and their owned values are immutable. Equivalent calls return equivalent
results without mutating or freezing supplied projection points. The module has no
logging, persistence, database cache, UI integration or navigation changes. It adds
no reserve, buffer, settings, classification, advice, recommendation or prioritization.

## Validation

Synthetic pure tests cover positive/zero/negative minimums, starting/later minimums,
empty forecasts, future income/outflows, mixed scenarios, centavos, signed safe
limits, arbitrary windows, upstream actual/start-day exclusions, coexistence,
the removable-amount bound, runtime validation, immutability and determinism.

Run `npm test`, `npm run typecheck`, `npm run lint` and `git diff --check`.
Android export is not required: no runtime or presentation entry point is changed.
