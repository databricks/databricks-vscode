git tag -l --sort=-committerdate
TAG=$(git tag -l --sort=-committerdate | grep -E "release-v(([0-9]+\.){2}[0-9]+)" | head -n1)

for PACKAGE in "packages/databricks-vscode" "packages/databricks-sdk-js" "packages/databricks-vscode-types"; do
    latestChangelog=$(mktemp /tmp/generate_changelog.XXXXXX)
    echo "## $PACKAGE" >> $latestChangelog

    if [[ $TAG ]]; then
        echo "Release tag found. Generating changelog from $TAG"
        yarn conventional-changelog --tag-prefix="release-v" -k $PACKAGE --commit-path $PACKAGE >> $latestChangelog
    else
        echo "No release tag matching pattern 'release-v*' found. Generating changelog from begining"
        yarn conventional-changelog -k $PACKAGE --commit-path $PACKAGE >> $latestChangelog
    fi

    cat $latestChangelog | grep -Ev "Release: v.+" >> $2

    tmpfile=$(mktemp /tmp/generate_changelog.XXXXXX)
    echo "# Release: v$1" >> $tmpfile
    cat $latestChangelog | grep -Ev "Release: v.+" >> $tmpfile
    cat $PACKAGE/CHANGELOG.md >> $tmpfile

    cat $tmpfile > $PACKAGE/CHANGELOG.md
done
