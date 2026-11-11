#!/usr/bin/env bash
# Runs the e2e suite, or one spec of it: `yarn test:e2e:spec [auth]` against
# the mock workspace (mock/README.md), `yarn test:e2e:spec:real [auth]
# --profile my-profile` against a real one. The spec is a name, such as `auth`, or
# a path, such as `src/auth.e2e.ts`; without one, every spec runs.
#
# The specs sign in with a `[DEFAULT]` profile that holds a personal access
# token (`saveNewProfile` copies only those). With `--profile <name>`, the
# CLI's profile of that name creates a token that lives two hours (or
# `--token-hours`), the run's own config file has it as `[DEFAULT]`, and the
# token is revoked when the run ends. The profile itself, its config file and
# the CLI's token cache stay as they are: a copy named DEFAULT would share the
# cache's entries for the real DEFAULT. Without `--profile`,
# DATABRICKS_CONFIG_FILE has to have such a `[DEFAULT]`; the specs get a copy
# of it, never the file (wdio.conf.ts).
#
# It builds the extension first, and takes its extension pack's members from VS
# Code's extensions folder unless DATABRICKS_E2E_EXTENSIONS is set (the
# Marketplace may be unreachable). One spec runs in its one window: the folder
# window, or for a `*.no-folder.*` spec the window without one; a `*.no-deps.*`
# spec runs in the folder window without the pack's members, and the
# activation smoke spec in both folder windows. The whole suite runs every
# spec in all its windows, E2E_WORKERS of them side by side (one by default;
# wdio.conf.ts). Other arguments go to `wdio run`; the MOCK_* variables of
# mock/run-e2e.sh and the specs' TEST_* variables still apply.
set -euo pipefail

usage="usage: yarn test:e2e:spec [<spec>] [wdio arguments], or yarn test:e2e:spec:real [<spec>] --profile <name> [--token-hours <n>] [wdio arguments]; the spec is e.g. auth or src/auth.e2e.ts, and without one every spec runs"
mode="${1:-}"
if [ "$mode" != "mock" ] && [ "$mode" != "real" ]; then
    echo "$usage" >&2
    exit 2
fi
shift
e2e="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$e2e/../.." && pwd)"

# The spec, if the first argument isn't an option.
spec=""
name=""
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
    name="$(basename "$1")"
    name="${name%.ts}"
    name="${name%.e2e}"
    shift
    spec="src/$name.e2e.ts"
    if [ ! -f "$e2e/$spec" ]; then
        echo "There is no $spec. The specs are:" >&2
        ls "$e2e/src" | sed -n 's/\.e2e\.ts$//p' >&2
        exit 2
    fi
fi

# `--profile` and `--token-hours` are this script's; the rest goes to `wdio run`.
profile=""
token_hours=2
args=()
while [ $# -gt 0 ]; do
    case "$1" in
        --profile) profile="${2:-}"; shift 2 || shift ;;
        --profile=*) profile="${1#--profile=}"; shift ;;
        --token-hours) token_hours="${2:-}"; shift 2 || shift ;;
        --token-hours=*) token_hours="${1#--token-hours=}"; shift ;;
        *) args+=("$1"); shift ;;
    esac
done
if [ "$mode" = "mock" ] && [ -n "$profile" ]; then
    echo "--profile is for test:e2e:spec:real; the mock has its own profile." >&2
    exit 2
fi
if ! [[ "$token_hours" =~ ^[1-9][0-9]*$ ]]; then
    echo "--token-hours takes a whole number of hours, not \"$token_hours\"." >&2
    exit 2
fi
if [ "$mode" = "real" ] && [ -z "$profile" ]; then
    if [ -z "${DATABRICKS_CONFIG_FILE:-}" ] || ! grep -q '^\[DEFAULT\]' "$DATABRICKS_CONFIG_FILE" 2> /dev/null; then
        echo "Pass --profile <name> with a profile of your Databricks CLI, e.g. yarn test:e2e:spec:real ${name:+$name }--profile my-profile" >&2
        echo "(or set DATABRICKS_CONFIG_FILE to a config file whose [DEFAULT] profile has a personal access token)." >&2
        exit 2
    fi
fi

cd "$root"
yarn build
# fetch:cli sometimes fails once with a bare Node error.
yarn workspace databricks fetch:cli || yarn workspace databricks fetch:cli

