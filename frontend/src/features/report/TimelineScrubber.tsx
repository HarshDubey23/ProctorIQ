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

const EVENT_COLORS: Record<string, string> = {
  focused: '#34D399',
  distracted: '#FB923C',
  absent: '#A78BFA',
  drowsy: '#34D399',
  multi: '#F472B6',
  tab_switch: '#FCD34D',
  window_blur: '#FCD34D',
  gaze_away: '#FB923C',
};

function eventColor(eventType: string): string {
  return EVENT_COLORS[eventType] ?? '#64748B';
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
        height={HEIGHT}
        className="cursor-pointer overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSecond(null)}
        onClick={handleClick}
      >
        {Array.from({ length: clampedDuration }, (_, i) => {
          const attention = secondToAttention(i);
          const fill = eventColor(attention);
          const x = i * rectW;
          const isHovered = hoveredSecond === i;
          return (
            <rect
              key={i}
              x={x}
              y={0}
              width={Math.max(1, rectW - 0.5)}
              height={HEIGHT}
              fill={fill}
              opacity={isHovered ? 0.9 : 0.4}
              rx={1}
            />
          );
        })}
      </svg>

      {hoveredSecond !== null && (
        <div
          className="pointer-events-none absolute -top-9 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-panel-neutral px-2 py-1 font-mono text-[11px] text-text-primary shadow-lg"
          aria-live="polite"
        >
          T+{hoveredSecond}s
          {hoveredEvent ? ` · ${hoveredEvent.eventType}` : ''}
        </div>
      )}
    </div>
  );
}
