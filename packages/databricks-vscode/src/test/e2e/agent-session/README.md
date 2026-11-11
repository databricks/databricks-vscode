# Agent sessions

A long-lived VS Code window running the extension under test, for an MCP
client (the [WebdriverIO MCP server][mcp]) to drive. This is for interactive
exploration by agents or people. It is not a test suite and CI doesn't run it.
Usage lives in the `vscode-ui-testing` skill (`.claude/skills/`).

```
scripts/agent-session.mjs ──spawns──▶ wdio (this config) ──▶ chromedriver ──▶ VS Code
        │  exec: requests/*.json            holdSession.ts       ▲
        └──────── responses/*.json ◀──── executeWorkbench        │ attach_session
                                                          @wdio/mcp (in the agent)
```

## Why it's built this way

-   **The editor is started here, not by the MCP server, and the MCP server attaches to it.** `@wdio/mcp`
    has no VS Code mode. Starting VS Code yourself means matching chromedriver
    to VS Code's Electron, passing the development-extension flags, isolating
    user data, and injecting the API proxy. [`wdio-vscode-service`][svc]
    already does all of that, so we let it start the session and give
    `attach_session` the WebDriver endpoint and session ID.
-   **It runs as a test runner, not as a standalone `remote()` call.** The
    service only works through the test runner's launcher and worker hooks.
    `holdSession.ts` is a "spec" that keeps the session open until it's told to
    stop.
-   **`exec` passes requests through files, not a socket.** It runs arbitrary
    code in an extension host that has full Node access. A localhost listener
    would hand that to any local process. File permissions keep it to the user
    who started the session.
-   **User data lives in a short temp path.** VS Code puts its IPC socket under
    the user data dir, and macOS limits socket paths to 104 bytes. Under
    `packages/databricks-vscode/tmp/` the path is too long, and VS Code fails
    with `listen EINVAL`.
-   **On macOS the window is hidden, not headless.** VS Code can't run without
    a window (Chromium's `--headless` doesn't apply to an Electron
    workbench), and chromedriver can't move Electron windows. WebDriver input
    is synthesized inside the renderer rather than sent through the OS,
    though, so a hidden (Cmd+H) window still takes clicks and keys and
    renders screenshots. `start` hides it through System Events and gives focus back to the
    previous app. The editor never has OS focus as a result, which is how a
    background window behaves anyway. For true headless, use Linux with Xvfb, as CI does.
-   **Reload Window ends the session.** The service starts VS Code in
    extension-test mode, where the editor exits when the extension host goes
    away. `restart` is how a rebuilt extension gets loaded.
-   **Dependencies are copied locally when possible.** The four
    `extensionDependencies` come from, in order: the session's earlier install,
    a vendored VSIX in `EXTENSION_VSIX_DIR` (as in CI), the developer's own
    `~/.vscode/extensions`, and only then the marketplace. Agent sandboxes and
    locked-down networks often block the marketplace.
-   **`WDIO_LOG_LEVEL=silent` in `.mcp.json`.** When `@wdio/mcp` attaches, it
    writes WebdriverIO's log lines to stdout. Stdout is the MCP stdio channel,
    so the logs corrupt it.
-   **Telemetry goes to the dev key.** The session sets `EXTENSION_DEVELOPMENT`
    and `DATABRICKS_VSCODE_INTEGRATION_TEST`, so exploratory clicks don't land
    in production telemetry, and the stale-CLI check runs as it does under F5.
-   **The VS Code download cache is shared.** Builds are immutable for each
    version, so `~/.cache/databricks-vscode/wdio` serves every checkout and
    worktree. Session state stays per checkout.

[mcp]: https://webdriver.io/docs/mcp
[svc]: https://webdriver.io/docs/wdio-vscode-service
