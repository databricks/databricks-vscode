# Unreleased

## packages/databricks-vscode

The first pre-release of version 3, a rewrite of the extension. These notes compare it with version 2.23.1. Your bundle projects and profiles carry over, and so do your settings, apart from the ones listed under "Changed or removed". To go back to version 2, open Databricks in the Extensions view and choose "Switch to Release Version".

### New

- A **Connection** view at the top of the Databricks sidebar shows the window's workspace connection and its Unity Gateway connection, each with its profile, host, workspace and user.
- **Unity Gateway models in VS Code Chat**, under "Databricks", once you sign in with "Databricks: Sign in to Unity Gateway". Unity Gateway has a sign-in of its own, which can be another workspace than your project's. In 2.23.1 it needs the `chat.unityGateway` experiment. It isn't available in Cursor or in a Databricks remote session.
- A **Models & AI tools** view shows how many models Unity Gateway offers, where they come from, and the AI tools, with or without a folder open. Clicking the Models row opens Chat's model picker.
- **Unified hosts** (one URL for an account and its workspaces): the sign-in wizard asks for the workspace before the browser opens, and a profile that is signed in to the account but names no workspace shows a "Select a workspace" button.
- When the window is connected to a workspace, "Create a new Databricks project" asks only for the parent folder, and the new project uses that workspace's profile.
- A successful deploy or destroy shows a notification. The deploy's notification links to the workspace. Deploy and run doesn't show one.
- The Variables group in the Project view lists an override in `vscode.bundlevars.json` for a variable the bundle doesn't declare, marked as not in the bundle.
- The Python, Python Debugger, Jupyter and YAML extensions are an extension pack: installed with Databricks, and started only when a feature needs one.
- The serverless version picker offers version 6, and recommends it when nothing in the project names a version.

### Fixed

- "Cancel run" cancels a job or pipeline run in the workspace even after the CLI has exited, and a run whose status can no longer be read says "Failed to fetch run status" instead of spinning.
- A Databricks config file the extension creates is readable only by you.
- Uploading a notebook to the Workspace file system view asks before replacing it.
- On Windows, non-ASCII text in the project's environment file and in notebooks run with `%run` reaches Python as written.
- In fish, the new-project wizard quotes the parent folder correctly: a folder name with an apostrophe or a backslash no longer breaks the command.

### Changed or removed

- Version 3 needs VS Code 1.128 or later. On an older VS Code, you stay on version 2.
- The Configuration view is now called Project. Signing in moved to the Connection view above it, and the AI tools rows to Models & AI tools. The Project view no longer has an "Auth Type" row or "Copy Auth Type": the Connection view's workspace row names the profile.
- "Databricks: Logout" is now "Databricks: Sign out".
- Before a setup has run, the "Select compute", "Set up Python environment" and "Attach a cluster" rows are no longer red. A failed setup shows red until a setup succeeds, the compute or what the setup checks changes, or the window reloads.
- When a bundle target is in another workspace than the window was on, a notice says which profile the window switched to: `Switched to <profile> to match target <target>.`
- On a unified host, the sign-in wizard no longer offers a personal access token: the CLI can't save a workspace for one there.
- The first sign-in on a machine with no profiles saves its profile without asking for a name: as the bundle target's `workspace.profile` when the target sets one and that name passes the name prompt's checks, otherwise as `DEFAULT`. The bundle target's own name is no longer used for it. The CLI uses `DEFAULT` for `databricks` commands in a terminal unless `DATABRICKS_CONFIG_PROFILE` or `DATABRICKS_HOST` is set or the config file names another default profile, so those commands now use a `DEFAULT` profile by default.
- Code run with Databricks Connect, and notebook kernels, no longer see `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`, `ARM_USE_MSI` or `GOOGLE_CREDENTIALS` from VS Code's environment, outside a Databricks remote session: the Databricks SDK there signs in with the project's profile. If your code needs them, set them in `python.envFile` and give the profile an explicit `auth_type`.
- The Bundle Resource Explorer view is now a Resources group in the Project view.
- The Bundle Variables view is now a Variables group in the Project view, with Override and Reset on its row.
- With no compute chosen for a target, runs and Databricks Connect use serverless compute, instead of asking for one. Detaching a cluster keeps the target without compute. "Upload and Run File" needs a cluster, so it's hidden until one is attached.
- The SSH Tunnel view is above Project when no bundle target is set, and below Project when one is.
- The AI tools install picker lists only the coding agents it can install for the chosen scope. Agents that aren't detected, or don't support project scope, aren't listed as disabled rows.
- The SSH Tunnel view starts collapsed. The Documentation view is gone: its guides are in the Quick Start walkthrough, and the bundles guide is also linked from the Project view when no folder is open.
- The `databricks.logs.*` settings are gone. Set the level of the "Databricks Logs" output with "Developer: Set Log Level...".
- The `databricks.bundle.remoteStateRefreshInterval` setting, which had no effect, is gone.
- The Quick Start guide is a walkthrough, "Get started with Databricks", which VS Code opens on install, instead of a Markdown page.
- Migrating a `project.json` project to a bundle is no longer offered. To migrate one, open it with version 2.23 first.
- The "Databricks Connect enabled" or "disabled" status bar item is gone. The Python environment rows in the Project view show the same state.
