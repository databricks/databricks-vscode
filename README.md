# Databricks extension for VSCode

| System                                                                                   | Status                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build ([main branch](https://github.com/databricks/databricks-vscode/commits/main))      | [![GitHub CI Status](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml/badge.svg?branch=main)](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml) [![codecov](https://codecov.io/gh/databricks/databricks-vscode/branch/main/graph/badge.svg?token=PUN77X0W3Z)](https://codecov.io/gh/databricks/databricks-vscode) |
| [Marketplace](https://marketplace.visualstudio.com/items?itemName=databricks.databricks) | [![Marketplace Version](https://img.shields.io/vscode-marketplace/v/databricks.databricks.svg) ![Marketplace Downloads](https://img.shields.io/vscode-marketplace/d/databricks.databricks.svg)](https://marketplace.visualstudio.com/items?itemName=databricks.databricks)                                                                                            |

## Introduction

This repository contains the source code for Databricks extensions for VSCode.

Currently, we have the following packages:

-   [databricks-vscode](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode)
    The VSCode extension for Databricks published to the VSCode marketplace.
-   [databricks-vscode-types](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode-types)
    Type definition of the public API of the VSCode extension.

## Development

### Getting started

Install dependencies with Yarn:

```
npm install -g yarn@3
yarn install
```

The Databricks JavaScript SDK (`@databricks/sdk-experimental`) is a regular npm dependency and is installed automatically by `yarn install` — no separate step is required.

Fetch the Databricks CLI binary that gets bundled into the extension. This downloads the version pinned as `cli.version` in `packages/databricks-vscode/package.json` for your current OS/arch into `packages/databricks-vscode/bin`:

```
yarn workspace databricks run package:cli:fetch
```

After that you are ready to build, install, and test the `databricks-vscode` extension.

### Building the extension

All build commands run from the extension package directory:

```
cd packages/databricks-vscode
```

For everyday local development, build a `.vsix` for your own machine:

```
yarn package
```

`yarn package` runs `vsce package` and bundles whatever CLI binary is in `bin/`, so run `package:cli:fetch` (see above) first — otherwise the resulting `.vsix` ships without a CLI. It prints the name of the generated file.

To build a fully self-contained, distributable package for a specific platform, use one of the platform-specific commands instead. These fetch the matching CLI binary along with its Terraform dependencies, tag the `.vsix` for that target, and revert the temporary `package.json` changes when done:

```
yarn package:darwin:arm64   # macOS (Apple Silicon)
yarn package:darwin:x64     # macOS (Intel)
yarn package:linux:x64      # Linux (x64)
yarn package:linux:arm64    # Linux (arm64)
yarn package:win32:x64      # Windows (x64)
yarn package:win32:arm64    # Windows (arm64)
yarn package:all            # all of the above
```

### Installing and running a local build

Install the generated `.vsix` (use `cursor` in place of `code` for Cursor):

```
code --install-extension databricks-<version>.vsix
```

Then reload the window (Command Palette → "Developer: Reload Window") to pick up the new build.

Side-loading a `.vsix` does not pull in the extension's dependencies the way the Marketplace does, so make sure these are installed too: `ms-python.python`, `ms-python.debugpy`, `ms-toolsai.jupyter`, and `redhat.vscode-yaml`. For example:

```
code --list-extensions | grep redhat.vscode-yaml
```

Confirm the build bundles the expected CLI version (use the `~/.cursor/...` path on Cursor):

```
~/.vscode/extensions/databricks.databricks-<version>/bin/databricks --version
```

### Building against a specific Databricks CLI version

To bundle a CLI version other than the one currently pinned — for example to try out an unreleased feature — bump `cli.version` (and, optionally, the extension `version` so the dev build is easy to identify) in `packages/databricks-vscode/package.json`, then re-fetch and re-package:

```
jq '.version = "2.11.0-dev.1" | .cli.version = "0.298.0"' packages/databricks-vscode/package.json > packages/databricks-vscode/package.json.tmp
mv packages/databricks-vscode/package.json.tmp packages/databricks-vscode/package.json

yarn workspace databricks run package:cli:fetch
yarn workspace databricks run package
```

Install and reload as above, then confirm the bundled version with `bin/databricks --version`.

### Smoke-testing a build

Open a bundle config to exercise the extension end to end. Create a `databricks.yml` and open it in the editor:

```
mkdir -p test
cat > test/databricks.yml <<'EOF'
bundle:
  name: test
  engine: direct
resources:
  vector_search_endpoints:
    my_endpoint:
EOF
code test/databricks.yml
```

With `redhat.vscode-yaml` installed, the extension provides schema validation and completion for the bundle file.

## Found an issue?

If you find an issue/bug or have a feature request, please file an issue here: https://github.com/databricks/databricks-vscode/issues/new

Also please append the logs as per these instructions https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks.
