# Real Home and Safe-to-Pay — Task #021

Home now presents real local financial information: Safe-to-Pay, reported Available
Money, the next applied forecast event, and the lowest and ending projected balances.
The old VisualShowcase has been removed: it had no remaining test/reference consumer
or production route after replacement. No synthetic figures remain in production Home.

## Application composition

`loadHome(overrides?)` returns the existing `missing-available-money` result or a
frozen ready result containing `safeToPay`, `availableMoney`, `nextEvent` (nullable),
`lowestProjected` and `endingProjected`. Date boundaries are carried by SafeToPayResult.

Home directly reuses `loadTimeline(overrides)` as its shared application composition.
No existing Timeline behavior or API is changed and no parallel implementation is
introduced. This deliberately accepts the small cost of constructing the existing
named date groups in exchange for retaining one validated implementation. The pipeline
is SQLite repositories → validated entities → generateFinancialEvents → projectCashFlow
→ calculateSafeToPay → Home summary. React only formats and presents returned values.

The forwarded overrides include the injectable `today`, opener, repository factories,
generator and projector. Production captures local device calendar today once per load
via the existing timelineCalendar boundary; tests inject fixed FinancialDates. The
same helper adds 60 calendar days without UTC conversion or millisecond arithmetic.
Equivalent Home/Timeline loads agree on start and through dates. Separate loads can
differ after local midnight, timezone changes or intervening writes; there is no
global cache, midnight timer or background refresh.

The reused bounded operation reads AvailableMoney, Debt, Income,
EssentialObligation and DebtPayment through one owned initialized connection.
Sequential reads use the existing BEGIN DEFERRED / COMMIT snapshot strategy. Failures
attempt rollback as appropriate and close; combined operation/rollback/cleanup errors
retain their causes. A close-only failure rejects success. Open/init failure cleanup
remains the opener's responsibility. The connection is closed before Home computes
Safe-to-Pay, so even a failure in that final pure step cannot leak a connection.
No second connection or per-event queries are introduced.

## Display semantics

- Missing Available Money shows “Start with what you have” and opens the existing
  editor in Add. No projection or Safe-to-Pay result is fabricated.
- Saved PHP zero runs the real projection and displays Available now and Safe-to-Pay
  separately, both zero where appropriate. It is never interpreted as missing.
