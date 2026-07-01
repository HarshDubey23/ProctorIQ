import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Clock } from 'lucide-react';
import { useReport } from './useReport';
import { TimelineScrubber } from './TimelineScrubber';
import { IntegrityHash } from './IntegrityHash';

const VERDICT_COLORS: Record<string, string> = {
  PASS: 'text-signal-drowsy',
  FLAGGED: 'text-signal-alert',
  REVIEW: 'text-signal-caution',
  INCONCLUSIVE: 'text-signal-absent',
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
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-focus border-t-transparent" />
          <span className="font-sans text-[13px] text-text-muted">Loading report...</span>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/[0.1]">
            <Clock size={24} className="text-text-muted" />
          </div>
          <span className="font-display text-lg uppercase tracking-[0.1em] text-text-secondary">
            No Sessions Yet
          </span>
          <span className="max-w-xs font-sans text-[13px] text-text-muted">
            Complete a live session to see your report here.
          </span>
        </div>
      </div>
    );
  }

  const { session, durationSec, eventCounts, hash, serverVerified } = report;
  const verdict = session.verdict ?? 'INCONCLUSIVE';

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4 lg:p-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span
              className={`font-display text-[clamp(2.5rem,8vw,4rem)] leading-none tabular-nums ${
                VERDICT_COLORS[verdict] ?? 'text-text-primary'
              }`}
            >
              {session.finalScore != null ? `${Math.round(session.finalScore)}` : '—'}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-[22px] font-bold uppercase tracking-[0.05em] text-text-primary">
                {verdict}
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                {session.id.slice(0, 12)}...
              </span>
              {!serverVerified && (
                <span className="inline-flex items-center gap-1 rounded-md border border-signal-caution/30 bg-signal-caution/[0.08] px-2 py-0.5 font-sans text-[9px] uppercase tracking-[0.12em] text-signal-caution">
                  Local Draft — Not Server Verified
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-4 font-sans text-[11px] text-text-secondary">
            <span>{session.mode.toUpperCase()}</span>
            <span className="text-text-muted">·</span>
            <span>{formatDate(session.start)}</span>
            <span className="text-text-muted">·</span>
            <span>{formatDuration(durationSec)}</span>
          </div>
        </div>

        <motion.button
          className="flex shrink-0 items-center gap-2 rounded-xl bg-signal-drowsy/[0.12] px-5 py-3 font-sans text-[13px] uppercase tracking-[0.1em] text-signal-drowsy transition-colors hover:bg-signal-drowsy/[0.22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
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
          <div key={type} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="font-mono text-[13px] tabular-nums text-text-primary">{count}</div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted">
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
        <div className="rounded-xl bg-white/[0.03] p-3">
          <span className="font-mono text-[11px] text-text-mono">T+{scrubbedSecond}s</span>
          {session.events
            .filter((e) => Math.floor(e.timestampS) === scrubbedSecond)
            .map((ev, idx) => (
              <div key={idx} className="mt-1 font-sans text-[13px] text-text-primary">
                {ev.eventType}
                {ev.confidence != null ? ` (${(ev.confidence * 100).toFixed(0)}%)` : ''}
              </div>
            ))}
        </div>
      )}

      <IntegrityHash sessionId={session.id} hash={hash} />

      {session.benchmark && (
        <div className="flex gap-4 rounded-xl bg-white/[0.02] p-3">
          <div className="text-center">
            <div className="font-mono text-[13px] tabular-nums text-text-primary">
              {session.benchmark.modelLatencyMs.toFixed(1)}ms
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted">
              Model
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[13px] tabular-nums text-text-primary">
              {session.benchmark.inferenceCount}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted">
              Inferences
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-[13px] tabular-nums text-text-primary">
              {session.benchmark.pcaLatencyMs.toFixed(1)}ms
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted">
              PCA
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
