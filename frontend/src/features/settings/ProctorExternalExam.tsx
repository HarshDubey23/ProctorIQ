import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Gauge } from '../../components/ui/Gauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { useWebcam } from '../selftest/useWebcam';
import { useDetection, computeAttentionScore } from '../selftest/useDetection';
import { useSession } from '../dashboard/useSession';

interface ProctorExternalExamProps {
  url: string;
  onBack: () => void;
}

export function ProctorExternalExam({ url, onBack }: ProctorExternalExamProps) {
  const { videoRef, isDemo } = useWebcam();
  const { result } = useDetection(videoRef, { isDemo });
  const getResult = useCallback(() => result, [result]);
  const session = useSession(getResult);
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(() => {
    setStarted(true);
    session.start();
  }, [session]);

  const handleStop = useCallback(() => {
    session.stop();
  }, [session]);

  const score = result ? computeAttentionScore(result) : 0;
  const attention = (result?.attention ?? 'focused') as StatusState;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-sans text-[12px] text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div className="flex items-center gap-3">
          <ExternalLink size={12} className="text-text-muted" />
          <span className="font-mono text-[11px] text-text-muted truncate max-w-[300px]">{url}</span>
        </div>
        <motion.button
          onClick={started ? handleStop : handleStart}
          className={`rounded-lg px-4 py-1.5 font-sans text-[11px] uppercase tracking-[0.1em] transition-colors ${
            started
              ? 'bg-signal-multi/[0.15] text-signal-multi hover:bg-signal-multi/[0.25]'
              : 'bg-signal-drowsy/[0.12] text-signal-drowsy hover:bg-signal-drowsy/[0.22]'
          }`}
          whileTap={{ scale: 0.96 }}
        >
          {started ? 'Stop' : 'Start Proctoring'}
        </motion.button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1">
          <iframe
            src={url}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin"
            title="External exam"
          />
        </div>

        <div className="w-72 border-l border-white/[0.06] flex flex-col gap-4 p-4 overflow-y-auto">
          <div className="w-full">
            <Gauge score={score} attentionLabel={attention} />
          </div>
          <StatusPill state={attention} />
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Score
            </span>
            <span className="font-display text-[28px] leading-none tabular-nums text-text-primary">
              {score}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Duration
            </span>
            <span className="font-mono text-[13px] tabular-nums text-text-mono">
              {String(Math.floor(session.metrics.duration / 60)).padStart(2, '0')}:
              {String(session.metrics.duration % 60).padStart(2, '0')}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-text-muted">
              Events
            </span>
            <span className="font-mono text-[13px] tabular-nums text-text-primary">
              {session.metrics.events}
            </span>
          </div>
          <p className="font-sans text-[10px] text-text-muted italic mt-auto">
            Exam score is not captured by ProctorIQ.
            <br />
            See exam platform for your score.
          </p>
        </div>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="sr-only" aria-hidden="true" />
    </div>
  );
}
