#!/usr/bin/env bash
# Static check: a credential must be masked before it is written to
# $GITHUB_ENV or $GITHUB_OUTPUT.
#
# Values written there show up in later steps' logs. In a public repository
# those logs are public, so the value must first be announced with
# "::add-mask::<value>". See jfrog-oidc-token.sh for the pattern.
#
# This is a line-based heuristic, not a shell parser. A line that writes to
# $GITHUB_ENV or $GITHUB_OUTPUT is flagged when it
#   - references a variable or ${{ expression }} whose name looks like a
#     credential (token, secret, password, credential, api_key, private_key,
#     or a key/auth name segment), or
#   - writes a key whose name looks like a credential with a non-literal value,
# and that same reference was not passed to ::add-mask:: on an earlier line
# of the same file. ${{ secrets.* }} and ${{ github.token }} are skipped:
# Actions masks them automatically. Comment lines are ignored.
#
# Not caught: multi-line writes (heredocs, { ...; } >> "$GITHUB_ENV"),
# credentials hidden behind a non-credential name (e.g. PIP_INDEX_URL embeds
# the token), and masks in a different file or an earlier step of another
# file. tests/secret-masking.sh covers the existing scripts at runtime.
#
# To allow a justified exception, end the line with
#   # secret-write-ok: <reason>
#
# Usage: bash .github/scripts/check-secret-writes.sh [FILE...]
# Without arguments it scans .github/**/*.sh, *.yml and *.yaml, skipping
# test fixtures.
set -euo pipefail

CREDENTIAL_RE='token|secret|passw(or)?d|credential|api_?key|private_?key|(^|[._-])(key|auth)([._-]|$)'
REF_RE='\$\{\{[^}]*\}\}|\$\{?[A-Za-z_][A-Za-z0-9_]*'
SINK_RE='\$\{?GITHUB_(ENV|OUTPUT)([^A-Za-z0-9_]|$)'
ALLOW_RE='#[[:space:]]*secret-write-ok:[[:space:]]*[^[:space:]]'

# Prints the references in $1, one per line, normalized:
# "$FOO" and "${FOO:-x}" -> FOO, "${{ steps.a.outputs.token }}" -> ${{steps.a.outputs.token}}
refs() {
  grep -oE "$REF_RE" <<< "$1" | while IFS= read -r ref; do
    case "$ref" in
      '${{'*) echo "${ref//[[:space:]]/}" ;;
      *) ref="${ref#\$}"; echo "${ref#\{}" ;;
    esac
  done || true
}

looks_like_credential() {
  local name="$1"
  name="${name#\$\{\{}"
  name="${name%\}\}}"
  shopt -s nocasematch
  local rc=1
  [[ "$name" =~ $CREDENTIAL_RE ]] && rc=0
  shopt -u nocasematch
  return "$rc"
}

auto_masked() {
  [[ "$1" == '${{secrets.'* || "$1" == '${{github.token}}' ]]
}

check_file() {
  local file="$1" n=0 line trimmed key ref flagged sink
  local masked=$'\n'

  while IFS= read -r line || [[ -n "$line" ]]; do
    n=$((n + 1))
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ "$trimmed" == \#* ]] && continue

    if [[ "$line" == *"::add-mask::"* ]]; then
      while IFS= read -r ref; do
        [[ -n "$ref" ]] && masked+="$ref"$'\n'
      done < <(refs "${line#*::add-mask::}")
      continue
    fi

    grep -qE "$SINK_RE" <<< "$line" || continue
    grep -qE "$ALLOW_RE" <<< "$line" && continue

    sink='$GITHUB_ENV'
    grep -qE '\$\{?GITHUB_OUTPUT([^A-Za-z0-9_]|$)' <<< "$line" && sink='$GITHUB_OUTPUT'

    key=""
    [[ "$line" =~ ([A-Za-z_][A-Za-z0-9_-]*)= ]] && key="${BASH_REMATCH[1]}"
    local key_is_credential=false
    [[ -n "$key" ]] && looks_like_credential "$key" && key_is_credential=true

    flagged=false
    while IFS= read -r ref; do
      [[ -z "$ref" || "$ref" == GITHUB_ENV || "$ref" == GITHUB_OUTPUT ]] && continue
      auto_masked "$ref" && continue
      if [[ "$key_is_credential" == true ]] || looks_like_credential "$ref"; then
        if [[ "$masked" != *$'\n'"$ref"$'\n'* ]]; then
          echo "$file:$n: $ref is written to $sink without an earlier ::add-mask:: of it in this file"
          flagged=true
        fi
      fi
    done < <(refs "$line")

    if [[ "$key_is_credential" == true && "$flagged" == false ]] \
      && [[ "$line" == *'$('* || "$line" == *'`'* ]]; then
      echo "$file:$n: $key is written to $sink from a command substitution; assign it to a variable and ::add-mask:: it first"
      flagged=true
    fi

    [[ "$flagged" == true ]] && FOUND=1
  done < "$file"
  return 0
}

if [[ $# -eq 0 ]]; then
  cd "$(dirname "${BASH_SOURCE[0]}")/../.."
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(
    find .github -type f \( -name '*.sh' -o -name '*.yml' -o -name '*.yaml' \) \
      -not -path '.github/scripts/tests/fixtures/*' | sort
  )
  set -- "${files[@]}"
fi

FOUND=0
for file in "$@"; do
  check_file "$file"
done

if [[ "$FOUND" -ne 0 ]]; then
  echo "Mask credentials with echo \"::add-mask::\${VAR}\" before writing them to \$GITHUB_ENV or \$GITHUB_OUTPUT," >&2
  echo "or end the line with '# secret-write-ok: <reason>' if the value is not secret." >&2
  exit 1
fi
echo "ok: no unmasked credential writes to \$GITHUB_ENV or \$GITHUB_OUTPUT in $# files"
