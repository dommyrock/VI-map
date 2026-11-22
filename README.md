# VI-map

An interactive fan map of Leonida, the state where the upcoming GTA VI takes place: regions, locations and activities on one zoomable map.

**Live: https://dommyrock.github.io/VI-map/**

<!-- ![VI-map screenshot](docs/screenshot.png) -->

## Why

Mostly for fun: a fan project to explore Leonida before the game is out.

It's also a playground for poking at the pre-release map data. All 419 points of interest are tagged with a region and a category, so questions like "how many gas stations are in Vice City?" or "which region has the most activities?" are a click away. Right now that's 6 regions, 16 categories in 5 groups, and Vice City alone holds 177 of the 419 locations.

## Using the map

- **Search**: type in the search box to find locations by name, category, region or description. Click a result to fly to it and open its popup. If its category is hidden or a region filter excludes it, the map turns those back on for you.
- **Categories**: the sidebar lists every category by group, with a live count of how many are visible. Toggle them one by one, or use **All** / **None**.
- **Regions**: click a region chip (or the region on the map) to focus it and zoom to fit. **Cmd/Ctrl/Shift-click** adds or removes regions to compare several at once. **Clear** resets the filter.
- **Region drawer**: focusing a region opens a drawer with a postcard, a short summary, its real-world inspiration, a per-category breakdown and key locations. Click a category chip there to **isolate** it (show only that category); click it again to restore your previous selection. Close the drawer with ×, and bring it back with the ⓘ pill.
- **Popups**: click a marker for its name, category, region and map coordinates. Hovering over markers and regions shows a tooltip.
- **Shareable links**: the URL keeps the selected regions and the open location (`?region=vice-city,ambrosia&f=<id>`), so you can copy the address bar to share exactly what you're looking at.

## Run locally

You need **Node.js 22.23.4 or newer** (CI uses Node 24).

```sh
npm install
npm run dev        # dev server (generates tiles and data first if needed)
npm run build      # production build into dist/
npm run preview    # serve the built site
```

The site is served under `/VI-map/` (see `base` in `astro.config.mjs`), so open http://localhost:4321/VI-map/ locally.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run tiles` | Cuts `data/assets/leonida-map.jpg` into 512 px WebP tiles (zoom 11 to 16) in `public/tiles/` with sharp. `dev` and `build` do this automatically, only when the tiles are missing or out of date. |
| `npm run data` | Rebuilds `data/generated/` (features, regions, manifest) from the sources and authored data. |
| `npm run verify` | Sanity checks on the generated data, map space and tiles. Exits non-zero on failure. |
| `npm run check` | Runs `astro check` (TypeScript and Astro diagnostics). |
| `npm run regions` | Re-traces the coastline-accurate region polygons from the map image, then runs `data`. Needs a Python venv at `.venv/` with `opencv-python` and `numpy`. You only need this if you change the region partition. |

## Project structure

```
data/
  assets/      Source map image (leonida-map.jpg) that the tiles are cut from
  sources/     Raw inputs: the Mobalytics POI snapshot and the traced region polygons
  authored/    Hand-maintained data: categories, category groups, coarse region partition
  generated/   Pipeline output the app loads (never hand-edited)
pipeline/      Node scripts: tile cutting, data generation, verification
tools/         Python region tracer (build_regions.py)
public/        Static files: icons, region postcards, favicon, generated tiles
src/
  pages/       The single Astro page
  components/  Preact UI: sidebar, search, category list, region chips, drawer, popups
  state/       nanostores state, actions, derived data and URL sync
  views/       MapLibre map view (tiles, region overlay, markers, labels)
  lib/         Data schema (zod), dataset loading, map-space and geometry helpers
  content/     Region write-ups (Markdown) shown in the drawer
```

### Data pipeline

```
sources ──▶ authored ──▶ generated ──▶ app
                                      ▲
leonida-map.jpg ──────────▶ tiles ────┘
```

1. **Sources**: `mobalytics-v0.json` is the raw POI snapshot. `regions.px.json` holds coastline-accurate region polygons traced from the map image by `tools/build_regions.py`.
2. **Authored**: `categories.json` and `groups.json` define the category ids, names and icons. `partition.geojson` splits the map into six coarse regions.
3. **Generated**: `pipeline/tag-regions.ts` normalizes the POIs, tags each one with a region using the coarse partition (so offshore points still get one) and writes `features.json`, `regions.geojson` and `manifest.json`.
4. **Tiles**: `pipeline/tile.ts` slices the map image into a WebP tile pyramid for MapLibre.

Everything uses image pixels as coordinates, mapped onto a flat MapLibre space.

## Support

If you enjoy the map, you can [buy me a coffee](https://buymeacoffee.com/dommyrock) ☕

## Disclaimer

This is an unofficial fan project. It is not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Grand Theft Auto and GTA are trademarks of Take-Two Interactive Software, Inc. Map imagery and location names belong to their respective owners.

POI data was originally sourced from community map data by [Mobalytics](https://mobalytics.gg/).

## License

The code is released under the [MIT License](LICENSE). The license covers the code only, not the map imagery, icons or game-related content.
