#!/bin/bash

set -ex

# get path of the script
cd $(dirname $(realpath $0))/..

ARCH=$1

case $ARCH in
  "darwin-x64")
    BRICKS_ARCH="darwin_amd64"
    VSXI_ARCH="darwin-x64"
    ;;
  "darwin-arm64")
    BRICKS_ARCH="darwin_arm64"
    VSXI_ARCH="darwin-arm64"
    ;;
  "linux-x64")
    BRICKS_ARCH="linux_amd64"
    VSXI_ARCH="linux-x64"
    ;;
  "linux-arm64")
    BRICKS_ARCH="linux_arm64"
    VSXI_ARCH="linux-arm64"
    ;;
  "win32-x64")
    BRICKS_ARCH="windows_amd64"
    VSXI_ARCH="win32-x64"
    ;;
  "win32-arm64")
    BRICKS_ARCH="windows_arm64"
    VSXI_ARCH="win32-arm64"
    ;;
  *)
    echo "Unknown architecture: $ARCH"
    exit 1
    ;;
esac

rm -rf bin
./scripts/fetch-bricks-cli.sh $BRICKS_ARCH
yarn ts-node ./scripts/set_arch_in_package.ts $VSXI_ARCH -f package.json -b $BRICKS_ARCH -V $VSXI_ARCH -c $(git rev-parse --short HEAD)
yarn run prettier package.json --write
TAG="release-v$(cat package.json | jq -r .version)" yarn run package -t $VSXI_ARCH

git checkout -- package.json


