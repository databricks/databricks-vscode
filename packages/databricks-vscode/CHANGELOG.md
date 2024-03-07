# Release: v2.0.1-preview

## packages/databricks-vscode

## (2024-03-07)

-   Refactor configuration UI to better support override and bundle configuration model (#940) ([b5a80a7](https://github.com/databricks/databricks-vscode/commit/b5a80a7)), closes [#940](https://github.com/databricks/databricks-vscode/issues/940)
-   Add a model for remote state (`BundleRemoteStateModel`) (#1006) ([125a2ec](https://github.com/databricks/databricks-vscode/commit/125a2ec)), closes [#1006](https://github.com/databricks/databricks-vscode/issues/1006)
-   Add a note to our quick start (#1126) ([93cbbe5](https://github.com/databricks/databricks-vscode/commit/93cbbe5)), closes [#1126](https://github.com/databricks/databricks-vscode/issues/1126)
-   Add a view for DABs resource viewer (#1002) ([b853df6](https://github.com/databricks/databricks-vscode/commit/b853df6)), closes [#1002](https://github.com/databricks/databricks-vscode/issues/1002)
-   Add bundle project manager (#1011) ([acfa61a](https://github.com/databricks/databricks-vscode/commit/acfa61a)), closes [#1011](https://github.com/databricks/databricks-vscode/issues/1011)
-   Add config level change events in `ConfigModel` (#937) ([84e2198](https://github.com/databricks/databricks-vscode/commit/84e2198)), closes [#937](https://github.com/databricks/databricks-vscode/issues/937)
-   Add DATABRICKS_CLI_UPSTREAM env var to CLI calls (#1112) ([8c60fa5](https://github.com/databricks/databricks-vscode/commit/8c60fa5)), closes [#1112](https://github.com/databricks/databricks-vscode/issues/1112)
-   Add decoration provider for decorating treeView items with modified status (#1035) ([863162f](https://github.com/databricks/databricks-vscode/commit/863162f)), closes [#1035](https://github.com/databricks/databricks-vscode/issues/1035)
-   Add e2e tests for bundle init flow (#1073) ([efa3c6b](https://github.com/databricks/databricks-vscode/commit/efa3c6b)), closes [#1073](https://github.com/databricks/databricks-vscode/issues/1073)
-   Add e2e tests for standalone running flows (#1085) ([168d69f](https://github.com/databricks/databricks-vscode/commit/168d69f)), closes [#1085](https://github.com/databricks/databricks-vscode/issues/1085)
-   Add full UI support for supported auth types loaded from profiles (#1061) ([af29a83](https://github.com/databricks/databricks-vscode/commit/af29a83)), closes [#1061](https://github.com/databricks/databricks-vscode/issues/1061)
-   Add icons for more task types (#1030) ([3682c76](https://github.com/databricks/databricks-vscode/commit/3682c76)), closes [#1030](https://github.com/databricks/databricks-vscode/issues/1030)
-   Add telemetry for bundle init flow (#1117) ([ee955d4](https://github.com/databricks/databricks-vscode/commit/ee955d4)), closes [#1117](https://github.com/databricks/databricks-vscode/issues/1117)
-   Add telemetry for the v2 (#1105) ([12f306a](https://github.com/databricks/databricks-vscode/commit/12f306a)), closes [#1105](https://github.com/databricks/databricks-vscode/issues/1105)
-   Add UI to configure PAT auth (#1033) ([2533aec](https://github.com/databricks/databricks-vscode/commit/2533aec)), closes [#1033](https://github.com/databricks/databricks-vscode/issues/1033)
-   Added functionality to deploy the current bundle (#1010) ([936fc49](https://github.com/databricks/databricks-vscode/commit/936fc49)), closes [#1010](https://github.com/databricks/databricks-vscode/issues/1010)
-   All `AuthProviders` must implement a non silent `check`. (#939) ([41f076c](https://github.com/databricks/databricks-vscode/commit/41f076c)), closes [#939](https://github.com/databricks/databricks-vscode/issues/939)
-   Allow configuring current project with minimal config (#1039) ([385d1fc](https://github.com/databricks/databricks-vscode/commit/385d1fc)), closes [#1039](https://github.com/databricks/databricks-vscode/issues/1039)
-   Allow right click -> copy for all tree items (#1101) ([ab214b4](https://github.com/databricks/databricks-vscode/commit/ab214b4)), closes [#1101](https://github.com/databricks/databricks-vscode/issues/1101)
-   Append CLI path to make sure it is picked up last (#1121) ([53debe9](https://github.com/databricks/databricks-vscode/commit/53debe9)), closes [#1121](https://github.com/databricks/databricks-vscode/issues/1121)
-   Append profile to databrickscfg instead of writing the full file (#1060) ([2af50c6](https://github.com/databricks/databricks-vscode/commit/2af50c6)), closes [#1060](https://github.com/databricks/databricks-vscode/issues/1060)
-   Automatically read auth info from override, bundle and .databrickscfg, in order (#995) ([956a9e6](https://github.com/databricks/databricks-vscode/commit/956a9e6)), closes [#995](https://github.com/databricks/databricks-vscode/issues/995)
-   Backend for reading and writing overrides for bundle config (#901) ([157fb6f](https://github.com/databricks/databricks-vscode/commit/157fb6f)), closes [#901](https://github.com/databricks/databricks-vscode/issues/901)
-   Bring missing changes from the main branch (#1093) ([e2adc6d](https://github.com/databricks/databricks-vscode/commit/e2adc6d)), closes [#1093](https://github.com/databricks/databricks-vscode/issues/1093)
-   Bump CLI to 0.215.0 (#1119) ([c121b60](https://github.com/databricks/databricks-vscode/commit/c121b60)), closes [#1119](https://github.com/databricks/databricks-vscode/issues/1119)
-   Bump databricks-cli to v0.212.3 (#1037) ([661b66f](https://github.com/databricks/databricks-vscode/commit/661b66f)), closes [#1037](https://github.com/databricks/databricks-vscode/issues/1037)
-   Bump to 2.0.0 (#1049) ([2dcf080](https://github.com/databricks/databricks-vscode/commit/2dcf080)), closes [#1049](https://github.com/databricks/databricks-vscode/issues/1049)
-   Bundle integ merge main (#1009) ([d8852bd](https://github.com/databricks/databricks-vscode/commit/d8852bd)), closes [#1009](https://github.com/databricks/databricks-vscode/issues/1009)
-   Bundle watcher (#892) ([559911c](https://github.com/databricks/databricks-vscode/commit/559911c)), closes [#892](https://github.com/databricks/databricks-vscode/issues/892)
-   Cancel run in the UI when CLI fails (#1102) ([71303b8](https://github.com/databricks/databricks-vscode/commit/71303b8)), closes [#1102](https://github.com/databricks/databricks-vscode/issues/1102)
-   Check for idle deployment state and not running (#1064) ([f2f0126](https://github.com/databricks/databricks-vscode/commit/f2f0126)), closes [#1064](https://github.com/databricks/databricks-vscode/issues/1064)
-   Create profile wizard for Azure-Cli and OAuth (U2M) auth types (#990) ([263f731](https://github.com/databricks/databricks-vscode/commit/263f731)), closes [#990](https://github.com/databricks/databricks-vscode/issues/990)
-   Deeplink to the PAT creation page in PAT profile creation wizard (#1047) ([fc9d3e7](https://github.com/databricks/databricks-vscode/commit/fc9d3e7)), closes [#1047](https://github.com/databricks/databricks-vscode/issues/1047)
-   Delete yaml from files watched by bundle autocomplete, when the yaml is deleted (#931) ([76d7d37](https://github.com/databricks/databricks-vscode/commit/76d7d37)), closes [#931](https://github.com/databricks/databricks-vscode/issues/931) [/github.com/databricks/databricks-vscode/pull/922#discussion_r1382076227](https://github.com//github.com/databricks/databricks-vscode/pull/922/issues/discussion_r1382076227)
-   Deploy and run resource (#1012) ([9dcbd87](https://github.com/databricks/databricks-vscode/commit/9dcbd87)), closes [#1012](https://github.com/databricks/databricks-vscode/issues/1012)
-   Deploy bundle before running files using remote run modes (#1019) ([a55eb15](https://github.com/databricks/databricks-vscode/commit/a55eb15)), closes [#1019](https://github.com/databricks/databricks-vscode/issues/1019)
-   Dissallow all overrides except cluster ID for dev mode and Auth Params for all modes (#972) ([837d3f2](https://github.com/databricks/databricks-vscode/commit/837d3f2)), closes [#972](https://github.com/databricks/databricks-vscode/issues/972)
-   Don't allow per file run modes in prod/staging target (#1032) ([5e44b1f](https://github.com/databricks/databricks-vscode/commit/5e44b1f)), closes [#1032](https://github.com/databricks/databricks-vscode/issues/1032)
-   Don't show deeplinks for undeployed resources (#1043) ([62a47e3](https://github.com/databricks/databricks-vscode/commit/62a47e3)), closes [#1043](https://github.com/databricks/databricks-vscode/issues/1043)
-   Expose bundle-init wizard in empty workspace (#1034) ([4f8ece7](https://github.com/databricks/databricks-vscode/commit/4f8ece7)), closes [#1034](https://github.com/databricks/databricks-vscode/issues/1034)
-   Fix "Cluster not found" error when attaching cluster on target change (#1003) ([ab4e603](https://github.com/databricks/databricks-vscode/commit/ab4e603)), closes [#1003](https://github.com/databricks/databricks-vscode/issues/1003)
-   Fix bundle-init on windows (#1058) ([626e134](https://github.com/databricks/databricks-vscode/commit/626e134)), closes [#1058](https://github.com/databricks/databricks-vscode/issues/1058)
-   Fix bundle-run, use logging env vars (#1048) ([26e03ad](https://github.com/databricks/databricks-vscode/commit/26e03ad)), closes [#1048](https://github.com/databricks/databricks-vscode/issues/1048)
-   Fix deeplinks format to work across all clouds (#1044) ([0f85446](https://github.com/databricks/databricks-vscode/commit/0f85446)), closes [#1044](https://github.com/databricks/databricks-vscode/issues/1044)
-   Fix regression where bundle logs are not displayed during deploy (#1086) ([9e05703](https://github.com/databricks/databricks-vscode/commit/9e05703)), closes [#1086](https://github.com/databricks/databricks-vscode/issues/1086)
-   Fix regression where switching targets, with the same host, does not trigger a model refresh (#1088) ([d5cfc5e](https://github.com/databricks/databricks-vscode/commit/d5cfc5e)), closes [#1088](https://github.com/databricks/databricks-vscode/issues/1088)
-   Hide authentication quickpicks when checking auth provider (#1040) ([76c33fd](https://github.com/databricks/databricks-vscode/commit/76c33fd)), closes [#1040](https://github.com/databricks/databricks-vscode/issues/1040)
-   Hide context buttons during deployment (#1062) ([927ea42](https://github.com/databricks/databricks-vscode/commit/927ea42)), closes [#1062](https://github.com/databricks/databricks-vscode/issues/1062)
-   Improve bundle init (#1041) ([3bb953e](https://github.com/databricks/databricks-vscode/commit/3bb953e)), closes [#1041](https://github.com/databricks/databricks-vscode/issues/1041)
-   Improve in-progress auth UI (#1038) ([6f6fd6f](https://github.com/databricks/databricks-vscode/commit/6f6fd6f)), closes [#1038](https://github.com/databricks/databricks-vscode/issues/1038)
-   Improve login flow, properly init cluster manager ([772d112](https://github.com/databricks/databricks-vscode/commit/772d112))
-   Improve login wizard (#1045) ([25f964f](https://github.com/databricks/databricks-vscode/commit/25f964f)), closes [#1045](https://github.com/databricks/databricks-vscode/issues/1045)
-   Improve UX for bundle init folder selection (#1026) ([0035539](https://github.com/databricks/databricks-vscode/commit/0035539)), closes [#1026](https://github.com/databricks/databricks-vscode/issues/1026)
-   Initialise -> Initialize (#1051) ([4351936](https://github.com/databricks/databricks-vscode/commit/4351936)), closes [#1051](https://github.com/databricks/databricks-vscode/issues/1051)
-   Inject env vars into python unit test debugging sessions (#1120) ([264cb54](https://github.com/databricks/databricks-vscode/commit/264cb54)), closes [#1120](https://github.com/databricks/databricks-vscode/issues/1120)
-   Limit onError usages to high level functions (#999) ([cac9604](https://github.com/databricks/databricks-vscode/commit/cac9604)), closes [#999](https://github.com/databricks/databricks-vscode/issues/999)
-   Listen to changes to "host" in databricks.yml to retrigger login (#1057) ([8471909](https://github.com/databricks/databricks-vscode/commit/8471909)), closes [#1057](https://github.com/databricks/databricks-vscode/issues/1057)
-   Make all models inherit from a common base class (#994) ([7acb093](https://github.com/databricks/databricks-vscode/commit/7acb093)), closes [#994](https://github.com/databricks/databricks-vscode/issues/994)
-   Make DABs autocomplete detect new bundle files (#922) ([f356219](https://github.com/databricks/databricks-vscode/commit/f356219)), closes [#922](https://github.com/databricks/databricks-vscode/issues/922)
-   Merge branch 'main' of github.com:databricks/databricks-vscode into bundle-integ (#991) ([3c578aa](https://github.com/databricks/databricks-vscode/commit/3c578aa)), closes [#991](https://github.com/databricks/databricks-vscode/issues/991)
-   Migrate from project.json to databricks.yml (#1013) ([ba2327d](https://github.com/databricks/databricks-vscode/commit/ba2327d)), closes [#1013](https://github.com/databricks/databricks-vscode/issues/1013)
-   Minor fixes for `configurationView` (#1031) ([9f16b58](https://github.com/databricks/databricks-vscode/commit/9f16b58)), closes [#1031](https://github.com/databricks/databricks-vscode/issues/1031)
-   Move all dbconnect run options to Databricks Run Icon (#1066) ([c28620a](https://github.com/databricks/databricks-vscode/commit/c28620a)), closes [#1066](https://github.com/databricks/databricks-vscode/issues/1066)
-   Move existing run options to new Databricks Run icon (#968) ([717c94d](https://github.com/databricks/databricks-vscode/commit/717c94d)), closes [#968](https://github.com/databricks/databricks-vscode/issues/968)
-   Move openDatabricksConfigFile to utils (#1067) ([e5f0780](https://github.com/databricks/databricks-vscode/commit/e5f0780)), closes [#1067](https://github.com/databricks/databricks-vscode/issues/1067)
-   Pass CLI path to all auth providers and login only once during bundle init (#1114) ([c6e9b0e](https://github.com/databricks/databricks-vscode/commit/c6e9b0e)), closes [#1114](https://github.com/databricks/databricks-vscode/issues/1114)
-   Prevent running resources when cli already launched but no run status (#1072) ([7412d95](https://github.com/databricks/databricks-vscode/commit/7412d95)), closes [#1072](https://github.com/databricks/databricks-vscode/issues/1072)
-   Read data from global workspace block in databaricks.yml (#1059) ([fd8ae92](https://github.com/databricks/databricks-vscode/commit/fd8ae92)), closes [#1059](https://github.com/databricks/databricks-vscode/issues/1059)
-   Redirect summarise and validate errors to bundle output panel (#1076) ([65f03ee](https://github.com/databricks/databricks-vscode/commit/65f03ee)), closes [#1076](https://github.com/databricks/databricks-vscode/issues/1076)
-   Refactor `StateStore` to make keys more explicit at the point of use. (#913) ([5b8fb23](https://github.com/databricks/databricks-vscode/commit/5b8fb23)), closes [#913](https://github.com/databricks/databricks-vscode/issues/913)
-   Refactor config loaders (#978) ([8ce4c9a](https://github.com/databricks/databricks-vscode/commit/8ce4c9a)), closes [#978](https://github.com/databricks/databricks-vscode/issues/978)
-   Remove bundle source (#1005) ([ea3ed45](https://github.com/databricks/databricks-vscode/commit/ea3ed45)), closes [#1005](https://github.com/databricks/databricks-vscode/issues/1005)
-   Remove sync destination logic (#1096) ([bb63006](https://github.com/databricks/databricks-vscode/commit/bb63006)), closes [#1096](https://github.com/databricks/databricks-vscode/issues/1096)
-   Remove unused sync code (#1087) ([83da2b5](https://github.com/databricks/databricks-vscode/commit/83da2b5)), closes [#1087](https://github.com/databricks/databricks-vscode/issues/1087)
-   Replace `JSON.stringify` based object comparisions with `lodash.isEqual` (#943) ([3d7abe3](https://github.com/databricks/databricks-vscode/commit/3d7abe3)), closes [#943](https://github.com/databricks/databricks-vscode/issues/943)
-   Return config source from `ConfigModel` (#941) ([9a32556](https://github.com/databricks/databricks-vscode/commit/9a32556)), closes [#941](https://github.com/databricks/databricks-vscode/issues/941)
-   Revert "Trigger target change on prevalidate changes, so that auth resolution happens again" (#1056) ([c4f25a2](https://github.com/databricks/databricks-vscode/commit/c4f25a2)), closes [#1056](https://github.com/databricks/databricks-vscode/issues/1056) [databricks/databricks-vscode#1055](https://github.com/databricks/databricks-vscode/issues/1055)
-   Send environment type (tests, prod) in telemetry events (#944) ([09a59a3](https://github.com/databricks/databricks-vscode/commit/09a59a3)), closes [#944](https://github.com/databricks/databricks-vscode/issues/944)
-   Set authprovider when logging out (#1042) ([5b1eb9b](https://github.com/databricks/databricks-vscode/commit/5b1eb9b)), closes [#1042](https://github.com/databricks/databricks-vscode/issues/1042)
-   Setup pre-release CI for v2 (#1109) ([5b3fbd3](https://github.com/databricks/databricks-vscode/commit/5b3fbd3)), closes [#1109](https://github.com/databricks/databricks-vscode/issues/1109)
-   Show a more actionable error message when deployment fails (#1050) ([f012ee5](https://github.com/databricks/databricks-vscode/commit/f012ee5)), closes [#1050](https://github.com/databricks/databricks-vscode/issues/1050)
-   Show deploy and run commands in terminal (#1020) ([2cb93aa](https://github.com/databricks/databricks-vscode/commit/2cb93aa)), closes [#1020](https://github.com/databricks/databricks-vscode/issues/1020)
-   Show resources in DABS Resource Explorer (#1008) ([f6dcb48](https://github.com/databricks/databricks-vscode/commit/f6dcb48)), closes [#1008](https://github.com/databricks/databricks-vscode/issues/1008)
-   Show run status for jobs and pipeline (#1017) ([ad72331](https://github.com/databricks/databricks-vscode/commit/ad72331)), closes [#1017](https://github.com/databricks/databricks-vscode/issues/1017)
-   Show t&c popup for private preview (#1128) ([d5b69e4](https://github.com/databricks/databricks-vscode/commit/d5b69e4)), closes [#1128](https://github.com/databricks/databricks-vscode/issues/1128)
-   State message tooltips (#1100) ([f0986e1](https://github.com/databricks/databricks-vscode/commit/f0986e1)), closes [#1100](https://github.com/databricks/databricks-vscode/issues/1100)
-   Take a hard dependency on redhat.vscode-yaml extension (#1127) ([f3354a7](https://github.com/databricks/databricks-vscode/commit/f3354a7)), closes [#1127](https://github.com/databricks/databricks-vscode/issues/1127)
-   Trigger target change on prevalidate changes, so that auth resolution happens again (#1055) ([6c00c17](https://github.com/databricks/databricks-vscode/commit/6c00c17)), closes [#1055](https://github.com/databricks/databricks-vscode/issues/1055)
-   Update CLI to v0.214.1 (#1099) ([ea7b079](https://github.com/databricks/databricks-vscode/commit/ea7b079)), closes [#1099](https://github.com/databricks/databricks-vscode/issues/1099)
-   Update dependencies (#974) ([1835fc2](https://github.com/databricks/databricks-vscode/commit/1835fc2)), closes [#974](https://github.com/databricks/databricks-vscode/issues/974)
-   Update JS SDK to 0.6.1 (#1053) ([847ce72](https://github.com/databricks/databricks-vscode/commit/847ce72)), closes [#1053](https://github.com/databricks/databricks-vscode/issues/1053)
-   Update login wizard and show cancel button for running resources (#1071) ([fa4013c](https://github.com/databricks/databricks-vscode/commit/fa4013c)), closes [#1071](https://github.com/databricks/databricks-vscode/issues/1071)
-   Update NOTICE.md (#1115) ([8d60383](https://github.com/databricks/databricks-vscode/commit/8d60383)), closes [#1115](https://github.com/databricks/databricks-vscode/issues/1115)
-   Use `bundle validate` to load interpolated view of configs after login (#979) ([6b2caca](https://github.com/databricks/databricks-vscode/commit/6b2caca)), closes [#979](https://github.com/databricks/databricks-vscode/issues/979)
-   Use a tree representation to structure resource explorer UI components (#1029) ([a3c5f14](https://github.com/databricks/databricks-vscode/commit/a3c5f14)), closes [#1029](https://github.com/databricks/databricks-vscode/issues/1029)
-   Use bundle for configuration and not project.json (#924) ([29474b3](https://github.com/databricks/databricks-vscode/commit/29474b3)), closes [#924](https://github.com/databricks/databricks-vscode/issues/924)
-   Use raw app insights keys for the telemetry reporter (#1116) ([18bb45b](https://github.com/databricks/databricks-vscode/commit/18bb45b)), closes [#1116](https://github.com/databricks/databricks-vscode/issues/1116)
-   Use sync icon for sync destination and make it green (#1054) ([5da4b76](https://github.com/databricks/databricks-vscode/commit/5da4b76)), closes [#1054](https://github.com/databricks/databricks-vscode/issues/1054)

# Release: v1.2.5

## packages/databricks-vscode

## <small>1.2.5 (2024-01-10)</small>

-   Explicitly clear terminal environment variables before injecting new ones.
-   Fix race conditions around setting environment variable for the metadata url.
-   Show warning when the extension doesn't have permissions to execute the CLI.
-   Store `lastInstalledExtensionVersion` in the global storage so we only show `what's new` once.
-   Update the license.
-   Update Databricks CLI to v0.211.0.
-   Fix the telemetry.

# Release: v1.2.4

## packages/databricks-vscode

## <small>1.2.4 (2023-12-05)</small>

-   Fix: set notebook directory as current directory for pip installs from workspace fs, closes [#958](https://github.com/databricks/databricks-vscode/issues/958)
-   Fix: show error for a corrupted config file
-   Feature: update Databricks CLI to v0.210.1

# Release: v1.2.3

## packages/databricks-vscode

## <small>1.2.3 (2023-11-06)</small>

-   Fix: Make configuration wizard sticky
-   Feature: Use databricks CLI log-file option to capture the logs. This deprecates the `databricks.cli.verboseMode` option.
-   Feature: Upgrade databricks cli to `v0.209.0`.

# Release: v1.2.2

## packages/databricks-vscode

## <small>1.2.2 (2023-10-23)</small>

-   Fix: 'Error 403 Token is expiring within 30 seconds.' error when authenticating to an Azure workspace using Azure CLI authentication type.

# Release: v1.2.1

## packages/databricks-vscode

## <small>1.2.1 (2023-10-18)</small>

-   Fix: Fix the "what's new" popup so that it actually shows on a version update.

# Release: v1.2.0

## packages/databricks-vscode

## 1.2.0 (2023-10-18)

-   Feature: Enable advanced notebook support by default.
-   Feature: Show 'What's New' popup on first start after upgrade to a new version.
-   Feature: Upgrade minimum supported VS Code version to 1.83.0.

# Release: v1.1.5

## packages/databricks-vscode

## <small>1.1.5 (2023-10-05)</small>

-   Fix: Path delimiter when appending cli binary path to PATH. Fixes [#885](https://github.com/databricks/databricks-vscode/issues/885)

CLI Changes

-   Fix: Infinite syncing issue when 2 files of the same name but different extensions are created.

# Release: v1.1.4

## packages/databricks-vscode

## <small>1.1.4 (2023-09-29)</small>

-   Feature: Allow custom databricks hosts. Fixes [#664](https://github.com/databricks/databricks-vscode/issues/664)
-   Feature: Append to the end of existing `SPARK_CONNECT_USER_AGENT` instead of overwritting it. Closes [#854](https://github.com/databricks/databricks-vscode/issues/854)
-   Feature: Passthrough `no_proxy` env var. Closes [#847](https://github.com/databricks/databricks-vscode/issues/847)
-   Fix: Pin DB Connect V2 version to 13.3.2.
-   Fix: Update Databricks Connect V2 setup prompts.

# Release: v1.1.3

## packages/databricks-vscode

## <small>1.1.3 (2023-09-21)</small>

-   Fix: Environment variables are always exported to the terminal irrespective of DB Connect V2 being enabled or not.
-   Fix: Invalid access mode prompt now explicitly states that it is for DB Connect V2

CLI Changes

-   Fix: Fixed a bug which was causing OAuth login flow to hang, when called from the extension.

# Release: v1.1.2

## packages/databricks-vscode

## <small>1.1.2 (2023-09-07)</small>

-   Fix: Append databricks cli path to the end of PATH. Now cli binary installed on the system takes priority over the binary packaged with the extension when running from the integrated terminal.
-   Feature: Bump databricks cli to v0.204.0
-   Fix: Export DATABRICKS_HOST env var with correct protocol (#841) ([2b62e41](https://github.com/databricks/databricks-vscode/commit/2b62e41)), fixes [#836](https://github.com/databricks/databricks-vscode/issues/836)
-   Feature(experimental): Support for %run magics and # MAGIC commands in databricks notebooks
-   Feature(experimental): Find and load environment variables configured by the extension in notebooks. These variables are required to automatically configure DB Connect V2, dbutils (from databricks python SDK) etc.

CLI Changes

-   Fix: The pattern .\* in a .gitignore file can match the root directory. Never ignore root directory when syncing. Fixes [#837](https://github.com/databricks/databricks-vscode/issues/837).

# Release: v1.1.1

## packages/databricks-vscode

## <small>1.1.1 (2023-08-03)</small>

-   Fix: Add explicit dependency on ms jupyter extension
-   Fix: Export `SPARK_REMOTE` environment variable for `profile` authentication type
-   Fix: Wsfs wrapper preamble being ignored when %pip install restarts jupyter kernel, closes [#823](https://github.com/databricks/databricks-vscode/issues/823)
-   Fix: Handle token refresh for az cli
-   Fix: Correctly handle HOME environment variable on windows[#795](https://github.com/databricks/databricks-vscode/issues/795)

# Release: v1.1.0

## packages/databricks-vscode

## 1.1.0 (2023-07-10)

-   Feature: Enable DB Connect V2 by default.
-   Experimental: Allow Jupyter code lenses to parse and interpret databricks notebooks (python files)
-   Experimental: Add an init script for Jupyter notebooks
-   Experimental: Handle magic commands in init script.
-   Experimental: Show errors in notebook init scripts
-   Fix: Block changes to VS Code configs unless we are in a Databricks project

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
