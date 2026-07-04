import { useMemo } from "react";

interface StampedSealProps {
  confidence: number;
  violation?: boolean;
  size?: number;
  label?: string;
}

export function StampedSeal({ confidence, violation, size = 160, label }: StampedSealProps) {
  const r = size / 2 - 12;
  const cx = size / 2, cy = size / 2;
  const ticks = useMemo(() => Array.from({ length: 48 }, (_, i) => i), []);
  const ringColor = violation ? "#9B2D20" : "#3E8E7E";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
         className={violation ? "seal-flare" : ""} role="img"
         aria-label={label ?? `Confidence ${Math.round(confidence * 100)} percent`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1A1A17" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={r - 10} fill="none" stroke="#1A1A17" strokeWidth={2} />
      {ticks.map((i) => {
        const a = (i / ticks.length) * Math.PI * 2 - Math.PI / 2;
        const active = i / ticks.length <= confidence;
        const len = active ? 8 : 3;
        const x1 = cx + Math.cos(a) * (r - 12);
        const y1 = cy + Math.sin(a) * (r - 12);
        const x2 = cx + Math.cos(a) * (r - 12 - len);
        const y2 = cy + Math.sin(a) * (r - 12 - len);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={active ? ringColor : "#6B6E74"} strokeWidth={2} className="seal-tick" />;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" fontFamily="'Space Mono', monospace"
            fontSize={size * 0.22} fontWeight={700} fill="#1A1A17">
        {Math.round(confidence * 100)}
      </text>
      <text x={cx} y={cy + size * 0.14} textAnchor="middle" fontFamily="'Saira Condensed', sans-serif"
            fontSize={size * 0.07} letterSpacing={2} fill="#6B6E74">
        {(label ?? "CONFIDENCE").toUpperCase()}
      </text>
    </svg>
  );
}
