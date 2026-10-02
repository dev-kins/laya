# Plan — factual foundation and strategy scenarios (Tasks #022/#026)

Plan presents persisted debt facts, the existing 60-day financial context, and
three alternative proposed extra-payment scenarios.

**Recorded debt balances are user-reported snapshots. Laya does not subtract recorded payment history from those balances automatically.**

**Strategy selection is a planning view, not a recommendation or payment instruction.**

Task #026 composes the unchanged Snowball, Avalanche, Adaptive, and allocation
engines. It introduces no financial algorithm, payoff simulation, interest
calculation, strategy ranking, or claim that one strategy is better.

## Application boundary and ownership

`loadPlan(overrides?)` returns an immutable `PlanResult`: captured start/through dates, debts, recorded debt count, total reported debt, scheduled due count/total, recorded payment count, and a missing-money or ready financial context. Ready context now also contains `strategies`, keyed by `snowball`, `avalanche`, and `adaptive`. Tests can inject the clock, opener, repositories, event generator, and projection function. Presentation does not read repositories or calculate financial totals.

The focused application composer `composePlanStrategies(debts, safeToPay)` calls
the existing ordering and allocation engines. Each scenario contains that same
SafeToPayResult reference, ordered entries (with Adaptive categories where
applicable), and the domain allocation result. Plan calculates Safe-to-Pay exactly
once from its one projection and passes it unchanged to all three scenarios.
Scenario composition occurs within the existing bounded operation, retaining
cleanup and combined-failure behavior. No per-strategy database reads occur.

`withFinancialSnapshot` extracts Timeline's bounded read without changing financial composition. It captures and validates the device-local calendar date once per load, obtains the existing `timelineThrough` date, opens one initialized connection, and reads Available Money, debts, income, essential obligations, and debt payments once each, sequentially inside `BEGIN DEFERRED`/`COMMIT`. There are no per-debt reads. Repository order is retained, including the existing deterministic debt identifier order; no balance, interest, name, or urgency sorting is added.

Composition runs after commit and before close. Every successfully acquired connection receives one close attempt before success or failure is returned. An open/initialization failure remains the opener's cleanup responsibility. Read/commit failures attempt rollback; rollback and close failures retain the original causes through `AggregateError`. Close failures reject rather than being swallowed or retried. Shared aggregate diagnostic messages now say “Financial” rather than “Timeline”; error structure and ownership behavior are unchanged.

Timeline retains its existing missing-money short circuit, event generation, projection, labels, grouping, and ordering. Home continues to derive its summary from Timeline after that bounded operation completes. No domain or persistence semantics changed.

## Factual amounts and counts

- **Total reported debt:** exact `Money.add` sum of all current `Debt.balance` snapshots, in PHP. No debts yields PHP 0. Unsafe aggregate overflow rejects; there is no clamping or rounding.
- **Recorded debts:** all records count, including PHP 0 balances. Zero does not imply paid off, completed, deleted, or hidden.
- **Interest:** existing formatting preserves unknown interest separately from known 0%, including the known rate's period. No accrued interest or payoff estimate is calculated.
- **Scheduled debt dues:** count and exact Money sum of generated `debt-due` events strictly after the captured start date and through the inclusive day 60. Income, expenses, and payment history do not contribute. Unsafe due totals reject. A zero scheduled payment emits no event upstream.
- **Recorded payments:** count of all persisted DebtPayment records, independent of the projection window. No payment amount total or full history UI is introduced. A payment greater than a reported balance remains a separate fact and does not reduce that balance or cancel a scheduled due.

Recurrence comes exclusively from `generateFinancialEvents`. An explicit next due date replaces the debt's normal recurring occurrence(s) for that calendar month. Normal recurrence resumes in the following month. Requested days 30/31 retain existing month-end clamping; twice-monthly occurrences can remain distinct on the same clamped date. These rules do not establish payment, forgiveness, or reconciliation.

## Financial context

The horizon is the established 60 calendar days: `(startDate, through]`. For example, October 2, 2026 has an inclusive end of December 1, 2026. Today's events are excluded from applied projections and Plan's due totals. Each retry or focus refresh captures a fresh local date once.

Missing Available Money leaves debt details, counts, reported balances, scheduled dues, and payment count visible. Only projection/Safe-to-Pay context is unavailable, with access to the existing editor. Saved PHP 0 is a real starting balance and runs the actual projection.

Ready context uses `projectCashFlow` and `calculateSafeToPay` unchanged: Available now, Safe-to-Pay, lowest projected balance, and ending projected balance. Negative projections retain their sign; Safe-to-Pay follows the existing nonnegative engine result. These are estimates from recorded information, not bank balances or guarantees. Strategy scenarios propose extras within that capacity without executing them. Recorded payments do not cancel forecasts; expected income and scheduled dues may remain stale. See [projection](cash-flow-projection.md) and [Safe-to-Pay](safe-to-pay.md).

## Strategy scenarios — Task #026

