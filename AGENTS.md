# AGENTS.md

## Code conventions

Read [CODE_CONVENTIONS.md](CODE_CONVENTIONS.md) before you:

- add a file, class, or feature folder under `packages/databricks-vscode/src/`
- add persisted state, a `databricks.*` setting, or a when-clause flag
- import or use the Databricks SDK
- add a telemetry event or register a command
- add a test, an `index.ts` barrel, or a `.md` inside the source tree

Existing code predates parts of the doc, so surrounding code is not proof of a
convention — follow the doc for all new code and refactors, and don't treat a legacy
violation as license to add another.

Formatting is not in scope — Prettier/ESLint own that; run `yarn fix`.
