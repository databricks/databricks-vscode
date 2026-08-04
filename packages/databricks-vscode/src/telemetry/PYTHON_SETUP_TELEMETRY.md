# Telemetry: Python environment setup attempt / result

Instrumentation for the uv-native "Set up Python environment" flow (VPEX): one
event when a setup run starts, one when it finishes. Together they measure the
funnel, where failures land across the CLI's phases, and how long provisioning
actually takes.

These events do **not** change any setup behaviour.

## Events

|                  |                                                                              |
| ---------------- | ---------------------------------------------------------------------------- |
| **Event names**  | `python_env.setup.attempt`, `python_env.setup.result`                        |
| **Defined in**   | `src/telemetry/constants.ts` (`Events.PYTHON_ENV_SETUP_ATTEMPT` / `_RESULT`) |
| **Emitted from** | `src/telemetry/pythonSetupExtensions.ts` (`recordPythonSetupAttempt`)        |
| **Called from**  | `src/python-setup/controllers/PythonSetupEnvironmentSetup.ts` (`runSetup`)   |

Transport is the shared `Telemetry` client, so properties are prefixed with
`event.`, `telemetry.telemetryLevel` opt-out is honoured, and the ambient
user/workspace envelope is attached automatically.

`recordPythonSetupAttempt` emits the attempt and **returns the reporter for that
run's result**. The pairing is therefore structural rather than a convention: an
outcome cannot be reported without an attempt having been recorded, and the
reporter is once-only — a second call is dropped, so one attempt can never
inflate into several results.

## When they fire

The attempt is recorded once the compute target is resolved and immediately
before the CLI is spawned — that is, once a run is genuinely about to happen.
Clicks that stop earlier (no project open, the visibility gate closed, or no
compute attached) record **nothing**; those are already visible as
`python_env.setup.detected` with trigger `explicit_command`.

That gives a three-stage funnel:

```
python_env.setup.detected (explicit_command)   user clicked
  └─ python_env.setup.attempt                  a run started
       └─ python_env.setup.result              how it ended
```

Overlapping clicks coalesce onto the in-flight run (the orchestrator's
re-entrancy guard), so they produce one attempt, not two.

## `python_env.setup.attempt` schema

| Field               | Type       | Notes                                                                               |
| ------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `packageManager`    | enum       | `uv \| poetry \| pip \| conda \| unknown`. Priority `uv > poetry > conda > pip`.    |
| `targetType`        | enum       | `cluster \| serverless`. **No** cluster IDs or names.                               |
| `serverlessVersion` | `string?`  | The chosen serverless environment version (e.g. `"5"`). Omitted for clusters.       |
| `mode`              | enum       | `default` (includes `databricks-connect`) \| `constraints-only`.                    |
| `isGreenfield`      | `boolean?` | Project has no `pyproject.toml`. Omitted unless `packageManager` is `uv`/`unknown`. |

### Why `isGreenfield` is conditional

A missing `pyproject.toml` only means "greenfield" for a project with no
competing manager — pip and conda users may never have one, so for them the
absence says nothing and would inflate the greenfield rate. The field is emitted
only for `uv`/`unknown` projects, which is exactly the population the visibility
gate admits (`shouldShowPythonSetup` rejects anything with a pip/poetry/conda
signal). For other managers the probe is not even performed.

### Why there is no `envKey` here

A cluster's env key is `dbr/<sparkVersion>`, derived inside the CLI from a spark
version the extension never reads. Recomputing it locally would be a second
source of truth that can drift from the CLI. The authoritative key rides the
result event instead; the two join on session.

## `python_env.setup.result` schema

| Field          | Type       | Notes                                                       |
| -------------- | ---------- | ----------------------------------------------------------- |
| `outcome`      | enum       | `ok \| failed \| cancelled \| not_started`.                 |
| `failurePhase` | enum?      | The CLI's six phases, plus `adopt` / `persist` (see below). |
| `errorCode`    | enum?      | The CLI's stable `E_*` failure class.                       |
| `envKey`       | `string?`  | e.g. `dbr/15.4.x-scala2.12`, `serverless/serverless-v5`.    |
| `diskMutated`  | `boolean?` | Whether a failed run had already modified project files.    |
| `duration`     | number     | Milliseconds, measured by the extension (see below).        |