- Snowball orders reported balances ascending, then code-unit ID.
- Avalanche orders known nominal annualized comparison rates descending, then
  balance and ID; unknown rates follow all known rates, ordered by balance and ID.
  Monthly basis points times 12 uses the established exact BigInt ranking rule,
  not compounding or effective interest.
- Adaptive first orders positive balances that individually fit within Safe-to-Pay
  by balance and ID, then applies Avalanche to remaining records. Its existing
  categories are displayed as “Fits within current Safe-to-Pay” and “Remaining
  debts in Avalanche order.” Zero balances remain in the latter group.

All three scenarios use the same snapshot, Safe-to-Pay, and protection window.
None changes the projection. Each feeds its ordered debts to `allocateSafeToPay`.
Only its nonzero allocations appear as proposal cards, in allocation order.
Cards show the reported balance, proposed extra amount, and full/partial coverage.
Full means the proposal equals the reported snapshot; partial means less. Neither
means paid, settled, or closed. No hypothetical post-payment balance is displayed.

Adaptive classification is individual, while allocation is cumulative. Several
debts may individually fit even when their combined balances exceed Safe-to-Pay.
The screen explains this distinction and exposes the complete selected order,
including category metadata for debts without an allocation. No zero-value
allocation card is fabricated. Unallocated Safe-to-Pay remains unassigned.

Missing Available Money preserves debt facts and the existing editor action,
with no scenarios or fabricated capacity. Saved zero produces all three valid
scenarios, visible selectors, zero allocation totals, and explicit zero-capacity
copy. Empty debts produce empty scenarios with unused capacity preserved.

Laya Adaptive is the initial **UI default only**, not a recommendation. Selection
is local PlanScreen state: switching is synchronous and uses already-composed
scenarios without calling loadPlan or SQLite again. Selection survives ordinary
focus refresh while the screen remains mounted; a new screen/session defaults to
Adaptive. Focus and Retry clear stale financial results and rebuild all scenarios
from current records. Existing request generations ignore late success/failure;
switching itself creates no async operation.

No selected strategy, ordering, proposal, or remainder is saved. There are no Pay,
Confirm payment, Mark as paid, Apply, Save allocation, or lender/payment redirects.
No DebtPayment is created and no balance is mutated. No payoff dates, duration,
interest savings, optimization, or strategy superiority is claimed.

## Screen behavior and visual status

Plan uses existing Laya primitives and tokens: Sampaguita cream, Haraya green, a restrained Araw gold rule, editorial headings, readable financial figures, and equally styled recorded-debt summaries. The hierarchy is debt snapshot, Safe-to-Pay/window, strategy controls and explanation, proposed allocations and unused capacity, selected order, then retained recorded facts/context. This is functional product UI, not the final canonical visual-fidelity pass. No charts or new assets/dependencies are added.

Loading is distinct and does not flash zero totals or an empty state. Failures show generic local-data text and Retry, without raw exceptions or SQL. Focus triggers a fresh load. A request generation counter invalidates superseded requests on blur/unmount and prevents late successes or failures from replacing current state.

Add debt, View debts, Set/Update available money, and View timeline reuse existing routes and forms. No new data-entry flow is introduced. Text scales and wraps without line truncation; existing buttons provide accessible targets. Headings, grouped summaries, spoken Philippine peso amounts (including negative signs), explicit interest wording, and text independent of color support accessibility.

Strategy controls use radio roles and checked state, a visible check mark, and
48-point minimum touch height. Controls wrap as space/text size requires.
Allocation rows group debt name, reported balance, proposed extra amount, and
full/partial meaning in their spoken labels. No editable controls were added.

## Automated coverage

Application coverage includes empty/single/multiple/zero debts, centavos and safe-integer boundaries, both aggregate overflow paths, repository order, interest states, recurring and zero schedules, day 30/31 clamping and next-due replacement, history separation including oversized payments, missing/zero money, real projection/Safe-to-Pay, fixed dates and exact horizon, one read per repository, deterministic output, initialization/read/composition/rollback/close failures, combined failures, and awaiting cleanup.

Screen coverage includes loading, empty and populated states, existing Add Debt save/return flow, totals/counts, interest, missing/zero money, signed amounts, navigation, error/retry, focus refresh, stale success/failure protection, spoken labels, and untruncated scalable long names/maximum amounts. Existing Home, Timeline, and host SQLite tests remain required regression checks. Automated rendering and Android export do not prove physical-device layout or TalkBack behavior.

Task #026 adds application coverage for exact shared SafeToPayResult identity,
one calculation/read pipeline, all three orderings and domain allocations,
Adaptive metadata, centavos, full/partial, unused/zero/empty/missing cases,
immutable deterministic results and composition/cleanup failure. Presentation
coverage adds selected controls, all switches without reload, explanations,
proposal labels, window, zero/unused capacity, no zero cards, refreshed scenarios,
late-result protection after switching, Retry, remount default, and scalable rows.

