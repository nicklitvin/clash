import SwiftUI

/// Clash for iOS: a native shell around the web game.
/// The game itself (index.html, style.css, game.js, fonts) is copied into the app bundle at build time
/// and runs offline inside a WKWebView.
@main
struct ClashApp: App {
    var body: some Scene {
        WindowGroup {
            ZStack {
                Color(red: 7 / 255, green: 7 / 255, blue: 15 / 255)
                    .ignoresSafeArea()
                GameView()
                    .ignoresSafeArea()
            }
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)   // hide the home indicator while playing
            .defersSystemGestures(on: .all)      // swipes near the screen edges go to the game first
            .preferredColorScheme(.dark)
        }
    }
}
