/**
 * Canvas textures for the 3D view, drawn in the 2D site's styles:
 * - POI badge: the filter badge from maplibre/pois.ts (white disc, ink rim, hard pink offset shadow) with the icon;
 * - labels: the poster lettering from maplibre/labels.ts (white Lilita One, ink outline, italic lean,
 *   hard offset shadow in the region colour). Counties get an ink shadow, towns/places the outline only.
 */
import { CanvasTexture, SRGBColorSpace } from 'three';

const INK = '#1a0b2e';
const PINK = '#e3168c';
export type LabelTier = 0 | 1 | 2;

function finish(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** fill: '#ffffff' normally, the site's sun yellow for the selected POI. */
export function badgeTexture(icon: HTMLImageElement, fill: string) {
  const S = 128, r = 44, off = 6, cx = 60, cy = 60;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.lineWidth = 5;
  g.strokeStyle = INK;
  g.beginPath(); g.arc(cx + off, cy + off, r, 0, Math.PI * 2); g.fillStyle = PINK; g.fill(); g.stroke();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.stroke();
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 4; g.shadowOffsetY = 2; // the site's baked icon shadow
  g.drawImage(icon, cx - 30, cy - 30, 60, 60);
  return finish(c);
}

/** Returns the texture, its aspect ratio and its CSS-px height (for sizing the sprite). */
export function labelTexture(text: string, tier: LabelTier, color?: string) {
  const dpr = 2, SKEW = 0.14;
  const size = [26, 17, 13][tier] * dpr, stroke = [4, 3, 2.5][tier] * dpr, off = tier === 2 ? 0 : [4, 2.5][tier] * dpr, pad = 10 * dpr;
  const font = `400 ${size}px "Lilita One", "Arial Black", Impact, sans-serif`;
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = font;
  const h = Math.ceil(size * 1.25 + pad * 2 + off);
  const w = Math.ceil(m.measureText(text).width + pad * 2 + off + SKEW * h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.setTransform(1, 0, -SKEW, 1, SKEW * h * 0.5, 0);
  g.font = font;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = stroke * 2;
  g.strokeStyle = INK;
  const x = pad, y = (h - off) / 2;
  if (off) { g.strokeText(text, x + off, y + off); g.fillStyle = color ?? INK; g.fillText(text, x + off, y + off); }
  g.strokeText(text, x, y);
  g.fillStyle = '#fff';
  g.fillText(text, x, y);
  return { tex: finish(c), aspect: w / h, px: h / dpr };
}
