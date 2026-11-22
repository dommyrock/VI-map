import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { RegionInfo } from './lib/schema';

/** Region copy (tagline, inspiration, summary, postcard). File name = region id. */
const regions = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/regions' }),
  schema: RegionInfo,
});

export const collections = { regions };