if [ -z "${DATABRICKS_E2E_EXTENSIONS:-}" ]; then
    # The newest installed version of each member of the extension's pack.
    DATABRICKS_E2E_EXTENSIONS="$(node -e '
        const fs = require("node:fs"), path = require("node:path");
        const [manifest, dir] = process.argv.slice(1);
        const found = [], missing = [];
        const pack = JSON.parse(fs.readFileSync(manifest, "utf-8")).extensionPack;
        if (!Array.isArray(pack)) {
            console.error(`${manifest} has no extensionPack.`);
            process.exit(1);
        }
        for (const id of pack) {
            const versions = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).flatMap((d) => {
                try {
                    const m = JSON.parse(fs.readFileSync(path.join(dir, d, "package.json"), "utf-8"));
                    return `${m.publisher}.${m.name}`.toLowerCase() === id.toLowerCase() ? [{dir: path.join(dir, d), version: m.version}] : [];
                } catch {
                    return [];
                }
            });
            versions.sort((a, b) => b.version.localeCompare(a.version, undefined, {numeric: true}));
            versions.length > 0 ? found.push(versions[0].dir) : missing.push(id);
        }
        if (missing.length > 0) {
            console.error(`${missing.join(", ")} not installed in ${dir}. Install them in VS Code, or set DATABRICKS_E2E_EXTENSIONS to their folders or VSIX files.`);
            process.exit(1);
        }
        console.log(found.join(path.delimiter));
    ' "$root/packages/databricks-vscode/package.json" "${VSCODE_EXTENSIONS:-$HOME/.vscode/extensions}")"
    export DATABRICKS_E2E_EXTENSIONS
fi

# The CLI turns its prompts off when NO_COLOR is set, even in VS Code's
# terminal, and bundle_init's template wizard then exits without a project.
unset NO_COLOR

display=()
if [ "$(uname)" = "Linux" ] && [ -z "${DISPLAY:-}" ]; then
    display=(xvfb-run -a)
fi

if [ "$mode" = "real" ]; then
    # The profile alone decides the workspace, as in the mock run.
    unset DATABRICKS_WORKSPACE_ID DATABRICKS_HOST DATABRICKS_TOKEN DATABRICKS_CONFIG_PROFILE
    cli="$root/packages/databricks-vscode/bin/databricks"
    run_dir="$(mktemp -d)"
    token_id=""
    cleanup() {
        if [ -n "$token_id" ]; then
            "$cli" tokens delete "$token_id" --profile "$profile" > /dev/null ||
                echo "Couldn't revoke the e2e token $token_id; revoke it in $host's settings." >&2
        fi
        rm -rf "$run_dir"
    }
    trap cleanup EXIT
    trap 'exit 130' INT TERM
    config="${DATABRICKS_CONFIG_FILE:-}"
fi

if [ -n "$profile" ]; then
    host="$("$cli" auth describe --profile "$profile" -o json 2> /dev/null | node -e '
        const d = JSON.parse(require("node:fs").readFileSync(0, "utf-8") || "{}");
        if (d.status === "success" && d.details?.host) console.log(d.details.host);
    ' || true)"
    if [ -z "$host" ]; then
        echo "The CLI's profile \"$profile\" can't sign in. Check it with: databricks auth describe --profile $profile" >&2
        exit 1
    fi
    echo "Testing against $host with a $token_hours-hour token of the profile \"$profile\", revoked at the end."
    # The token goes from the CLI to the config file only, never to the output.
    (umask 077 && "$cli" tokens create --profile "$profile" --lifetime-seconds "$((token_hours * 3600))" \
        --comment "databricks-vscode e2e: ${name:-all specs}" -o json > "$run_dir/token.json")
    token_id="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf-8")).token_info.token_id)' "$run_dir/token.json")"
    node -e '
        const fs = require("node:fs");
        const [tokenFile, host, configFile] = process.argv.slice(1);
        const token = JSON.parse(fs.readFileSync(tokenFile, "utf-8")).token_value;
        fs.writeFileSync(configFile, `[DEFAULT]\nhost = ${host}\ntoken = ${token}\n`, {mode: 0o600});
        fs.rmSync(tokenFile);
    ' "$run_dir/token.json" "$host" "$run_dir/databrickscfg"
    config="$run_dir/databrickscfg"
fi

# The wdio run: run_wdio <folder window only: 0|1> <wdio arguments>.
run_wdio() {
    local folder_only="$1"
    shift
    # wdio.conf.ts runs a `*.no-folder.*` spec only in the window without a
    # folder; a spec picked with --spec runs in every other window too.
    local vars=()
    if [ "$folder_only" = 1 ]; then
        vars+=("E2E_FOLDER_ONLY=${E2E_FOLDER_ONLY:-1}")
    fi
    if [ "$mode" = "mock" ]; then
        env ${vars[@]+"${vars[@]}"} bash "$e2e/mock/run-e2e.sh" "$@"
        return
    fi
    (cd "$e2e" && env ${vars[@]+"${vars[@]}"} DATABRICKS_CONFIG_FILE="$config" \
        ${display[@]+"${display[@]}"} npx wdio run ./wdio.conf.ts "$@")
}

# Not `exec`: a real run's token is revoked after it.
status=0
if [ -n "$spec" ]; then
    folder_only=1
    case "$name" in
        *.no-folder | *.no-folder.*) folder_only=0 ;;
    esac
    run_wdio "$folder_only" --spec "$spec" ${args[@]+"${args[@]}"} || status=$?
else
    run_wdio 0 ${args[@]+"${args[@]}"} || status=$?
fi
exit "$status"
