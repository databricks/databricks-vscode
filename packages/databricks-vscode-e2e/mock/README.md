# The mock workspace

A local stand-in for a Databricks workspace, so the whole e2e suite runs without one: `yarn workspace databricks-vscode-e2e test:e2e:mock`. It is not a substitute for a real workspace: it answers with canned states, and the manual test plan (`docs/manual-test-plan.md`) covers what it can't.

## What runs

- **`server.mjs`**: an HTTPS server on `127.0.0.1:8443` for `mock.databricks.test`, behind an HTTP proxy on `127.0.0.1:8888`. VS Code (`http.proxy`), the CLI (`HTTPS_PROXY`) and the specs' own calls go through the proxy. A second proxy on `127.0.0.1:8889`, the intercepting one, serves the same workspace behind a certificate of its own (`$MOCK_DIR/intercept-cert.pem`), which nothing installs or adds to a CA bundle: the proxy-TLS spec's two windows go through it (`wdio.mock.conf.ts`). It implements what the specs use:
    - SCIM `Me` for any `dapi-…` token;
    - an in-memory workspace file system (`workspace/*`, `workspace-files/import-file`), for `bundle sync`, `bundle deploy` and the Workspace file system view;
    - jobs and pipelines, with runs, updates and events in fixed states, for deploy, destroy and the run trackers (direct engine only). A job whose name contains `_slow` keeps running for two minutes, so a spec can cancel it; pipelines can be listed with `filter=name LIKE '…'` (`%` is the wildcard);
    - clusters: one shared, running cluster `0000-mock-cluster`, a terminated one `0001-mock-stopped` (`run-e2e.sh` passes it as `TEST_STOPPABLE_CLUSTER_ID`, so `compute_lifecycle` may start and stop it), and a job cluster that `filter_by` drops;
    - command execution and one-time runs, which "print" every `SELECT "<text>"` of the file they run;
    - Unity Catalog: `main`, `samples`, `system` and `UC_CATALOGS` (default 800) catalogs of another owner;
    - gRPC (HTTP/2) for Databricks Connect, forwarded to `spark_connect.py`.
- **`spark_connect.py`**: a fake Spark Connect server on `127.0.0.1:15002`, enough for `spark.sql('SELECT "<text>"')` through databricks-connect. It runs in a venv with `databricks-connect~=17.3.0`, which `run-e2e.sh` creates with `uv` the first time.

`run-e2e.sh` keeps its state in `$MOCK_DIR` (default `$TMPDIR/databricks-vscode-e2e-mock`): a self-signed certificate made with `openssl` (never committed), a CA bundle, the config file (`databrickscfg`), `requests.log` and the servers' output.

## Running it

```sh
yarn build && yarn workspace databricks fetch:cli
# The whole suite, in all its windows, 4 side by side:
E2E_WORKERS=4 yarn workspace databricks-vscode-e2e test:e2e:mock
```

`yarn test:e2e:spec` (from the repo root) does the rest itself (`../run-spec.sh`): it builds and fetches the CLI, takes the extension pack's members from `~/.vscode/extensions` (or `VSCODE_EXTENSIONS`) unless `DATABRICKS_E2E_EXTENSIONS` is set, and runs the command above. With a name, such as `yarn test:e2e:spec auth`, it runs that spec in its one window: `--spec` alone runs a spec in every window that doesn't exclude it, and one written for a folder can't pass in the window without one. `yarn test:e2e:spec:real [<name>] --profile <cli-profile>` does the same against a real workspace: the CLI profile creates a personal access token that lives two hours (`--token-hours <n>`), the run's own config has it as `[DEFAULT]`, and it is revoked at the end. Every spec gets a copy of the config (`wdio.conf.ts`); the serverless spec's has `serverless_compute_id = auto` in its `[DEFAULT]`.

Without `DATABRICKS_E2E_EXTENSIONS`, `test:e2e:mock` installs the extension pack's members from the Marketplace, and the run stops if it can't reach it.

- The extension pack's members (`extensionPack`) come from `DATABRICKS_E2E_EXTENSIONS`, as in `yarn test:e2e`. The suite has been run with ms-python 2026.4.0, debugpy 2025.18.0, Jupyter 2025.9.1 and YAML 1.24.0.
- There are three windows: one with the folder, one without a folder (`*.no-folder.*` specs), and one with the folder and none of the pack's members (`*.no-deps.*` specs and the activation smoke spec, which runs in both folder windows).
- Unset `NO_COLOR` when running the interactive `bundle_init` spec (for example, `env -u NO_COLOR yarn workspace databricks-vscode-e2e test:e2e:mock`); `yarn test:e2e:spec` unsets it itself. The CLI disables prompting when `NO_COLOR` is set, even inside VS Code's terminal, so the template wizard exits without creating a project.
- Specs that install Python packages (`setup_local`, `run_dbconnect`) need a package index: set `PIP_INDEX_URL` (and `UV_INDEX_URL`); `run-e2e.sh` adds its host to `NO_PROXY`, so it bypasses the mock's proxy. `setup_local` also downloads uv-managed Python and the constraints from GitHub, which `NO_PROXY` lets through by default.
- The CLI trusts the mock's certificate through the OS store, not `SSL_CERT_FILE`. `MOCK_INSTALL_CA=1` installs the certificate into the OS store with `sudo`, for a CI runner; on Linux, `run-e2e.sh` runs the suite under `bwrap` with the CA bundle bound over the system one. On macOS, trust `$MOCK_DIR/cert.pem` in the keychain; this hasn't been verified.
- `wdio.mock.conf.ts` is `wdio.conf.ts` with VS Code's `http.proxy` pointed at the mock; `MOCK_FOLDER_ONLY=1` drops the window without a folder.
- `E2E_WORKERS` (default 1) runs that many spec files side by side; with 6, the whole suite takes about 4 minutes. Each worker has its own folder, config file and IPython folder; on Linux each worker's VS Code also gets an Xvfb display of its own, since windows on one display take focus from each other, and a quick pick closes when its window loses focus. On macOS the windows share the screen. All workers share the one mock workspace.
- A second run on the same machine (another checkout or worktree) needs ports and folders of its own: set `MOCK_PORT`, `MOCK_PROXY_PORT`, `MOCK_INTERCEPT_PORT` and `MOCK_SPARK_PORT` (defaults 8443, 8888, 8889 and 15002), and `TMPDIR`, which holds the specs' folders, config files and VS Code's user data. `run-e2e.sh` stops if a port is taken.
- `ssh_connection.ucws` can't pass here: the mock has no Secrets API, and no remote host to open.

## Limits

- Linux and macOS. On Windows, run the servers by hand with the same environment; `run-e2e.sh` is a bash script.
- The fixtures use the direct engine, the only one the bundled CLI (1.20 and later) has. An older CLI would download Terraform for the Terraform engine, which the proxy refuses.
- Real permissions, errors, latencies, quality monitors, notebook exports and job states beyond the specs' are not modelled. Extend `server.mjs` when a spec needs more, and list it under "What runs".
