# Essential Expense / Pangunahing Gastusin — Task #015

Add → Essential Expense opens Magdagdag ng gastusin. View my expenses opens
Mga Gastusin from the hub or the “Gastos saved” state. Success returns to an
existing overview or replaces the saved form with one. Done returns to the prior
screen. Back discards an unsaved form; tab changes retain it. Removal is blocked
while saving. Debt and Income flows and the five bottom tabs remain unchanged.

An EssentialObligation is a dated non-debt obligation the user wants to protect
when planning available money. This is not a spending ledger, debt/payment,
income or bank transaction. Only existing name, amount, date and optional
recurrence are entered and displayed. There are no categories, status/paid flags,
provider/accounts, notes, priorities, budgets, risk or affordability claims.

## Exact input and display

Name uses existing domain validation. Amount stays text through Money.parse in
PHP and nonnegative validation. Zero is valid, blank is not. Malformed, negative,
excess-precision and unsafe values fail without rounding. FinancialDate.parse
requires a valid YYYY-MM-DD calendar date; no default today, JS Date or timezone
conversion. Optional recurrence is none, monthly or twice-monthly, constructed
through Recurrence factories. Requested days 1–31 survive unchanged, including
30/31; duplicate twice-monthly anchors fail. Switching to no schedule omits
recurrence, even when day fields still contain text.

Existing financial formatters provide exact integer-digit PHP display through
MAX_SAFE_INTEGER, timezone-free calendar labels and recorded recurrence anchors.
No occurrences or totals are generated. Overview records retain repository binary
ID ordering, described as consistent record order, never financial priority.

## Application lifecycle and UI state

One createAddExpenseOperation instance belongs to each form. A validated first
submission gets an Expo native uuid.v4() wrapped with obligationId; no financial
information enters the ID. Retries retain that identity, including when a save
commits but closing fails, so repository upsert cannot create a duplicate. This
is in-memory retry identity, not a persisted draft across process restarts.

The operation constructs EssentialObligation, opens initialized SQLite, saves
through the unchanged EssentialObligationRepository, then closes its owned
connection before success. listExpenses similarly opens, lists, closes and
returns validated immutable entities. Failed operations still close; simultaneous
operation/cleanup failures retain both causes via AggregateError. Close-only
failures reject. Initialization failure cleanup remains owned by the opener.
No SQL or repository calls appear in screens.

A synchronous ref guard blocks duplicate submission. Save exposes disabled/busy
state and inputs disable during saving. Failures preserve entries and retry ID,
show generic respectful copy and never display raw errors. Success offers View
my expenses and Done. No financial logging, analytics, network calls or permissions
are added.

Overview reloads on navigation focus and successful-save return. Retry starts a
new read. Loading clears previous data without flashing empty; successful empty
reads explain that no expenses have been recorded. Error hides stale records and
offers Retry. Request generations ignore superseded/blurred/unmounted results
while the service continues its owned cleanup. No global state or polling.

Shared controls/primitives retain visible labels, text errors, selected radio
semantics, practical targets, scalable and wrapping text, safe areas and scrolling.
The form uses the existing keyboard-avoidance pattern. Rows group recorded facts
with explicit Philippine-peso screen-reader labels. The canonical cream/green/gold
and serif hierarchy guide this functional-stage UI; final visual fidelity and
physical accessibility/keyboard behavior are not claimed verified.

## Verification

Focused tests cover parsing boundaries, recurrence 30/31, retry identity, duplicate
submits, cleanup failures, real host SQLite write/reopen reads, zero/multiple
records, navigation, exact display, loading/empty/error/retry, focus refresh and
stale-result protection. Android export verifies bundling, not native SQLite or
physical process-restart persistence.

DK device checklist (synthetic data only):

1. Open Add → Essential Expense. Enter `WiFi Test`, `1499.50`, `2026-10-31`,
   monthly day `31`. Save; verify “Gastos saved”.
2. View my expenses: verify the name, ₱1,499.50, Oct 31, 2026 and requested day 31.
3. Add `School Expense Test`, `0`, `2026-10-04`, no repeating schedule. Verify
   ₱0.00, the entered date and no invented recurrence/status.
4. Add `Transport Test`, `300.25`, `2026-10-30`, twice monthly days `30`/`31`.
   Verify both anchors and all three records.
5. Fully terminate the app, relaunch, open View my expenses and verify every
   record remains exact. Review keyboard access, large text, wrapping and TalkBack.

Physical Essential Expense persistence remains unverified until DK confirms this
path. No domain, repository, schema/migration or dependency changes are made.
No aggregation, projections, Safe-to-Pay, Timeline or Plan behavior is implemented;
Home remains synthetic. No final visual approval is implied.
