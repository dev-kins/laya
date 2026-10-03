# V1 integration and hardening — Task #028

Reviewed checkpoint: `087cd63`. Scope is integration, lifecycle, consistency,
accessibility and factual copy. No new financial capability or visual redesign.
The engineering constitution and V1 documentation were reviewed alongside the
implementation. Earlier task documents describe their historical scope; current
Home, Timeline, Plan and Profile implementations supersede old synthetic-screen
references. No broad documentation rewrite was undertaken.

## Baseline

Before edits: `npm test` passed **1,294 tests in 55 suites**;
`npm run typecheck`, `npm run lint`, and `git diff --check` passed.
Jest timeouts were not changed. Node's experimental SQLite warning is expected
for the existing host adapter; it is not evidence of Android bridge execution.

## Complete journey and evidence

Reviewed: first launch → onboarding completion → five main tabs → Add → Available
Money → Debt → Income → Essential Expense → persisted overviews → Home → Timeline
→ Plan and strategy selection → Profile → onboarding review → termination/relaunch.

Evidence combines source review, existing focused tests, and three new host
integration tests in `__tests__/v1Integration.host.test.tsx`. The new tests replace
only the Expo connection boundary with real file-backed Node SQLite and inject
synthetic IDs/calendar time. Parsers, application operations, repositories,
migrations, engines, startup, screens and navigation under test remain real.
Form UI flows are covered by their existing navigation tests; the host scenario
seeds through the real form application operations rather than pretending to type
every field on a physical device. Relaunch means component remount plus closed and
reopened SQLite connections, not termination of an Android process.

## Cross-screen contracts reviewed

| Area | Finding and evidence |
| --- | --- |
| First launch | Startup withholds main routes until the completion read. A fresh fixture enters onboarding; Get Started writes completion and enters Home. Existing failure/duplicate-save tests pass. The real host journey remount bypasses first-launch onboarding. |
| Review | Profile reuses a presentation-only onboarding route. The host journey checks no additional repository writes during review, completion remains true, records survive, and normal Profile return works. |
| Available Money | Absence is null; saved zero is a valid snapshot. Editor and all three financial loaders preserve that distinction. Real saves replace positive → different positive → zero → positive, with one singleton row. Profile adds no decorative read. |
| Debt | Form parsing, repository reopen and overview coverage preserve required/optional fields, exact amounts, known-zero versus unknown interest, monthly/annual periods, recurrence and explicit next due date. The integrated fixture preserves a zero-balance record, suppresses zero scheduled payment events, and keeps payment history separate. Long names/providers and safe limits remain covered by existing tests. |
| Income | Expected and Received remain distinct. Existing tests cover one-time/monthly/twice-monthly/zero inputs and recurrence clearing for receipts. The host fixture proves expected recurring income reaches projections while Received is excluded from arithmetic. |
| Expenses | One-time/monthly/twice-monthly/zero/date parsing and reopen tests remain intact. Real recurring expenses flow through Timeline, Home and Plan; zero records do not manufacture zero events. |
| Home | Available Money, Safe-to-Pay, first forecast item, minimum and ending match the same-condition Timeline projection. Existing tests cover missing, zero, empty events and negative projections. |
| Timeline | Local date and 60-day `(start, through]` horizon are shared. Expense/debt/income same-day ordering and intermediate balances survive; actuals and start-day events remain exclusions. |
| Plan | Debt count/total, due count/total, payment count and financial context remain factual. History does not reduce reported balances. Plan and Home agree on Safe-to-Pay/window/minimum/ending for unchanged records and date. |
| Strategies | Snowball, Avalanche and Adaptive use one Plan SafeToPayResult by reference. The real screen defaults to Adaptive; switching all three performs no new database open or repository write. |
| Allocation | Every proposal is positive and no greater than its reported balance. Total is at most Safe-to-Pay and total plus remainder equals capacity. Zero-balance debts emit no allocation; zero capacity emits none; excess remains unallocated. Full/partial describe reported-balance coverage, not payment execution. |
| Add and overviews | All four Add destinations and three overviews are live. Save/Done/View overview paths retain their existing behavior. Overview reads are factual repository order, with loading/empty/error/Retry/focus/stale-result coverage. |

Separate Home, Timeline and Plan loads are **not one globally atomic snapshot**.
Each owns a consistent SQLite read transaction. Intervening writes, midnight or
device-calendar changes can intentionally produce different results on a later
screen. There is no global cache, background timer or automatic midnight refresh.

## Exact synthetic cross-module check

The automated host scenario fixes today to January 29, 2026 and through to March
30, 2026. It saves via application form parsers: debt A PHP 1,500.01 at 5% annual,
with PHP 100.01 next due January 30 and monthly day 31; debt B PHP 8,000.02 at 2%
monthly; debt C PHP 4,000.03 at 18% annual; and zero-balance debt Z with zero
scheduled payment. It also records PHP 500.03 expected income twice monthly on
30/31, PHP 200.02 expense monthly on 31, zero records, a start-day expense, a
received-income fact and a PHP 2,000 historical payment against A.

