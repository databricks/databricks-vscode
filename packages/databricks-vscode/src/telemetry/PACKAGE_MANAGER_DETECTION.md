# Telemetry: Python package-manager detection

Measurement-only instrumentation that records which Python package/environment
manager(s) a project uses, so we can size the **real** distribution of
pip / conda / uv / poetry usage across Databricks VS Code users and prioritize
the VPEX setup-flow investment with first-party data instead of public-survey
estimates.

This event does **not** change any setup behaviour. It is detection only.

## Event

|                     |                                                                   |
| ------------------- | ----------------------------------------------------------------- |
| **Event name**      | `python_env.setup.detected`                                       |
| **Defined in**      | `src/telemetry/constants.ts` (`Events.PYTHON_ENV_SETUP_DETECTED`) |
| **Emitted from**    | `src/language/PackageManagerTelemetry.ts` (`emitDetection`)       |
| **Detection logic** | `src/language/packageManagerDetection.ts` (pure, unit-tested)     |

Telemetry is transported via the existing `Telemetry` client
(`@vscode/extension-telemetry`). As with every event, properties are prefixed
with `event.` and the user's `telemetry.telemetryLevel` opt-out is honoured by
the client — nothing is emitted when telemetry is disabled. Standard context
(extension/telemetry schema version, OS, hashed/anonymized user metadata) is
attached automatically by the client and is **not** part of this event's own
schema.

## Schema (the `event.*` fields)

| Field               | Type       | Notes                                                                                                                                  |
| ------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `managersDetected`  | `string[]` | All managers with a firing signal, e.g. `["uv","pip"]`. Subset of `uv \| poetry \| pip \| conda`. JSON-stringified by the transport.   |
| `primaryManager`    | enum       | `uv \| poetry \| pip \| conda \| unknown`. Priority when several apply: **uv > poetry > conda > pip**. `unknown` when no signal fires. |
| `signals`           | `string[]` | Closed set of signal ids that fired (see below). JSON-stringified by the transport.                                                    |
| `pythonVersion`     | `string?`  | Interpreter version, **major.minor only** (e.g. `"3.11"`). Omitted if unknown.                                                         |
| `interpreterSource` | enum       | `uv \| poetry \| conda \| system \| venv \| unknown`. How the active interpreter was provisioned (`poetry` kept distinct from `venv`). |
| `hasLockfile`       | `boolean`  | True if `uv.lock` or `poetry.lock` was found.                                                                                          |
| `targetCompute`     | enum       | `cluster \| serverless \| none`. **No** cluster IDs/names.                                                                             |
| `setupTrigger`      | enum       | `auto_open \| explicit_command \| run \| debug`. Which touchpoint fired it.                                                            |

### `signals` value domain (closed set)

`uv.lock`, `pyproject.tool.uv`, `uv.onPath`, `interpreter.uv`, `poetry.lock`,
`pyproject.tool.poetry`, `poetry.onPath`, `interpreter.poetry`,
`requirements.txt`, `constraints.txt`, `pyproject.pipOnly`, `interpreter.venv`,
`environment.yml`, `conda.prefix`, `interpreter.conda`.

> `*.onPath` are **weak** signals: they record that a tool is installed, but do
> not by themselves attribute the project to that manager. Attribution requires
> a project-local marker (lockfile, `pyproject` section, or interpreter source).
> They are part of the closed set the classifier accepts, but are **not emitted
> in practice**: the collector does not probe PATH (running an external `uv`/
> `poetry` binary purely for a non-attributing signal is not worth the cost), so
> `uv.onPath` / `poetry.onPath` will not appear in real data unless a future
> collector populates them.

## Where it fires

1. **`auto_open`** — first environment check, emitted once the workspace
   connects (`EnvironmentDependenciesVerifier.check`, after `waitForConnect`).
2. **`explicit_command`** — the "set up environment" command
   (`databricks.environment.setup` → `EnvironmentCommands.setup`).
3. **`run` / `debug`** — first Run/Debug with Databricks Connect
   (`RunCommands.runFileUsingDbconnect` / `debugFileUsingDbconnect`).

**Connected only.** Detection is emitted exclusively while the extension is
connected to a Databricks workspace (`ConnectionManager.state === "CONNECTED"`);
nothing is reported for unauthenticated sessions, so the data describes active
users' projects rather than installs that never authenticate. As a result every
event carries user/workspace metadata (host, workspace id, auth type), and
`target_compute` reflects the connected compute (it may still be `none` when a
workspace is connected but no cluster/serverless compute is attached yet).

Emissions are **deduplicated per session** on `(setupTrigger, projectRoot)`, so
a single project open does not inflate counts. The same project can still emit
once per distinct trigger (e.g. one `auto_open` and one `run`).

## Privacy

Only categorical/enum data and the closed-set signal ids are emitted. No file
paths, package names, project names, cluster names, or usernames. Detection is
best-effort and non-blocking: any failure degrades to `unknown` and is
swallowed, never thrown into the setup/run flow. Nothing is collected (not even
disk reads) when the user's telemetry level is below `all`.

Note that, like every event from this extension, each detection inherits the
ambient user/workspace envelope attached by the telemetry client —
`user.hashedUserName` (bcrypt hash), `user.host`, `workspaceId`, `authType`. So
while the detection payload itself carries no identifiers, an emitted event does
link the detected toolchain to a stable (hashed) user/workspace identity.

## Known measurement caveats

-   **`pyproject.pipOnly` slightly over-counts pip / under-counts uv.** uv works
    with a bare `[project]` table and no `[tool.uv]` section, so a uv project
    without a committed `uv.lock` is classified as pip. With `uv.lock` present
    uv still fires and wins primary, so the skew is limited to lockfile-less uv
    projects.
-   `interpreterSource` reflects the active interpreter only; a project that
    declares uv/poetry but runs a system/conda interpreter reports that real
    source (this is intentional — it surfaces the setup-flow gap).

## Suggested analysis

-   Share of projects by `primaryManager`.
-   Co-occurrence from `managersDetected` (e.g. uv+pip, conda+pip, poetry+uv).
-   `hasLockfile` and `pythonVersion` distributions to inform per-manager flow
    depth.

Dedupe at analysis time on the anonymized session id + `projectRoot` is not
possible (no path is sent); rely on the in-session dedupe above and treat each
event as one `(session, trigger)` observation.
