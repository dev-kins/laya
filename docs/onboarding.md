# First launch

Migration 2 creates `app_preferences(key TEXT PRIMARY KEY NOT NULL, value TEXT
NOT NULL)` in `laya.db`. Migration 1 is unchanged. Each migration uses the existing
transaction and `user_version` system; no existing data is reset.

The repository centrally defines `onboarding_completed`. Only exact text `"1"`
means complete. Missing rows and every other value mean incomplete. Reading errors
are failures, never completion. `markComplete()` uses a bound, idempotent upsert.

Startup shows a minimal initialization view while the application service opens
and initializes the database, reads the repository, and closes the owned connection.
Incomplete users see one onboarding screen; completed users enter Main Tabs/Home.
Failures show a generic local-data error and retry. Neither route is shown early.

Get Started disables itself while saving, with a synchronous duplicate guard.
Only a successful service operation switches the root stack to Main Tabs; failure
keeps onboarding visible with retry. Back cannot revisit a removed onboarding
route. No navigation state is persisted and no global-state library is used.

Onboarding has two bounded database operations: launch check and completion.
Add Debt now follows the same bounded pattern (see `docs/add-debt.md`).
Each service operation owns and closes its connection, even if its
caller unmounts. This deliberately avoids retaining an unused connection while
Home remains synthetic. Close failures propagate; operation plus close failures
are preserved together. Later financial repositories can adopt a shared app
connection when their lifecycle exists. If a write commits but close fails, the
UI stays on onboarding; retry is idempotent and a later launch reads the committed
value. No completion state is inferred from a failed operation.

The screen uses the canonical board's palette and atmosphere through clipped
View shapes, not copied imagery or an invented logo. The serif wordmark remains
text-only. Content flows in a scrollable safe-area layout with font scaling;
decorative landscape elements are excluded from screen readers.

Automated first-launch reset uses newly allocated disposable SQLite fixtures and
service doubles. No production reset control or database-wipe procedure exists.
Host SQLite tests verify migration, rollback/retry, semantics, and reopen behavior;
they do not prove Expo SQLite behavior on Android. Device review must check first
launch, Get Started, relaunch bypass, back behavior, narrow widths, large text,
and visual balance against the canonical design.

Task #027 adds a separate `OnboardingReview` root route from Profile. It reuses
the presentation with a review heading and Done reviewing action wired only to
navigation back. Review neither invokes the completion service nor changes the
stored first-launch preference or financial records. Its typed mode accepts no
saving/error props. The first-launch gate and Get Started behavior above remain
unchanged. See [Profile](profile.md) for review validation and the device checklist.
