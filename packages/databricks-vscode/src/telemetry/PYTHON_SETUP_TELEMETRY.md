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

Clicks that stop earlier fall into two groups:

-   **No compute attached** (or a serverless session with no chosen version) — the
    CTA is a visible dead end, so this reports a lone
    `python_env.setup.result` with `outcome: "no_compute"` and no attempt.
-   **No project open, or the visibility gate closed** — records nothing. Neither
    is a dead end: with no project there is nothing to set up, and a closed gate
    means the entry was never shown in the first place.

```
python_env.setup.attempt                a run started
  └─ python_env.setup.result            how it ended
python_env.setup.result(no_compute)     the CTA dead-ended, no run
```

Note that `python_env.setup.detected` does **not** provide a top-of-funnel stage
for this flow. Its `explicit_command` trigger fires only from the _legacy_
`databricks.environment.setup` command, whereas the uv-native entry dispatches
`databricks.environment.setupPythonEnv` — and the config view renders the two
mutually exclusively, so a user who sees this entry never emits that event. Any
click-through analysis has to start from `attempt` plus the `no_compute` result.

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

| Field          | Type       | Notes                                                             |
| -------------- | ---------- | ----------------------------------------------------------------- |
| `outcome`      | enum       | `ok \| failed \| cancelled \| not_started \| no_compute`.         |
| `failurePhase` | enum?      | The CLI's six phases, plus `adopt` / `persist` (see below).       |
| `errorCode`    | enum?      | The CLI's stable `E_*` failure class.                             |
| `envKey`       | `string?`  | e.g. `dbr/15.4.x-scala2.12`, `serverless/serverless-v5`.          |
| `diskMutated`  | `boolean?` | Whether a failed run had already modified project files.          |
| `duration`     | `number?`  | Milliseconds, measured by the extension. Absent for `no_compute`. |

### Outcome values

| Value         | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `ok`          | CLI succeeded, venv provisioned **and** adopted as the interpreter. |
| `failed`      | CLI returned `ok:false`, **or** adoption failed after a good run.   |
| `cancelled`   | The user cancelled the progress notification.                       |
| `not_started` | Spawn/parse error — the CLI produced no result object at all.       |
| `no_compute`  | The CTA dead-ended: nothing was attached to set up for.             |

`cancelled` is kept distinct from `failed` on purpose: a user abandoning a slow
setup is a signal about provisioning time, not about breakage. `not_started` is
distinct because there is no phase or error code to attribute the break to.

`no_compute` is the one outcome emitted **without** a preceding attempt, and the
only one with no `duration` — nothing ran, and a 0 ms value would drag the
setup-time percentiles down. Exclude it when computing a per-run success rate.

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

The emit half names every field explicitly instead of spreading the caller's
object. This is load-bearing, not style: spreading a _variable_ disables
TypeScript's excess-property check, so any field later added to
`PythonSetupAttempt` / `PythonSetupOutcomeReport` — or any wider object passed
through the seam — would be emitted automatically (with objects
JSON-stringified), on a clean build. Enumerating the fields makes the schema an
allowlist the compiler enforces, so this document's privacy claim cannot silently
go stale.

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
