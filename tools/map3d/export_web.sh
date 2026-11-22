#!/usr/bin/env bash
# Build the 3D view assets from the 2D map and publish them to public/assets/3d/.
# Needs: macOS (Apple Vision OCR via swiftc), Python 3.10+ venv with numpy opencv-python-headless trimesh shapely mapbox_earcut scipy pillow.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-.venv/bin/python}
mkdir -p out ../../public/assets/3d
[ -x ocr_labels ] || swiftc -O ocr_labels.swift -o ocr_labels
[ -f out/ocr_raw.json ] || ./ocr_labels ../../data/assets/leonida-map.jpg out/ocr_raw.json
$PY -I ocr_post.py
$PY -I build_glb.py
npx -y @gltf-transform/cli@4 optimize out/leonida.glb ../../public/assets/3d/leonida.glb --compress meshopt --texture-compress webp --texture-size 3072
cp out/labels3d.json out/height.png out/height.json ../../public/assets/3d/
ls -la ../../public/assets/3d/
