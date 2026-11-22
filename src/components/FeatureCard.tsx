import { iconUrl } from '../lib/assets';
import { featureTitle, type Dataset } from '../lib/data';
import type { Feature } from '../lib/schema';

/** Popup content for a POI. Rendered by the map view into its single reusable popup. */
export function FeatureCard({ feature: f, data }: { feature: Feature; data: Dataset }) {
  const cat = data.categoryById.get(f.category);
  const region = data.regionById.get(f.region);
  return (
    <div class="pop" style={{ '--c': region?.color ?? '#ffffff' }}>
      <div class="pop-h">
        {cat?.name}
        {region && <> · {region.shortName}</>}
      </div>
      <div class="pop-b">
        <div class="pop-t">
          {cat && <img src={iconUrl(cat.icon)} alt="" width={34} height={34} />}
          <b>{featureTitle(f, data)}</b>
        </div>
        {f.description && (
          <p>
            {f.description.split('\n').map((line, i) => (
              <>
                {i > 0 && <br />}
                {line}
              </>
            ))}
          </p>
        )}
        <code>
          Map position {f.pos[0].toFixed(0)}, {f.pos[1].toFixed(0)}
        </code>
      </div>
    </div>
  );
}
