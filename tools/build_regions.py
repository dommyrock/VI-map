"""Generate region polygons for the Leonida map.

Land mask: the base map's water is a uniform cyan, so everything else is land.
Partition: six coarse polygons (hand-traced from a reference region map) split the
image; each is intersected with the land mask and traced into coastline-accurate
polygons. Coordinates are image pixels (x right, y down), same as map-features.json.

Also tags every feature in map-features.json with its region.

Run: .venv/bin/python tools/build_regions.py
"""
import json
import cv2
import numpy as np

SRC = "data/assets/leonida-map.jpg"
FEATURES = "data/map-features.json"
OUT = "data/regions.json"
WORK = 4          # work at 1/4 resolution (1444x1975), plenty for an overlay
PREVIEW = 7.9     # coarse polygons below are in 731x1000 preview pixels

# Coarse partition in preview coords (traced from the reference region map).
REGIONS = [
    ("mount-kalaga", "Mount Kalaga National Park", "#c9a2ff",
     [(0,0),(731,0),(731,248),(500,248),(450,255),(405,262),(370,262),(320,268),(230,275),(130,275),(0,275)]),
    ("port-gellhorn", "Port Gellhorn", "#ffa94d",
     [(0,275),(130,275),(230,275),(320,268),(370,262),(385,470),(395,478),(320,515),(230,560),(130,570),(0,590)]),
    ("ambrosia", "Ambrosia", "#ffe066",
     [(370,262),(405,262),(450,255),(500,248),(731,248),(731,385),(600,395),(540,420),(470,450),(395,478),(385,470)]),
    ("vice-city", "Vice City", "#ff7eb6",
     [(395,478),(470,450),(540,420),(600,395),(731,385),(731,670),(560,660),(510,650),(450,640),(380,620),(380,520)]),
    ("grassrivers", "Grassrivers", "#74e07c",
     [(0,590),(130,570),(230,560),(320,515),(395,478),(380,520),(380,620),(450,640),(510,650),(560,660),(731,670),
      (731,760),(440,760),(380,780),(300,790),(0,780)]),
    ("leonida-keys", "Leonida Keys", "#5fd8ff",
     [(0,780),(300,790),(380,780),(440,760),(731,760),(731,1000),(0,1000)]),
]

# Map furniture to exclude (preview coords): legend, compass, seal, title, grid margins.
EXCLUDE = [(50,45,175,200), (90,660,155,730), (530,775,630,875), (495,868,670,940)]
MARGIN = 26


def land_mask(img):
    small = cv2.resize(img, (img.shape[1] // WORK, img.shape[0] // WORK), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    h, s = hsv[..., 0], hsv[..., 1]
    water = (h >= 85) & (h <= 105) & (s > 90)
    land = np.where(water, 0, 255).astype(np.uint8)
    k = PREVIEW / WORK
    for x0, y0, x1, y1 in EXCLUDE:
        land[int(y0 * k):int(y1 * k), int(x0 * k):int(x1 * k)] = 0
    m = int(MARGIN * k)
    land[:m, :] = 0; land[-m:, :] = 0; land[:, :m] = 0; land[:, -m:] = 0
    # Fill roads/text speckle, drop tiny specks
    land = cv2.morphologyEx(land, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    land = cv2.morphologyEx(land, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    return land


def trace(mask, min_area=60, min_hole=400):
    """Return list of polygons [[outer, hole, ...], ...] in full-res image px."""
    contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None:
        return []
    hier = hier[0]
    out = []
    scale = lambda c: [[round(float(p[0][0]) * WORK, 1), round(float(p[0][1]) * WORK, 1)] for p in c]
    for i, c in enumerate(contours):
        if hier[i][3] != -1 or cv2.contourArea(c) < min_area:
            continue  # holes handled with their parent; skip specks
        rings = [scale(cv2.approxPolyDP(c, 1.2, True))]
        j = hier[i][2]
        while j != -1:
            if cv2.contourArea(contours[j]) >= min_hole:
                rings.append(scale(cv2.approxPolyDP(contours[j], 1.2, True)))
            j = hier[j][0]
        if len(rings[0]) >= 3:
            out.append(rings)
    return out


def main():
    img = cv2.imread(SRC)
    H, W = img.shape[:2]
    land = land_mask(img)
    k = PREVIEW / WORK
    regions, coarse = [], []
    for rid, name, color, poly in REGIONS:
        pts = np.array([[x * k, y * k] for x, y in poly], np.int32)
        zone = np.zeros_like(land)
        cv2.fillPoly(zone, [pts], 255)
        polys = trace(cv2.bitwise_and(land, zone))
        regions.append({"id": rid, "name": name, "color": color, "polygons": polys})
        coarse.append((rid, np.array([[x * PREVIEW, y * PREVIEW] for x, y in poly], np.float32)))
        print(f"{name:28s} {len(polys):4d} polygons, {sum(len(r) for p in polys for r in p):6d} vertices")

    json.dump({"size": {"width": W, "height": H}, "regions": regions}, open(OUT, "w"), separators=(",", ":"))

    # Tag features with their region (coarse polygon containment; works for offshore points too)
    d = json.load(open(FEATURES))
    for f in d["features"]:
        f["region"] = next((rid for rid, c in coarse if cv2.pointPolygonTest(c, (f["x"], f["y"]), False) >= 0), None)
    json.dump(d, open(FEATURES, "w"), indent=2, ensure_ascii=False)
    open("data/map-features.js", "w").write("window.MAP_DATA = " + json.dumps(d, ensure_ascii=False) + ";\n")
    open("data/regions.js", "w").write("window.REGIONS = " + open(OUT).read() + ";\n")
    from collections import Counter
    print(Counter(f["region"] for f in d["features"]))

    # Debug preview: regions painted over the map
    over = img.copy()
    for r in regions:
        col = tuple(int(r["color"][i:i + 2], 16) for i in (5, 3, 1))
        for p in r["polygons"]:
            cv2.fillPoly(over, [np.array(p[0], np.int32)], col)
            for hole in p[1:]:
                cv2.fillPoly(over, [np.array(hole, np.int32)], (0, 0, 0))
    prev = cv2.addWeighted(img, 0.5, over, 0.5, 0)
    cv2.imwrite("data/regions-preview.jpg", cv2.resize(prev, (W // 8, H // 8)))


if __name__ == "__main__":
    main()
