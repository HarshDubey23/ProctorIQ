import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  width?: number;
  label: string;
}

export function TrendSparkline({ data, color, height = 48, width = 240, label }: SparklineProps) {
  const [animated, setAnimated] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (data.length < 2) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</span>
        <div style={{ width, height }} className="flex items-center justify-center rounded-lg bg-white/[0.02]">
          <span className="font-sans text-[11px] text-text-muted italic">Insufficient data</span>
        </div>
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;

  const points = data.map((val, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`)).join(' ');

  return (
    <div className="flex flex-col gap-1">
      <span className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary">{label}</span>
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        aria-label={`${label} sparkline`}
      >
        <motion.path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reducedMotion ? undefined : { pathLength: 0 }}
          animate={animated ? { pathLength: 1 } : undefined}
          transition={reducedMotion ? { duration: 0 } : { duration: 1.2, ease: 'easeOut' }}
        />
        <circle cx={parseFloat(points[points.length - 1].split(',')[0])} cy={parseFloat(points[points.length - 1].split(',')[1])} r={3} fill={color} />
      </svg>
    </div>
  );
}
