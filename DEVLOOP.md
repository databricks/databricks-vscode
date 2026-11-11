# Dev loop: seeing your changes

How to run this checkout's extension and see a change in VS Code: in a local
window, in a simulated session window, and in a real session window on
Databricks compute. For the checks before you push, see "Before you finish"
in `AGENTS.md`.

## Before you start

- Node 24 (`nvm use`; the repo has an `.nvmrc`). On Node 26, `yarn check` fails
  for reasons unrelated to your change.
- `yarn install` once, and after pulling a change to `yarn.lock`.
- VS Code with its `code` command on your `PATH` (on macOS: "Shell Command:
  Install 'code' command in PATH").
- The extension pack's members installed in your own VS Code: Python, Python
  Debugger, Jupyter and YAML. The sandboxes copy them from
  `~/.vscode/extensions`, so they don't need the Marketplace.

## Which one

| You want to see                                     | Run                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| a change in a local window                          | `yarn preview`                                                                  |
| the same, with the debugger                         | F5 on "Run and Watch Extension"                                                 |
| a change in remote mode, without compute            | `yarn preview --session <serverless \| cluster-id> --profile <p>`               |
| a change in remote mode, on real Databricks compute | `yarn preview:remote-vsix --session <serverless \| cluster-id> [--profile <p>]` |

## Local changes: `yarn preview`

```sh
yarn preview                                  # a window without a folder
yarn preview --project --profile <p>          # with a sample bundle project
yarn preview --folder ~/code/my-bundle        # with a folder of yours
```

It builds the extension, then opens it in a VS Code of its own: a sandbox
with its own user data, extensions and Databricks config file. Your own VS
Code, its settings and `~/.databrickscfg` stay as they are. Each sandbox has
its own window title and colour, so several can be open side by side.

**The loop.** Edit, run `yarn build`, then "Developer: Reload Window" in the
sandbox window. The sandbox loads the extension straight from
`packages/databricks-vscode/dist`, so there is nothing to install.

**Flags.**

| Flag                | What it does                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--project`         | Opens the sandbox's own project, made once with `databricks bundle init default-python`. Needs `--profile`: the template asks the workspace for your user name. |
| `--folder <dir>`    | Opens that folder instead.                                                                                                                                      |
| `--profile <name>`  | Copies that profile of `~/.databrickscfg` into the sandbox's config file, without its secrets. An OAuth (`databricks-cli`) profile shares the CLI's sign-in.    |
| `--name <name>`     | Names the sandbox; by default it's the branch, so each worktree has its own. VS Code's socket path limits it to about 20 characters.                            |
| `--fresh`           | Deletes the sandbox first: a first run, as a new user sees it.                                                                                                  |
| `--no-build`        | Skips `yarn build` and fetching the CLI.                                                                                                                        |
| `--with-ssh`        | Copies your Remote - SSH extension into the sandbox, for "Start SSH tunnel".                                                                                    |
| `--extension <id>`  | Copies another of your extensions into the sandbox; repeatable.                                                                                                 |
| `--color <#rrggbb>` | Another colour for the window.                                                                                                                                  |

Sandboxes live in `~/.cache/databricks-vscode-preview/<name>` and outlive the
window: sign-ins, settings and the project stay for the next run.

**With the debugger.** Open `databricks-vscode.code-workspace` in VS Code and
press F5 on "Run and Watch Extension". It runs a watch build and opens an
Extension Development Host with the debugger attached. It also works over
Remote-SSH, where `yarn preview` can't open a window.

## Remote mode without compute: `yarn preview --session`

```sh
yarn preview --session serverless --profile <p>
yarn preview --session <cluster-id> --profile <p>
```

A session window is a VS Code window whose extension host runs on Databricks
compute, opened by "Start SSH tunnel". This opens a local sandbox that plays
one: the extension gets the environment the SSH tunnel would set, signed in
to that profile's workspace. It's quick and costs nothing, but it runs on your
machine, so the compute's files, Python and CPU aren't there.

The sandbox is `<branch>-session`, next to the branch's own. Rebuild and
reload as for `yarn preview`. With an OAuth profile the session gets a token
that lives about an hour; then close the window and run the command again.

## Remote mode on real compute: `yarn preview:remote-vsix`

A real session window runs the Databricks extension from the Marketplace.
This command replaces it with your build.

1. **Open a session window.** In VS Code, run "Databricks: Start SSH tunnel"
   and pick the compute, or from a terminal:

    ```sh
    databricks ssh connect --ide vscode --profile <p>                      # serverless
    databricks ssh connect --ide vscode --profile <p> --cluster <id>       # a dedicated cluster
    ```

    Leave the window open: the command installs through it.

2. **Install your build there**, from this checkout:

    ```sh
    yarn preview:remote-vsix --session serverless --profile <p>
    yarn preview:remote-vsix --session <cluster-id>
    ```

    For serverless, use the profile the tunnel was started with. It builds a
    VSIX for the compute's CPU and installs it on the compute as
    `databricks.databricks` 3.999.0-dev, in place of the Marketplace's 2.x.

3. **Reload.** In the session window, run "Developer: Reload Window".

To check it worked, the Extensions view shows Databricks 3.999.0-dev under
"SSH: <host>", and the Connection view has a "Session compute" row.

**The loop.** After each change, run step 2 again, then reload. It takes about
a minute.

**Good to know.**

- **"Cannot change enablement of YAML extension because of its extension
  kind".** You disabled `databricks.databricks` at some point, which disables
  the build too, as it has that ID. Enable Databricks in a **local** window,
  then reload the session window; enabling it in the session window fails.
- **"There is no SSH host …".** The session window isn't open. Or the
  session was started with `--name`, `--accelerator` or `--base-environment`:
  pass `--ssh-host <name>`, one of the names in
  `~/.databricks/ssh-tunnel-configs/`.
- **"dist/ has output that no source in src/ compiles to".** You switched
  branches. Delete `packages/databricks-vscode/dist` and
  `packages/databricks-vscode/tsconfig.tsbuildinfo`, then run the command again.
- **A serverless session starts over** after it stops, with a new home folder
  and the Marketplace extension. Run step 2 again.
- **To go back to 2.x**, uninstall Databricks in the session window and reload.
- The session signs in with a token it can't renew. When it expires, start the
  tunnel again.

The options are at the top of `scripts/sessionVsix.mjs`.
