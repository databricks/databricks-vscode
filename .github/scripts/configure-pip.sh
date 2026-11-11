#!/usr/bin/env bash
# Point pip at the internal JFrog PyPI registry.
# Reads JFROG_ACCESS_TOKEN from the environment (set by jfrog-oidc-token.sh).
set -euo pipefail

PIP_INDEX_URL="https://gha-service-account:${JFROG_ACCESS_TOKEN}@databricks.jfrog.io/artifactory/api/pypi/db-pypi/simple"

# The URL embeds the token, so mask the whole value too (defense in depth on
# top of the token mask added by jfrog-oidc-token.sh).
echo "::add-mask::${PIP_INDEX_URL}"
echo "PIP_INDEX_URL=${PIP_INDEX_URL}" >> "$GITHUB_ENV"

echo "pip configured to use JFrog registry (db-pypi)"
