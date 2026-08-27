# python-setup

Frictionless, uv-native "set up Python environment" feature: a thin wrapper over
the `databricks environments setup-local` CLI command that matches the local
Python environment to the selected Databricks compute.

## "Report this problem" affordance

A setup-local failure that gets _past_ the pre-flight checks usually indicates a
defect we own — a bad published constraint or an extension/CLI bug — not
something the user can fix. Those failures surface a "Report this problem" button
that deep-links a pre-filled GitHub new-issue form, routed by error code to the
repository that owns the defect (`databricks/environments` for constraint-content
defects, `databricks/databricks-vscode` for extension/CLI defects). Pre-flight,
local, and network codes are deliberately excluded — they stay actionable from
the mapped message alone (see `reportSetupIssue.ts` for the closed routing list).

`E_PROVISION` (a uv resolution conflict) is intentionally _not_ a report button:
such a conflict is usually the user's own declared dependencies. When the
published constraints are what conflict, that genuine case is served by a soft,
conditional pointer in the output log instead (see `formatSetupFailureDetail`).

**Privacy posture.** The issue body carries build metadata (error code, phase,
env key, package manager, extension/CLI versions, OS) plus the CLI's stderr. The
stderr is scrubbed on a best-effort basis — usernames, home paths, tokens
(Databricks PATs, GitHub/AWS keys, JWTs, bearer credentials), URL credentials,
and emails — to _reduce, not eliminate,_ PII exposure. That scrub is
defence-in-depth, not the sole guard: a deep-link only pre-fills the form, which
the user reviews and submits themselves. Nothing is sent automatically.

The `pyproject.toml` is the crux for merge/resolution failures but is **not**
auto-collected (it can carry private dependencies); the body instead includes a
placeholder asking the reporter to paste a redacted copy. The body carries no
`#` markdown headings on purpose — a `#` in the deep-link's query is
double-encoded before the browser and renders as `%23`.