The explicit January 30 debt date replaces January 31; the next debt occurrence
is February 28. Income days 30/31 both survive February clamping as distinct
events; March 30 is included at the horizon. Received income/payment history and
the start-day expense do not alter forecast arithmetic. Reported debt stays
PHP 13,500.06, scheduled dues PHP 200.02 across two occurrences, payment count 1.

| Available Money | Safe-to-Pay | Ending projection |
| --- | --- | --- |
| PHP 3,000.01 | PHP 2,900.00 | PHP 4,900.10 |
| PHP 3,500.02 | PHP 3,400.01 | PHP 5,400.11 |
| PHP 0.00 | PHP 0.00 | PHP 1,900.09 |
| PHP 20,000.00 | PHP 19,899.99 | PHP 21,900.09 |

At zero Available Money the minimum is **-PHP 100.01**, preserved despite later
income. At PHP 3,000.01, Adaptive proposes A PHP 1,500.01 full and B PHP 1,399.99
partial. At PHP 20,000, unallocated capacity is PHP 6,399.93. Tests assert exact
centavos and all allocation conservation invariants through real loaders.

## Lifecycle, navigation and persistence review

- Routes remain Home, Timeline, Add, Plan, Profile, plus existing Add-stack
  destinations and root first-launch/review routes. No dead V1 route, disabled
  completed Add destination or obsolete synthetic financial screen was found.
- Focus consumers clear prior results before loading. Request generations reject
  late successes and failures after blur/refocus/unmount. Retry creates a new
  generation. Existing focused tests cover these races, so they were not duplicated.
- Editors intentionally retain unsaved drafts across tab switches. Available
  Money reads once per editor visit. Back/removal discards the form; successful
  re-entry opens a fresh editor. Ordinary persisted updates refresh consumers on
  focus, without requiring restart. Save removal guards and retry IDs are retained.
- Profile's Available Money shortcut may open above an existing Add-stack route.
  Back/Done returns to that prior screen, not necessarily the hub or Profile.
  This is tested with an existing debt overview; Profile remains reachable by tab.
- Application services own initialized connections and close before returning
  success. Failure paths preserve operation/rollback/cleanup errors. Repositories
  do not own connections. Snapshot reads are sequential in one deferred transaction;
  composition follows commit. Existing concurrent-writer snapshot tests remain.
  New host fixtures assert no connections remain open after each operation/test.
- Migrations 1–4 remain contiguous and unmodified. Fresh fixtures reach version 4;
  existing migration tests cover historical upgrades, atomic rollback/retry,
  newer-schema rejection and preservation of records/preferences. No migration needed.
- Monetary SQLite guards run before bridge numeric conversion. Corrupt stored
  Available Money makes all three loaders fail, never appear missing/zero; cleanup
  still completes. Payment positivity/FKs and corruption tests remain unchanged.
- Reopen coverage includes onboarding, Available Money, debts, income, expenses
  and payment history. Derived projections/orderings/allocations are recomputed,
  never persisted. Host evidence does not certify native process restart.

## Money, dates, privacy, copy and accessibility

Money remains validated integer PHP centavos, including signed projections and
safe-integer failure behavior. Parsing uses Money/BigInt digit semantics; display
uses exact digit formatting. No parseFloat/toFixed currency arithmetic was found.
The only application Date clock is the local-calendar boundary; FinancialDate
formatting uses calendar parts, with no UTC conversion.

Claims review found no production copy promising guaranteed affordability,
executed proposals, automatic settlement, verified lender balances or superior
strategies. Profile's privacy wording is specific to local storage and no Laya
cloud/bank services. Generic errors conceal SQL, stacks and paths. No financial
console logging was found in runtime application/presentation; the opt-in native
validation entry logs synthetic validation summaries/failure markers only.

Missing, saved zero, successful empty collection, loading and error remain
separate states. User-entered zero is displayed, not used as absence. Loading
does not invent financial values; failures do not become empty successful lists.

Shared controls preserve labels, textual errors, checked radio states, 48-point
targets and scaling. Amount summaries provide spoken PHP/sign context. Wrapping,
scrolling, flexible layouts and keyboard avoidance remain; long-name/large-value
tests pass. Source review found no additional concrete clipping defect to fix.
Native large-text, keyboard, TalkBack and hardware-back acceptance remain pending.
The React best-practices review required no hook/refactor changes for these small
prop/copy fixes. No typography, color, card, illustration or animation redesign.

## Defects found and fixed

1. **Debt Save omitted busy accessibility state:** unlike the other forms, its
   disabled saving button lacked `busy`. It now passes `busy={saving}` to the
   existing primitive, with an added assertion in its pending-save regression.
2. **Misleading editor back labels:** Debt/Income/Expense entered from overviews,
   and Available Money entered over an already-used Add stack, said Back to Add
   while `goBack()` returned elsewhere. All four now say Back. No navigation
   behavior changed. Three focused overview regressions and the real Profile
   shortcut journey verify the return contexts. Navigation documentation is updated.

