git tag -l --sort=-committerdate
TAG=$(git tag -l --sort=-committerdate | grep -E "release-v(([0-9]+\.){2}[0-9]+)" | head -n1)

process() {
    PACKAGE=$1
    NEW_VERSION=$2
    OUTFILE=$3
    latestChangelog=$(mktemp /tmp/generate_changelog.XXXXXX)
    echo "## $PACKAGE" >> $latestChangelog

    if [[ $TAG ]]; then
        echo "Release tag found. Generating changelog from $TAG"
        yarn conventional-changelog --tag-prefix="release-v" -k $PACKAGE --commit-path $PACKAGE >> $latestChangelog
    else
        echo "No release tag matching pattern 'release-v*' found. Generating changelog from begining"
        yarn conventional-changelog -k $PACKAGE --commit-path $PACKAGE >> $latestChangelog
    fi

    cat $latestChangelog | grep -Ev "Release: v.+" >> $OUTFILE

    tmpfile=$(mktemp /tmp/generate_changelog.XXXXXX)
    echo "# Release: v$NEW_VERSION" >> $tmpfile
    cat $latestChangelog | grep -Ev "Release: v.+" >> $tmpfile
    cat $PACKAGE/CHANGELOG.md >> $tmpfile

    cat $tmpfile > $PACKAGE/CHANGELOG.md
}

if [[ "$1" != "0.0.0" ]]; then
    for PACKAGE in "packages/databricks-vscode" "packages/databricks-vscode-types"; do
        process $PACKAGE $1 $3
    done
fi

if [[ "$2" != "0.0.0" ]]; then
    process "packages/databricks-sdk-js" $2 $3
fi
