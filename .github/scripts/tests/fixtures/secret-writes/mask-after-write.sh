#!/usr/bin/env bash
# Must be flagged: the mask comes after the write.
echo "JFROG_ACCESS_TOKEN=${ACCESS_TOKEN}" >> "$GITHUB_ENV"
echo "::add-mask::${ACCESS_TOKEN}"
