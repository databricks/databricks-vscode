#!/bin/bash
#
# Copy the native @vscode/windows-ca-certs module into out/node_modules so the
# esbuild bundle's runtime `require("@vscode/windows-ca-certs")` resolves in the
# packaged extension. The bundle marks the module external (a native .node can't
# be bundled) and the VSIX excludes the top-level node_modules/**, so the module
# has to live under out/ to ship — same approach as the other package:copy-*
# steps. It runs from vscode:prepublish (before vsce zips out/), which is the
# only point at which we can add files to the packaged output.
#
# The module is a win32-only optional dependency, so this is a no-op unless we're
# packaging a win32 VSIX. package-vsix.sh signals that by exporting
# INCLUDE_WINDOWS_CA_CERTS=1 for the win32-* targets; for any other invocation
# (dev builds, mac/linux VSIXs) we skip.
#
# Even for win32 targets the module may be absent when the VSIX is cross-built on
# a non-Windows host (yarn honours the os=win32 install condition and skips it
# there). We warn rather than fail: at runtime a missing module degrades to
# Node's bundled roots plus databricks.proxy.caCert, so the build should still
# succeed. To actually ship the native reader, build the win32 VSIX on a Windows
# host (or install a prebuilt @vscode/windows-ca-certs) so the module is present.

set -euo pipefail

# get path of the repo (parent of scripts/)
cd "$(dirname "$(realpath "$0")")/.."

if [ "${INCLUDE_WINDOWS_CA_CERTS:-}" != "1" ]; then
  # Not a win32 packaging target — nothing to do.
  exit 0
fi

SRC="./node_modules/@vscode/windows-ca-certs"
DEST="./out/node_modules/@vscode/windows-ca-certs"

if [ ! -d "$SRC" ]; then
  echo "WARNING: $SRC not found — packaging a win32 VSIX without the native" >&2
  echo "Windows CA reader. On older Node the SDK will fall back to Node's" >&2
  echo "bundled roots (+ databricks.proxy.caCert). Build on a Windows host to" >&2
  echo "include it." >&2
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
# Copy the whole module directory (index.js, package.json, build/Release/*.node,
# etc.) so its own require() calls and the native addon all resolve at runtime.
cp -R "$SRC" "$DEST"

echo "Copied @vscode/windows-ca-certs -> $DEST"
