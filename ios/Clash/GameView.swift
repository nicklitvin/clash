import SwiftUI
import UIKit
import WebKit

/// Hosts the game in a full-screen WKWebView.
struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Serve the bundled game files from clash://game/... so the page has a real origin.
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Bridges from the page: native haptics, and a copy of localStorage kept in UserDefaults.
        let contentController = config.userContentController
        contentController.add(context.coordinator, name: "haptic")
        contentController.add(context.coordinator, name: "store")
        contentController.addUserScript(WKUserScript(source: NativeStore.bootstrapScript(),
                                                     injectionTime: .atDocumentStart,
                                                     forMainFrameOnly: true))

        let webView = WKWebView(frame: .zero, configuration: config)
        let background = UIColor(red: 7 / 255, green: 7 / 255, blue: 15 / 255, alpha: 1)
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        // The game handles every touch itself: no page scrolling, bouncing or pinch-zooming.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = context.coordinator
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }   // debug with Safari's Web Inspector
        #endif
        webView.load(URLRequest(url: BundleSchemeHandler.startURL))
        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        weak var webView: WKWebView?

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "haptic":
                Haptics.play(message.body as? String ?? "")
            case "store":
                NativeStore.apply(message.body)
            default:
                break
            }
        }

        // Keep navigation inside the game; open anything else in Safari.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
            if url.scheme == BundleSchemeHandler.scheme || url.scheme == "about" {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            }
        }

        // If iOS kills the web content process (memory pressure), start the game again.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.load(URLRequest(url: BundleSchemeHandler.startURL))
        }
    }
}

/// Native haptics for game events (the page sends the sound effect's name).
enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let selection = UISelectionFeedbackGenerator()
    private static let notification = UINotificationFeedbackGenerator()

    static func play(_ name: String) {
        switch name {
        case "click": selection.selectionChanged()
        case "build": light.impactOccurred()
        case "boom": medium.impactOccurred()
        case "nope": notification.notificationOccurred(.warning)
        case "win": notification.notificationOccurred(.success)
        case "lose": notification.notificationOccurred(.error)
        default: break
        }
    }
}
