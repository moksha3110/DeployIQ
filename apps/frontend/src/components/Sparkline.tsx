import type { MetricSample } from '@platform/shared-types';

const WIDTH = 300;
const HEIGHT = 60;

// A hand-rolled inline-SVG line chart rather than a charting library — this
// is one shape (a time series sparkline), used in exactly one place; not
// worth a new dependency for.
export function Sparkline({
  samples,
  color = '#2563eb',
}: {
  samples: MetricSample[];
  color?: string;
}) {
  if (samples.length < 2) {
    return (
      <div className="flex h-[60px] items-center text-xs text-slate-400">Not enough data yet</div>
    );
  }

  const values = samples.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = samples.map((s, i) => {
    const x = (i / (samples.length - 1)) * WIDTH;
    const y = HEIGHT - ((s.value - min) / range) * HEIGHT;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[60px] w-full">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}
