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

# Configure Yarn Berry (v2+).
# YARN_NPM_AUTH_TOKEN env var is not reliably scoped to a custom
# YARN_NPM_REGISTRY_SERVER in Yarn 3 — write ~/.yarnrc.yml directly so the
# auth token is co-located with the registry entry, which is how Yarn Berry
# handles scoped registry auth.
cat >> ~/.yarnrc.yml << EOF
npmRegistryServer: "${JFROG_NPM_REGISTRY}"
npmRegistries:
  "${JFROG_NPM_REGISTRY}":
    npmAuthToken: "${JFROG_ACCESS_TOKEN}"
    npmAlwaysAuth: true
EOF

echo "npm/yarn configured to use JFrog registry (db-npm)"
