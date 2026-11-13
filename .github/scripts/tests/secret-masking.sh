#!/usr/bin/env bash
# Regression test for the JFrog token masking fix (commit b4cec4ee).
#
# Every secret that a credential script writes to $GITHUB_ENV, $GITHUB_OUTPUT
# or an rc file must first be announced with "::add-mask::<value>" on stdout.
# Otherwise the value ends up in public Actions logs.
#
# The test runs the scripts the way unit-tests.yml does: one job, several
# steps, a shared job log, and $GITHUB_ENV loaded into later steps. curl is
# stubbed and every credential is fake, so nothing touches the network.
#
# Ordering is checked live. A DEBUG trap (loaded through BASH_ENV) runs before
# every command a step executes. It records a violation if a secret is already
# in a sink without a matching ::add-mask:: line earlier in the job log. That
# catches the mask being removed, or moved after the export.
#
# Usage: bash .github/scripts/tests/secret-masking.sh
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$(cd "$TESTS_DIR/.." && pwd)"

FAKE_JFROG_TOKEN="fake-jfrog-access-token-0000"
FAKE_ID_TOKEN="fake-github-oidc-id-token-0000"
export FAKE_JFROG_TOKEN FAKE_ID_TOKEN

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Stub curl: fake GitHub OIDC token and fake JFrog token exchange.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/curl" << 'EOF'
#!/usr/bin/env bash
case "$*" in
  *"audience="*) echo "{\"value\": \"${FAKE_ID_TOKEN}\"}" ;;
  *"/access/api/v1/oidc/token"*) echo "{\"access_token\": \"${FAKE_JFROG_TOKEN}\"}" ;;
  *) echo "curl stub: unexpected call: $*" >&2; exit 1 ;;
esac
EOF
chmod +x "$WORK/bin/curl"

# Loaded via BASH_ENV into every step. Runs before each command.
cat > "$WORK/check-masking.sh" << 'EOF'
__check_secret_masking() {
  local token="$FAKE_JFROG_TOKEN" file line value
  # A sink that holds the token needs the token masked earlier in the job log.
  for file in "$GITHUB_ENV" "$GITHUB_OUTPUT" "$HOME/.npmrc" "$HOME/.yarnrc.yml"; do
    [[ -s "$file" ]] || continue
    grep -qF -- "$token" "$file" || continue
    grep -qxF -- "::add-mask::$token" "$JOB_LOG" \
      || echo "token in $file before ::add-mask::<token>" >> "$VIOLATIONS"
  done
  # Derived values (e.g. PIP_INDEX_URL embeds the token) must be masked as a whole.
  for file in "$GITHUB_ENV" "$GITHUB_OUTPUT"; do
    [[ -s "$file" ]] || continue
    while IFS= read -r line; do
      [[ "$line" == *"$token"* ]] || continue
      value="${line#*=}"
      grep -qxF -- "::add-mask::$value" "$JOB_LOG" \
        || echo "$(basename "$file") entry ${line%%=*} not masked as a whole value" >> "$VIOLATIONS"
    done < "$file"
  done
  return 0
}
trap '__check_secret_masking' DEBUG
trap '__check_secret_masking' EXIT
EOF

# run_job NAME SCRIPT... : runs the scripts as steps of one job.
# Sets LAST_JOB to the job's state directory.
run_job() {
  local name="$1" step entry job
  shift
  job="$WORK/job-$name"
  LAST_JOB="$job"
  mkdir -p "$job/home"
  : > "$job/github_env"
  : > "$job/github_output"
  : > "$job/job.log"
  : > "$job/violations"
  for step in "$@"; do
    (
      # Like the runner: later steps see what earlier steps wrote to $GITHUB_ENV.
      while IFS= read -r entry; do
        [[ -n "$entry" ]] && export "${entry%%=*}=${entry#*=}"
      done < "$job/github_env"
      export HOME="$job/home" GITHUB_ENV="$job/github_env" GITHUB_OUTPUT="$job/github_output"
      export JOB_LOG="$job/job.log" VIOLATIONS="$job/violations"
      export ACTIONS_ID_TOKEN_REQUEST_TOKEN="fake-request-token"
      export ACTIONS_ID_TOKEN_REQUEST_URL="https://oidc.invalid/token?api-version=2.0"
      export PATH="$WORK/bin:$PATH" BASH_ENV="$WORK/check-masking.sh"
      bash "$step" >> "$job/job.log" 2>&1
    ) || { cat "$job/job.log" >&2; fail "$(basename "$step") exited non-zero in job $name"; }
  done
  sort -u "$job/violations" -o "$job/violations"
}

