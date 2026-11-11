---
name: vscode-ui-testing
description: Drive a real VS Code window running this checkout's Databricks extension through the WebdriverIO MCP server (`wdio`) — to verify a UI change, reproduce a bug, check what a view, command, notification, or webview does, or take screenshots. Use when asked to try, test, verify, demo, or screenshot extension behavior in VS Code rather than only running unit tests.
---

# Testing the extension in a real VS Code with WebdriverIO MCP

A launcher script opens VS Code with the extension under test and keeps it
running. You attach the `wdio` MCP server to that window and work it like a
user: snapshot, click, type, screenshot. A side channel (`agent:session exec`)
runs code against the VS Code API inside the same window, for setup and for
checking state the UI does not show.

How it works and why: `packages/databricks-vscode/src/test/e2e/agent-session/README.md`.

All commands run from the repo root. `$S` below means
`yarn workspace databricks run agent:session`.

## 1. Build and start

```sh
yarn workspace databricks run build        # the session loads out/, not src/
$S start                                   # prints session JSON when ready
```

-   First start downloads VS Code (~300 MB) and installs the four
    `extensionDependencies`; later starts take seconds.
-   Open a specific folder with `--workspace <dir>`. To test bundle features,
    create a scratch folder with a `databricks.yml` first — never point it at
    the repo itself.
-   `--mode vsix` tests the packaged extension instead (run
    `yarn workspace databricks run test:integ:prepare` first). Use it for
    packaging and activation-path changes; dev mode is right for everything else.
-   `--vscode-version <x.y.z>` pins the editor. Use the `engines.vscode`
    minimum from `packages/databricks-vscode/package.json` when testing
    compatibility; `stable` is the default.
-   `start` while a session is running prints the running one.
-   On macOS the test window is hidden once it is ready and focus returns to
    whatever app had it, so the user's typing and clicking can't interfere.
    Everything below still works on the hidden window. `$S show` brings it up
    (to let the user watch) and `$S hide` puts it away; `--foreground` keeps it
    visible from the start. It still appears and takes focus for a few
    seconds while it launches. On Linux there is no window to hide: run under
    Xvfb (see Troubleshooting).

## 2. Attach the MCP server

Pass the `attach` object from the start or `$S status` output to
`attach_session` unchanged, for example:

```json
{
    "sessionId": "558588d2...",
    "name": "vscode",
    "provider": "external",
    "platform": "browser",
    "browser": "chrome",
    "webdriverConfig": {
        "protocol": "http",
        "hostname": "localhost",
        "port": 63251,
        "path": "/"
    }
}
```

If `attach_session` is not listed, call `enable_tools({"groups": ["attach"]})`
first. The session ID changes on every start and restart, so re-attach after
each one.

## 3. Drive the UI

-   `snapshot` returns the accessibility tree with refs (`tab "Databricks"
[ref=e24]`). Act with refs: `click_element({"selector": "e24"})`. Refs die
    when the page changes; each action's result lists the new refs, so a fresh
    snapshot is rarely needed.
-   Keep outputs small: the full VS Code tree is large. Prefer
    `snapshot({"find": "Configuration"})` to dumping everything.
-   Command palette: `press_key({"keys": "F1"})`, then `set_value` on the
    `textbox "Type the name of a command to run."` ref with `>Databricks: ...`,
    then `press_key({"keys": "Enter"})`.
-   Quick picks and input boxes appear as a `textbox` plus `listbox`/`option`s.
-   Webviews are cross-origin iframes; the snapshot shows the exact
    `switch_frame` call to enter one. `switch_frame({})` returns to the workbench.
-   Use `get_screenshot` to check layout or to show the user a result; use
    snapshots for everything else (they are cheaper and give refs).
-   Notifications show up as `alert` / `dialog` nodes. A warning that the
    bundled CLI is a dev build is expected in a development checkout.

## 4. Use the VS Code API for setup and assertions

`exec` takes a function expression of `(vscode, ...args)`; each further
argument is JSON. It runs in the extension host and prints the JSON result.

```sh
$S exec 'async (vscode) => vscode.extensions.getExtension("databricks.databricks")?.isActive'
$S exec 'async (vscode, id) => vscode.commands.executeCommand(id)' '"databricks.quickstart.open"'
$S exec 'async (vscode) => (await vscode.commands.getCommands(true)).filter((c) => c.startsWith("databricks."))'
```

-   Use it to set up state (open a file, run a command, change a setting) and
    to confirm results the UI hides. Verify the user-visible behavior through
    the UI, not `exec`, when that is what the change is about.
-   The extension activates lazily (an empty workspace does not trigger it),
    and its commands are registered only once it is active. Activate it with
    `$S exec 'async (vscode) => vscode.extensions.getExtension("databricks.databricks").activate().then(() => "ok")'`
    or by opening the Databricks view.
-   Return plain JSON-serializable values.
-   Never print tokens, secrets, or `.databrickscfg` contents.

## 5. Iterate on a change

1. Edit code, then `yarn workspace databricks run build`.
2. `$S restart` (replays the last start options), then attach again.

Do **not** run Developer: Reload Window — in this harness it closes VS Code
and ends the session. If the window disappears, `$S status` reports no
session; run `$S start` again.

## 6. Finish

-   `close_session` in the MCP only detaches; VS Code keeps running.
-   Run `$S stop` when you are done. `$S start --fresh` resets editor state
    and reinstalls dependencies.
-   If a check is worth keeping, turn it into a `*.e2e.ts` spec under
    `packages/databricks-vscode/src/test/e2e/` (see CONTRIBUTING.md, "Running
    one end-to-end spec"); agent sessions are for exploration, not CI.

## Workspace-backed features

Auth comes from the normal Databricks config (`~/.databrickscfg`, or
`DATABRICKS_CONFIG_FILE`) inherited from the shell that ran `start`. Log in
with `databricks auth login --profile <name>` before starting, and pick the
profile through the extension's UI. Bundle deploys and runs create real
workspace resources — confirm with the user before running them, and clean up
with `databricks bundle destroy`.

## Troubleshooting

| Symptom                                          | Fix                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `start` fails with `out/extension.js is missing` | `yarn workspace databricks run build`                                                                           |
| Configuration view stuck on "Initializing..."    | Stale CLI: `yarn workspace databricks run package:cli:fetch`, then restart                                      |
| `start` exits early                              | `$S logs` → read `wdio`; the last lines name the failure                                                        |
| Extension not activating                         | Run the activate one-liner from section 4 and read the error it returns                                         |
| Dependency install fails (marketplace blocked)   | Install the four dependencies in your own VS Code once; `start --fresh` copies them from `~/.vscode/extensions` |
| `attach_session` errors with a connection error  | Session gone: `$S status`, then start again                                                                     |
| Snapshot results look summarized or truncated    | Use `snapshot({"find": ...})`                                                                                   |
| Linux without a display                          | `Xvfb :99 & export DISPLAY=:99` before `start`                                                                  |
