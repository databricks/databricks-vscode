# Telemetry

Events are defined in `constants.ts`: add a member to the `Events` enum and a
typed entry to `EventTypes`, where each field carries a `comment` describing it.
**That is the schema's single source of truth** — `telemetry.json` is generated
from it by `scripts/generateTelemetry.ts` (and is gitignored), so field lists are
never maintained by hand, here or anywhere else.

This file records the decisions behind the two non-obvious event families — the
reasoning that has nowhere to live in a field comment. For what each field _is_,
read `EventTypes`.

## Python package-manager detection

`python_env.setup.detected` — see [PACKAGE_MANAGER_DETECTION.md](./PACKAGE_MANAGER_DETECTION.md).

## Python environment setup (VPEX)

`python_env.setup.attempt` / `python_env.setup.result`, emitted by
`pythonSetupExtensions.ts` and called from
`python-setup/controllers/PythonSetupEnvironmentSetup.ts`.

`recordPythonSetupAttempt` emits the attempt and **returns the reporter for that
run's result**, so the 1:1 pairing is structural rather than a convention: an
outcome cannot be reported without an attempt, and the reporter is once-only.

### Why the emit half lists every field explicitly

It would be shorter to spread the caller's object. Don't. Spreading a _variable_
disables TypeScript's excess-property check, so any field later added to
`PythonSetupAttempt` / `PythonSetupOutcomeReport` — or any wider object passed
through the seam — would be emitted automatically, with objects
JSON-stringified. That was demonstrated in review: adding a field holding a
cluster ID put it on the wire with an exit-0 build. Enumerating the fields makes
the schema an allowlist the compiler enforces.

### Why `duration` is measured here, not read from the CLI

The CLI's `durationMs` is documented as reserved and always emits `0`
(`libs/localenv/result.go`). Measuring in-extension is also the better number:
it is the latency the user experiences, including process spawn and interpreter
adoption.

It is reported _before_ the success toast, because `showSuccess` resolves only
when the user dismisses the notification — folding think-time in would wreck the
metric. Everything that can fail (adoption, state persistence) happens before the
report, so a throw is never recorded as `ok`.

### Why there is no merge-conflict warning count

The design asked for one as a merge-quality proxy. Nothing in the CLI ever
appends to `Result.Warnings` — `NewResult()` seeds it to `[]` and only the text
renderer reads it — so the field would be a permanent `0`, which reads as "merge
quality is perfect" rather than "unmeasured". Tracked in DECO-27875; add the
field once there is a producer.

### Why `isGreenfield` is conditional

A missing `pyproject.toml` only means "greenfield" for a project with no
competing manager: pip and conda users may never have one. It is emitted only for
`uv`/`unknown` projects — exactly the population `shouldShowPythonSetup` admits —
and for other managers the probe is not even performed.

### Why `envKey` is pattern-checked

It is copied from CLI JSON that the parser validates only minimally, and its DBR
arm is a raw `"dbr/" + sparkVersion` concatenation. The check keeps it a closed
vocabulary; anything unrecognised collapses to `"other"`. Note the pattern
deliberately matches the spark-version grammar rather than "alphanumerics and
punctuation" — the looser form admitted cluster _names_, which are user-chosen
and routinely contain a person's name.

### Why `no_compute` has no attempt and no duration

Pressing the CTA with nothing attached is a real user-facing dead end, so it is
worth counting — but no run started, so there is no attempt to pair with and no
elapsed time (a `0` would drag the setup-time percentiles down). Exclude it when
computing a per-run success rate.

It exists because `python_env.setup.detected` does **not** cover early aborts for
this flow: its `explicit_command` trigger fires only from the _legacy_
`databricks.environment.setup` command, while the uv-native entry dispatches
`databricks.environment.setupPythonEnv`, and the config view renders the two
mutually exclusively. A user who sees this entry never emits that event.

## Python environment adoption (VPEX)

`python_env.adoption`, emitted by `pythonSetupExtensions.ts`
(`recordPythonSetupAdoption`) and driven by
`python-setup/controllers/PythonSetupAdoptionManager.ts`. A once-per-session
gauge, fired on the first `CONNECTED` transition (so the attached compute is known)
and on setup completion (to catch a project that becomes VPEX-active mid-session);
it dedupes per project root, so whichever fires first is the one reading.

### Why it is emitted only when VPEX-active

The event is recorded only for a project that has a uv-native setup on record
(`databricks.pythonSetup.setupState` is present). That gate is deliberate: the
event's mere presence is the **denominator** — one reading per session per project
that ever completed a setup — so `venvPresent` over all such events is a true
adoption rate, not a count without a base.

### Why it is separate from `python_env.drift`

Drift (from the drift detector) compares the selected compute's environment key
against the recorded one. It never checks that the `.venv` still exists: a user who
deletes the environment while compute is unchanged is not "drifted", yet has plainly
stopped using the managed env. `venvPresent` measures exactly that — whether the
managed interpreter is still on disk — which is orthogonal to drift. `venvPresent:
false` is a real value (the env is gone), not an omitted-because-unknown field.

### Why it derives no environment key

An earlier plan had this event re-derive the current compute's env key in
TypeScript to also report drift. It does not: the CLI is the authority on env keys
(resolved via a `--dry-run`), and the drift detector already emits `python_env.drift`
off that authoritative value. Re-deriving here would be a second, divergent source
of truth. This event only reports the compute _kind_ (`currentTargetType`), read
straight from the connection with no key involved.

### Known limitation: multi-root workspaces

`setupState` is a single workspace-scoped key with no per-project namespacing, so
in a multi-root workspace where one project ran setup, _every_ root reads as
VPEX-active while `venvPresent` is checked against the **active** project's `.venv`.
A never-set-up sibling root can therefore emit a spurious `venvPresent: false`. This
is the same shared-baseline limitation the drift detector carries; the correct fix
is a per-project storage schema, deferred with it. Multi-root Databricks workspaces
are uncommon, so the skew is small.

## Privacy

Only categorical/enum values and durations — no file paths, cluster names or IDs,
package names, project names, or user content. Absent optionals are **omitted**
rather than passed as `undefined`, which `recordEvent` would stringify to the
literal `"undefined"`.

Every event also inherits the ambient user/workspace envelope
(`user.hashedUserName`, `user.host`, `workspaceId`, `authType`), so payloads that
carry no identifiers still link to a stable hashed identity.

Opt-out rides the client: `recordEvent` drops events when no reporter exists, and
`@vscode/extension-telemetry` honours `telemetry.telemetryLevel`. Callers that
would do real work purely to build an event (e.g. reading project files) should
short-circuit on `isTelemetryEnabled` so an opted-out user gets no disk access
either.
