import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { useTrends } from './useTrends';
import { TrendSparkline } from './TrendSparkline';
import { staggerDelay } from '../../motion.config';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

function formatScore(score: number | null): string {
  return score != null && score > 0 ? `${Math.round(score)}` : '—';
}

export function TrendsPanel() {
  const { trendData, loading } = useTrends();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-focus border-t-transparent" />
          <span className="font-sans text-[13px] text-text-muted">Loading trends...</span>
        </div>
      </div>
    );
  }

  if (!trendData || trendData.sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/[0.1]">
            <BarChart3 size={24} className="text-text-muted" />
          </div>
          <span className="font-display text-lg uppercase tracking-[0.1em] text-text-secondary">
            No Trends Yet
          </span>
          <span className="max-w-xs font-sans text-[13px] text-text-muted">
            Complete your first session to see trends here.
          </span>
        </div>
      </div>
    );
  }

  const { sessions, benchmarks, medianScore, pctFocused, distractedRate } = trendData;
  const lastSession = sessions[0];
  const lastScore = lastSession.finalScore ?? 0;
  const delta = lastScore - medianScore;
  const scores = sessions.map((s) => s.finalScore ?? 0).filter((s) => s > 0).reverse();
  const focusPcts = sessions.map((s) => {
    if (s.events.length === 0) return 100;
    const focused = s.events.filter((e) => e.eventType === 'focused' || e.eventType === 'unknown').length;
    return Math.round((focused / s.events.length) * 100);
  }).reverse();
  const distractedCounts = sessions.map((s) =>
    s.events.filter((e) => ['distracted', 'gaze_away', 'tab_switch'].includes(e.eventType)).length
  ).reverse();

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4 lg:p-6">
      <div className="flex items-center gap-4">
        <span className="font-display text-[clamp(1.5rem,4vw,2.5rem)] leading-none tabular-nums text-text-primary">
          {medianScore}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary">
            Your baseline
          </span>
          <span className="flex items-center gap-1.5 font-sans text-[13px]">
            <span className="text-text-secondary">Today vs baseline:</span>
            {delta !== 0 && (
              <span className={`flex items-center gap-1 ${delta > 0 ? 'text-signal-drowsy' : 'text-signal-alert'}`}>
                {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {delta > 0 ? '+' : ''}{delta.toFixed(0)}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-white/[0.03] p-4">
          <div className="font-mono text-[clamp(1.2rem,3vw,1.8rem)] tabular-nums text-signal-focus">
            {pctFocused}%
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted mt-1">
            Avg Focused
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-4">
          <div className="font-mono text-[clamp(1.2rem,3vw,1.8rem)] tabular-nums text-signal-caution">
            {distractedRate.toFixed(1)}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted mt-1">
            Distractions/min
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] p-4">
          <div className="font-mono text-[clamp(1.2rem,3vw,1.8rem)] tabular-nums text-signal-drowsy">
            {sessions.length}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted mt-1">
            Total Sessions
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <TrendSparkline data={scores} color="var(--signal-focus)" label="Score" />
        <TrendSparkline data={focusPcts} color="var(--signal-drowsy)" label="% Focused" />
        <TrendSparkline data={distractedCounts} color="var(--signal-alert)" label="Distractions" />
      </div>

      {benchmarks.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] p-4">
          <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-3">
            Benchmark History
          </h3>
          <div className="flex gap-4">
            {benchmarks.slice(-5).map((b, i) => (
              <div key={i} className="text-center">
                <div className="font-mono text-[13px] tabular-nums text-text-mono">
                  {b.modelLatencyMs.toFixed(1)}ms
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted">
                  Run {i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-3">
          Session History
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Date</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Score</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Focused</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2 pr-4">Verdict</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted pb-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map((s, i) => (
                <motion.tr
                  key={s.id}
                  className="border-b border-white/[0.02]"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(i * staggerDelay, 0.5) }}
                >
                  <td className="font-mono text-[11px] tabular-nums text-text-mono py-2 pr-4">{formatDate(s.start)}</td>
                  <td className="font-mono text-[11px] tabular-nums text-text-primary py-2 pr-4">{formatScore(s.finalScore)}</td>
                  <td className="font-mono text-[11px] tabular-nums text-text-primary py-2 pr-4">
                    {s.events.length > 0
                      ? `${Math.round((s.events.filter((e) => e.eventType !== 'absent').length / s.events.length) * 100)}%`
                      : '—'}
                  </td>
                  <td className="font-sans text-[11px] py-2 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] ${
                      s.verdict === 'PASS' ? 'bg-signal-drowsy/[0.15] text-signal-drowsy' :
                      s.verdict === 'FLAGGED' ? 'bg-signal-alert/[0.15] text-signal-alert' :
                      s.verdict === 'REVIEW' ? 'bg-signal-caution/[0.15] text-signal-caution' :
                      'bg-signal-absent/[0.15] text-signal-absent'
                    }`}>
                      {s.verdict ?? '—'}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] tabular-nums text-text-mono py-2">
                    {s.end ? formatDuration(Math.floor((s.end - s.start) / 1000)) : '—'}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
