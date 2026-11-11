# databricks-vscode: architecture and conventions

Read the root `AGENTS.md` first; its hard rules apply here. Paths below are
relative to `src/` unless they start with the package or repo root.

## Layers

| Layer                                   | May import                            | Holds                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform/`                             | nothing else in `src/`                | VS Code and OS adapters: commands, context keys, state, settings, log, reactive values (`reactive.ts`: `State`, `Resource`), child processes, workspace, `ui/` (tree, quick pick, sections for the configuration and Models & AI tools views, `WebviewHost`)                                                        |
| `kernel/`                               | `platform/`                           | shared services without UI: the CLI gateway (`cli/`), connection (`connection/`), active project (`project/`), bundle (`bundle/`), compute (`compute/`), the Unity Gateway sign-in and its models (`unity-gateway/`), telemetry, the host and its capabilities (`host/`), and the `Feature` contract (`feature.ts`) |
| `features/<name>/`                      | `platform/`, `kernel/`, its own files | views, commands, providers, debug adapters                                                                                                                                                                                                                                                                          |
| `extension.ts`, `features.ts`, `api.ts` | anything                              | the bootstrap: builds the kernel, registers `FEATURES`, returns the public API                                                                                                                                                                                                                                      |

- `kernel/` has no `vscode` import, so it is tested under plain Node. When it
  needs something from VS Code, `extension.ts` passes it in.
- In `platform/`, only `workspace.ts`, `ui/quickPick.ts`, `ui/treeCommands.ts`
  and `ui/WebviewHost.ts` load `vscode` at runtime; the rest use `import type`.
- `test-support/` is importable only from tests.
- These rules are in `.dependency-cruiser.cjs` (package root), which
  `test/contract/boundaries.test.ts` runs on `src/` and on a fixture that
  breaks each rule once; add a fixture with every new rule. Oxlint bans
  `/dist/` imports and the legacy `@databricks/sdk-experimental`.
- Rules about calls rather than imports are oxlint rules: the JS plugin
  `oxlint-plugin.mjs` (package root), scoped in the repo's `.oxlintrc.json`
  and tested by `test/contract/lintRules.test.ts` on a fixture that breaks
  each rule once, plus `no-restricted-properties` for `showErrorMessage` in
  `features/`.

## Features

A feature is `features/<name>/index.ts` exporting a `Feature` (`kernel/feature.ts`),
listed in `features.ts`. It gets a `FeatureContext`:

- `ctx.kernel`: the services (`Kernel` in `kernel/feature.ts`): `cli`,
  `processes`, `connection`, `project`, `bundle`, `compute`, `state`,
  `settings`, `contextKeys`, `files`, `extensionDependencies` (the other
  extensions it relies on, which may be missing or disabled), `childEnv()`,
  `capabilities`.
- `ctx.commands`: `register`, `registerInternal`, `execute`.
- `ctx.sections`: rows of the configuration view.
- `ctx.telemetry`, `ctx.log` (tagged with the feature id), `ctx.subscriptions`.
- `ctx.whileConnected(start)` / `ctx.whileProjectSession(start)`: run `start`
  for each connection or project session, and dispose what it returns when
  that ends (sign-out, target change, project gone). Use these for anything
  tied to a connection or target instead of tracking changes by hand; the
  listener budget in `test/budgets/session.test.ts` catches leaks.

A feature that throws in `register()` is logged and skipped; `start()` errors
are logged. Neither stops the other features.

### Commands and scopes

- A command can require a scope: `{scope: "connection"}` (signed in) or
  `{scope: "project"}` (active bundle project). The registry resolves it and,
  when missing, shows the scope's own error (for example "Sign in"); the
  handler receives the scope value first, then the `executeCommand` arguments.
- Command IDs and argument orders are the old extension's (for example
  `destroy(force, warn)`); the manifest contract keeps every old command.
- Cross-feature calls: declare `internalCommand<Arg, Result>("databricks.…")`
  in `kernel/<area>/commands.ts` (see `kernel/connection/commands.ts`), have
  the owner `ctx.commands.registerInternal(...)` it, and call it with
  `ctx.commands.execute(...)`. `execute` resolves `undefined` when the command
  was cancelled or failed (its error is already shown). Internal commands are
  not contributed; list them in `INTERNAL_COMMANDS` in
  `test/contract/manifest.test.ts`.

### Where things live

Find a feature with `ls features/`; these are the parts whose location isn't
obvious from the name:

- `features/run/`: the `databricks` and `databricks-workflow` debug adapters.
  The Python they send to the workspace is in `resources/python/` (package
  root), with unittest tests in `resources/python/tests/`.
- `features/python/`: Databricks Connect, environment setup (`setup/uv/`
  through `databricks environments setup-local`, `setup/external/` through
  pip), the env file `.databricks/.databricks.env` (read by
  `resources/python/dbconnect-bootstrap.py` and the IPython startup script
  `resources/python/00-databricks-init.py`), notebooks and autocomplete stubs.
  The ms-python API is loaded on first use, through
  `kernel.extensionDependencies` (below).
- `kernel/host/`: where the extension host runs (`detectHost`): a local
  window, or a session window that the CLI's SSH tunnel opened on Databricks
  compute (remote mode, SSH-03). Features read what it allows,
  `kernel.capabilities` (`capabilitiesOf`), never where they run. In a
  session the connection is the session's, a project's bundle commands run
  only for a target in the session's workspace (`kernel.targetAccess`,
  `kernel/project/targetAccess.ts`), the Python feature selects the
  session's interpreter, and the compute is the session's: a target's saved
  compute choices (`capabilities.compute`) don't apply, and choosing compute
  and the run commands that need it are unavailable.
- `kernel/connection/`: besides profiles and `ApiClients`, small clients
  (`ClusterListClient`) for APIs the modular SDK lacks; add new ones there,
  built through `connection.api.get(...)`.
  `pipelineEvents.ts` reads the fields the SDK drops from the raw response,
  through a client from `connection.api.fresh(...)`. The SDK puts single-segment
  path values in the URL unencoded, so pass every name in such a field
  (`fullNameArg` and the like) through `pathValue()`. Not multi-segment ones,
  such as file paths, which the SDK encodes itself. `nodeHttpClient.ts` is the transport every
  in-process request uses (2.22.0's, over `node:https`, so VS Code's proxy and certificate settings apply;
  the `http-through-transport` lint rule bans `fetch`). The deprecated `databricks.proxy.*` settings
  are no longer read; the connection feature warns when one is set.
- `kernel/cli/commands/`: typed CLI subcommands, which build the arguments
  and parse the output; `kernel/cli/Cli.ts` only runs them. Add a subcommand
  there rather than passing raw arguments from a feature.
- `kernel/project/TargetFiles.ts`: per-target choices in
  `vscode.overrides.json` (compute, etc.) and `vscode.bundlevars.json`
  (variable overrides, passed to the CLI as `BUNDLE_VAR_*` by `childEnv`).
- `kernel/bundle/BundleOperations.ts`: deploy, destroy and one-off sync run in
  a queue, one at a time; `bundle run` runs beside it.

## Compatibility with the old extension

`test/contract/` holds the old extension's surface: `oldManifest.json`
(commands, settings, menus, welcome content, debuggers), `oldTelemetry.ts`
(event names and property types, checked by `yarn typecheck`) and
`fixtures/oldState.json` (stored state, `stateMigration.test.ts`). Keep old
names for commands, settings, state keys and telemetry events. Anything
removed or changed needs an entry with a reason in the test's
`REMOVED_*`/`RETIRED_*`/`CHANGED` list. `e2eContract.json` lists the
commands, views and titles the e2e specs use.

## Conventions

### Tests

- vitest under plain Node: `src/**/*.test.ts`, next to the code
  (`foo.ts` -> `foo.test.ts`). Run one file with
  `yarn workspace databricks vitest run src/path/to/foo.test.ts`.
- `vscode` is aliased to `test-support/vscode.ts` (`vitest.config.mts`), a
  minimal stand-in that records calls in `host` (commands, errors, quick
  picks, tree providers). Call `host.reset()` between tests. Extend it when
  code needs more, without modelling behaviour no test relies on.
- Fakes are in `test-support/`: `fakeKernel()`, `fakeFeatureHost()`,
  `fakeMemento()`, `fakeSettings()`, `FakeHttpClient`, fake CLI, clusters and
  files, and `useTempDirs()` for temporary folders.
- Tests that load the real kernel mock `@vscode/extension-telemetry` with
  `vi.mock` (it imports `vscode` itself); copy the block from
  `test/budgets/session.test.ts`.
- Spawning is injectable (`SpawnFn` in `platform/process.ts`); test with
  fakes, not real processes.

### Errors

- Throw `new UserFacingError(code, userMessage, {actions, cause})` from
  `platform/errors.ts`. `actions` are buttons whose `run()` is the fix.
- Throw `CancelledError` (or let VS Code's cancellation propagate) when the
  user dismisses a prompt; it is never shown.
- The registry logs any error a command throws and records it as a failed
  `commandExecution`; other errors show as "Error running command <id>:
  <message>". Calling `showErrorMessage` yourself skips all of that.
- An error with no command to throw to, as in a listener, a background task
  or a notification that doesn't end the command, goes to
  `ctx.commands.showError(new UserFacingError(...))`. It shows the message
  and actions as a failed command's would, and logs an action that fails.

### Logging

- Log through `ctx.log` (a `Logger` from `platform/log.ts`), or a
  `log.child(name)` of it. Entries go to the "Databricks Logs" channel and,
  at every level, to `sdk-and-extension-logs.json` under the extension's
  `logPath`. Nothing in `src/` uses `console`.
- What bundle CLI commands did goes to the "Databricks Bundle Logs" channel
  (`kernel.bundleLog`). Its name is frozen: the e2e specs select it.
