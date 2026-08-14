# Code conventions — Databricks VS Code extension

A practical guide for **writing new code that matches the existing codebase**.

---

## 1. Naming at a glance

Use this as a lookup while you code.

| Thing                                                       | Convention                                                    | Example                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| File exporting a **class**                                  | `PascalCase.ts`                                               | `ClusterModel.ts`                             |
| File exporting **functions** (util / helper / registration) | `camelCase.ts`                                                | `fileUtils.ts`, `registerDetailPanel.ts`      |
| Class / interface / type / enum                             | `PascalCase`                                                  | `ConnectionManager`, `RunState`               |
| Method / local variable / function                          | `camelCase`                                                   | `refresh()`, `activeCluster`                  |
| Module-level constant                                       | `UPPER_SNAKE_CASE`                                            | `SCHEME`, `PROD_APP_INSIGHTS_KEY`             |
| Private field                                               | `camelCase`; `_`-prefix a private field backing a public getter/accessor of the same name | `private disposables`, `private _state` (→ `get state()`) |
| Public event                                                | `onDid<Thing><Verb>`                                          | `onDidChangeState`                            |
| String-union members                                        | quoted literals                                               | `"CONNECTED" \| "DISCONNECTED"`               |
| VS Code command ID                                          | `databricks.<domain>.<action>`                                | `databricks.cluster.refresh`                  |
| Unit test                                                   | `<Name>.test.ts`, co-located                                  | `ClusterModel.test.ts`                        |

**Rule of thumb for file casing:** does the file's _primary_ export have a name
starting with a capital (a class/type)? Name the file to match it exactly
(`ClusterModel.ts` exports `ClusterModel`). Is it a bag of functions? Use camelCase
(`fileUtils.ts`).

---

## 2. Choose the right class role, then name for it

Every class advertises its job through its **suffix**. Pick the suffix that
matches the responsibility - don't invent new ones.

| If the class…                                       | …name it                                 | Responsibilities                                            |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| coordinates lifecycle / orchestrates other objects  | `XManager`                               | wiring, refresh/polling, owning sub-objects                 |
| holds state and emits change events (no VS Code UI) | `XModel`                                 | the source of truth for some data; fires `onDidChange`      |
| handles VS Code commands                            | `XCommands`                              | one method per command; delegates to a model/manager        |
| feeds a tree view                                   | `XTreeDataProvider` (or `XDataProvider`) | implements `TreeDataProvider`; turns data into `TreeItem`s  |
| implements another VS Code provider interface       | `XProvider`                              | `FileSystemProvider`, `DebugConfigurationProvider`, auth, … |
| is a configuration-view UI element                  | `XComponent`                             | extends `BaseComponent`; one row/section of the config tree |
| drives a multi-step input flow                      | `XWizard`                                | built on `MultiStepInputWizard`                             |
| adapts an external tool / extension                 | `XWrapper`                               | e.g. the CLI, the MS Python extension                       |
| tracks an async run/job/pipeline                    | `XStatus`                                | run-state transitions                                       |
| owns a webview / output panel                       | `XPanel`                                 | detail panels, output panels                                |
| is a tree node                                      | `XTreeNode` / `XNode`                    | a single node's data + rendering hints                      |
| is a debug adapter                                  | `XAdapter`                               | Debug Adapter Protocol impl                                 |
| loads/fetches data (often cached)                   | `XLoader`                                | API fetches feeding a model                                 |
| is a bag of pure functions                          | `xUtils` (camelCase file)                | stateless helpers, exported as a namespace                  |

**The core triad.** Most features are built from three cooperating classes:

- **`XModel`** — owns the data and fires events when it changes. No VS Code UI.
- **`XManager`** — orchestrates: constructs collaborators, reacts to events,
  handles refresh/polling.
- **`XCommands`** — thin command handlers that call into the model/manager.

**Keep `window.*` UI out of `Model` / `Manager` / `Loader`.** These surface
data/results and fire events; let `Commands` / `Component` do the
`window.show*` rendering. Fusing `window.showInformationMessage` /
`showErrorMessage` with SDK or `child_process` calls in one class is exactly what
makes it hard to unit-test (see section 8).

---

## 3. Structuring a new feature

1. **Create a top-level folder** under `src/` named for the feature domain
   (lowercase, hyphenated if multi-word): `src/my-feature/`. Keep it **flat** —
   put files directly in the folder.
2. **Add classes by role** using the suffixes described in section 2 above:
   `MyFeatureModel.ts`, `MyFeatureManager.ts`, `MyFeatureCommands.ts`, plus any
   providers/wizards the feature needs.
