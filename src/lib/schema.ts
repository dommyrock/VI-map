/**
 * Data contracts shared by the pipeline (Node) and the client.
 * All canonical geometry is in image pixels of the base map (x right, y down);
 * only the MapLibre adapter converts to lng/lat (see space.ts).
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a kebab-case id');
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

/** A position in image px: [x right, y down]. */
export const Px = z.tuple([z.number(), z.number()]);
export type Px = z.infer<typeof Px>;

/** A closed ring (first === last), image px. */
export const Ring = z
  .array(Px)
  .min(4)
  .refine((r) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1], 'ring must be closed');
export type Ring = z.infer<typeof Ring>;
/** [outer, ...holes] */
export const PolygonRings = z.array(Ring).min(1);
export type PolygonRings = z.infer<typeof PolygonRings>;

// ---------- Authored ----------

export const Group = z.object({ id: slug, name: z.string().min(1) });
export type Group = z.infer<typeof Group>;
export const GroupsFile = z.array(Group).min(1);

export const Category = z.object({
  id: slug,
  name: z.string().min(1),
  groupId: slug,
  /** File name under /assets/icons/. Icons belong to categories, not features. */
  icon: z.string().regex(/^[a-z0-9-]+\.png$/),
  /** Lower = more important. Categories with a priority feed the drawer's "Key locations". */
  keyPriority: z.number().int().positive().optional(),
});
export type Category = z.infer<typeof Category>;
export const CategoriesFile = z.array(Category).min(1);

export const RegionProps = z.object({
  id: slug,
  name: z.string().min(1),
  shortName: z.string().min(1),
  color: hexColor,
  /** Where the region's name label sits, image px. */
  label: Px,
});
export type RegionProps = z.infer<typeof RegionProps>;

/** Coarse partition of the image into regions; the authority for region tagging. */
export const PartitionFile = z.object({
  type: z.literal('FeatureCollection'),
  mapSpace: z.literal('leonida-px@1'),
  features: z
    .array(
      z.object({
        type: z.literal('Feature'),
        properties: RegionProps,
        geometry: z.object({ type: z.literal('Polygon'), coordinates: PolygonRings }),
      }),
    )
    .min(1),
});
export type PartitionFile = z.infer<typeof PartitionFile>;

// ---------- Generated ----------

export const FeatureAttrs = z.object({
  /** Bank heist take, USD [min, max]. Parsed from "Take value: $X - $Y". */
  takeValue: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
  /** Stunt jump challenge, parsed from "Challenge: …". */
  challenge: z.string().min(1).optional(),
});
export type FeatureAttrs = z.infer<typeof FeatureAttrs>;

export const Feature = z.object({
  id: z.string().regex(/^m-[0-9a-f]{8}$/),
  source: z.literal('mobalytics'),
  sourceId: z.string().min(1),
  category: slug,
  /** null when the source title is just the category name (generic). */
  title: z.string().min(1).nullable(),
  description: z.string().min(1).optional(),
  attrs: FeatureAttrs.optional(),
  pos: Px,
  region: slug,
});
export type Feature = z.infer<typeof Feature>;

export const FeaturesFile = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  mapSpace: z.literal('leonida-px@1'),
  features: z.array(Feature),
});
export type FeaturesFile = z.infer<typeof FeaturesFile>;

export const RegionFeature = z.object({
  type: z.literal('Feature'),
  properties: RegionProps,
  geometry: z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(PolygonRings).min(1) }),
});
export type RegionFeature = z.infer<typeof RegionFeature>;

export const RegionsFile = z.object({
  type: z.literal('FeatureCollection'),
  mapSpace: z.literal('leonida-px@1'),
  features: z.array(RegionFeature).min(1),
});
export type RegionsFile = z.infer<typeof RegionsFile>;

export const Manifest = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  mapSpace: z.literal('leonida-px@1'),
  counts: z.object({
    features: z.number().int(),
    categories: z.number().int(),
    groups: z.number().int(),
    regions: z.number().int(),
    byRegion: z.record(z.string(), z.number().int()),
  }),
  sources: z.array(z.object({ path: z.string(), sha256: z.string().length(64), note: z.string().optional() })),
});
export type Manifest = z.infer<typeof Manifest>;

// ---------- Content (src/content/regions/*.md frontmatter) ----------

export const RegionInfo = z.object({
  tagline: z.string().optional(),
  realWorld: z.string().optional(),
  /** File name under /assets/postcards/ */
  postcard: z.string().optional(),
  summary: z.array(z.string()).default([]),
});
export type RegionInfo = z.infer<typeof RegionInfo>;
