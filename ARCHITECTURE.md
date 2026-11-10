# Architecture

This file explains why the code is shaped the way it is, so you can decide
questions that no rule covers. The rules and recipes are in
[AGENTS.md](AGENTS.md) and
[packages/databricks-vscode/AGENTS.md](packages/databricks-vscode/AGENTS.md).
Paths in the extension's source, `packages/databricks-vscode/src/`, are
relative to it: `platform/process.ts`, `test/contract/manifest.test.ts`. Every
other path, and every link, is relative to the repo root. `scripts/docPaths.test.mjs`
fails on a path that resolves under neither base, or under both. A reason
marked "(inferred)" is not stated anywhere in the repo.

## Overview

This is the Databricks VS Code extension: a set of features for developers
who build on the Databricks platform. Version 3, this tree, is a rewrite of
version 2 (2.x, "the old extension"). The contract tests in
`test/contract/` hold the old extension's surface and fail when the code
drifts from it. The ported e2e
specs in `packages/databricks-vscode-e2e/` are the behaviour spec, so the
strings they match (view names, the "Databricks Bundle Logs" channel, the
Connection view's "Workspace connection" row) are frozen.

## Layers

```text
Imports flow downward: a layer may import any layer below it, never one above.

extension.ts · features.ts · api.ts    bootstrap: wires platform and kernel, registers FEATURES
        ▼
features/<name>/    views, commands, providers, debug adapters   (never another feature)
        ▼
kernel/             shared Databricks services; no UI, no `vscode`
        ▼
platform/           VS Code and OS adapters; imports nothing else in src/
```

What each layer may import is set out in
[the layer table](packages/databricks-vscode/AGENTS.md#layers) and enforced by
`packages/databricks-vscode/.dependency-cruiser.cjs`. The reasons:

- **`platform/`** puts each VS Code or OS side effect behind a small type
  that tests can replace (`CommandHost`, `SetContext`, `Memento`, `SpawnFn`).
  Policy that applies to every caller is written once here: error rendering
  and `commandExecution` telemetry in `CommandRegistry`, process-tree kills in
  `platform/process.ts`, skipping unchanged values in `ContextKeys`. It has no
  Databricks concepts.
- **`kernel/`** holds the Databricks concepts that several features share,
  where every feature must see the same answer: the connections, the project
  and target, the bundle pipeline, compute, the CLI, telemetry. It has no UI.
  It imports nothing from `vscode`, so it runs and is tested under plain
  Node. When it needs something from VS Code, `extension.ts` passes it in
  through `KernelPlatform` (`kernel/createKernel.ts`).
- **`features/<name>/`** is one user-facing area: its views, commands,
  context keys, telemetry events and settings. `extension.ts` is the only
  place that knows all three layers.

**Decision test.**

- It wraps a VS Code or OS API and has no Databricks meaning: put it in
  `platform/`. Examples: `platform/process.ts`, `platform/ui/quickPick.ts`.
- Several features need the same Databricks decision: put it in `kernel/`, or
  their answers will drift. Examples: `childEnv` and the effective compute in
  `ComputeService`, which several features read.
- It is a REST API the SDK lacks: add a client in `kernel/connection/`, built
  through `connection.api.get` (for example `ClusterListClient`). It is a
  CLI subcommand: add it in `kernel/cli/commands/`.
- It calls a Databricks API: use the workspace connection by default, through
  `{scope: "connection"}`, `whileConnected` or `kernel.connection`. Use
  `kernel.unityGateway` only for chat and gateway features. They run in window
  scope, because `scope: "connection"` and `whileConnected` give the workspace
  connection. Gateway-only clients go in `kernel/unity-gateway/` (for example
  `UnityGatewayResponsesClient`).
- It is UI that one feature owns and another must trigger: keep it in its
  feature and expose it as an `internalCommand()`. For example, `CHOOSE_PROFILE`
  is registered by `features/connection` and run by `bundle-init` and
  `unity-gateway`.
- It has its own surface and can fail without breaking other features: make
  it a new feature (inferred). For example, `unity-gateway-chat` is separate
  from `unity-gateway` and calls the sign-in's public command.

## Key flows

**Activation.** `activate()` builds the platform and the kernel, defines the
`connection` and `project` command scopes, then calls `registerFeatures`
followed by `kernel.start()` and `startFeatures`. `createKernel` and
`register()` do no I/O; a feature whose `register()` throws is logged and
skipped. `start()` runs unawaited, with its errors logged. That keeps
`activate()` within its time budget (`test/budgets/activation.test.ts`).
Before `activate()` runs, VS Code loads the extension's modules, which take
most of the time the user waits; the ratchet times all of it
(`scripts/perf/activationMetric.mjs`). The other extensions it relies on are
an `extensionPack`, which VS Code doesn't start with it.
Every feature registers in every window, so every contributed command exists,
and the manifest test can compare the registered IDs with `packages/databricks-vscode/package.json`.

**Connections.** A connection is a signed-in Databricks workspace: a
profile's host and credentials, the user, and the `ApiClients` built from
them. A window has two, because chat may need a different workspace than the
project:

- **The workspace connection** (`kernel.connection`, `ConnectionService`) is
  used by the workspace and project features: the explorers, bundles,
  compute, runs, sync, SSH and child processes.
  `resolveConnection` is a pure function: a session window's identity is
  the session's (`IdentitySource`), otherwise the project's target decides,
  and otherwise the user's saved choice or the CLI's default profile does.
  When a target moves the window to another workspace, the connection
  feature says so.
- **The Unity Gateway connection** (`kernel.unityGateway`,
  `UnityGatewayService`) connects to a workspace with Unity Gateway, for the
  chat models. It is a connection of its own, with its own saved profile
  (`databricks.unityGateway.savedProfile`, which 2.21 also reads and writes),
  restored at start. It drives its own UI: the Models row of the Models & AI
  tools view (how many models there are, and where they come from) and its
  status-bar item; the connection feature shows its row in the Connection
  view, beside the workspace connection's, built by the same code
  (`features/connection/connectionRows.ts`). The chat provider uses it too.

The two are separate on purpose: a bundle target or a workspace switch never
moves the Unity Gateway connection, and signing out of one leaves the other.
They start out the same: the first workspace connection, signed in by hand,
at startup or for a target, also signs Unity Gateway in with its profile
(`features/unity-gateway/index.ts`), once per user. After a Unity Gateway
sign-in or sign-out (`databricks.unityGateway.signedInBefore`), nothing is
copied again, except that signed out of both, a sign-in by hand signs both in
(`features/connection/ConnectionCommands.ts`).

**Hosts.** The extension runs in two places: a local window, and a session
window whose extension host runs on Databricks compute, today only through
the CLI's SSH tunnel. `kernel/host/` decides which, once, from the
environment (`detectHost`), and derives what the extension can do there
(`capabilitiesOf`). Kernel services take host-specific strategies from it:
the connection's identity (profiles, or the session's credentials), the
target guard's policy, the session's compute, and the session's rules for
children. Features read `kernel.capabilities`; the kernel doesn't expose the
host, so no feature can branch on where it runs. When-clauses hide what a
host lacks with `databricks.context.host.*` keys, each true only where the
host lacks something, so that commands still show before activation. Every
contributed command and view declares how it behaves in a session window,
in its feature's `session` map: `same`, `adapted` (how), or `unavailable`
(why, and what to do instead). In a session window the registry refuses an
unavailable command with both texts, whoever runs it.
`test/contract/hosts.test.ts` fails on a missing entry, and on a
when-clause that doesn't hide an unavailable command or view in a session.

A session's identity is the session token for the session's workspace, and
it must not reach another workspace. The CLI sends it to whatever host a
target names, so in a session a bundle CLI call runs only for a target that
`targetAccess` (`kernel/project/targetAccess.ts`) places in the session's
workspace. That check sends no credential, and believes only Databricks
domains. Mementos (`globalState`, `workspaceState`) live on the laptop and
are shared by both hosts, and by every installed version of the extension.
Files under `globalStoragePath` and `logPath` live on the compute, and are
gone when a serverless session ends.

**Scopes.** A command that declares `{scope: "connection" | "project"}` gets
the scope's value, or the scope's error with a "Sign in" ("Reconnect" in a
session window) or "Open folder" action. `connection` means the workspace
connection; the Unity Gateway features run in window scope and read
`kernel.unityGateway`. Scoped resources belong in `whileConnected` or
`whileProjectSession`, which dispose them on sign-out or a target change.

**What children see.** `childEnv` (`kernel/cli/childEnv.ts`) is a pure
function behind `kernel.childEnv()`. Children authenticate with the workspace
connection's profile (`DATABRICKS_CONFIG_FILE`, `DATABRICKS_CONFIG_PROFILE`),
and ambient auth and compute variables are removed. A session window's
children keep the session's credentials, but not its compute, and get a
config file that doesn't exist, so no profile can send the token elsewhere.
In-process, each connection's `ApiClients` turns off the SDK's own profile and
environment lookup. So the CLI, pip, terminals, debug sessions, the env file
and the workspace connection's SDK calls all use one identity, and Unity
Gateway calls use the Unity Gateway connection's. Outside a session window,
`DATABRICKS_*` variables in the extension host override neither.

**Cross-feature calls.** An `internalCommand<A, R>` declared in `kernel/`
carries both types, so the caller and the handler agree on them. It replaced
untyped `executeCommand` calls between features. The call goes through
`CommandRegistry`, so failures are logged, rendered and counted like any
other command's, and `execute` resolves `undefined` once the error is shown.

## Key decisions

| Chosen                                                                                                                                                                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Rejected                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A modular monolith: one extension with lint-enforced layers                                                                                                                                    | The e2e harness loads one extension from source plus the members of its `extensionPack` (`packages/databricks-vscode-e2e/wdio.conf.ts`). Every in-process request but the SDK's OAuth M2M sign-in, which still uses its own `fetch`, goes through `node:https` (`kernel/connection/nodeHttpClient.ts`), which VS Code's extension host patches with its proxy and certificate settings, as 2.22.0's requests did.                                                                                                                                                                     | Several extensions of ours shipped as a pack, or a UI over a sidecar process (inferred)                                                                                                         |
| Features never import each other                                                                                                                                                               | A feature that fails to register can be skipped while the rest still work (inferred); calls between features are typed                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Untyped `executeCommand` between features (`platform/commands.ts`)                                                                                                                              |
| `kernel/` has no `vscode`, not even types                                                                                                                                                      | It runs under plain Node. A value import once loaded `vscode` into the kernel without anyone noticing, and `platform/event.ts` copies the needed types without casts.                                                                                                                                                                                                                                                                                                                                                                                                                 | `import type` from `vscode`, allowed at first, now forbidden                                                                                                                                    |
| One owner each for spawning, context keys, errors and SDK clients                                                                                                                              | Policy is applied in one place: process-tree kills and injectable spawning, skipping unchanged `setContext` calls, rendering an error exactly once, one transport and credential set per connection                                                                                                                                                                                                                                                                                                                                                                                   | The old `@onError` decorator and `Telemetry.registerCommand` (`platform/commands.ts`); the old extension's environment-variable generators and its credential broker (`kernel/cli/childEnv.ts`) |
| The old names for state keys, settings, commands and events                                                                                                                                    | Switching back loses nothing (`test/contract/stateMigration.test.ts`), and telemetry stays comparable with the old extension's (`test/contract/telemetry.test.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                    | Migrating state in place: the test checks that old keys are left untouched                                                                                                                      |
| The other extensions it relies on are one list (`kernel/extensionDependencies.ts`), installed as an `extensionPack` and used through `kernel.extensionDependencies` (`platform/extensions.ts`) | VS Code starts every `extensionDependencies` entry before the extension at each activation, and doesn't activate it while one is missing or disabled. A pack only installs them. Features check for one, start it when they need its API, or say it's missing with an Install button, all through the one service. Checked by `test/contract/manifest.test.ts` (the pack is the list's pack members), the `extensions-through-kernel` lint rule (nothing else reads `vscode.extensions`) and `test/budgets/` (nothing starts one at activation, except ms-python in a session window) | `extensionDependencies`, as the old extension had; declaring nothing and installing each on demand; each feature checking `vscode.extensions` itself                                            |
| `packages/databricks-vscode/package.json` stays hand-written, checked by contract tests                                                                                                        | Silent drift fails CI (`test/contract/manifest.test.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Generating `contributes` from code (inferred)                                                                                                                                                   |
| Host capabilities, with each feature's session behaviour declared and enforced                                                                                                                 | Parity between local and session windows is checked in CI, and host decisions have one owner (`kernel/host/`); an unavailable command is refused, not only hidden                                                                                                                                                                                                                                                                                                                                                                                                                     | A remote-mode flag with when-clause guards; separate remote features; a second, UI-side extension                                                                                               |

**What is enforced.**

- **In CI (`yarn check`):**
    - the import boundaries (`test/contract/boundaries.test.ts`; oxlint bans the legacy SDK
      and `/dist/` imports);
    - the single owners from the decisions table:
        - `child_process` only in `platform/process.ts`: a dependency-cruiser rule;
        - requests only through the transport: no global `fetch` and no `newFetchHttpClient`
          outside `kernel/connection/nodeHttpClient.ts`, so VS Code's
          proxy and certificate settings apply to every request: the rule `http-through-transport` in
          the same plugin. OAuth M2M sign-in is the exception: sdk-auth makes those
          requests with its global `fetch`, which the lint can't see;
        - `setContext` only through `ContextKeys`, and no client built with `new`
          outside `ApiClients`: the rules in
          `packages/databricks-vscode/oxlint-plugin.mjs`. A client is any value
          from `@databricks/sdk-*`, unless it is listed as a non-client, or a
          class whose constructor takes the SDK's `ClientOptions`. The rule
          parses the modules involved and follows names to what they refer to:
          aliased and namespace imports, specifiers ending in .js, re-exports,
          barrels and type aliases;
        - other extensions only through `kernel.extensionDependencies`: the
          `extensions-through-kernel` rule in the same plugin. Outside
          `platform/workspace.ts`, the adapter, it reports `vscode.extensions`,
          imported by name or read from the `vscode` import, and any call with
          a `workbench.extensions.*` command;
        - no `showErrorMessage` in `features/`: oxlint's
          `no-restricted-properties`. Errors outside a command go through
          `ctx.commands.showError`;
        - no oxlint warning at all: `yarn lint` runs with `--deny-warnings`,
          and the ratchet fails on any warning instead of counting them;
        - `test/contract/lintRules.test.ts` runs these oxlint rules through the
          repo's `.oxlintrc.json` on fixtures at production paths, so a rule
          turned off, a narrowed override or a broken exemption fails it.
    - registering commands through `ctx.commands`: the manifest test compares
      the IDs that `register()` records with `packages/databricks-vscode/package.json`, so a contributed
      command registered any other way fails;
    - declaring every `databricks.*` context key used in a when-clause;
    - installing as `extensionPack` exactly the pack members in
      `kernel/extensionDependencies.ts`, and none as `extensionDependencies`;
    - declaring how every contributed command and view behaves in a session
      window, and hiding the unavailable ones there with capability keys,
      never `databricks.context.remoteMode` (`test/contract/hosts.test.ts`,
      which reads each when-clause with the session's keys fixed and the
      others unknown);
    - keeping the old commands, settings, menus, welcome content, telemetry
      events and state keys (`test/contract/`);
    - formatting: `yarn fmt:check` (Oxfmt, `.oxfmtrc.jsonc`) fails on any
      file `yarn fmt` would change;
- **In `yarn ratchet`, only on the setup `scripts/perf/activationMetric.mjs`
  describes:** activation time. The ratchet's `activation.extensionHostMs` is
  the median of 7 activations of the packaged VSIX in VS Code, from the
  activation's trigger until `activate()` settled, and may grow by 10% at
  most. Other machines, CI's included, don't measure it, and keep its
  baseline.
- **Only in `yarn test` (CI's `test` job):** the budgets in `test/budgets/`.
    - `activate()` must return within 100 ms, under plain Node with the
      modules already loaded. That catches slow I/O in `register()`, not all
      I/O, and on any machine.
    - A burst of saves may start only a few CLI processes.
    - The listener count must stay flat across sessions.
    - Activating starts none of the other extensions it relies on, except
      ms-python in a session window, to select the session's interpreter. A
      project with a development target starts only ms-python, for the
      Python rows.
- **Only in review:** what those rules can't see. A feature can still show
  an error through another API, such as `showWarningMessage`, and still reach
  `vscode.extensions` by destructuring the `vscode` import, or run an
  Extensions view command whose ID it builds at runtime. A client can
  still be built through indirection the rule doesn't follow: a class held
  in a variable or passed as a parameter first, or a path alias instead of a
  relative import. That a `same` or `adapted` session entry is true: the
  contract checks that it exists, not that the command works on compute
  ([REVIEW.md](REVIEW.md)).

## Where to go next

- [AGENTS.md](AGENTS.md): the hard rules, the "never do" list, the recipes and
  the commands. [packages/databricks-vscode/AGENTS.md](packages/databricks-vscode/AGENTS.md):
  the feature context, scopes, the file locations that aren't obvious, and
  conventions.
- [DEVLOOP.md](DEVLOOP.md): how to see a change in VS Code: in a local
  window, and in a session window, simulated or on real compute.
- [REVIEW.md](REVIEW.md): what to check in a pull request beyond what CI
  enforces, starting with session windows.
- `test/contract/`: compatibility with the old
  extension and the e2e specs. `test/budgets/`: activation time, CLI
  spawns and listener leaks.
- Generator: `packages/databricks-vscode/scripts/generateTelemetry.mjs` (the VSIX's telemetry.json, which
  `code --telemetry` reads; `generate:telemetry` writes a gitignored copy).
