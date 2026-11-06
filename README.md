# Clash

A single-player, defense-only village game in 8-bit pixel art.
Build by day. Survive a raid every night. How many nights can you last?

## Play

Open `index.html` through any web server, for example:

```sh
npx serve .
```

On a phone, open the page and use **Add to Home Screen**. It then runs full
screen and works offline.

## How it works

- **Day: build.** Build and upgrade. Everything except walls takes at least a
  day and needs a free builder (one per Builder's Hut). Walls go up instantly:
  tap or drag to lay many at once, then confirm to buy them all.
- **Night: fight.** A wave attacks in the dark. Your defenses fight on their own.
- After each night, a summary shows what your Gold Mines and Elixir Collectors
  earned before you start the next day. There is no extra survival bonus.
- Tap any building to see its stats, repair it or upgrade it. Damage stays
  until you pay gold to repair it, and you can repair mid-raid. **Repair** in
  the bottom left fixes everything at once.
- **Spells (Town Hall 4):** build a Spell Factory, brew Lightning, Heal and
  Freeze by day, and cast them at night (tap a spell, then tap the map; keys
  1–3 also work).
- Zoom with the mouse wheel, a pinch, or the + / − keys.
- The Town Hall stores gold and elixir first; anything over its limit is split
  evenly across your storages. Tap a building to see how much it holds.
- The moment your Town Hall falls, the game is over. The village saves itself
  every day.
- Cute, simple pixel art in the style of a handheld RPG: a top-down map with
  little houses and chibi raiders. Tap the version number in the top left to read the patch notes.

## Files

```
index.html             page and HUD markup
style.css              interface styles
game.js                the whole game: simulation, pixel renderer, UI, sound
manifest.webmanifest   home-screen install info
sw.js                  offline cache (bump VERSION when files change)
fonts/                 Pixelify Sans (SIL Open Font License)
icons/                 app icons
```

When you ship a change, bump `GAME_VERSION` and add an entry to
`PATCH_NOTES` at the top of `game.js`, and bump `VERSION` in `sw.js`.

There are no build steps and no internet dependencies, so the folder can be
wrapped as-is.

## Mobile apps

Use [Capacitor](https://capacitorjs.com) for iOS and Android. Electron only
builds desktop apps.

```sh
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init Clash com.example.clash --web-dir .
npx cap add android   # and/or: npx cap add ios
npx cap open android
```

For a desktop app, point an Electron `BrowserWindow` at `index.html`.
