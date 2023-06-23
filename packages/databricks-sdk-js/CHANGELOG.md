# Release: v0.3.16

## packages/databricks-sdk-js

## <small>0.3.16 (2023-06-23)</small>

-   SDK: Add support for Azure client secret auth (#733) ([835f21c](https://github.com/databricks/databricks-vscode/commit/835f21c)), closes [#733](https://github.com/databricks/databricks-vscode/issues/733)
-   SDK: Remove workaround for Repos API (#777) ([ff92580](https://github.com/databricks/databricks-vscode/commit/ff92580)), closes [#777](https://github.com/databricks/databricks-vscode/issues/777)
-   Change License for the JS SDK to Apache 2.0 (#755) ([169c04c](https://github.com/databricks/databricks-vscode/commit/169c04c)), closes [#755](https://github.com/databricks/databricks-vscode/issues/755)
-   Updated time to check for cancelling listing repos from 150 to 300ms (#763) ([9631b59](https://github.com/databricks/databricks-vscode/commit/9631b59)), closes [#763](https://github.com/databricks/databricks-vscode/issues/763)

# Release: v0.3.15

## packages/databricks-sdk-js

## <small>0.3.15 (2023-06-14)</small>

-   Downgrade typescript to 5.0.0
-   Reimplement subset of fetch required for the SDK
-   Implement OAuth M2M

# Release: v0.3.14

## packages/databricks-sdk-js

## <small>0.3.14 (2023-06-02)</small>

-   SDK: Implement pagination
-   SDK: Port error handling code from GO SDK
-   Bump @types/node from 18.16.4 to 20.0.0
-   Bump dependencies
-   DB Connect Unified Auth Support
-   Rename bricks to databricks

# Release: v0.3.13

## packages/databricks-sdk-js

## <small>0.3.13 (2023-05-09)</small>

# Release: v0.3.12

## packages/databricks-sdk-js

## <small>0.3.12 (2023-05-03)</small>

# Release: v0.3.11

## packages/databricks-sdk-js

## <small>0.3.11 (2023-04-25)</small>

# Release: v0.3.10

## packages/databricks-sdk-js

## <small>0.3.10 (2023-04-20)</small>

# Release: v0.3.9

## packages/databricks-sdk-js

## <small>0.3.9 (2023-04-19)</small>

# Release: v0.3.8

## packages/databricks-sdk-js

## <small>0.3.8 (2023-04-17)</small>

-   Feature: Add detection for Unity Catalogue to Clusters service.
-   Feature: Add metadata service client and server as credential provider.
-   Feature: Add credential provider to support OAuth through Databricks CLI.
-   Feature: Use waiter to handle long running calls.

# Release: v0.3.7

## packages/databricks-sdk-js

## <small>0.3.7 (2023-03-21)</small>

-   Fix: Fix error handling for api client errors.

# Release: v0.3.5

## packages/databricks-sdk-js

## <small>0.3.5 (2023-03-17)</small>

-   Feature: Updated SDK to use latest OpenAPI spec, which adds support for SQL execution and model serving APIs.
-   Feature: Added support for file creation to Workspace service.

# Release: v0.3.4

## packages/databricks-sdk-js

## <small>0.3.4 (2023-03-10)</small>

-   Feature: Add support for authenticating against Azure China and Azure GovCloud using the `az` CLI

# Release: v0.3.3

## packages/databricks-sdk-js

## <small>0.3.3 (2023-03-06)</small>

-   Fix: Fix log redaction for objects with circular references.

# Release: v0.3.2

## packages/databricks-sdk-js

## <small>0.3.2 (2023-02-24)</small>

# Release: v0.3.1

## packages/databricks-sdk-js

## <small>0.3.1 (2023-02-23)</small>

-   Fix: Support `.databrickscfg` profiles that contain a dot, closes [#447](https://github.com/databricks/databricks-vscode/issues/447) reported by [@tahaum](https://github.com/tahaum)
-   Fix: Remove API timeout limit for execution context runs, closes [#482](https://github.com/databricks/databricks-vscode/issues/482) reported by [@sebrahimi1988](https://github.com/sebrahimi1988)
-   Fix: Show errors when parsing of host in .databrickscfg fails, closes [#479](https://github.com/databricks/databricks-vscode/issues/479)

# Release: v0.3.0

## packages/databricks-sdk-js

## 0.3.0 (2023-02-20)

# Release: v0.2.4

## packages/databricks-sdk-js

## <small>0.2.4 (2023-02-16)</small>

# Release: v0.2.3

## packages/databricks-sdk-js

## <small>0.2.3 (2023-02-15)</small>

# Release: v0.2.2

## packages/databricks-sdk-js

## <small>0.2.2 (2023-02-14)</small>

# Release: v0.2.1

## packages/databricks-sdk-js

## <small>0.2.1 (2023-02-14)</small>

# Release: v0.2.0

## packages/databricks-sdk-js

## 0.2.0 (2023-02-13)

# Release: v0.0.11

## packages/databricks-sdk-js

## <small>0.0.11 (2023-01-30)</small>

-   Feature: Add SDK support for Files in Workspace

# Release: v0.0.10

## packages/databricks-sdk-js

## <small>0.0.10 (2023-01-16)</small>

-   Feature: Add coverage for all public Databricks APIs
-   Feature: Unify configuration for authentication methods and make then compatible with the GO SDK and all future SDKs

# Release: v0.0.9

## packages/databricks-sdk-js

## <small>0.0.9 (2023-01-09)</small>

-   Update license to Databricks License

# Release: v0.0.8

## packages/databricks-sdk-js

## <small>0.0.8 (2022-12-23)</small>

-   Fix: Fix running the Azure CLI "az" on Windows

# Release: v0.0.7

## packages/databricks-sdk-js

## <small>0.0.7 (2022-12-20)</small>

-   Feature: Add support for authenticating using the Azure CLI

# Release: v0.0.6

## packages/databricks-sdk-js

## <small>0.0.6 (2022-12-05)</small>

# Release: v0.0.5

## packages/databricks-sdk-js

## <small>0.0.5 (2022-11-30)</small>

# Release: v0.0.4

## packages/databricks-sdk-js

## <small>0.0.4 (2022-11-28)</small>

-   Fix: Properly handle starting a stopping cluster

# Release: v0.0.3

## packages/databricks-sdk-js

## <small>0.0.3 (2022-11-21)</small>

-   Fix repo list pagination

# Release: v0.0.2

## packages/databricks-sdk-js

## <small>0.0.2 (2022-11-15)</small>

-   First release