Run `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, and
`npx expo export --platform android --output-dir "$env:TEMP\laya-task026-android-export"`.

## Task #026 physical Android checklist for DK

Pending device validation. Use synthetic data only in an isolated test installation;
never reset production records. For an exact scenario, use no income, expense, or
scheduled due records, Available Money PHP 3,000, and synthetic debts A = PHP 1,500
at 5% annual, B = PHP 8,000 at 24% annual, C = PHP 4,000 at 18% annual.

1. Open Plan and confirm loading resolves to recorded facts.
2. Confirm Laya Adaptive is initially checked; no recommendation badge appears.
3. Compare Safe-to-Pay PHP 3,000 against Home for the same date and records.
4. Check the visible protection window is the same 60-day window as Home.
5. Verify Adaptive order A, B, C; proposals A PHP 1,500 full and B PHP 1,500 partial.
6. Select Snowball and verify its explanation and checked state.
7. Verify order A, C, B; proposals A PHP 1,500 full and C PHP 1,500 partial.
8. Select Avalanche and verify its explanation and checked state.
9. Verify order B, C, A; proposal B PHP 3,000 partial only.
10. Confirm switching does not show loading or visibly reload financial data.
11. Return to Adaptive and verify its categories and original proposed amounts.
12. Save Available Money PHP 0, return to Plan, and verify all three selectors
    remain available with zero totals and no proposal cards.
13. On a separate fresh synthetic installation if practical, leave Available Money
    missing. Verify debt facts remain, no scenarios appear, and setup opens the editor.
14. With the original debts, save PHP 20,000. Verify proposed total PHP 13,500 and
    unallocated PHP 6,500, with no destination assigned to the remainder.
15. Fully terminate the app and relaunch. Check Adaptive is the initial selection.
16. Confirm scenarios reconstruct from persisted records and agree with Home.
    Add/change a synthetic financial record through an existing flow and return
    to Plan; verify fresh scenarios rather than cached values.
17. Review scrolling through proposals, ordering, and all existing debt facts.
18. Use large system text and long synthetic names; check wrapping and clipping.
19. Keyboard review is N/A on Plan: no editable controls were added. Existing
    editor keyboard checks remain covered by their respective checklists.
20. With TalkBack, check radio labels/checked state, logical focus order, protection
    dates, spoken peso amounts, allocation coverage, and Adaptive categories.
21. Compare visual balance, cream/green/gold palette, hierarchy, and spacing with
    the canonical design board. Final visual fidelity remains a separate DK review.

## Physical Android checklist for DK

Pending physical-device validation. Use synthetic test data or an existing approved test installation; do not erase real financial records to create test states.

1. Open Plan with existing debts. Confirm a distinct loading state before facts appear.
2. Count all debt records, including zero balances, and verify Recorded debts.
3. Manually add their current reported balances and compare Total reported debt to the centavo.
4. Verify every debt appears in the existing repository order without ranking, priority badges, or unequal emphasis.
5. Check a debt with unknown interest and a known 0% debt; confirm distinct wording and the known period.
6. Compare scheduled due count and total against debt-due entries in Timeline for the same displayed date window. Exclude today's events, income, expenses, and historical payments. Check recurring day 30/31 and exceptional next-due dates when available in the fixture.
7. Compare payment count with approved persisted test records. If no payment records exist, expect zero. There is no new payment-entry UI; nonzero history checks require an existing approved synthetic fixture.
8. Confirm those payments did not reduce any displayed reported balance or cancel scheduled dues, including a fixture payment larger than its debt's balance.
9. Add another debt through Plan, save, and return to Plan. Verify fresh count, total, and summary without relaunching.
10. If practical on a separate fresh test installation, check missing Available Money: debt facts remain visible, with a setup action and no invented projection.
11. Save PHP 0 in the existing Available Money editor and return. Verify real context appears, negative forecasts retain signs, and zero is not shown as missing.
12. Open View debts and confirm the existing overview and its records.
13. Open View timeline and verify the existing Timeline tab and matching dates/context. Return to Plan to check refresh.
14. Fully terminate and relaunch the app. Confirm Plan reconstructs the same persisted facts (allowing the date window to advance if the local date changed).
15. Enable large system text. Check long debt/provider names, large peso totals, all sections, scrolling, and actions for wrapping, overlap, and clipping.
16. Enable TalkBack. Check headings, tab selection, grouped debt facts, spoken signed peso amounts, interest wording, and button labels/focus order.
17. Compare hierarchy, density, cream/green/gold balance, and typography direction against `docs/design/laya-official-design-reference.png`. Record physical findings for the separate visual-fidelity pass.

For a simple isolated synthetic check with no other forecast records: debt A with reported balance PHP 10,584.78 and a one-off PHP 1,764.00 due tomorrow, plus debt B with PHP 0 and no schedule, yields count 2, total PHP 10,584.78, and one due totaling PHP 1,764.00. With Available Money PHP 8,200.50, lowest/ending projected and Safe-to-Pay are PHP 6,436.50. With saved PHP 0, lowest/ending are -PHP 1,764.00 and Safe-to-Pay is PHP 0. Keep all dates within the displayed window.
