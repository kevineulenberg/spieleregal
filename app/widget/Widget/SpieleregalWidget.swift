// Spieleregal-Widget: zeigt die zuletzt gespielten Spiele aus der Bibliothek des Game Launchers.
import AppKit
import ImageIO
import SwiftUI
import WidgetKit

struct Game: Identifiable {
    let id: String
    let title: String
    let image: NSImage?
    let ratio: CGFloat
}

struct Entry: TimelineEntry {
    let date: Date
    let games: [Game]
    let recent: Bool
}

enum Library {
    // Die Erweiterung läuft in der Sandbox; der echte Benutzerordner kommt aus der Benutzerdatenbank
    static var folder: URL {
        let home = String(cString: getpwuid(getuid()).pointee.pw_dir)
        return URL(fileURLWithPath: home).appendingPathComponent("Library/Application Support/Game Launcher")
    }

    static func number(_ value: Any?) -> Double { (value as? NSNumber)?.doubleValue ?? 0 }

    static func thumbnail(_ path: String?) -> NSImage? {
        guard let path, let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 440,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return NSImage(cgImage: image, size: NSSize(width: image.width, height: image.height))
    }

    static func load(limit: Int) -> (games: [Game], recent: Bool) {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("library.json")),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = root["games"] as? [[String: Any]] else { return ([], false) }
        let played = list.filter { number($0["lastPlayed"]) > 0 }.sorted { number($0["lastPlayed"]) > number($1["lastPlayed"]) }
        let rest = list.filter { number($0["lastPlayed"]) == 0 }.sorted { number($0["addedAt"]) > number($1["addedAt"]) }
        let games = (played + rest).prefix(limit).compactMap { item -> Game? in
            guard let id = item["id"] as? String else { return nil }
            let image = thumbnail(item["cover"] as? String)
            var ratio = CGFloat(number(item["ratio"]))
            if image == nil || ratio <= 0 { ratio = 0.7 }
            return Game(id: id, title: item["title"] as? String ?? id, image: image, ratio: min(1.2, max(0.62, ratio)))
        }
        return (Array(games), !played.isEmpty)
    }
}

struct Provider: TimelineProvider {
    func entry(for context: Context) -> Entry {
        let loaded = Library.load(limit: context.family == .systemLarge ? 8 : 4)
        return Entry(date: Date(), games: loaded.games, recent: loaded.recent)
    }

    func placeholder(in context: Context) -> Entry { Entry(date: Date(), games: [], recent: true) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(entry(for: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [entry(for: context)], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

struct Cover: View {
    let game: Game

    var body: some View {
        Link(destination: URL(string: "spieleregal://launch/\(game.id)")!) {
            Group {
                if let image = game.image {
                    Image(nsImage: image).resizable().aspectRatio(game.ratio, contentMode: .fit)
                } else {
                    ZStack(alignment: .bottomLeading) {
                        LinearGradient(colors: [Color(red: 0.36, green: 0.24, blue: 0.62), Color(red: 0.12, green: 0.09, blue: 0.2)], startPoint: .topLeading, endPoint: .bottomTrailing)
                        Text(game.title).font(.system(size: 11, weight: .heavy)).foregroundStyle(.white).lineLimit(3).padding(6)
                    }
                    .aspectRatio(game.ratio, contentMode: .fit)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
            .shadow(color: .black.opacity(0.45), radius: 5, y: 3)
        }
        .accessibilityLabel("\(game.title) spielen")
    }
}

struct WidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                Text("Spieleregal").font(.system(size: 14, weight: .heavy)).foregroundStyle(.white)
                Spacer()
                Text(entry.recent ? "Zuletzt gespielt" : "Deine Spiele").font(.system(size: 11, weight: .medium)).foregroundStyle(.white.opacity(0.6))
            }
            if entry.games.isEmpty {
                Text("Noch keine Spiele im Regal. Öffne den Game Launcher und füge welche hinzu.")
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.7))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else if family == .systemLarge {
                row(Array(entry.games.prefix(4)))
                if entry.games.count > 4 { row(Array(entry.games.dropFirst(4))) }
            } else {
                row(entry.games)
            }
        }
        .widgetURL(URL(string: "spieleregal://open"))
    }

    func row(_ games: [Game]) -> some View {
        HStack(spacing: 9) {
            ForEach(games) { Cover(game: $0) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

@main
struct SpieleregalWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SpieleregalRecent", provider: Provider()) { entry in
            WidgetView(entry: entry)
                .containerBackground(for: .widget) {
                    LinearGradient(colors: [Color(red: 0.16, green: 0.12, blue: 0.26), Color(red: 0.05, green: 0.04, blue: 0.08)], startPoint: .topTrailing, endPoint: .bottomLeading)
                }
        }
        .configurationDisplayName("Spieleregal")
        .description("Deine zuletzt gespielten Spiele. Ein Klick aufs Cover startet das Spiel.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
