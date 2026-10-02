# Plan foundation — Task #022

Plan presents persisted debt facts and the existing 60-day financial context.

**Recorded debt balances are user-reported snapshots. Laya does not subtract recorded payment history from those balances automatically.**

**Task #022 does not decide which debt to pay first or which payoff strategy to use.**

There is no prioritization, strategy selection, payoff simulation, interest calculation, allocation of Safe-to-Pay, recommendation, or advice. No Snowball, Avalanche, or Laya Adaptive behavior is implemented.

## Application boundary and ownership

`loadPlan(overrides?)` returns an immutable `PlanResult`: captured start/through dates, debts, recorded debt count, total reported debt, scheduled due count/total, recorded payment count, and a missing-money or ready financial context. Tests can inject the clock, opener, repositories, event generator, and projection function. Presentation does not read repositories or calculate financial totals.

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

Ready context uses `projectCashFlow` and `calculateSafeToPay` unchanged: Available now, Safe-to-Pay, lowest projected balance, and ending projected balance. Negative projections retain their sign; Safe-to-Pay follows the existing nonnegative engine result. These are estimates from recorded information, not bank balances or guarantees, and are not allocated toward debt. Recorded payments do not cancel forecasts; users may need to update their records. See [projection](cash-flow-projection.md) and [Safe-to-Pay](safe-to-pay.md).

## Screen behavior and visual status

Plan uses existing Laya primitives and tokens: Sampaguita cream, Haraya green, a restrained Araw gold rule, editorial headings, readable financial figures, and equally styled debt summaries. It is a foundation implementation, not the final canonical visual-fidelity pass. No charts or new assets/dependencies are added.

Loading is distinct and does not flash zero totals or an empty state. Failures show generic local-data text and Retry, without raw exceptions or SQL. Focus triggers a fresh load. A request generation counter invalidates superseded requests on blur/unmount and prevents late successes or failures from replacing current state.

Add debt, View debts, Set/Update available money, and View timeline reuse existing routes and forms. No new data-entry flow is introduced. Text scales and wraps without line truncation; existing buttons provide accessible targets. Headings, grouped summaries, spoken Philippine peso amounts (including negative signs), explicit interest wording, and text independent of color support accessibility.

## Automated coverage

Application coverage includes empty/single/multiple/zero debts, centavos and safe-integer boundaries, both aggregate overflow paths, repository order, interest states, recurring and zero schedules, day 30/31 clamping and next-due replacement, history separation including oversized payments, missing/zero money, real projection/Safe-to-Pay, fixed dates and exact horizon, one read per repository, deterministic output, initialization/read/composition/rollback/close failures, combined failures, and awaiting cleanup.

Screen coverage includes loading, empty and populated states, existing Add Debt save/return flow, totals/counts, interest, missing/zero money, signed amounts, navigation, error/retry, focus refresh, stale success/failure protection, spoken labels, and untruncated scalable long names/maximum amounts. Existing Home, Timeline, and host SQLite tests remain required regression checks. Automated rendering and Android export do not prove physical-device layout or TalkBack behavior.

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
