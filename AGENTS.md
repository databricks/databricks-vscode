# AGENTS.md

## What this is

The Databricks extension for VS Code: a set of features for developers who
build on the Databricks platform. It is a modular monolith: Yarn 4 workspaces,
TypeScript. The extension's source has three layers under
`packages/databricks-vscode/src/`: `platform/` -> `kernel/` ->
`features/<name>/`. Imports flow one way only, and features never import each
other.

## Before you finish

`yarn check` must pass. CI (`.github/workflows/check.yml`) runs it, and
`yarn fmt:check`, `yarn build`, `yarn test` and `yarn typecheck`, each as its
own job.

| If you changed                                                               | Run                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| any code                                                                     | `yarn fmt`, then `yarn check`                                                                            |
| telemetry events                                                             | `yarn check`; to read `telemetry.json`, `yarn build && yarn workspace databricks generate:telemetry`     |
| `resources/python/`                                                          | `yarn test` (its unittest suite runs only if `python3` or `python` is on `PATH`; say so if neither is)   |
| `features/python/`, activation, `register()`/`start()`, listeners, CLI calls | `yarn test` (`yarn check` skips `features/python/python.test.ts` and the budgets in `src/test/budgets/`) |
| e2e specs or helpers (`packages/databricks-vscode-e2e/`)                     | `yarn typecheck` (`yarn check` doesn't typecheck that package)                                           |
| UI or behaviour flows                                                        | `yarn workspace databricks-vscode-e2e test:e2e:mock` (see below)                                         |

Paths without a package prefix are in `packages/databricks-vscode/`.

## What you cannot run unattended

- `yarn test:e2e`: needs Node 24, a downloaded VS Code, and a real workspace: a `[DEFAULT]`
  profile in `DATABRICKS_CONFIG_FILE`, plus `TEST_*` variables for some specs.
  `yarn test:e2e:spec:real [<name>] --profile <cli-profile>` needs the same, but makes the `[DEFAULT]` from a CLI profile.
- `ssh_connection.ucws`: opt-in (`TEST_SSH_E2E=true`), needs Serverless SSH compute; it can't pass against the mock.
- The integration tests (`.github/workflows/integration-tests.yml`, the "Integration Tests" check, as on 2.x): each e2e
  spec, then the SDK clients (`src/test/integration-sdk/`), against real workspaces. The CI calls these scripts of
  `packages/databricks-vscode` by name, so keep them: `ts-node scripts/list_integration_tests.ts` (the spec matrix),
  `test:integ:extension --spec <path>`, `package:cli:fetch` and `test:integ:sdk`. They take a workspace from
  `DATABRICKS_HOST` and a token or service principal, plus `TEST_DEFAULT_CLUSTER_ID` (`scripts/integration/`).

Use `yarn check`, `yarn test` and the mock suite instead. If a change really needs the real e2e run, say so in your report.

The mock suite needs no Databricks credentials, but it does not build: run
`yarn build && yarn workspace databricks fetch:cli` first. It needs
Node 24, `openssl`, network access (it downloads VS Code and the extension
dependencies), and `xvfb-run` on Linux without a display. The Databricks
Connect specs (`setup_local`, `run_dbconnect`) also need `uv` and a package
index (`PIP_INDEX_URL`). One spec file at a time, the whole suite takes about
20 minutes; `E2E_WORKERS=6` runs 6 side by side, each on an Xvfb display of
its own on Linux, in about 5. Options are in
`packages/databricks-vscode-e2e/mock/README.md`.

## Hard rules

`src/test/contract/`, `.oxlintrc.json` (with the rules in
`packages/databricks-vscode/oxlint-plugin.mjs`) and `.dependency-cruiser.cjs`
check these in `yarn check`. `src/test/budgets/` runs only in `yarn test`
(CI's `test` job). `ARCHITECTURE.md` ("What is enforced") says which check
covers what, and what only review catches.

- `Feature.register()` does no I/O; do I/O in `start()`. `activate()` has a
  100 ms budget (`src/test/budgets/activation.test.ts`, `yarn test` only),
  which catches slow I/O, not all I/O. `start()` runs after every feature is
  registered, without blocking activation. The whole activation the user waits
  for, with the module load, is the ratchet's
  `activation.extensionHostMs` (`scripts/perf/activationMetric.mjs`), measured
  only on the machine and setup its baseline was recorded on.
- Register commands through `ctx.commands`. That disposes them with the
  feature, records the IDs the manifest contract compares with `package.json`,
  renders errors and records `commandExecution` telemetry.
- Build SDK clients only through `connection.api.get(Client)`. `ApiClients`
  shares the connection's host, credentials and transport, and turns off the
  SDK's own profile lookup, so ambient `DATABRICKS_*` variables can't override
  the profile.
- Start child processes only through `platform/process.ts` (`kernel.cli`,
  `kernel.processes`), with `kernel.childEnv()`. The process layer is
  injectable, so it is unit-tested, and kills process trees; `childEnv()` is
  the single answer to what children see (profile, CLI path, proxy, bundle
  variables, compute).
- Throw `UserFacingError` (`platform/errors.ts`) instead of showing errors.
  Only the `CommandRegistry` and views render errors, with their actions;
  throw `CancelledError` when the user dismisses a prompt, which is silent.
  Outside a command (a listener, a background task), pass the
  `UserFacingError` to `ctx.commands.showError`.
- Use other VS Code extensions only through `kernel.extensionDependencies`
  (`platform/extensions.ts`), each listed in `kernel/extensionDependencies.ts`
  (the recipe below). It handles one that's missing, disabled or too old the
  same way everywhere; outside `platform/workspace.ts`, nothing reads
  `vscode.extensions` or runs a `workbench.extensions.*` command.
- `platform/contextKeys.ts` (`ContextKeys`) is the only `setContext` caller.
  It skips unchanged values, and keys go through `contextKey()` so the manifest
  contract can check every `databricks.*` key in a when-clause.
- The extension runs in local windows and in session windows, whose
  extension host runs on Databricks compute (`kernel/host/`). Features read
  `ctx.kernel.capabilities`, never where they run. Each declares how every
  command and view it contributes behaves in a session window
  (`Feature.session`), and a when-clause hides what a host lacks with a
  `databricks.context.host.*` key, never `databricks.context.remoteMode`.
  `src/test/contract/hosts.test.ts` checks the entries against
  `package.json`.
  A walkthrough's `when` uses VS Code's `remoteName` (`!remoteName` keeps it out of a session window), not a
  `databricks.context.host.*` key: host keys are unset until activation, and VS Code checks a walkthrough's `when`
  when it opens the walkthrough on install.
- Features never import each other. One feature runs another's command
  through an `internalCommand()` declared in `kernel/`
  (`ctx.commands.registerInternal` / `ctx.commands.execute`).
- `kernel/` imports no `vscode`, not even types, so it runs under plain Node.
  In `platform/`, only `workspace.ts`, `ui/quickPick.ts`, `ui/treeCommands.ts`
  and `ui/WebviewHost.ts` may load `vscode` at runtime.
- These import boundaries are dependency-cruiser rules in
  `.dependency-cruiser.cjs`, run by `src/test/contract/boundaries.test.ts`.
  `yarn lint:deps` lists the violations with each rule's fix.
- Declare state keys (`stateKey()`), settings (`setting()`), context keys and
  telemetry events next to the code that owns them. The feature lists its
  context keys and events in `contextKeys`/`telemetryEvents`, which the
  contract tests and the telemetry generator read. State keys and settings keep
  the old extension's names, so users who switch back lose nothing.

## Never do

- Loosen a `ratchet-baseline.json` value, add an `eslint-disable` or
  `oxlint-disable` comment, or skip/todo a test to get green. Fix the cause, or
  stop and ask. `yarn ratchet --update` is fine to run: it only records
  improvements, never loosens.
- Edit `src/test/contract/oldManifest.json` or
  `e2eContract.json` just to silence a failing contract test. The failure means
  the extension drifted from the old one or from the e2e specs; find out why
  first. The same goes for the `REMOVED_*`/`RETIRED_*`/`INTERNAL_COMMANDS`
  lists in the contract tests: an entry needs a real reason.
- Change anything in `.yarn/releases/` (the vendored Yarn binary).

## Recipes

Steps marked (inferred) follow the code's pattern but no test enforces them.

**Add a command**

1. In the owning feature's `register()`: `ctx.commands.register("databricks.<area>.<name>", handler)`; pass `{scope: "connection"}` or `{scope: "project"}` if it needs one.
2. Contribute it in `packages/databricks-vscode/package.json` `contributes.commands` (and `menus` if shown). Or, if no user invokes it, add it to `INTERNAL_COMMANDS` in `src/test/contract/manifest.test.ts`.
3. Declare how it behaves in a session window, in the feature's `session` map (`kernel/feature.ts`, `SessionSupport`): `"same"`, `{adapted: "<how>"}`, or `{unavailable: "<why>", instead: "<what to do>"}`. A session window's registry refuses an unavailable command with both texts. `src/test/contract/hosts.test.ts` fails on a contributed command or view without an entry.
4. Every `databricks.*` key in its `enablement`/`when` must be declared with `contextKey()` and listed in a feature's `contextKeys`.
5. If an e2e spec runs it with `executeCommand`, add it to `src/test/contract/e2eContract.json` `commands`.
6. Add a unit test beside the feature; run `yarn check`.

**Add a setting**

1. Declare `setting<T>("databricks", "<key>", default)` next to the code that reads it (`platform/settings.ts`). (inferred)
2. Contribute `databricks.<key>` in `package.json` `contributes.configuration`, with the same default. `src/test/contract/manifest.test.ts` fails on a `databricks.*` setting declared but not contributed, contributed but not declared, or with another default.
3. Read it with `ctx.kernel.settings.get(...)`; react with `settings.onDidChange`. (inferred)
4. Removing an old setting: list it in `RETIRED_SETTINGS` in `manifest.test.ts` with the reason.

**Add a telemetry event**

1. Declare it with `telemetryEvent<Props>(name, comment, {prop: {comment}})` in `features/<name>/telemetry.ts` (or `kernel/telemetry/events.ts` for core events). The generator reads only those files.
2. Add it to the feature's `telemetryEvents`; record it with `ctx.telemetry.record(EVENT, props)`.
3. Run `yarn check`: `manifest.test.ts` fails if the modules `scripts/generateTelemetry.mjs` reads (step 1) don't hold exactly the events the features list. Packaging writes the generated `telemetry.json`, which `code --telemetry` reads, into the VSIX; it isn't committed. To read it, `yarn build && yarn workspace databricks generate:telemetry`.
4. If it is an old extension's event, map it in `EVENTS` in `src/test/contract/telemetry.test.ts`; names and property types must match `oldTelemetry.ts`.

**Use another VS Code extension**

1. Add it to `src/kernel/extensionDependencies.ts` with `extensionDependency(id, name, options)`. Options: `ready` if its API isn't usable as soon as it's returned, `minVersion` if an older one won't do, and `inPack: false` if only some users need it, so it isn't installed with this extension.
2. Unless it's `inPack: false`, add its ID to `packages/databricks-vscode/package.json` `extensionPack` (`yarn fmt` sorts it); `src/test/contract/manifest.test.ts` fails when the two differ.
3. Use it only through `kernel.extensionDependencies` (`src/platform/extensions.ts`), never `vscode.extensions` or a `workbench.extensions.*` command (`yarn lint` fails on them). A user action that can't work without it calls `require(dep, what)` first, or `install(dep, what)` if the action already implies installing it; background work checks `available(dep)` and catches up on `onDidChange(dep, …)`; code that needs its API calls `activate<T>(dep)` where it first needs it, never in `register()`.
4. Run `yarn test`: `src/test/budgets/` fails if activation starts it.

**Add a feature**

1. Create `features/<name>/index.ts` exporting a `Feature` (`id`, `register`, optional `start`, `contextKeys`, `telemetryEvents`, `session`).
2. Add it to `FEATURES` in `src/features.ts`; the order is registration order.
3. Share code with other features only through `kernel/` (an `internalCommand()` in `kernel/<area>/commands.ts`).
4. Each contributed view needs a registered tree data provider, and no view name may contain another (the e2e helpers match by substring), except that one panel may show in two places under the same title (`SAME_PANEL_IN_TWO_PLACES` in `manifest.test.ts`). Its two views' `when`s must differ only in the bundle target clause, and both must wait for `databricks.context.initialized`. Declare each command and view it contributes in its `session` map, as for a command.
5. Put tests in `features/<name>/*.test.ts`; run `yarn check`, then `yarn test`.

## Commands

Run from the repo root. Requires Node 24 (`.nvmrc`; `nvm use`). The e2e config
refuses Node 26+ because ChromeDriver extraction breaks there, and so knip
can't load it: on Node 26, `yarn check` fails with a false
`knip.devDependencies` finding for `@wdio/spec-reporter`.

- `yarn install`: install dependencies.
- `yarn workspace databricks fetch:cli`: download the CLI pinned in `package.json` (`cli.version`) into `packages/databricks-vscode/bin/`. Needed by the e2e suites and by `features/ssh/transfer.test.ts` (skipped locally without it, required in CI).
- `yarn build`: compile with `tsc -b`.
- `yarn check`: `yarn fmt:check`, build, typecheck the extension's tests, test `scripts/`, then `yarn ratchet`.
- `yarn verify`: everything that runs without a display: `yarn check`, `yarn test`, the e2e package's typecheck, then `yarn package`.
- `yarn package`: build a pre-release VSIX for this platform into `packages/databricks-vscode/.build/` and check what is in it (`packages/databricks-vscode/scripts/packageVsix.mjs`).
- `yarn generate:notice`: write `packages/databricks-vscode/NOTICE.md`, the open source notices for the production dependencies that ship in the VSIX (`scripts/generateNotice.mjs`). The release pull request runs it.
- `yarn release:version <x.y.z>`: a release pull request's version bump: the extension's and the types package's version, and the CHANGELOG's `# Unreleased` heading renamed to `# Release: v<x.y.z>` (`scripts/releaseVersion.mjs`).
- `yarn test`: all unit and contract tests (vitest) and the `scripts/` tests.
- `yarn typecheck`: build, then typecheck the extension's tests and the e2e package.
- `yarn ratchet`: oxlint, where any warning or error fails, plus the fast unit tests (`test:fast`), then metrics against `ratchet-baseline.json`. On the setup `scripts/perf/activationMetric.mjs` describes (`ACTIVATION_SETUP`: its machine, `PERF_VSCODE` and the pinned dependencies), it also packages the VSIX and times activation in VS Code, about a minute more; elsewhere it notes that it doesn't.
- `yarn preview [--project --profile <cli-profile> | --folder <dir>]`: build, then open this checkout's extension in its own VS Code, with its own user data, extensions and config file, and a title and colour per branch, so several sandboxes can be open side by side. With no folder, `--project` (a `default-python` bundle) or `--folder`; options are at the top of `scripts/preview.mjs`. Sandboxes stay in `~/.cache/databricks-vscode-preview/<name>`; `--fresh` starts one over. `--session <serverless | cluster-id> --profile <cli-profile>` opens it as a simulated session window (remote mode) instead, in a `<branch>-session` sandbox, with the environment the SSH tunnel would set; reload the window to pick up a rebuild.
- `yarn preview:remote-vsix --session <serverless | cluster-id> [--profile <cli-profile>]`: install this checkout's extension in an open session window, the one "Start SSH tunnel" opened, on real compute: it asks the compute for its CPU over the tunnel's SSH host, packages the VSIX for it under the Marketplace extension's ID (`databricks.databricks` 3.999.0-dev, which Remote - SSH then doesn't reinstall over), and installs it with the compute's VS Code server; then reload that window. Serverless takes `--profile`, whose host names the SSH host; `--ssh-host` names it for a session started with `--name`. Options are at the top of `scripts/sessionVsix.mjs`.
- F5 in VS Code: open `databricks-vscode.code-workspace` and run "Run and Watch Extension" (`packages/databricks-vscode/.vscode/`): a watch build and an Extension Development Host with the debugger attached. It works over Remote-SSH, where `yarn preview` can't open one (`code` there doesn't pass `--extensionDevelopmentPath`).
- `yarn fmt` / `yarn fmt:check`: format every package with Oxfmt (`.oxfmtrc.jsonc`, which also lists the generated and copied files it skips), or only check; `yarn check` runs `fmt:check`. The workspace file formats on save with the Oxc extension.
- `yarn lint` / `yarn lint:fix`: oxlint, type-aware; `yarn build` first.
- `yarn lint:deps`: the import boundaries (dependency-cruiser), with each violation's fix. `yarn check` runs them in `boundaries.test.ts`.
- `yarn lint:unused` / `yarn lint:dupes`: full knip and jscpd reports, when the ratchet flags them.
- `yarn workspace databricks vitest run <file>`: one test file.
- `yarn test:e2e` / `yarn workspace databricks-vscode-e2e test:e2e:mock`: the e2e suites, see above.
- `yarn test:e2e:spec [<name>]` (e.g. `auth`): one spec on the mock, built first, in its one window, with the extension pack's members from `~/.vscode/extensions`; without a name, the whole suite, `E2E_WORKERS` spec files at a time (default 1). `yarn test:e2e:spec:real [<name>] --profile <cli-profile>`: the same against a real workspace, with a token of that profile as `[DEFAULT]` that lives two hours (`--token-hours <n>` for a longer run).

## Layout

- `ARCHITECTURE.md`: why the layers, flows and key decisions are what they are. Read it before judging where code belongs.
- `DEVLOOP.md`: for people, how to see a change in VS Code: `yarn preview` locally, and in a session window, simulated or on real compute.
- `REVIEW.md`: what to check in a pull request beyond what CI enforces, starting with session windows.
- `packages/databricks-vscode/`: the extension. Architecture and conventions are in `packages/databricks-vscode/AGENTS.md`.
- `packages/databricks-vscode-types/`: types of the public API that `activate` returns (`index.ts`), for other extensions. Types only.
- `packages/databricks-vscode-e2e/`: WebdriverIO e2e specs (`src/**/*.e2e.ts`), and the mock workspace in `mock/`.
- `scripts/ratchet.mjs`: the ratchet; its logic and `node:test` tests are in `scripts/ratchet/`.
- `.agents/skills/`: agent skills shared by Codex and Claude Code (`.claude/skills/` symlinks to them). `pr-review` says how to review a diff; run it on your own diff before you open a PR.
