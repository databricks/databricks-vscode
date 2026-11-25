#!/usr/bin/env bash
# Tests for ../check-secret-writes.sh: the fixtures it must flag, the ones it
# must pass, and the repository itself.
#
# Usage: bash .github/scripts/tests/check-secret-writes.sh
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$TESTS_DIR/../check-secret-writes.sh"
FIXTURES="$TESTS_DIR/fixtures/secret-writes"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# expect_flagged FIXTURE LINE... : the check must fail and report exactly these lines.
expect_flagged() {
  local fixture="$1" out want got
  shift
  if out="$(bash "$CHECK" "$FIXTURES/$fixture" 2>/dev/null)"; then
    fail "$fixture was not flagged"
  fi
  want="$(printf '%s\n' "$@")"
  got="$(sed -nE 's/^[^:]+:([0-9]+): .*/\1/p' <<< "$out")"
  [[ "$got" == "$want" ]] || fail "$fixture: flagged lines [$(echo $got)], want [$(echo $want)]:"$'\n'"$out"
  echo "ok: flags $fixture (lines $(echo $want))"
}

expect_passed() {
  local file="$1" out
  out="$(bash "$CHECK" "$file" 2>&1)" || fail "$file was flagged:"$'\n'"$out"
  echo "ok: passes $(basename "$file")"
}

# The pre-fix jfrog-oidc-token.sh (before b4cec4ee): token written without a mask.
expect_flagged jfrog-oidc-token.prefix.sh 23
expect_flagged mask-after-write.sh 3
expect_flagged unmasked-workflow.yml 9 10 13
# A mask in another job (14), a mask later on the same line (15), a mask of a
# different value (16), a mask of a transformed value (19), and a secrets.*
# expression that can fall back to an unmasked output (20).
expect_flagged review-findings.yml 14 15 16 19 20

# The current, masked jfrog-oidc-token.sh.
expect_passed "$FIXTURES/jfrog-oidc-token.masked.sh"
expect_passed "$FIXTURES/clean-workflow.yml"

# The allow comment is what keeps the KEY_ID line in clean-workflow.yml passing.
sed 's/ # secret-write-ok:.*$//' "$FIXTURES/clean-workflow.yml" > "$WORK/no-allow.yml"
if bash "$CHECK" "$WORK/no-allow.yml" > /dev/null 2>&1; then
  fail "clean-workflow.yml still passes without its secret-write-ok comment"
fi
echo "ok: secret-write-ok comment is required for the KEY_ID write"

# The repository itself (all of .github, fixtures excluded).
out="$(bash "$CHECK" 2>&1)" || fail "repository has unmasked credential writes:"$'\n'"$out"
echo "$out"

echo "All secret write checks passed."