3. **Group by role-suffix once a feature grows large.** Keep small features flat.
   Once a feature exceeds ~6–8 files, group files into role-suffix subfolders
   (`models/`, `managers/`, `commands/`, `providers/`…) — **but only for roles that
   have 2+ files.** Singleton roles stay at the feature root: even `bundle/`, the
   biggest feature, has just one Wizard, one Watcher, and one Provider, so a strict
   folder-per-suffix would scatter logic into one-file folders. The folder name is
   just the plural of the suffix the class already carries — **no class renames.**
   Co-locate each role's tests inside its folder. Precedent: `configuration/models/`,
   `bundle/models/`, `bundle/run/`. Don't pre-split a small feature.
4. **Put UI-heavy code under `ui/`.** (unresolved) Tree data providers, detail panels,
   wizards, and configuration-view components live in `ui/<feature>/` (e.g.
   `ui/unity-catalog/`). Feature _logic_ (models, managers) stays in the feature
   folder; the tree that renders it lives under `ui/`.

    > _Trade-off:_ a global `ui/` gives one index of all views, but
    > splits a feature across trees — `bundle` today spans `bundle/`,
    > `ui/bundle-resource-explorer/`, and `ui/bundle-variables/` (43 files, one
    > concept, three places). The inverse — co-locating views under the feature
    > (`bundle/ui/…`) so one feature is one subtree — is worth considering. Follow the
    > global-`ui/` convention for now; flagged for discussion.

5. **Never touch VS Code globals directly for state/config/context** — go through
   the adapter layer in `vscode-objs/` (see section 5).
6. **Wire it up in `extension.ts`** (see section 6): construct the objects, inject
   dependencies, register commands.
7. **Add a barrel (`index.ts`) only if the feature has a clear public surface**
   other modules import — and make it a _selective_ re-export, not `export *`.
8. **If the feature needs a prose doc, add `README.md` to its folder** — see
   section 4a. Most features don't.

A typical new feature:

```
src/my-feature/
  MyFeatureModel.ts        # state + onDidChange
  MyFeatureManager.ts      # orchestration
  MyFeatureCommands.ts     # command handlers
  MyFeatureModel.test.ts   # co-located unit test
src/ui/my-feature/         # (only if it has a tree/panel)
  MyFeatureTreeDataProvider.ts
```

---

## 4. Class idioms to follow

### Dependency injection

Pass dependencies into the **constructor**; never reach for globals or singletons.
Mark injected dependencies `private readonly`:

```ts
constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly configModel: ConfigModel
) {}
```

### Events

Expose state changes as a VS Code `Event`. Keep the `EventEmitter` private
(`_`-prefixed) and expose only its `.event` as `readonly`:

```ts
private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
readonly onDidChange: Event<void> = this._onDidChange.event;
// …
this._onDidChange.fire();
```

Name events `onDid<Thing><Verb>` — `onDidChange`, `onDidChangeState`,
`onDidChangeTreeData`.

### Disposal

Collect disposables and clean them up together; register the object on
`context.subscriptions` so VS Code disposes it on deactivate:

```ts
private disposables: Disposable[] = [];
// …
dispose() {
    this.disposables.forEach((d) => d.dispose());
}
```

### Decorators

Three decorators are in use — prefer them over hand-rolled equivalents:

- **`@Mutex.synchronise("someMutexField")`** — serialize an async method against a
  named `Mutex` field on the instance (`locking/Mutex.ts`). The local ESLint rule
  `mutex-synchronised-decorator` verifies correct usage, so it will fail lint if
  misapplied.
- **`@onError({log, popup})`** — uniform error handling / notifications on an async
  method (`utils/onErrorDecorator.ts`).
- **`@logging.withLogContext(Loggers.Extension)`** — attach a logging context
  (from `@databricks/sdk-experimental`), optionally with a `@context` parameter.

### Logging & telemetry

- Log through the named loggers in `logger/` (`Loggers.Extension`, …) — **never
  `console.log`** (`no-console` is an ESLint error outside tests).
- Define new telemetry events in `telemetry/constants.ts`. User-facing commands are
  instrumented automatically by the `telemetry.registerCommand` wrapper (section 6).
- **`EventTypes` in `telemetry/constants.ts` is the only source of truth for an
  event's schema.** Each field carries a `comment`; `telemetry.json` is generated
  from the class by `scripts/generateTelemetry.ts` and is gitignored. Never
  hand-maintain a field list elsewhere — including in prose docs, which go stale
  silently while the generated file stays correct.

---

## 4a. Where module documentation goes

Most code needs no prose doc — a class doc-comment and good names are enough.
When a module genuinely needs one (a design rationale, a privacy posture, a
protocol), write a **`README.md` in the module's folder**, next to the code it
describes.

