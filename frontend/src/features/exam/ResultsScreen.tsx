import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QUESTIONS } from './questions';
import type { ExamAnswer, ProctorEvent } from './types';
import {
  computeIntegrityScore,
  computeProctorIQ,
  computeVerdict,
} from './types';
import { Check, X, Download, RotateCcw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { ApertureGauge } from '../../components/ui/ApertureGauge';

interface ResultsScreenProps {
  answers: ExamAnswer[];
  events: ProctorEvent[];
  submittedAt: number;
  reportHash: string;
  hashLoading: boolean;
  serverVerified: boolean;
  onDownloadReport: () => void;
  onRetake: () => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

const VERDICT_STYLES: Record<string, { label: string; color: string; bgColor: string }> = {
  pass: { label: 'PASS', color: 'var(--jade)', bgColor: 'rgba(14,107,92,0.12)' },
  investigate: { label: 'REVIEW', color: 'var(--ochre)', bgColor: 'rgba(185,118,58,0.12)' },
  fail: { label: 'FLAGGED', color: 'var(--clay)', bgColor: 'rgba(166,61,47,0.12)' },
};

function topicLabel(answers: ExamAnswer[]): { topic: string; correct: number; total: number }[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    const q = QUESTIONS.find((qq) => qq.id === a.questionId);
    if (!q) continue;
    const entry = map.get(q.topic) ?? { correct: 0, total: 0 };
    entry.total++;
    if (a.selectedIndex === q.correctIndex) entry.correct++;
    map.set(q.topic, entry);
  }
  return Array.from(map.entries()).map(([topic, v]) => ({ topic, ...v }));
}

export function ResultsScreen({
  answers,
  events,
  submittedAt: _submittedAt,
  reportHash,
  hashLoading,
  serverVerified,
  onDownloadReport,
  onRetake,
}: ResultsScreenProps) {
  const [showVerdict, setShowVerdict] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const correctCount = answers.filter((a) => {
    const q = QUESTIONS.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex === q.correctIndex;
  }).length;

  const totalQuestions = QUESTIONS.length;
  const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const proctorIQ = computeProctorIQ(correctCount, totalQuestions, events);
  const verdict = computeVerdict(proctorIQ);
  const integrityScoreValue = computeIntegrityScore(events);
  const examScorePct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const topics = useMemo(() => topicLabel(answers), [answers]);
  const openness = Math.max(0.05, proctorIQ / 100);
  const verdictStyle = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.pass;

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  useEffect(() => {
    const t1 = setTimeout(() => setShowVerdict(true), 600);
    const t2 = setTimeout(() => setShowContent(true), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const progressColor = pct >= 80 ? 'var(--jade)' : pct >= 50 ? 'var(--ochre)' : 'var(--clay)';

  return (
    <div className="flex h-full w-full gap-0 lg:gap-6 overflow-y-auto" style={{ backgroundColor: 'var(--surface-0)' }}>
      <motion.div
        className="flex w-full flex-col gap-6 lg:w-[60%] p-6"
        initial={{ opacity: 0, x: -24 }}
        animate={showContent ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="flex flex-col items-center gap-6 pt-4">
          <div className="relative flex flex-col items-center">
            <ApertureGauge openness={openness} score={proctorIQ} size={200} showScore />
            <AnimatePresence>
              {showVerdict && (
                <motion.div
                  className="mt-4 flex flex-col items-center gap-1"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: 'easeOut', type: 'spring', stiffness: 100, damping: 15 }}
                >
                  <span
                    className="font-display text-[clamp(1.5rem,5vw,2.5rem)] uppercase tracking-[0.08em] px-6 py-2 rounded-full"
                    style={{
                      color: verdictStyle.color,
                      backgroundColor: verdictStyle.bgColor,
                    }}
                  >
                    {verdictStyle.label}
                  </span>
                  <span className="font-sans text-xs" style={{ color: 'var(--ink-muted)' }}>
                    ProctorIQ Score (exam + integrity)
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div>
          <h3 className="font-sans text-sm uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--ink-muted)' }}>
            Question Breakdown
          </h3>
          <div className="flex flex-col gap-1.5">
            {QUESTIONS.map((q) => {
              const a = answers.find((aa) => aa.questionId === q.id);
              const isCorrect = a?.selectedIndex === q.correctIndex;
              const isUnanswered = a?.selectedIndex === null;
              return (
                <div
                  key={q.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                  style={{ backgroundColor: 'var(--surface-1)' }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] tabular-nums"
                    style={{
                      backgroundColor: isCorrect ? 'rgba(14,107,92,0.2)' : isUnanswered ? 'var(--hairline)' : 'rgba(166,61,47,0.2)',
                      color: isCorrect ? 'var(--jade)' : isUnanswered ? 'var(--ink-faint)' : 'var(--clay)',
                    }}
                  >
                    {isCorrect ? <Check size={12} /> : isUnanswered ? '--' : <X size={12} />}
                  </span>
                  <span className="flex-1 truncate font-sans text-sm" style={{ color: 'var(--ink)' }}>
                    {q.question}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums shrink-0" style={{ color: 'var(--ink-faint)' }}>
                    {OPTION_LABELS[q.correctIndex]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="font-sans text-sm uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--ink-muted)' }}>
            Topic Performance
          </h3>
          <div className="flex flex-col gap-2">
            {topics.map((t) => {
              const tpct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              return (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="w-20 font-sans text-sm uppercase" style={{ color: 'var(--ink)' }}>
                    {t.topic}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--hairline)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: progressColor }}
                      initial={{ width: 0 }}
                      animate={{ width: `${tpct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="font-mono text-sm tabular-nums w-8 text-right" style={{ color: 'var(--ink-muted)' }}>
                    {tpct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      <motion.div
        className="flex w-full flex-col gap-5 lg:w-[40%] p-6"
        style={{ borderTop: 'none', borderLeft: '1px solid var(--hairline)' }}
        initial={{ opacity: 0, x: 24 }}
        animate={showContent ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
      >
        <div className="flex justify-around rounded-xl p-3" style={{ backgroundColor: 'var(--surface-1)' }}>
          <div className="text-center">
            <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
              {integrityScoreValue}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Integrity
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
              {events.length}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Events
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
              {examScorePct}%
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Exam
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-sans text-sm uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--ink-muted)' }}>
            Event Summary
          </h3>
          <div className="flex flex-col gap-1">
            {Object.entries(eventCounts).map(([type, count]) => (
              <div key={type} className="flex justify-between rounded px-3 py-1.5" style={{ backgroundColor: 'var(--surface-1)' }}>
                <span className="font-sans text-sm capitalize" style={{ color: 'var(--ink)' }}>
                  {type.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                  {count}
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <span className="font-sans text-sm italic" style={{ color: 'var(--ink-faint)' }}>
                No proctor events recorded
              </span>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-sans text-sm uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--ink-muted)' }}>
            Timeline
          </h3>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {events.length === 0 ? (
              <span className="font-sans text-sm italic" style={{ color: 'var(--ink-faint)' }}>
                No events
              </span>
            ) : (
              events.map((e, i) => (
                <div key={`ev-${i}`} className="flex items-center gap-2 rounded px-3 py-1" style={{ backgroundColor: 'var(--surface-1)' }}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--ochre)' }} />
                  <span className="flex-1 font-sans text-sm capitalize" style={{ color: 'var(--ink)' }}>
                    {e.type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl px-3 py-2" style={{ backgroundColor: 'var(--surface-1)' }}>
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: 'var(--ink-faint)' }}>
            Report Hash (SHA-256)
          </div>
          {hashLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: 'var(--cobalt)', borderTopColor: 'transparent' }} />
              <span className="font-sans text-[12px] italic" style={{ color: 'var(--ink-muted)' }}>
                Verifying...
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 mb-1">
                {serverVerified ? (
                  <span className="flex items-center gap-1 font-sans text-[10px]" style={{ color: 'var(--gold)' }}>
                    <ShieldCheck size={12} />
                    Server-Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-sans text-[10px]" style={{ color: 'var(--ochre)' }}>
                    <ShieldAlert size={12} />
                    Local Draft — Not Server Verified
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] break-all tabular-nums" style={{ color: 'var(--cobalt)' }}>
                {reportHash || 'computing...'}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-auto">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-sans text-sm uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: 'rgba(46,76,140,0.12)',
              color: 'var(--cobalt)',
            }}
            onClick={onDownloadReport}
            aria-label="Download report"
          >
            <Download size={16} />
            Download
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-sans text-sm uppercase tracking-[0.1em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: 'var(--surface-1)',
              color: 'var(--ink)',
            }}
            onClick={onRetake}
            aria-label="Take another exam"
          >
            <RotateCcw size={16} />
            Retake
          </button>
        </div>
      </motion.div>
    </div>
  );
}