# --- 1. The real credential scripts, in the order unit-tests.yml runs them ---
run_job real \
  "$SCRIPTS_DIR/jfrog-oidc-token.sh" \
  "$SCRIPTS_DIR/configure-npm.sh" \
  "$SCRIPTS_DIR/configure-pip.sh"
job="$LAST_JOB"

if [[ -s "$job/violations" ]]; then
  cat "$job/violations" >&2
  cat "$job/job.log" >&2
  fail "credential scripts write secrets before masking them"
fi

# Non-vacuous: the scripts must actually have written the secrets we check for.
grep -qxF "JFROG_ACCESS_TOKEN=$FAKE_JFROG_TOKEN" "$job/github_env" \
  || fail "JFROG_ACCESS_TOKEN was not written to GITHUB_ENV (stub or script changed?)"
pip_url="$(grep '^PIP_INDEX_URL=' "$job/github_env" | cut -d= -f2- || true)"
[[ "$pip_url" == *"$FAKE_JFROG_TOKEN"* ]] \
  || fail "PIP_INDEX_URL with embedded token was not written to GITHUB_ENV"
grep -qF "_authToken=$FAKE_JFROG_TOKEN" "$job/home/.npmrc" \
  || fail "token was not written to ~/.npmrc"
grep -qxF "::add-mask::$FAKE_JFROG_TOKEN" "$job/job.log" \
  || fail "no ::add-mask:: line for the JFrog token"
grep -qxF "::add-mask::$pip_url" "$job/job.log" \
  || fail "no ::add-mask:: line for the composite PIP_INDEX_URL"
echo "ok: real credential scripts mask the JFrog token and PIP_INDEX_URL before writing them"

# --- 2. Controls: the checker must catch bad patterns and accept good ones ---
controls="$WORK/controls"
mkdir -p "$controls"

cat > "$controls/clean.sh" << 'EOF'
echo "::add-mask::${FAKE_JFROG_TOKEN}"
echo "JFROG_ACCESS_TOKEN=${FAKE_JFROG_TOKEN}" >> "$GITHUB_ENV"
EOF

cat > "$controls/no-mask.sh" << 'EOF'
echo "JFROG_ACCESS_TOKEN=${FAKE_JFROG_TOKEN}" >> "$GITHUB_ENV"
EOF

cat > "$controls/mask-after-export.sh" << 'EOF'
echo "JFROG_ACCESS_TOKEN=${FAKE_JFROG_TOKEN}" >> "$GITHUB_ENV"
echo "::add-mask::${FAKE_JFROG_TOKEN}"
EOF

cat > "$controls/unmasked-derived-value.sh" << 'EOF'
echo "::add-mask::${FAKE_JFROG_TOKEN}"
echo "PIP_INDEX_URL=https://user:${FAKE_JFROG_TOKEN}@example.invalid/simple" >> "$GITHUB_ENV"
EOF

run_job control-clean "$controls/clean.sh"
[[ ! -s "$LAST_JOB/violations" ]] || { cat "$LAST_JOB/violations" >&2; fail "checker flagged the clean control"; }

for control in no-mask mask-after-export unmasked-derived-value; do
  run_job "control-$control" "$controls/$control.sh"
  [[ -s "$LAST_JOB/violations" ]] || fail "checker missed the '$control' control"
  echo "ok: checker flags control '$control': $(head -1 "$LAST_JOB/violations")"
done

echo "All secret masking checks passed."
