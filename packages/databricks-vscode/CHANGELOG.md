# Release: v0.0.8

## packages/databricks-vscode

## <small>0.0.8 (2022-12-23)</small>

-   bump bricks to v0.0.14 (#322) ([161598a](https://github.com/databricks/databricks-vscode/commit/161598a)), closes [#322](https://github.com/databricks/databricks-vscode/issues/322)
-   Cross platform file not found detection (#324) ([f1e5b6e](https://github.com/databricks/databricks-vscode/commit/f1e5b6e)), closes [#324](https://github.com/databricks/databricks-vscode/issues/324)
-   Fix "az" on Windows (#318) ([a957b5e](https://github.com/databricks/databricks-vscode/commit/a957b5e)), closes [#318](https://github.com/databricks/databricks-vscode/issues/318)
-   fix hostname validation (#317) ([ca96b47](https://github.com/databricks/databricks-vscode/commit/ca96b47)), closes [#317](https://github.com/databricks/databricks-vscode/issues/317)
-   Fix project.json parsing (#323) ([1cf255c](https://github.com/databricks/databricks-vscode/commit/1cf255c)), closes [#323](https://github.com/databricks/databricks-vscode/issues/323)
-   Re-enable spec level retries (#319) ([a2e5ebf](https://github.com/databricks/databricks-vscode/commit/a2e5ebf)), closes [#319](https://github.com/databricks/databricks-vscode/issues/319)

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
