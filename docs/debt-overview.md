# Utang Overview

Add → View my debts opens Mga Utang in the existing Add stack. Add Debt success
also offers View my debts: it pops to an existing overview or replaces the saved
form with one when needed. Done retains its existing back behavior. The overview
offers Add a debt and Back to Add. The five tabs and synthetic Home are unchanged.

`listDebts()` is a bounded application read: open the initialized database, call
the existing DebtRepository.list(), close the owned connection, then return its
validated entities unchanged. Read failure still closes; combined read/close
failures retain both causes via AggregateError. Close-only failure is a failure,
not successful data. The screen never opens SQLite or queries repositories.

A memoized React Navigation useFocusEffect reads on initial focus, return from
Add Debt, and tab refocus. Retry triggers a new bounded read. Each read replaces
old state with loading; errors show neither empty nor stale debts. Focus cleanup
ignores late results without interrupting the service's connection cleanup. There
is no global cache/state library, polling, or read on every render.

Loading communicates “Opening your recorded debts…” without fabricated values.
A successful empty list shows “Wala pang utang na nakatala.” and Add a debt; this
does not assert the user is debt-free. Errors use generic local-data copy and
Retry. No SQL, exception details or financial values are logged or shown as errors.

## Display semantics

- PHP formatting uses the validated integer's digits: split the final two digits
  as centavos, group whole pesos in threes, and always show two decimals. No
  division, floating formatting, or rounding. Maximum safe integer formats as
  `₱90,071,992,547,409.91`. The shared display helper also preserves signed Money.
- Interest uses the same digit placement for integer basis points, with trailing
  fractional zeros removed: 1250 bp → `12.5%`. Annual renders “annually”; monthly
  renders “monthly”. Unknown renders “Interest rate not entered”, distinct from
  `0%`. No interest calculation or period conversion occurs.
- Dates use explicit English abbreviated month names and validated calendar
  components, with four-digit years: `Oct 10, 2026`, `Jan 1, 0001`. No JS Date or
  device-timezone conversion is used.
- Recurrence shows requested anchors as “Monthly on day 10” or “Twice monthly on
  days 30 and 31”. Days above 28 include a shorter-month explanation; both anchors
  remain visible. No occurrences are generated for display.
- Provider, regular payment, date and recurrence are omitted when absent. Missing
  payment never becomes zero; a recorded zero payment displays `₱0.00`. No due-date
  omission is described as proof that no due date exists.

Rows retain repository binary ID order. The ordering is deterministic, not a
financial recommendation; explanatory copy makes this clear. Rows are not tappable
and imply no debt detail/edit capability. Names and values wrap without one-line
truncation. Each debt is grouped for screen readers with explicit Philippine-peso
labels and its recorded facts. Loading/errors announce updates, actions have
accessible labels and existing practical touch targets, and font scaling remains
enabled. Safe-area ownership follows the existing content/tab-bar split.

No total debt calculation is performed in Task #013.

The canonical design board remains authoritative. This implementation uses its
cream/green hierarchy, small gold accent, editorial serif headings and restrained
separators. Current presentation is not final visual approval or claimed final
fidelity. No provider logos, new palette, decorative financial values, remote
requests, analytics or seed/special-case logic are included.

## Verification

Tests cover exact formatters, bounded read ownership/failures, real host SQLite
save-close-reopen reads for empty/single/multiple debts, and presentation loading,
empty, optional facts, error/retry, success navigation, focus refresh and stale
async results. Host SQLite and Android export do not prove physical-device behavior.

DK's physical-device checklist (synthetic information only):

1. Launch Laya; open Add → Utang / Add a debt.
2. Enter name `GCash GLoan Test`, balance `10584.78`, provider `GCash`, regular
   payment `1764`, unknown interest, due date `2026-10-10`, monthly day `10`.
3. Save and choose View my debts.
4. Verify `₱10,584.78`, `₱1,764.00`, `Interest rate not entered`, `Oct 10, 2026`,
   and `Monthly on day 10` alongside the entered name/provider.
5. Fully terminate the app, relaunch, open Add → View my debts, and verify the same
   record and values remain. An existing Task #012 synthetic record should appear
   naturally; no migration/reset is needed.
6. Review large text, wrapping, TalkBack grouping and visual balance.

Native Expo persistence across process restart remains pending until DK performs
and confirms this path. No real financial information should be used for validation.
No totals, ranking, debt detail/edit/delete, payments, other entry types, projections,
strategies, real Home data, sync or integrations are implemented by this task.
