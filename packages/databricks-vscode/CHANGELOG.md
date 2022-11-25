# Release: v0.0.4

## packages/databricks-vscode

## <small>0.0.4 (2022-11-25)</small>

-   [DECO-324] Update bricks version to v0.0.8 (#241) ([c2ce32b](https://github.com/databricks/databricks-vscode/commit/c2ce32b)), closes [#241](https://github.com/databricks/databricks-vscode/issues/241)
-   Add unit test for relativeRepoPath (#236) ([a3811ba](https://github.com/databricks/databricks-vscode/commit/a3811ba)), closes [#236](https://github.com/databricks/databricks-vscode/issues/236)
-   changelog fix ([12205d9](https://github.com/databricks/databricks-vscode/commit/12205d9))
-   Get a clean environment to run bricks (#240) ([0b3cd0c](https://github.com/databricks/databricks-vscode/commit/0b3cd0c)), closes [#240](https://github.com/databricks/databricks-vscode/issues/240)
-   Make latest changelog appear on top ([6279283](https://github.com/databricks/databricks-vscode/commit/6279283))
-   Partially revert #190 (#238) ([c0d3e1e](https://github.com/databricks/databricks-vscode/commit/c0d3e1e)), closes [#190](https://github.com/databricks/databricks-vscode/issues/190) [#238](https://github.com/databricks/databricks-vscode/issues/238)
-   Use spawn options from lazy terminal as is (#243) ([e1d8abf](https://github.com/databricks/databricks-vscode/commit/e1d8abf)), closes [#243](https://github.com/databricks/databricks-vscode/issues/243)

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
