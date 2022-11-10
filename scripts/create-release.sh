set -e

tmpfile=$(mktemp /tmp/commit-message.XXXXX)
git show -s --format=%B HEAD > $tmpfile
TITLE=$(cat $tmpfile | head -n1)
BODY=$(cat $tmpfile | awk 'BEGIN{C=0} NR > 1 && (NF!=0 || C==1){print $0; C=1}')
RELEASE_VERSION=$(echo "$TITLE" | sed -nr 's/Release: v(([0-9]+\.){2}[0-9]+)/\1/p') 
gh release create release-v$RELEASE_VERSION $1 \
    -d --target fix-release-actions -t '$TITLE' -n '$BODY'
