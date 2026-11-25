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
# and that same reference was not passed to ::add-mask:: earlier in the same
# job. A line is read as a sequence of commands split on ;, && and ||, so a
# mask later on the same line does not count. Only a mask of exactly the
# reference counts: "::add-mask::${TOKEN}" covers TOKEN, but
# "::add-mask::prefix-${TOKEN}" does not. In workflow files the masks are
# forgotten at each job boundary, because GitHub scopes masks to one job.
# A plain ${{ secrets.NAME }} and ${{ github.token }} are skipped: Actions masks
# them automatically. Compound expressions such as
# ${{ secrets.A || steps.x.outputs.token }} are not skipped. Comment lines are
# ignored.
#
# Not caught: multi-line writes (heredocs, { ...; } >> "$GITHUB_ENV"),
# credentials hidden behind a non-credential name (e.g. PIP_INDEX_URL embeds
# the token), ;, && or || inside quotes, and masks in a different file or an
# earlier step of another file. tests/secret-masking.sh covers the existing
# scripts at runtime.
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

# Only a bare secret or github.token is masked by Actions; an expression that
# can fall back to something else is not.
auto_masked() {
  [[ "$1" =~ ^\$\{\{secrets\.[A-Za-z_][A-Za-z0-9_]*\}\}$ || "$1" == '${{github.token}}' ]]
}

# Prints the reference that ::add-mask:: in $1 masks, if it masks exactly one
# reference and nothing else.
mask_target() {
  local arg="${1#*::add-mask::}"
  arg="${arg%%[\"\']*}"
  arg="${arg#"${arg%%[![:space:]]*}"}"
  arg="${arg%"${arg##*[![:space:]]}"}"
  if [[ "$arg" =~ ^\$\{\{[^}]*\}\}$ ]]; then
    echo "${arg//[[:space:]]/}"
  elif [[ "$arg" =~ ^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$ || "$arg" =~ ^\$([A-Za-z_][A-Za-z0-9_]*)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

# Prints the commands on line $1, one per line, split on ;, && and ||
# outside ${{ }} expressions.
commands() {
  local s="$1" exprs=() i
  while [[ "$s" =~ (\$\{\{[^}]*\}\}) ]]; do
    exprs+=("${BASH_REMATCH[1]}")
    s="${s/"${BASH_REMATCH[1]}"/$'\x01'$((${#exprs[@]} - 1))$'\x01'}"
  done
  s="${s//&&/$'\n'}"
  s="${s//||/$'\n'}"
  s="${s//;/$'\n'}"
  for i in "${!exprs[@]}"; do
    s="${s//$'\x01'$i$'\x01'/${exprs[$i]}}"
  done
  printf '%s\n' "$s"
}

check_sink() {
  local file="$1" n="$2" cmd="$3" key ref flagged=false sink='$GITHUB_ENV'
  grep -qE '\$\{?GITHUB_OUTPUT([^A-Za-z0-9_]|$)' <<< "$cmd" && sink='$GITHUB_OUTPUT'

  key=""
  [[ "$cmd" =~ ([A-Za-z_][A-Za-z0-9_-]*)= ]] && key="${BASH_REMATCH[1]}"
  local key_is_credential=false
  [[ -n "$key" ]] && looks_like_credential "$key" && key_is_credential=true

  while IFS= read -r ref; do
    [[ -z "$ref" || "$ref" == GITHUB_ENV || "$ref" == GITHUB_OUTPUT ]] && continue
    auto_masked "$ref" && continue
    if [[ "$key_is_credential" == true ]] || looks_like_credential "$ref"; then
      if [[ "$masked" != *$'\n'"$ref"$'\n'* ]]; then
        echo "$file:$n: $ref is written to $sink without an earlier ::add-mask:: of it in this job"
        flagged=true
      fi
    fi
  done < <(refs "$cmd")

  if [[ "$key_is_credential" == true && "$flagged" == false ]] \
    && [[ "$cmd" == *'$('* || "$cmd" == *'`'* ]]; then
    echo "$file:$n: $key is written to $sink from a command substitution; assign it to a variable and ::add-mask:: it first"
    flagged=true
  fi

  [[ "$flagged" == true ]] && FOUND=1
  return 0
}

check_file() {
  local file="$1" n=0 line trimmed cmd target allowed
  local is_workflow=false in_jobs=false job_indent=""
  [[ "$file" == *.yml || "$file" == *.yaml ]] && is_workflow=true
  masked=$'\n'

  while IFS= read -r line || [[ -n "$line" ]]; do
    n=$((n + 1))
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue

    # GitHub scopes masks to one job: forget them at each job key under jobs:.
    if [[ "$is_workflow" == true ]]; then
      if [[ "$line" =~ ^jobs:[[:space:]]*(#.*)?$ ]]; then
        in_jobs=true job_indent="" masked=$'\n'
        continue
      elif [[ "$line" =~ ^[A-Za-z_] ]]; then
        in_jobs=false
      elif [[ "$in_jobs" == true && "$line" =~ ^([[:space:]]+)[A-Za-z0-9_-]+:[[:space:]]*(#.*)?$ ]]; then
        [[ -z "$job_indent" ]] && job_indent="${#BASH_REMATCH[1]}"
        [[ "${#BASH_REMATCH[1]}" == "$job_indent" ]] && masked=$'\n'
      fi
    fi

    allowed=false
    grep -qE "$ALLOW_RE" <<< "$line" && allowed=true

    while IFS= read -r cmd; do
      if [[ "$cmd" == *"::add-mask::"* ]]; then
        target="$(mask_target "$cmd")"
        [[ -n "$target" ]] && masked+="$target"$'\n'
        continue
      fi
      [[ "$allowed" == true ]] && continue
      grep -qE "$SINK_RE" <<< "$cmd" || continue
      check_sink "$file" "$n" "$cmd"
    done < <(commands "$line")
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
