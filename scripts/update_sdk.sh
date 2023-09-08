#!/bin/bash

set -e
set -o pipefail

DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

VERSION=$(cat package.json | jq -r '.versions.sdk')

rm -rf vendor 
mkdir vendor 
gh release download -R databricks/databricks-sdk-js v${VERSION} -p '*.tgz' 
mv *.tgz vendor/databricks-sdk-v${VERSION}.tgz 

for F in $(ls packages/*/package.json); do
    sed -i -e "s/\"@databricks\/databricks-sdk\": \".*\"/\"@databricks\/databricks-sdk\": \"..\/..\/vendor\/databricks-sdk-v${VERSION}.tgz\"/g" $F
done

yarn install