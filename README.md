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
-   [databricks-sdk-js](https://github.com/databricks/databricks-vscode/tree/main/packages/databricks-sdk-js)
    JavaScript and TypeScript SDK for the Databricks REST API.

### Getting Started

Prepare yarn:

```
npm install -g yarn@2
yarn install
```

### Found an issue?

If you find an issue / bug or have a feature request, please file an issue here: https://github.com/databricks/databricks-vscode/issues/new

Also please send the logs as per these instructions https://docs.databricks.com/dev-tools/vscode-ext.html#send-usage-logs-to-databricks to us at
vscode-private-preview _at_ databricks _dot_ com (remove_the_spaces)
