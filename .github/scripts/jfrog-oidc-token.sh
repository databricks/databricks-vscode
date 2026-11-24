#!/usr/bin/env bash
set -euo pipefail

# Exchange a GitHub Actions OIDC token for a JFrog access token and
# write JFROG_ACCESS_TOKEN to $GITHUB_ENV so subsequent steps can use it.

# Get GitHub OIDC ID token
ID_TOKEN=$(curl -sLS \
  -H "User-Agent: actions/oidc-client" \
  -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=jfrog-github" | jq .value | tr -d '"')

if [ -z "$ID_TOKEN" ] || [ "$ID_TOKEN" = "null" ]; then
  echo "FAIL: Could not extract GitHub OIDC ID token"
  exit 1
fi

# The ID token is a bearer credential for the exchange below. Mask it so it
# cannot appear in the (public) run logs.
echo "::add-mask::${ID_TOKEN}"

# Exchange for JFrog access token
ACCESS_TOKEN=$(curl -sLS -XPOST -H "Content-Type: application/json" \
  "https://databricks.jfrog.io/access/api/v1/oidc/token" \
  -d "{\"grant_type\": \"urn:ietf:params:oauth:grant-type:token-exchange\", \"subject_token_type\":\"urn:ietf:params:oauth:token-type:id_token\", \"subject_token\": \"${ID_TOKEN}\", \"provider_name\": \"github-actions\"}" | jq .access_token | tr -d '"')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "FAIL: Could not extract JFrog access token"
  exit 1
fi

# Mask the token before it reaches $GITHUB_ENV, otherwise every later step
# prints it in its env block in the (public) run logs.
echo "::add-mask::${ACCESS_TOKEN}"
echo "JFROG_ACCESS_TOKEN=${ACCESS_TOKEN}" >> "$GITHUB_ENV"

echo "JFrog OIDC token obtained successfully"
