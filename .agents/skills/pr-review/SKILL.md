---
name: pr-review
description: Review a pull request or diff in this repo for maintainability, architecture, and compatibility with the old extension. Use when asked to review a PR, a branch, or a diff, or before opening a PR to self-review.
---

# Reviewing a pull request

This skill says how to judge a diff. The rules themselves are in
[AGENTS.md](../../../AGENTS.md) and
[packages/databricks-vscode/AGENTS.md](../../../packages/databricks-vscode/AGENTS.md),
and the reasons behind them are in [ARCHITECTURE.md](../../../ARCHITECTURE.md).
Where this skill and those files disagree, they win. Paths without a package
prefix are in `packages/databricks-vscode/`, as in `AGENTS.md`.

## 1. Before you comment

- Read `AGENTS.md`, `packages/databricks-vscode/AGENTS.md` and
  `ARCHITECTURE.md`, even if you think you remember them. Then read
  [REVIEW.md](../../../REVIEW.md): what to check beyond CI.
- Read the PR description and any linked issue. Work out the PR's one intent;
  you judge every change against it.
- Check CI status. Don't repeat what `yarn check` already reports: lint
  findings, contract test failures, ratchet regressions, type errors.
- Read the diff in context: open the surrounding file, not only the hunk. Look
  at how the repo already does the same thing before you suggest anything.
- Note the blast radius: which layers it touches (`platform/`, `kernel/`,
  `features/<name>/`, the bootstrap), and whether it changes `package.json`
  contributions, state keys, settings, telemetry events, or the public API
  (`src/api.ts` and `packages/databricks-vscode-types/`). The wider the
  radius, the closer you read.

## 2. Hard-rule violations (usually `blocker`)

The rules are in the "Hard rules" section of `AGENTS.md`. Most are enforced in
CI; the "What is enforced" part of `ARCHITECTURE.md` says which. Check these
by hand, because the tooling can't see them:

- A feature shows an error or warning through another `window.show*Message`
  call (`showWarningMessage`, `showInformationMessage` used for a failure)
  instead of throwing `UserFacingError`. The lint rule only catches
  `showErrorMessage`.
- An SDK client built through indirection the lint rule doesn't follow: a
  class held in a variable or passed as a parameter first, then constructed
  with `new`; or one imported through a path alias.
- I/O in `Feature.register()`: file reads, network calls, CLI calls, awaited
  promises that reach any of them. The activation budget catches slow I/O,
  not fast I/O.
- `vscode` reaching `kernel/` some other way than an import, such as a
  `vscode` type re-exported through a `platform/` module, or a `vscode` object
  passed through a kernel interface typed as `unknown`.
- One feature depending on another other than through an `internalCommand()`
  in `kernel/`: a relative import across features, or a shared module moved to
  a place that dodges the boundary rule.

## 3. Never-do violations (`blocker` unless explained)

These are a `blocker` unless the PR description explains why and tags a human
owner to approve it. The list is in the "Never do" section of `AGENTS.md`:

- a loosened value in `ratchet-baseline.json`;
- a new `eslint-disable` or `oxlint-disable` comment;
- a skipped or `todo` test, or a test made to pass by weakening its assertion;
- edits to `src/test/contract/oldManifest.json` or
  `src/test/contract/e2eContract.json`, or new entries in the
  `REMOVED_*`/`RETIRED_*`/`INTERNAL_COMMANDS` lists, without a real reason;
- any change under `.yarn/releases/`.

Also a `blocker`: any change that turns off or weakens TLS verification,
such as `strictSSL: false`, `rejectUnauthorized: false` or setting
`NODE_TLS_REJECT_UNAUTHORIZED`, including in tests and scripts.

## 4. Compatibility with the old extension

Users switch between this extension and the old one, so the contract tests
hold the old surface. They catch most drift; look for what they don't:

- a state key or setting renamed, or its stored type changed (a string that
  became an object, a boolean that became an enum), so the old extension
  can't read the value;
- a command ID, menu entry, or `when` clause changed, including a command
  that moved to a different menu group or lost its enablement;
- a telemetry event or property renamed, or a property's type changed, so it
  diverges from the old extension's;
- new persisted state (state keys, files under `.databricks/`, workspace
  files) with no story for what the old extension does with it, or what
  this one does when the value is missing.

## 5. Things nothing enforces

The recipes in `AGENTS.md` mark some steps "(inferred)": no test checks them.
Check them by hand when the diff touches the area:

- a new setting's default in `setting()` matches the default in
  `package.json` `contributes.configuration`, and it has a description;
- code that reads a setting and must react to a change subscribes to
  `settings.onDidChange`;
- a new feature sits at the right place in `FEATURES` in `src/features.ts`
  (the order is registration order);
