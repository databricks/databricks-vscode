# Contributing to the Databricks extension for VSCode

Thank you for your interest in contributing! This document explains how to set
up your environment, make a change, and open a pull request.

## Found an issue?

If you find a bug or have a feature request, please file an issue:
https://github.com/databricks/databricks-vscode/issues/new

When reporting a bug, please attach the extension logs as described here:
https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks

## Prerequisites

- **Node.js** `>=22`
- **Yarn** `3.2.x` (the repo pins `yarn@3.2.1` via `packageManager`)
- **Python** (for the Python-side unit tests and the bundled runtime scripts)

## Getting started

Prepare Yarn and install dependencies:

```sh
npm install -g yarn@3
yarn install
```

The Databricks JavaScript SDK (`@databricks/sdk-experimental`) is a regular npm
dependency and is installed automatically by `yarn install` — no separate step
is required.

Fetch the Databricks CLI that the extension bundles:

```sh
yarn workspace databricks run package:cli:fetch
```

Re-run this whenever `cli.version` in `packages/databricks-vscode/package.json`
changes — after every `git pull`, in practice.

After that you're ready to build, run, and test the extension.

## Building and running

Build all workspaces:

```sh
yarn build
```

To develop the extension interactively, open the repository in VSCode and press
`F5` to launch the Extension Development Host. Use the `watch` script for
incremental rebuilds while you work:

```sh
yarn workspace databricks run watch
```

### Previewing local CLI changes

The extension runs the CLI bundled at
`packages/databricks-vscode/bin/databricks` (`databricks.exe` on Windows).
Installing a different CLI on your `PATH` does not change this binary. You can
replace it locally without changing `cli.version` in `package.json`; `bin/` is
gitignored. Use a separate extension checkout or worktree if you also need to
develop against the pinned CLI.

