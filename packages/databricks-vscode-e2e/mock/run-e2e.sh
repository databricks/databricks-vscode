#!/usr/bin/env bash
# Runs the e2e suite against the mock workspace (README.md). Arguments go to
# `wdio run`, e.g. `--spec src/auth.e2e.ts`. Linux and macOS; needs Node 24,
# openssl and, for Databricks Connect, uv; on Linux without a display, xvfb-run.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
e2e="$(dirname "$here")"
export MOCK_DIR="${MOCK_DIR:-${TMPDIR:-/tmp}/databricks-vscode-e2e-mock}"
# A second run on the machine needs other ports, and another TMPDIR for the
# specs' folders (wdio.conf.ts).
export MOCK_PORT="${MOCK_PORT:-8443}" MOCK_PROXY_PORT="${MOCK_PROXY_PORT:-8888}" MOCK_SPARK_PORT="${MOCK_SPARK_PORT:-15002}"
export MOCK_INTERCEPT_PORT="${MOCK_INTERCEPT_PORT:-8889}"
mkdir -p "$MOCK_DIR"

# A certificate for mock.databricks.test, made once per state folder, and a CA
# bundle with it for Python and the CLI.
if [ ! -f "$MOCK_DIR/cert.pem" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -keyout "$MOCK_DIR/key.pem" -out "$MOCK_DIR/cert.pem" -days 30 \
        -subj "/CN=mock.databricks.test" -addext "subjectAltName=DNS:mock.databricks.test" 2>/dev/null
fi
# The intercepting proxy's own certificate (proxy_tls.trust.e2e.ts). Nothing installs it or adds it to the bundle,
# so a window trusts it only through what wdio.mock.conf.ts gives that window.
if [ ! -f "$MOCK_DIR/intercept-cert.pem" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -keyout "$MOCK_DIR/intercept-key.pem" -out "$MOCK_DIR/intercept-cert.pem" \
        -days 30 -subj "/O=e2e intercepting proxy/CN=mock.databricks.test" -addext "subjectAltName=DNS:mock.databricks.test" 2>/dev/null
fi
system_ca="$(ls /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem 2>/dev/null | head -1 || true)"
cat ${system_ca:+"$system_ca"} "$MOCK_DIR/cert.pem" > "$MOCK_DIR/ca-bundle.pem"

# The profile: a PAT. run_serverless_workflow's copy of it gets serverless
# compute (wdio.conf.ts).
printf '[DEFAULT]\nhost = https://mock.databricks.test\ntoken = dapi-mock-default\n' > "$MOCK_DIR/databrickscfg"
chmod 600 "$MOCK_DIR/databrickscfg"

# The CLI trusts the mock's certificate through the OS store, not through SSL_CERT_FILE, so the suite doesn't depend on
# which variables the extension passes to CLI calls. MOCK_INSTALL_CA=1 installs the certificate (a CI runner); on Linux,
# bwrap binds the bundle over the system one for this run. The profiles verify TLS.
trust=()
if [ -n "${MOCK_INSTALL_CA:-}" ]; then
    sudo cp "$MOCK_DIR/cert.pem" /usr/local/share/ca-certificates/databricks-mock.crt
    sudo update-ca-certificates > /dev/null
elif [ "$(uname)" = "Linux" ] && command -v bwrap > /dev/null; then
    trust=(bwrap --bind / / --dev /dev --proc /proc --bind "$MOCK_DIR/ca-bundle.pem" /etc/ssl/certs/ca-certificates.crt --)
else
    # Otherwise the specs that run the CLI fail far from the cause.
    echo "Neither MOCK_INSTALL_CA nor bwrap applies: unless $MOCK_DIR/cert.pem is in the OS store (on macOS, the keychain), CLI calls fail with x509 errors." >&2
fi

# The fake Spark Connect server needs pyspark's generated stubs: a venv with databricks-connect.
if [ ! -x "$MOCK_DIR/sc-venv/bin/python" ] && command -v uv > /dev/null; then
    SSL_CERT_FILE="$MOCK_DIR/ca-bundle.pem" uv venv "$MOCK_DIR/sc-venv" --python 3.12 -q
    SSL_CERT_FILE="$MOCK_DIR/ca-bundle.pem" uv pip install -q --python "$MOCK_DIR/sc-venv/bin/python" "databricks-connect~=17.3.0"
fi

pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2> /dev/null || true; done; }
trap cleanup EXIT
UC_CATALOGS="${UC_CATALOGS:-800}" node "$here/server.mjs" > "$MOCK_DIR/server.out" 2>&1 &
pids+=($!)
if [ -x "$MOCK_DIR/sc-venv/bin/python" ]; then
    "$MOCK_DIR/sc-venv/bin/python" "$here/spark_connect.py" > "$MOCK_DIR/spark_connect.out" 2>&1 &
    pids+=($!)
fi
sleep 2
# A port taken by another run would fail every spec on "Can't connect".
for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2> /dev/null; then
        cat "$MOCK_DIR/server.out" "$MOCK_DIR/spark_connect.out" >&2 2> /dev/null || true
        echo "A mock server exited; if another run holds its ports, set MOCK_PORT, MOCK_PROXY_PORT, MOCK_INTERCEPT_PORT and MOCK_SPARK_PORT." >&2
        exit 1
    fi
done

profile="$MOCK_DIR/databrickscfg"
display=()
if [ "$(uname)" = "Linux" ] && [ -z "${DISPLAY:-}" ]; then
    display=(xvfb-run -a)
fi

# The package index of PIP_INDEX_URL bypasses the mock's proxy.
index_host="${PIP_INDEX_URL:-}"
index_host="${index_host#*://}"
index_host="${index_host%%/*}"
index_host="${index_host##*@}"
no_proxy="${NO_PROXY:-localhost,127.0.0.1,github.com,.githubusercontent.com,releases.astral.sh}${index_host:+,$index_host}"

cd "$e2e"
env -u DATABRICKS_WORKSPACE_ID -u DATABRICKS_HOST -u DATABRICKS_TOKEN \
    DATABRICKS_CONFIG_FILE="$profile" \
    NODE_EXTRA_CA_CERTS="$MOCK_DIR/cert.pem" SSL_CERT_FILE="$MOCK_DIR/ca-bundle.pem" \
    REQUESTS_CA_BUNDLE="$MOCK_DIR/ca-bundle.pem" GRPC_DEFAULT_SSL_ROOTS_FILE_PATH="$MOCK_DIR/ca-bundle.pem" \
    grpc_proxy="http://127.0.0.1:$MOCK_PROXY_PORT" \
    NO_PROXY="$no_proxy" \
    TEST_DEFAULT_CLUSTER_ID=0000-mock-cluster TEST_STOPPABLE_CLUSTER_ID=0001-mock-stopped \
    ${trust[@]+"${trust[@]}"} ${display[@]+"${display[@]}"} npx wdio run ./wdio.mock.conf.ts "$@"
