#!/bin/bash

set -e

GO_SDK_HASH=${1:-main}

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )
OPENAPI=$DIR/all-internal.json

pushd $DIR/../../../databricks-sdk-go
git checkout $GO_SDK_HASH || git pull && git checkout $GO_SDK_HASH
go run openapi/gen/main.go -spec $OPENAPI -target $DIR/src/apis
popd