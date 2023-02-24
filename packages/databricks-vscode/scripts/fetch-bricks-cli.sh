#!/bin/bash 
set -ex

BRICKS_VERSION=$(cat package.json | jq -r .bricks.version)

BRICKS_ARCH=$1
if [ -z "$BRICKS_ARCH" ]; then
    BRICKS_ARCH="$(uname -s | awk '{print tolower($0)}')-$(uname -m)"
fi

BRICKS_DIR=$(mktemp -d -t bricks-XXXXXXXXXX)
pushd $BRICKS_DIR
curl https://databricks-bricks.s3.amazonaws.com/v${BRICKS_VERSION}/bricks_${BRICKS_VERSION}_${BRICKS_ARCH}.zip -o bricks_${BRICKS_VERSION}_${BRICKS_ARCH}.zip
unzip bricks_*_$BRICKS_ARCH.zip
rm bricks_*_$BRICKS_ARCH.zip
ls

popd
mkdir -p bin
cd ./bin
rm -rf bricks
mv $BRICKS_DIR/bricks* .
rm -rf $BRICKS_DIR
