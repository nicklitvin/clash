#!/bin/bash
# Xcode build phase: copies the web game (one folder up from ios/) into the app bundle as "web".
# Runs on every build, so the app always ships the current game.js / style.css / index.html.
set -euo pipefail
SRC="${PROJECT_DIR}/.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/web"
mkdir -p "$DEST/fonts" "$DEST/icons"
for f in index.html style.css game.js manifest.webmanifest; do
  cp "$SRC/$f" "$DEST/$f"
done
cp "$SRC"/fonts/*.woff2 "$DEST/fonts/"
cp "$SRC"/icons/*.png "$DEST/icons/"
echo "Copied the Clash web game into $DEST"
