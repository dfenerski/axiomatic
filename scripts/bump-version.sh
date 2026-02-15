#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 0.1.0"
  exit 1
fi

VERSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# package.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"

# tauri.conf.json
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/src-tauri/tauri.conf.json"

# Cargo.toml (only the first version line — the package version)
sed -i "0,/^version = \".*\"/s//version = \"$VERSION\"/" "$ROOT/src-tauri/Cargo.toml"

# Lockfiles
npm install --package-lock-only --silent 2>/dev/null
(cd "$ROOT/src-tauri" && cargo generate-lockfile --quiet 2>/dev/null)

echo "Bumped to $VERSION:"
grep -n "\"version\"" "$ROOT/package.json" | head -1
grep -n "\"version\"" "$ROOT/src-tauri/tauri.conf.json" | head -1
grep -n "^version" "$ROOT/src-tauri/Cargo.toml"
