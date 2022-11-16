git tag -l --sort=-committerdate
TAG=$(git tag -l --sort=-committerdate | grep -E "release-v(([0-9]+\.){2}[0-9]+)" | head -n1)

for PACKAGE in "packages/databricks-vscode" "packages/databricks-sdk-js" "packages/databricks-vscode-types"; do
    tmpfile=$(mktemp /tmp/generate_changelog.XXXXXX)
    echo "## $PACKAGE" >> $tmpfile

    if [[ $TAG ]]; then
        echo "Release tag found. Generating changelog from $TAG"
        yarn conventional-changelog --tag-prefix="release-v" -k $PACKAGE --commit-path $PACKAGE >> $tmpfile
    else
        echo "No release tag matching pattern 'release-v*' found. Generating changelog from begining"
        yarn conventional-changelog -k $PACKAGE --commit-path $PACKAGE >> $tmpfile
    fi

    cat $tmpfile | grep -Ev "Release: v.+" >> $2
    echo "# Release: v$1" >> $PACKAGE/CHANGELOG.md
    cat $tmpfile | grep -Ev "Release: v.+" >> $PACKAGE/CHANGELOG.md
done
