#!/usr/bin/env bash
# Content digest of a store zip: sha256 over "<path>\0<sha256 of the file>\n" for
# every file entry, sorted by path (bytewise). Two zips built from the same tree at
# different times differ byte for byte (archiver stamps each entry's mtime) but
# share this digest, so it is what pins "the exact package that was built".
# Usage: scripts/zip-content-digest.sh <zip>   -> prints the hex digest
set -euo pipefail
zip="${1:?usage: zip-content-digest.sh <zip>}"
unzip -Z1 "$zip" | grep -v '/$' | LC_ALL=C sort | while IFS= read -r name; do
  case "$name" in *'['*|*']'*|*'*'*|*'?'*|*'\'*) echo "unsupported character in zip entry name" >&2; exit 1 ;; esac
  printf '%s\0%s\n' "$name" "$(unzip -p "$zip" "$name" | sha256sum | cut -d' ' -f1)"
done | sha256sum | cut -d' ' -f1
