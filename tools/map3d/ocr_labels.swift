// Find all printed text on the map with Apple Vision (local, no network).
// usage: ./ocr_labels <map.jpg> <out.json>
// Tiles the image (Vision downsamples huge inputs), returns words/lines with pixel boxes.
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count == 3, let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("usage: ocr_labels <map.jpg> <out.json>"); exit(1)
}
let W = cg.width, H = cg.height
let tile = 1400, overlap = 250
var results: [[String: Any]] = []
var y = 0
while y < H {
    var x = 0
    while x < W {
        let rect = CGRect(x: x, y: y, width: min(tile, W - x), height: min(tile, H - y))
        if let crop = cg.cropping(to: rect) {
            let req = VNRecognizeTextRequest()
            req.recognitionLevel = .accurate
            req.usesLanguageCorrection = false
            req.minimumTextHeight = 0.006
            let handler = VNImageRequestHandler(cgImage: crop, options: [:])
            try? handler.perform([req])
            for obs in req.results ?? [] {
                guard let cand = obs.topCandidates(1).first else { continue }
                let b = obs.boundingBox  // normalized, origin bottom-left
                let bx = Double(x) + b.minX * rect.width
                let by = Double(y) + (1 - b.maxY) * rect.height
                results.append(["text": cand.string, "conf": cand.confidence,
                                "box": [bx, by, b.width * rect.width, b.height * rect.height]])
            }
        }
        x += tile - overlap
    }
    y += tile - overlap
}
let data = try JSONSerialization.data(withJSONObject: ["size": [W, H], "items": results], options: [])
try data.write(to: URL(fileURLWithPath: args[2]))
print("\(results.count) text items")