### Outcome values

| Value         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `ok`          | CLI succeeded, venv provisioned **and** adopted as the interpreter. |
| `failed`      | CLI returned `ok:false`, **or** adoption failed after a good run.   |
| `cancelled`   | The user cancelled the progress notification.                       |
| `not_started` | Spawn/parse error — the CLI produced no result object at all.       |

`cancelled` is kept distinct from `failed` on purpose: a user abandoning a slow
setup is a signal about provisioning time, not about breakage. `not_started` is
distinct because there is no phase or error code to attribute the break to.

### The extension-side phases

Two phases are appended to the CLI's canonical six. Both cover steps that run
_after_ the CLI has already exited ok, so its own `phases` array cannot describe
them:

-   **`adopt`** — pointing the MS Python extension at the provisioned venv. A venv
    the editor never selects is unusable, so this counts as a setup failure.
-   **`persist`** — recording the drift-detection baseline and readiness. The
    environment itself works, but the extension's own state did not stick.

The success report is emitted only after both have completed, so a throw in
either is never recorded as `ok`. It is emitted _before_ the success toast,
though: `showSuccess` resolves only when the user dismisses the notification, and
folding think-time into `duration` would wreck the metric.

### `envKey` is constrained before emission

`envKey` is a runtime coordinate from a closed vocabulary, **never** a cluster id
or a user-chosen cluster name. It is validated against the CLI's two documented
shapes (`serverless/serverless-v<N>` and `dbr/<sparkVersion>`) before being
emitted; anything else collapses to `"other"`.

This matters because the key is copied out of CLI JSON that the parser
deliberately validates only minimally, and the DBR arm is a raw
`"dbr/" + sparkVersion` concatenation. Without the check, schema drift or an
unexpected runtime string could put unbounded, potentially identifying,
high-cardinality content into a field documented as categorical.

## Two ERD fields deliberately not reported

The design doc for this work asked for a duration and a merge-conflict warning
count. Neither can be taken from the CLI result as-is:

1. **Duration is measured in the extension, not read from `result.durationMs`.**
   The CLI documents that field as reserved and always emits `0`
   (`libs/localenv/result.go`: _"the pipeline does not measure wall time … so it
   is always emitted as 0"_). The extension clock starts when the attempt is
   recorded, which is also the better measurement: it is the latency the user
   experiences, including process spawn and interpreter adoption.

2. **The merge-conflict warning count is not emitted at all.** Nothing in the CLI
   ever appends to `Result.Warnings` — `NewResult()` seeds it to `[]` and only
   the text renderer reads it — and merge conflicts are not a modelled concept
   there. The field would be a permanent `0`, and a dashboard built on it would
   read "merge quality is perfect" when the truth is "unmeasured". It will be
   added once the CLI has a producer for it.

Also note `mode` is currently always `default`: the orchestrator hardcodes it
until the Quick-setup / `--constraints-only` picker ships. The field is in the
schema from the start so no migration is needed then.

## Privacy

Only categorical/enum values and a duration. No file paths, cluster names or
IDs, package names, project names, or user content. Optional fields are **omitted
when unknown** rather than sent as `undefined` — the transport would stringify
that to the literal `"undefined"` and pollute the schema.

Telemetry never costs the user their setup run: gathering the attempt's context
is wrapped so a detection/probe failure degrades to `unknown` (and an omitted
`isGreenfield`) instead of propagating into the flow.

Because every input is already in the orchestrator's local scope, an opted-out
user incurs no extra work — unlike package-manager detection, there are no
speculative disk reads to guard.

Like every event from this extension, these inherit the ambient user/workspace
envelope (`user.hashedUserName`, `user.host`, `workspaceId`, `authType`), so the
outcome is linked to a stable hashed identity.

## Suggested analysis

-   Funnel: `detected(explicit_command)` → `attempt` → `result(outcome=ok)`.
-   Failure distribution over `failurePhase` × `errorCode` — where the funnel
    breaks, without funnel tracking.
-   `duration` percentiles for `outcome=ok`, to test the ~3 min setup claim; and
    the `cancelled` rate against that distribution.
-   Greenfield vs existing-project success rates (`isGreenfield` on the attempt,
    joined to the result by session).
-   `diskMutated` on failures — how often a failed run leaves the project modified.
