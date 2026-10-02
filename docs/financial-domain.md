# Core financial vocabulary

`AvailableMoney.create({ amount })` is an immutable, manually reported aggregate
of money available for the user's plan. It owns a revalidated nonnegative PHP
Money value; zero is valid and absence is separate. It has no ID, date, accounts,
history, or automatic relationship to the dated entities below. Future projection
work must explicitly resolve its effective date and freshness. See
[Available money](available-money.md).

Entities use supplied opaque IDs, immutable PHP Money, and FinancialDate. Typed
ID factories (`debtId`, `incomeId`, `obligationId`, `paymentId`) return branded
strings: case-sensitive, 1-128 UTF-16 code units, no surrounding whitespace.
Brands prevent accidental TypeScript interchange, not malicious runtime casts.
Names/provider labels are trimmed at the edges only, with 1-200 UTF-16 code units.
Blank optional metadata must be omitted, not filled with an empty string or null.

`Debt.create` represents the currently reported outstanding balance, not original
principal minus payments. Zero balance is valid; negative is not. There is no
separate lifecycle status yet. Provider is optional metadata with no lender rules.
Scheduled amount, next due date, and recurrence are independently optional.
Absence means unknown, not zero. Known scheduled zero is allowed (e.g. a waived
installment). A due date may be an exception to recurring anchors; neither is
derived from the other. A scheduled amount above the snapshot balance is retained:
there is no rule yet reconciling a quoted obligation with that balance.

Interest is required and explicit: `{kind: 'unknown'}` or
`{kind: 'known', basisPoints, period: 'monthly' | 'annual'}`. One basis point is
0.01 percentage point; 125 means 1.25% per stated period. Values are non-negative
safe integers; zero is known zero, never unknown. No arbitrary rate cap is imposed.
The rate does not specify nominal/effective treatment, flat/reducing basis,
compounding, fees, or an amortization method; it cannot yet drive interest accrual.

`Income.create` distinguishes an expected dated amount from an actual received
amount on its receipt date. Expected income may carry recurrence metadata; received
income cannot recur, because a receipt does not prove future receipts. Recurrence
and date are not inferred from each other. Zero income is valid as an explicit
zero-valued record, not proof of a skipped/missed payday. These are alternative
states of a record, not instructions to count an expectation and receipt twice.

`EssentialObligation.create` represents protected non-debt spending at a stated
date, optionally recurring. Zero is valid for an explicitly zero-cost obligation.
Recurring spending is not automatically debt. Negative amounts are rejected.

`DebtPayment.create` records an external historical payment with a supplied debt
reference and a strictly positive amount. Partial, extra, and early payments are
valid; constructing one never changes Debt. Payments may exceed today's balance:
a prior payment can legitimately exceed a later, even zero, balance snapshot.
The model has no balance-at-payment-time evidence, so it neither caps nor clamps
history. Debt existence, duplicate payment IDs across records, and temporal truth
require future application/repository validation; no clock is consulted here.

`FinancialEvent.create` is a normalized, non-persisted model. Kinds are expected
income, received income, debt due, essential due, and debt payment. Kind determines
inflow/outflow; every normalized event requires a strictly positive amount.
Zero-valued underlying entities remain valid under their existing policies, but
cannot be represented as FinancialEvents.
Typed source IDs refer to income/debt/essential/payment respectively. Callers must
provide truthful source data and a stable occurrence key (such as requested-day-30
versus requested-day-31). Identity is an unambiguous serialized tuple of kind,
source ID, date, and occurrence key. Expected and received must not both be supplied
as separate cash flows for the same income; likewise due/payment reconciliation
is not automatic. Events are not a balance ledger and must not simply be summed.

`compareFinancialEvents` / `sortFinancialEvents` order by calendar date, then
essential due, debt due, debt payment, received income, expected income, then
source ID and occurrence key in case-sensitive UTF-16 code-unit order. This is a
conservative ordering convention: without timestamps, same-day income is not
assumed available before outflows. It is not transaction chronology or a coverage
decision. Distinct same-date slots survive; duplicate event identities are rejected
instead of silently merged or resolved by insertion order. Sorting returns a new
frozen array and does not mutate inputs.

All construction validates and copies nested primitives/rules, then freezes owned
state. No monetary arithmetic, rounding, rate conversion, clock reads, random IDs,
event expansion, projection, payoff, or balance reconciliation is introduced.
Money, FinancialDate, and Recurrence contracts remain unchanged. Schedule start/end,
exceptions and reconciliation rules require explicit decisions. Task #017 adds
[pure event generation](financial-event-generation.md), including the approved
debt next-due cycle-replacement policy, without changing these entity invariants.
Reconciliation remains outside generation. No persistence or UI is added by this model.
