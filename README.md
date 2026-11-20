# Clash

A single-player, defense-only village game with a neon look.
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
- **Night: fight.** A wave attacks. Your defenses fight on their own.
- After each night, a summary shows what your mines and pumps earned before
  you start the next day.
- Tap any building to see its stats, repair it or upgrade it. Damage stays
  until you repair it. **Upgrade** (bottom right) lists every repair and every
  upgrade you can make, with a button for each; at night it shows repairs only.
- **Arrange** (bottom right): move buildings, pick up all walls, or pick up all
  buildings and place them back from an inventory bar. Anything left unplaced
  is stored and can be placed later from the shop.
- You start with one builder; build more Builder's Huts to work on several
  projects at once.
- Raiders walk around walls, or break through when the way round is too long.
- **Spells (Town Hall 4):** build a Spell Factory, brew Lightning, Heal and
  Freeze by day, and cast them at night (tap a spell, then tap the map; keys
  1–3 also work).
- The Town Hall stores resources first; anything over its limit is split
  evenly across your storages. Tap a building to see how much it holds.
- Tap the Day/Night box for village stats; the version number and patch notes
  are at the bottom of that window.
- Tap a resource bar to cycle through resource styles (Gold & Energy, Gold &
  Plasma, Gold & Crystal, Credits & Fuel).
- Zoom with the Zoom button (press and drag left or right), the mouse wheel,
  a pinch, a double tap on the map, or the + / − keys.
- The moment your Town Hall falls, the game is over. The village saves itself
  every day.
- Neon look: glowing outlines on a dark grid.

## Files

```
index.html             page and HUD markup
style.css              interface styles
game.js                the whole game: simulation, neon renderer, UI, sound
manifest.webmanifest   home-screen install info
sw.js                  offline cache (bump VERSION when files change)
fonts/                 Inter and Exo 2 (SIL Open Font License)
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
