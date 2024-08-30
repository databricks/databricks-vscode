# ⚠️ Note

    > **Version 2 of the extension will soon be made the default. With this update it is easier to set up your project, integrate with Databricks Asset Bundles, and run your code remotely. [Learn more](https://docs.databricks.com/dev-tools/vscode-ext/install.html).**

# Databricks extension for Visual Studio Code

The Databricks extension for VS Code allows you to develop for the Databricks Lakehouse platform from VS Code.

The extension is available from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/itemdetails?itemName=databricks.databricks).

## Features

-   Synchronize code to a Databricks workspace
-   Run Python files on a Databricks cluster
-   Run notebooks and Python files as Workflows

![run](images/run.gif)

## Requirements

In order to use this extension you need access to a Databricks workspace:

1. Databricks workspace with:
    1. `Repos` enabled
    2. `Files in Repos` enabled
2. Permission to access the workspace using a personal access token (PAT) or Azure AD CLI.
3. Access to an interactive cluster or permissions to create a cluster
4. Permissions to create Databricks Repos

## Getting started

![configure](./images/configure.gif)

## Documentation

-   The [Quick Start Guide](DATABRICKS.quickstart.md) provides an overview
    of common features.
-   The [User Guide](https://docs.databricks.com/dev-tools/vscode-ext.html)
    contains comprehesive documentation about the Databricks extension.

### Telemetry

The VSCode extension for Databricks collects anonymized telemetry about the behavior and performance of the extension. At any time, you can see the telemetry collected by this extension by running `code --telemetry` from the command line. Telemetry collection is optional and can be disabled at any time by setting the `telemetry.telemetryLevel` setting to `off`.

**Happy Coding!**
