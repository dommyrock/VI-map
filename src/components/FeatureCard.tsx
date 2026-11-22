import { featureTitle, type Dataset } from '../lib/data';
import type { Feature } from '../lib/schema';

/** Popup content for a POI. Rendered by the map view into its single reusable popup. */
export function FeatureCard({ feature: f, data }: { feature: Feature; data: Dataset }) {
  const cat = data.categoryById.get(f.category);
  const region = data.regionById.get(f.region);
  return (
    <div class="pop">
      <b>{featureTitle(f, data)}</b>
      <div class="meta">
        {cat?.name}
        {region && (
          <>
            {' · '}
            <i style={{ '--c': region.color }} />
            {region.name}
          </>
        )}
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
      <p>
        <code>
          x {f.pos[0].toFixed(0)}, y {f.pos[1].toFixed(0)}
        </code>
      </p>
    </div>
  );
}
