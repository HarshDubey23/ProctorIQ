import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Square } from 'lucide-react';
import { Gauge } from '../../components/ui/Gauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { ConfidenceBar } from '../../components/ui/ConfidenceBar';
import { useWebcam } from '../selftest/useWebcam';
import { useDetection, computeAttentionScore } from '../selftest/useDetection';
import { useSession } from './useSession';
import { ScoreReadout } from './ScoreReadout';
import { MetricCounter } from './MetricCounter';
import { BlinkIndicator } from './BlinkIndicator';
import { EventFeed } from './EventFeed';
import { AttentionChart } from './AttentionChart';

type LiveEventItem = {
  timestamp: number;
  type: string;
  message: string;
};

export function SessionPanel() {
  const { videoRef, isDemo } = useWebcam();
  const { result: detectionResult, status } = useDetection(videoRef, { isDemo });
  const [events, setEvents] = useState<LiveEventItem[]>([]);
  const prevAttentionRef = useRef<string>('');

  const getResult = useCallback(() => detectionResult, [detectionResult]);
  const roomId = typeof window !== 'undefined' ? sessionStorage.getItem('cohort-room-id') || undefined : undefined;
  const session = useSession(getResult, roomId);

  useEffect(() => {
    const current = detectionResult?.attention;
    if (!current || current === prevAttentionRef.current) return;
    prevAttentionRef.current = current;

    const messages: Record<string, string> = {
      focused: 'Face detected — attention focused',
      distracted: 'Gaze away — distraction flagged',
      absent: 'No face in frame',
      drowsy: 'Eyes closed — drowsiness detected',
      multi: 'Multiple faces detected',
    };

    setEvents((prev) => [
      ...prev,
      {
        timestamp: Date.now(),
        type: current,
        message: messages[current] ?? `State: ${current}`,
      },
    ]);
  }, [detectionResult?.attention]);

  const handleStart = useCallback(() => {
    setEvents([]);
    session.start();
  }, [session]);

  const handleStop = useCallback(() => {
    session.stop();
  }, [session]);

  const attention = detectionResult?.attention ?? 'focused';
  const score = detectionResult ? computeAttentionScore(detectionResult) : 0;
  const sourceLabel = detectionResult?.source === 'ml' ? 'ML' : 'Rule-based';
  const confidence = detectionResult?.confidence ?? 0;
  const timerSeconds = session.metrics.duration;
  const timerMins = Math.floor(timerSeconds / 60);
  const timerSecs = timerSeconds % 60;

  return (
    <div className="flex h-full w-full flex-col p-4 lg:p-6 overflow-y-auto gap-4">
      <video ref={videoRef} autoPlay playsInline muted className="sr-only" aria-hidden="true" />

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <div className="flex flex-col gap-4 lg:w-[40%]">
          <div className="flex items-center gap-4">
            <div className="w-48 shrink-0">
              <Gauge score={score} attentionLabel={attention} />
            </div>
            <div className="flex flex-col gap-2">
              <ScoreReadout score={score} />
              <StatusPill state={attention as StatusState} />
              <ConfidenceBar value={confidence} />
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10px] tabular-nums text-text-mono text-center">
                {sourceLabel}
              </span>
              <div className="font-mono text-[22px] tabular-nums text-text-mono text-center">
                {String(timerMins).padStart(2, '0')}:{String(timerSecs).padStart(2, '0')}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:w-[25%]">
          <div className="flex flex-col gap-2">
            <MetricCounter
              value={session.metrics.avgScore}
              label="Avg Score"
              suffix="%"
              color={
                session.metrics.avgScore >= 80
                  ? 'text-signal-drowsy'
                  : session.metrics.avgScore >= 50
                    ? 'text-signal-caution'
                    : 'text-signal-multi'
              }
            />
            <MetricCounter
              value={session.metrics.duration}
              label="Duration"
              suffix="s"
            />
            <MetricCounter
              value={session.metrics.blinkRate}
              label="Blink Rate"
              suffix="/m"
            />
            <MetricCounter
              value={session.metrics.events}
              label="Events"
            />
          </div>
          <BlinkIndicator
            earLeft={detectionResult?.ear.left ?? 0}
            earRight={detectionResult?.ear.right ?? 0}
          />
        </div>

        <div className="flex flex-col gap-3 lg:w-[35%] min-h-0">
          <div className="flex-1">
            <AttentionChart data={session.history} />
          </div>
          <div className="flex-1 min-h-32">
            <h3 className="font-sans text-[11px] uppercase tracking-[0.12em] text-text-secondary mb-2">
              Event Feed
            </h3>
            <EventFeed events={events} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
        <motion.button
          className={`flex items-center gap-2 rounded-xl px-5 py-3 font-sans text-[13px] uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus] ${
            session.state === 'running'
              ? 'bg-signal-multi/[0.15] text-signal-multi hover:bg-signal-multi/[0.25]'
              : 'bg-signal-drowsy/[0.12] text-signal-drowsy hover:bg-signal-drowsy/[0.22]'
          }`}
          whileTap={{ scale: 0.96 }}
          onClick={session.state === 'running' ? handleStop : handleStart}
          aria-label={session.state === 'running' ? 'Stop session' : 'Start session'}
        >
          {session.state === 'running' ? <Square size={16} /> : <Play size={16} />}
          {session.state === 'running' ? 'Stop' : 'Start'}
        </motion.button>

        <div className="flex items-center gap-4 text-[10px] text-text-muted font-sans">
          <span>
            Face count: {detectionResult?.faceCount ?? 0}
            {isDemo ? ' · Demo mode' : ''}
            {status === 'loading' ? ' · Loading models…' : ''}
          </span>
          {session.state === 'running' && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-signal-drowsy animate-pulse" />
              Recording
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
