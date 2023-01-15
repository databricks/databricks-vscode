#!/bin/bash

set -e
set -x

UNIVERSE_HASH=${1:-master}
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd .. && pwd )
OPENAPI=$DIR/all-internal.json

pushd ~/universe
git checkout $UNIVERSE_HASH || git pull && git checkout $UNIVERSE_HASH

bazel build openapi/all-internal.json
popd

rm -f $OPENAPI
cp ~/universe/bazel-bin/openapi/all-internal.json $OPENAPI