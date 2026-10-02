# Navigation foundation

`App.tsx` composes the safe-area provider, status bar, and startup gate.
The native root stack conditionally contains `Onboarding` or `MainTabs`, only
after the persisted completion check. Successful completion removes Onboarding
from the available routes, so back cannot return to it. Root and tab route
parameters are defined in `src/presentation/navigation/routes.ts`.

Main tabs are Home (initial), Timeline, Add, Plan, and Profile. Android back
returns from another tab to Home, then follows the platform's normal app-exit
behavior. React Navigation owns transient navigation state; it is not persisted.

Home now displays the [real financial outlook and Safe-to-Pay](home.md).
The unused synthetic VisualShowcase has been removed.
Timeline now displays the [real financial projection](timeline.md), and Plan displays the [factual planning overview](plan.md). Profile remains a route shell. Add contains a nested native
stack for AddHub, AddDebt, DebtOverview, AddIncome and IncomeOverview. AddHub and the saved-debt state offer
View my debts. Success pops to an existing overview (or replaces the saved form
with one). Done returns to the previous screen; back from an unsaved form discards
it, while removal is blocked during saving. The overview reads on focus and offers
Add a debt. Screens call focused application operations; SQL remains in persistence.
See [Add Debt](add-debt.md) and [Utang Overview](debt-overview.md).
Kita follows the same form/success/overview navigation and focus-refresh pattern;
see [Kita / Income](income.md). AddExpense and ExpenseOverview now follow the same
pattern for [Essential Expenses](essential-expenses.md), reachable from the hub
and the saved-expense state through View my expenses.

AvailableMoney is another route in the Add stack, reached through Set available
money. Its editor loads once per mounted visit, supports Retry after a read
failure, and preserves drafts across tab switches. Saving replaces the singleton;
Done returns to AddHub. The hub shows no cached amount. See
[Available money](available-money.md). Timeline's missing-money action opens this
same editor through the typed nested Add route, retaining AddHub beneath it.
Returning to Timeline refreshes its data on focus. Home's setup/update actions
reuse the same editor, and View timeline selects the existing Timeline tab.
Home also refreshes on focus and ignores superseded results.

Headers are hidden. Screen content owns top and side safe-area insets; the
non-overlay tab bar owns the bottom inset. Tab screens disable Screen's bottom
safe area to avoid counting it twice. Standalone Screen use retains all edges.

The tab bar uses only Ionicons, loaded through Expo's font/asset support. Laya
typography remains system fonts. Labels and selected semantics are supplied by
React Navigation, with filled/outline icons providing an additional active cue.

Jest uses Expo's Android preset and explicit Expo Babel transformation. App tests
exercise the real navigation tree, including tab selection and return to Home.
Native safe-area measurements use the existing library mock. Android export
checks bundling, not device rendering or hardware-back behavior; those still
require a device review.

See [first-launch behavior](onboarding.md) for persistence and startup semantics.
