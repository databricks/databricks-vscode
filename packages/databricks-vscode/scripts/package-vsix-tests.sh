#!/bin/bash

set -ex

# Wrapper around package-vsix.sh that builds a VSIX for the host platform/arch
# and records its filename for the e2e test runner (wdio.conf.ts) to pick up.
# This ensures e2e tests run against the same VSIX layout that is shipped
# to users.

cd $(dirname $(realpath $0))/..

OS_RAW=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$OS_RAW" in
  linux)                PLATFORM=linux ;;
  darwin)               PLATFORM=darwin ;;
  mingw*|msys*|cygwin*) PLATFORM=win32 ;;
  *) echo "Unsupported OS: $OS_RAW" >&2; exit 1 ;;
esac

ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64|amd64)  ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH_RAW" >&2; exit 1 ;;
esac

VSIX_ARCH="${PLATFORM}-${ARCH}"

./scripts/package-vsix.sh "$VSIX_ARCH"

VERSION=$(jq -r .version < package.json)
NAME=$(jq -r .name < package.json)
VSIX_FILE="${NAME}-${VSIX_ARCH}-${VERSION}.vsix"

mkdir -p .build
echo "$VSIX_FILE" > .build/test-vsix-path

echo "Test VSIX: $VSIX_FILE"