- Safe-to-Pay uses the unchanged [Task #020 engine](safe-to-pay.md). The hero shows
  its exact PHP amount with recorded-information/60-day context. It is an estimate,
  not spending permission or a guarantee. No buffer or reserve is applied.
- Available now is the persisted manually reported starting Money, not a bank balance
  or a second name for Safe-to-Pay. A restrained Update available money action reuses
  the same editor; no additional form is created.
- Up next uses the first named entry corresponding to the first applied projection
  point. The already-loaded entity maps resolve the source name and readable type.
  It shows calendar date, name, type, signed amount and textual inflow/outflow.
  No raw-entity sorting or financial prioritization occurs. Unresolved applied names,
  including later events, remain an explicit application failure.
- Lowest projected and Ending projected directly reuse projection Money values.
  Negative balances remain signed and are never clamped or assigned a status/color
  classification. Only the existing Safe-to-Pay engine floors its own amount to zero.
- Without applied forecast events, Up next says no scheduled items are recorded in
  Laya for the next 60 days. Safe-to-Pay, lowest and ending equal starting money. This
  does not establish that the user has no actual obligations.
- View timeline opens the existing Timeline tab. It performs its normal fresh read.
  Today's events and actual receipts/payments stay excluded upstream. Home never
  changes `(startDate, through]`, recurrence, same-day order or intermediate minima.

Expected income and scheduled dues can remain stale; actual receipts/payments do
not reconcile or cancel them. Missing, outdated or incorrect records change results.
Home includes concise limitation copy. It gives no advice, debt ranking, confidence,
Covered/Tight/At risk classification, reserve policy or Plan behavior.

## UI lifecycle and accessibility

Every navigation focus starts a fresh load and clears old results. Loading is distinct
from setup, no-upcoming-items and error, with no synthetic/zero/stale-value flash.
Generic local-data errors offer Retry without displaying SQL, stacks, paths or raw
exceptions. Retry runs a fresh operation and captures a fresh date. Request generations
ignore superseded successes/failures and results after blur/unmount; application cleanup
still completes. No global state library, financial logging or remote calls are added.

The hierarchy is Laya/context → green Safe-to-Pay hero → Available now → Up next →
60-day outlook → Timeline action. Existing cream, Haraya green, gold and earth tokens,
selective editorial serif, readable financial numerals and restrained separators
follow the canonical board. No invented illustration, chart, new font or animation.
The optional time-based greeting is omitted, preserving one financial clock capture.

Screen content owns top/side safe areas; the tab bar owns the bottom inset. Text
scales and wraps; the outlook columns can wrap vertically. Existing semantic buttons
retain practical touch targets. Screen-reader labels state PHP amounts, spoken minus,
event direction and the Safe-to-Pay protection dates/recorded-information context.
Loading/error announcements are retained. Final visual fidelity, native layout and
TalkBack behavior require separate device review.

## Automated validation and DK physical checklist

Application tests cover mixed inputs, missing/zero, exact values, injected dates,
60-day agreement, recurrence, next-event identity/names, actual/start-day exclusions,
read/open/init/composition/cleanup failures, combined failures, no N+1 reads and
deterministic immutable results. Screen tests use the real navigation tree with a
mocked application boundary to cover setup/editor return, timeline action, all event
types, signed money, errors/retry, focus refresh, stale/unmounted results, accessibility
labels and scalable untruncated text. Existing Timeline and domain tests remain intact.
Navigation tests unrelated to Home opt into a fixed-date Home service mock, avoiding
database/clock work without mocking the screen or altering their prior assertions.

Run npm test, npm run typecheck, npm run lint, git diff --check and
npx expo export --platform android. Export validates bundling, not native SQLite,
process-restart behavior or physical rendering.

DK: use an isolated synthetic dataset; never reset production data. Existing records
can affect all totals. Let D be the local date and use the Timeline checklist dataset:
Available Money `8200.50`, D+1 expense `1600`, debt due `1764`, expected income `4500`,
then D+2 expense `100`, with synthetic names and no recurrence for this example.

1. Open Home with those existing records. Verify Safe-to-Pay ₱4,836.50 and Available
   now ₱8,200.50. Up next must be the D+1 expense, −₱1,600.00.
2. Verify Lowest projected ₱4,836.50 and Ending projected ₱9,236.50. Open View timeline;
   confirm its first event and sequential balances ₱6,600.50 → ₱4,836.50 → ₱9,336.50
   → ₱9,236.50. The minimum includes the starting snapshot too.
3. Update Available Money to `9000` using the existing editor. Return Home; verify
   fresh Available now ₱9,000.00, Safe-to-Pay/lowest ₱5,636.00, ending ₱10,036.00.
4. Save `0`. Return Home and confirm it remains populated: Available now/Safe-to-Pay
   ₱0.00, lowest -₱3,364.00, ending ₱1,036.00. No status classification appears.
5. Add a synthetic D+2 obligation of `2000`. Return Home: lowest remains -₱3,364.00,
   ending becomes -₱964.00, and Safe-to-Pay remains ₱0.00.
6. Fully terminate/relaunch. Confirm Home rebuilds from persisted data. If the local
   date changed, account for the intentionally shifted window and start-day exclusion.
7. On a separate synthetic installation without Available Money, verify setup opens
   the existing editor. Save zero and confirm the setup state disappears.
8. Review enlarged text, long names, scrolling and editor keyboard access. With
   TalkBack, review hero amount/window, Available now, signed upcoming event, negative
   outlook and navigation controls. Compare hierarchy against the canonical board.

Physical Home validation and final visual comparison remain pending DK confirmation.
No domain, persistence/schema/migration or dependency changes belong to this task.
