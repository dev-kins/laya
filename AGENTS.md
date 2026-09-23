# Laya Engineering Constitution

This file governs future Codex work throughout this repository. Laya is a Philippines-first, local-first debt management and financial decision-support mobile application built with React Native, Expo SDK 57, and TypeScript.

Core capabilities are Safe-to-Pay, the financial timeline and cash-flow projection, debt risk classification, Payday Mode, I'm Short recovery mode, Snowball payoff strategy, Avalanche payoff strategy, Laya Adaptive strategy, and the What-if Simulator. Preserve their distinct rules and explain changes to their behavior.

## 1. Architecture

- V1 is local-first. SQLite is the persistent source of truth for user financial data; transient UI state is not authoritative storage.
- Separate presentation, application/use-case, domain, and persistence responsibilities. Keep boundaries practical without requiring a large framework or directory hierarchy.
- UI components must not contain financial business logic. Domain logic must not directly depend on React Native UI components.
- Access persistence through defined repositories or services. Do not scatter arbitrary SQL throughout screens.
- Do not introduce cloud sync, Laravel, PostgreSQL, AI, payment-provider integrations, or bank integrations unless explicitly requested.
- A Laravel/PostgreSQL backend may support optional sync and cloud services later, but is explicitly outside the current V1 architecture. Do not build speculative backend infrastructure for it.

## 2. Financial correctness

- Never use JavaScript floating-point numbers as a monetary representation. Represent money in integer minor units: PHP 1,764.25 is 176425 centavos. If integers are carried in JavaScript `number`, enforce safe-integer bounds on inputs, intermediate results, and outputs; never store fractional currency values or rely on floating-point arithmetic for monetary results.
- Financial calculations must be deterministic. Keep critical financial rules pure and independently testable wherever practical; pass time and other external inputs explicitly.
- Never silently change Safe-to-Pay, risk, payoff, recurrence, or projection behavior. Describe each behavior change and its assumptions.
- Every change to financial calculation behavior requires corresponding tests.
- UI formatting is only for display. Never use formatted strings or rounded display values as the underlying monetary representation.
- Explicitly define rounding mode, precision, and when rounding occurs. Handle currency boundaries explicitly: retain currency identity, validate minor-unit precision, and never combine currencies implicitly.

## 3. Dates and recurrence

- Financial dates and recurrence rules must be deterministic and testable. Do not casually rely on device-local date parsing or the device timezone.
- Before implementing date storage or comparison, document a canonical strategy that distinguishes calendar dates from timestamps, defines serialization, identifies the financial timezone, and specifies comparison rules. Apply it consistently across domain logic and persistence.
- Explicitly handle timezone boundaries, end-of-month recurrence, leap years, same-day event ordering, overdue events, skipped income, and changed due dates.
- Define stable ordering for same-day events and test its financial effects. Inject the effective current date/time into calculations rather than reading the device clock inside financial rules.

## 4. Data and privacy

- Treat debt, income, bill, payment, plan, and simulation information as sensitive financial data.
- Do not log sensitive financial values or personally identifying financial information, including in debugging, analytics, crash reports, or test output. Use synthetic data in fixtures and examples.
- Never store secrets in source code.
- Minimize permissions and data collection. V1 must not request SMS, contacts, call logs, precise location, or broad media access unless a future approved feature explicitly requires it.
- Design deletion and export deliberately. Specify included records and derived data, deletion effects on retained data, and how exports avoid accidental disclosure. Do not leave these behaviors implicit.

## 5. Testing

- Financial-engine code requires strong unit-test coverage of rules, boundaries, and failure conditions, with explicit expected monetary results.
- Bugs affecting balances, Safe-to-Pay, risk classification, payoff schedules, or projections are release blockers.
- Cover applicable edge cases: zero balance, negative projected balance, unknown interest, overdue debt, partial payment, early payoff, duplicate events, irregular income, missed payday, end-of-month recurrence, leap year, same-day events, and changed due dates.
- Add regression tests for financial bugs. Do not delete or weaken tests merely to make a change pass.

## 6. Dependencies

- Do not add a dependency when the platform or existing stack can reasonably solve the problem. Before adding one, explain why it is needed and why existing capabilities are insufficient.
- Prefer Expo-compatible packages. Check the installed Expo version and matching official documentation before changing Expo or React Native API usage. Use Expo's package installer for SDK-compatible versions and the repository's existing package manager.
- Do not run or recommend destructive dependency upgrades, including `npm audit fix --force`, without explicit approval.
- Evaluate security advisories by actual runtime exposure and dependency path. Explain the impact and remediation instead of blindly applying breaking fixes.

## 7. Code quality

- Preserve or improve TypeScript strictness. Avoid `any` unless its need and boundary are documented.
- Prefer small, focused modules with explicit types and understandable code over clever code.
- Avoid premature abstractions, enterprise architecture for its own sake, giant components, and god services.
- Follow existing repository conventions unless a deliberate refactor has been approved. Do not introduce unrelated conventions or structural changes.

## 8. UI/UX and official Laya identity

Laya must not look like a generic AI/SaaS fintech application. Its official direction is modern Filipino, warm, calm, dignified, premium but approachable, and culturally Filipino without being touristy or cliché.

The core palette is:

- Haraya Deep Green
- Araw Warm Gold
- Lupa Earth Brown
- Banig Sand Beige
- Duyan Terracotta
- Sampaguita Soft Cream

Use established design tokens where available; do not invent supposedly official color values when only palette names are defined.

Visual influences may include banig/weaving geometry, capiz-inspired patterns, sunrise/path motifs, and restrained Philippine landscape influences. Use them selectively. Critical financial screens must prioritize clarity.

Avoid generic purple/blue AI gradients, neon fintech aesthetics, excessive glassmorphism, AI sparkle/orb visual language, decorative Filipino motifs on every component, and huge bubbly cards added merely because they are trendy.

Use an editorial serif selectively for brand or emotional moments and a highly readable sans-serif for financial data and controls. Financial numbers must have excellent readability and contrast. Never communicate status through color alone; provide text or another accessible cue. Accessibility and adequate touch targets are required.

## 9. Product behavior

- Laya is a planning and decision-support application, not a lender.
- V1 does not hold, transfer, lend, or facilitate user funds and does not integrate GCash, Maya, banks, or lenders. It records payments made externally.
- Never present projections as guarantees. Explain assumptions and uncertainty, including missing or unknown inputs that affect a result.
- Do not shame users for debt, missed payments, or shortfalls. Keep recovery guidance respectful, clear, and actionable.

## 10. AI/Codex behavior

- Treat user requests as engineering proposals, not automatic instructions to introduce unnecessary architecture.
- When a requested approach creates security, correctness, maintainability, privacy, or architectural problems, flag the tradeoff before implementing.
- Prefer the smallest reliable change. Inspect relevant existing code before modifying it.
- Do not rewrite unrelated files or silently expand scope. State assumptions when requirements are ambiguous.
- Do not claim a change is working without running the relevant available validation/tests. When unable to run validation, explicitly say what was not run and why. Do not imply an unavailable check passed.

## Definition of Done

- Implementation is complete within the requested scope.
- Relevant tests are added or updated and passing, including required financial behavior and regression tests.
- Type checking and linting pass where configured.
- There are no unrelated changes.
- Financial correctness and privacy rules are preserved.
- Accessibility has been considered and applicable requirements are met.
- Documentation is updated when architecture or behavior changes.
- Any unavailable validation is explicitly reported; completion claims reflect what was actually verified.
