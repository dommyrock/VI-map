/** URLs of static assets under public/, respecting Astro's base path. */
const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
export const assetPath = (rel: string) => base + rel;
export const iconUrl = (file: string) => assetPath(`assets/icons/${file}`);
export const postcardUrl = (file: string) => assetPath(`assets/postcards/${file}`);
