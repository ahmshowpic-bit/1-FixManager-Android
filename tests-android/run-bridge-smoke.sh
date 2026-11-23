#!/usr/bin/env bash
# Runs bridge-smoke with routerFactory temporarily swapped to the in-process MiniRouter
# (what the Android bundle does via the Vite alias). The original file is always restored.
set -e
cd "$(dirname "$0")/../backend"
F=src/core/http/routerFactory.ts
cp "$F" "$F.orig"
trap 'mv "$F.orig" "$F"' EXIT
cp src/core/http/routerFactory.mini.ts "$F"
npx tsx ../tests-android/bridge-smoke.ts
