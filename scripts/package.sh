#!/usr/bin/env bash
# Build the Chrome Web Store upload: dist/ask-pi-<version>.zip
# The zip contains the contents of extension/ (manifest.json at the root).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('$root/extension/manifest.json').version")"
out="$root/dist/ask-pi-$version.zip"

mkdir -p "$root/dist"
rm -f "$out"
(cd "$root/extension" && zip -qr -X "$out" . -x '.*' -x '*/.*')

echo "$out"
unzip -l "$out" | tail -n +4 | head -n -2
