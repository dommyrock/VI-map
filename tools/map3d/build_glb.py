"""Option B prototype: stylized 3D Leonida from the illustrated 2D map.

Reads data/assets/leonida-map.jpg (5775x7900, leonida-px@1) + regions + features, writes:
  out/leonida.glb      terrain (map texture) + extruded building footprints + water plane
  out/pois.json        POIs with 3D positions (x = px, z = py, y = height)
  out/masks.jpg        debug preview of land / buildings / mountains
Units: 1 unit = 1 map px; y is up.
usage: .venv/bin/python -I build_glb.py
"""
import json, math, pathlib, time
import cv2, numpy as np, trimesh
from shapely.geometry import Polygon

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent / "out"; OUT.mkdir(exist_ok=True)
t0 = time.time()
im = cv2.imread(str(ROOT / "data/assets/leonida-map.jpg")); Hpx, Wpx = im.shape[:2]
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV); Hh, S, V = [hsv[..., i].astype(np.int16) for i in range(3)]

# ---------- printed text + road shields (Apple Vision OCR → ocr_post.py) ----------
labels = (cv2.imread(str(OUT / "text_mask.png"), 0) > 0).astype(np.uint8)
print(f"text pixels {labels.mean():.2%}")

# ---------- land / water ----------
water = ((Hh >= 85) & (Hh <= 100) & (S > 110)).astype(np.uint8)
# under labels: take the majority class of the surroundings (normalized convolution)
valid = (1 - labels).astype(np.float32)
frac = cv2.GaussianBlur(water.astype(np.float32) * valid, (0, 0), 25) / np.maximum(cv2.GaussianBlur(valid, (0, 0), 25), 1e-3)
water = np.where(labels > 0, (frac > 0.5), water).astype(np.uint8)
# map furniture that isn't land: outer frame, legend, compass, seal + title (px, measured on the 1024-wide preview x5.64)
furniture = [(0, 0, Wpx, 200), (0, 0, 200, Hpx), (5585, 0, Wpx, Hpx), (0, 7690, Wpx, Hpx),
             (470, 410, 1320, 1490), (700, 5250, 1200, 5700), (4150, 6100, 5400, 7400)]
for x0, y0, x1, y1 in furniture: water[y0:y1, x0:x1] = 1
land = 1 - water
land = cv2.morphologyEx(land, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))       # drop label specks on water
n, lab, st, _ = cv2.connectedComponentsWithStats(land, 8)
land = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 1500]).astype(np.uint8)
water = 1 - land

# ---------- elevation (in units) ----------
d_land = cv2.distanceTransform(land, cv2.DIST_L2, 5)
d_water = cv2.distanceTransform(water, cv2.DIST_L2, 5)
h = np.where(land > 0, 2 + 22 * (1 - np.exp(-d_land / 450)), -7 * (1 - np.exp(-d_water / 140)))   # gentle shelf, no cliffs
# mountains: Mount Kalaga region, smooth dome + map hillshade detail
regions = json.load(open(ROOT / "data/generated/regions.geojson"))
mk = np.zeros((Hpx, Wpx), np.uint8)
for f in regions["features"]:
    if f["properties"]["id"] == "mount-kalaga":
        for poly in f["geometry"]["coordinates"]:
            cv2.fillPoly(mk, [np.array(poly[0], np.int32)], 1)
