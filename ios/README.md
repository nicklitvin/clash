# Clash for iOS

A native SwiftUI app that runs the Clash web game full screen in a `WKWebView`.
The game files (`index.html`, `style.css`, `game.js`, `fonts/`, `icons/`) are copied
into the app bundle on every build, so the app works offline and always ships the
current version of the game.

What the native shell adds:

- Full screen: no status bar, the home indicator hides, and swipes near the screen
  edges go to the game first.
- Native haptics for clicks, building, explosions, wins and losses.
- Your save game, best score and settings are kept in iOS storage (`UserDefaults`),
  so they survive app restarts and updates.
- The game is served from `clash://game/…` (see `BundleSchemeHandler.swift`), which
  gives the page a stable origin for fonts and storage.

## Requirements

- Xcode 15 or later
- iOS 16 or later (iPhone and iPad)

## Build: option 1, XcodeGen (recommended)

```sh
brew install xcodegen
cd ios
xcodegen            # creates Clash.xcodeproj from project.yml
open Clash.xcodeproj
```

In Xcode, select the **Clash** target, open **Signing & Capabilities**, pick your
team, and change the bundle identifier from `com.example.clash` to your own. Then
choose a device or simulator and press Run.

## Build: option 2, a new Xcode project by hand

1. In Xcode, create a new **iOS App** project named `Clash` (Interface: SwiftUI,
   Language: Swift) and save it inside this `ios/` folder.
2. Delete the generated `ContentView.swift` and `ClashApp.swift`.
3. Drag everything in `ios/Clash/` into the project (check "Copy items if needed"
   off, and add them to the Clash target). Replace the generated asset catalog with
   `Clash/Assets.xcassets`.
4. In the target's **Build Settings**:
   - set **Info.plist File** to `Clash/Info.plist` and **Generate Info.plist File** to No
   - set **User Script Sandboxing** to No
   - set **iOS Deployment Target** to 16.0
5. In **Build Phases**, add a **Run Script** phase (after Copy Bundle Resources)
   with this script:

   ```sh
   bash "${PROJECT_DIR}/copy-web.sh"
   ```

6. Pick your signing team and run.

## Files

```
project.yml                  XcodeGen spec
copy-web.sh                  build step that copies the web game into the app
Clash/ClashApp.swift         app entry point (full screen, dark)
Clash/GameView.swift         the WKWebView, haptics and navigation handling
Clash/BundleSchemeHandler.swift  serves the bundled game files at clash://game/
Clash/NativeStore.swift      keeps the game's localStorage in UserDefaults
Clash/Info.plist             app settings
Clash/Assets.xcassets        app icon and launch colour
```

## Debugging

Debug builds can be inspected from Safari on a Mac: enable **Develop** in Safari's
settings, then use **Develop → (your device) → Clash**.
