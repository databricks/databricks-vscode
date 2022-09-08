#!/bin/bash 
set -ex

BRICKS_VERSION=${1:-}

BRICKS_ARCH=$2
if [ -z "$BRICKS_ARCH" ]; then
    BRICKS_ARCH="$(uname -s | awk '{print tolower($0)}')_$(uname -m)"
fi

BRICKS_DIR=$(mktemp -d -t bricks-XXXXXXXXXX)
pushd $BRICKS_DIR
gh release download $BRICKS_VERSION -R databricks/bricks -p "*$BRICKS_ARCH.zip"
unzip bricks_*_$BRICKS_ARCH.zip
rm bricks_*_$BRICKS_ARCH.zip
ls

popd
mkdir -p bin
cd ./bin
rm -rf bricks
BRICKS_BINARY=$(cd $BRICKS_DIR && ls bricks*)
# strip the version from the binary name but keep exe on Windows
BRICKS_TARGET_NAME=$(echo $BRICKS_BINARY | sed -E 's/(.*)_v[0-9]\.[0-9]\.[0-9](\.exe)?/\1\2/g')
mv $BRICKS_DIR/$BRICKS_BINARY $BRICKS_TARGET_NAME
rm -rf $BRICKS_DIR
