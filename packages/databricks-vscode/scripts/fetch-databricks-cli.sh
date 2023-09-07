#!/bin/bash 
set -ex

CLI_VERSION=$(cat package.json | jq -r .cli.version)

CLI_ARCH=$1
if [ -z "$CLI_ARCH" ]; then
    CLI_ARCH="$(uname -s | awk '{print tolower($0)}')_$(uname -m)"
fi

CLI_DIR=$(mktemp -d -t databricks-XXXXXXXXXX)
pushd $CLI_DIR
gh release download v${CLI_VERSION} --pattern "databricks_cli_${CLI_VERSION}_${CLI_ARCH}.zip" --repo databricks/cli
unzip databricks_*_$CLI_ARCH.zip
rm databricks_*_$CLI_ARCH.zip
ls

popd
mkdir -p bin
cd ./bin
rm -rf databricks
mv $CLI_DIR/databricks* .
rm -rf $CLI_DIR