mk = mk & land
dome = cv2.GaussianBlur(mk.astype(np.float32), (0, 0), 220) * np.clip(d_land / 170, 0, 1) ** 1.2   # fade in from the coast
q = cv2.resize(im, (Wpx // 4, Hpx // 4), interpolation=cv2.INTER_AREA)
qh = cv2.cvtColor(q, cv2.COLOR_BGR2HSV)
ink = ((qh[..., 2] > 200) & (qh[..., 1] < 60)).astype(np.uint8)              # white labels, roads, shields
ink = cv2.dilate(ink, np.ones((5, 5), np.uint8)) | cv2.resize(labels, (Wpx // 4, Hpx // 4), interpolation=cv2.INTER_NEAREST)
lum_q = cv2.inpaint(cv2.cvtColor(q, cv2.COLOR_BGR2GRAY), ink, 5, cv2.INPAINT_TELEA).astype(np.float32)
lum = cv2.resize(cv2.GaussianBlur(lum_q, (0, 0), 5), (Wpx, Hpx), interpolation=cv2.INTER_LINEAR)   # smoother: no streaks
shade = (lum - cv2.GaussianBlur(lum, (0, 0), 80)) / 25.0                      # hillshade high-pass ~ local relief
h += dome * (230 + 40 * np.clip(shade, -1.5, 1.5)) * (land > 0)
# inland lakes/rivers: sit just below the surrounding land instead of dropping to sea level
n_w, lab_w = cv2.connectedComponents(water, 8)
ocean_ids = np.unique(np.concatenate([lab_w[0], lab_w[-1], lab_w[:, 0], lab_w[:, -1]]))
inland = (water > 0) & ~np.isin(lab_w, ocean_ids)
lw = land.astype(np.float32)
h_land = cv2.GaussianBlur(h * lw, (0, 0), 50) / np.maximum(cv2.GaussianBlur(lw, (0, 0), 50), 1e-3)
h = np.where(inland, h_land - 1.5 - 3 * (1 - np.exp(-d_water / 60)), h).astype(np.float32)
h = cv2.GaussianBlur(h, (0, 0), 4)
print(f"masks + height: {time.time()-t0:.1f}s, land {land.mean():.0%}, inland water {inland.mean():.1%}, h {h.min():.1f}..{h.max():.1f}")

# ---------- texture at full resolution: remove printed text, paint over map furniture ----------
clean = im.copy(); ocean = np.median(im[water.astype(bool) & (S > 200)], axis=0)
for x0, y0, x1, y1 in furniture: clean[y0:y1, x0:x1] = ocean
# fill text/shield pixels from nearby NON-road, non-text colours (grey city / green land / water), widening until filled
m = labels > 0
src = (~m & ~((V > 215) & (S < 50))).astype(np.float32)
fill = np.zeros(clean.shape, np.float32); got = np.zeros(m.shape, bool)
for sig in (5, 12, 30, 80):
    wsum = cv2.GaussianBlur(src, (0, 0), sig)
    col = cv2.GaussianBlur(clean.astype(np.float32) * src[..., None], (0, 0), sig) / np.maximum(wsum, 1e-4)[..., None]
    ok = m & (wsum > 0.05) & ~got; fill[ok] = col[ok]; got |= ok
clean[m] = fill[m].astype(np.uint8)
clean = np.where(cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8))[..., None] > 0, cv2.GaussianBlur(clean, (0, 0), 1.5), clean)
# fade the outer band of the map to the flat ocean colour + depth, so the 3D view's ocean ring continues it seamlessly
yy, xx = np.mgrid[0:Hpx, 0:Wpx].astype(np.float32)
d_edge = np.minimum.reduce([xx - 200, 5585 - xx, yy - 200, 7690 - yy])
wgt = np.clip(d_edge / 420, 0, 1) ** 1.5
EDGE_DEPTH = -7.0
clean = (clean.astype(np.float32) * wgt[..., None] + ocean * (1 - wgt[..., None])).astype(np.uint8)
h = (h * wgt + EDGE_DEPTH * (1 - wgt)).astype(np.float32)
del yy, xx
cv2.imwrite(str(OUT / "leonida_tex.jpg"), cv2.resize(clean, (2994, 4096), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(f"texture cleaned ({time.time()-t0:.1f}s)")

# ---------- terrain mesh: 2x2 tiles, each with its own full-resolution texture ----------
from PIL import Image  # trimesh texture visuals want PIL
STEP = 10
# vertex normals from the full heightmap (central differences), so lighting is seamless across tiles
gy_h, gx_h = np.gradient(cv2.GaussianBlur(h, (0, 0), 2))
nrm = np.dstack([-gx_h, np.ones_like(h), -gy_h]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
gx = np.arange(200, 5586, STEP); gy = np.arange(200, 7691, STEP)
mx, my = len(gx) // 2, len(gy) // 2
tiles = []
for (ix0, ix1) in ((0, mx + 1), (mx, len(gx))):
    for (iy0, iy1) in ((0, my + 1), (my, len(gy))):
        tx, ty = gx[ix0:ix1], gy[iy0:iy1]
        X, Y = np.meshgrid(tx, ty); Z = h[Y, X]
        verts = np.stack([X, Z, Y], -1).reshape(-1, 3).astype(np.float32)
        nx, ny = len(tx), len(ty)
        idx = np.arange(nx * ny).reshape(ny, nx)
        a_, b_, c_, d_ = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
        faces = np.concatenate([np.stack([a_, c_, b_], -1).reshape(-1, 3), np.stack([b_, c_, d_], -1).reshape(-1, 3)])
        px0, px1, py0, py1 = int(tx[0]), int(tx[-1]) + 1, int(ty[0]), int(ty[-1]) + 1
        crop = clean[py0:py1, px0:px1]
        name = f"tex_{ix0}_{iy0}.jpg"
        cv2.imwrite(str(OUT / name), crop, [cv2.IMWRITE_JPEG_QUALITY, 84])
        uv = np.stack([(X - px0) / (px1 - px0 - 1), 1 - (Y - py0) / (py1 - py0 - 1)], -1).reshape(-1, 2)
        mat = trimesh.visual.material.PBRMaterial(baseColorTexture=Image.open(OUT / name), metallicFactor=0, roughnessFactor=1)
        tm = trimesh.Trimesh(verts, faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False)
        tm.vertex_normals = nrm[Y, X].reshape(-1, 3)
        tiles.append(tm)
print(f"terrain: 4 tiles, {sum(len(t.vertices) for t in tiles):,} verts, textures {crop.shape[1]}x{crop.shape[0]} ({time.time()-t0:.1f}s)")

# ---------- buildings ----------
bld = ((Hh >= 100) & (Hh <= 125) & (S >= 35) & (S <= 110) & (V >= 120) & (V <= 235)).astype(np.uint8) & land & (1 - labels)
bld = cv2.morphologyEx(bld, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
bld = cv2.morphologyEx(bld, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
contours, _ = cv2.findContours(bld, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
centers = {"downtown": ((4060, 4200), 260, 85), "vicebeach": ((4950, 3880), 380, 22),
           "portgellhorn": ((1750, 2850), 300, 18), "ambrosia": ((3180, 2800), 260, 12)}
rng = np.random.default_rng(7)
bverts, bfaces, bcols, vo = [], [], [], 0
kept = 0
for cnt in contours:
    area = cv2.contourArea(cnt)
    if area < 15: continue
    x, y, w, hh = cv2.boundingRect(cnt)
    comp = np.zeros((hh + 2, w + 2), np.uint8); cv2.drawContours(comp, [cnt - [x - 1, y - 1]], -1, 1, -1)
    if cv2.distanceTransform(comp, cv2.DIST_L2, 3).max() < 3.0: continue            # thin stroke = label shadow
    hull = cv2.contourArea(cv2.convexHull(cnt))
    if hull > 0 and area / hull < 0.45 and area > 300: continue                       # ring/letter shapes
    poly = cv2.approxPolyDP(cnt, 1.2, True)[:, 0, :]
    if len(poly) < 3: continue
    P = Polygon(poly)
    if not P.is_valid: P = P.buffer(0)
    if P.is_empty or P.geom_type != "Polygon": continue
    cx, cy = map(int, P.centroid.coords[0])
    if not (0 <= cx < Wpx and 0 <= cy < Hpx): continue
    tall = sum(peak * math.exp(-((cx - x) ** 2 + (cy - y) ** 2) / (2 * r * r)) for (x, y), r, peak in centers.values())
    size = min(area, 4000) ** 0.5
    height = 2 + 0.06 * size + tall * (0.3 + 0.7 * rng.random()) ** 1.5 + rng.random() * 2.5
    if tall > 30 and area < 1800 and rng.random() < 0.25: height *= 1.6      # occasional towers downtown
    try:
        m = trimesh.creation.extrude_polygon(P, height, engine="earcut")
    except Exception:
        continue
    v = m.vertices.copy()  # extrude_polygon: polygon in XY, height along +Z
    base = float(h[cy, cx]) - 0.5
    v = np.stack([v[:, 0], v[:, 2] + base, v[:, 1]], -1)
    # colour: walls cool grey-blue, roof lighter; slight per-building tint
    palette = [(214, 218, 226), (196, 204, 218), (226, 214, 196), (205, 192, 178), (232, 228, 220)]
    wall = np.array(palette[rng.integers(len(palette))], float)
    if height > 35 and rng.random() < 0.55: wall = np.array([120, 160, 196]) + rng.random() * 25    # glass towers
    wall *= 0.9 + 0.12 * rng.random()
    top = v[:, 1] > base + height - 0.01
    col = np.where(top[:, None], np.minimum(wall * 1.12 + 12, 255), wall)
    bverts.append(v); bfaces.append(m.faces + vo); bcols.append(np.clip(col, 0, 255)); vo += len(v); kept += 1
bv = np.concatenate(bverts).astype(np.float32); bf = np.concatenate(bfaces)
bc = np.concatenate([np.concatenate(bcols), np.full((len(bv), 1), 255)], 1).astype(np.uint8)
buildings = trimesh.Trimesh(bv, bf, vertex_colors=bc, process=False)
print(f"buildings: {kept:,} footprints, {len(bv):,} verts, {len(bf):,} tris ({time.time()-t0:.1f}s)")

# ---------- water plane ----------
water_plane = trimesh.Trimesh(np.array([[0, 0, 0], [Wpx, 0, 0], [Wpx, 0, Hpx], [0, 0, Hpx]], np.float32),
                              np.array([[0, 2, 1], [0, 3, 2]]),
                              visual=trimesh.visual.ColorVisuals(face_colors=[[40, 170, 200, 170]] * 2), process=False)

scene = trimesh.Scene()
[scene.add_geometry(t, node_name=f"terrain_{i}") for i, t in enumerate(tiles)]; scene.add_geometry(buildings, node_name="buildings")
scene.export(OUT / "leonida.glb", include_normals=True)
print(f"glb: {(OUT / 'leonida.glb').stat().st_size / 1e6:.1f} MB ({time.time()-t0:.1f}s)")

# ---------- POIs ----------
feats = json.load(open(ROOT / "data/generated/features.json"))["features"]
pois = []
for f in feats:
    x, y = f["pos"]; xi, yi = int(min(max(x, 0), Wpx - 1)), int(min(max(y, 0), Hpx - 1))
    pois.append({"id": f["id"], "category": f["category"], "title": f.get("title"), "region": f.get("region"),
                 "p": [round(x, 1), round(float(max(h[yi, xi], 0)) + 2, 1), round(y, 1)]})
json.dump({"size": [Wpx, Hpx], "pois": pois}, open(OUT / "pois.json", "w"))

# ---------- debug preview ----------
dbg = cv2.resize(im, (Wpx // 6, Hpx // 6), interpolation=cv2.INTER_AREA)
sm = lambda m: cv2.resize(m.astype(np.uint8), (Wpx // 6, Hpx // 6), interpolation=cv2.INTER_NEAREST) > 0
o = dbg.copy(); o[sm(water)] = (255, 140, 40); o[sm(bld)] = (0, 0, 255); o[sm(mk)] = (o[sm(mk)] * .5 + np.array([200, 80, 200]) * .5).astype(np.uint8)
cv2.imwrite(str(OUT / "masks.jpg"), np.hstack([dbg, o]), [cv2.IMWRITE_JPEG_QUALITY, 80])
print(f"done in {time.time()-t0:.1f}s")

# ---------- labels for crisp re-rendering ----------
import re
COUNTY_LABELS = [  # big printed county names, positions read off the map (OCR fragments these)
    ("LUMMOX COUNTY", 2865, 1590), ("KELLY COUNTY", 2442, 3119), ("LEONARD COUNTY", 4033, 2837),
    ("VICE-DALE COUNTY", 4162, 4529), ("MARIANA COUNTY", 2380, 5764), ("VICE BEACH", 4907, 3863), ("HAMLET", 3232, 5403)]
SITE_REGIONS = [(f["properties"]["name"] if len(f["properties"]["name"]) < 16 else f["properties"]["shortName"],
                 *f["properties"]["label"], f["properties"]["color"]) for f in regions["features"]]
REGION_LABELS = COUNTY_LABELS + [(n, x, y) for n, x, y, _ in SITE_REGIONS]
big_words = {w for t, _, _ in REGION_LABELS for w in re.findall(r"[A-Z]+", t.upper())}
raw = [dict(l) for l in json.load(open(OUT / "labels.json")) if l["tier"] > 0]
# merge stacked lines of one label ("SOUTH" over "WEST" over "LUMMOX COUNTY"), top to bottom
raw.sort(key=lambda l: l["y"])
changed = True
while changed:
    changed = False
    for i, a in enumerate(raw):
        for b in raw[i + 1:]:
            sz = max(a["size"], b["size"])
            if a["text"].isupper() == b["text"].isupper() and abs(a["size"] - b["size"]) / sz < 0.4 and 0 < b["y"] - a["y"] < 1.8 * sz and abs(a["x"] - b["x"]) < 2.2 * sz:
                a["text"] = a["text"] + " " + b["text"]; a["x"] = (a["x"] + b["x"]) / 2; a["y"] = (a["y"] + b["y"]) / 2
                raw.remove(b); changed = True; break
        if changed: break
GENERIC = {"lake", "park", "field", "bay", "station", "creek", "estates", "key", "keys", "island", "islands", "south", "north",
           "west", "east", "valley", "springs", "swamp", "canyon", "district", "point", "retreat", "interstate", "toll", "state",
           "leonida", "airport", "arena", "association", "institution", "correctional", "burial", "rodeo", "sands", "decor"}
cand = []
for l in raw:
    t = re.sub(r"^[^A-Za-z]+|[^A-Za-z.'’)]+$", "", l["text"]).strip()
    if len(t) < 3 or t[0].islower(): continue                                     # garbled OCR starts lowercase
    if t.lower() in GENERIC or "INTERSTATE" in t.upper(): continue
    letters = sum(ch.isalpha() for ch in t)
    if letters / max(len(t), 1) < 0.75: continue
    words = re.findall(r"[A-Za-z]+", t.upper())
    if all(w in big_words for w in words): continue                               # fragments of the big region names
    cand.append({**l, "text": t})
cand.sort(key=lambda l: -l["size"])
kept = []
for l in cand:
    key = l["text"].lower()
    if any((k["text"].lower() in key or key in k["text"].lower()) and math.hypot(k["x"] - l["x"], k["y"] - l["y"]) < 700 for k in kept):
        continue
    kept.append(l)
FIX = {"RIALTO ISLANDS CASANOVA": "RIALTO ISLANDS", "Red Apple Orchard MANIFEST": "Red Apple Orchard", "PERMIT KEYST": "PERMIT KEYS",
       "BALSER": "BALSERO", "WASHINGTON LULAINU": None, "Gellhorn inacoway": None}
region_names = {n.lower() for n, *_ in SITE_REGIONS} | {t.lower() for t, *_ in COUNTY_LABELS}
kept = [{**l, "text": FIX.get(l["text"], l["text"])} for l in kept if FIX.get(l["text"], l["text"]) and l["text"].lower() not in region_names]
def hgt(x, y): return round(float(max(h[int(min(max(y, 0), Hpx - 1)), int(min(max(x, 0), Wpx - 1))], 0)), 1)
labels3d = [{"text": n, "p": [round(x, 1), hgt(x, y), round(y, 1)], "tier": 0, "color": c} for n, x, y, c in SITE_REGIONS]
labels3d += [{"text": t, "p": [x, hgt(x, y), y], "tier": 1, "county": True} for t, x, y in COUNTY_LABELS]
labels3d += [{"text": l["text"], "p": [l["x"], hgt(l["x"], l["y"]), l["y"]], "tier": l["tier"]} for l in kept]
json.dump(labels3d, open(OUT / "labels3d.json", "w"))
print(f"labels3d: {len(labels3d)} ({sum(l['tier'] == 1 for l in labels3d)} town, {sum(l['tier'] == 2 for l in labels3d)} place)")

# ---------- heightmap for the web view (pins, labels, outlines sample it) ----------
HSTEP = 16
hm = h[0:Hpx:HSTEP, 0:Wpx:HSTEP]
cv2.imwrite(str(OUT / "height.png"), np.clip((hm + 8) * 2, 0, 255).astype(np.uint8))
ocean_hex = "#%02x%02x%02x" % tuple(int(v) for v in ocean[::-1])
json.dump({"step": HSTEP, "offset": -8, "scale": 0.5, "w": hm.shape[1], "h": hm.shape[0], "ocean": ocean_hex, "edgeDepth": EDGE_DEPTH,
           "frame": [200, 200, 5585, 7690]}, open(OUT / "height.json", "w"))
print(f"heightmap {hm.shape[1]}x{hm.shape[0]}")
