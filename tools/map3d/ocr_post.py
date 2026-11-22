"""Turn raw Vision OCR boxes into (a) a pixel mask of printed text/shields and (b) a clean label list.

in:  out/ocr_raw.json (from ./ocr_labels)
out: out/text_mask.png  (full-res, 255 = printed text / shield pixels to remove)
     out/labels.json    ([{text, x, y, size, tier}] in map px, for re-rendering as crisp labels)
     out/ocr_debug.jpg
"""
import json, pathlib, re
import cv2, numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent / "out"
im = cv2.imread(str(ROOT / "data/assets/leonida-map.jpg")); H, W = im.shape[:2]
HSV = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
items = json.load(open(OUT / "ocr_raw.json"))["items"]
furniture = [(470, 410, 1320, 1490), (700, 5250, 1200, 5700), (4150, 6100, 5400, 7400)]
inside = lambda x, y: 200 <= x <= 5585 and 200 <= y <= 7690 and not any(a <= x <= c and b <= y <= d for a, b, c, d in furniture)

# ---- merge fragments from overlapping tiles: keep the longest reading, union the boxes ----
boxes = []
for it in sorted(items, key=lambda i: -len(i["text"])):
    x, y, w, h = it["box"]; t = it["text"].strip()
    if not t or it["conf"] < 0.3: continue
    b = [x, y, x + w, y + h]; merged = False
    for k in boxes:
        ix = max(0, min(b[2], k["b"][2]) - max(b[0], k["b"][0])); iy = max(0, min(b[3], k["b"][3]) - max(b[1], k["b"][1]))
        if ix * iy > 0.5 * min(w * h, (k["b"][2] - k["b"][0]) * (k["b"][3] - k["b"][1])):
            k["b"] = [min(b[0], k["b"][0]), min(b[1], k["b"][1]), max(b[2], k["b"][2]), max(b[3], k["b"][3])]; merged = True; break
    if not merged: boxes.append({"text": t, "b": b})
print(f"{len(items)} raw → {len(boxes)} merged")

# ---- pixel mask: glyph pixels inside each box (differ from local background), shields removed whole ----
mask = np.zeros((H, W), np.uint8)
labels = []
for k in boxes:
    x0, y0, x1, y1 = k["b"]; h = y1 - y0; t = k["text"]
    shield = bool(re.fullmatch(r"[0-9A]{1,4}", t)) and h < 70           # road shield numbers like 297, 35, 1A
    pad = (0.9 if shield else 0.35) * h
    X0, Y0 = int(max(0, x0 - pad)), int(max(0, y0 - pad)); X1, Y1 = int(min(W, x1 + pad)), int(min(H, y1 + pad))
    if X1 <= X0 or Y1 <= Y0: continue
    if shield:
        mask[Y0:Y1, X0:X1] = 255                                              # remove the whole shield
    else:
        hh, ss, vv = [HSV[Y0:Y1, X0:X1, i].astype(np.int16) for i in range(3)]
        white = (vv > 226) & (ss < 40)                                        # white letter fill (also roads)
        cream = (hh >= 12) & (hh <= 40) & (ss >= 30) & (vv > 185)             # cream/yellow district names
        purple = (hh >= 118) & (hh <= 165) & (ss > 25) & (vv > 60)            # purple POI names
        wet = (hh >= 85) & (hh <= 100) & (ss > 110)
        dark = (vv < 105) | (cv2.dilate(wet.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~wet & (vv < 175) & (hh >= 85) & (hh <= 115))
        ink = white | cream | purple
        near_ink = cv2.dilate(ink.astype(np.uint8), np.ones((int(max(5, h * 0.18)) | 1,) * 2, np.uint8)).astype(bool)
        g = (ink | (dark & near_ink) | (dark & wet.any()))                     # outlines/shadows hug the letters
        if h >= 45:                                                            # big labels: soft grey drop shadow
            near_big = cv2.dilate(ink.astype(np.uint8), np.ones((int(h * 0.3) | 1,) * 2, np.uint8)).astype(bool)
            g |= near_big & (vv < 172) & (ss < 48)
            g = cv2.dilate(g.astype(np.uint8), np.ones((int(h * 0.12) | 1,) * 2, np.uint8)).astype(bool)   # soft shadow halo
        g = g.astype(np.uint8)
        g = cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        g = cv2.dilate(g, np.ones((3, 3), np.uint8))
        mask[Y0:Y1, X0:X1] = np.maximum(mask[Y0:Y1, X0:X1], g * 255)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if not shield and inside(cx, cy) and len(t) >= 3 and re.search(r"[A-Za-z]{3}", t):
        tier = 0 if h >= 85 else 1 if h >= 45 else 2                        # region / town / place
        labels.append({"text": t.replace("’", "'"), "x": round(cx, 1), "y": round(cy, 1), "size": round(h, 1), "tier": tier})
cv2.imwrite(str(OUT / "text_mask.png"), mask)
json.dump(labels, open(OUT / "labels.json", "w"), indent=0)
print(f"labels kept: {len(labels)} (tiers: {[sum(l['tier'] == t for l in labels) for t in range(3)]}), mask {mask.mean() / 255:.2%}")

dbg = im.copy(); dbg[mask > 0] = (0, 0, 255)
cv2.imwrite(str(OUT / "ocr_debug.jpg"), cv2.resize(dbg, (W // 5, H // 5)), [cv2.IMWRITE_JPEG_QUALITY, 80])
