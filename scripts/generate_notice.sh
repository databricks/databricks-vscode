#!/bin/bash

set -e
set -o pipefail

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

yarn workspaces focus --production
node $DIR/generate_notice.js > NOTICE.md
yarn install
