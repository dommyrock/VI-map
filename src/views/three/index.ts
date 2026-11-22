/**
 * Stylized 3D implementation of MapView (three.js). Same contract as the MapLibre view: subscribes to
 * stores, writes only through actions, owns its camera. Loaded lazily when the 2D/3D toggle is on.
 *
 * World space: x = image px, z = image py, y = up (terrain units). The terrain/buildings model and the
 * heightmap are generated from the 2D map by tools/map3d (see its README).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { h, render } from 'preact';
import { FeatureCard } from '../../components/FeatureCard';
import { assetPath, iconUrl } from '../../lib/assets';
import { featureTitle } from '../../lib/data';
import type { Px } from '../../lib/schema';
import { MAP_SPACE } from '../../lib/space';
import type { FocusIntent } from '../../state/focus';
import type { CreateView, FocusTarget, MapView, Padding } from '../types';
import { badgeTexture, labelTexture, type LabelTier } from './textures';

const W = MAP_SPACE.width, H = MAP_SPACE.height;
const EDGE = 40;
const DURATION = 650;
const MIN_DIST = 140, MAX_DIST = 12500;
const POI_DIST = 1100; // focus distance for a single POI (never zooms out)
const STEM = 26; // pin stem height (world units)
/** Vertical exaggeration of terrain + buildings, as in the prototype (its height slider defaulted to 1.5). */
const EXAG = 1.5;
const LABEL_FONT = '400 24px "Lilita One"';
const ASSETS = (f: string) => assetPath(`assets/3d/${f}`);
/**
 * Camera presets from the 3D prototype (proto-3d-map/index.html VIEWS), used verbatim: selecting one of these
 * regions flies to the same spot, angle and distance as the demo. `pos` is the camera, `target` what it looks at.
 * Regions without a demo preset frame their bounding box from their own angle (`dir`).
 */
type Preset = { target: [number, number, number]; pos: [number, number, number] };
const HOME_PRESET: Preset = { target: [2900, 0, 4000], pos: [2900, 7600, 9800] };      // demo "Overview"
const REGION_PRESETS: Record<string, Preset> = {
  'vice-city': { target: [4150, 0, 4150], pos: [3550, 900, 5050] },                     // demo "Vice City"
  'mount-kalaga': { target: [2700, 100, 1900], pos: [2000, 1400, 3300] },               // demo "Mount Kalaga"
  'leonida-keys': { target: [2400, 0, 6700], pos: [2400, 1800, 8300] },                 // demo "Leonida Keys"
};
const REGION_DIRS: Record<string, [number, number, number]> = {
  'port-gellhorn': [700, 1000, 900], // from the SE, west coast and sea behind
  ambrosia: [-500, 1000, 1000],
  grassrivers: [600, 1000, 900],
};
const presetDir = (p: Preset): [number, number, number] => [p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]];
const presetDist = (p: Preset) => Math.hypot(...presetDir(p));
const HOME_DIR = presetDir(HOME_PRESET);

type Label = { text: string; p: [number, number, number]; tier: LabelTier; county?: boolean; color?: string };
type HeightMeta = { step: number; offset: number; scale: number; w: number; h: number; ocean?: string; edgeDepth?: number; frame?: number[] };

