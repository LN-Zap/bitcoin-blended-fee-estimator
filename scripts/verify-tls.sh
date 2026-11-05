#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
image=${1:-fee-estimator:tls-check}
docker build -t "$image" .
docker run --rm --entrypoint sh "$image" -c 'id; bun --version; cat /etc/alpine-release; apk list --installed ca-certificates-bundle'
docker run --rm --entrypoint bun -v "$PWD/test:/usr/src/app/test:ro" "$image" test test/tls-trust.test.ts
docker run --rm --entrypoint bun -v "$PWD/scripts:/usr/src/app/scripts:ro" "$image" scripts/verify-tls.ts
