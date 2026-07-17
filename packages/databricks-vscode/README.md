# Databricks extension for Visual Studio Code

The Databricks extension for VS Code allows you to develop for the Databricks Lakehouse platform from VS Code.

The extension is available from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/itemdetails?itemName=databricks.databricks).

## Features

-   Define, deploy, and run Declarative Automation Bundles to apply CI/CD patterns to your Databricks jobs, Delta Live Tables pipelines, and MLOps Stacks.
-   Run local Python code files on Databricks clusters.
-   Run notebooks and local Python code files as Databricks jobs.
-   Set up and configure your debugging environment and Databricks Connect.
-   Debug notebooks cell by cell with Databricks Connect.
-   Synchronize local code with code in your Databricks workspace.

## Documentation

-   The [Quick Start Guide](DATABRICKS.quickstart.md) provides an overview
    of common features.
-   The [User Guide](https://docs.databricks.com/dev-tools/vscode-ext.html)
    contains comprehensive documentation about the Databricks extension.

### Corporate proxy support

If you work behind a corporate HTTP(S) proxy, the extension routes all of its
outbound traffic — authentication and OAuth flows, workspace API calls, bundle
deployment, the bundled Databricks CLI, and Databricks Connect — through your
proxy. The proxy can be configured in either of two ways:

-   **Environment variables** — `HTTPS_PROXY`, `HTTP_PROXY`, and `NO_PROXY`
    (lower-case variants are also honored). These take precedence when set.
-   **VS Code settings** — [`http.proxy`](https://code.visualstudio.com/docs/setup/network#_proxy-server-support).
    When set (and the corresponding environment variable is not), the extension
    uses it for the same traffic, so you don't have to export OS-level
    environment variables that may interfere with other tools.

`NO_PROXY` (and localhost) are respected, so the extension's internal metadata
service is never routed through the proxy.

If your proxy terminates TLS with a custom CA certificate and you see
`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` errors, set
[`http.proxyStrictSSL`](https://code.visualstudio.com/docs/setup/network#_ssl-certificates)
to `false` to disable certificate verification for proxied requests.

### Telemetry

The VSCode extension for Databricks collects anonymized telemetry about the behavior and performance of the extension. At any time, you can see the telemetry collected by this extension by running `code --telemetry` from the command line. Telemetry collection is optional and can be disabled at any time by setting the `telemetry.telemetryLevel` setting to `off`.

**Happy Coding!**
