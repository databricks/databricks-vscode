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
| Private field                                               | `camelCase`, `_`-prefix only for event-emitter backing fields | `private disposables`, `private _onDidChange` |
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

---

## 3. Structuring a new feature

1. **Create a top-level folder** under `src/` named for the feature domain
   (lowercase, hyphenated if multi-word): `src/my-feature/`. Keep it **flat** —
   put files directly in the folder.
2. **Add classes by role** using the suffixes described in section 2 above:
   `MyFeatureModel.ts`, `MyFeatureManager.ts`, `MyFeatureCommands.ts`, plus any
   providers/wizards the feature needs.
3. **Only add subfolders when a feature grows large.** Precedent: a `models/`
   subfolder for a cluster of state classes (as in `configuration/models/`,
   `bundle/models/`), or a domain subfolder like `bundle/run/`. Don't pre-split a
   small feature.
4. **Put UI-heavy code under `ui/`.** Tree data providers, detail panels,
   wizards, and configuration-view components live in `ui/<feature>/` (e.g.
   `ui/unity-catalog/`). Feature _logic_ (models, managers) stays in the feature
   folder; the tree that renders it lives under `ui/`.
5. **Never touch VS Code globals directly for state/config/context** — go through
   the adapter layer in `vscode-objs/` (see section 5).
6. **Wire it up in `extension.ts`** (see section 6): construct the objects, inject
   dependencies, register commands.
7. **Add a barrel (`index.ts`) only if the feature has a clear public surface**
   other modules import — and make it a _selective_ re-export, not `export *`.

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
  `export *` of internal files.

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

---

## Issues

- extension.ts is becoming too big
