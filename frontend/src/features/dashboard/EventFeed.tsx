import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { staggerDelay, itemTransition } from '../../motion.config';

interface EventItem {
  timestamp: number;
  type: string;
  message: string;
}

interface EventFeedProps {
  events: EventItem[];
}

const EVENT_COLORS: Record<string, string> = {
  focused: 'var(--jade)',
  distracted: 'var(--ochre)',
  absent: 'var(--clay)',
  drowsy: 'var(--plum)',
  multi: 'var(--clay)',
  tab_switch: 'var(--ochre)',
  window_blur: 'var(--ochre)',
  gaze_away: 'var(--ochre)',
};

const EVENT_DEFAULT = 'var(--ink-faint)';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function EventFeed({ events }: EventFeedProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl p-6"
        style={{ backgroundColor: 'var(--surface-1)' }}>
        <div className="h-8 w-8 rounded-full border-2 border-dashed" style={{ borderColor: 'var(--hairline-strong)' }} />
        <span className="font-sans text-sm italic" style={{ color: 'var(--ink-faint)' }}>
          No events yet
        </span>
        <span className="font-sans text-xs" style={{ color: 'var(--ink-faint)' }}>
          Events appear here during an active session
        </span>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="flex flex-col gap-1 overflow-y-auto max-h-80 pr-1"
      role="log"
      aria-label="Event feed"
      aria-live="polite"
    >
      {events.map((ev, i) => {
        const borderColor = EVENT_COLORS[ev.type] ?? EVENT_DEFAULT;
        return (
          <motion.div
            key={`${ev.timestamp}-${i}`}
            className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-r"
            style={{
              borderLeft: `3px solid ${borderColor}`,
              backgroundColor: 'var(--surface-1)',
            }}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...itemTransition, delay: Math.min(i * staggerDelay, 0.5) }}
          >
            <span className="font-mono text-[11px] tabular-nums shrink-0 w-14" style={{ color: 'var(--ink-faint)' }}>
              {formatTime(ev.timestamp)}
            </span>
            <span className="font-sans text-sm flex-1 truncate" style={{ color: 'var(--ink)' }}>
              {ev.message}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
