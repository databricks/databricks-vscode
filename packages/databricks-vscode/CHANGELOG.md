# Release: v1.0.1

## packages/databricks-vscode

## <small>1.0.1 (2023-07-10)</small>

-   [DECO-1112] Allow jupyter code lenses to parse and interpret of databricks notebooks (dbnbs) (#769) ([27ab945](https://github.com/databricks/databricks-vscode/commit/27ab945)), closes [#769](https://github.com/databricks/databricks-vscode/issues/769)
-   [DECO-1113] Add an init script for jupyter notebooks (#788) ([e5e28bb](https://github.com/databricks/databricks-vscode/commit/e5e28bb)), closes [#788](https://github.com/databricks/databricks-vscode/issues/788)
-   Block changes to config unless we are in a databricks project (#789) ([375e3d9](https://github.com/databricks/databricks-vscode/commit/375e3d9)), closes [#789](https://github.com/databricks/databricks-vscode/issues/789)
-   Handle magic commands in init script (#793) ([475215b](https://github.com/databricks/databricks-vscode/commit/475215b)), closes [#793](https://github.com/databricks/databricks-vscode/issues/793)
-   Show errors in notebook init scripts (#797) ([7f0159a](https://github.com/databricks/databricks-vscode/commit/7f0159a)), closes [#797](https://github.com/databricks/databricks-vscode/issues/797)
-   Use metadata service and SPARK_CONNECT_USER_AGENT for dbconnect and enable it by default (#802) ([87dc5a5](https://github.com/databricks/databricks-vscode/commit/87dc5a5)), closes [#802](https://github.com/databricks/databricks-vscode/issues/802)

# Release: v1.0.0

## packages/databricks-vscode

## 1.0.0 (2023-06-23)

-   Feature: Add AWS OAuth and Azure Client Secret auth. These can be used through a `.databrickscfg` profile.
-   Feature: Make cluster and workspace views experimental
-   Fix: Add current version information to `Update dbconnect` popup message
-   Fix: Set PYDEVD_WARN_SLOW_RESOLVE_TIMEOUT environment variable. This prevents timeouts when fetching dataframes using dbconnect.

# Release: v0.3.15

## packages/databricks-vscode

## <small>0.3.15 (2023-06-14)</small>

-   Feature: Make workspace the default sync destination
-   Fix: `cd` to directory of the source file when using `%sh` magic in notebooks from a workspace directory, fixes [#734](https://github.com/databricks/databricks-vscode/issues/734)
-   Fix: Wrapper notebook for notebooks in workspace directories, now includes the directory root information, enabling interactive execution in Databricks web UI.
-   Fix: `databrickcfg` profile based authentication was not working for Python SDK and DB Connect V2.
-   Fix: Kill execution if cluster is not running or sync destination is not attached instead of blocking.
-   Fix: Show sync errors in the UI.

# Release: v0.3.14

## packages/databricks-vscode

## <small>0.3.14 (2023-06-02)</small>

-   Fix: Fix error handling when repos limit is reached, fixes [#726](https://github.com/databricks/databricks-vscode/issues/726)
-   Patch: Port error handling code from GO SDK
-   Telemety: Record SDK AuthType instead of VSCode AuthType
-   Fix: Bump dependencies
-   Feature: Support all authentication methods for interactive debugging with dbconnect.
-   Fix: Improve error message to switch from repos to workspace FS.
-   Fix: Rename `bricks` cli to `databricks`
-   Telemetry: Record sync destination type
-   Fix: Properly escape calls to python so that they work with directories with spaces, fixes [#715](https://github.com/databricks/databricks-vscode/issues/715)

# Release: v0.3.13

## packages/databricks-vscode

## <small>0.3.13 (2023-05-09)</small>

-   Fix: Gracefully handle virtual /Repos/me folder, closes [#693](https://github.com/databricks/databricks-vscode/issues/693) [#683](https://github.com/databricks/databricks-vscode/issues/683) [#691](https://github.com/databricks/databricks-vscode/issues/691) [#688](https://github.com/databricks/databricks-vscode/issues/688)
-   Feature: Start sending Telemetry from the VS Code Extension.

# Release: v0.3.12

## packages/databricks-vscode

## <small>0.3.12 (2023-05-03)</small>

-   Fix: "Configure Autocompletion for Globals" was unable find type stubs, closes [#678](https://github.com/databricks/databricks-vscode/issues/678)
-   Fix: .databricks.env file would start adding multiple quotes to existing variables

# Release: v0.3.11

## packages/databricks-vscode

## <small>0.3.11 (2023-04-25)</small>

-   Feature: All customers should start seeing prompt for switching to using Workspace as sync destination.
-   Feature: Move autcompletion for globals to `__builtins__.py` from internal stubs.
-   Fix: Prepend cwd to PYTHONPATH so that local changes take precedence over installed libraries, fixes [#673](https://github.com/databricks/databricks-vscode/issues/673)

# Release: v0.3.10

## packages/databricks-vscode

## <small>0.3.10 (2023-04-20)</small>

-   Fix: Method for finding installed python packages was failing on windows.

# Release: v0.3.9

## packages/databricks-vscode

## <small>0.3.9 (2023-04-19)</small>

-   Feature: Experimental Databricks Connect V2 integration. Add `debugging.dbconnect` to `databricks.experimental.optIn` vscode workspace setting, to start using the new integration.
-   Feature: Next phase of Files in Workspace rollout. 50% of users should start seeing prompts to switch to workspace as sync destination.

# Release: v0.3.8

## packages/databricks-vscode

## <small>0.3.8 (2023-04-17)</small>

-   Feature: Add OAuth support.
-   Feature: Add Telemetry to VS Code Extension.
-   Fix: Don't sync .databricks folder even if it is not added to .gitignore, fixes [#628](https://github.com/databricks/databricks-vscode/issues/628)
-   Feature: Enable workspace folder as sync destination for some of the users. They should now see a popup to start using workspace as sync destination, if they are on clusters with `dbr 11.2` or greater.
-   Fix: Treat cluster in RESIZING state as running clusters, fixes [#618](https://github.com/databricks/databricks-vscode/issues/618)
-   Fix: Reverted changes to the exported API. This had broken some downstream projects such as [SQLTools Databricks Driver](https://github.com/databricks/sqltools-databricks-driver) and [Databricks Power Tools for VSCode](https://github.com/paiqo/Databricks-VSCode).
-   Feature: Environment files for python are now managed by the databricks extension. Added a setting `databricks.python.envFile` which overrides `python.envFile`. `python.envFile` is internally managed by the databricks extension. Users should use `databricks.python.envFile` instead.

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
