#!/usr/bin/env bash

# Echoes a version based on the git hashes of the element-web and js-sdk checkouts,
# or falls back to a default when not inside a git repo (e.g., GitHub tarball builds).

set -e

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    JSSDK_SHA=$(git -C node_modules/matrix-js-sdk rev-parse --short=12 HEAD || echo "unknownjs")
    VECTOR_SHA=$(git rev-parse --short=12 HEAD || echo "unknownvector")
    echo "${VECTOR_SHA}-js-${JSSDK_SHA}"
else
    echo "0.0.0"
fi
