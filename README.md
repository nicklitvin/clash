# Clash

A single-player, defense-only village game in 8-bit pixel art.
Build at night. Survive a raid every day. How many days can you last?

## Play

Open `index.html` through any web server, for example:

```sh
npx serve .
```

On a phone, open the page and use **Add to Home Screen**. It then runs full
screen and works offline.

## How it works

- **Night:** build and upgrade. Bigger projects take 1–3 days to finish, and
  each Builder's Hut runs one project at a time.
- **Day:** a wave attacks. Your defenses fight on their own.
- If your Town Hall falls, the run is over. The village saves itself every
  night.

## Files

```
index.html             page and HUD markup
style.css              interface styles
game.js                the whole game: simulation, pixel renderer, UI, sound
manifest.webmanifest   home-screen install info
sw.js                  offline cache (bump VERSION when files change)
fonts/                 Press Start 2P and Silkscreen (SIL Open Font License)
icons/                 app icons
```

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
