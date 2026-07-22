# Databricks VS Code extension — agent notes

## Code organization: layered feature modules

We are gradually moving `src/` toward a **layered** structure — `models` /
`utils` / `gateways` / `controllers` / `handlers` — organized **feature-first**:
each feature owns a top-level folder under `src/`, and the layers live *inside*
it. The feature stays cohesive in one place; the layers give it internal
separation.

`src/python-setup/` is the reference template:

```
src/python-setup/
  models/       # data types & DTOs, no side effects (e.g. the CLI JSON contract)
  utils/        # pure helpers over models (e.g. result → user-facing text)
  gateways/     # all I/O: SDK / WorkspaceClient, CLI subprocess, fs, MS Python API
  controllers/  # business logic & orchestration
  handlers/     # thin VS Code wiring: command registrations, event subscriptions
```

(A feature only creates the layers it needs — e.g. a feature with no I/O has no
`gateways/`.)

### Rules

- **Dependency direction is one-way:**
  `handlers → controllers → gateways → utils → models`.
  A lower layer never imports an upper one (a model never imports a controller,
  a util never imports a gateway, etc.).
- **`models/`** — pure, side-effect-free types, enums, and DTOs. Trivially
  unit-testable. Contract/shape definitions live here (with their captured
  fixtures alongside them). Imports nothing from the feature.
- **`utils/`** — pure, side-effect-free helper functions (no I/O, no `vscode`).
  May import `models/`; may be used by any upper layer. Result-to-text mappers,
  formatters, and small pure transforms belong here.
- **`gateways/`** — the **only** place outbound I/O is allowed: the Databricks
  SDK / `WorkspaceClient`, the CLI subprocess, the filesystem, the MS Python
  extension API. Wrapping I/O here is what keeps controllers unit-testable (fake
  the gateway) and contains cross-cutting changes like an SDK migration.
- **`controllers/`** — business logic: orchestration, decisions, calling
  gateways for I/O, mapping results. **No `vscode.window`.** Depends on
  `models/`, `utils/`, `gateways/`.
- **`handlers/`** — the thinnest layer: registers commands and subscribes to
  events, then delegates into a controller. This is the only layer that touches
  `vscode.window.*` / `commands.registerCommand`. No business logic.
- **Tests live next to the code they cover** (`X.test.ts` beside `X.ts`), per the
  existing repo convention.

### Migration status

This layout is **not yet repo-wide.** Most of `src/` is still organized
feature-first *without* the internal layer split (`bundle/`, `cli/`, `run/`,
`sync/`, `language/`, `ui/`, …). When adding a **new** feature, prefer the
layered shape above. When touching an existing feature, don't restructure it
wholesale as a side effect — migrate deliberately, ideally in its own PR.

See the rationale and migration plan in
`docs/superpowers/proposals/2026-07-22-layered-architecture.md`.
