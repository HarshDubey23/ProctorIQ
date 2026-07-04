import { useState, useRef, useCallback } from 'react';

interface TimelineEvent {
  eventType: string;
  timestampS: number;
}

interface TimelineScrubberProps {
  durationSec: number;
  events: TimelineEvent[];
  onScrub?: (second: number) => void;
}

const WIDTH = 1200;
const HEIGHT = 48;
const SPROCKET_R = 3;
const SPROCKET_GAP = 8;

const EVENT_COLORS: Record<string, string> = {
  focused: '#3E8E7E',
  distracted: '#B57A1E',
  absent: '#9B2D20',
  drowsy: '#A8556E',
  multi: '#9B2D20',
  tab_switch: '#C08A2E',
  window_blur: '#C08A2E',
  gaze_away: '#3E8E7E',
};

function eventColor(eventType: string): string {
  return EVENT_COLORS[eventType] ?? '#6B6E74';
}

export function TimelineScrubber({ durationSec, events, onScrub }: TimelineScrubberProps) {
  const [hoveredSecond, setHoveredSecond] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clampedDuration = Math.min(durationSec, 600);
  const rectW = Math.max(2, WIDTH / clampedDuration);

  const secondToAttention = useCallback(
    (second: number): string => {
      const ev = events.find((e) => Math.floor(e.timestampS) === second);
      return ev?.eventType ?? 'focused';
    },
    [events],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      const second = Math.floor(ratio * clampedDuration);
      setHoveredSecond(Math.max(0, Math.min(clampedDuration - 1, second)));
    },
    [clampedDuration],
  );

  const handleClick = useCallback(() => {
    if (hoveredSecond !== null && onScrub) {
      onScrub(hoveredSecond);
    }
  }, [hoveredSecond, onScrub]);

  const hoveredEvent = hoveredSecond !== null
    ? events.find((e) => Math.floor(e.timestampS) === hoveredSecond)
    : null;

  return (
    <div
      className="relative select-none"
      role="slider"
      aria-label="Session timeline"
      aria-valuemin={0}
      aria-valuemax={clampedDuration - 1}
      aria-valuenow={hoveredSecond ?? 0}
    >
      <svg
        ref={svgRef}
        width={WIDTH}
        height={HEIGHT + SPROCKET_R * 2 + 4}
        className="cursor-pointer overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSecond(null)}
        onClick={handleClick}
      >
        {/* Sprocket holes — top edge */}
        {Array.from({ length: Math.floor(WIDTH / SPROCKET_GAP) }, (_, i) => (
          <rect
            key={`top-${i}`}
            x={i * SPROCKET_GAP}
            y={1}
            width={SPROCKET_R}
            height={SPROCKET_R}
            rx={1}
            fill="var(--hairline-strong)"
          />
        ))}
        {/* Sprocket holes — bottom edge */}
        {Array.from({ length: Math.floor(WIDTH / SPROCKET_GAP) }, (_, i) => (
          <rect
            key={`bot-${i}`}
            x={i * SPROCKET_GAP}
            y={HEIGHT + 2}
            width={SPROCKET_R}
            height={SPROCKET_R}
            rx={1}
            fill="var(--hairline-strong)"
          />
        ))}
        {/* Filmstrip segments */}
        {Array.from({ length: clampedDuration }, (_, i) => {
          const attention = secondToAttention(i);
          const fill = eventColor(attention);
          const x = i * rectW;
          const isHovered = hoveredSecond === i;
          return (
            <rect
              key={i}
              x={x}
              y={SPROCKET_R + 2}
              width={Math.max(1, rectW - 0.5)}
              height={HEIGHT - SPROCKET_R * 2 - 4}
              fill={fill}
              opacity={isHovered ? 0.9 : 0.4}
              rx={0.5}
            />
          );
        })}
      </svg>

      {hoveredSecond !== null && (
        <div
          className="pointer-events-none absolute -top-9 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 shadow-lg"
          style={{
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--hairline-strong)',
            color: 'var(--ink)',
            fontFamily: "'Space Mono', ui-monospace, monospace",
            fontSize: '11px',
          }}
          aria-live="polite"
        >
          T+{hoveredSecond}s
          {hoveredEvent ? ` · ${hoveredEvent.eventType}` : ''}
        </div>
      )}
    </div>
  );
}
