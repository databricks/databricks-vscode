# Release: v0.0.6

## packages/databricks-vscode

## <small>0.0.6 (2022-12-05)</small>

-   Bump @types/uuid from 8.3.4 to 9.0.0 in /packages/databricks-sdk-js (#263) ([5c6a4af](https://github.com/databricks/databricks-vscode/commit/5c6a4af)), closes [#263](https://github.com/databricks/databricks-vscode/issues/263)
-   Improve parsing or error replies from command execution (#260) ([d8ecb0a](https://github.com/databricks/databricks-vscode/commit/d8ecb0a)), closes [#260](https://github.com/databricks/databricks-vscode/issues/260)
-   Show stdout when job fails with exception (#265) ([0504e1a](https://github.com/databricks/databricks-vscode/commit/0504e1a)), closes [#265](https://github.com/databricks/databricks-vscode/issues/265)
-   Use link to public docs (#264) ([f8bd630](https://github.com/databricks/databricks-vscode/commit/f8bd630)), closes [#264](https://github.com/databricks/databricks-vscode/issues/264)
-   Use web driver instead of selenium (#245) ([c6cb4a5](https://github.com/databricks/databricks-vscode/commit/c6cb4a5)), closes [#245](https://github.com/databricks/databricks-vscode/issues/245)

# Release: v0.0.5

## packages/databricks-vscode

## <small>0.0.5 (2022-11-30)</small>

-   critical fix: Fix edge case where the sync command could have deleted the Databricks Repo
-   fix: Make sure line numbers in python stack traces are correct.
-   fix: Correctly generate logfile on Windows

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
