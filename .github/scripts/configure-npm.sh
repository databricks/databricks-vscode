#!/usr/bin/env bash
# Point npm and Yarn at the internal JFrog npm registry.
# Reads JFROG_ACCESS_TOKEN from the environment (set by jfrog-oidc-token.sh).
set -euo pipefail

JFROG_NPM_REGISTRY="https://databricks.jfrog.io/artifactory/api/npm/db-npm/"

# Configure npm CLI
cat > ~/.npmrc << EOF
registry=${JFROG_NPM_REGISTRY}
//databricks.jfrog.io/artifactory/api/npm/db-npm/:_authToken=${JFROG_ACCESS_TOKEN}
always-auth=true
EOF

# Configure Yarn Berry (v2+) — does not read ~/.npmrc for registry
{
  echo "YARN_NPM_REGISTRY_SERVER=${JFROG_NPM_REGISTRY}"
  echo "YARN_NPM_AUTH_TOKEN=${JFROG_ACCESS_TOKEN}"
} >> "$GITHUB_ENV"

echo "npm/yarn configured to use JFrog registry (db-npm)"
