# Databricks extension for VSCode

| System                                                                                          | Status                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build ([main branch](https://github.com/databricks/databricks-vscode/commits/main))             | [![GitHub CI Status](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml/badge.svg?branch=main)](https://github.com/databricks/databricks-vscode/actions/workflows/push.yml)                                                                                             |
| [Marketplace](https://marketplace.visualstudio.com/items?itemName=databricks.databricks-vscode) | [![Marketplace Version](https://img.shields.io/vscode-marketplace/v/databricks.databricks-vscode.svg) ![Marketplace Downloads](https://img.shields.io/vscode-marketplace/d/databricks.databricks-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=databricks.databricks-vscode) |

The Databricks extension for VSCode allows you to develop for the Databricks Lakehouse platform from VSCode.

The extension is available from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/itemdetails?itemName=databricks.databricks-vscode).

This is an open source project because we want you to be involved. We love issues, feature requests, code reviews, pull requests or any positive contribution. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

-   Synchronize code to a Databricks workspace
-   Run Python files on a Databricks cluster
-   Run notebooks and Python files as Workflows

![run](./images/run.gif)

## Requirements

In order to use this extension you need acceess to a Databricks workspace:

1. Databricks workspace with:
    1. `Repos` enabled
    2. `Files in Repos` enabled
2. Permission to access the workspace using a personal access token (PAT)
3. Access to an interactive cluster or permissions to create a cluster
4. Permissions to create Databricks repos

## Documentation

-   The [Quick Start Guide](README.quickstart.md) provides an overview
    of common features.
-   <mark>The [User Guide](https://docs.databricks.com/)
    contains comprehesive documentation about the Databricks extension. (TODO: Link not available yet)</mark>

## Release Notes

### 0.0.1

Preview version of the VSCode extension for Databricks

**Happy Coding!**
