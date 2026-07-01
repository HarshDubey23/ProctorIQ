import { motion } from 'framer-motion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { gaugeSpring } from '../../motion.config';

interface GaugeProps {
  score: number;
  attentionLabel: string;
}

const CX = 110;
const CY = 118;
const R = 72;
const TRACK_W = 12;
const SEGMENTS = [
  { start: 0, end: 30, color: 'var(--signal-multi)' },
  { start: 30, end: 60, color: 'var(--signal-alert)' },
  { start: 60, end: 85, color: 'var(--signal-caution)' },
  { start: 85, end: 100, color: 'var(--signal-focus)' },
] as const;

const SCORE_LABELS: Record<string, string> = {
  focused: 'FOCUSED',
  distracted: 'DISTRACTED',
  absent: 'NO FACE',
  drowsy: 'DROWSY',
  multi: 'MULTIPLE',
};

function angleDeg(score: number): number {
  return 135 + score * 2.7;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const [x1, y1] = polar(cx, cy, r, startDeg);
  const [x2, y2] = polar(cx, cy, r, endDeg);
  const sweep = endDeg - startDeg;
  const large = sweep > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 0 ${x2} ${y2}`;
}

function ticks(cx: number, cy: number, r: number, every: number) {
  const result: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let s = 0; s <= 100; s += every) {
    const a = angleDeg(s);
    const inner = r + TRACK_W / 2 + 4;
    const outer = r + TRACK_W / 2 + 10;
    const [x1, y1] = polar(cx, cy, inner, a);
    const [x2, y2] = polar(cx, cy, outer, a);
    result.push({ x1, y1, x2, y2, major: s % 10 === 0 });
  }
  return result;
}

export function Gauge({ score, attentionLabel }: GaugeProps) {
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, score));
  const needleAngle = angleDeg(clamped);
  const currentColor = clamped >= 85
    ? 'var(--signal-focus)'
    : clamped >= 60
      ? 'var(--signal-caution)'
      : clamped >= 30
        ? 'var(--signal-alert)'
        : 'var(--signal-multi)';

  const tickLines = ticks(CX, CY, R, 10);

  // Use instant transition when reduced motion
  const needleTransition = reducedMotion ? { duration: 0 } : gaugeSpring;

  return (
    <svg
      viewBox="0 0 220 200"
      className="w-full h-auto"
      role="img"
      aria-label={`Attention gauge at ${Math.round(clamped)} percent, ${attentionLabel}`}
    >
      {/* Background track */}
      <path
        d={describeArc(CX, CY, R, 135, 405)}
        stroke="var(--signal-neutral)"
        strokeWidth={TRACK_W}
        fill="none"
        strokeLinecap="butt"
        opacity={0.2}
      />

      {/* Segment bands */}
      {SEGMENTS.map((seg) => (
        <path
          key={`${seg.start}-${seg.end}`}
          d={describeArc(CX, CY, R, angleDeg(seg.start), angleDeg(seg.end))}
          stroke={seg.color}
          strokeWidth={TRACK_W}
          fill="none"
          strokeLinecap="butt"
          opacity={0.35}
        />
      ))}

      {/* Active track (0 → current score) */}
      {clamped > 0 && (
        <motion.path
          initial={false}
          d={describeArc(CX, CY, R, 135, needleAngle)}
          stroke={currentColor}
          strokeWidth={TRACK_W}
          fill="none"
          strokeLinecap="butt"
          animate={reducedMotion ? undefined : { pathLength: 1 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }}
        />
      )}

      {/* Ticks */}
      {tickLines.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="var(--text-secondary)"
          strokeWidth={t.major ? 2 : 1}
          opacity={0.5}
          strokeLinecap="round"
        />
      ))}

      {/* Needle */}
      <motion.g
        style={{ originX: CX, originY: CY }}
        animate={{ rotate: needleAngle }}
        transition={needleTransition}
      >
        <polygon
          points={`${CX + R + 4},${CY} ${CX - 6},${CY - 4} ${CX - 6},${CY + 4}`}
          fill={currentColor}
          stroke="var(--bg-neutral)"
          strokeWidth={0.5}
        />
        <line
          x1={CX + R + 4}
          y1={CY}
          x2={CX - 18}
          y2={CY}
          stroke={currentColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={6} fill="var(--bg-neutral)" stroke={currentColor} strokeWidth={2.5} />
        <circle cx={CX} cy={CY} r={2.5} fill={currentColor} />
      </motion.g>

      {/* Center readout */}
      <text
        x={CX}
        y={CY - 6}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Anton, sans-serif"
        fontSize="32"
        fill="var(--text-primary)"
        className="tabular-nums"
      >
        {clamped > 0 ? Math.round(clamped) : '—'}
      </text>
      <text
        x={CX}
        y={CY + 16}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Inter, sans-serif"
        fontSize="9"
        fill="var(--text-secondary)"
        letterSpacing="0.12em"
      >
        {SCORE_LABELS[attentionLabel] ?? attentionLabel}
      </text>
    </svg>
  );
}