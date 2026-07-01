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
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: 'var(--surface-0)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: 'var(--jade)', borderTopColor: 'transparent' }} />
          <span className="font-sans text-sm" style={{ color: 'var(--ink-faint)' }}>Loading trends...</span>
        </div>
      </div>
    );
  }

  if (!trendData || trendData.sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6" style={{ backgroundColor: 'var(--surface-0)' }}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed" style={{ borderColor: 'var(--hairline-strong)' }}>
            <BarChart3 size={24} style={{ color: 'var(--ink-faint)' }} />
          </div>
          <span className="font-display text-lg uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
            No Trends Yet
          </span>
          <span className="max-w-xs font-sans text-sm" style={{ color: 'var(--ink-faint)' }}>
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
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4 lg:p-6" style={{ backgroundColor: 'var(--surface-0)' }}>
      <div className="flex items-center gap-4">
        <span className="font-display text-[clamp(1.5rem,4vw,2.5rem)] leading-none tabular-nums" style={{ color: 'var(--ink)' }}>
          {medianScore}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-sans text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--ink-muted)' }}>
            Your baseline
          </span>
          <span className="flex items-center gap-1.5 font-sans text-sm">
            <span style={{ color: 'var(--ink-muted)' }}>Today vs baseline:</span>
            {delta !== 0 && (
              <span className="flex items-center gap-1" style={{ color: delta > 0 ? 'var(--jade)' : 'var(--clay)' }}>
                {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {delta > 0 ? '+' : ''}{delta.toFixed(0)}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--surface-1)' }}>
          <div className="font-mono text-[clamp(1.2rem,3vw,1.8rem)] tabular-nums" style={{ color: 'var(--jade)' }}>
            {pctFocused}%
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] mt-1" style={{ color: 'var(--ink-faint)' }}>
            Avg Focused
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--surface-1)' }}>
          <div className="font-mono text-[clamp(1.2rem,3vw,1.8rem)] tabular-nums" style={{ color: 'var(--ochre)' }}>
            {distractedRate.toFixed(1)}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] mt-1" style={{ color: 'var(--ink-faint)' }}>
            Distractions/min
          </div>
        </div>
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--surface-1)' }}>
          <div className="font-mono text-[clamp(1.2rem,3vw,1.8rem)] tabular-nums" style={{ color: 'var(--jade)' }}>
            {sessions.length}
          </div>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] mt-1" style={{ color: 'var(--ink-faint)' }}>
            Total Sessions
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <TrendSparkline data={scores} color="var(--jade)" label="Score" />
        <TrendSparkline data={focusPcts} color="var(--jade)" label="% Focused" />
        <TrendSparkline data={distractedCounts} color="var(--ochre)" label="Distractions" />
      </div>

      {benchmarks.length > 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--surface-1)' }}>
          <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--ink-muted)' }}>
            Benchmark History
          </h3>
          <div className="flex gap-4">
            {benchmarks.slice(-5).map((b, i) => (
              <div key={i} className="text-center">
                <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink)' }}>
                  {b.modelLatencyMs.toFixed(1)}ms
                </div>
                <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-faint)' }}>
                  Run {i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] mb-3" style={{ color: 'var(--ink-muted)' }}>
          Session History
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] pb-2 pr-4" style={{ color: 'var(--ink-faint)' }}>Date</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] pb-2 pr-4" style={{ color: 'var(--ink-faint)' }}>Score</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] pb-2 pr-4" style={{ color: 'var(--ink-faint)' }}>Focused</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] pb-2 pr-4" style={{ color: 'var(--ink-faint)' }}>Verdict</th>
                <th className="font-sans text-[10px] uppercase tracking-[0.1em] pb-2" style={{ color: 'var(--ink-faint)' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 10).map((s, i) => (
                <motion.tr
                  key={s.id}
                  style={{ borderBottom: '1px solid var(--hairline)' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(i * staggerDelay, 0.5) }}
                >
                  <td className="font-mono text-[11px] tabular-nums py-2 pr-4" style={{ color: 'var(--ink-faint)' }}>{formatDate(s.start)}</td>
                  <td className="font-mono text-[11px] tabular-nums py-2 pr-4" style={{ color: 'var(--ink)' }}>{formatScore(s.finalScore)}</td>
                  <td className="font-mono text-[11px] tabular-nums py-2 pr-4" style={{ color: 'var(--ink)' }}>
                    {s.events.length > 0
                      ? `${Math.round((s.events.filter((e) => e.eventType !== 'absent').length / s.events.length) * 100)}%`
                      : '—'}
                  </td>
                  <td className="font-sans text-[11px] py-2 pr-4">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.06em]"
                      style={{
                        backgroundColor: s.verdict === 'PASS' ? 'rgba(14,107,92,0.15)' :
                          s.verdict === 'FLAGGED' ? 'rgba(166,61,47,0.15)' :
                          s.verdict === 'REVIEW' ? 'rgba(185,118,58,0.15)' :
                          'rgba(107,81,120,0.15)',
                        color: s.verdict === 'PASS' ? 'var(--jade)' :
                          s.verdict === 'FLAGGED' ? 'var(--clay)' :
                          s.verdict === 'REVIEW' ? 'var(--ochre)' :
                          'var(--plum)',
                      }}>
                      {s.verdict ?? '—'}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] tabular-nums py-2" style={{ color: 'var(--ink-faint)' }}>
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
