#!/bin/bash
set -ex

CLI_VERSION=$(cat package.json | jq -r .cli.version)

CLI_ARCH=$1
if [ -z "$CLI_ARCH" ]; then
    CLI_ARCH="$(uname -s | awk '{print tolower($0)}')_$(uname -m)"
fi

CLI_DEST=$2
if [ -z "$CLI_DEST" ]; then
    CLI_DEST=./bin
fi

CLI_DIR=$(mktemp -d -t databricks-XXXXXXXXXX)
pushd $CLI_DIR
curl -L -O "https://github.com/databricks/cli/releases/download/v${CLI_VERSION}/databricks_cli_${CLI_VERSION}_${CLI_ARCH}.zip"
unzip databricks_*_$CLI_ARCH.zip
rm databricks_*_$CLI_ARCH.zip
ls

popd
mkdir -p $CLI_DEST
cd $CLI_DEST
rm -rf databricks
mv $CLI_DIR/databricks* .
rm -rf $CLI_DIR
