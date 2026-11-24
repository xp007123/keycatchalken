import Cocoa
import WebKit

/// The 调节 window: web/settings.html lists the behaviour settings defined in web/tuning.js.
/// Each change is saved at once (only values that differ from the defaults) and pushed to the cat.
@MainActor
final class SettingsWindow: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    weak var app: AppDelegate?
    var window: NSWindow?
    var view: WKWebView?

    init(app: AppDelegate) { self.app = app }

    func show() {
        if window == nil { build() }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    private func build() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(WeakScriptHandler(self), name: "settings")
        let height = min(860, (NSScreen.main?.visibleFrame.height ?? 900) - 60)
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 420, height: height), configuration: config)
        view.navigationDelegate = self
        view.setValue(false, forKey: "drawsBackground")
        let window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable, .miniaturizable],
                              backing: .buffered, defer: false)
        window.title = "KeyCat 调节"
        window.contentView = view
        window.isReleasedWhenClosed = false
        window.center()
        if let page = Bundle.main.url(forResource: "settings", withExtension: "html", subdirectory: "web") {
            view.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        }
        self.window = window
        self.view = view
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let app, let data = try? JSONSerialization.data(withJSONObject: app.tune),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("initTune(\(json))", completionHandler: nil)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let app, let body = message.body as? [String: Any] else { return }
        if let change = body["tune"] as? [String: Any] {
            var tune = app.tune
            for (key, value) in change { tune[key] = value }
            app.tune = tune
            app.pushOptions()
        } else if body["reset"] != nil {
            app.tune = [:]
            app.pushOptions()
        } else if let test = body["test"] as? String {
            if test == "annoy" {
                app.js("cat.annoyNow()")
            } else if test == "curious" {
                app.js("cat.curiousNow(3)")
            } else if test.hasPrefix("act:") {
                // Plays one idle fidget; the name is checked so nothing else reaches the page.
                let kind = String(test.dropFirst(4))
                if !kind.isEmpty, kind.allSatisfy({ $0.isASCII && $0.isLetter }) { app.js("cat.act('\(kind)')") }
            }
        }
    }
}
