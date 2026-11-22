"""Generate region polygons for the Leonida map.

Land mask: the base map's water is a uniform cyan, so everything else is land.
Partition: six coarse polygons (data/authored/partition.geojson) split the image; each
is intersected with the land mask and traced into coastline-accurate polygons.
Coordinates are image pixels (x right, y down).

Output: data/sources/regions.px.json, consumed by pipeline/tag-regions.ts (which also
does feature tagging against the same partition).

Known issues (not fixed yet): traced polygons sit ~2 px up-left of the coastline, and
neighbouring regions' edges overlap by a couple of px.

Run: .venv/bin/python tools/build_regions.py
"""
import json
import cv2
import numpy as np

SRC = "data/assets/leonida-map.jpg"
OUT = "data/sources/regions.px.json"
PREVIEW_OUT = "data/sources/regions-preview.jpg"
WORK = 4          # work at 1/4 resolution (1444x1975), plenty for an overlay
PREVIEW = 7.9     # coarse polygons below are in 731x1000 preview pixels

# Coarse partition: data/authored/partition.geojson (image px) is the single authority.
# (Originally hand-traced in 731x1000 preview px and scaled by PREVIEW; the one-off v0 migration (removed)
# moved those polygons into the authored GeoJSON.)
PARTITION = "data/authored/partition.geojson"


def load_partition():
    d = json.load(open(PARTITION))
    return [(f["properties"]["id"], f["properties"]["name"], f["properties"]["color"],
             f["geometry"]["coordinates"][0][:-1]) for f in d["features"]]


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
    regions = []
    for rid, name, color, poly in load_partition():
        pts = np.array([[x / WORK, y / WORK] for x, y in poly], np.int32)
        zone = np.zeros_like(land)
        cv2.fillPoly(zone, [pts], 255)
        polys = trace(cv2.bitwise_and(land, zone))
        regions.append({"id": rid, "name": name, "color": color, "polygons": polys})
        print(f"{name:28s} {len(polys):4d} polygons, {sum(len(r) for p in polys for r in p):6d} vertices")

    json.dump({"size": {"width": W, "height": H}, "regions": regions}, open(OUT, "w"), separators=(",", ":"))

    # Debug preview: regions painted over the map
    over = img.copy()
    for r in regions:
        col = tuple(int(r["color"][i:i + 2], 16) for i in (5, 3, 1))
        for p in r["polygons"]:
            cv2.fillPoly(over, [np.array(p[0], np.int32)], col)
            for hole in p[1:]:
                cv2.fillPoly(over, [np.array(hole, np.int32)], (0, 0, 0))
    prev = cv2.addWeighted(img, 0.5, over, 0.5, 0)
    cv2.imwrite(PREVIEW_OUT, cv2.resize(prev, (W // 8, H // 8)))


if __name__ == "__main__":
    main()
