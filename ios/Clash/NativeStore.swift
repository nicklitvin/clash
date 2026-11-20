import Foundation

/// Keeps a copy of the page's localStorage (the save game, best score and settings) in UserDefaults.
///
/// WKWebView may not keep localStorage for a custom URL scheme between launches, so a small script,
/// injected before the game runs, refills localStorage from this copy and reports every change back.
enum NativeStore {
    private static let defaultsKey = "clash.localStorage"

    static var values: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: defaultsKey) }
    }

    /// Handles a message from the page: {op: "set" | "remove" | "clear", key, value}.
    static func apply(_ body: Any) {
        guard let message = body as? [String: Any], let op = message["op"] as? String else { return }
        var current = values
        switch op {
        case "set":
            guard let key = message["key"] as? String, let value = message["value"] as? String else { return }
            current[key] = value
        case "remove":
            guard let key = message["key"] as? String else { return }
            current.removeValue(forKey: key)
        case "clear":
            current.removeAll()
        default:
            return
        }
        values = current
    }

    /// Script run at document start: restore saved values, then mirror every localStorage change to native.
    static func bootstrapScript() -> String {
        let json: String = {
            guard let data = try? JSONSerialization.data(withJSONObject: values),
                  let text = String(data: data, encoding: .utf8) else { return "{}" }
            return text
        }()
        return """
        (function () {
          var saved = \(json);
          try { for (var k in saved) { localStorage.setItem(k, saved[k]); } } catch (e) {}
          var send = function (op, key, value) {
            try { window.webkit.messageHandlers.store.postMessage({ op: op, key: key, value: value }); } catch (e) {}
          };
          var proto = Storage.prototype, setItem = proto.setItem, removeItem = proto.removeItem, clear = proto.clear;
          proto.setItem = function (key, value) {
            setItem.call(this, key, value);
            if (this === window.localStorage) send('set', String(key), String(value));
          };
          proto.removeItem = function (key) {
            removeItem.call(this, key);
            if (this === window.localStorage) send('remove', String(key));
          };
          proto.clear = function () {
            clear.call(this);
            if (this === window.localStorage) send('clear');
          };
        })();
        """
    }
}
