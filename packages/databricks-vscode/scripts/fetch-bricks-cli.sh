#!/bin/bash 
set -ex

BRICKS_VERSION=${1:-}

BRICKS_ARCH=$2
if [ -z "$BRICKS_ARCH" ]; then
    BRICKS_ARCH="$(uname -s | awk '{print tolower($0)}')_$(uname -m)"
fi

pushd /tmp
rm -rf bricks_*
gh release download $BRICKS_VERSION -R databricks/bricks -p "*$BRICKS_ARCH.tar.gz"
tar -xvf bricks_*_$BRICKS_ARCH.tar.gz

popd
mkdir -p bin
cd ./bin
rm -rf bricks
mv /tmp/bricks ./
