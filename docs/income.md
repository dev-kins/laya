# Kita / Income — Task #014

Add → Kita opens Magdagdag ng kita. The hub and “Kita saved” state offer
View my income → Mga Kita. The overview offers Add income and Back to Add.
Success pops to an existing overview or replaces the saved form with one; Done
returns to the previous screen. Back discards unsaved input, tab switching retains
it, and navigation removal is blocked during saving. Essential Expense remains
unavailable. Debt behavior is unchanged.

## Input and domain boundaries

Name, PHP amount, canonical calendar date and status are required. Neither status
is initially selected. Expected means money the user expects to receive, without
guaranteeing arrival; Received means an actual dated receipt. These are existing
Income semantics, not new cash-flow or reconciliation rules.

Only Expected exposes optional none/monthly/twice-monthly recurrence. Requested
days 1–31 pass through Recurrence factories; 30/31 are preserved, never clamped
in the form. Twice-monthly anchors must differ and the domain orders them.
Selecting Received clears recurrence and both day fields, including when switching
back to Expected. Independently, application parsing explicitly omits recurrence
from received Income.create inputs even if stale hidden fields are supplied.

Amount remains text until Money.parse(text, 'PHP') and domain nonnegative
validation. Zero is valid; blank, negative, unsafe and excess-precision values
are invalid. There is no rounding or floating-point monetary arithmetic.
FinancialDate.parse requires YYYY-MM-DD, including valid leap dates. Blank cannot
become today; no JS Date, device timezone or clock participates in financial meaning.

## Identity, ownership and failures

One createAddIncomeOperation instance belongs to each form. The first valid
submission obtains the established Expo native uuid.v4() identity, validated by
incomeId. The ID contains no financial information and survives retries during
that form session, including a committed write followed by close failure.
Repository upsert therefore retries the same record. No persisted draft or
cross-relaunch retry identity is introduced.

The write application operation parses and constructs Income, opens initialized
SQLite, uses the unchanged IncomeRepository.save, closes its owned connection,
then returns success. listIncome similarly opens, calls IncomeRepository.list,
closes, and returns validated immutable entities without sorting or modifying
them. Each operation owns a bounded connection, consistent with the debt slice;
the repository does not open/close it. Failed initialization remains the existing
opener's responsibility. Operation failure still closes; AggregateError retains
both operation and cleanup failures. Close-only failures reject too.

A synchronous ref guard prevents duplicate submissions. Save and form controls
disable while saving, Save exposes busy state, and success waits for save plus
cleanup. Failure keeps entered values and retry identity, showing respectful
generic copy. Raw exceptions, SQL and financial contents are never displayed as
errors or logged. No remote requests, analytics or additional permissions.

## Read experience and display

A stable useFocusEffect refreshes on initial focus, return from Add Income and
tab refocus. Retry starts another bounded read. Each load clears previous display;
request generations ignore superseded results and results after blur/unmount,
without interrupting the application's cleanup. No global state or polling.

Loading has no fake values or empty-state flash. Successful empty reads explain
that no income has been recorded and offer Add income, without asserting no
real-world income. Read failure shows neither stale records nor an empty state;
it offers Retry with generic local-data copy.

Rows show name, exact PHP amount, calendar date and textual Expected/Received.
Only recorded expected recurrence is shown; receipts have no recurrence. No
occurrences are generated. Existing binary ID order is retained: deterministic
record order, not financial priority, date ranking or forecast order.

The existing formatter module is renamed from debt.ts to financial.ts without
changing its logic. Both slices share exact integer-digit PHP formatting through
MAX_SAFE_INTEGER (₱90,071,992,547,409.91), timezone-free date labels and requested
recurrence labels. Generic debt form controls are renamed FinancialFormControls
and reused, with unchanged debt control behavior.

Visible labels, textual errors, selected radio states, live loading/error messages,
48-point control targets, scalable text and wrapping are retained. Rows group
recorded facts with explicit Philippine-peso accessibility labels. Safe-area and
keyboard handling follow Add Debt; physical TalkBack/keyboard/large-text review
remains necessary.

The canonical board guides cream, green, restrained gold, editorial headings and
readable financial data. Current visual implementation is not final visual approval.
There is no income aggregation, projection or Safe-to-Pay behavior. Home remains
synthetic. No editing/deletion, categories, other financial features, dependencies,
domain changes, schema/migration changes or repository changes are included.

## Verification and physical Android checklist

Tests cover input boundaries, status switching, recurrence exclusion, IDs/retries,
operation/cleanup failures, host SQLite save-close-reopen get/list, and presentation
navigation, loading/empty/error/retry, exact display, duplicate submission and
focus/stale-result behavior. Host SQLite tests and Android export do not verify
the native bridge or process-restart persistence. DK has already confirmed the
Debt path physically; the new Income path awaits independent device confirmation.

Use synthetic data only:

| Record | Name | Amount input | Date | Status | Recurrence |
| --- | --- | --- | --- | --- | --- |
| A | Salary Test | 25000.50 | 2026-10-04 | Expected | Monthly, day 4 |
| B | Freelance Test | 8500 | 2026-09-27 | Received | None |

1. Open Add → Kita and save Salary Test.
2. Choose View my income; verify Mga Kita shows ₱25,000.50, Oct 4, 2026,
   Expected and Monthly on day 4.
3. Add Freelance Test; verify both records, including ₱8,500.00,
   Sep 27, 2026 and Received with no recurrence.
4. Fully terminate the app, relaunch, open Add → View my income and verify both
   records persist exactly.
5. Review keyboard reachability, wrapping/large text, TalkBack and visual balance.

Only after DK confirms this run may native Expo SQLite Income persistence across
process restart be reported as physically verified for this path.
