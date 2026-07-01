import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Clock } from 'lucide-react';
import { useReport } from './useReport';
import { TimelineScrubber } from './TimelineScrubber';
import { IntegrityHash } from './IntegrityHash';
import { ApertureGauge } from '../../components/ui/ApertureGauge';

const VERDICT_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  PASS: { label: 'PASS', color: 'var(--jade)', bg: 'rgba(14,107,92,0.12)' },
  FLAGGED: { label: 'FLAGGED', color: 'var(--clay)', bg: 'rgba(166,61,47,0.12)' },
  REVIEW: { label: 'REVIEW', color: 'var(--ochre)', bg: 'rgba(185,118,58,0.12)' },
  INCONCLUSIVE: { label: 'INCONCLUSIVE', color: 'var(--plum)', bg: 'rgba(107,81,120,0.12)' },
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function ReportPanel() {
  const { report, loading, downloadPDF } = useReport();
  const [scrubbedSecond, setScrubbedSecond] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--surface-0)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: 'var(--jade)', borderTopColor: 'transparent' }} />
          <span className="font-sans text-sm" style={{ color: 'var(--ink-faint)' }}>Loading report...</span>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center p-6" style={{ backgroundColor: 'var(--surface-0)' }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed" style={{ borderColor: 'var(--hairline-strong)' }}>
            <Clock size={24} style={{ color: 'var(--ink-faint)' }} />
          </div>
          <span className="font-display text-lg uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
            No Sessions Yet
          </span>
          <span className="max-w-xs font-sans text-sm" style={{ color: 'var(--ink-faint)' }}>
            Complete a live session to see your report here.
          </span>
        </div>
      </div>
    );
  }

  const { session, durationSec, eventCounts, hash, serverVerified } = report;
  const verdict = session.verdict ?? 'INCONCLUSIVE';
  const vs = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.INCONCLUSIVE;
  const scoreValue = session.finalScore != null ? Math.round(session.finalScore) : 0;
  const openness = Math.max(0.05, scoreValue / 100);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: 'var(--surface-0)' }}>
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <ApertureGauge openness={openness} score={scoreValue} size={100} showScore />
            <div className="flex flex-col gap-0.5">
              <span
                className="font-display text-[clamp(1.5rem,5vw,2.5rem)] uppercase tracking-[0.05em] inline-flex items-center gap-2 rounded-full px-4 py-1"
                style={{
                  color: vs.color,
                  backgroundColor: vs.bg,
                }}
              >
                {vs.label}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                {session.id.slice(0, 12)}...
              </span>
            </div>
          </div>
          <div className="flex gap-4 font-sans text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <span>{session.mode.toUpperCase()}</span>
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span>{formatDate(session.start)}</span>
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span>{formatDuration(durationSec)}</span>
          </div>
        </div>

        <motion.button
          className="flex shrink-0 items-center gap-2 rounded-xl px-5 py-3 font-sans text-sm uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(46,76,140,0.1)',
            color: 'var(--cobalt)',
          }}
          whileTap={{ scale: 0.96 }}
          onClick={downloadPDF}
          aria-label="Download PDF report"
        >
          <Download size={16} />
          PDF
        </motion.button>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(eventCounts).map(([type, count]) => (
          <div key={type} className="rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--surface-1)' }}>
            <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink)' }}>{count}</div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
              {type}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <TimelineScrubber
          durationSec={durationSec}
          events={session.events.map((e) => ({
            eventType: e.eventType,
            timestampS: e.timestampS,
          }))}
          onScrub={setScrubbedSecond}
        />
      </div>

      {scrubbedSecond !== null && (
        <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-1)' }}>
          <span className="font-mono text-[11px]" style={{ color: 'var(--ink-faint)' }}>T+{scrubbedSecond}s</span>
          {session.events
            .filter((e) => Math.floor(e.timestampS) === scrubbedSecond)
            .map((ev, idx) => (
              <div key={idx} className="mt-1 font-sans text-sm" style={{ color: 'var(--ink)' }}>
                {ev.eventType}
                {ev.confidence != null ? ` (${(ev.confidence * 100).toFixed(0)}%)` : ''}
              </div>
            ))}
        </div>
      )}

      <IntegrityHash sessionId={session.id} hash={hash} serverVerified={serverVerified} />

      {session.benchmark && (
        <div className="flex gap-4 rounded-xl p-3" style={{ backgroundColor: 'var(--surface-1)' }}>
          <div className="text-center">
            <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
              {session.benchmark.modelLatencyMs.toFixed(1)}ms
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
              Model
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
              {session.benchmark.inferenceCount}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
              Inferences
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
              {session.benchmark.pcaLatencyMs.toFixed(1)}ms
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
              PCA
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
