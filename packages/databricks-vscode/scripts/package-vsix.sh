#!/bin/bash

set -ex

# get path of the script
cd $(dirname $(realpath $0))/..

ARCH=$1

case $ARCH in
  "darwin-x64")
    CLI_ARCH="darwin_amd64"
    VSXI_ARCH="darwin-x64"
    ;;
  "darwin-arm64")
    CLI_ARCH="darwin_arm64"
    VSXI_ARCH="darwin-arm64"
    ;;
  "linux-x64")
    CLI_ARCH="linux_amd64"
    VSXI_ARCH="linux-x64"
    ;;
  "linux-arm64")
    CLI_ARCH="linux_arm64"
    VSXI_ARCH="linux-arm64"
    ;;
  "win32-x64")
    CLI_ARCH="windows_amd64"
    VSXI_ARCH="win32-x64"
    ;;
  "win32-arm64")
    CLI_ARCH="windows_arm64"
    VSXI_ARCH="win32-arm64"
    ;;
  *)
    echo "Unknown architecture: $ARCH"
    exit 1
    ;;
esac

# Download databricks cli to the .build directory with the correct arch for the environment that runs this script (not the target arch of the vsix)
# This CLI is used to request metadata about CLIs terraform dependencies.
if [ ! -d ./.build ]; then
  mkdir ./.build
  BUILD_PLATFORM_ARCH="$(uname -s | awk '{print tolower($0)}')_$(uname -m)"
  ./scripts/fetch-databricks-cli.sh $BUILD_PLATFORM_ARCH ./.build
fi

rm -rf bin
./scripts/fetch-databricks-cli.sh $CLI_ARCH
yarn ts-node ./scripts/setArchInPackage.ts $VSXI_ARCH -f package.json --cliArch $CLI_ARCH -V $VSXI_ARCH -c $(git rev-parse --short HEAD)

# Don't bundle terraform for win32-arm64 as they don't support it yet: https://github.com/hashicorp/terraform/issues/32719
if [ $ARCH != "win32-arm64" ]; then
  yarn ts-node ./scripts/setupCLIDependencies.ts --cli ./.build/databricks --binDir ./bin --package ./package.json --arch $CLI_ARCH
fi

yarn run prettier package.json --write
TAG="release-v$(cat package.json | jq -r .version)" yarn run package -t $VSXI_ARCH

git checkout -- package.json


