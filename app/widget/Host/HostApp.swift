// Trägerprogramm für das Widget: nimmt Klicks aus dem Widget entgegen und reicht sie an den Game Launcher weiter.
import AppKit
import SwiftUI
import WidgetKit

@main
struct HostApp: App {
    @NSApplicationDelegateAdaptor(Delegate.self) var delegate
    var body: some Scene { Settings { EmptyView() } }
}

final class Delegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        WidgetCenter.shared.reloadAllTimelines()
        // Läuft nur kurz: Aufgabe erledigen, dann beenden
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { NSApp.terminate(nil) }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            if url.host == "reload" {
                WidgetCenter.shared.reloadAllTimelines()
                continue
            }
            guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { continue }
            parts.scheme = "spieleregal-launcher"
            if let target = parts.url { NSWorkspace.shared.open(target) }
        }
    }
}
