# Release: v0.0.11

## packages/databricks-vscode

## <small>0.0.11 (2023-01-30)</small>

-   Add **init**.py to type stubs (#393) ([999aed8](https://github.com/databricks/databricks-vscode/commit/999aed8)), closes [#393](https://github.com/databricks/databricks-vscode/issues/393)
-   Add loading fresh generated bundle schema to `redhat.vscode-yaml` extension (#398) ([517a9fd](https://github.com/databricks/databricks-vscode/commit/517a9fd)), closes [#398](https://github.com/databricks/databricks-vscode/issues/398)
-   Allow running scala/r/sql notebooks as workflow (#402) ([6b8bf79](https://github.com/databricks/databricks-vscode/commit/6b8bf79)), closes [#402](https://github.com/databricks/databricks-vscode/issues/402)
-   bump bricks to v0.0.20 (#407) ([46c314e](https://github.com/databricks/databricks-vscode/commit/46c314e)), closes [#407](https://github.com/databricks/databricks-vscode/issues/407)
-   Don't show error when config file doesn't exist. (#382) ([3a4f7e1](https://github.com/databricks/databricks-vscode/commit/3a4f7e1)), closes [#382](https://github.com/databricks/databricks-vscode/issues/382)
-   Files in Workspace support (#337) ([128962b](https://github.com/databricks/databricks-vscode/commit/128962b)), closes [#337](https://github.com/databricks/databricks-vscode/issues/337)
-   Fix "az login" when user doesn't have a subscription (#400) ([e39a9ec](https://github.com/databricks/databricks-vscode/commit/e39a9ec)), closes [#400](https://github.com/databricks/databricks-vscode/issues/400)
-   Handle missing ~/.databrickscfg (#383) ([89aadbe](https://github.com/databricks/databricks-vscode/commit/89aadbe)), closes [#383](https://github.com/databricks/databricks-vscode/issues/383)
-   Install extension from vsix for integration tests (#377) ([169dfbf](https://github.com/databricks/databricks-vscode/commit/169dfbf)), closes [#377](https://github.com/databricks/databricks-vscode/issues/377)
-   UI tweaks (#401) ([1a16be2](https://github.com/databricks/databricks-vscode/commit/1a16be2)), closes [#401](https://github.com/databricks/databricks-vscode/issues/401)
-   Update dependencies (#390) ([c101af2](https://github.com/databricks/databricks-vscode/commit/c101af2)), closes [#390](https://github.com/databricks/databricks-vscode/issues/390)
-   use "bricks auth profiles" and list host names (#389) ([7633281](https://github.com/databricks/databricks-vscode/commit/7633281)), closes [#389](https://github.com/databricks/databricks-vscode/issues/389)
-   Use /dist/ instead of /src/ (#391) ([9664394](https://github.com/databricks/databricks-vscode/commit/9664394)), closes [#391](https://github.com/databricks/databricks-vscode/issues/391)
-   Use updated flags for bricks sync command (#387) ([ce2ebb0](https://github.com/databricks/databricks-vscode/commit/ce2ebb0)), closes [#387](https://github.com/databricks/databricks-vscode/issues/387)
-   AAD: Use device code flow on CodeSpaces (#392) ([c46055a](https://github.com/databricks/databricks-vscode/commit/c46055a)), closes [#392](https://github.com/databricks/databricks-vscode/issues/392)

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
