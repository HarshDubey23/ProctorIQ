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
  focused: 'border-l-signal-drowsy',
  distracted: 'border-l-signal-alert',
  absent: 'border-l-signal-absent',
  drowsy: 'border-l-signal-drowsy',
  multi: 'border-l-signal-multi',
  tab_switch: 'border-l-signal-caution',
  window_blur: 'border-l-signal-caution',
  gaze_away: 'border-l-signal-alert',
};

const EVENT_DEFAULT = 'border-l-signal-neutral';

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
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-white/[0.02] p-6">
        <div className="h-8 w-8 rounded-full border-2 border-dashed border-white/[0.1]" />
        <span className="font-sans text-[13px] text-text-muted italic">
          No events yet
        </span>
        <span className="font-sans text-[11px] text-text-muted">
          Events will appear here during an active session
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
            className={`flex items-center gap-3 border-l-2 ${borderColor} bg-white/[0.02] pl-3 pr-2 py-1.5 rounded-r`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...itemTransition, delay: Math.min(i * staggerDelay, 0.5) }}
          >
            <span className="font-mono text-[11px] tabular-nums text-text-mono shrink-0 w-14">
              {formatTime(ev.timestamp)}
            </span>
            <span className="font-sans text-[13px] text-text-primary flex-1 truncate">
              {ev.message}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