Three new real-host integration tests close the persisted-composition, corrupt
read, and actual onboarding-review persistence coverage gaps. Three new overview
Back tests cover the label defect. Existing assertions were preserved, with only
expected label changes and the added busy assertion. No unresolved implementation
defect or stop gate was identified within the reviewed scope.

## Known V1 limitations and next gate

Local-first only; manual Available Money and financial records; no account,
cloud sync, multi-currency, bank/lender verification, automatic payments,
reconciliation, payoff-date or interest-accrual simulation, automatic strategy
recommendation or destructive reset. Forecast expectations/dues can remain stale;
recorded payments do not automatically reduce reported balances. Overdue history
is not rolled forward by inference. Current product horizon is fixed at 60 days.

Encryption at rest and OS backup/device-transfer policy remain the previously
documented pre-beta decision gates. Native device acceptance has not been executed
here; synthetic host fixtures and Android export are not substitutes. Functional
source/automated review supports proceeding to DK acceptance and the separately
authorized **#029 final visual-fidelity pass**, with any device findings resolved
first. Task #028 does not start #029 or grant release/visual approval.

## Physical Android acceptance checklist for DK

Pending. Use synthetic/non-sensitive data in a dedicated test installation. Do
not erase production data to create a fresh state. Choose dates relative to the
device's local date; the fixed January fixture above is for automated tests.

1. Fresh local test state shows onboarding.
2. Complete onboarding.
3. Verify the five main tabs appear.
4. Relaunch; confirm first-launch onboarding does not repeat. Before entering
   money, verify missing setup on Home/Timeline/Plan; do not mistake it for zero.
5. Set Available Money to a positive exact-centavo value; record it for comparison.
6. Add a synthetic recurring debt with explicit next due date and payment.
7. Add expected recurring income; separately verify Received does not forecast.
8. Add a recurring essential expense; include a 30/31 anchor where practical.
9. Verify the three overviews, including exact amounts, dates and requested days.
10. Fully terminate and relaunch.
11. Verify all records persist exactly.
12. Verify Home Available Money matches the editor.
13. Verify Safe-to-Pay against the minimum of the recorded scenario, floored at zero.
14. Verify Up next corresponds to the first applied Timeline event.
15. Verify lowest and ending projected balances, including negative intermediates.
16. Open Timeline and verify the same story under the same records/local date.
17. Check conservative same-day ordering: expenses, debt dues, expected income.
18. Check recurrence/clamping and explicit debt next-due cycle replacement.
19. Open Plan and verify debt/due/payment facts and financial context.
20. Verify Adaptive is initially selected without a recommendation claim.
21. Switch Snowball and inspect its order/proposals.
22. Switch Avalanche and inspect its order/proposals.
23. Return to Adaptive and inspect factual categories.
24. Confirm switching does not visibly reload financial data.
25. Verify proposals never exceed balances/capacity and total plus remainder
    equals Safe-to-Pay. Include excess capacity and zero-balance records.
26. Save Available Money = PHP 0.
27. Verify Home remains populated, with zero capacity where appropriate.
28. Verify Timeline uses a zero starting snapshot rather than setup.
29. Verify Plan keeps strategies and shows no nonzero proposal at zero capacity.
30. Replace zero with positive; also replace positive with a different positive.
31. Revisit all financial screens and verify focus refresh without restart.
32. Open Profile and read its factual local-first information.
33. Open Available Money from Profile, including after visiting an Add overview.
34. Use Back/Done; verify prior Add-stack context, then return to Profile by tab.
35. Open onboarding review.
36. Exit review using Done reviewing; repeat with Android Back.
37. Confirm financial records remain intact.
38. Fully terminate/relaunch again.
39. Verify first-launch completion remains stored.
40. Enter/review a long synthetic debt/provider name and large exact PHP amount.
41. Review scrolling and keyboard reachability on a narrow screen.
42. Increase system font size; inspect wrapping/overlap, amounts and tab labels.
43. Use TalkBack for fields, errors, debt Save busy state, strategy checked state
    and spoken amounts/signs. Verify the practical touch targets.
44. Test Android Back, unsaved form Back, saved Done, overview return and tab return.
45. Review generic error/Retry states if a safe test harness permits; do not
    corrupt real data or expose private SQL/errors to manufacture this check.
46. Record any broken, contradictory or misleading behavior before #029 begins.

## Validation commands

Final validation: **1,300 tests passed in 56 suites**; typecheck, lint and
whitespace checks passed. Android export passed on the established permitted
retry after sandbox Hermes `spawn EPERM`. No timeout increase, dependency change,
domain change, schema/migration change or repository change. No commit made.

`npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, and
`npx expo export --platform android --output-dir "$env:TEMP\laya-task028-android-export"`.
Use only the established permitted retry for sandbox Hermes `spawn EPERM`.
