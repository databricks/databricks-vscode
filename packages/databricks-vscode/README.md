# Databricks extension for Visual Studio Code

The Databricks extension for VS Code lets you work with the Databricks Data Intelligence Platform from VS Code: sign in to a workspace, build and deploy Declarative Automation Bundles, run your code on Databricks, and chat with Databricks models.

The extension is available from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/itemdetails?itemName=databricks.databricks).

## Features

- **Sign in** to a Databricks workspace from the Connection view, with a profile or in your browser.
- **Declarative Automation Bundles:** create a project from the Project view, deploy it, and run a job or pipeline from the Resources group in the Project view.
- **Run code on Databricks:** run Python files on a cluster, or run a notebook or Python file as a job.
- **Databricks Connect:** run and debug the current Python file with Databricks Connect, and run notebook cells in VS Code's Jupyter notebooks.
- **Unity Catalog and workspace files:** browse the catalogs, schemas and tables, and the files in your workspace.
- **Databricks models in VS Code Chat:** sign in to Unity Gateway, then pick a Databricks model in Chat. This needs GitHub Copilot Chat, and it isn't available in Cursor or in a Databricks session window.
- **AI tools:** install Databricks AI tools for your coding agents from the Models & AI tools view.
- **Sync local code:** for a dev target, sync your local project with the workspace from the Project view.
- **SSH tunnel:** connect your IDE to Databricks compute through an SSH tunnel.

## Getting started

Open the Quickstart from the Command Palette with "Databricks: Show Quickstart". It walks you through signing in, opening a project, and deploying it. The [User Guide](https://docs.databricks.com/dev-tools/vscode-ext.html) has the details.

Version 3 needs VS Code 1.128 or later. On an older VS Code, stay on version 2.

## Telemetry

The VSCode extension for Databricks collects anonymized telemetry about the behavior and performance of the extension. At any time, you can see the telemetry collected by this extension by running `code --telemetry` from the command line. Telemetry collection is optional and can be disabled at any time by setting the `telemetry.telemetryLevel` setting to `off`.

**Happy Coding!**
