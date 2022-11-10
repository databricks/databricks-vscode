for PACKAGE in "packages/databricks-vscode" "packages/databricks-sdk-js" "packages/databricks-vscode-types"; do
    tmpfile=$(mktemp /tmp/generate_changelog.XXXXXX)
    echo "## $PACKAGE" >> $tmpfile

    TAG=$(git describe --abbrev=0 --match "release-v*")
    if [ $? -ne 0 ]; then
        echo "No release tag matching pattern 'release-v*' found. Generating changelog from begining"
        yarn conventional-changelog -k $PACKAGE --commit-path $PACKAGE >> $tmpfile
    else
        echo "Release tag found. Generating changelog from $TAG"
        yarn conventional-changelog --tag-prefix="release-v" -k $PACKAGE --commit-path $PACKAGE >> $tmpfile
    fi

    cat $tmpfile | grep -Ev "Release: v.+" > $tmpfile
    cat $tmpfile >> $1
    cat $tmpfile >> $PACKAGE/CHANGELOG.md
done
