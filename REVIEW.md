# REVIEW.md

What to check in a pull request beyond what CI enforces. How to review
(preparation, severities, comment format) is in `.agents/skills/pr-review/SKILL.md`.
The rules are in `AGENTS.md`, `packages/databricks-vscode/AGENTS.md` and
`ARCHITECTURE.md`, and where this file disagrees with them, they win. Paths
without a package prefix are in `packages/databricks-vscode/src/`.

## Hosts: local and session windows

The extension runs in two hosts (`ARCHITECTURE.md`, "Hosts"): a local window,
and a session window whose extension host runs on Databricks compute through
the CLI's SSH tunnel. A change that works locally can break the session
window, or leak between the two. `test/contract/hosts.test.ts` checks that
every contributed command and view declares its session behaviour, and that
the when-clauses hide what a session lacks; it can't check that a
declaration is true.

### Blockers

- A feature that tests a capability as a stand-in for "is this a session",
  for something the capability isn't about. Read the capability the
  behaviour depends on, and add one to `capabilitiesOf` (`kernel/host/`) if
  none fits, with its reason.
- A command or view declared `same` or `adapted` that depends on something
  only the laptop has:
    - profiles or `~/.databrickscfg`, `databricks auth login`, a browser
      callback on `localhost`;
    - Remote-SSH, the `code` or `cursor` command, the laptop's SSH config;
    - an `os.homedir()` path shown to the user, or `openExternal` on a `file:`
      URI.
- Anything that can send the session token to another workspace:
    - a bundle CLI call whose `childEnv` options don't name its project and
      target (`bundle: {root, target}`), so the target guard doesn't see it;
    - an SDK client built for another host;
    - a request meant to be credential-free that goes through
      `connection.api`, which attaches the token;
    - trusting what a host outside Databricks' domains says about itself.

### Should-fix

- New persisted state without an answer to "which host writes it, and which
  reads it?":
    - Mementos (`globalState`, `workspaceState`) live on the laptop, shared by
      both hosts and by every installed version;
    - files under `globalStoragePath` and `logPath` live on the host, and are
      lost when a serverless session ends.
- A stored value whose name or type changes. Two versions of the extension can
  run at once (a laptop on one version, a fresh session on another), sharing
  the same Mementos.
- A feature change without a test under a session host (`fakeKernel({host})`
  with a host from `test-support/sessionEnv.ts`).
- A session flow that touches the interpreter, packages, the OS user or the CPU
  architecture, when the PR doesn't say whether it was tried on both computes:
    - serverless: aarch64, non-root, with Databricks Connect installed;
    - a dedicated cluster: x86, root, without Databricks Connect.
- An `unavailable` entry whose `instead` doesn't tell the user what to do.

### Questions worth asking

- In a session, which compute does this use: the session's own
  (`kernel.compute.session`), or the one the target names?
- Where does the user see the result? In a session, output, files and logs are
  on the compute.

## Verification

A change to session behaviour runs `yarn check` and `yarn test`. Before a
release, a person also tries it in a real session window, on serverless and on
a dedicated cluster: `remote_mode.next.ucws.e2e.ts` only simulates a session,
and the opt-in `ssh_connection.ucws` spec needs Serverless SSH compute
(`AGENTS.md`, "What you cannot run unattended"). `yarn preview:remote-vsix`
installs the change in an open session window (`DEVLOOP.md`).
