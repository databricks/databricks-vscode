# AGENTS.md

## This repo is public

Never reference the internal issue tracker — `DECO-*` keys, `databricks.atlassian.net`
links — in code, comments, commit messages, PR titles, or PR descriptions. The
direction is one-way: link the PR from the internal ticket, never the ticket from the
PR. A handful of `DECO-*` mentions predate this rule and are not precedent.

## Running the extension from source

Full setup and test instructions live in [CONTRIBUTING.md](CONTRIBUTING.md). The
points below are the ones that cost time when they're missed.

**Re-fetch the CLI after pulling.** The extension shells out to a Databricks CLI
bundled at `packages/databricks-vscode/bin/databricks`, pinned by `cli.version` in
`packages/databricks-vscode/package.json`. `bin/` is gitignored, so a `git pull`
that bumps `cli.version` leaves the old binary in place:

```sh
yarn workspace databricks run package:cli:fetch
```

A stale CLI rejects subcommands the extension expects and aborts activation, which
looks like a configuration view stuck on "Initializing..." rather than an error.
The extension warns about this on startup in a dev checkout.

**Launching.** Press `F5` in VS Code (`Run and Watch Extension`) — it builds and sets
`EXTENSION_DEVELOPMENT` for you. To launch from a terminal instead:

```sh
cd packages/databricks-vscode
EXTENSION_DEVELOPMENT=true code --disable-extension databricks.databricks \
    --extensionDevelopmentPath="$PWD" --new-window <a-bundle-project>
```

`--disable-extension databricks.databricks` avoids an ID collision with an installed
marketplace build. Note that `code` may fold `--new-window` into an existing window
instead of opening the folder you asked for; check the window's title bar says
`[Extension Development Host]` and that it's on the folder you intended.

**Activation is lazy.** `activationEvents` has no `*`, so the extension only starts
for a folder containing a `databricks.yml` (or an open `.py` file) — an empty folder
activates nothing. Point it at a project whose target sets `workspace.host`.

**Don't pass `--extensions-dir`** unless you also populate it. The extension declares
`extensionDependencies` (`ms-python.python`, `ms-python.debugpy`, `ms-toolsai.jupyter`,
`redhat.vscode-yaml`); VS Code won't activate an extension whose dependencies are
missing, and it reports nothing when it declines.

**Reading the logs.** Extension logs land in the `Databricks Logs` output channel, on
disk under
`~/Library/Application Support/Code/logs/<session>/<window>/exthost/databricks.databricks/`
(`sdk-and-extension-logs.json`, `databricks-cli-logs.json`). `exthost.log` in the
parent folder records whether the extension activated at all — check that before
debugging activation itself.

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
