# Clash: notes for Claude

## Git
- Push after every commit: `git push -u origin <branch>` right after each `git commit`, with no batching and no waiting to be asked.
- Work on `main` unless told otherwise.

## Releases
- When a change ships, bump `GAME_VERSION` and add an entry to the top of `PATCH_NOTES` in `game.js`, and bump `VERSION` in `sw.js`.
