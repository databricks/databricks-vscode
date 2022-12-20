# Release: v0.0.7

## packages/databricks-vscode

## <small>0.0.7 (2022-12-20)</small>

-   Add @staticmethod to dbutil stubs for better indexing (#310) ([3651864](https://github.com/databricks/databricks-vscode/commit/3651864)), closes [#310](https://github.com/databricks/databricks-vscode/issues/310)
-   Add `az login` support (#301) ([6463123](https://github.com/databricks/databricks-vscode/commit/6463123)), closes [#301](https://github.com/databricks/databricks-vscode/issues/301)
-   Add assert failure messages to tests (#279) ([7ab033f](https://github.com/databricks/databricks-vscode/commit/7ab033f)), closes [#279](https://github.com/databricks/databricks-vscode/issues/279)
-   Autocomplete for globals (#300) ([d5c8050](https://github.com/databricks/databricks-vscode/commit/d5c8050)), closes [#300](https://github.com/databricks/databricks-vscode/issues/300)
-   bump bricks version to v0.0.12 (#294) ([e906aa0](https://github.com/databricks/databricks-vscode/commit/e906aa0)), closes [#294](https://github.com/databricks/databricks-vscode/issues/294)
-   Bump decode-uri-component from 0.2.0 to 0.2.2 (#278) ([a542d93](https://github.com/databricks/databricks-vscode/commit/a542d93)), closes [#278](https://github.com/databricks/databricks-vscode/issues/278) [#6](https://github.com/databricks/databricks-vscode/issues/6) [#1](https://github.com/databricks/databricks-vscode/issues/1) [#6](https://github.com/databricks/databricks-vscode/issues/6) [#1](https://github.com/databricks/databricks-vscode/issues/1)
-   Increase timeouts (#311) ([3d692f2](https://github.com/databricks/databricks-vscode/commit/3d692f2)), closes [#311](https://github.com/databricks/databricks-vscode/issues/311)
-   Interactive AAD setup (#308) ([81d4e81](https://github.com/databricks/databricks-vscode/commit/81d4e81)), closes [#308](https://github.com/databricks/databricks-vscode/issues/308)
-   Redirect bricks logs to a file as well (#280) ([430e930](https://github.com/databricks/databricks-vscode/commit/430e930)), closes [#280](https://github.com/databricks/databricks-vscode/issues/280)
-   Revert "Increase timeouts" (#313) ([f03f595](https://github.com/databricks/databricks-vscode/commit/f03f595)), closes [#313](https://github.com/databricks/databricks-vscode/issues/313) [databricks/databricks-vscode#311](https://github.com/databricks/databricks-vscode/issues/311)
-   Run notebook as job integration test (#302) ([fc8dff5](https://github.com/databricks/databricks-vscode/commit/fc8dff5)), closes [#302](https://github.com/databricks/databricks-vscode/issues/302)
-   Spec level retry for failing integration tests (#312) ([da00229](https://github.com/databricks/databricks-vscode/commit/da00229)), closes [#312](https://github.com/databricks/databricks-vscode/issues/312)

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
