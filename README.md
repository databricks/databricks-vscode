# Databricks extension for VSCode

| System                                                                                   | Status                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build ([main branch](https://github.com/databricks/databricks-vscode/commits/main))      | [![GitHub CI Status](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml/badge.svg?branch=main)](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml) [![codecov](https://codecov.io/gh/databricks/databricks-vscode/branch/main/graph/badge.svg?token=PUN77X0W3Z)](https://codecov.io/gh/databricks/databricks-vscode) [![lines of code](https://tokei.rs/b1/github/databricks/databricks-vscode)]([https://codecov.io/github/databricks/databricks-vscode](https://github.com/databricks/databricks-vscode)) |
| [Marketplace](https://marketplace.visualstudio.com/items?itemName=databricks.databricks) | [![Marketplace Version](https://img.shields.io/vscode-marketplace/v/databricks.databricks.svg) ![Marketplace Downloads](https://img.shields.io/vscode-marketplace/d/databricks.databricks.svg)](https://marketplace.visualstudio.com/items?itemName=databricks.databricks)                                                                                            |

## Introduction

This repository contains the source code for Databricks extensions for VSCode.

Currently, we have the following packages:

-   [databricks-vscode](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode)
    The VSCode extension for Databricks published to the VSCode marketplace.
-   [databricks-vscode-types](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-vscode-types)
    Type definition of the public API of the VSCode extension.

### Getting Started

Prepare yarn:

```
npm install -g yarn@2
yarn install
```

Prepare Databricks JavaScript SDK:

```
yarn run install:sdk
```

Prepare Databricks CLI:

```
yarn workspace databricks run package:cli:fetch
```

After that you are ready to build and test the `databricks-vscode` extension.

### Found an issue?

If you find an issue/bug or have a feature request, please file an issue here: https://github.com/databricks/databricks-vscode/issues/new

Also please append the logs as per these instructions https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks.
