#!/bin/bash

set -e

GO_SDK_HASH=${1:-main}

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )
OPENAPI=$DIR/all-internal.json

go run github.com/databricks/databricks-sdk-go/openapi/gen@$GO_SDK_HASH -spec $OPENAPI -target $DIR/src
