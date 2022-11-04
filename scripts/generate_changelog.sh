PACKAGE= $1
echo "## $PACKAGE" >> $2

TAG=$(git describe --abbrev=0 --match "release-v*")
if [ $? -ne 0 ]; then
    echo "No release tag matching pattern 'release-v*' found. Generating changelog from beggining"
    yarn conventional-changelog -k $PACKAGE --commit-path $PACKAGE >> $2
else
    echo "Release tag found. Generating changelog from $TAG"
    yarn conventional-changelog --tag-prefix="release-v" -k $PACKAGE --commit-path $PACKAGE >> $2
fi
