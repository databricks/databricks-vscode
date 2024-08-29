# Databricks Extension for Visual Studio Code

The Databricks extension for Visual Studio Code enables you to connect to your remote Databricks workspaces from Visual Studio Code.

> 📘 **Note**: The [User Guide](https://docs.databricks.com/dev-tools/vscode-ext.html) contains comprehesive documentation about the Databricks extension.

# Features

-   Define, deploy, and run Databricks Asset Bundles to apply CI/CD patterns to your Databricks jobs, Delta Live Tables pipelines, and MLOps Stacks.
-   Run local Python code files on Databricks clusters.
-   Run notebooks and local Python code files as Databricks jobs.
-   Set up and configure your debugging environment and Databricks Connect using a simple checklist that triggers selection dialogs.
-   Debug notebooks cell by cell with Databricks Connect.
-   Synchronize local code with code in your Databricks workspace.

## <a id="toc"></a>Table of Contents

-   [Getting Started](#setup-steps)
    -   [Create a Databricks project](#create-databricks-project)
    -   [Run Python code](#running-code)
        -   [Running Python files](#running-pyspark-code)
        -   [Running Notebooks as Workflows](#running-code-as-workflows)
        -   [Debugging and running Notebooks cell-by-cell using Databricks Connect](#running-notebook)
    -   [Deploying Databricks Asset Bundles](#dabs)
        -   [What are Databricks Asset Bundles?](#what-is-dab)
        -   [Deploying Databricks Asset Bundles](#deploy-dab)
        -   [Run a Job or Pipeline](#deploy-run-job-pipeline)
-   [Changes from v1](#changes-from-v1)
    -   [Migrate a project from Databricks extension v1 to v2](#migrate-from-v1)
    -   [What is databricks.yml?](#what-is-databricksyml)
    -   [No environment variables in terminals](#no-env-vars)

---

# <a id="setup-steps"></a>Getting Started

## <a id="create-databricks-project"></a>Create a Databricks project

1. Open the Databricks extension panel by clicking on the Databricks icon on the left sidebar.
2. Click on the "Create a new Databricks project" button.
3. Follow the selection dialogs to create a Databricks configuration profile or select an existing one.
4. Select a folder to create your project in.
5. Follow the selection dialogs to create a new Databricks project.
6. Select the newly created project to open it, using the selector that appears.
7. VS Code will reopen with the new project loaded, and the extension will automatically login using the selected profile.

![create-databricks-project](./images/dabs_vsc.gif)

If your folder has multiple [Databricks Asset Bundles](#dabs), you can select which one to use by clicking "Open Existing Databricks project" button and selecting the desired project.

## <a id="select-cluster"></a>Select a cluster

The extension uses an interactive cluster to run code. To select an interactive cluster:

1. Open the Databricks panel by clicking on the Databricks icon on the left
2. Click on the "Select Cluster" button.
    - If you wish to change the selected cluster, click on the "Configure Cluster" gear icon, next to the name of the selected cluster.

## <a id="running-code"></a>Run Python code

Once you have your project configured you can deploy your local code to the selected Databricks workspace and run it on a cluster.

### <a id="running-pyspark-code"></a>Running Python files

1. Create python file
2. Add PySpark code to the python file.
3. Click the "Databricks Run" icon in the tab bar and select "Upload and Run File on Databricks"

This will deploy the code to the selected Databricks workspace and run it on the cluster. The result is printed in the "debug" output panel.

### <a id="running-code-as-workflows"></a>Running Notebooks as a Workflow

1. Create a python file or a python based notebook
    1. You can create a python based notebook by exporting a notebook from the Databricks web application or use a notebook that is already tracked in git, such as https://github.com/databricks/notebook-best-practices
2. Click the "Databricks Run" icon in the tab bar and select "Run File as Workflow on Databricks"

This will run the file using the Jobs API on the configured cluster and render the result in a WebView.

### <a id="running-notebook"></a>Debugging and running Notebooks cell-by-cell using Databricks Connect

The extension provides easy setup for cell-by-cell running and debugging notebooks locally using Databricks Connect. For more details on how to set up Databricks Connect, refer to the [full docs](TODO::link).

## <a id="dabs"></a>Deploying Databricks Asset Bundles

### <a id="what-is-dab"></a>What are Databricks Asset Bundles?

Databricks Asset Bundles make it possible to describe Databricks resources such as jobs, pipelines, and notebooks as source files. These source files provide an end-to-end definition of a project, including how it should be structured, tested, and deployed, which makes it easier to collaborate on projects during active development. For more information, see [Databricks Asset Bundles](https://docs.databricks.com/en/dev-tools/bundles/index.html).

### <a id="deploy-dab"></a>Deploying Databricks Asset Bundles?

1. In the Databricks extension panel, find the "Bundle Resource Explorer" view.
2. Click on the "Deploy" button.
3. You can monitor the deployment status in the log output window.

### <a id="deploy-run-job-pipeline"></a>Run a Job or Pipeline

You can run a job or a pipeline managed by Databricks Asset Bundles, from the "Bundle Resource Explorer" view.

1. In the Databricks extension panel, find the "Bundle Resource Explorer" view.
2. Hover over the job or pipeline that you want to run.
3. Click on the "Run" button.

This deploys the bundle and runs the job or pipeline. You can monitor the run progress in the output terminal window. You can also open the run, job or pipeline in workspace by clicking on the "Open link externally" button.

#### Use the interactive cluster for running jobs

By default, a job is run using a jobs cluster. You can change this behavior and use the interactive cluster selected previously ([Select a cluster](#select-cluster)) to run the job.

1. In the Databricks extension panel, find the "Configuration" view.
2. Check the "Override Jobs cluster in bundle" checkbox.

# <a id="changes-from-v1"></a> Key behavior changes for users of Databricks extension v1

## <a id="migrate-from-v1"></a>Migrate a project from Databricks extension v1 to v2

If you are using Databricks extension v1, your project will automatically be migrated a [Databricks Asset Bundle](#what-is-dab) when you open it in v2. The migration process will create a new [`databricks.yml`](#what-is-databricksyml) file in the root of your project and move the configurations from the old `.databricks/project.json` to the new `databricks.yml` file.

> **Note**: This means that you will start seeing a `databricks.yml` file in your project root directory and in your version control system change logs. We recommend comitting this file to your version control system.

## <a id="what-is-databricksyml"></a>What is databricks.yml?

A `databricks.yml` file is a configuration file that describes a bundle. It contains the configuration such as the workspace host and definitions of resources such as jobs and pipelines. For more information on `databricks.yml`, refer to the [full docs](https://docs.databricks.com/en/dev-tools/bundles/index.html).

## <a id="no-env-vars"></a>No environment variables in terminals

Environment variables in terminals is no longer supported. If you were using environment variables in v1, you will need to manually load the `.databricks/.databricks.env` file in your terminal before running any commands.
