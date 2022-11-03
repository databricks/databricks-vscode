# Databricks Extension for VSCode

The Databricks extension for VSCode allows you to develop for the Databricks Lakehouse platform from VSCode.

# Features

-   Synchronize code to a Databricks workspace
-   Run Python files on a Databricks cluster
-   Run notebooks and Python files as Jobs

---

# <a id="setup-steps"></a>Getting Started

## Configure Extension

1. Open the Databricks panel by clicking on the Databricks icon on the left
2. Click the "Configure Databricks" button
3. Follow the wizard to select or configure a CLI profile
4. Click the "plug" icon in the clusters tree item to select an interactive cluster for running code on (you might have to create a cluster in the web UI first if none is available)
5. Click the "plug" icon in the Repo tree item to select an repo to sync code to (you might have to create a repo in the web UI first if none is available. The repo doesn't need to have a git remote configured.)

![configure](./images/configure.gif)

## Running Code

Once you have your project configured you can sync your local code to the repo and run it on a cluster.

### Running PySpark code

1. Create python file
2. Click the "Run" icon in the tab bar and select "Run File on Databricks"

This will run the active python file on a cluster using the command execution API. The result is printed in the "debug" output panel.

![configure](./images/run.gif)

### Running PySpark and notebooks as a Workflow

1. Create a python file or a python based notebook
2. Click the "Run" icon in the tab bar and select "Run File as Workflow on Databricks"

This will run the file using the Jobs API on a cluster and render the result in a WebView.

### Running using custom run configurations

Both ways of running code on a cluster are also available in custom run configurations. In the "Run and Debug" panel you can click "Add configuration..." and select either "Databricks: Launch" or "Databricks: Launch as Workflow". Using run configuration you can also pass in command line arguments and run your code by simply pressing `F5`.

![configure](./images/custom-runner.gif)
