for PACKAGE in "packages/databricks-vscode" "packages/databricks-sdk" "packages/databricks-vscode-types" "."; do
    echo "## $PACKAGE" >> $1

    TAG=$(git describe --abbrev=0 --match "release-v*")
    if [ $? -ne 0 ]; then
        echo "No release tag matching pattern 'release-v*' found. Generating changelog from begining"
        yarn conventional-changelog -k $PACKAGE --commit-path $PACKAGE >> $1
    else
        echo "Release tag found. Generating changelog from $TAG"
        yarn conventional-changelog --tag-prefix="release-v" -k $PACKAGE --commit-path $PACKAGE >> $1
    fi
done
