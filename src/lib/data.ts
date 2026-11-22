/** Load + validate the dataset and build lookup indexes. Pure; shared by pipeline and client. */
import { bbox, type BBox } from './geo';
import {
  CategoriesFile, FeaturesFile, GroupsFile, RegionsFile,
  type Category, type Feature, type Group, type RegionFeature, type RegionProps,
} from './schema';

export type Region = RegionProps & {
  geometry: RegionFeature['geometry'];
  /** px bbox of the region's geometry */
  bbox: BBox;
};

export type Dataset = {
  features: Feature[];
  categories: Category[];
  groups: Group[];
  regions: Region[];
  featureById: Map<string, Feature>;
  categoryById: Map<string, Category>;
  regionById: Map<string, Region>;
  byCategory: Map<string, Feature[]>;
  byRegion: Map<string, Feature[]>;
  /** Categories per group, in display order (by total count, descending). */
  categoriesByGroup: { group: Group; categories: Category[] }[];
};

export type RawDataset = { features: unknown; regions: unknown; categories: unknown; groups: unknown };

export function parseDataset(raw: RawDataset): Dataset {
  const { features } = FeaturesFile.parse(raw.features);
  const regionsFile = RegionsFile.parse(raw.regions);
  const categories = CategoriesFile.parse(raw.categories);
  const groups = GroupsFile.parse(raw.groups);

  const errors: string[] = [];
  const uniq = <T>(items: T[], key: (t: T) => string, what: string) => {
    const m = new Map<string, T>();
    for (const it of items) {
      const k = key(it);
      if (m.has(k)) errors.push(`duplicate ${what} id ${k}`);
      m.set(k, it);
    }
    return m;
  };
  const regions: Region[] = regionsFile.features.map((f) => ({
    ...f.properties,
    geometry: f.geometry,
    bbox: bbox(f.geometry.coordinates.flatMap((poly) => poly[0])),
  }));
  const groupById = uniq(groups, (g) => g.id, 'group');
  const categoryById = uniq(categories, (c) => c.id, 'category');
  const regionById = uniq(regions, (r) => r.id, 'region');
  const featureById = uniq(features, (f) => f.id, 'feature');
  for (const c of categories) if (!groupById.has(c.groupId)) errors.push(`category ${c.id}: unknown group ${c.groupId}`);

  const byCategory = new Map<string, Feature[]>(categories.map((c) => [c.id, []]));
  const byRegion = new Map<string, Feature[]>(regions.map((r) => [r.id, []]));
  for (const f of features) {
    const inCat = byCategory.get(f.category);
    const inReg = byRegion.get(f.region);
    if (!inCat) errors.push(`feature ${f.id}: unknown category ${f.category}`);
    if (!inReg) errors.push(`feature ${f.id}: unknown region ${f.region}`);
    inCat?.push(f);
    inReg?.push(f);
  }
  if (errors.length) throw new Error('Dataset integrity:\n' + errors.join('\n'));

  const categoriesByGroup = groups
    .map((group) => ({
      group,
      categories: categories
        .filter((c) => c.groupId === group.id)
        .sort((a, b) => byCategory.get(b.id)!.length - byCategory.get(a.id)!.length),
    }))
    .filter((g) => g.categories.length);

  return {
    features, categories, groups, regions,
    featureById, categoryById, regionById, byCategory, byRegion, categoriesByGroup,
  };
}

/** Client loader: the generated JSON is code-split into its own chunk. */
export async function loadDataset(): Promise<Dataset> {
  const [features, regions, categories, groups] = await Promise.all([
    import('../../data/generated/features.json').then((m) => m.default),
    import('../../data/generated/regions.geojson?raw').then((m) => JSON.parse(m.default)),
    import('../../data/authored/categories.json').then((m) => m.default),
    import('../../data/authored/groups.json').then((m) => m.default),
  ]);
  return parseDataset({ features, regions, categories, groups });
}

/** Display title: generic features (title null) show their category name. */
export const featureTitle = (f: Feature, ds: Dataset) => f.title ?? ds.categoryById.get(f.category)?.name ?? f.id;