The following commands use a macOS/Linux shell. Check out the CLI branch you want
to test in a sibling [CLI repository](https://github.com/databricks/cli), with its
build prerequisites installed:

```text
parent/
├── cli/                 # CLI source; ./task build produces cli/cli
└── databricks-vscode/   # this repository
```

From this repository's root, build and link the CLI:

```sh
(cd ../cli && ./task build)
yarn workspace databricks run package:cli:link
./packages/databricks-vscode/bin/databricks version
```

`package:cli:link` replaces the bundled binary with a symlink to `../cli/cli`.
For another directory layout, create a symlink to your CLI checkout's built
binary instead. On Windows, copy the built executable to
`packages/databricks-vscode/bin/databricks.exe`. Remove any previous symlink
before copying a binary so the copy does not overwrite its target.

Build the extension and launch its development host from this repository's root
(`code` must be available on your `PATH`):

```sh
yarn build
code --new-window --extensionDevelopmentPath "$PWD/packages/databricks-vscode"
```

Exercise the extension action affected by your CLI change. For SSH, complete the
[client and server setup below](#previewing-ssh-client-and-server-changes) before
using **Databricks → Start SSH tunnel**. Check that the **Databricks SSH Tunnel**
terminal invokes the CLI in this checkout's `bin/` directory.

After editing CLI code, rebuild the CLI and reload the Extension Development Host
with **Developer: Reload Window**. A symlink picks up the rebuilt binary; a copied
binary must be copied again. Restart existing CLI commands or SSH connections to
use the new build. Rebuild the extension only if its source also changed.

The development host's bundled-CLI version warning is expected when deliberately
testing a different version. Do not run `package:cli:fetch` during the preview:
it replaces your local override with the pinned release. Commands that invoke it,
such as `package:bundle-schema:write`, also replace the override.

#### Previewing SSH client and server changes

SSH uses a local client and a Linux server uploaded to the workspace. `./task build`
only builds the local CLI; use `./task snapshot-release` to build the Linux server
archives. This requires the CLI repository's GoReleaser setup.

Set the absolute CLI checkout path, then build the snapshot:

```sh
CLI_CHECKOUT=/absolute/path/to/cli
(cd "$CLI_CHECKOUT" && ./task snapshot-release)
```

Before using the extension's SSH action, connect once with `--releases-dir` to
upload the snapshot's server binaries. The client built and linked above can be
used for this command. Choose an authenticated workspace profile explicitly. This
command starts a serverless SSH job and runs a smoke command:

```sh
CLI_PROFILE=your-profile
./packages/databricks-vscode/bin/databricks ssh connect \
  --profile "$CLI_PROFILE" \
  --name cli-preview \
  --releases-dir "$CLI_CHECKOUT/dist" \
  --server-timeout 1h \
  --shutdown-delay 5m \
  -- 'echo CLI_PREVIEW_OK'
```

For dedicated compute, replace `--name cli-preview` with
`--cluster <cluster-id> --auto-start-cluster`, using a dedicated single-user
cluster assigned to you. Then reload the development host and use **Start SSH
tunnel**, selecting that workspace/profile and compute. The extension does not
pass `--releases-dir`; it reuses the uploaded binaries for the bundled CLI's
version. Repeat the upload step for each workspace you test.

Server uploads are cached by CLI version. Rebuilding uncommitted changes can keep
the same version and silently reuse an earlier server binary, even with a new
`--name`. For another server revision, create a new local CLI commit, run
`./task --force snapshot-release`, rebuild the linked client, and repeat the upload
step. Stop the previous preview's SSH job so a running server is not reused.

If you launch VS Code with a custom `--user-data-dir`, also copy the Remote-SSH
settings the CLI adds to your normal VS Code user settings into that profile's
`User/settings.json`. These include `remote.SSH.remoteServerListenOnSocket`, the
host entries in `remote.SSH.remotePlatform` and
`remote.SSH.serverPickPortsFromRange`, and `remote.SSH.defaultExtensions`.

#### Restoring the pinned CLI

If you tested SSH, close the remote windows, cancel the preview job runs shown by
the CLI, and stop any dedicated compute you started. Restore the extension's
pinned CLI from this repository's root, then reload the development host:

```sh
yarn workspace databricks run package:cli:fetch
```

## Testing

Run the full check (lint + unit tests) across all workspaces from the repo root:

```sh
yarn test
```

Within the `databricks-vscode` package you can run the individual suites:

```sh
# Lint (eslint + prettier check)
yarn workspace databricks run test:lint

# TypeScript unit tests (VSCode test runner)
yarn workspace databricks run test:unit

# Python unit tests
yarn workspace databricks run test:python

# Unit tests with coverage
yarn workspace databricks run test:cov

# End-to-end / integration tests (see "Integration test environment" below —
# these require a live Databricks workspace and extra environment variables)
yarn workspace databricks run test:integ
```

Please add tests for any new behavior, and make sure the full suite passes
before opening a pull request.

### Integration test environment

Unlike the lint and unit suites, `test:integ` runs against a **live Databricks
workspace**, so it needs credentials and a cluster before it will start. The
e2e runner resolves authentication through the standard Databricks SDK unified
auth (environment variables or a `.databrickscfg` profile), and it asserts that
a default cluster is configured.

Set the following before running `yarn workspace databricks run test:integ`:

| Variable                                            | Required             | Description                                                                         |
| --------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `DATABRICKS_HOST`                                   | Yes                  | Workspace URL, e.g. `https://my-workspace.cloud.databricks.com`.                    |
| `TEST_DEFAULT_CLUSTER_ID`                           | Yes                  | ID of an existing cluster in that workspace; the runner starts it before the tests. |
| `DATABRICKS_TOKEN`                                  | For PAT auth         | Personal access token. Provide this **or** the OAuth pair below.                    |
| `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` | For OAuth (M2M) auth | Service principal credentials, used when no token is set.                           |

For example, using a personal access token:

```sh
export DATABRICKS_HOST="https://my-workspace.cloud.databricks.com"
export DATABRICKS_TOKEN="dapi..."
export TEST_DEFAULT_CLUSTER_ID="0101-234567-abcdefgh"

yarn workspace databricks run test:integ
```

Instead of exporting `DATABRICKS_HOST`/`DATABRICKS_TOKEN` you may point the SDK
at an existing profile (for example `export DATABRICKS_CONFIG_PROFILE=DEFAULT`);
`TEST_DEFAULT_CLUSTER_ID` is still required in that case. The extension e2e tests
also build a `.vsix` package as part of `test:integ:prepare`, so make sure you
have run `yarn build` first.

## Code style

Formatting and linting are enforced by prettier and eslint. Auto-fix
formatting and lint issues with:

```sh
yarn fix
```

CI runs `yarn test`, which includes `test:lint`, so unformatted or lint-failing
code will not pass.

## Pull requests

1. Fork the repository and create a topic branch from `main`.
2. Keep each PR focused on a single change; split unrelated fixes or
   refactors into separate PRs.
3. Make sure `yarn test` passes and add tests for new behavior.
4. Fill in the PR template — describe **what** changed and **how** it was
   tested.
5. Open your pull request. You do **not** need to sign anything up front — a
   maintainer will request the Contributor License Agreement during review if
   your change is accepted (see below).

## Contributor License Agreement

This project is licensed under the [Databricks License](LICENSE). To accept
contributions, we need to confirm that you have the right to submit your
contribution and that you grant Databricks the right to distribute it. For
projects under the Databricks License this is done through a **Contributor
License Agreement (CLA)** rather than a DCO commit sign-off.

### How the CLA process works

The CLA is handled manually by the maintainers — there is no self-service form
to sign in advance:

1. **Open your pull request** as normal. There is no need to sign anything
   before you do — just author your commits with your real name and email (git
   records these automatically).
2. **A maintainer reviews your change.** If we would like to accept it, we will
   send you the Databricks CLA and ask you, in a PR comment, to sign and return
   it.
3. **Sign the CLA** and return it as instructed, then confirm on the pull
   request.
4. **We merge** once the signed CLA is in place and the review is complete.

Notes:

- If you are contributing on behalf of a company, you may need internal
  approval to sign the CLA, and it may require signature from an officer of the
  company. Please start this process early so it doesn't block your PR.
- Once the CLA is signed it covers subsequent contributions from the same
  contributor or company — you only need to sign once.

## License

By contributing, you agree that your contributions will be licensed under the
terms of the [LICENSE](LICENSE) in this repository (the Databricks License).
