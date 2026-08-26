# python-setup

Frictionless, uv-native "set up Python environment" feature: a thin wrapper over
the `databricks environments setup-local` CLI command that matches the local
Python environment to the selected Databricks compute.

## "Report this problem" affordance

A setup-local failure that gets *past* the pre-flight checks usually indicates a
defect we own — a bad published constraint or an extension/CLI bug — not
something the user can fix. Those failures surface a "Report this problem" button
that deep-links a pre-filled GitHub new-issue form, routed by error code to the
repository that owns the defect (`databricks/environments` for constraint-content
defects, `databricks/databricks-vscode` for extension/CLI defects). Pre-flight,
local, and network codes are deliberately excluded — they stay actionable from
the mapped message alone (see `reportSetupIssue.ts` for the closed routing list).

**Privacy posture.** The issue body carries only build metadata (error code,
phase, env key, package manager, extension/CLI versions, OS) plus the CLI's
stderr. The stderr is scrubbed of usernames, home paths, tokens, and emails
before it goes into the URL — but that scrub is *defence-in-depth*, not the sole
guard: a deep-link only pre-fills the form, which the user reviews and submits
themselves. Nothing is sent automatically.