export const createThreeView: CreateView = (el, ctx) => {
  const { data, stores, derived, actions } = ctx;
  el.dataset.mode = '3d';
  const loadingEl = document.createElement('div');
  loadingEl.className = 'v3-loading';
  loadingEl.textContent = 'Loading 3D…';
  el.appendChild(loadingEl);

  // ---------- renderer / scene ----------
  // Log depth: terrain, buildings and the ocean ring stay z-stable from street level to the whole-map view.
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.prepend(renderer.domElement);
  renderer.domElement.style.display = 'block';

  const scene = new THREE.Scene();
  // Background, fog and the ocean ring share one blue, so the map's edge dissolves into it at every zoom.
  const SEA = new THREE.Color('#2fb4cf');
  scene.background = SEA;
  scene.fog = new THREE.Fog(SEA, 8000, 30000);
  scene.add(new THREE.HemisphereLight('#e8f4ff', '#6b7a5a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(-3000, 4200, -3000); // from the NW, like the map's printed hillshade
  scene.add(sun);
  // Ocean ring around the terrain: same flat depth and colour as the terrain's (faded) outer band, with a hole
  // where the terrain is — no overlapping surfaces, so nothing z-fights or flickers. Built once the meta is loaded.
  let ring: THREE.Group | null = null;
  function buildRing(color: string, depth: number, [fx0, fy0, fx1, fy1]: number[]) {
    // Four finely tessellated strips (not a few huge triangles: fog depth is interpolated per vertex, so big
    // triangles would fog their near edge as if it were tens of km away).
    const R = 60000, inset = 6, SEG = 1200;
    const x0 = fx0 + inset, z0 = fy0 + inset, x1 = fx1 - inset, z1 = fy1 - inset;
    const strips: [number, number, number, number][] = [
      [-R, -R, R, z0], [-R, z1, R, R],          // north, south (full width)
      [-R, z0, x0, z1], [x1, z0, R, z1],        // west, east
    ];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
    ring = new THREE.Group();
    for (const [ax, az, bx, bz] of strips) {
      const w = bx - ax, hh = bz - az;
      const g = new THREE.PlaneGeometry(w, hh, Math.max(1, Math.ceil(w / SEG)), Math.max(1, Math.ceil(hh / SEG)))
        .rotateX(-Math.PI / 2).translate(ax + w / 2, depth, az + hh / 2);
      ring.add(new THREE.Mesh(g, mat));
    }
    scene.add(ring);
  }


  const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(1, el.clientHeight), 5, 60000);
  const controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = MIN_DIST;
  controls.maxDistance = MAX_DIST;
  controls.zoomToCursor = true;
  // Start at home, looking north at ~50° from vertical.
  controls.target.set(...HOME_PRESET.target);
  camera.position.set(...HOME_PRESET.pos);
  controls.update();

  // ---------- heightmap ----------
  let hm: { meta: HeightMeta; v: Float32Array } | null = null;
  const heightAt = (x: number, y: number) => {
    if (!hm) return 0;
    const { step, w, h: hh } = hm.meta;
    const fx = Math.min(w - 1.001, Math.max(0, x / step)), fy = Math.min(hh - 1.001, Math.max(0, y / step));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, v = hm.v;
    const a = v[y0 * w + x0], b = v[y0 * w + x0 + 1], c = v[(y0 + 1) * w + x0], d = v[(y0 + 1) * w + x0 + 1];
    return Math.max(0, (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) * EXAG;
  };
  async function loadHeight() {
    const [meta, img] = await Promise.all([
      fetch(ASSETS('height.json')).then((r) => r.json() as Promise<HeightMeta>),
      new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = ASSETS('height.png'); }),
    ]);
    const c = document.createElement('canvas'); c.width = meta.w; c.height = meta.h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, meta.w, meta.h).data;
    const v = new Float32Array(meta.w * meta.h);
    for (let i = 0; i < v.length; i++) v[i] = px[i * 4] * meta.scale + meta.offset;
    hm = { meta, v };
  }

  // ---------- POI pins: dashed stem + ground dot + badge sprite (site badge style) ----------
  const pinGroup = new THREE.Group();
  scene.add(pinGroup);
  const pins = new Map<string, THREE.Sprite>();
  let stems: THREE.LineSegments | null = null;
  let dots: THREE.InstancedMesh | null = null;
  const badgeTex = new Map<string, THREE.Texture>();
  const selTex = new Map<string, THREE.Texture>();
  const dummy = new THREE.Object3D();
  const BADGE = 0.034;

  async function buildPins() {
    const imgs = new Map<string, HTMLImageElement>();
    await Promise.all(data.categories.map((c) => new Promise<void>((res) => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => { imgs.set(c.id, i); res(); }; i.onerror = () => res(); i.src = iconUrl(c.icon);
    })));
    for (const c of data.categories) {
      const img = imgs.get(c.id);
      if (!img) continue;
      badgeTex.set(c.id, badgeTexture(img, '#ffffff'));
      selTex.set(c.id, badgeTexture(img, '#ffd23f'));
    }
    const n = data.features.length;
    stems = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    const pos = new Float32Array(n * 6);
    dots = new THREE.InstancedMesh(new THREE.CircleGeometry(2.6, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#1a0b2e', transparent: true, opacity: 0.35, depthWrite: false }), n);
    data.features.forEach((f, i) => {
      const [x, y] = f.pos, g = heightAt(x, y);
      pos.set([x, g + 0.5, y, x, g + STEM, y], i * 6);
      dummy.position.set(x, g + 0.6, y); dummy.updateMatrix(); dots!.setMatrixAt(i, dummy.matrix);
      const tex = badgeTex.get(f.category);
      if (!tex) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false }));
      s.center.set(0.47, 0.1);
      s.scale.set(BADGE, BADGE, 1);
      s.position.set(x, g + STEM, y);
      s.renderOrder = 3;
      s.userData.id = f.id;
      pins.set(f.id, s);
      pinGroup.add(s);
    });
    stems.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    stems.computeLineDistances();
    pinGroup.add(stems, dots);
    applyVisibility(derived.visibleIds.get());
  }
  // Hidden pins: sprite off, stem collapsed, dot scaled to 0.
  function applyVisibility(ids: readonly string[]) {
    if (!stems || !dots) return;
    const on = new Set(ids);
    const pos = stems.geometry.attributes.position as THREE.BufferAttribute;
    data.features.forEach((f, i) => {
      const vis = on.has(f.id);
      const s = pins.get(f.id);
      if (s) s.visible = vis;
      const [x, y] = f.pos, g = heightAt(x, y);
      pos.setXYZ(i * 2 + 1, x, vis ? g + STEM : g + 0.5, y);
      dummy.position.set(x, g + 0.6, y); dummy.scale.setScalar(vis ? 1 : 0); dummy.updateMatrix(); dots!.setMatrixAt(i, dummy.matrix);
    });
    pos.needsUpdate = true;
    stems.computeLineDistances();
    dots.instanceMatrix.needsUpdate = true;
  }
  function applyHighlight() {
    const sel = stores.selection.get().featureId;
    const hov = stores.hover.get();
    for (const [id, s] of pins) {
      const f = data.featureById.get(id)!;
      const isSel = id === sel, isHov = hov?.kind === 'feature' && hov.id === id;
      (s.material as THREE.SpriteMaterial).map = (isSel ? selTex : badgeTex).get(f.category)!;
      const k = isSel ? 1.4 : isHov ? 1.2 : 1;
      s.scale.set(BADGE * k, BADGE * k, 1);
      s.renderOrder = isSel ? 6 : isHov ? 5 : 3;
    }
  }

  // ---------- labels: site regions (poster lettering) + counties/towns/places from the map ----------
  const labelGroup = new THREE.Group();
  scene.add(labelGroup);
  const labels: { s: THREE.Sprite; maxD: number; prio: number; region?: string }[] = [];
  function addLabel(l: Label, region?: string) {
    const { tex, aspect, px } = labelTexture(l.text, l.tier, l.color);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    const hgt = px / 900;
    s.scale.set(hgt * aspect, hgt, 1);
    s.center.set(0.5, 0);
    s.renderOrder = 4 + (2 - l.tier);
    s.position.set(l.p[0], l.p[1] + [40, 24, 14][l.tier], l.p[2]);
    labelGroup.add(s);
    labels.push({ s, maxD: [30000, l.county ? 12000 : 5500, 2400][l.tier], prio: l.tier * 10 - (l.county ? 5 : 0), region });
  }
  async function buildLabels() {
    await Promise.race([document.fonts?.load(LABEL_FONT).catch(() => undefined), new Promise((r) => setTimeout(r, 2500))]);
    for (const r of data.regions) addLabel({ text: r.name, p: [r.label[0], heightAt(r.label[0], r.label[1]), r.label[1]], tier: 0, color: r.color }, r.id);
    const more = (await fetch(ASSETS('labels3d.json')).then((r) => r.json())) as Label[];
    for (const l of more) if (l.tier > 0) addLabel({ ...l, p: [l.p[0], heightAt(l.p[0], l.p[2]), l.p[2]] });
    applyRegionState();
  }
  const v3 = new THREE.Vector3();
  function declutter() {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const cw = el.clientWidth, ch = el.clientHeight;
    for (const l of [...labels].sort((a, b) => a.prio - b.prio)) {
      const s = l.s;
      s.visible = false;
      if (camera.position.distanceTo(s.position) > l.maxD) continue;
      v3.copy(s.position).project(camera);
      if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) continue;
      const hpx = s.scale.y * ch * 0.83, wpx = s.scale.x * ch * 0.83;
      const r = { x: (v3.x + 1) * cw / 2 - wpx / 2, y: (1 - v3.y) * ch / 2 - hpx, w: wpx, h: hpx * 0.8 };
      if (placed.some((p) => r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h && p.y < r.y + r.h)) continue;
      placed.push(r);
      s.visible = true;
    }
  }

  // ---------- region outlines (neon line over a dark casing, draped on the terrain) ----------
  const outlineGroup = new THREE.Group();
  scene.add(outlineGroup);
  const outlines = new Map<string, { line: LineMaterial; casing: LineMaterial }>();
  function buildOutlines() {
    const res = new THREE.Vector2(el.clientWidth, el.clientHeight);
    for (const r of data.regions) {
      const line = new LineMaterial({ color: r.color, linewidth: 2, transparent: true, opacity: 0.9, depthTest: false });
      const casing = new LineMaterial({ color: '#1a0b2e', linewidth: 4.5, transparent: true, opacity: 0.6, depthTest: false });
      line.resolution.copy(res); casing.resolution.copy(res);
      for (const poly of r.geometry.coordinates) {
        const ring = poly[0], pts: number[] = [];
        for (let i = 0; i < ring.length; i++) {
          const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
          const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 40)); // densify so the line hugs the terrain
          for (let k = 0; k < n; k++) {
            const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
            pts.push(x, heightAt(x, y) + 3, y);
          }
        }
        pts.push(pts[0], pts[1], pts[2]);
        const geo = new LineGeometry(); geo.setPositions(pts);
        const c = new Line2(geo, casing), l = new Line2(geo, line);
        c.renderOrder = 2; l.renderOrder = 2;
        outlineGroup.add(c, l);
      }
      outlines.set(r.id, { line, casing });
    }
    applyRegionState();
  }
  function applyRegionState() {
    const sel = stores.filters.get().regions;
    const hov = stores.hover.get();
    for (const [id, m] of outlines) {
      const on = sel.has(id), hv = hov?.kind === 'region' && hov.id === id, dim = sel.size > 0 && !on;
      m.line.linewidth = on || hv ? 3.2 : 1.6;
      m.line.opacity = dim ? 0.35 : 1;
      m.casing.linewidth = on || hv ? 6.5 : 3.6;
      m.casing.opacity = dim ? 0.2 : on || hv ? 0.85 : 0.5;
    }
    for (const l of labels) if (l.region) (l.s.material as THREE.SpriteMaterial).opacity = sel.size > 0 && !sel.has(l.region) ? 0.25 : 1;
  }

  // ---------- camera: focus intents, padding for overlays ----------
  let anim: { t0: number; dur: number; fromT: THREE.Vector3; fromP: THREE.Vector3; toT: THREE.Vector3; toP: THREE.Vector3; done: () => void } | null = null;
  let settleWaiters: (() => void)[] = [];
  const flushSettled = () => { if (anim || intentPending) return; const w = settleWaiters; settleWaiters = []; w.forEach((f) => f()); };
  const cameraSettled = () => new Promise<void>((res) => { settleWaiters.push(res); flushSettled(); });
  const padding = (extra?: Partial<Padding>): Padding => {
    const { bottom, left } = stores.insets.get();
    return { top: EDGE, left: EDGE + left, right: EDGE, bottom: EDGE + bottom, ...extra };
  };
  const viewDir = () => camera.position.clone().sub(controls.target).normalize();
  const worldPerPx = (dist: number) => (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, el.clientHeight);
  function moveTo(target: THREE.Vector3, dist: number, pad: Padding, animate: boolean, dirIn?: [number, number, number]) {
    dist = THREE.MathUtils.clamp(dist, MIN_DIST, MAX_DIST);
    const dir = dirIn ? new THREE.Vector3(...dirIn).normalize() : viewDir();
    // Center the target in the part of the canvas not covered by overlays (camera right/forward of the *new* view).
    const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const fwd = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
    const wpp = worldPerPx(dist);
    const t = target.clone()
      .addScaledVector(right, (-(pad.left - pad.right) / 2) * wpp)
      .addScaledVector(fwd, (-(pad.bottom - pad.top) / 2) * wpp * 1.3); // bottom overlay → look further down the screen
    const p = t.clone().addScaledVector(dir, dist);
    if (!animate) {
      anim = null;
      controls.target.copy(t); camera.position.copy(p); controls.update();
      flushSettled();
      return;
    }
    const prev = anim; anim = null; prev?.done();
    anim = { t0: performance.now(), dur: DURATION, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: t, toP: p, done: () => {} };
  }
  function focus(target: FocusTarget, opts: { padding?: Partial<Padding>; animate?: boolean } = {}) {
    const animate = opts.animate !== false;
    const pad = padding(opts.padding);
    const fit = (bw: number, bh: number) => {
      const vw = el.clientWidth - pad.left - pad.right, vh = el.clientHeight - pad.top - pad.bottom;
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      // north–south extent is foreshortened by the ~50° tilt (×cos)
      return 1.05 * Math.max(0.68 * bh / (2 * tanH) * (el.clientHeight / Math.max(1, vh)), bw / (2 * tanH * camera.aspect) * (el.clientWidth / Math.max(1, vw)));
    };
    if ('home' in target) moveTo(new THREE.Vector3(...HOME_PRESET.target), presetDist(HOME_PRESET), pad, animate, HOME_DIR);
    else if ('bbox' in target) {
      const [x0, y0, x1, y1] = target.bbox;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      // A single selected region whose box this is → fly to that region's own viewpoint.
      const sel = [...stores.filters.get().regions];
      const reg = sel.length === 1 ? data.regionById.get(sel[0]) : undefined;
      const isRegionBox = !!reg && reg.bbox.every((v, i) => Math.abs(v - target.bbox[i]) < 1);
      const preset = isRegionBox ? REGION_PRESETS[reg!.id] : undefined;
      if (preset) moveTo(new THREE.Vector3(...preset.target), presetDist(preset), pad, animate, presetDir(preset));
      else moveTo(new THREE.Vector3(cx, heightAt(cx, cy), cy), fit(x1 - x0, y1 - y0), pad, animate, isRegionBox ? REGION_DIRS[reg!.id] : undefined);
    } else {
      const [x, y] = target.point;
      const cur = camera.position.distanceTo(controls.target);
      moveTo(new THREE.Vector3(x, heightAt(x, y), y), target.minZoom ? Math.min(cur, POI_DIST) : cur, pad, animate);
    }
    return cameraSettled();
  }
  let intentPending = false, pendingIntent: FocusIntent | null = null, loaded = false;
  const runIntent = () => {
    if (!pendingIntent || !loaded) return;
    const it = pendingIntent; pendingIntent = null; intentPending = false;
    void focus(it.target, { animate: it.animate });
  };
  const offFocus = ctx.focus.subscribe((intent) => {
    pendingIntent = loaded ? intent : { ...intent, animate: false };
    intentPending = true;
    requestAnimationFrame(runIntent);
  });
  // The user grabbing the camera cancels a fly-to.
  controls.addEventListener('start', () => { if (anim) { anim = null; flushSettled(); } });

  // ---------- pointer: hover tooltip, click to select ----------
  const tip = document.createElement('div');
  tip.className = 'v3-tip'; tip.style.display = 'none';
  el.appendChild(tip);
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -8);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const inRing = (x: number, y: number, ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  function pick(ev: PointerEvent | MouseEvent): { feature?: string; region?: string; at?: THREE.Vector3 } {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...pins.values()].filter((s) => s.visible), false)[0];
    if (hit) return { feature: hit.object.userData.id as string };
    const at = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!at) return {};
    const reg = data.regions.find((rg) => rg.geometry.coordinates.some((poly) => inRing(at.x, at.z, poly[0])));
    return { region: reg?.id, at };
  }
  let hoverFrame = 0, lastMove: PointerEvent | null = null;
  const onHover = () => {
    hoverFrame = 0;
    if (!lastMove || !loaded || anim) return;
    const r = renderer.domElement.getBoundingClientRect();
    const p = pick(lastMove);
    if (p.feature) {
      const f = data.featureById.get(p.feature)!;
      actions.setHover({ kind: 'feature', id: f.id });
      const region = data.regionById.get(f.region);
      tip.innerHTML = `${esc(featureTitle(f, data))}${region ? ` <small>· ${esc(region.name)}</small>` : ''}`;
    } else if (p.region) {
      actions.setHover({ kind: 'region', id: p.region });
      tip.textContent = data.regionById.get(p.region)!.name;
    } else {
      clearPointer();
      return;
    }
    tip.style.display = 'block';
    tip.style.left = `${lastMove.clientX - r.left}px`;
    tip.style.top = `${lastMove.clientY - r.top}px`;
    renderer.domElement.style.cursor = 'pointer';
  };
  const clearPointer = () => { actions.setHover(null); tip.style.display = 'none'; renderer.domElement.style.cursor = ''; };
  const onMove = (ev: PointerEvent) => { if (ev.buttons) { clearPointer(); return; } lastMove = ev; if (!hoverFrame) hoverFrame = requestAnimationFrame(onHover); };
  const onLeave = () => { lastMove = null; clearPointer(); };
  let downAt: [number, number] | null = null;
  const onDown = (ev: PointerEvent) => { downAt = [ev.clientX, ev.clientY]; };
  const onUp = (ev: PointerEvent) => {
    if (!downAt || !loaded || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) { downAt = null; return; } // a drag, not a click
    downAt = null;
    const p = pick(ev);
    if (p.feature) { actions.selectFeature(p.feature); tip.style.display = 'none'; return; }
    actions.selectFeature(null);
    if (p.region) actions.toggleRegion(p.region, { multi: ev.metaKey || ev.ctrlKey || ev.shiftKey });
  };
  const cv = renderer.domElement;
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerleave', onLeave);
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointerup', onUp);

  // ---------- feature popup (same FeatureCard as 2D) ----------
  const pop = document.createElement('div');
  pop.className = 'v3-pop'; pop.style.display = 'none';
  const popBody = document.createElement('div');
  const close = document.createElement('button');
  close.type = 'button'; close.setAttribute('aria-label', 'Close popup'); close.textContent = '×';
  close.onclick = () => actions.selectFeature(null);
  pop.append(close, popBody);
  el.appendChild(pop);
  let popFor: string | null = null, popToken = 0;
  async function showPopup(id: string | null) {
    const my = ++popToken;
    if (!id) { popFor = null; pop.style.display = 'none'; render(null, popBody); return; }
    await cameraSettled();
    if (my !== popToken) return;
    render(h(FeatureCard, { feature: data.featureById.get(id)!, data }), popBody);
    popFor = id;
    pop.style.display = 'block';
  }
  const placePopup = () => {
    if (!popFor) return;
    const f = data.featureById.get(popFor)!;
    const [x, y] = view.project(f.pos);
    pop.style.left = `${x}px`;
    pop.style.top = `${y - 34}px`;
  };

  // ---------- camera listeners for the minimap / zoom buttons ----------
  type CamCb = Parameters<MapView['onCamera']>[0];
  const camCbs = new Set<CamCb>();
  const corner = new THREE.Vector3();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function emitCamera() {
    if (!camCbs.size) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1]] as const) {
      ray.setFromCamera(ndc.set(nx, ny), camera);
      // Rays above the horizon: clamp to a far point along their ground direction.
      if (!ray.ray.intersectPlane(ground, corner)) corner.copy(ray.ray.direction).setY(0).normalize().multiplyScalar(MAX_DIST * 1.5).add(camera.position);
      x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.z); y1 = Math.max(y1, corner.z);
    }
    const cl = (v: number, m: number) => Math.min(1, Math.max(0, v / m));
    const d = camera.position.distanceTo(controls.target);
    const r = { x0: cl(x0, W), y0: cl(y0, H), x1: cl(x1, W), y1: cl(y1, H), atMin: d >= MAX_DIST - 1, atMax: d <= MIN_DIST + 1 };
    camCbs.forEach((cb) => cb(r));
  }

  // ---------- render loop ----------
  const clampTarget = () => {
    const t = controls.target;
    const cx = THREE.MathUtils.clamp(t.x, 0, W), cz = THREE.MathUtils.clamp(t.z, 0, H);
    if (cx !== t.x || cz !== t.z) { camera.position.x += cx - t.x; camera.position.z += cz - t.z; t.x = cx; t.z = cz; }
  };
  let frame = 0, raf = 0, lastCam = '';
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      controls.target.lerpVectors(anim.fromT, anim.toT, e);
      camera.position.lerpVectors(anim.fromP, anim.toP, e);
      if (k >= 1) { const a = anim; anim = null; a.done(); flushSettled(); }
    }
    controls.update();
    clampTarget();
    // Fog follows the zoom: the map never washes out while zooming, only the far ocean fades into the background.
    const dist = camera.position.distanceTo(controls.target);
    (scene.fog as THREE.Fog).near = dist * 1.4 + 1500;
    (scene.fog as THREE.Fog).far = dist * 4.5 + 9000;
    if (!(frame++ % 6)) declutter();
    const cam = camera.position.toArray().map((v) => v.toFixed(1)).join();
    if (cam !== lastCam) { lastCam = cam; emitCamera(); }
    placePopup();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth, hh = el.clientHeight;
    if (!w || !hh) return;
    renderer.setSize(w, hh);
    camera.aspect = w / hh; camera.updateProjectionMatrix();
    for (const m of outlines.values()) { m.line.resolution.set(w, hh); m.casing.resolution.set(w, hh); }
    lastCam = '';
  });
  ro.observe(el);

  // ---------- load ----------
  const offs: (() => void)[] = [];
  let destroyed = false;
  (async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const [gltf] = await Promise.all([loader.loadAsync(ASSETS('leonida.glb')), loadHeight()]);
    if (destroyed) return;
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!/^(terrain|buildings)/.test(o.name)) { o.visible = false; return; } // only terrain + buildings; the ocean is the texture + ring
      if (o.name.startsWith('buildings')) { m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true }); return; }
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.roughness = 1; mat.metalness = 0;
      if (mat.map) { mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); mat.map.colorSpace = THREE.SRGBColorSpace; }
    });
    gltf.scene.scale.y = EXAG;
    scene.add(gltf.scene);
    const meta = hm!.meta;
    buildRing(meta.ocean ?? '#07aec9', (meta.edgeDepth ?? -7) * EXAG, meta.frame ?? [200, 200, W - 190, H - 210]);
    buildOutlines();
    await Promise.all([buildPins(), buildLabels()]);
    if (destroyed) return;
    offs.push(derived.visibleIds.subscribe(applyVisibility));
    offs.push(stores.hover.subscribe(() => { applyHighlight(); applyRegionState(); }));
    offs.push(stores.filters.subscribe(applyRegionState));
    offs.push(stores.selection.subscribe(({ featureId }) => { applyHighlight(); void showPopup(featureId); }));
    loaded = true;
    loadingEl.remove();
    el.dataset.ready = 'true';
    if (pendingIntent) runIntent();
  })().catch((e) => { loadingEl.textContent = `3D failed to load: ${e?.message ?? e}`; console.error(e); });

  const view: MapView = {
    focus,
    project(p) {
      const v = new THREE.Vector3(p[0], heightAt(p[0], p[1]) + STEM, p[1]).project(camera);
      return [((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight];
    },
    zoomBy(delta) {
      const d = camera.position.distanceTo(controls.target) * 2 ** -delta;
      moveTo(controls.target.clone(), d, { top: 0, left: 0, right: 0, bottom: 0 }, true);
    },
    panTo(p) {
      moveTo(new THREE.Vector3(p[0], heightAt(p[0], p[1]), p[1]), camera.position.distanceTo(controls.target), { top: 0, left: 0, right: 0, bottom: 0 }, true);
    },
    onCamera(cb) {
      camCbs.add(cb);
      lastCam = '';
      return () => void camCbs.delete(cb);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      offFocus();
      offs.forEach((off) => off());
      ro.disconnect();
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerleave', onLeave);
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointerup', onUp);
      controls.dispose();
      render(null, popBody);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) { (mat as THREE.MeshStandardMaterial).map?.dispose(); mat.dispose(); }
      });
      renderer.dispose();
      renderer.domElement.remove();
      tip.remove(); pop.remove(); loadingEl.remove();
      delete el.dataset.mode; delete el.dataset.ready;
      actions.setHover(null);
    },
  };
  // Handy for debugging / headless checks (like the MapLibre view's el.__map).
  (el as HTMLElement & { __three?: unknown }).__three = { scene, camera, renderer, controls };
  return view;
};
