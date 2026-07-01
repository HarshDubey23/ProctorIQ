import { useMemo } from 'react';
import { motion, useSpring } from 'framer-motion';
import { interpolate, formatHex } from 'culori';
import { useReducedMotion } from '../../lib/useReducedMotion';

interface ApertureGaugeProps {
  openness: number;
  score?: number | null;
  attentionLabel?: string;
  children?: React.ReactNode;
  size?: number;
  showScore?: boolean;
}

const NUM_BLADES = 8;
const BLADE_OVERLAP = 0.15;
const CENTER_RATIO = 0.3;

const COLOR_STOPS = ['#0E6B5C', '#B8763A', '#6B5178', '#A63D2F'];

const interpolateColor = interpolate(COLOR_STOPS, 'oklch');

function generateBladePath(
  index: number,
  numBlades: number,
  openness: number,
): string {
  const angle = (index / numBlades) * Math.PI * 2;
  const nextAngle = ((index + 1) / numBlades) * Math.PI * 2;
  const midAngle = (angle + nextAngle) / 2;

  const bladeRadius = 0.5;
  const closedGap = 0.02;
  const closedInner = 0.02;
  const openInner = CENTER_RATIO + (1 - CENTER_RATIO) * openness;

  const outerR = bladeRadius - closedGap;
  const innerR = closedInner + (openInner - closedInner) * (1 - openness * 0.7);

  const overlap = BLADE_OVERLAP * (1 - openness * 0.5);

  const p1Angle = angle - overlap;
  const p3Angle = nextAngle + overlap;

  const p1 = { x: 0.5 + Math.cos(p1Angle) * outerR, y: 0.5 + Math.sin(p1Angle) * outerR };
  const p3 = { x: 0.5 + Math.cos(p3Angle) * outerR, y: 0.5 + Math.sin(p3Angle) * outerR };
  const p2 = { x: 0.5 + Math.cos(midAngle) * innerR, y: 0.5 + Math.sin(midAngle) * innerR };

  const cp1x = 0.5 + Math.cos(angle) * (outerR * 0.85);
  const cp1y = 0.5 + Math.sin(angle) * (outerR * 0.85);
  const cp2x = 0.5 + Math.cos(nextAngle) * (outerR * 0.85);
  const cp2y = 0.5 + Math.sin(nextAngle) * (outerR * 0.85);

  return `M ${p1.x.toFixed(4)} ${p1.y.toFixed(4)}
          Q ${cp1x.toFixed(4)} ${cp1y.toFixed(4)}, ${p2.x.toFixed(4)} ${p2.y.toFixed(4)}
          Q ${cp2x.toFixed(4)} ${cp2y.toFixed(4)}, ${p3.x.toFixed(4)} ${p3.y.toFixed(4)}
          Z`;
}

function opennessToColor(openness: number): string {
  const t = Math.max(0, Math.min(1, 1 - openness));
  return formatHex(interpolateColor(t));
}

export function ApertureGauge({
  openness,
  score = null,
  attentionLabel = 'focused',
  children,
  size = 280,
  showScore = false,
}: ApertureGaugeProps) {
  const reducedMotion = useReducedMotion();

  const springConfig = reducedMotion
    ? { stiffness: 1000, damping: 100 }
    : { stiffness: 120, damping: 26, mass: 1.2 };

  const opennessSpring = useSpring(openness, springConfig);

  if (reducedMotion) {
    opennessSpring.set(openness);
  }

  const blades = useMemo(() => {
    return Array.from({ length: NUM_BLADES }, (_, i) => ({
      path: generateBladePath(i, NUM_BLADES, openness),
      color: opennessToColor(openness),
    }));
  }, [openness]);

  const viewBox = '0 0 1 1';

  const color = opennessToColor(openness);

  if (reducedMotion) {
    return (
      <svg
        viewBox={viewBox}
        width={size}
        height={size}
        role="img"
        aria-label={`Aperture gauge: ${Math.round(openness * 100)}% open, ${attentionLabel}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {showScore && score !== null ? (
          <foreignObject x="0.15" y="0.25" width="0.7" height="0.5">
            <div
              className="font-display"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: `${size * 0.18}px`,
                color: 'var(--ink)',
                textAlign: 'center',
              }}
            >
              {Math.round(score)}
            </div>
          </foreignObject>
        ) : children ? (
          <foreignObject x="0" y="0" width="1" height="1">
            <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '50%' }}>
              {children}
            </div>
          </foreignObject>
        ) : null}
      </svg>
    );
  }

  return (
    <svg
      viewBox={viewBox}
      width={size}
      height={size}
      role="img"
      aria-label={`Aperture gauge: ${Math.round(openness * 100)}% open, ${attentionLabel}`}
      style={{ transform: 'rotate(-90deg)' }}
    >
      {blades.map((blade, i) => (
        <motion.path
          key={i}
          d={blade.path}
          fill={blade.color}
          stroke={color}
          strokeWidth={0.003}
          strokeOpacity={0.3}
          initial={false}
          animate={{
            d: generateBladePath(i, NUM_BLADES, openness),
            fill: opennessToColor(openness),
          }}
          transition={springConfig}
          style={{
            transformOrigin: 'center',
            transformBox: 'fill-box',
          }}
        />
      ))}

      <motion.circle
        cx={0.5}
        cy={0.5}
        r={0.02}
        fill={color}
        initial={false}
        animate={{ fill: color }}
        transition={springConfig}
      />

      {showScore && score !== null ? (
        <foreignObject x="0.15" y="0.25" width="0.7" height="0.5">
          <motion.div
            className="font-display"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: `${size * 0.18}px`,
              color: 'var(--ink)',
              textAlign: 'center',
              lineHeight: 1,
            }}
          >
            {Math.round(score)}
          </motion.div>
        </foreignObject>
      ) : children ? (
        <foreignObject x="0" y="0" width="1" height="1">
          <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '50%' }}>
            {children}
          </div>
        </foreignObject>
      ) : null}
    </svg>
  );
}
