# Release: v0.1.0

## packages/databricks-vscode

## 0.1.0 (2023-02-13)

-   Add "bricks" from the extension to the PATH of terminals (#411) ([e7943d0](https://github.com/databricks/databricks-vscode/commit/e7943d0)), closes [#411](https://github.com/databricks/databricks-vscode/issues/411)
-   Cleanup old extraPaths (#395) ([84901e2](https://github.com/databricks/databricks-vscode/commit/84901e2)), closes [#395](https://github.com/databricks/databricks-vscode/issues/395)
-   Fetch bricks from S3 (#416) ([9d48570](https://github.com/databricks/databricks-vscode/commit/9d48570)), closes [#416](https://github.com/databricks/databricks-vscode/issues/416)
-   Minor bug fixes (#412) ([4be0cd7](https://github.com/databricks/databricks-vscode/commit/4be0cd7)), closes [#412](https://github.com/databricks/databricks-vscode/issues/412)
-   Pass proxy environment variables if set (#413) ([f993f37](https://github.com/databricks/databricks-vscode/commit/f993f37)), closes [#413](https://github.com/databricks/databricks-vscode/issues/413)
-   Rename extension from `databricks-vscode` to `databricks` (#363) ([67ac12c](https://github.com/databricks/databricks-vscode/commit/67ac12c)), closes [#363](https://github.com/databricks/databricks-vscode/issues/363)
-   Try to make the E2E tests more robust. (#414) ([1d5416d](https://github.com/databricks/databricks-vscode/commit/1d5416d)), closes [#414](https://github.com/databricks/databricks-vscode/issues/414)
-   Update dependencies (#426) ([774819d](https://github.com/databricks/databricks-vscode/commit/774819d)), closes [#426](https://github.com/databricks/databricks-vscode/issues/426)

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
