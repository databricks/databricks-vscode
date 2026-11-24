# Contributing to the Databricks extension for VS Code

Thank you for your interest in contributing! This document explains how to
report an issue, make a change, and open a pull request.

## Found an issue?

If you find a bug or have a feature request, please file an issue:
https://github.com/databricks/databricks-vscode/issues/new

When reporting a bug, please attach the extension logs as described here:
https://docs.databricks.com/en/dev-tools/vscode-ext/troubleshooting.html#send-usage-logs-to-databricks

## Making a change

- [DEVLOOP.md](DEVLOOP.md): what to install, and how to see your change in VS
  Code.
- [AGENTS.md](AGENTS.md): the commands, the checks to run before you push, and
  the rules the code follows.
- [ARCHITECTURE.md](ARCHITECTURE.md): why the layers and flows are what they
  are.
- [REVIEW.md](REVIEW.md): what reviewers check beyond what CI enforces.

## Pull requests

1. Fork the repository and create a topic branch from `release/3.x`.
2. Keep each PR focused on a single change; split unrelated fixes or
   refactors into separate PRs.
3. Run `yarn fmt`, make sure `yarn check` and `yarn test` pass, and add tests
   for new behavior.
4. Fill in the PR template — describe **what** changed and **how** it was
   tested.
5. Open your pull request against `release/3.x`. You do **not** need to sign
   anything up front — a maintainer will request the Contributor License
   Agreement during review if your change is accepted (see below).

## Contributor License Agreement

This project is licensed under the [Databricks License](LICENSE). To accept
contributions, we need to confirm that you have the right to submit your
contribution and that you grant Databricks the right to distribute it. For
projects under the Databricks License this is done through a **Contributor
License Agreement (CLA)** rather than a DCO commit sign-off.

### How the CLA process works

The CLA is handled manually by the maintainers — there is no self-service form
to sign in advance:

1. **Open your pull request** as normal. There is no need to sign anything
   before you do — just author your commits with your real name and email (git
   records these automatically).
2. **A maintainer reviews your change.** If we would like to accept it, we will
   send you the Databricks CLA and ask you, in a PR comment, to sign and return
   it.
3. **Sign the CLA** and return it as instructed, then confirm on the pull
   request.
4. **We merge** once the signed CLA is in place and the review is complete.

Notes:

- If you are contributing on behalf of a company, you may need internal
  approval to sign the CLA, and it may require signature from an officer of the
  company. Please start this process early so it doesn't block your PR.
- Once the CLA is signed it covers subsequent contributions from the same
  contributor or company — you only need to sign once.

## License

By contributing, you agree that your contributions will be licensed under the
terms of the [LICENSE](LICENSE) in this repository (the Databricks License).
