# Release: v0.3.0

## packages/databricks-vscode

## 0.3.0 (2023-02-20)

-   Allow creation of repos even if /Repos/me doesn't exist (#465) ([acd5fbb](https://github.com/databricks/databricks-vscode/commit/acd5fbb)), closes [#465](https://github.com/databricks/databricks-vscode/issues/465)
-   Fix run_on_cluster integration test (#481) ([05d9e2e](https://github.com/databricks/databricks-vscode/commit/05d9e2e)), closes [#481](https://github.com/databricks/databricks-vscode/issues/481)
-   Hide existing repos (#478) ([b4b34ad](https://github.com/databricks/databricks-vscode/commit/b4b34ad)), closes [#478](https://github.com/databricks/databricks-vscode/issues/478)
-   Improve AAD login and prevent infinite loops when trying to use AAD (#473) ([74abba1](https://github.com/databricks/databricks-vscode/commit/74abba1)), closes [#473](https://github.com/databricks/databricks-vscode/issues/473)
-   Make integration tests less flaky. (#475) ([2d65d84](https://github.com/databricks/databricks-vscode/commit/2d65d84)), closes [#475](https://github.com/databricks/databricks-vscode/issues/475)
-   Make typings for autocompletion more consistent (#469) ([35ff9d1](https://github.com/databricks/databricks-vscode/commit/35ff9d1)), closes [#469](https://github.com/databricks/databricks-vscode/issues/469) [#464](https://github.com/databricks/databricks-vscode/issues/464)
-   Update dependencies (#474) ([1dcbca6](https://github.com/databricks/databricks-vscode/commit/1dcbca6)), closes [#474](https://github.com/databricks/databricks-vscode/issues/474)

# Release: v0.2.4

## packages/databricks-vscode

## <small>0.2.4 (2023-02-16)</small>

-   Fix: Ignore symlinked folders when syncing code to Databricks, closes [#455](https://github.com/databricks/databricks-vscode/issues/455)
-   Fix: Improve handling of notebooks during sync
-   Fix: Fix Windows support for sync destination, closes [#458](https://github.com/databricks/databricks-vscode/issues/458)

# Release: v0.2.3

## packages/databricks-vscode

## <small>0.2.3 (2023-02-15)</small>

-   Fix: Add support for syncing files with spaces in their file names

# Release: v0.2.2

## packages/databricks-vscode

## <small>0.2.2 (2023-02-14)</small>

-   Minor: Fix image links in README.md

# Release: v0.2.1

## packages/databricks-vscode

## <small>0.2.1 (2023-02-14)</small>

-   Minor: Doc updates after extension was made public

# Release: v0.2.0

## packages/databricks-vscode

## 0.2.0 (2023-02-13)

-   Feature: Allow creation of Repos directly from the IDE
-   Feature: Add `bricks` CLI to the PATH of VS Code terminals
-   Feature: Watch `.gitignore` files for changes while sync is running
-   Breaking change: Rename extension from `databricks-vscode` to `databricks` so it can be published to the VS Code marketplace.

# Release: v0.0.11

## packages/databricks-vscode

## <small>0.0.11 (2023-01-30)</small>

-   Feature: Allow running Scala, R and SQL notebooks as workflow
-   Feature: List hostnames from `~/.databrickscfg` when selecting a host
-   Feature: Take into account `.gitignore` rules defined in parent directories for file syncronization.
-   Feature: Make `az login` work on Github CodeSpaces
-   Experimental feature: Add support for synchronizing to a workspace folder (Files in Workspace)
-   Fix: Don't show error when config file doesn't exist
-   Fix: Support `az login` when user doesn't have a subscription
-   Fix: Gracefully handle adding a profile when `~/.databrickscfg` doesn't exist
-   Fix: Running the "full sync" command now resets the synchronization state
-   UI tweaks: Clean up and unify items in the side panel

# Release: v0.0.10

## packages/databricks-vscode

## <small>0.0.10 (2023-01-16)</small>

-   Update to use the latest JavaScript SDK for Databricks

# Release: v0.0.9

## packages/databricks-vscode

## <small>0.0.9 (2023-01-09)</small>

-   Fix: Don't show `start cluster` icon for terminating clusters. Wait for termination.
-   Update license to Databricks License

# Release: v0.0.8

## packages/databricks-vscode

## <small>0.0.8 (2022-12-23)</small>

-   Fix: Properly detect the Azure CLI `az` on Windows
-   Fix: Fix synchronizing files located in folders on Windows
-   Fix: Improve host name validation in the workspace configuration wizard
-   Fix: Fix bug in project.json parsing

# Release: v0.0.7

## packages/databricks-vscode

## <small>0.0.7 (2022-12-20)</small>

-   Feature: Add code completion support for Databricks globals such as `spark` or `dbutils`
-   Feature: Add support for logging in using the Azure CLI. This allows users to use the extension with Azure Active Directory (AAD).

# Release: v0.0.6

## packages/databricks-vscode

## <small>0.0.6 (2022-12-05)</small>

-   Feature: Click to file from Python error stacktraces when using "Run on Databricks".
-   Feature: Show stdout when job fails with exception.

# Release: v0.0.5

## packages/databricks-vscode

## <small>0.0.5 (2022-11-30)</small>

-   Critical fix: Fix edge case where the sync command could have deleted the Databricks Repo
-   Fix: Make sure line numbers in python stack traces are correct.
-   Fix: Correctly generate logfile on Windows

# Release: v0.0.4

## packages/databricks-vscode

## <small>0.0.4 (2022-11-28)</small>

-   Feature: Support environment variables in 'Run on Databricks' custom debug config
-   Fix: Make copy to clipboard on OSX from the workflow run webview
-   Fix: Fix file synching on Windows
-   Fix: Properly handle starting a stopping cluster
-   Fix: Register `Databricks task` and kill task terminal on error

# Release: v0.0.3

## packages/databricks-vscode

## <small>0.0.3 (2022-11-21)</small>

-   Added command `Open full logs` to open the log output folder
-   Turn filtering of accessible cluster off by default. Can be enabled using the setting `databricks.clusters.onlyShowAccessibleClusters`
-   Allow running ipynb files as workflows
-   Improve handling cases where the user doesn't hve administrator permissions in the Databricks workspace
-   Show warning when the name of the selected Databricks Repo doesn't match the local workspace name
-   Add setting `databricks.bricks.verboseMode` to show debug logs for the sync command

# Release: v0.0.2

## packages/databricks-vscode

## <small>0.0.2 (2022-11-15)</small>

-   First private preview release
