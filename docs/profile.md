# Your Laya — Profile and V1 settings (Task #027)

Profile is the fifth main tab and the local setup/information area. It has no
account identity, avatar, email, subscription or login status. The screen renders
synchronously from presentation copy and project configuration: no financial
database read, cached balance, loading state or error state is introduced.

## Content and navigation

- **Your Laya:** a product-centered heading and local setup introduction.
- **Financial setup:** Available Money opens the existing Add stack editor using
  `Add → AvailableMoney`, with AddHub underneath. Existing Back/Done behavior
  returns to Add; selecting Profile returns to this tab. The editor retains its
  existing loading, save and draft behavior. Profile adds no duplicate editor,
  persistence operation or decorative amount read. Philippine Peso (PHP) is
  informational and cannot be changed.
- **How Laya calculates:** Safe-to-Pay is the maximum removable amount at the
  starting snapshot without the recorded scenario falling below PHP 0. An
  already-negative scenario returns zero, which does not resolve its shortfall.
  The copy does not imply guaranteed affordability or a bank-verified amount.
- **60-day protection:** Home, Timeline and Plan capture the local calendar date
  when loaded. Today is the starting snapshot; applied events are strictly after
  today through day 60 inclusive, `(startDate, through]`. No horizon setting or
  financial behavior changes.
- **Strategies:** Snowball uses smaller reported balances first. Avalanche uses
  known nominal annualized comparison rates descending, then unknown rates.
  Comparison is not accrued/compounded interest. Adaptive first groups positive
  balances that individually fit within Safe-to-Pay, then uses Avalanche for the
  remainder. Individual fit is not cumulative capacity. The three views share
  Safe-to-Pay and do not execute payments or mutate balances. None is ranked as
  superior and there are no savings or payoff-speed claims.
- **Guidance:** Review how Laya works opens the existing onboarding presentation
  in review mode, described below.
- **Privacy & data:** financial records are stored locally on the device. V1 does
  not require a Laya cloud account, connect to banks or automatically sync records
  to a Laya cloud service. This makes no claim that data can never leave a device
  or that OS backups, screenshots or development tooling cannot expose it.
- **About Laya:** explains recorded-information planning for obligations, projected
  cash flow and debt-payment scenarios. Version comes directly from
  `app.json`'s `expo.version`, the build configuration (currently 1.0.0), without a
  duplicate hard-coded version or runtime metadata dependency.
- **Positioning:** calculations depend on entered records; missing or outdated
  information changes results. Laya is for planning/information, not financial
  advice, a verified bank balance or a guarantee.

## Onboarding review boundary

The root stack exposes `OnboardingReview` only alongside the completed-installation
`MainTabs` branch. Profile navigates there; the normal first-launch `Onboarding`
route remains in the other conditional branch. No new Profile navigator is needed.
The five tabs and their existing back behavior remain unchanged.

`OnboardingScreen` has a narrow, typed presentation mode. First launch retains its
existing saving/error props and Get Started callback. Review has no saving/error
props, displays its review heading, and uses Done reviewing to `goBack()` to the
existing Profile context. Android stack back can also close review. The standalone
review owns all safe-area edges because it is above the tab navigator.

Review never calls `onboardingService.complete`, resets completion, opens SQLite,
or modifies financial records. StartupGate and the onboarding service/repository
are unchanged. Relaunch still reads the same persisted completion value. Reviewing
content creates no new persistent state and is not a first-launch replay.

## Explicit V1 limits

No accounts/authentication, cloud backup/restore/sync, export/import, bank/e-wallet
connections, notification toggles, theme controls or editable currency are added.
No disabled fake controls suggest these exist. There is no Reset Laya, delete-all,
financial-history deletion or other destructive action. Such data management needs
a separate approved contract. Domain engines, repositories, schema, migrations and
dependencies are unchanged.

## Accessibility and visual scope

Existing Screen, Surface, Button and LayaText primitives provide scrolling,
safe-area handling, scalable/wrapping text, semantic headings and named buttons
with 48-point minimum touch height. No text truncation, icon-only action or
color-only meaning is introduced. Review keeps its accessible controls and hides
decorative landscape shapes from assistive technology.

Cream, Haraya green, a restrained gold rule, earth text and editorial hierarchy
follow existing tokens and the canonical board. Sections use restrained separators
rather than many settings rows. This is functional product UI; final fidelity and
physical TalkBack/layout validation remain pending DK review.

## Automated verification

Profile tests cover real navigation, all sections and supported copy, absence of
fabricated identity/unsupported controls, derived version, PHP, no financial read,
the existing Available Money route, review/return/relaunch, no completion or
database writes, font scaling/wrapping and action roles/targets. Existing
first-launch tests remain unchanged; App navigation expects the real Your Laya
heading and retains five-tab checks. Home/Timeline/Plan and host SQLite regression
tests remain part of the full suite. Mocked navigation/service tests do not replace
physical persistence and Android-back verification.

Run `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, and
`npx expo export --platform android --output-dir "$env:TEMP\laya-task027-android-export"`.

## DK physical Android checklist

Use synthetic financial records in a test installation; do not reset real data.

1. Open the fifth tab, Profile; verify Your Laya and the five unchanged tabs.
2. Read financial setup, calculation explanations, guidance, privacy and About;
   verify PHP and the version matching the app configuration.
3. Open Available Money and verify the existing editor and saved value.
4. Use its existing Back/Done flow, then select Profile; verify normal return.
5. Open Review how Laya works and inspect the existing introduction.
6. Use Done reviewing; reopen review and test Android back as well.
7. Confirm each review exit returns to Profile, without Get Started or save status.
8. Confirm synthetic debts, income, expenses and Available Money remain present.
9. Fully terminate and relaunch.
10. Confirm launch bypasses first-launch onboarding as before.
11. Check Home, Timeline and Plan still show data derived from the same records
    (allow the normal date-window change if the local day changed).
12. Review scrolling, including reaching both actions and the About disclaimer.
13. Enlarge system text; check wrapping, overlap and clipping in Profile/review.
14. Use TalkBack to check headings, button names, reading order and review return.
15. Check practical touch targets. Profile/review contain no editable fields;
    keyboard review applies only to the reused Available Money editor.
16. Compare cream/green/gold balance, density and typography with the canonical
    design reference. Final visual-fidelity approval remains separate.