- **`README.md`, not a descriptive name.** Prefer `src/telemetry/README.md` over
  `src/telemetry/MY_FEATURE_TELEMETRY.md`. A file named for one feature inside a
  shared folder is undiscoverable — nothing links to it, and the next person adds
  a second one rather than extending it. `README.md` is the name tooling and humans
  already look for, and GitHub renders it when browsing the folder.
  (`src/telemetry/PACKAGE_MANAGER_DETECTION.md` predates this rule; fold such files
  into the folder's `README.md` when you next touch them.)
- **Document the _why_, not the _what_.** Schemas, field lists, and signatures
  belong in the code (or, for telemetry, in generated output). A doc that restates
  them acquires a second source of truth that drifts. Record the decisions and
  trade-offs that have nowhere else to live.
- **No top-level `docs/`.** It is gitignored in this repo (local scratch only), so
  anything committed must live beside the code or in an existing root file
  (`README.md`, `CONTRIBUTING.md`, this file).

### Why colocation

Surveyed when this convention was written (August 2026):

| Project                             | Practice                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [microsoft/vscode][vsc]             | Colocated docs, **no top-level `docs/`**: ~29 architecture docs under `src/` (e.g. `src/vs/sessions/LAYOUT.md`) |
| [facebook/react][react]             | Colocated `README.md` per package (`packages/react-reconciler/README.md`)                                       |
| [rust-lang/rust][rust]              | Colocated `README.md` per crate, a few lines, pointing at the external dev guide                                |
| [vscode-pull-request-github][vscpr] | Centralized `documentation/` directory                                                                          |
| [kubernetes][k8s], [eslint][eslint] | Centralized `docs/` + external enhancement proposals                                                            |

Both colocation and centralization are well-established; there is no universal
answer. We colocate because this repo has no committed `docs/` tree, and we
standardize on `README.md` (React/Rust style) rather than VS Code's
descriptive-filename style because the latter only stays navigable when a folder is
one subsystem — `src/telemetry/` serves every feature.

**Telemetry specifically:** VS Code documents events _inline in TypeScript_ — GDPR
classification, purpose, and comment in a type beside the emit call — with no
per-event markdown ([`telemetry.instructions.md`][vsctel]). Our `EventTypes`
`comment` fields are the same idea, which is why prose docs must not duplicate them.

[vsc]: https://github.com/microsoft/vscode/tree/main/src/vs/sessions
[vsctel]: https://github.com/microsoft/vscode/blob/main/.github/instructions/telemetry.instructions.md
[react]: https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md
[rust]: https://github.com/rust-lang/rust/blob/master/compiler/rustc_middle/README.md
[vscpr]: https://github.com/microsoft/vscode-pull-request-github/tree/main/documentation
[k8s]: https://github.com/kubernetes/enhancements
[eslint]: https://github.com/eslint/eslint/tree/main/docs

---

## 4b. Comments — concise and useful

Comments are written for a human who is skimming, and humans skip walls of text.
Every comment competes with the code for attention — earn it: say the one thing the
code cannot, then stop.

- **If the code is self-explanatory, don't comment it.** The best comment is often the
  one you didn't write. Reach for a comment only when the code genuinely can't speak for
  itself; a comment on obvious code is pure maintenance cost with no reader payoff.
- **Explain _why_, never _what_.** The code already states what it does; a comment that
  narrates the next line (`// increment i`) is noise. One that records a non-obvious
  reason, constraint, or hazard is worth reading. (Same rule as 4a, applied inline.)
- **Shorter than the code it guards.** If explaining one line takes a paragraph, the
  reader gave up before your point. Trim to the load-bearing sentence.
- **A comment is not a fix for a bad name.** If a variable or function needs several
  lines to explain, rename or restructure it. A good name carries the explanation for
  free and can't drift out of sync with the code.
- **Comments rot — minimize the surface.** They aren't compiled or tested, so they go
  stale silently as code changes. The fewer you keep, and the more they describe durable
  _intent_ rather than current mechanics, the longer they stay true. Delete a comment
  before it starts to lie.
- **Doc-comments state the contract and caveats, not a re-spec.** A class/function
  doc-comment should give a caller what they need and any surprising behavior (e.g.
  `@onError({throw: false})` semantics) in a sentence or two — not restate every branch.
  Anything visible in the signature doesn't need repeating.

Generated comments trend long and explanatory, so when working AI-assisted this matters
more, not less: trim to what a busy reviewer actually needs before committing.

---

## 5. Go through the adapter layer (`vscode-objs/`)

Don't call raw VS Code globals for state, config, or context. Use these seams so
the logic stays testable:

| Need                                      | Use                      |
| ----------------------------------------- | ------------------------ |
| persist/read extension state              | `StateStorage`           |
| set a when-clause context flag            | `CustomWhenContext`      |
| read `databricks.*` / `python.*` settings | `WorkspaceConfigs`       |
| know the active workspace/project folder  | `WorkspaceFolderManager` |

If you need a new piece of global state or a new setting accessor, **add it to the
relevant `vscode-objs/` class** rather than sprinkling `workspace.getConfiguration`
or `context.globalState` calls across the feature.

### The SDK is a cross-cutting dependency too

The Databricks SDK (`@databricks/sdk-experimental`) is the biggest unguarded
cross-cutting dependency in the codebase — dozens of files import it, and many
reach the `WorkspaceClient` / `apiClient` directly.

- **Reach the workspace client through the connection seam** (`ConnectionManager`),
  not by constructing your own client in a feature.
- **Never import through deep `/dist/...` paths** (`.../dist/apis/…`,
  `.../dist/retries/…`). They're not a stable entry point — import from the package
  root. Keeping SDK access behind one seam is also what turns a future SDK migration
  into a bounded change instead of a repo-wide edit.

---

## 6. Wiring in `extension.ts`

`extension.ts` is the composition root. For a new feature:

1. Construct your objects inside `activate()`, injecting already-built services
   (constructor DI — there is no DI container).
2. Register each command through the telemetry wrapper so it's instrumented
   uniformly:

    ```ts
    telemetry.registerCommand(
        "databricks.myFeature.doThing",
        commands.doThing,
        commands
    );
    ```

3. Declare the same command ID in `package.json` (`contributes.commands`, menus,
   when-clauses). Command IDs are **`databricks.<domain>.<action>`**.
4. Push any disposables onto `context.subscriptions`.
5. If the feature is part of the extension's public API, extend the `PublicApi`
   returned at the end of `activate()` (and bump `PublicApi.version` in
   `databricks-vscode-types` on incompatible changes).

---

## 7. Imports & exports

- **Double quotes** for imports (Prettier-enforced).
- Order: external packages first (`vscode`, `@databricks/sdk-experimental`, …),
  then local relative imports.
- Use **`import type { … }`** for type-only imports and to break dependency cycles.
- For utility folders, follow the **namespace-barrel** pattern —
  `export * as FileUtils from "./fileUtils"` in `index.ts`, consumed as
  `import {FileUtils} from "./utils"`.
- For feature barrels, re-export only the intended public surface; avoid blanket
  `export *` of internal files. Blanket `export *` barrels hurt navigation —
  "go to definition" and grep-for-usage land on the barrel instead of the real file,
  adding an indirection hop with no encapsulation benefit. **Note:** most existing
  `index.ts` files still use `export *` (10 of 12 today); those should migrate to
  selective re-exports (or be dropped where under-used), not be treated as the
  pattern to copy.

---

## 8. Tests

- **Co-locate** unit tests: `X.test.ts` beside `X.ts` (Mocha via
  `@vscode/test-electron`). Prefer testing `Model`/`Manager`/util logic — it's the
  most testable, since UI is isolated behind `vscode-objs/`.
- Use the right suffix for the right kind of test:

    | Suffix       | Kind                             | Where                |
    | ------------ | -------------------------------- | -------------------- |
    | `*.test.ts`  | unit                             | co-located in `src/` |
    | `*.integ.ts` | SDK integration (live workspace) | `sdk-extensions/`    |
    | `*.e2e.ts`   | end-to-end (WebdriverIO)         | `test/e2e/`          |
    | `*_test.py`  | Python unit                      | `test/python/`       |

- Mock with `ts-mockito`. Never commit `.only` — `no-only-tests` is an error.

---

## 9. Style quick rules

Formatting is enforced by Prettier + ESLint; `yarn fix` auto-applies most of it.
The choices that affect how you write:

- 4-space indentation, double quotes, semicolons required.
- `{a: 1}` — **no** space inside braces (`bracketSpacing: false`).
- `(x) => …` — always parenthesize arrow params.
- Trailing commas where ES5 allows.
- Prefer `===` / `!==` and always use curly braces (`curly`).
- **Windows too — don't hard-code POSIX paths.** The extension ships on Windows as
  well as macOS/Linux, so any path or executable — in code _and_ in user-facing
  text — must account for the platform. A venv interpreter is `.venv/bin/python` on
  macOS/Linux but `.venv\Scripts\python.exe` on Windows. Build paths with `path`
  (or a helper like `venvInterpreterPath`) instead of concatenating POSIX literals,
  and when a message quotes a concrete path, pick it per `process.platform`.

---

## Issues

- extension.ts is becoming too big
- Large feature folders mix many role-suffixes (logic / presentation / I/O) flat at
  one level, which is hard to navigate — and co-located tests double the file count.
  Today `run/` (14 files), `bundle/` (12), `language/` (11), and `ui/unity-catalog/`
  (10) sit flat at the top level, across 17 distinct suffixes repo-wide. Needs a
  grouping convention (see the section 3 role-suffix rule).
