# databricks-vscode-e2e

WebdriverIO e2e specs for the extension (`src/**/*.e2e.ts`), and the mock
workspace they can run against (`mock/`, see `mock/README.md`). How to run
them, and what they need, is in the root `AGENTS.md`.

## Spec names

A spec is `src/<topic>.<markers>.e2e.ts`: the topic in snake_case, then zero
or more markers, e.g. `dbconnect_debug.next.ucws.e2e.ts`.

| Marker        | Meaning                                                                                                                                                                                   | Read by the harness |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| none          | Mostly ported from the old extension's suite (the "frozen suite"; their headers say so). A few specs added early in the rewrite have no marker either, such as `python_setup_visibility`. | No                  |
| `.next.`      | New for the rewrite: covers a feature no frozen spec covers.                                                                                                                              | No                  |
| `.char.`      | Characterization spec: pins down the old extension's behaviour in an area with little or no e2e coverage, before the rewrite moves its code.                                              | No                  |
| `.ucws.`      | Needs a workspace with Unity Catalog. The name comes from the old suite; nothing here defines it. (inferred)                                                                              | No                  |
| `.no-folder.` | Runs in a window without a folder.                                                                                                                                                        | Yes                 |

Only `.no-folder.` changes how a spec runs: `wdio.conf.ts` runs
`*.no-folder.*` specs only in the window without a folder, and keeps every
other spec out of it in a full run. A spec picked with `--spec` runs in every
window that doesn't exclude it, so `run-spec.sh` sets `E2E_FOLDER_ONLY` for a
spec without the marker. Renaming a spec out of `.no-folder.` moves it into
the folder window.

Two specs are matched by their file name instead, in `wdio.conf.ts`:

- `ssh_connection.ucws.e2e.ts` is opt-in (`TEST_SSH_E2E=true`) and runs in a
  window of its own.
- `remote_mode.next.ucws.e2e.ts` gets the environment of a Databricks SSH
  session (`src/utils/remote.ts`).
