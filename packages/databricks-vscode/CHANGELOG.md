# Release: v0.3.8

## packages/databricks-vscode

## <small>0.3.8 (2023-04-17)</small>

-   [DECO-643] Add Telemetry to VS Code Extension (#630) ([cda35ca](https://github.com/databricks/databricks-vscode/commit/cda35ca)), closes [#630](https://github.com/databricks/databricks-vscode/issues/630)
-   [DECO-669] Instrument extension activation & connection state changes (#655) ([817912c](https://github.com/databricks/databricks-vscode/commit/817912c)), closes [#655](https://github.com/databricks/databricks-vscode/issues/655)
-   [merge-hold] Files in Workspace: Show prompt to enable files in workspace and add deprecation banner ([1b9fabd](https://github.com/databricks/databricks-vscode/commit/1b9fabd)), closes [#587](https://github.com/databricks/databricks-vscode/issues/587)
-   Add DB Connect Enabled ui button (#635) ([0a99827](https://github.com/databricks/databricks-vscode/commit/0a99827)), closes [#635](https://github.com/databricks/databricks-vscode/issues/635)
-   Add Feature Manager and use it to manage dbconnect integration (#619) ([2f2eae4](https://github.com/databricks/databricks-vscode/commit/2f2eae4)), closes [#619](https://github.com/databricks/databricks-vscode/issues/619)
-   Add metadata service client and server (#624) ([8632e49](https://github.com/databricks/databricks-vscode/commit/8632e49)), closes [#624](https://github.com/databricks/databricks-vscode/issues/624)
-   Bricks CLI Auth (#541) ([3708572](https://github.com/databricks/databricks-vscode/commit/3708572)), closes [#541](https://github.com/databricks/databricks-vscode/issues/541)
-   Bump bricks (#636) ([a50ef3c](https://github.com/databricks/databricks-vscode/commit/a50ef3c)), closes [#636](https://github.com/databricks/databricks-vscode/issues/636)
-   Bump dependency versions (#653) ([df270e3](https://github.com/databricks/databricks-vscode/commit/df270e3)), closes [#653](https://github.com/databricks/databricks-vscode/issues/653)
-   Delete dbconnect wheel (#658) ([3f0f65b](https://github.com/databricks/databricks-vscode/commit/3f0f65b)), closes [#658](https://github.com/databricks/databricks-vscode/issues/658)
-   Fix typo (#599) ([719acb0](https://github.com/databricks/databricks-vscode/commit/719acb0)), closes [#599](https://github.com/databricks/databricks-vscode/issues/599)
-   Remove dbconnect from optin options (#661) ([2be752d](https://github.com/databricks/databricks-vscode/commit/2be752d)), closes [#661](https://github.com/databricks/databricks-vscode/issues/661)
-   Treat cluster in RESIZING state as running clusters (#656) ([d19f64a](https://github.com/databricks/databricks-vscode/commit/d19f64a)), closes [#656](https://github.com/databricks/databricks-vscode/issues/656) [#618](https://github.com/databricks/databricks-vscode/issues/618)
-   Use minimum supported vscode version (from package.json) for integration tests (#626) ([ac449ac](https://github.com/databricks/databricks-vscode/commit/ac449ac)), closes [#626](https://github.com/databricks/databricks-vscode/issues/626)
-   We broke the SQLTools and Paiqo extensions (#660) ([919fd74](https://github.com/databricks/databricks-vscode/commit/919fd74)), closes [#660](https://github.com/databricks/databricks-vscode/issues/660)
-   Write .databricks.env file with the required env variables (#621) ([00d9b5e](https://github.com/databricks/databricks-vscode/commit/00d9b5e)), closes [#621](https://github.com/databricks/databricks-vscode/issues/621)

# Release: v0.3.7

## packages/databricks-vscode

## <small>0.3.7 (2023-03-21)</small>

-   Fix: (Experimental) Show only directories in sync destination quickpick.
-   Fix: (Experimental) Fix creation of .ide if it doesn't exists.
-   Fix: Fix PATH delimiter on Windows, closes [#576](https://github.com/databricks/databricks-vscode/issues/576)

# Release: v0.3.5

## packages/databricks-vscode

## <small>0.3.5 (2023-03-17)</small>

-   Fix: Fix for syncing issues with files having " ", "+" and "#" characters in the file name, closes [#555](https://github.com/databricks/databricks-vscode/issues/555) reported by [@AndreiCalin24](https://github.com/AndreiCalin24) and [#468](https://github.com/databricks/databricks-vscode/issues/468) reported by [@arturomf94](https://github.com/arturomf94)
-   Fix: Prevent relogin when project.json is updated after first login.
-   Feature: (Experimental) Add prompts to switch to repos when Files in Workspace is not supported.
-   Feature: (Experimental) Provide default sync destination if not set.
-   Feature: (Experimental) Add transparent wrapper for workflow runs when running using files in workspace.

# Release: v0.3.4

## packages/databricks-vscode

## <small>0.3.4 (2023-03-10)</small>

-   Feature: Publish the extension also to [OpenVSIX](https://open-vsx.org/extension/databricks/sqltools-databricks-driver)
-   Feature: Add support for connecting to Azure China and Azure GovCloud workspaces, closes [#526](https://github.com/databricks/databricks-vscode/issues/526)
-   Fix: Make code synchronization more robust. Sync should no longer get stuck in `IN PROGRESS` state.

# Release: v0.3.3

## packages/databricks-vscode

## <small>0.3.3 (2023-03-06)</small>

-   Feature: Add refresh button to refresh results of a Workflow run, closes [#520](https://github.com/databricks/databricks-vscode/issues/470) reported by [@virtualdvid](https://github.com/virtualdvid)
-   Feature: Add `databricks.overrideDatabricksConfigFile` VS Code setting to override the location of `.databrickscfg` file, closes [#518](https://github.com/databricks/databricks-vscode/issues/518)
-   Fix: jump-to-error links were not displayed when `Run File on Databricks` runs failed
-   Fix: sync was hanging when moving files
-   Fix: Files with certain special charecters (such as #-hash) in their names were not synced correctly.

# Release: v0.3.2

## packages/databricks-vscode

## <small>0.3.2 (2023-02-24)</small>

-   Fix: Support HTTP proxies when the proxy environment variable is lower case, closes [#476](https://github.com/databricks/databricks-vscode/issues/476) reported by [@wibbico](https://github.com/wibbico)
-   Fix: Increase timeouts to support uploading large files

# Release: v0.3.1

## packages/databricks-vscode

## <small>0.3.1 (2023-02-23)</small>

-   Feature: Add an option to silence the autocomplete dialog, closes [#497](https://github.com/databricks/databricks-vscode/issues/497)
-   Fix: Support `.databrickscfg` profiles that contain a dot, closes [#447](https://github.com/databricks/databricks-vscode/issues/447) reported by [@tahaum](https://github.com/tahaum)
-   Fix: Remove API timeout limit for execution context runs, closes [#482](https://github.com/databricks/databricks-vscode/issues/482) reported by [@sebrahimi1988](https://github.com/sebrahimi1988)
-   Fix: Show errors when parsing of host in `.databrickscfg` fails, closes [#479](https://github.com/databricks/databricks-vscode/issues/479)
-   Fix: Show error state in the UI when sync process fails
-   Minor: Rename title of the extension

# Release: v0.3.0

## packages/databricks-vscode

## 0.3.0 (2023-02-20)

-   ⚠️ Minor breaking change: This releases introduces a minor breaking change in the sync destination selection UI. The extension no longer lists Repos that have been created outside of the IDE. This prevents users from accidentally overwriting code in existing Repos. Existing sync destinations will continue to work but going forward users can only select Repos that have been created from the IDE
-   Feature: Improve code completion for `dbutils`
-   Fix: Allow creation of repos even if `/Repos/me` doesn't exist
-   Fix: Improve AAD login and prevent infinite loops when trying to use AAD

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
