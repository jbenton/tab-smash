#!/usr/bin/env bash
set -euo pipefail

if ! command -v magick >/dev/null 2>&1; then
  echo "ImageMagick 'magick' not found. Install it first." >&2
  exit 1
fi

SRC="${1:-public/icons/icon-512.png}"
PREFIX="icon"
OUT="public/icons"
mkdir -p "$OUT"

for SIZE in 16 32 48 256 512; do
  magick "$SRC" -resize ${SIZE}x${SIZE} "$OUT/${PREFIX}-${SIZE}.png"
  echo "Wrote $OUT/${PREFIX}-${SIZE}.png"
done

# Special 128px icon: Chrome Web Store requires 16px transparent padding on all sides
# (active art area 96x96 centered on 128x128 canvas).
magick "$SRC" -resize 96x96 \
  -background none -gravity center -extent 128x128 \
  "$OUT/${PREFIX}-128.png"
echo "Wrote $OUT/${PREFIX}-128.png (96px art with 16px transparent padding)"

echo "Done. Update manifest if needed and reload the extension."
