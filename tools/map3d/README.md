# tools/map3d: assets for the 3D view

Generates the stylized 3D Leonida shown by the 2D/3D toggle (`src/views/three/`) from the illustrated 2D map
(`data/assets/leonida-map.jpg`) plus `data/generated/regions.geojson`. Output goes to `public/assets/3d/`:

| File | What |
| --- | --- |
| `leonida.glb` | Terrain (4 tiles, full-res map texture with printed text removed), extruded building footprints. meshopt + WebP, ~2.5 MB |
| `height.png` / `height.json` | 8-bit heightmap (16 px grid) the view samples for pins, labels and region outlines |
| `labels3d.json` | County/town/place labels found by OCR (region labels come from the dataset at runtime) |

```bash
tools/map3d/export_web.sh        # macOS: OCR → text mask → terrain/buildings → compress → publish
```

Requirements: macOS (Apple Vision OCR through `swiftc`) and a Python 3.10+ venv at `tools/map3d/.venv` (or set `PY=`) with
`numpy opencv-python-headless trimesh shapely mapbox_earcut scipy pillow`. Run it only when the base map changes. The outputs are committed, so CI never runs this.

How it works:
1. **`ocr_labels.swift`** tiles the map through Apple Vision text recognition → `out/ocr_raw.json` (word boxes).
2. **`ocr_post.py`** merges tile fragments and builds a pixel mask of the letters by ink colour (white/cream/purple fill, dark outline, soft drop shadow of big labels). Road shields are removed whole.
3. **`build_glb.py`**:
   - water/land from map colours (labels take the majority class around them)
   - relief: coastal rise + Mount Kalaga dome + the map's own hillshade (text inpainted first)
   - inland lakes sit just below the surrounding land
   - text pixels filled from nearby non-road colours
   - building footprints (blue-grey pixels) extruded, taller downtown
   - labels: stacked lines merged, junk filtered
4. **glTF-Transform** `optimize` (meshopt geometry, WebP textures ≤ 3072 px): 16 MB → 2.5 MB.

The prototype history and the earlier Gaussian-splat research live in `~/git/gaussian-splat-flyover-research`.