- no new view name contains another view's name (the e2e helpers match by
  substring);
- a command an e2e spec runs with `executeCommand` is listed in
  `src/test/contract/e2eContract.json`.

## 6. Placement and design

- Use the decision test in the "Layers" section of `ARCHITECTURE.md` to judge
  whether code is in the right layer or feature. Say which branch of the
  test it fails.
- Flag speculative abstractions: an interface with one implementation and no
  test double, options nobody passes, a generic helper with one caller.
- Flag duplication of an existing helper, and name the existing code
  (file and symbol) that should be reused.
- Flag SSH tunnel, driver proxy or Databricks Connect details leaking into
  UI code (views, tree items, quick picks, webviews). UI should see a
  state, not the mechanism.
- Flag new public surface that isn't justified: new exports, new commands,
  additions to `src/api.ts` or `packages/databricks-vscode-types/`.
- For every new Databricks API call, check which connection it uses
  (the workspace connection or Unity Gateway) and that it matches the
  decision test.

## 7. Maintainability

- Readability and naming: can you tell what a function does from its name and
  signature? Do names match the repo's vocabulary?
- Comments explain why, not what. Flag comments that restate the code, and
  missing ones where the code does something surprising.
- `any`, unchecked casts, and swallowed errors (`catch {}`, a `catch` that
  only logs where the caller needed to know).
- Dead code: unused parameters, unreachable branches, code left behind by a
  refactor.
- New dependencies: is one needed, is it maintained, does the repo already
  have something that does the job?
- Test quality: the right level (unit test with the fakes in `test-support/`
  before an e2e spec), a regression test for every bug fix that fails without
  the fix, no flaky patterns (real timers, sleeps, ordering assumptions,
  real processes or network).
- Disposables and resource leaks: listeners, watchers, processes and timers
  are disposed with the feature or the session that started them.
- Secrets in logs or error messages: tokens, passwords, full environment
  dumps, URLs with credentials.

## 8. Verification claims

Compare what the PR changed with the "If you changed → Run" table in the
"Before you finish" section of `AGENTS.md`, and flag gaps: for example a PR
that changes activation or `register()` but only ran `yarn check`. Never ask
for anything listed under "What you cannot run unattended"; if the change
needs the real e2e run, say a human should run it.

## 9. Change hygiene

- One intent per PR. Flag unrelated churn: drive-by renames, reformatting,
  refactors the intent doesn't need.
- Flag a PR over roughly 400 changed lines, excluding generated files and
  lockfiles, unless the description justifies the size. Suggest how to split
  it.
- Agent-written code is held to the same bar as human code.

## 10. Existing violations

A legacy violation the PR only moves or touches is not a `blocker`; a new one
is, even if it copies an existing pattern.

## 11. Do not

- Comment on what the linter or the contract tests enforce.
- Rewrite the PR in your own style.
- Repeat a comment on every occurrence: comment once, and list the other
  locations in it.
- Block on style. Style is a `nit`.
- Speculate about code you haven't read. Read it, or ask a `question`.

## 12. Severity levels

Give each comment exactly one:

- `blocker`: must change before merge. Breaks a hard rule, a never-do item,
  compatibility, security, or correctness.
- `should-fix`: a real cost (a bug risk, a maintenance burden, a gap in
  tests), but not a merge stopper on its own.
- `suggestion`: a better way that the author may reasonably decline.
- `nit`: style or wording.
- `question`: you need information to judge.
- `praise`: something worth keeping or copying.

Post at most 10 comments, the most severe first. If you drop some, say how
many and of which severity.

## 13. Comment format

Anchor each comment to the exact line, and write it as:

```text
[severity] One-line summary

Why it matters: the concrete cost if it stays.
Suggestion: the specific fix, naming the existing code to reuse, or the
AGENTS.md / ARCHITECTURE.md section when you cite a rule.
```

## 14. Summary format

```text
Verdict: approve | approve with suggestions | request changes
Intent: one sentence.
Maintainability: a short assessment.
Blockers (N): one line each.
Should-fix (N): one line each.
Compatibility with the old extension: what changes for a user switching back, or "none".
Follow-ups worth a ticket: ...
Not reviewed / low confidence: ...
```

Use "request changes" only if there is at least one `blocker`.

## 15. Self-check before posting

- Every `blocker` and `should-fix` names a concrete cost and a specific fix.
- I checked the repo for an existing pattern before suggesting one.
- I didn't repeat what CI reports.
- The summary says honestly what I didn't read or verify.

## 16. Re-reviews

When the PR already has review comments, review only what changed since the
last review. Don't re-raise comments that were resolved; if a fix is
incomplete, reply on that comment instead of opening a new one.
