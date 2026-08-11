# AGENTS.md

## This repo is public

Never reference the internal issue tracker — `DECO-*` keys, `databricks.atlassian.net`
links — in code, comments, commit messages, PR titles, or PR descriptions. The
direction is one-way: link the PR from the internal ticket, never the ticket from the
PR. A handful of `DECO-*` mentions predate this rule and are not precedent.

## Re-fetch the CLI after pulling

Setup, build, and test instructions live in [CONTRIBUTING.md](CONTRIBUTING.md). The
step easiest to miss: the extension shells out to a Databricks CLI bundled at
`packages/databricks-vscode/bin/databricks`, and `bin/` is gitignored, so a `git pull`
that bumps `cli.version` leaves the old binary in place. Re-fetch it:

```sh
yarn workspace databricks run package:cli:fetch
```

CONTRIBUTING.md explains what a stale binary looks like when you skip this.

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
